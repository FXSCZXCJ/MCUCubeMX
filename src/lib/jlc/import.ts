import type { DeviceData } from '../../data/device'
import type {
  EdaComponentInfo,
  EdaPinInfo,
  ExportChangeItem,
  ExportPlan,
  ImportDiffItem,
  ImportPlan,
  ImportPlanItem,
  ImportSkipItem,
} from './types'
import type { PinAssignment } from '../../types'

const POWER_PIN = /^(VDD|VSS|VBAT|VDDA|VSSA|VREFP|VREFN|VCAP|VIN|VOUT|AVDD|AVSS)/i
const NC_PIN = /^(NC|DNC|RESERVED)/i
const GPIO_STRIP = /^(P[ABCDEFGHJ]\d+)(?:-|_)(.+)$/
const BLOCKED_SPECIALS = ['nrst', 'boot', 'swd']

/** 按命名规律粗分类嘉立创符号引脚：IO / 电源 / 空脚 / 未知 */
export function classifyEdaPin(name: string): 'IO' | 'POWER' | 'NC' | 'UNKNOWN' {
  const up = name.trim().toUpperCase()
  if (POWER_PIN.test(up)) return 'POWER'
  if (NC_PIN.test(up)) return 'NC'
  if (/^P[ABCDEFGHJ]\d+$/.test(up)) return 'IO'
  return 'UNKNOWN'
}

/** 去掉 PA0-WKUP / PC13-TAMPER-RTC 这类后缀，返回基础 GPIO 名 */
export function stripEdaPinSuffix(name: string): string {
  const up = name.trim().toUpperCase()
  const m = GPIO_STRIP.exec(up)
  return m ? m[1] : up
}

/**
 * 把嘉立创符号引脚名归一化为器件库内的规范引脚名。
 * 优先精确匹配（含别名），失败后去掉 WKUP/TAMPER-RTC 等后缀再匹配。
 */
export function normalizeEdaPinName(device: DeviceData, edaName: string): string | null {
  const direct = device.lookup.findPin(edaName)
  if (direct) return direct.name.toUpperCase()
  const viaStrip = device.lookup.findPin(stripEdaPinSuffix(edaName))
  if (viaStrip) return viaStrip.name.toUpperCase()
  return null
}

/**
 * 根据嘉立创符号名识别对应器件 ID。
 * 兼容 "GD32L233RCT6_C3202813"、"GD32F427VET6" 这类带后缀/尾缀的名字。
 */
export function matchDeviceIdBySymbol(symbolName: string, deviceIds: string[]): string | null {
  const up = symbolName.toUpperCase()
  for (const id of deviceIds) {
    if (up.includes(id.toUpperCase())) return id
  }
  return null
}

/** 去掉器件库条目名的子部件后缀：GD32L233RCT6_1 → GD32L233RCT6 */
export function stripPartSuffix(name: string): string {
  return name.replace(/_\d+$/, '')
}

/**
 * 解析原理图器件的型号名。
 * 优先级：Name 属性（跳过 ={...} 模板）→ 器件库条目名 → LCSC 名称 → 符号名。
 * 符号名经常与器件名不一致（如符号 GD32L223RCT6 实际放置的是 GD32L233RCT6）。
 */
export function resolveModelName(c: Pick<
  EdaComponentInfo,
  'name' | 'symbolName' | 'componentName' | 'otherProperty'
>): string {
  const candidates = [
    c.name && !c.name.includes('{') ? c.name.trim() : '',
    stripPartSuffix(c.componentName ?? '').trim(),
    (c.otherProperty?.['LCSC Part Name'] ?? '').trim(),
    (c.otherProperty?.['Manufacturer Part'] ?? '').trim(),
    (c.otherProperty?.['Design Item ID'] ?? '').trim(),
    c.symbolName.trim(),
  ]
  return candidates.find((v) => v.length > 0) ?? ''
}

/**
 * 把从 EDA 读取的引脚→网络映射转换为导入计划。
 * 只保留：可匹配的 IO 引脚、非 nrst/boot/swd 特殊脚、已连线的引脚。
 */
export function buildImportPlan(device: DeviceData, pins: EdaPinInfo[]): ImportPlan {
  const matched: ImportPlanItem[] = []
  const skipped: ImportSkipItem[] = []
  const seen = new Set<string>()

  for (const p of pins) {
    const canonical = normalizeEdaPinName(device, p.name)
    const pinDef = canonical ? device.lookup.findPin(canonical) : undefined

    if (!canonical || !pinDef) {
      const cls = classifyEdaPin(p.name)
      skipped.push({
        edaName: p.name,
        canonical: null,
        net: p.net,
        reason: cls === 'POWER' || cls === 'NC' ? 'not-io' : 'unmatched',
      })
      continue
    }
    if (!device.lookup.isGpio(pinDef)) {
      skipped.push({ edaName: p.name, canonical, net: p.net, reason: 'not-io' })
      continue
    }
    if (pinDef.special && BLOCKED_SPECIALS.includes(pinDef.special)) {
      skipped.push({ edaName: p.name, canonical, net: p.net, reason: 'special' })
      continue
    }
    if (!p.net) {
      skipped.push({ edaName: p.name, canonical, net: null, reason: 'no-net' })
      continue
    }
    if (seen.has(canonical)) continue
    seen.add(canonical)
    matched.push({ canonical, edaName: p.name, net: p.net })
  }

  return { deviceId: device.id, matched, skipped }
}

/** 把 EDA 中鼠标选中的器件排到候选列表最前，返回排序后的列表与首选器件 */
export function prioritizeSelectedCandidates<T extends { primitiveId: string }>(
  candidates: T[],
  selectedIds: string[],
): { list: T[]; preferred: T | null } {
  const selectedSet = new Set(selectedIds)
  const list = [...candidates].sort(
    (a, b) => Number(selectedSet.has(b.primitiveId)) - Number(selectedSet.has(a.primitiveId)),
  )
  return { list, preferred: list.find((c) => selectedSet.has(c.primitiveId)) ?? null }
}

/**
 * 对比当前工程配置与待导入计划，生成变更清单：
 * 导入会整体替换引脚配置，因此当前有而计划里没有的引脚标记为“移除”。
 */
export function buildImportDiff(
  current: Record<string, PinAssignment>,
  plan: ImportPlan,
): ImportDiffItem[] {
  const items: ImportDiffItem[] = []
  for (const m of plan.matched) {
    const cur = current[m.canonical]
    if (!cur) {
      items.push({ pin: m.canonical, kind: 'add', newLabel: m.net, newMode: 'INPUT' })
      continue
    }
    const same = (cur.label ?? '') === m.net && cur.mode === 'INPUT'
    items.push(
      same
        ? { pin: m.canonical, kind: 'keep', oldLabel: cur.label, newLabel: m.net, oldMode: cur.mode, newMode: 'INPUT' }
        : {
            pin: m.canonical,
            kind: 'change',
            oldLabel: cur.label,
            newLabel: m.net,
            oldMode: cur.mode,
            newMode: 'INPUT',
          },
    )
  }
  const planned = new Set(plan.matched.map((m) => m.canonical))
  for (const key of Object.keys(current)) {
    if (!planned.has(key)) {
      items.push({ pin: key, kind: 'remove', oldLabel: current[key].label, oldMode: current[key].mode })
    }
  }
  return items
}

/**
 * 构建“导出到 EDA”计划：把工程里带标签的引脚同步为原理图网络名。
 * 只做网络重命名（同一网络的所有导线），不做建线/删线：
 * - EDA 引脚未连线 → 跳过（需先在原理图连线）
 * - 网络重命名出现交叉/链式（A→B 且 B→A）→ 跳过，需手动处理
 */
export function buildExportPlan(
  device: DeviceData,
  assignments: PinAssignment[],
  pinMap: EdaPinInfo[],
): ExportPlan {
  const byCanonical = new Map<string, EdaPinInfo>()
  for (const p of pinMap) {
    const canonical = normalizeEdaPinName(device, p.name)
    if (canonical && !byCanonical.has(canonical)) byCanonical.set(canonical, p)
  }

  const items: ExportChangeItem[] = []
  for (const assignment of assignments) {
    const pinDef = device.lookup.findPin(assignment.pin)
    if (!pinDef || !device.lookup.isGpio(pinDef)) {
      items.push({
        pin: assignment.pin,
        edaName: assignment.pin,
        oldNet: null,
        newNet: assignment.label ?? '',
        status: 'skip',
        skipReason: '非可配置 IO 引脚',
      })
      continue
    }
    if (pinDef.special && BLOCKED_SPECIALS.includes(pinDef.special)) {
      items.push({
        pin: assignment.pin,
        edaName: assignment.pin,
        oldNet: null,
        newNet: assignment.label ?? '',
        status: 'skip',
        skipReason: '特殊引脚（NRST/BOOT/SWD）',
      })
      continue
    }
    if (!assignment.label) {
      items.push({
        pin: assignment.pin,
        edaName: assignment.pin,
        oldNet: null,
        newNet: '',
        status: 'skip',
        skipReason: '未设置标签',
      })
      continue
    }
    const edaPin = byCanonical.get(assignment.pin.toUpperCase())
    if (!edaPin) {
      items.push({
        pin: assignment.pin,
        edaName: assignment.pin,
        oldNet: null,
        newNet: assignment.label,
        status: 'skip',
        skipReason: 'EDA 原理图中未找到该引脚',
      })
      continue
    }
    const oldNet = edaPin.net
    if (!oldNet) {
      items.push({
        pin: assignment.pin,
        edaName: edaPin.name,
        oldNet,
        newNet: assignment.label,
        status: 'skip',
        skipReason: 'EDA 中该引脚未连线，请先在原理图连线',
      })
      continue
    }
    if (oldNet === assignment.label) {
      items.push({
        pin: assignment.pin,
        edaName: edaPin.name,
        oldNet,
        newNet: assignment.label,
        status: 'keep',
      })
      continue
    }
    items.push({
      pin: assignment.pin,
      edaName: edaPin.name,
      oldNet,
      newNet: assignment.label,
      status: 'change',
    })
  }

  // 网络重命名交叉检测：A→B 且存在 B→C/…，或 A→B 且 B→A，逐条跳过
  const changeFrom = new Set(items.filter((i) => i.status === 'change').map((i) => i.oldNet!))
  for (const item of items) {
    if (item.status === 'change' && changeFrom.has(item.newNet)) {
      item.status = 'skip'
      item.skipReason = '网络重命名与其他改动交叉，需手动处理'
    }
  }

  return {
    deviceId: device.id,
    changes: items.filter((i) => i.status === 'change'),
    kept: items.filter((i) => i.status === 'keep'),
    skipped: items.filter((i) => i.status === 'skip'),
  }
}
