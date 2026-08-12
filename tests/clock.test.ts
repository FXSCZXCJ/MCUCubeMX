import { describe, expect, it } from 'vitest'
import { getDeviceData } from '../src/data/device'
import {
  computeClock,
  defaultClock,
  mergeClockConfig,
  validateClock,
} from '../src/lib/clock'
import type { ClockConfig } from '../src/types'

const l233 = getDeviceData('GD32L233RCT6').clockSpec
const f427 = getDeviceData('GD32F427VE').clockSpec

function cfg(partial: Partial<ClockConfig>, base?: ClockConfig): ClockConfig {
  return { ...(base ?? defaultClock(l233)), ...partial, pll: { ...(base?.pll ?? defaultClock(l233).pll), ...(partial.pll ?? {}) } }
}

describe('默认时钟配置', () => {
  it('L233 默认：IRC16M ×4 = 64MHz，全链合法', () => {
    const c = defaultClock(l233)
    expect(c.source).toBe('PLL')
    expect(c.pllSource).toBe('IRC16M')
    const v = validateClock(l233, c)
    expect(v.ok).toBe(true)
    expect(v.chain.sysclkMhz).toBe(64)
    expect(v.chain.apb1Mhz).toBe(32)
    expect(v.chain.apb2Mhz).toBe(64)
    expect(v.chain.adcMhz).toBe(16)
  })

  it('F427 默认：HXTAL25 → PLL 200MHz，全链合法', () => {
    const c = defaultClock(f427)
    expect(c.source).toBe('PLL')
    expect(c.pllSource).toBe('HXTAL')
    const v = validateClock(f427, c)
    expect(v.ok).toBe(true)
    expect(v.chain.sysclkMhz).toBe(200)
    expect(v.chain.ahbMhz).toBe(200)
    expect(v.chain.apb1Mhz).toBe(50)
    expect(v.chain.apb2Mhz).toBe(100)
    expect(v.chain.adcMhz).toBe(25)
    expect(v.chain.vcoMhz).toBe(400)
  })
})

describe('L233 计算与校验', () => {
  it('IRC16M 直连', () => {
    const c = cfg({ source: 'IRC16M', ahb: 2, apb1: 1, apb2: 2, adc: 'AHB_DIV3' })
    const chain = computeClock(l233, c)
    expect(chain.sysclkMhz).toBe(16)
    expect(chain.ahbMhz).toBe(8)
    expect(chain.apb1Mhz).toBe(8)
    expect(chain.apb2Mhz).toBe(4)
    expect(chain.adcMhz).toBe(8 / 3)
    expect(validateClock(l233, c).ok).toBe(true)
  })

  it('PLL 关闭路径：source≠PLL 时忽略 PLL 参数', () => {
    const c = cfg({ source: 'HXTAL', hxtalMhz: 25, pll: { mul: 127 } })
    const v = validateClock(l233, c)
    expect(v.chain.pllOutMhz).toBeNull()
    expect(v.errors.some((e) => e.code === 'PLL_PARAM_RANGE')).toBe(false)
    expect(v.chain.sysclkMhz).toBe(25)
  })

  it('HXTAL 越界报错', () => {
    const v = validateClock(l233, cfg({ source: 'HXTAL', hxtalMhz: 33 }))
    expect(v.errors.some((e) => e.code === 'HXTAL_RANGE')).toBe(true)
  })

  it('PLL 输出超 64MHz 报错', () => {
    const v = validateClock(l233, cfg({ source: 'PLL', pllSource: 'IRC16M', pll: { mul: 8 } }))
    expect(v.chain.sysclkMhz).toBe(128)
    expect(v.errors.some((e) => e.code === 'PLL_OUT_RANGE')).toBe(true)
  })

  it('APB1 超过 32MHz 报错', () => {
    const v = validateClock(l233, cfg({ source: 'PLL', pllSource: 'IRC16M', pll: { mul: 4 }, apb1: 1 }))
    expect(v.chain.apb1Mhz).toBe(64)
    expect(v.errors.some((e) => e.code === 'BUS_OVER' && e.node === 'apb1')).toBe(true)
  })

  it('非法分频档位报错', () => {
    const v = validateClock(l233, cfg({ ahb: 3 }))
    expect(v.errors.some((e) => e.code === 'BUS_DIV_INVALID')).toBe(true)
  })
})

describe('F427 计算与校验', () => {
  it('HXTAL25 + PLL 200MHz 正常', () => {
    const c = cfg(
      { source: 'PLL', pllSource: 'HXTAL', hxtalMhz: 25, pll: { psc: 25, n: 400, p: 2, q: 9 }, apb1: 4, apb2: 2 },
      defaultClock(f427),
    )
    const v = validateClock(f427, c)
    expect(v.ok).toBe(true)
    expect(v.chain.sysclkMhz).toBe(200)
    expect(v.chain.ahbMhz).toBe(200)
    expect(v.chain.apb1Mhz).toBe(50)
    expect(v.chain.apb2Mhz).toBe(100)
    expect(v.chain.adcMhz).toBe(25)
  })

  it('IRC16M + PLL 128MHz：PLL 输入低于 1MHz 报错', () => {
    const c = cfg(
      { source: 'PLL', pllSource: 'IRC16M', pll: { psc: 25, n: 400, p: 2, q: 9 } },
      defaultClock(f427),
    )
    const v = validateClock(f427, c)
    expect(v.chain.sysclkMhz).toBe(128)
    expect(v.errors.some((e) => e.code === 'PLL_IN_RANGE')).toBe(true)
  })

  it('VCO 越界报错', () => {
    const c = cfg(
      { source: 'PLL', pllSource: 'HXTAL', hxtalMhz: 25, pll: { psc: 25, n: 64, p: 2, q: 9 } },
      defaultClock(f427),
    )
    const v = validateClock(f427, c)
    expect(v.chain.vcoMhz).toBe(64)
    expect(v.errors.some((e) => e.code === 'PLL_VCO_RANGE')).toBe(true)
  })

  it('APB1/APB2 超上限报错', () => {
    const c = cfg(
      { source: 'PLL', pllSource: 'HXTAL', hxtalMhz: 25, pll: { psc: 25, n: 400, p: 2, q: 9 }, apb1: 1, apb2: 1 },
      defaultClock(f427),
    )
    const v = validateClock(f427, c)
    expect(v.errors.some((e) => e.code === 'BUS_OVER' && e.node === 'apb1')).toBe(true)
    expect(v.errors.some((e) => e.code === 'BUS_OVER' && e.node === 'apb2')).toBe(true)
  })

  it('SYSCLK 超过 200MHz 报错', () => {
    const c = cfg(
      { source: 'PLL', pllSource: 'HXTAL', hxtalMhz: 25, pll: { psc: 5, n: 300, p: 2, q: 9 } },
      defaultClock(f427),
    )
    const v = validateClock(f427, c)
    expect(v.chain.sysclkMhz).toBe(750)
    expect(v.errors.some((e) => e.code === 'SYSCLK_OVER')).toBe(true)
  })
})

describe('mergeClockConfig', () => {
  it('部分配置合并到默认值', () => {
    const merged = mergeClockConfig(l233, { apb1: 4, pll: { mul: 6 } })
    expect(merged.source).toBe('PLL')
    expect(merged.pll.mul).toBe(6)
    expect(merged.apb1).toBe(4)
    expect(merged.ahb).toBe(1)
  })

  it('空配置返回完整默认值', () => {
    expect(mergeClockConfig(l233, undefined)).toEqual(defaultClock(l233))
  })
})
