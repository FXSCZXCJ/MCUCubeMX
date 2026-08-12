import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { devices } from '../src/data/device'
import { derivePeripheralState, peripheralConfig } from '../src/lib/peripherals'
import { checkConflicts } from '../src/lib/conflicts'
import { useProjectStore } from '../src/stores/project'
import type { PinAssignment, ProjectConfig } from '../src/types'

const dd = devices['GD32L233RCT6']

function config(
  pins: PinAssignment[],
  peripherals?: ProjectConfig['peripherals'],
): ProjectConfig {
  return {
    version: 1,
    device: 'GD32L233RCT6',
    pins,
    groups: [],
    naming: { prefix: 'MX_' },
    peripherals,
  }
}

function af(pin: string, fn: string): PinAssignment {
  return { pin, mode: 'AF', function: fn, params: {} }
}

function analog(pin: string, fn: string): PinAssignment {
  return { pin, mode: 'ANALOG', function: fn, params: {} }
}

describe('外设实例推导', () => {
  it('USART0 TX/RX 从 AF 引脚归并', () => {
    const d = derivePeripheralState(config([af('PA9', 'USART0_TX'), af('PA10', 'USART0_RX')]), dd)
    const u = d.usart.find((x) => x.id === 'USART0')!
    expect(u.inUse).toBe(true)
    expect(u.txPin).toBe('PA9')
    expect(u.rxPin).toBe('PA10')
    expect(u.signals).toHaveLength(2)
  })

  it('ADC 通道从 ANALOG 引脚收集并排序', () => {
    const d = derivePeripheralState(
      config([analog('PA1', 'ADC_IN1'), analog('PA0', 'ADC_IN0')]),
      dd,
    )
    const a = d.adc.find((x) => x.id === 'ADC0')!
    expect(a.inUse).toBe(true)
    expect(a.channels).toEqual([
      { channel: 0, pin: 'PA0' },
      { channel: 1, pin: 'PA1' },
    ])
  })

  it('F427 ANALOG 功能 ADC012_INx 正确解析通道', () => {
    const f4 = devices['GD32F427VE']
    const d = derivePeripheralState(
      { version: 1, device: 'GD32F427VE', pins: [analog('PA0', 'ADC012_IN0')], groups: [], naming: { prefix: 'MX_' } },
      f4,
    )
    expect(d.adc[0].channels).toEqual([{ channel: 0, pin: 'PA0' }])
  })

  it('未分配信号的实例 inUse=false', () => {
    const d = derivePeripheralState(config([]), dd)
    expect(d.usart.every((u) => !u.inUse)).toBe(true)
    expect(d.adc.every((a) => !a.inUse)).toBe(true)
  })
})

describe('外设默认配置', () => {
  it('USART0 默认参数', () => {
    const cfg = peripheralConfig(dd, 'USART0', undefined)!
    expect(cfg.enabled).toBe(true)
    expect(cfg.params.baudrate).toBe(115200)
    expect(cfg.params.clockSource).toBe('APB2')
  })

  it('store 配置与默认值合并', () => {
    const cfg = peripheralConfig(dd, 'USART0', {
      USART0: { enabled: false, params: { baudrate: 9600 } },
    })!
    expect(cfg.enabled).toBe(false)
    expect(cfg.params.baudrate).toBe(9600)
    expect(cfg.params.wordLength).toBe('USART_WL_8BIT')
  })

  it('未知实例返回 null', () => {
    expect(peripheralConfig(dd, 'SPI0', undefined)).toBeNull()
  })
})

describe('外设冲突检查', () => {
  it('仅 TX 时提示 RX 缺失警告', () => {
    const c = checkConflicts(config([af('PA9', 'USART0_TX')]), dd)
    expect(c.some((x) => x.code === 'USART_RX_MISSING')).toBe(true)
    expect(c.some((x) => x.code === 'USART_TX_MISSING')).toBe(false)
  })

  it('非法时钟源报错', () => {
    const c = checkConflicts(
      config([af('PA9', 'USART0_TX'), af('PA10', 'USART0_RX')], {
        USART0: { enabled: true, params: { clockSource: 'APB1' } },
      }),
      dd,
    )
    expect(c.some((x) => x.code === 'PERIPHERAL_CLOCK_INVALID')).toBe(true)
  })

  it('TX+RX 齐全无配对警告', () => {
    const c = checkConflicts(config([af('PA9', 'USART0_TX'), af('PA10', 'USART0_RX')]), dd)
    expect(c.some((x) => x.code === 'USART_RX_MISSING')).toBe(false)
    expect(c.some((x) => x.code === 'USART_TX_MISSING')).toBe(false)
  })
})

describe('外设 store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('setPeripheral / loadConfig 往返', () => {
    const store = useProjectStore()
    store.setPeripheral('USART0', { params: { baudrate: 9600 } })
    store.setPeripheral('USART0', { enabled: false })
    expect(store.peripherals.USART0).toMatchObject({ enabled: false, params: { baudrate: 9600 } })
    const store2 = useProjectStore()
    store2.loadConfig(store.config)
    expect(store2.peripherals).toEqual(store.peripherals)
  })

  it('setPeripheral 忽略未知实例', () => {
    const store = useProjectStore()
    store.setPeripheral('SPI0', { enabled: true })
    expect(store.peripherals.SPI0).toBeUndefined()
  })

  it('switchDevice 清空外设配置', () => {
    const store = useProjectStore()
    store.setPeripheral('USART0', { enabled: true })
    store.switchDevice('GD32F427VE')
    expect(store.peripherals).toEqual({})
  })
})
