import type { ClockConfig, ClockSpec } from '../../types'
import type { ClockChain, ClockValidation } from './index'

export interface ClockTreeNode {
  id: string
  label: string
  sub: string
  x: number
  y: number
  w: number
  h: number
  kind: 'source' | 'pll' | 'bus' | 'leaf'
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
}

export interface ClockTreeLayout {
  width: number
  height: number
  nodes: ClockTreeNode[]
  edges: ClockTreeEdge[]
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
  const width = 760
  const height = 500
  const cx = width / 2
  const sourceW = 150
  const sourceGap = 176
  // 源行只放实际时钟源（IRC/HXTAL）；PLL 作为独立节点参与链路
  const sourceSpecs = spec.sources.filter((s) => !s.pll)
  const sourceCount = sourceSpecs.length
  const sourceStartX = (width - (sourceCount - 1) * sourceGap - sourceW) / 2
  const srcY = 24

  const nodes: ClockTreeNode[] = []
  const srcById = new Map<string, ClockTreeNode>()
  sourceSpecs.forEach((s, i) => {
    const freq = s.hxtal ? config.hxtalMhz : s.freqMhz
    const freqDisplay = typeof freq === 'number' ? freq : null
    const active =
      config.source === s.id || (config.source === 'PLL' && config.pllSource === s.id)
    const node: ClockTreeNode = {
      id: s.id,
      label: s.label,
      sub: active ? fmt(freqDisplay) : `${fmt(freqDisplay)}（未使用）`,
      x: sourceStartX + i * sourceGap,
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
    y: 124,
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
    y: 224,
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
    sub: `${fmt(chain.ahbMhz)} / 上限 ${spec.ahb.maxMhz} MHz`,
    x: cx - 95,
    y: 324,
    w: 190,
    h: NODE_H,
    kind: 'bus',
    active: true,
    error: hasError(validation, 'ahb'),
  }
  nodes.push(ahbNode)

  const leafY = 424
  const leaves: [string, string, string, string, boolean][] = [
    ['apb1', 'APB1', `${fmt(chain.apb1Mhz)} / 上限 ${spec.apb1.maxMhz} MHz`, 'leaf', hasError(validation, 'apb1')],
    ['apb2', 'APB2', `${fmt(chain.apb2Mhz)} / 上限 ${spec.apb2.maxMhz} MHz`, 'leaf', hasError(validation, 'apb2')],
    ['adc', 'ADC', `${fmt(chain.adcMhz)} / 上限 ${spec.adc.maxMhz} MHz`, 'leaf', hasError(validation, 'adc')],
  ]
  leaves.forEach(([id, label, sub, kind, error], i) => {
    nodes.push({
      id,
      label,
      sub,
      x: 84 + i * 236,
      y: leafY,
      w: 190,
      h: NODE_H,
      kind: kind as 'leaf',
      active: true,
      error,
    })
  })

  const edges: ClockTreeEdge[] = []
  const edge = (
    id: string,
    from: string,
    to: string,
    label: string,
    active: boolean,
    error: boolean,
  ) => edges.push({ id, from, to, label, active, error })

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

  const adcOpt = spec.adc.options.find((o) => o.id === config.adc)
  if (adcOpt) {
    const from = adcOpt.source === 'APB2' ? 'apb2' : adcOpt.source === 'APB1' ? 'apb1' : 'ahb'
    edge('adc-src', from, 'adc', `÷${adcOpt.div}`, true, hasError(validation, 'adc'))
  }

  return { width, height, nodes, edges }
}
