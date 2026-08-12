import type { DeviceData } from '../../data/device'
import type { PeripheralConfig, ProjectConfig, UsartPeriphSpec, AdcPeriphSpec } from '../../types'

/* ===== USART 通用配置选项（两库宏一致） ===== */
export const USART_WORD_LENGTHS = [
  { label: '8 位', value: 'USART_WL_8BIT' },
  { label: '9 位', value: 'USART_WL_9BIT' },
]

export const USART_STOP_BITS = [
  { label: '1 位', value: 'USART_STB_1BIT' },
  { label: '0.5 位', value: 'USART_STB_0_5BIT' },
  { label: '2 位', value: 'USART_STB_2BIT' },
  { label: '1.5 位', value: 'USART_STB_1_5BIT' },
]

export const USART_PARITIES = [
  { label: '无', value: 'USART_PM_NONE' },
  { label: '偶校验', value: 'USART_PM_EVEN' },
  { label: '奇校验', value: 'USART_PM_ODD' },
]

export const USART_FLOW_CONTROLS = [
  { label: '无', value: 'NONE' },
  { label: 'RTS', value: 'RTS' },
  { label: 'CTS', value: 'CTS' },
  { label: 'RTS + CTS', value: 'RTS_CTS' },
]

export const USART_BAUD_RATES = [9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600, 1000000]

const ADC_CHANNEL_RE = /(?:ADC\d*_)?IN(\d+)$/i

export interface UsartSignalPin {
  signal: string
  pin: string
}

export interface UsartUsage {
  id: string
  label: string
  spec: UsartPeriphSpec
  inUse: boolean
  signals: UsartSignalPin[]
  txPin?: string
  rxPin?: string
}

export interface AdcChannelUsage {
  channel: number
  pin: string
}

export interface AdcUsage {
  id: string
  label: string
  spec: AdcPeriphSpec
  inUse: boolean
  channels: AdcChannelUsage[]
}

export interface PeripheralDerivation {
  usart: UsartUsage[]
  adc: AdcUsage[]
}

/** USART 实例默认参数 */
export function defaultUsartParams(spec: UsartPeriphSpec): Record<string, string | number | boolean> {
  return {
    baudrate: 115200,
    wordLength: 'USART_WL_8BIT',
    stopBits: 'USART_STB_1BIT',
    parity: 'USART_PM_NONE',
    flowControl: 'NONE',
    clockSource: spec.defaultClockSource,
  }
}

/** ADC 实例默认参数 */
export function defaultAdcParams(spec: AdcPeriphSpec): Record<string, string | number | boolean> {
  return { ...spec.defaults }
}

/** 实例的默认/合并配置（spec 存在才返回；store 未配置时 enabled=true） */
export function peripheralConfig(
  deviceData: DeviceData,
  id: string,
  stored?: Record<string, PeripheralConfig>,
): PeripheralConfig | null {
  const us = deviceData.peripheralSpec.usart.find((u) => u.id === id)
  if (us) {
    const s = stored?.[id]
    return {
      enabled: s?.enabled ?? true,
      params: { ...defaultUsartParams(us), ...(s?.params ?? {}) },
    }
  }
  const adc = deviceData.peripheralSpec.adc.find((a) => a.id === id)
  if (adc) {
    const s = stored?.[id]
    return {
      enabled: s?.enabled ?? true,
      params: { ...defaultAdcParams(adc), ...(s?.params ?? {}) },
    }
  }
  return null
}

/** 从引脚 AF/ANALOG 分配推导外设实例使用情况 */
export function derivePeripheralState(
  config: ProjectConfig,
  deviceData: DeviceData,
): PeripheralDerivation {
  const spec = deviceData.peripheralSpec
  const pinName = (name: string): string =>
    deviceData.lookup.findPin(name)?.name.toUpperCase() ?? name.toUpperCase()

  const usart: UsartUsage[] = spec.usart.map((u) => {
    const signals: UsartSignalPin[] = config.pins
      .filter(
        (a) =>
          a.mode === 'AF' &&
          !!a.function &&
          a.function.toUpperCase().startsWith(`${u.afPrefix}_`),
      )
      .map((a) => ({ signal: a.function!.toUpperCase(), pin: pinName(a.pin) }))
    return {
      id: u.id,
      label: u.label,
      spec: u,
      inUse: signals.length > 0,
      signals,
      txPin: signals.find((s) => s.signal.endsWith('_TX'))?.pin,
      rxPin: signals.find((s) => s.signal.endsWith('_RX'))?.pin,
    }
  })

  const adc: AdcUsage[] = spec.adc.map((a) => {
    const channels: AdcChannelUsage[] = []
    for (const pin of config.pins) {
      if (pin.mode !== 'ANALOG' || !pin.function) continue
      const m = pin.function.match(ADC_CHANNEL_RE)
      if (!m) continue
      channels.push({ channel: Number(m[1]), pin: pinName(pin.pin) })
    }
    channels.sort((x, y) => x.channel - y.channel)
    return { id: a.id, label: a.label, spec: a, inUse: channels.length > 0, channels }
  })

  return { usart, adc }
}
