import * as ejs from 'ejs'
import JSZip from 'jszip'
import type { GeneratedFile, PinAssignment, PinDef, ProjectConfig } from '../../types'
import type { DeviceData } from '../../data/device'
import { APP_IT_C_TEMPLATE, GPIO_C_TEMPLATE, GPIO_H_TEMPLATE, README_TEMPLATE } from './templates'

export function sanitizeLabel(label: string): string {
  const s = label
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
  return s || 'PIN'
}

export function groupOf(label: string | undefined): string {
  if (!label) return 'UNLABELED'
  const first = sanitizeLabel(label.split('_')[0] ?? '')
  return first || 'UNLABELED'
}

const EDGE_MACROS: Record<string, string> = {
  RISING: 'RISING',
  FALLING: 'FALLING',
  BOTH: 'BOTH',
}

interface PreparedPin {
  assignment: PinAssignment
  pinDef: PinDef
  label: string
}

interface OutPin {
  label: string
  pinName: string
  port: string
  pin: number
}

interface ExtiOutPin extends OutPin {
  line: number
  edge: string
}

interface AfOutPin extends OutPin {
  af: number
  func: string
}

interface AnalogOutPin extends OutPin {
  func: string
}

function prepare(config: ProjectConfig, deviceData: DeviceData): {
  prepared: PreparedPin[]
  outputPins: OutPin[]
  inputPins: OutPin[]
  afPins: AfOutPin[]
  analogPins: AnalogOutPin[]
  extiPins: ExtiOutPin[]
  irqs: string[]
} {
  const prepared: PreparedPin[] = []
  for (const assignment of config.pins) {
    const pinDef = deviceData.lookup.findPin(assignment.pin)
    if (!pinDef) continue
    prepared.push({
      assignment,
      pinDef,
      label: sanitizeLabel(assignment.label || pinDef.name),
    })
  }

  const outputPins: OutPin[] = prepared
    .filter((p) => p.assignment.mode === 'OUTPUT')
    .sort((a, b) => a.pinDef.number - b.pinDef.number)
    .map((p) => ({
      label: p.label,
      pinName: p.pinDef.name,
      port: deviceData.lookup.portOf(p.pinDef.name),
      pin: deviceData.lookup.pinIndex(p.pinDef.name),
      otype: p.assignment.params.outputType === 'OD' ? 'OD' : 'PP',
      speed: p.assignment.params.speed ?? '50',
      level: p.assignment.params.level ?? 'HIGH',
      pull: p.assignment.params.pull ?? 'NONE',
    }))

  const inputPins: OutPin[] = prepared
    .filter((p) => p.assignment.mode === 'INPUT')
    .sort((a, b) => a.pinDef.number - b.pinDef.number)
    .map((p) => ({
      label: p.label,
      pinName: p.pinDef.name,
      port: deviceData.lookup.portOf(p.pinDef.name),
      pin: deviceData.lookup.pinIndex(p.pinDef.name),
      pull: p.assignment.params.pull ?? 'NONE',
    }))

  const afPins: AfOutPin[] = prepared
    .filter((p) => p.assignment.mode === 'AF' && p.assignment.function)
    .sort((a, b) => a.pinDef.number - b.pinDef.number)
    .flatMap((p) => {
      const afMap = deviceData.lookup.afSignalsOf(p.pinDef.name)
      let af: number | undefined
      for (const [n, signals] of afMap) {
        if (signals.includes(p.assignment.function!)) {
          af = n
          break
        }
      }
      if (af === undefined) return []
      return [
        {
          label: p.label,
          pinName: p.pinDef.name,
          port: deviceData.lookup.portOf(p.pinDef.name),
          pin: deviceData.lookup.pinIndex(p.pinDef.name),
          af,
          func: p.assignment.function!,
        },
      ]
    })

  const analogPins: AnalogOutPin[] = prepared
    .filter((p) => p.assignment.mode === 'ANALOG' && p.assignment.function)
    .sort((a, b) => a.pinDef.number - b.pinDef.number)
    .map((p) => ({
      label: p.label,
      pinName: p.pinDef.name,
      port: deviceData.lookup.portOf(p.pinDef.name),
      pin: deviceData.lookup.pinIndex(p.pinDef.name),
      func: p.assignment.function!,
    }))

  const extiPins: ExtiOutPin[] = prepared
    .filter((p) => p.assignment.mode === 'INPUT' && p.assignment.params.exti?.enabled)
    .sort((a, b) => a.pinDef.number - b.pinDef.number)
    .map((p) => ({
      label: p.label,
      pinName: p.pinDef.name,
      port: deviceData.lookup.portOf(p.pinDef.name),
      pin: deviceData.lookup.pinIndex(p.pinDef.name),
      line: deviceData.lookup.pinIndex(p.pinDef.name),
      edge: EDGE_MACROS[p.assignment.params.exti!.edge] ?? 'RISING',
    }))

  const irqSet = new Set<string>()
  for (const p of extiPins) {
    const line = p.line
    const irq = line <= 4 ? `EXTI${line}` : line <= 9 ? 'EXTI5_9' : 'EXTI10_15'
    irqSet.add(irq)
  }
  const irqs = [...irqSet].sort()

  return { prepared, outputPins, inputPins, afPins, analogPins, extiPins, irqs }
}

export function generateProject(config: ProjectConfig, deviceData: DeviceData): GeneratedFile[] {
  const prefix = config.naming.prefix || 'MX_'
  const { prepared, outputPins, inputPins, afPins, analogPins, extiPins, irqs } = prepare(
    config,
    deviceData,
  )
  const hasExti = extiPins.length > 0
  const fw = deviceData.device.firmware

  const groupMap = new Map<string, { label: string; macroPin: string; macroPort: string }[]>()
  for (const p of prepared) {
    const group = groupOf(p.assignment.label)
    const list = groupMap.get(group) ?? []
    list.push({
      label: p.label,
      macroPin: deviceData.lookup.gpioPinMacro(p.pinDef.name),
      macroPort: deviceData.lookup.gpioPortMacro(p.pinDef.name),
    })
    groupMap.set(group, list)
  }
  const groups = [...groupMap.entries()].map(([name, pins]) => ({ name, pins }))

  const ports = new Set<string>()
  for (const p of prepared) ports.add(deviceData.lookup.portOf(p.pinDef.name))
  const portList = [...ports].sort()

  const handlers = irqs.map((irq) => ({
    irq,
    lines: extiPins
      .map((p) => p.line)
      .filter((line) => (irq === 'EXTI10_15' ? line >= 10 : irq === 'EXTI5_9' ? line >= 5 : line === Number(irq.slice(4))))
      .sort((a, b) => a - b),
  }))

  const base = {
    device: config.device,
    prefix,
    hasExti,
    includeHeader: fw.header,
    nvicGroup: fw.nvic.group,
    prigroupMacro: fw.nvic.groupMacro ?? '',
  }
  const files: GeneratedFile[] = [
    {
      path: 'gpio.h',
      content: render(GPIO_H_TEMPLATE, { ...base, groups }),
    },
    {
      path: 'gpio.c',
      content: render(GPIO_C_TEMPLATE, {
        ...base,
        ports: portList,
        outputPins,
        inputPins,
        afPins,
        analogPins,
        extiPins: extiPins.map((p) => ({ ...p, edge: `${fw.extiEdgePrefix}${p.edge}` })),
        irqs,
      }),
    },
    {
      path: 'project.json',
      content: JSON.stringify(config, null, 2) + '\n',
    },
    {
      path: 'README.md',
      content: render(README_TEMPLATE, {
        device: config.device,
        date: new Date().toISOString(),
        config,
      }),
    },
  ]

  if (hasExti) {
    files.splice(2, 0, {
      path: 'app_it.c',
      content: render(APP_IT_C_TEMPLATE, { includeHeader: fw.header, handlers }),
    })
  }
  return files
}

function render(template: string, data: object): string {
  const compiled = ejs.compile(template, { client: true })
  return compiled(data) as string
}

export async function exportZip(config: ProjectConfig, deviceData: DeviceData): Promise<Blob> {
  const zip = new JSZip()
  for (const file of generateProject(config, deviceData)) {
    zip.file(file.path, file.content)
  }
  return zip.generateAsync({ type: 'blob' })
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
