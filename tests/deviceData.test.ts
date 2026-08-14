import { describe, expect, it } from 'vitest'
import { deviceIds, devices } from '../src/data/device'

for (const id of deviceIds) {
  const dd = devices[id]
  describe(`器件数据 ${id} (${dd.device.package})`, () => {
    it('引脚数量 = 每边引脚数 × 4，且编号唯一连续', () => {
      const pins = dd.device.pins
      expect(pins).toHaveLength(dd.device.pinsPerSide * 4)
      const numbers = pins.map((p) => p.number)
      expect(new Set(numbers).size).toBe(numbers.length)
      for (let n = 1; n <= numbers.length; n++) expect(numbers).toContain(n)
    })

    it('每边引脚数一致', () => {
      for (const side of ['top', 'right', 'bottom', 'left']) {
        expect(dd.device.pins.filter((p) => p.side === side)).toHaveLength(dd.device.pinsPerSide)
      }
    })

    it('AF 表无重复且与引脚定义的 alternate 集合一致', () => {
      const seen = new Set<string>()
      const byPin = new Map<string, Set<string>>()
      for (const e of dd.afEntries) {
        expect(e.af).toBeGreaterThanOrEqual(0)
        expect(e.af).toBeLessThanOrEqual(15)
        const key = `${e.pin}|${e.af}|${e.signal}`
        expect(seen.has(key)).toBe(false)
        seen.add(key)
        const set = byPin.get(e.pin) ?? new Set<string>()
        set.add(e.signal)
        byPin.set(e.pin, set)
      }
      for (const pin of dd.device.pins) {
        if (pin.type !== 'IO') continue
        const alt = new Set(pin.alternate ?? [])
        const af = byPin.get(pin.name) ?? new Set<string>()
        expect([...alt].sort()).toEqual([...af].sort())
      }
    })

    it('EXTI 线号等于引脚号且分组正确', () => {
      for (const e of dd.extiEntries) {
        expect(e.line).toBe(Number.parseInt(e.pin.slice(2), 10))
        const expectIrq = e.line <= 4 ? `EXTI${e.line}` : e.line <= 9 ? 'EXTI5_9' : 'EXTI10_15'
        expect(e.irq).toBe(expectIrq)
        const pin = dd.device.pins.find((p) => p.name === e.pin)
        expect(pin?.type).toBe('IO')
      }
    })

    it('固件档案完整（header/speeds/define）', () => {
      const fw = dd.device.firmware
      expect(fw.header).toMatch(/^gd32.*\.h$/)
      expect(fw.speeds.length).toBeGreaterThan(0)
      expect(fw.define).toBeTruthy()
      expect(fw.extiEdgePrefix).toMatch(/^EXTI_/)
    })

    it('中断向量表完整且编号唯一', () => {
      const irqs = dd.interrupts
      expect(irqs.length).toBeGreaterThan(0)
      const names = new Set(irqs.map((i) => i.name))
      const numbers = new Set(irqs.map((i) => i.number))
      expect(names.size).toBe(irqs.length)
      expect(numbers.size).toBe(irqs.length)
      expect(irqs.every((i) => Number.isInteger(i.number))).toBe(true)
    })

    it('ADC 内部通道数据非空且通道唯一', () => {
      const internal = dd.peripheralSpec.adcInternal ?? []
      expect(internal.length).toBeGreaterThan(0)
      expect(new Set(internal.map((c) => c.channel)).size).toBe(internal.length)
      expect(internal.every((c) => c.label.length > 0)).toBe(true)
    })
  })
}
