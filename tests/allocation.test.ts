import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { devices } from '../src/data/device'
import { adcChannels, adcFunctionOf, extiIrqOf, extiLines } from '../src/lib/allocation'
import { useProjectStore } from '../src/stores/project'

const l233 = devices['GD32L233RCT6']
const f427 = devices['GD32F427VE']

describe('ADC 通道可分配引脚', () => {
  it('L233：通道 0 含 PA0，通道 15 含 PC5', () => {
    const channels = adcChannels(l233)
    const ch0 = channels.find((c) => c.channel === 0)!
    expect(ch0.pins.map((p) => p.name)).toContain('PA0')
    expect(channels.find((c) => c.channel === 15)!.pins.map((p) => p.name)).toContain('PC5')
  })

  it('F427：ADC012_IN0 → 通道 0，功能名取原始写法', () => {
    const channels = adcChannels(f427)
    const ch0 = channels.find((c) => c.channel === 0)!
    expect(ch0.pins.map((p) => p.name)).toContain('PA0')
    const pa0 = ch0.pins.find((p) => p.name === 'PA0')!
    expect(adcFunctionOf(pa0, 0)).toBe('ADC012_IN0')
  })
})

describe('EXTI 线可分配引脚', () => {
  it('L233：线 0 包含 PA0/PB0/PC0/PD0/PF0', () => {
    const lines = extiLines(l233)
    expect(lines).toHaveLength(16)
    const names = lines[0].pins.map((p) => p.name)
    expect(names).toEqual(expect.arrayContaining(['PA0', 'PB0', 'PC0', 'PD0', 'PF0']))
  })

  it('中断分组正确', () => {
    expect(extiIrqOf(0)).toBe('EXTI0')
    expect(extiIrqOf(5)).toBe('EXTI5_9')
    expect(extiIrqOf(13)).toBe('EXTI10_15')
  })
})

describe('store setPinAssignment', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('直接写入引脚完整配置并可覆盖', () => {
    const store = useProjectStore()
    store.setPinAssignment('PA0', {
      pin: 'PA0',
      mode: 'ANALOG',
      function: 'ADC_IN0',
      params: {},
    })
    expect(store.assignments.PA0.mode).toBe('ANALOG')
    store.setPinAssignment('PA0', {
      pin: 'PA0',
      mode: 'INPUT',
      params: { exti: { enabled: true, edge: 'FALLING' } },
    })
    expect(store.assignments.PA0.mode).toBe('INPUT')
    expect(store.assignments.PA0.params.exti?.enabled).toBe(true)
  })
})
