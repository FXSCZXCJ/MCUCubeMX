import type { DevicePackage, PinDef } from '../types'

export const PAD_W = 14
export const PAD_LEN = 20
// 外侧标签留白：配置标签不再截断，留足左右侧水平延伸空间
export const LABEL_MARGIN = 64
// 相邻引脚名称标签不重叠所需的最小间距（已在 LQFP64/LQFP100 上验证）
export const PITCH = 28.8
// 四角让位：每边首尾引脚向内侧收缩半个节距，增大直角与引脚的间距，
// 使相邻两条边角上引脚的内侧 GPIO 名不再重叠
export const CORNER_PAD_INSET = PITCH / 2

/** 角度归一化到 [0, 360) */
export function normalizeRotation(deg: number): number {
  return ((deg % 360) + 360) % 360
}

/** 旋转后轴对齐外接框的放大系数：|cos θ| + |sin θ|（0°/90°/180°/270°=1，45°=√2） */
export function rotationBBoxFactor(deg: number): number {
  const rad = ((deg % 360) * Math.PI) / 180
  return Math.abs(Math.cos(rad)) + Math.abs(Math.sin(rad))
}

export interface PackageGeometry {
  body: number
  margin: number
  svgSize: number
  pitch: number
  pinsPerSide: number
}

export function packageGeometry(device: DevicePackage): PackageGeometry {
  const pinsPerSide = device.pinsPerSide
  const body = Math.round(PITCH * pinsPerSide)
  const margin = PAD_LEN + LABEL_MARGIN
  return { body, margin, svgSize: body + margin * 2, pitch: PITCH, pinsPerSide }
}

/** 上下侧外侧标签交错两行（上侧向上、下侧向下错开 10），规避相邻长标签重叠 */
export function outsideLabelDy(pin: PinDef, pinsPerSide: number): number {
  const sideIndex = (pin.number - 1) % pinsPerSide
  if (pin.side === 'top') return sideIndex % 2 === 0 ? 0 : -10
  if (pin.side === 'bottom') return sideIndex % 2 === 0 ? 0 : 10
  return 0
}

export interface PinGeometry {
  x: number
  y: number
  w: number
  h: number
  labelX: number
  labelY: number
  anchor: 'start' | 'end' | 'middle'
  innerX: number
  innerY: number
  innerAnchor: 'start' | 'end' | 'middle'
  rotate?: boolean
}

function along(bodyStart: number, i: number, geo: PackageGeometry): number {
  const span = geo.body - 2 * CORNER_PAD_INSET
  return bodyStart + CORNER_PAD_INSET + ((i + 0.5) * span) / geo.pinsPerSide
}

export function pinGeometry(pin: PinDef, geo: PackageGeometry): PinGeometry {
  const n = pin.number - 1
  const sideIndex = n % geo.pinsPerSide
  const side = pin.side
  if (side === 'top') {
    const x = along(geo.margin, sideIndex, geo)
    return {
      x: x - PAD_W / 2,
      y: geo.margin - PAD_LEN,
      w: PAD_W,
      h: PAD_LEN,
      labelX: x,
      labelY: geo.margin - PAD_LEN - 8,
      anchor: 'middle',
      innerX: x,
      innerY: geo.margin + 12,
      innerAnchor: 'middle',
    }
  }
  if (side === 'right') {
    const y = along(geo.margin, sideIndex, geo)
    return {
      x: geo.margin + geo.body,
      y: y - PAD_W / 2,
      w: PAD_LEN,
      h: PAD_W,
      labelX: geo.margin + geo.body + PAD_LEN + 6,
      labelY: y + 4,
      anchor: 'start',
      innerX: geo.margin + geo.body - 8,
      innerY: y + 4,
      innerAnchor: 'end',
    }
  }
  if (side === 'bottom') {
    const x = along(geo.margin, geo.pinsPerSide - 1 - sideIndex, geo)
    return {
      x: x - PAD_W / 2,
      y: geo.margin + geo.body,
      w: PAD_W,
      h: PAD_LEN,
      labelX: x,
      labelY: geo.margin + geo.body + PAD_LEN + 16,
      anchor: 'middle',
      innerX: x,
      innerY: geo.margin + geo.body - 10,
      innerAnchor: 'middle',
    }
  }
  // left: pins run bottom -> top
  const y = along(geo.margin, geo.pinsPerSide - 1 - sideIndex, geo)
  return {
    x: geo.margin - PAD_LEN,
    y: y - PAD_W / 2,
    w: PAD_LEN,
    h: PAD_W,
    labelX: geo.margin - PAD_LEN - 6,
    labelY: y + 4,
    anchor: 'end',
    innerX: geo.margin + 8,
    innerY: y + 4,
    innerAnchor: 'start',
  }
}

export type PinState =
  | 'unassigned'
  | 'output'
  | 'input'
  | 'af'
  | 'analog'
  | 'exti'
  | 'conflict'
  | 'power'
  | 'special'
  | 'selected'

export const PIN_COLORS: Record<PinState, { fill: string; stroke: string }> = {
  unassigned: { fill: '#e9ebef', stroke: '#9aa2ad' },
  output: { fill: '#4caf50', stroke: '#2e7d32' },
  input: { fill: '#2196f3', stroke: '#1565c0' },
  af: { fill: '#ab47bc', stroke: '#7b1fa2' },
  analog: { fill: '#26a69a', stroke: '#00695c' },
  exti: { fill: '#ff9800', stroke: '#e65100' },
  conflict: { fill: '#f44336', stroke: '#b71c1c' },
  power: { fill: '#546e7a', stroke: '#263238' },
  special: { fill: '#fff3c4', stroke: '#b8860b' },
  selected: { fill: '#7c4dff', stroke: '#4527a0' },
}
