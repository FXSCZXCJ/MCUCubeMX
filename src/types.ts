export type PinMode = 'INPUT' | 'OUTPUT'
export type PortLetter = 'A' | 'B' | 'C' | 'D' | 'F'
export type PinSide = 'top' | 'right' | 'bottom' | 'left'

export interface PinDef {
  number: number
  name: string
  type: 'IO' | 'POWER'
  level?: '5VT'
  side: PinSide
  aliases?: string[]
  special?: 'nrst' | 'boot' | 'swd' | 'osc'
  alternate?: string[]
  additional?: string[]
}

export interface DevicePackage {
  device: string
  package: string
  core: string
  flash: string
  sram: string
  source: string
  pins: PinDef[]
}

export interface AfEntry {
  pin: string
  af: number
  signal: string
}

export interface ExtiEntry {
  pin: string
  line: number
  irq: string
}

export type ExtiEdge = 'RISING' | 'FALLING' | 'BOTH'

export interface ExtiParams {
  enabled: boolean
  edge: ExtiEdge
}

export interface PinParams {
  outputType?: 'PP' | 'OD'
  speed?: '2' | '10' | '50'
  level?: 'HIGH' | 'LOW'
  pull?: 'NONE' | 'PULLUP' | 'PULLDOWN'
  exti?: ExtiParams
}

export interface PinAssignment {
  pin: string
  label?: string
  mode: PinMode
  params: PinParams
}

export interface ProjectConfig {
  version: 1
  device: 'GD32L233RCT6'
  pins: PinAssignment[]
  naming: { prefix: string }
}

export interface Conflict {
  severity: 'error' | 'warning'
  code: string
  message: string
  pins: string[]
}

export interface GeneratedFile {
  path: string
  content: string
}
