export type PinMode = 'INPUT' | 'OUTPUT' | 'AF' | 'ANALOG'
export type PortLetter = 'A' | 'B' | 'C' | 'D' | 'F'
export type PinSide = 'top' | 'right' | 'bottom' | 'left'
export type PinType = 'IO' | 'POWER' | 'NC'

export interface FirmwareProfile {
  header: string
  rcuPrefix: string
  speeds: string[]
  extiEdgePrefix: string
  nvic: { group: boolean; groupMacro?: string }
  define: string
  core: string
}

export interface PinDef {
  number: number
  name: string
  type: PinType
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
  pinsPerSide: number
  firmware: FirmwareProfile
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
  /** AF 复用信号或模拟信号（如 USART1_TX / ADC_IN0），mode 为 AF/ANALOG 时使用 */
  function?: string
  params: PinParams
}

export interface PinGroup {
  name: string
  pins: string[]
  color?: string
}

export interface ProjectConfig {
  version: 1
  device: string
  pins: PinAssignment[]
  /** 引脚自定义分组（单归属） */
  groups?: PinGroup[]
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
