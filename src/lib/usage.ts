import type { ProjectConfig } from '../types'
import type { DeviceData } from '../data/device'

export interface PeripheralUsageItem {
  signal: string
  display: string
  pin: string
}

export interface PeripheralUsage {
  name: string
  items: PeripheralUsageItem[]
}

export interface ExtiUsage {
  line: number
  pin: string
  edge: string
}

export interface GpioUsage {
  pin: string
  label: string
  mode: string
}

export interface ProjectUsage {
  peripherals: PeripheralUsage[]
  exti: ExtiUsage[]
  gpio: GpioUsage[]
}

const SHORT_IO = new Set([
  'TX',
  'RX',
  'SCK',
  'MISO',
  'MOSI',
  'SCL',
  'SDA',
  'CTS',
  'RTS',
  'CK',
  'DE',
  'NSS',
  'WS',
  'SD',
  'MCK',
  'SMBA',
])

const IGNORED_AF = new Set(['EVENTOUT'])

/** 外设信号短名：USART1_TX → TX；TIMER1_CH2 → TIMER1_CH2 */
export function shortSignal(signal: string): string {
  const idx = signal.indexOf('_')
  if (idx > 0) {
    const suffix = signal.slice(idx + 1)
    if (SHORT_IO.has(suffix)) return suffix
  }
  return signal
}

/** 从配置推导外设/EXTI/GPIO 使用情况（供侧边栏展示） */
export function deriveUsage(config: ProjectConfig, deviceData: DeviceData): ProjectUsage {
  const peripherals = new Map<string, PeripheralUsageItem[]>()
  const exti: ExtiUsage[] = []
  const gpio: GpioUsage[] = []

  for (const a of config.pins) {
    const pinDef = deviceData.lookup.findPin(a.pin)
    if (!pinDef) continue
    const name = pinDef.name.toUpperCase()

    if (a.mode === 'AF' && a.function && !IGNORED_AF.has(a.function.toUpperCase())) {
      const peripheral = a.function.split('_')[0]
      const list = peripherals.get(peripheral) ?? []
      list.push({ signal: a.function, display: shortSignal(a.function), pin: name })
      peripherals.set(peripheral, list)
    } else if (a.mode === 'ANALOG' && a.function) {
      const peripheral = a.function.toUpperCase().startsWith('DAC') ? 'DAC' : 'ADC'
      const list = peripherals.get(peripheral) ?? []
      list.push({ signal: a.function, display: a.function, pin: name })
      peripherals.set(peripheral, list)
    } else if (a.mode === 'INPUT' && a.params.exti?.enabled) {
      exti.push({
        line: deviceData.lookup.pinIndex(name),
        pin: name,
        edge: a.params.exti.edge,
      })
    } else if (a.mode === 'INPUT' || a.mode === 'OUTPUT') {
      gpio.push({ pin: name, label: a.label ?? '', mode: a.mode })
    }
  }

  const peripheralList = [...peripherals.entries()]
    .map(([name, items]) => ({ name, items }))
    .sort((x, y) => x.name.localeCompare(y.name))
  exti.sort((x, y) => x.line - y.line)
  gpio.sort(
    (x, y) =>
      (deviceData.lookup.findPin(x.pin)?.number ?? 0) -
      (deviceData.lookup.findPin(y.pin)?.number ?? 0),
  )

  return { peripherals: peripheralList, exti, gpio }
}
