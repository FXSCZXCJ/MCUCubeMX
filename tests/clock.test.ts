import { describe, expect, it } from 'vitest'
import { getDeviceData } from '../src/data/device'
import {
  computeClock,
  defaultClock,
  mergeClockConfig,
  solvePll,
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

describe('时钟总线外设挂载数据', () => {
  for (const id of ['GD32L233RCT6', 'GD32F427VE']) {
    const spec = getDeviceData(id).clockSpec
    it(`${id}：各总线外设清单非空且无重复`, () => {
      for (const bus of ['ahb', 'apb1', 'apb2', 'adc'] as const) {
        const list = spec.peripherals?.[bus] ?? []
        expect(list.length).toBeGreaterThan(0)
        expect(new Set(list).size).toBe(list.length)
        expect(list.every((name) => typeof name === 'string' && name.length > 0)).toBe(true)
      }
    })
  }
})

describe('可选时钟源外设数据', () => {
  it('L233：USART/I2C/LPTIMER/ADC/USBD/RTC 等外设可切换时钟源', () => {
    const spec = getDeviceData('GD32L233RCT6').clockSpec
    const select = spec.clockSelect ?? {}
    expect(select['USART0']).toEqual(['APB2', 'SYSCLK', 'LXTAL', 'IRC16MDIV'])
    expect(select['USART1']).toContain('APB1')
    expect(select['I2C0']).toContain('SYSCLK')
    expect(select['LPTIMER']).toContain('LXTAL')
    expect(select['ADC']).toEqual(['APB2', 'AHB', 'IRC16M'])
    expect(select['RTC']).toContain('LXTAL')
    expect(select['FWDGT']).toEqual(['IRC32K'])
    for (const options of Object.values(select)) {
      expect(options.length).toBeGreaterThan(0)
      expect(new Set(options).size).toBe(options.length)
    }
  })

  it('F427：ADC/48M 域/I2S/RTC 外设可切换时钟源', () => {
    const spec = getDeviceData('GD32F427VE').clockSpec
    const select = spec.clockSelect ?? {}
    expect(select['ADC0']).toEqual(['APB2', 'AHB'])
    expect(select['USBHS']).toEqual(['IRC48M', 'PLL48M'])
    expect(select['I2S0']).toEqual(['PLLI2S', 'I2S_CKIN'])
    expect(select['RTC']).toEqual(['LXTAL', 'IRC32K', 'HXTAL128'])
    expect(Object.keys(select).length).toBeGreaterThanOrEqual(10)
  })
})

describe('TIMER 时钟域（APB 分频 >1 时 ×2）', () => {
  it('APB1 分频=2 时 TIMER = APB1×2', () => {
    const c = cfg({ source: 'PLL', pllSource: 'IRC16M', pll: { mul: 4 }, apb1: 2, apb2: 1 })
    const chain = computeClock(l233, c)
    expect(chain.apb1Mhz).toBe(32)
    expect(chain.apb1TimerMhz).toBe(64)
    expect(chain.apb2TimerMhz).toBe(64) // apb2=1 → ×1
    expect(chain.systickMhz).toBe(8)
  })

  it('APB 分频=1 时 TIMER = AHB', () => {
    const c = cfg({ source: 'IRC16M', apb1: 1, apb2: 1 })
    const chain = computeClock(l233, c)
    expect(chain.apb1TimerMhz).toBe(16)
    expect(chain.apb2TimerMhz).toBe(16)
  })
})

describe('RTC 与 USB 48MHz 时钟域', () => {
  it('RTC 各源频率（LXTAL/IRC32K/HXTAL32）', () => {
    expect(computeClock(l233, cfg({ rtcSource: 'LXTAL' })).rtcMhz).toBeCloseTo(0.032768)
    expect(computeClock(l233, cfg({ rtcSource: 'IRC32K' })).rtcMhz).toBeCloseTo(0.032)
    expect(computeClock(l233, cfg({ rtcSource: 'HXTAL32', hxtalMhz: 8 })).rtcMhz).toBeCloseTo(0.25)
    expect(computeClock(l233, cfg({})).rtcMhz).toBe(0)
  })

  it('L233：PLL 输出 48MHz 时 USB 校验通过，64MHz 时报错', () => {
    const ok = validateClock(
      l233,
      cfg({ source: 'PLL', pllSource: 'HXTAL', hxtalMhz: 12, pll: { mul: 4 }, usbSource: 'PLL' }),
    )
    expect(ok.chain.ck48mMhz).toBeCloseTo(48)
    expect(ok.errors.some((e) => e.code === 'USB48_INVALID')).toBe(false)
    const bad = validateClock(
      l233,
      cfg({ source: 'PLL', pllSource: 'IRC16M', pll: { mul: 4 }, usbSource: 'PLL' }),
    )
    expect(bad.chain.ck48mMhz).toBe(64)
    expect(bad.errors.some((e) => e.code === 'USB48_INVALID')).toBe(true)
  })

  it('F427：PLL48M 需要 VCO/Q=48', () => {
    const ok = validateClock(
      f427,
      cfg(
        {
          source: 'PLL',
          pllSource: 'HXTAL',
          hxtalMhz: 25,
          pll: { psc: 25, n: 384, p: 2, q: 8 },
          usbSource: 'PLL48M',
        },
        defaultClock(f427),
      ),
    )
    expect(ok.chain.ck48mMhz).toBeCloseTo(48)
    expect(ok.errors.some((e) => e.code === 'USB48_INVALID')).toBe(false)
    const bad = validateClock(
      f427,
      cfg(
        {
          source: 'PLL',
          pllSource: 'HXTAL',
          hxtalMhz: 25,
          pll: { psc: 25, n: 400, p: 2, q: 9 },
          usbSource: 'PLL48M',
        },
        defaultClock(f427),
      ),
    )
    expect(bad.chain.ck48mMhz).toBeCloseTo(400 / 9)
    expect(bad.errors.some((e) => e.code === 'USB48_INVALID')).toBe(true)
  })

  it('非法 RTC/USB 源报错', () => {
    const v = validateClock(l233, cfg({ rtcSource: 'XXX', usbSource: 'YYY' }))
    expect(v.errors.some((e) => e.code === 'RTC_SOURCE_INVALID')).toBe(true)
    expect(v.errors.some((e) => e.code === 'USB_SOURCE_INVALID')).toBe(true)
  })
})

describe('PLL 自动解算', () => {
  it('L233：目标 64MHz（IRC16M）→ mul=4', () => {
    const r = solvePll(l233, 64, 'IRC16M')
    expect(r.error).toBeUndefined()
    expect(r.solutions).toEqual([
      { pllSource: 'IRC16M', params: { mul: 4 }, pllInMhz: 16, vcoMhz: null, pllOutMhz: 64 },
    ])
  })

  it('F427：目标 200MHz（HXTAL25）→ psc=25/n=400/p=2', () => {
    const r = solvePll(f427, 200, 'HXTAL')
    expect(r.error).toBeUndefined()
    expect(r.solutions.some((s) => s.params.psc === 25 && s.params.n === 400 && s.params.p === 2)).toBe(true)
  })

  it('无解/越界给出原因', () => {
    const nonInt = solvePll(l233, 65, 'IRC16M')
    expect(nonInt.solutions).toHaveLength(0)
    expect(nonInt.error).toBeTruthy()
    const over = solvePll(l233, 128, 'IRC16M')
    expect(over.error).toContain('上限')
    const f4Over = solvePll(f427, 201, 'HXTAL')
    expect(f4Over.error).toBeTruthy()
  })
})
