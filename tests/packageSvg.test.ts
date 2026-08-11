import { describe, expect, it } from 'vitest'
import { devices } from '../src/data/device'
import {
  CORNER_PAD_INSET,
  normalizeRotation,
  outsideLabelDy,
  packageGeometry,
  pinGeometry,
} from '../src/lib/packageSvg'
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

describe('旋转角度归一化', () => {
  it('45° 步进与负角/超 360° 归一化', () => {
    expect(normalizeRotation(0)).toBe(0)
    expect(normalizeRotation(45)).toBe(45)
    expect(normalizeRotation(-45)).toBe(315)
    expect(normalizeRotation(405)).toBe(45)
    expect(normalizeRotation(-405)).toBe(315)
    expect(normalizeRotation(360)).toBe(0)
  })
})

describe('直角处引脚间距（角上引脚向内侧让位）', () => {
  const gd = devices['GD32L233RCT6'].device
  const geo = packageGeometry(gd)
  const pinN = (n: number) => gd.pins.find((p) => p.number === n)!
  const last = geo.pinsPerSide - 1
  const span = geo.body - 2 * CORNER_PAD_INSET
  const base = (i: number) => geo.margin + CORNER_PAD_INSET + ((i + 0.5) * span) / geo.pinsPerSide

  it('上下侧首尾引脚距直角 ≥ 半个节距', () => {
    expect(pinGeometry(pinN(1), geo).innerX).toBeCloseTo(base(0), 1)
    expect(pinGeometry(pinN(16), geo).innerX).toBeCloseTo(base(last), 1)
    expect(pinGeometry(pinN(33), geo).innerX).toBeCloseTo(base(last), 1)
    expect(pinGeometry(pinN(48), geo).innerX).toBeCloseTo(base(0), 1)
  })

  it('左右侧首尾引脚距直角 ≥ 半个节距', () => {
    expect(pinGeometry(pinN(17), geo).innerY).toBeCloseTo(base(0) + 4, 1)
    expect(pinGeometry(pinN(32), geo).innerY).toBeCloseTo(base(last) + 4, 1)
    expect(pinGeometry(pinN(49), geo).innerY).toBeCloseTo(base(last) + 4, 1)
    expect(pinGeometry(pinN(64), geo).innerY).toBeCloseTo(base(0) + 4, 1)
  })
})
