import type { PinDef } from '../types'

export const PAD_W = 14
export const PAD_LEN = 20
export const BODY = 460
export const PINS_PER_SIDE = 16
export const LABEL_MARGIN = 40
export const MARGIN = PAD_LEN + LABEL_MARGIN
export const SVG_SIZE = BODY + MARGIN * 2

export interface PinGeometry {
  x: number
  y: number
  w: number
  h: number
  labelX: number
  labelY: number
  anchor: 'start' | 'end' | 'middle'
  rotate?: boolean
}

function along(bodyStart: number, i: number): number {
  return bodyStart + ((i + 0.5) * BODY) / PINS_PER_SIDE
}

export function pinGeometry(pin: PinDef): PinGeometry {
  const n = pin.number - 1
  const sideIndex = n % PINS_PER_SIDE
  const side = pin.side
  if (side === 'top') {
    const x = along(MARGIN, sideIndex)
    return {
      x: x - PAD_W / 2,
      y: MARGIN - PAD_LEN,
      w: PAD_W,
      h: PAD_LEN,
      labelX: x,
      labelY: MARGIN - PAD_LEN - 8,
      anchor: 'middle',
    }
  }
  if (side === 'right') {
    const y = along(MARGIN, sideIndex)
    return {
      x: MARGIN + BODY,
      y: y - PAD_W / 2,
      w: PAD_LEN,
      h: PAD_W,
      labelX: MARGIN + BODY + PAD_LEN + 6,
      labelY: y + 4,
      anchor: 'start',
    }
  }
  if (side === 'bottom') {
    const x = along(MARGIN, PINS_PER_SIDE - 1 - sideIndex)
    return {
      x: x - PAD_W / 2,
      y: MARGIN + BODY,
      w: PAD_W,
      h: PAD_LEN,
      labelX: x,
      labelY: MARGIN + BODY + PAD_LEN + 16,
      anchor: 'middle',
    }
  }
  // left: pins 49..64 run bottom -> top
  const y = along(MARGIN, PINS_PER_SIDE - 1 - sideIndex)
  return {
    x: MARGIN - PAD_LEN,
    y: y - PAD_W / 2,
    w: PAD_LEN,
    h: PAD_W,
    labelX: MARGIN - PAD_LEN - 6,
    labelY: y + 4,
    anchor: 'end',
  }
}

export type PinState =
  | 'unassigned'
  | 'output'
  | 'input'
  | 'exti'
  | 'conflict'
  | 'power'
  | 'special'
  | 'selected'

export const PIN_COLORS: Record<PinState, { fill: string; stroke: string }> = {
  unassigned: { fill: '#e9ebef', stroke: '#9aa2ad' },
  output: { fill: '#4caf50', stroke: '#2e7d32' },
  input: { fill: '#2196f3', stroke: '#1565c0' },
  exti: { fill: '#ff9800', stroke: '#e65100' },
  conflict: { fill: '#f44336', stroke: '#b71c1c' },
  power: { fill: '#cfd8dc', stroke: '#78909c' },
  special: { fill: '#fff3c4', stroke: '#b8860b' },
  selected: { fill: '#7c4dff', stroke: '#4527a0' },
}
