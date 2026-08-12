import type { ClockConfig, ClockSpec } from '../../types'
import type { ClockChain, ClockValidation } from './index'

export interface ClockTreeNode {
  id: string
  label: string
  sub: string
  /** SVG 悬停提示（如挂载外设列表） */
  title?: string
  x: number
  y: number
  w: number
  h: number
  kind: 'source' | 'pll' | 'bus' | 'leaf' | 'timer' | 'aux'
  active: boolean
  error: boolean
}

export interface ClockTreeEdge {
  id: string
  from: string
  to: string
  label: string
  active: boolean
  error: boolean
  /** SVG path d：从起点底边到终点顶边的平滑贝塞尔曲线 */
  path: string
}

/** 挂在总线节点下方的外设小标签（SVG chip） */
export interface ClockTreeChip {
  node: string
  label: string
  x: number
  y: number
  w: number
}

export interface ClockTreeLayout {
  width: number
  height: number
  nodes: ClockTreeNode[]
  edges: ClockTreeEdge[]
  chips: ClockTreeChip[]
}

export const NODE_W = 150
export const NODE_H = 58

function fmt(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return '—'
  const r = Math.round(v * 1000) / 1000
  return `${r} MHz`
}

function hasError(validation: ClockValidation, node: string): boolean {
  return validation.errors.some((e) => e.node === node)
}

/** 节点挂载的外设列表（无数据时返回空） */
export function peripheralsOf(spec: ClockSpec, nodeId: string): string[] {
  const p = spec.peripherals
  if (p) {
    if (nodeId === 'ahb') return p.ahb
    if (nodeId === 'apb1') return p.apb1
    if (nodeId === 'apb2') return p.apb2
    if (nodeId === 'adc') return p.adc
  }
  if (spec.timerDomains?.some((d) => d.id === nodeId)) {
    return spec.timerDomains.find((d) => d.id === nodeId)!.peripherals
  }
  if (nodeId === 'rtc') return spec.lowPower?.rtc.peripherals ?? []
  if (nodeId === 'fwdgt') return spec.lowPower?.fwdgt.peripherals ?? []
  if (nodeId === 'usb48') return spec.usb48?.peripherals ?? []
  return []
}

function periTitle(spec: ClockSpec, nodeId: string, label: string): string | undefined {
  const list = peripheralsOf(spec, nodeId)
  if (!list.length) return undefined
  return `${label} 挂载外设：${list.join('、')}`
}

/**
 * 由 spec + 当前配置生成 SVG 树布局。
 * 布局：顶部时钟源行 → PLL → SYSCLK → AHB → 底部 APB1/APB2/ADC。
 */
export function buildClockTree(
  spec: ClockSpec,
  config: ClockConfig,
  chain: ClockChain,
  validation: ClockValidation,
): ClockTreeLayout {
  const width = 900
  const cx = width / 2
  const sourceW = 140
  // 源行：系统时钟源（IRC/HXTAL）+ 低功耗源（LXTAL/IRC32K）；PLL 作为独立节点参与链路
  const lp = spec.lowPower
  const sourceSpecs = [
    ...spec.sources.filter((s) => !s.pll),
    ...(lp
      ? [
          { id: 'LXTAL', label: 'LXTAL', freqMhz: lp.lxtalMhz },
          { id: 'IRC32K', label: 'IRC32K', freqMhz: lp.irc32kMhz },
        ]
      : []),
  ]
  const sourceCount = sourceSpecs.length
  const sourceGap = sourceCount > 1 ? (width - sourceW * sourceCount) / (sourceCount - 1) : 0
  const srcY = 24

  const nodes: ClockTreeNode[] = []
  const srcById = new Map<string, ClockTreeNode>()
  sourceSpecs.forEach((s, i) => {
    const freq = s.hxtal ? config.hxtalMhz : s.freqMhz
    const freqDisplay = typeof freq === 'number' ? freq : null
    const active =
      config.source === s.id ||
      (config.source === 'PLL' && config.pllSource === s.id) ||
      (config.rtcSource === s.id && (s.id === 'LXTAL' || s.id === 'IRC32K')) ||
      (config.usbSource === 'IRC48M' && s.id === 'IRC48M')
    const node: ClockTreeNode = {
      id: s.id,
      label: s.label,
      sub: active ? fmt(freqDisplay) : `${fmt(freqDisplay)}（未使用）`,
      x: i * (sourceW + sourceGap),
      y: srcY,
      w: sourceW,
      h: NODE_H,
      kind: 'source',
      active,
      error: s.hxtal ? hasError(validation, 'hxtal') : false,
    }
    nodes.push(node)
    srcById.set(s.id, node)
  })

  const usePll = config.source === 'PLL'
  const pllNode: ClockTreeNode = {
    id: 'pll',
    label: spec.pll.label.split('（')[0] ?? 'PLL',
    sub: usePll
      ? `输入 ${fmt(chain.pllInMhz)} → 输出 ${fmt(chain.pllOutMhz)}`
      : '未使用（点击启用 PLL）',
    x: cx - 100,
    y: 118,
    w: 200,
    h: NODE_H,
    kind: 'pll',
    active: usePll,
    error: usePll && hasError(validation, 'pll'),
  }
  nodes.push(pllNode)

  const sysclkNode: ClockTreeNode = {
    id: 'sysclk',
    label: 'SYSCLK',
    sub: `${fmt(chain.sysclkMhz)} / 上限 ${spec.sysclkMaxMhz} MHz`,
    x: cx - 100,
    y: 206,
    w: 200,
    h: NODE_H,
    kind: 'bus',
    active: true,
    error: hasError(validation, 'sysclk'),
  }
  nodes.push(sysclkNode)

  const ahbNode: ClockTreeNode = {
    id: 'ahb',
    label: 'AHB',
    sub: `${fmt(chain.ahbMhz)} / 上限 ${spec.ahb.maxMhz} MHz · ${peripheralsOf(spec, 'ahb').length} 外设`,
    title: periTitle(spec, 'ahb', 'AHB'),
    x: cx - 95,
    y: 294,
    w: 190,
    h: NODE_H,
    kind: 'bus',
    active: true,
    error: hasError(validation, 'ahb'),
  }
  nodes.push(ahbNode)

  const leafY = 382
  const leaves: [string, string, string, string, boolean][] = [
    ['apb1', 'APB1', `${fmt(chain.apb1Mhz)} / 上限 ${spec.apb1.maxMhz} MHz`, 'leaf', hasError(validation, 'apb1')],
    ['apb2', 'APB2', `${fmt(chain.apb2Mhz)} / 上限 ${spec.apb2.maxMhz} MHz`, 'leaf', hasError(validation, 'apb2')],
    ['adc', 'ADC', `${fmt(chain.adcMhz)} / 上限 ${spec.adc.maxMhz} MHz`, 'leaf', hasError(validation, 'adc')],
  ]
  const leafNodes: ClockTreeNode[] = []
  leaves.forEach(([id, label, sub, kind, error], i) => {
    const count = peripheralsOf(spec, id).length
    const node: ClockTreeNode = {
      id,
      label,
      sub: `${sub} · ${count} 外设`,
      title: periTitle(spec, id, label),
      x: 120 + i * 255,
      y: leafY,
      w: 180,
      h: NODE_H,
      kind: kind as 'leaf',
      active: true,
      error,
    }
    nodes.push(node)
    leafNodes.push(node)
  })

  // TIMER 时钟域次级行（APB 分频 >1 时 ×2）
  const timerY = leafY + NODE_H + 32
  const timerNodes: ClockTreeNode[] = []
  for (const d of spec.timerDomains ?? []) {
    const bus = d.bus
    const mul = config[bus] > 1 ? 2 : 1
    const timerMhz = bus === 'apb1' ? chain.apb1TimerMhz : chain.apb2TimerMhz
    const count = peripheralsOf(spec, d.id).length
    const node: ClockTreeNode = {
      id: d.id,
      label: d.label,
      sub: `${fmt(timerMhz)} · ×${mul} · ${count} TIMER`,
      title: periTitle(spec, d.id, d.label),
      x: bus === 'apb1' ? 120 : 375,
      y: timerY,
      w: 180,
      h: NODE_H,
      kind: 'timer',
      active: true,
      error: hasError(validation, bus),
    }
    nodes.push(node)
    timerNodes.push(node)
  }

  // 辅助时钟域列（RTC / FWDGT / USB 48MHz / SysTick）
  const auxX = 770
  const auxW = 120
  const rtcSource = config.rtcSource
    ? lp?.rtc.sources.find((s) => s.key === config.rtcSource)
    : undefined
  const usbSource = config.usbSource
    ? spec.usb48?.sources.find((s) => s.key === config.usbSource)
    : undefined
  const auxNodes: ClockTreeNode[] = [
    {
      id: 'rtc',
      label: 'RTC',
      sub: rtcSource ? `${rtcSource.label.split(' ')[0]} ${fmt(chain.rtcMhz)}` : '未配置',
      title: periTitle(spec, 'rtc', 'RTC'),
      x: auxX,
      y: 118,
      w: auxW,
      h: NODE_H,
      kind: 'aux',
      active: !!rtcSource,
      error: hasError(validation, 'rtc'),
    },
    {
      id: 'fwdgt',
      label: 'FWDGT',
      sub: `IRC32K ${fmt(lp?.irc32kMhz ?? 0)}`,
      title: periTitle(spec, 'fwdgt', 'FWDGT'),
      x: auxX,
      y: 206,
      w: auxW,
      h: NODE_H,
      kind: 'aux',
      active: true,
      error: false,
    },
    {
      id: 'usb48',
      label: spec.usb48?.label ?? 'USB 48M',
      sub: usbSource
        ? `${usbSource.label.split(' ')[0]} ${fmt(chain.ck48mMhz)}`
        : '未配置',
      title: periTitle(spec, 'usb48', 'USB 48MHz'),
      x: auxX,
      y: 294,
      w: auxW,
      h: NODE_H,
      kind: 'aux',
      active: !!usbSource,
      error: hasError(validation, 'usb48'),
    },
    {
      id: 'systick',
      label: 'SysTick',
      sub: `HCLK/8 = ${fmt(chain.systickMhz)}`,
      x: auxX,
      y: 382,
      w: auxW,
      h: NODE_H,
      kind: 'aux',
      active: true,
      error: false,
    },
  ]
  nodes.push(...auxNodes)

  // 外设小标签（按节点宽度自动换行）；APB1/APB2/ADC 标签放在 TIMER 行下方
  const chips: ClockTreeChip[] = []
  const chipRowH = 18
  let maxChipRows = 0
  const chipStartY = timerY + NODE_H + 16
  for (const leaf of leafNodes) {
    const list = peripheralsOf(spec, leaf.id)
    if (!list.length) continue
    const shelfLeft = leaf.x + 5
    const shelfRight = leaf.x + leaf.w - 5
    let x = shelfLeft
    let y = chipStartY
    let rows = 1
    for (const name of list) {
      const w = Math.max(30, name.length * 7.5 + 14)
      if (x + w > shelfRight) {
        x = shelfLeft
        y += chipRowH
        rows++
      }
      chips.push({ node: leaf.id, label: name, x, y, w })
      x += w + 5
    }
    maxChipRows = Math.max(maxChipRows, rows)
  }

  const edges: ClockTreeEdge[] = []
  const edge = (
    id: string,
    from: string,
    to: string,
    label: string,
    active: boolean,
    error: boolean,
  ) => {
    const a = nodes.find((n) => n.id === from)
    const b = nodes.find((n) => n.id === to)
    if (!a || !b) return
    const x1 = a.x + a.w / 2
    const y1 = a.y + a.h
    const x2 = b.x + b.w / 2
    const y2 = b.y
    const dy = y2 - y1
    const ctrl = Math.max(20, Math.abs(dy) * 0.45)
    const d = `M ${x1} ${y1} C ${x1} ${y1 + ctrl}, ${x2} ${y2 - ctrl}, ${x2} ${y2}`
    edges.push({ id, from, to, label, active, error, path: d })
  }

  const srcNode = usePll ? srcById.get(config.pllSource) : srcById.get(config.source)
  if (usePll && srcNode) {
    edge('src-pll', srcNode.id, 'pll', `输入 ${fmt(chain.pllInMhz)}`, true, hasError(validation, 'pll'))
    edge('pll-sysclk', 'pll', 'sysclk', '', true, hasError(validation, 'pll'))
  } else if (srcNode) {
    edge('src-sysclk', srcNode.id, 'sysclk', '直接使用', true, false)
  }

  edge('sysclk-ahb', 'sysclk', 'ahb', `÷${config.ahb}`, true, hasError(validation, 'ahb'))
  edge('ahb-apb1', 'ahb', 'apb1', `÷${config.apb1}`, true, hasError(validation, 'apb1'))
  edge('ahb-apb2', 'ahb', 'apb2', `÷${config.apb2}`, true, hasError(validation, 'apb2'))
  for (const d of spec.timerDomains ?? []) {
    const timerNode = timerNodes.find((n) => n.id === d.id)
    if (timerNode) {
      const label = config[d.bus] > 1 ? '×2' : '×1'
      edge(`${d.bus}-timer`, d.bus, d.id, label, true, hasError(validation, d.bus))
    }
  }

  // 低功耗 / USB / SysTick 域连线
  const rtcFrom = rtcSource
    ? rtcSource.divHxtal
      ? 'HXTAL'
      : rtcSource.key
    : undefined
  if (rtcFrom && srcById.has(rtcFrom)) {
    edge('rtc-src', rtcFrom, 'rtc', rtcSource?.label.split(' ')[0] ?? '', true, hasError(validation, 'rtc'))
  }
  if (srcById.has('IRC32K')) {
    edge('fwdgt-src', 'IRC32K', 'fwdgt', '固定', true, false)
  }
  const usbFrom =
    config.usbSource === 'PLL' || config.usbSource === 'PLL48M'
      ? 'pll'
      : config.usbSource === 'IRC48M'
        ? 'IRC48M'
        : undefined
  if (usbFrom && (nodes.some((n) => n.id === usbFrom))) {
    edge('usb48-src', usbFrom, 'usb48', usbSource?.label.split(' ')[0] ?? '', true, hasError(validation, 'usb48'))
  }
  edge('systick-src', 'ahb', 'systick', '÷8', true, false)

  const adcOpt = spec.adc.options.find((o) => o.id === config.adc)
  if (adcOpt) {
    const from = adcOpt.source === 'APB2' ? 'apb2' : adcOpt.source === 'APB1' ? 'apb1' : 'ahb'
    edge('adc-src', from, 'adc', `÷${adcOpt.div}`, true, hasError(validation, 'adc'))
  }

  const totalHeight = Math.max(440, chipStartY + maxChipRows * chipRowH + 16)
  return { width, height: totalHeight, nodes, edges, chips }
}
