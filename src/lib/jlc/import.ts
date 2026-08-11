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
import type { PinAssignment, PinMode } from '../../types'

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

/** 在候选列表里找回上次记住的 MCU（按位号） */
export function pickRememberedMcu<T extends { designator: string }>(
  candidates: T[],
  designator?: string,
): T | null {
  if (!designator) return null
  return candidates.find((c) => c.designator === designator) ?? null
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
 * 按引脚现有连接方式选择同步动作：
 * - 已连接网络端口 → 更新该端口（改 Global Net Name / 名称）
 * - 线段连接 → 改线段网络（导线 NET 属性）
 * - 未连接 → 新增网络端口（输入端 IN、输出端 OUT）
 * - 特殊引脚、无标签、EDA 中找不到的引脚跳过
 */
export function buildExportPlan(
  device: DeviceData,
  assignments: PinAssignment[],
  pinMap: EdaPinInfo[],
  mode: 'port' | 'wire' | 'convert' | 'towire' = 'port',
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
    const conn = edaPin.conn ?? (oldNet ? 'wire' : 'none')

    if (conn === 'port') {
      if (mode === 'towire') {
        // 转化为线段：端口一律删除并放线段（网络名=标签）
        items.push({
          pin: assignment.pin,
          edaName: edaPin.name,
          oldNet: edaPin.portNet ?? null,
          newNet: assignment.label,
          status: 'change',
          action: 'port-to-wire',
          portId: edaPin.portId,
          mode: assignment.mode,
          x: edaPin.x,
          y: edaPin.y,
          rotation: edaPin.rotation ?? 0,
        })
        continue
      }
      const requiredDir = assignment.mode === 'OUTPUT' ? 'OUT' : 'IN'
      const isNetPort = !!edaPin.portDir
      const sameNet = edaPin.portNet === assignment.label
      const sameDir = edaPin.portDir === requiredDir
      if (sameNet && (!isNetPort || sameDir)) {
        items.push({
          pin: assignment.pin,
          edaName: edaPin.name,
          oldNet: edaPin.portNet ?? null,
          newNet: assignment.label,
          status: 'keep',
        })
        continue
      }
      if (isNetPort) {
        // NetPort 修改被 API 禁止（仅元件可 modify），改名/方向调整统一删除重放
        items.push({
          pin: assignment.pin,
          edaName: edaPin.name,
          oldNet: edaPin.portNet ?? null,
          newNet: assignment.label,
          status: 'change',
          action: 'replace-port',
          portId: edaPin.portId,
          mode: assignment.mode,
          x: edaPin.x,
          y: edaPin.y,
          rotation: portRotation(edaPin.rotation, assignment.mode),
        })
        continue
      }
      items.push({
        pin: assignment.pin,
        edaName: edaPin.name,
        oldNet: edaPin.portNet ?? null,
        newNet: assignment.label,
        status: 'change',
        action: 'update-port',
        portId: edaPin.portId,
        mode: assignment.mode,
      })
      continue
    }

    // 转化模式下不因网络名相同而跳过：连接方式不是目标类型就要转换
    if (oldNet === assignment.label && mode !== 'convert') {
      items.push({
        pin: assignment.pin,
        edaName: edaPin.name,
        oldNet,
        newNet: assignment.label,
        status: 'keep',
      })
      continue
    }
    if (conn === 'none') {
      // 线段模式：未连线没有线段可改，跳过；端口/转化端口：放端口；转化为线段：放线段
      if (mode === 'wire') {
        items.push({
          pin: assignment.pin,
          edaName: edaPin.name,
          oldNet: null,
          newNet: assignment.label,
          status: 'skip',
          skipReason: 'EDA 中该引脚未连线，请先在原理图连线',
        })
        continue
      }
      items.push({
        pin: assignment.pin,
        edaName: edaPin.name,
        oldNet: null,
        newNet: assignment.label,
        status: 'change',
        action: mode === 'towire' ? 'add-wire' : 'place-port',
        mode: assignment.mode,
        x: edaPin.x,
        y: edaPin.y,
        rotation: mode === 'towire' ? (edaPin.rotation ?? 0) : portRotation(edaPin.rotation, assignment.mode),
      })
      continue
    }

    // conn === 'wire'
    if (mode === 'port') {
      // 端口模式不删除已有线段，跳过（如需转换请选“转化为网络端口”）
      items.push({
        pin: assignment.pin,
        edaName: edaPin.name,
        oldNet,
        newNet: assignment.label,
        status: 'skip',
        skipReason: '已有线段连接，如需转为网络端口请选择“转化为网络端口”模式',
      })
      continue
    }
    // conn === 'wire'
    const action = mode === 'convert' ? 'wire-to-port' : 'rename-wire'
    items.push({
      pin: assignment.pin,
      edaName: edaPin.name,
      oldNet,
      newNet: assignment.label,
      status: 'change',
      action,
      mode: assignment.mode,
      x: edaPin.x,
      y: edaPin.y,
      rotation: portRotation(edaPin.rotation, assignment.mode),
    })
  }

  return {
    deviceId: device.id,
    changes: items.filter((i) => i.status === 'change'),
    kept: items.filter((i) => i.status === 'keep'),
    skipped: items.filter((i) => i.status === 'skip'),
  }
}

/**
 * 把单个引脚的配置转成 EDA 属性（写入 MCU 元件的 otherProperty）：
 * PA0_MODE / PA0_LABEL / PA0_OTYPE / PA0_SPEED / PA0_LEVEL / PA0_PULL / PA0_EXTI
 */
export function buildPinAttributes(pin: PinAssignment): Record<string, string> {
  const attrs: Record<string, string> = {}
  const base = pin.pin.trim().toUpperCase()
  attrs[`${base}_MODE`] = pin.mode
  if (pin.label) attrs[`${base}_LABEL`] = pin.label
  if (pin.mode === 'OUTPUT') {
    if (pin.params.outputType) attrs[`${base}_OTYPE`] = pin.params.outputType
    if (pin.params.speed) attrs[`${base}_SPEED`] = pin.params.speed
    if (pin.params.level) attrs[`${base}_LEVEL`] = pin.params.level
  }
  if (pin.params.pull && pin.params.pull !== 'NONE') attrs[`${base}_PULL`] = pin.params.pull
  if (pin.params.exti?.enabled) attrs[`${base}_EXTI`] = pin.params.exti.edge
  return attrs
}

/**
 * NetPort-OUT 符号内部自带 180° 翻转（实测 OUT@0°→引脚 180°、IN@0°→引脚 0°），
 * 放置 OUT 端口时需要补 180° 才能与 MCU 引脚同向（标签朝外）。
 */
export function portRotation(
  pinRotation: number | undefined,
  mode: PinMode | undefined,
): number {
  const base = (pinRotation ?? 0) % 360
  return (base + (mode === 'OUTPUT' ? 180 : 0)) % 360
}
