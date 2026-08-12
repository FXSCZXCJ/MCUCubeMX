import { describe, expect, it } from 'vitest'
import { deriveUsage, shortSignal } from '../src/lib/usage'
import { devices } from '../src/data/device'
import type { ProjectConfig } from '../src/types'

const dd = devices['GD32L233RCT6']

function config(pins: ProjectConfig['pins']): ProjectConfig {
  return { version: 1, device: 'GD32L233RCT6', pins, groups: [], naming: { prefix: 'MX_' } }
}

describe('外设信号短名', () => {
  it('IO 信号取后缀，其余保持全名', () => {
    expect(shortSignal('USART1_TX')).toBe('TX')
    expect(shortSignal('SPI0_SCK')).toBe('SCK')
    expect(shortSignal('TIMER1_CH2')).toBe('TIMER1_CH2')
    expect(shortSignal('ADC_IN0')).toBe('ADC_IN0')
  })
})

describe('外设使用情况推导', () => {
  it('AF 信号按外设归并（USART1 TX/RX 同组）', () => {
    const usage = deriveUsage(
      config([
        { pin: 'PA2', mode: 'AF', function: 'USART1_TX', label: 'A', params: {} },
        { pin: 'PA3', mode: 'AF', function: 'USART1_RX', label: 'B', params: {} },
        { pin: 'PA0', mode: 'AF', function: 'TIMER1_CH0_ETI', params: {} },
      ]),
      dd,
    )
    const usart1 = usage.peripherals.find((p) => p.name === 'USART1')
    expect(usart1?.items).toEqual(
      expect.arrayContaining([
        { signal: 'USART1_TX', display: 'TX', pin: 'PA2' },
        { signal: 'USART1_RX', display: 'RX', pin: 'PA3' },
      ]),
    )
    const timer1 = usage.peripherals.find((p) => p.name === 'TIMER1')
    expect(timer1?.items[0]).toMatchObject({ signal: 'TIMER1_CH0_ETI', pin: 'PA0' })
  })

  it('模拟信号归入 ADC，EXTI 与 GPIO 独立成段', () => {
    const usage = deriveUsage(
      config([
        { pin: 'PA0', mode: 'ANALOG', function: 'ADC_IN0', params: {} },
        { pin: 'PA1', mode: 'INPUT', params: { exti: { enabled: true, edge: 'FALLING' } } },
        { pin: 'PA5', mode: 'OUTPUT', label: 'LED_R', params: {} },
      ]),
      dd,
    )
    const adc = usage.peripherals.find((p) => p.name === 'ADC')
    expect(adc?.items).toEqual([{ signal: 'ADC_IN0', display: 'ADC_IN0', pin: 'PA0' }])
    expect(usage.exti).toEqual([{ line: 1, pin: 'PA1', edge: 'FALLING' }])
    expect(usage.gpio).toContainEqual({ pin: 'PA5', label: 'LED_R', mode: 'OUTPUT' })
  })

  it('EVENTOUT 不计入外设', () => {
    const usage = deriveUsage(
      config([{ pin: 'PA4', mode: 'AF', function: 'EVENTOUT', params: {} }]),
      dd,
    )
    expect(usage.peripherals).toHaveLength(0)
  })
})
