import { describe, expect, it } from 'vitest'
import { getDeviceData } from '../src/data/device'
import { defaultClock, validateClock } from '../src/lib/clock'
import { buildClockTree } from '../src/lib/clock/tree'

describe('时钟树布局', () => {
  it('L233 PLL 链路：源行只含实际源，PLL/SYSCLK/AHB/APB/ADC 节点齐全', () => {
    const spec = getDeviceData('GD32L233RCT6').clockSpec
    const config = defaultClock(spec)
    const v = validateClock(spec, config)
    const tree = buildClockTree(spec, config, v.chain, v)

    expect(tree.nodes.map((n) => n.id)).toEqual(
      expect.arrayContaining(['IRC16M', 'HXTAL', 'IRC48M', 'pll', 'sysclk', 'ahb', 'apb1', 'apb2', 'adc']),
    )
    expect(tree.nodes.find((n) => n.id === 'IRC16M')?.active).toBe(true)
    expect(tree.nodes.find((n) => n.id === 'pll')?.active).toBe(true)
    const edgeIds = tree.edges.map((e) => e.id)
    expect(edgeIds).toContain('src-pll')
    expect(edgeIds).toContain('pll-sysclk')
    expect(edgeIds).toContain('sysclk-ahb')
    expect(edgeIds).toContain('adc-src')
  })

  it('IRC 直连：无 PLL 边，源节点直接连 SYSCLK', () => {
    const spec = getDeviceData('GD32L233RCT6').clockSpec
    const config = { ...defaultClock(spec), source: 'IRC16M' }
    const v = validateClock(spec, config)
    const tree = buildClockTree(spec, config, v.chain, v)
    expect(tree.edges.find((e) => e.id === 'src-pll')).toBeUndefined()
    expect(tree.edges.find((e) => e.id === 'src-sysclk')?.active).toBe(true)
    expect(tree.nodes.find((n) => n.id === 'pll')?.active).toBe(false)
  })

  it('非法项标红（APB1 超限）', () => {
    const spec = getDeviceData('GD32L233RCT6').clockSpec
    const config = { ...defaultClock(spec), apb1: 1 }
    const v = validateClock(spec, config)
    const tree = buildClockTree(spec, config, v.chain, v)
    expect(tree.nodes.find((n) => n.id === 'apb1')?.error).toBe(true)
    expect(tree.edges.find((e) => e.id === 'ahb-apb1')?.error).toBe(true)
  })
})
