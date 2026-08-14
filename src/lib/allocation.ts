import type { DeviceData } from '../data/device'
import type { PinDef } from '../types'

const ADC_TOKEN_RE = /(?:ADC\d*_)?IN(\d+)$/i

/** 从引脚 additional 提取 ADC 通道号（如 ADC_IN0 → 0，ADC012_IN10 → 10） */
export function adcChannelOf(token: string): number | null {
  const m = token.match(ADC_TOKEN_RE)
  return m ? Number(m[1]) : null
}

/** 引脚对指定 ADC 通道的功能名（取数据中的原始写法，如 ADC_IN0 / ADC012_IN10） */
export function adcFunctionOf(pin: PinDef, channel: number): string | undefined {
  return pin.additional?.find((t) => adcChannelOf(t) === channel)
}

/** 全部 ADC 通道及其可分配引脚（按通道号排序） */
export function adcChannels(deviceData: DeviceData): { channel: number; pins: PinDef[] }[] {
  const byChannel = new Map<number, PinDef[]>()
  for (const pin of deviceData.device.pins) {
    if (pin.type !== 'IO') continue
    for (const token of pin.additional ?? []) {
      const ch = adcChannelOf(token)
      if (ch === null) continue
      const list = byChannel.get(ch) ?? []
      list.push(pin)
      byChannel.set(ch, list)
    }
  }
  return [...byChannel.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([channel, pins]) => ({ channel, pins }))
}

/** EXTI 线 0~15 及其可分配引脚（IO 引脚且编号 ≤ 15） */
export function extiLines(deviceData: DeviceData): { line: number; pins: PinDef[] }[] {
  const byLine = new Map<number, PinDef[]>()
  for (const pin of deviceData.device.pins) {
    if (pin.type !== 'IO') continue
    const m = pin.name.match(/^([A-Z]+)(\d+)$/)
    if (!m) continue
    const line = Number(m[2])
    if (line > 15) continue
    const list = byLine.get(line) ?? []
    list.push(pin)
    byLine.set(line, list)
  }
  return [...byLine.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([line, pins]) => ({ line, pins }))
}

export function extiIrqOf(line: number): string {
  return line <= 4 ? `EXTI${line}` : line <= 9 ? 'EXTI5_9' : 'EXTI10_15'
}
