import { describe, expect, it } from 'vitest'
import { outsideLabelDy } from '../src/lib/packageSvg'
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
