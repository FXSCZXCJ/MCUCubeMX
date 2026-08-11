import { describe, expect, it } from 'vitest'
import { devices } from '../src/data/device'
import { outsideLabelDy, packageGeometry, pinGeometry } from '../src/lib/packageSvg'
import type { PinDef } from '../src/types'

const pin = (number: number, side: PinDef['side']): PinDef => ({
  number,
  name: `P${number}`,
  type: 'IO',
  side,
})

describe('封装图外侧标签交错', () => {
  it('上侧奇偶交错（奇数向上错开 10）', () => {
    expect(outsideLabelDy(pin(1, 'top'), 16)).toBe(0)
    expect(outsideLabelDy(pin(2, 'top'), 16)).toBe(-10)
  })

  it('下侧奇偶交错（奇数向下错开 10）', () => {
    expect(outsideLabelDy(pin(33, 'bottom'), 16)).toBe(0)
    expect(outsideLabelDy(pin(34, 'bottom'), 16)).toBe(10)
  })

  it('左右侧不交错', () => {
    expect(outsideLabelDy(pin(17, 'right'), 16)).toBe(0)
    expect(outsideLabelDy(pin(49, 'left'), 16)).toBe(0)
  })
})

describe('四角内侧 GPIO 名偏移', () => {
  const gd = devices['GD32L233RCT6'].device
  const geo = packageGeometry(gd)
  const pinN = (n: number) => gd.pins.find((p) => p.number === n)!
  const last = geo.pinsPerSide - 1
  const base = (i: number) => geo.margin + ((i + 0.5) * geo.body) / geo.pinsPerSide

  it('上侧角引脚向内水平偏移（1 右移 16、16 左移 16）', () => {
    expect(pinGeometry(pinN(1), geo).innerX).toBeCloseTo(base(0) + 16, 1)
    expect(pinGeometry(pinN(16), geo).innerX).toBeCloseTo(base(last) - 16, 1)
    expect(pinGeometry(pinN(2), geo).innerX).toBeCloseTo(base(1), 1)
  })

  it('右侧角引脚向内垂直偏移（17 下移 16、32 上移 16）', () => {
    expect(pinGeometry(pinN(17), geo).innerY).toBeCloseTo(base(0) + 4 + 16, 1)
    expect(pinGeometry(pinN(32), geo).innerY).toBeCloseTo(base(last) + 4 - 16, 1)
  })

  it('下侧角引脚向内水平偏移（33 右移 16、48 左移 16）', () => {
    expect(pinGeometry(pinN(33), geo).innerX).toBeCloseTo(base(last) + 16, 1)
    expect(pinGeometry(pinN(48), geo).innerX).toBeCloseTo(base(0) - 16, 1)
  })

  it('左侧角引脚向内垂直偏移（49 上移 16、64 下移 16）', () => {
    expect(pinGeometry(pinN(49), geo).innerY).toBeCloseTo(base(last) + 4 - 16, 1)
    expect(pinGeometry(pinN(64), geo).innerY).toBeCloseTo(base(0) + 4 + 16, 1)
  })
})
