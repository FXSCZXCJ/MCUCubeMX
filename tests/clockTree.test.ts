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

  it('总线节点标注挂载外设数量与悬停清单', () => {
    const spec = getDeviceData('GD32L233RCT6').clockSpec
    const config = defaultClock(spec)
    const v = validateClock(spec, config)
    const tree = buildClockTree(spec, config, v.chain, v)
    const ahb = tree.nodes.find((n) => n.id === 'ahb')!
    expect(ahb.sub).toContain(`${spec.peripherals!.ahb.length} 外设`)
    expect(ahb.title).toContain('GPIOA')
    const apb1 = tree.nodes.find((n) => n.id === 'apb1')!
    expect(apb1.title).toContain('USART1')
    expect(apb1.title).toContain('I2C0')
  })

  it('APB1/APB2/ADC 节点下方渲染外设标签', () => {
    const spec = getDeviceData('GD32L233RCT6').clockSpec
    const config = defaultClock(spec)
    const v = validateClock(spec, config)
    const tree = buildClockTree(spec, config, v.chain, v)
    const apb1Chips = tree.chips.filter((c) => c.node === 'apb1').map((c) => c.label)
    const apb2Chips = tree.chips.filter((c) => c.node === 'apb2').map((c) => c.label)
    const adcChips = tree.chips.filter((c) => c.node === 'adc').map((c) => c.label)
    expect(apb1Chips).toContain('USART1')
    expect(apb1Chips).toContain('I2C0')
    expect(apb2Chips).toContain('USART0')
    expect(adcChips).toEqual(['ADC'])
    expect(apb1Chips.length).toBe(spec.peripherals!.apb1.length)
    expect(tree.height).toBeGreaterThan(500)
  })

  it('完整时钟域：TIMER/RTC/FWDGT/USB48/SysTick 节点齐全', () => {
    const spec = getDeviceData('GD32L233RCT6').clockSpec
    const config = { ...defaultClock(spec), rtcSource: 'LXTAL', usbSource: 'IRC48M' }
    const v = validateClock(spec, config)
    const tree = buildClockTree(spec, config, v.chain, v)
    const ids = tree.nodes.map((n) => n.id)
    expect(ids).toEqual(
      expect.arrayContaining([
        'LXTAL',
        'IRC32K',
        'APB1_TIMER',
        'APB2_TIMER',
        'rtc',
        'fwdgt',
        'usb48',
        'systick',
      ]),
    )
    const apb1Timer = tree.nodes.find((n) => n.id === 'APB1_TIMER')!
    expect(apb1Timer.sub).toContain('×2')
    const rtc = tree.nodes.find((n) => n.id === 'rtc')!
    expect(rtc.active).toBe(true)
    const usb = tree.nodes.find((n) => n.id === 'usb48')!
    expect(usb.active).toBe(true)
    expect(usb.title).toContain('USBD')
  })

  it('APB1 分频=1 时 TIMER 节点显示 ×1', () => {
    const spec = getDeviceData('GD32L233RCT6').clockSpec
    const config = { ...defaultClock(spec), apb1: 1 }
    const v = validateClock(spec, config)
    const tree = buildClockTree(spec, config, v.chain, v)
    expect(tree.nodes.find((n) => n.id === 'APB1_TIMER')!.sub).toContain('×1')
  })
})
