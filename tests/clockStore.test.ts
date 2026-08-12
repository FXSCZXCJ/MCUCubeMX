import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useProjectStore } from '../src/stores/project'
import { defaultClock } from '../src/lib/clock'
import type { ProjectConfig } from '../src/types'

describe('时钟树 store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('setClock 合并更新参数', () => {
    const store = useProjectStore()
    const before = store.clock
    store.setClock({ source: 'HXTAL', hxtalMhz: 8 })
    expect(store.clock.source).toBe('HXTAL')
    expect(store.clock.hxtalMhz).toBe(8)
    expect(store.clock.ahb).toBe(before.ahb)
    store.setClock({ pll: { mul: 6 } })
    expect(store.clock.pll.mul).toBe(6)
    expect(store.clock.pllSource).toBe(before.pllSource)
  })

  it('切换器件后恢复新器件默认时钟', () => {
    const store = useProjectStore()
    store.setClock({ source: 'HXTAL', hxtalMhz: 12 })
    store.switchDevice('GD32F427VE')
    expect(store.clock).toEqual(defaultClock(store.deviceData.clockSpec))
    expect(store.clock.source).toBe('PLL')
    expect(store.clock.pll.psc).toBe(25)
  })

  it('loadConfig 恢复 clock，缺省时用器件默认', () => {
    const store = useProjectStore()
    const config: ProjectConfig = {
      version: 1,
      device: 'GD32L233RCT6',
      pins: [],
      naming: { prefix: 'MX_' },
      clock: {
        source: 'HXTAL',
        hxtalMhz: 16,
        pllSource: 'IRC16M',
        pll: { mul: 4 },
        ahb: 2,
        apb1: 1,
        apb2: 1,
        adc: 'IRC16M',
      },
    }
    store.loadConfig(config)
    expect(store.clock).toEqual(config.clock)
    store.loadConfig({ ...config, clock: undefined })
    expect(store.clock).toEqual(defaultClock(store.deviceData.clockSpec))
  })

  it('resetClock 恢复器件默认', () => {
    const store = useProjectStore()
    store.setClock({ apb1: 16 })
    store.resetClock()
    expect(store.clock).toEqual(defaultClock(store.deviceData.clockSpec))
  })

  it('setClockFocus 记录时钟树聚焦编辑区', () => {
    const store = useProjectStore()
    store.setClockFocus('apb1')
    expect(store.clockFocus).toBe('apb1')
    store.setClockFocus(null)
    expect(store.clockFocus).toBeNull()
  })

  it('setRtcSource / setUsbSource 与清除', () => {
    const store = useProjectStore()
    store.setRtcSource('IRC32K')
    store.setUsbSource('PLL')
    expect(store.clock.rtcSource).toBe('IRC32K')
    expect(store.clock.usbSource).toBe('PLL')
    store.setRtcSource(null)
    store.setUsbSource(null)
    expect(store.clock.rtcSource).toBeUndefined()
    expect(store.clock.usbSource).toBeUndefined()
  })

  it('loadConfig 恢复 rtcSource/usbSource', () => {
    const store = useProjectStore()
    const config: ProjectConfig = {
      version: 1,
      device: 'GD32L233RCT6',
      pins: [],
      naming: { prefix: 'MX_' },
      clock: {
        source: 'PLL',
        hxtalMhz: 8,
        pllSource: 'IRC16M',
        pll: { mul: 4 },
        ahb: 1,
        apb1: 2,
        apb2: 1,
        adc: 'APB2_DIV4',
        rtcSource: 'LXTAL',
        usbSource: 'IRC48M',
      },
    }
    store.loadConfig(config)
    expect(store.clock.rtcSource).toBe('LXTAL')
    expect(store.clock.usbSource).toBe('IRC48M')
  })
})
