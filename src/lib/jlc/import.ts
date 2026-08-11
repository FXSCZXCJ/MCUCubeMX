import type { DeviceData } from '../../data/device'
import type { EdaPinInfo, ImportPlan, ImportPlanItem, ImportSkipItem } from './types'

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
