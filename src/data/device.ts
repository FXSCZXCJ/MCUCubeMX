import type { AfEntry, ClockSpec, DevicePackage, ExtiEntry, PinDef } from '../types'
import deviceJson from '../../data/devices/gd32l233rct6/package.json'
import afJson from '../../data/devices/gd32l233rct6/af.json'
import extiJson from '../../data/devices/gd32l233rct6/exti.json'
import clockJson from '../../data/devices/gd32l233rct6/clock.json'
import f427DeviceJson from '../../data/devices/gd32f427ve/package.json'
import f427AfJson from '../../data/devices/gd32f427ve/af.json'
import f427ExtiJson from '../../data/devices/gd32f427ve/exti.json'
import f427ClockJson from '../../data/devices/gd32f427ve/clock.json'

export const DEFAULT_DEVICE_ID = 'GD32L233RCT6'

export interface Lookup {
  findPin(name: string): PinDef | undefined
  isGpio(pin: PinDef): boolean
  portOf(name: string): string
  pinIndex(name: string): number
  gpioPortMacro(name: string): string
  gpioPinMacro(name: string): string
  rcuClockMacro(name: string): string
  extiOf(name: string): ExtiEntry | undefined
  afSignalsOf(pinName: string): Map<number, string[]>
}

export interface DeviceData {
  id: string
  device: DevicePackage
  afEntries: AfEntry[]
  extiEntries: ExtiEntry[]
  clockSpec: ClockSpec
  lookup: Lookup
}

function buildLookup(device: DevicePackage, afEntries: AfEntry[], extiEntries: ExtiEntry[]): Lookup {
  const pinMap = new Map<string, PinDef>()
  for (const pin of device.pins) {
    pinMap.set(pin.name.toUpperCase(), pin)
    for (const alias of pin.aliases ?? []) {
      pinMap.set(alias.toUpperCase(), pin)
    }
  }

  const afMap = new Map<string, Map<number, string[]>>()
  for (const entry of afEntries) {
    const byAf = afMap.get(entry.pin) ?? new Map<number, string[]>()
    const list = byAf.get(entry.af) ?? []
    list.push(entry.signal)
    byAf.set(entry.af, list)
    afMap.set(entry.pin, byAf)
  }

  const extiMap = new Map<string, ExtiEntry>()
  for (const entry of extiEntries) {
    extiMap.set(entry.pin, entry)
  }

  return {
    findPin: (name) => pinMap.get(name.trim().toUpperCase()),
    isGpio: (pin) => pin.type === 'IO',
    portOf: (name) => name.charAt(1).toUpperCase(),
    pinIndex: (name) => Number.parseInt(name.slice(2), 10),
    gpioPortMacro: (name) => `GPIO${name.charAt(1).toUpperCase()}`,
    gpioPinMacro: (name) => `GPIO_PIN_${Number.parseInt(name.slice(2), 10)}`,
    rcuClockMacro: (name) => `RCU_GPIO${name.charAt(1).toUpperCase()}`,
    extiOf: (name) => extiMap.get(name.toUpperCase()),
    afSignalsOf: (pinName) => afMap.get(pinName) ?? new Map<number, string[]>(),
  }
}

function buildDevice(
  id: string,
  device: DevicePackage,
  afEntries: AfEntry[],
  extiEntries: ExtiEntry[],
  clockSpec: ClockSpec,
): DeviceData {
  return {
    id,
    device,
    afEntries,
    extiEntries,
    clockSpec,
    lookup: buildLookup(device, afEntries, extiEntries),
  }
}

export const devices: Record<string, DeviceData> = {
  GD32L233RCT6: buildDevice(
    'GD32L233RCT6',
    deviceJson as DevicePackage,
    afJson.entries as AfEntry[],
    extiJson.entries as ExtiEntry[],
    clockJson as ClockSpec,
  ),
  GD32F427VE: buildDevice(
    'GD32F427VE',
    f427DeviceJson as DevicePackage,
    f427AfJson.entries as AfEntry[],
    f427ExtiJson.entries as ExtiEntry[],
    f427ClockJson as ClockSpec,
  ),
}

export const deviceIds = Object.keys(devices)

export function getDeviceData(id: string): DeviceData {
  return devices[id] ?? devices[DEFAULT_DEVICE_ID]
}

export function getClockSpec(id: string): ClockSpec {
  return getDeviceData(id).clockSpec
}
