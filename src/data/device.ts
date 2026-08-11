import type { AfEntry, DevicePackage, ExtiEntry, PinDef } from '../types'
import deviceJson from '../../data/devices/gd32l233rct6/package.json'
import afJson from '../../data/devices/gd32l233rct6/af.json'
import extiJson from '../../data/devices/gd32l233rct6/exti.json'

export const DEVICE_NAME = 'GD32L233RCT6'

export const device: DevicePackage = deviceJson as DevicePackage
export const afEntries: AfEntry[] = afJson.entries as AfEntry[]
export const extiEntries: ExtiEntry[] = extiJson.entries as ExtiEntry[]

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

export function findPin(name: string): PinDef | undefined {
  return pinMap.get(name.trim().toUpperCase())
}

export function isGpio(pin: PinDef): boolean {
  return pin.type === 'IO'
}

export function portOf(name: string): string {
  return name.charAt(1).toUpperCase()
}

export function pinIndex(name: string): number {
  return Number.parseInt(name.slice(2), 10)
}

export function gpioPortMacro(name: string): string {
  return `GPIO${portOf(name)}`
}

export function gpioPinMacro(name: string): string {
  return `GPIO_PIN_${pinIndex(name)}`
}

export function rcuClockMacro(name: string): string {
  return `RCU_GPIO${portOf(name)}`
}

export function extiOf(name: string): ExtiEntry | undefined {
  return extiMap.get(name.toUpperCase())
}

export function afSignalsOf(pinName: string): Map<number, string[]> {
  return afMap.get(pinName) ?? new Map<number, string[]>()
}
