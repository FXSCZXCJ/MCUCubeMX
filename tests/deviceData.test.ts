import { describe, expect, it } from 'vitest'
import { device, afEntries, extiEntries } from '../src/data/device'

describe('器件数据 GD32L233RCT6 LQFP64', () => {
  it('包含 64 个引脚且编号 1..64 唯一', () => {
    expect(device.pins).toHaveLength(64)
    const numbers = device.pins.map((p) => p.number)
    expect(new Set(numbers).size).toBe(64)
    for (let n = 1; n <= 64; n++) expect(numbers).toContain(n)
  })

  it('每边 16 个引脚', () => {
    for (const side of ['top', 'right', 'bottom', 'left']) {
      expect(device.pins.filter((p) => p.side === side)).toHaveLength(16)
    }
  })

  it('AF 表无重复且与引脚定义的 alternate 集合一致', () => {
    const seen = new Set<string>()
    const byPin = new Map<string, Set<string>>()
    for (const e of afEntries) {
      expect(e.af).toBeGreaterThanOrEqual(0)
      expect(e.af).toBeLessThanOrEqual(15)
      const key = `${e.pin}|${e.af}|${e.signal}`
      expect(seen.has(key)).toBe(false)
      seen.add(key)
      const set = byPin.get(e.pin) ?? new Set<string>()
      set.add(e.signal)
      byPin.set(e.pin, set)
    }
    for (const pin of device.pins) {
      const alt = new Set(pin.alternate ?? [])
      const af = byPin.get(pin.name) ?? new Set<string>()
      expect([...alt].sort()).toEqual([...af].sort())
    }
  })

  it('EXTI 线号等于引脚号且分组正确', () => {
    for (const e of extiEntries) {
      expect(e.line).toBe(Number.parseInt(e.pin.slice(2), 10))
      const expectIrq = e.line <= 4 ? `EXTI${e.line}` : e.line <= 9 ? 'EXTI5_9' : 'EXTI10_15'
      expect(e.irq).toBe(expectIrq)
      const pin = device.pins.find((p) => p.name === e.pin)
      expect(pin?.type).toBe('IO')
    }
  })
})
