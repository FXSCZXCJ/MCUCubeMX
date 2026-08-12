import type { PinGroup } from '../types'

export const GROUP_COLORS = [
  '#7c4dff',
  '#00a6a6',
  '#e8590c',
  '#f03e3e',
  '#2b8a3e',
  '#1971c2',
  '#ae3ec9',
  '#e67700',
]

export function colorForGroup(index: number): string {
  return GROUP_COLORS[index % GROUP_COLORS.length]
}

/** 查找引脚所属分组（单归属） */
export function groupOfPin(groups: PinGroup[], pin: string): PinGroup | undefined {
  return groups.find((g) => g.pins.includes(pin))
}
