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
  /** 时钟树配置（Phase 2；旧配置缺省时使用器件默认值） */
  clock?: ClockConfig
}

/* ==================== 时钟树（Phase 2） ==================== */

export interface ClockHxtalSpec {
  min: number
  max: number
  default: number
}

export interface ClockSourceSpec {
  id: string
  label: string
  /** 固定频率源（IRC） */
  freqMhz?: number
  /** 外部晶振：范围与默认值 */
  hxtal?: ClockHxtalSpec
  /** 是否为 PLL（需要进入 PLL 配置段） */
  pll?: boolean
}

export interface ClockParamSpec {
  key: string
  label: string
  kind: 'select' | 'number'
  min?: number
  max?: number
  step?: number
  options?: number[]
  default: number
}

export interface ClockPllSpec {
  label: string
  outMaxMhz: number
  /** VCO 频率范围（仅 F4xx 等有多级结构的器件） */
  vcoMinMhz?: number
  vcoMaxMhz?: number
  /** PLL 输入频率范围 */
  inMinMhz?: number
  inMaxMhz?: number
  /** 可选作 PLL 输入源的 source id 列表 */
  sourceOptions: string[]
  params: ClockParamSpec[]
}

export interface ClockAdcOption {
  id: string
  label: string
  source: 'APB1' | 'APB2' | 'AHB' | 'IRC16M' | 'IRC48M' | 'PLL'
  div: number
}

export interface ClockAdcSpec {
  label: string
  maxMhz: number
  options: ClockAdcOption[]
  default: string
  codegen?: { api: string; argMacro: string; include?: string }
}

export interface ClockBusSpec {
  label: string
  options: number[]
  maxMhz: number
  default: number
}

export interface ClockPllApiSpec {
  name: string
  /** 参数顺序；'src' 表示 PLL 源宏，其余为 pll 配置 key */
  args: string[]
  /** 单参数倍频（如 L23x）时的宏模板，<mul> 为占位符 */
  mulMacro?: string
}

export interface ClockCodegenSpec {
  /** source id → 系统时钟源宏（RCU_CKSYSSRC_*） */
  sysclkSource: Record<string, string>
  /** source id → 振荡器枚举（RCU_*） */
  oscEnum: Record<string, string>
  /** source id → PLL 源宏（RCU_PLLSRC_*） */
  pllSrc: Record<string, string>
  pllApi: ClockPllApiSpec
  /** 分频宏模板，<div> 为占位符 */
  prescaler: { ahb: string; apb1: string; apb2: string }
  /** F4xx：NVIC 优先级分组宏（随 clock.c 输出） */
  nvicPriorityGroupMacro?: string
  /** F4xx：SYSCLK 超过该值时在 clock.c 中输出高压驱动模式代码 */
  highDriveMhz?: number
}

export interface ClockSpec {
  device: string
  source: string
  sysclkMaxMhz: number
  sources: ClockSourceSpec[]
  pll: ClockPllSpec
  ahb: ClockBusSpec
  apb1: ClockBusSpec
  apb2: ClockBusSpec
  adc: ClockAdcSpec
  codegen: ClockCodegenSpec
}

export interface ClockConfig {
  /** 系统时钟源：IRC16M / HXTAL / IRC48M / PLL */
  source: string
  hxtalMhz: number
  /** PLL 输入源（source=PLL 时生效） */
  pllSource: string
  /** PLL 参数（如 { mul: 4 } 或 { psc: 25, n: 400, p: 2, q: 9 }） */
  pll: Record<string, number>
  ahb: number
  apb1: number
  apb2: number
  /** ADC 分频选项 id（来自 clock.json adc.options） */
  adc: string
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
