import * as ejs from 'ejs'
import JSZip from 'jszip'
import type {
  ClockConfig,
  ClockSpec,
  GeneratedFile,
  PinAssignment,
  PinDef,
  ProjectConfig,
} from '../../types'
import type { DeviceData } from '../../data/device'
import { mergeClockConfig, validateClock } from '../clock'
import { derivePeripheralState, peripheralConfig } from '../peripherals'
import {
  ADC_C_TEMPLATE,
  ADC_H_TEMPLATE,
  APP_IT_C_TEMPLATE,
  CLOCK_C_TEMPLATE,
  CLOCK_H_TEMPLATE,
  GPIO_C_TEMPLATE,
  GPIO_H_TEMPLATE,
  README_TEMPLATE,
  USART_C_TEMPLATE,
  USART_H_TEMPLATE,
} from './templates'

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

interface ClockContext {
  device: string
  includeHeader: string
  systemBase: string
  prefix: string
  oscOnMacro: string
  usePll: boolean
  pllOscMacro: string
  pllCall: string
  pllComment: string
  ahbMacro: string
  apb1Macro: string
  apb2Macro: string
  adcApi: string | null
  adcArg: string | null
  adcInclude: string | null
  sysclkSourceMacro: string
  nvicPriorityGroupMacro: string | null
  highDrive: boolean
  highDriveMhz: number
  sysclkMhz: number
  ahbMhz: number
  apb1Mhz: number
  apb2Mhz: number
  adcMhz: number
  rtcCall: string | null
  usbCalls: string[]
}

interface UsartOut {
  id: string
  periphMacro: string
  clockEnable: string
  baudrate: number
  wordLength: string
  stopBits: string
  parity: string
  flowRts: string
  flowCts: string
  txConfig: string
  rxConfig: string
  clockSourceCall: string | null
  clockSourceLabel: string
  pinsText: string
}

interface AdcChannelOut {
  rank: number
  channelMacro: string
}

interface AdcOut {
  id: string
  clockEnable: string
  argMulti: string
  argSingle: string
  resolution: string
  dataAlignment: string
  groupMacro: string
  channelFunction: string
  channelCount: number
  channels: AdcChannelOut[]
  sampleTime: string
  triggerMacro: string
  triggerEnabled: boolean
  scanMode: boolean
  channelsText: string
}

function fillMacro(tpl: string, token: string, value: number | string): string {
  return tpl.replace(new RegExp(`<${token}>`, 'g'), String(value))
}

function buildClockContext(config: ProjectConfig, deviceData: DeviceData): ClockContext {
  const spec: ClockSpec = deviceData.clockSpec
  const clock: ClockConfig = mergeClockConfig(spec, config.clock)
  const validation = validateClock(spec, clock)
  const chain = validation.chain
  const usePll = clock.source === 'PLL'
  const fw = deviceData.device.firmware

  let pllCall = ''
  let pllComment = ''
  if (usePll) {
    const api = spec.codegen.pllApi
    const args = api.args.map((a) => {
      if (a === 'src') return spec.codegen.pllSrc[clock.pllSource]
      const v = clock.pll[a]
      if (a === 'mul' && api.mulMacro) return fillMacro(api.mulMacro, 'mul', v)
      return String(v)
    })
    pllCall = `${api.name}(${args.join(', ')})`
    const srcLabel = spec.sources.find((s) => s.id === clock.pllSource)?.label ?? clock.pllSource
    const mul = clock.pll.mul
    pllComment =
      chain.vcoMhz !== null
        ? `${srcLabel} ${round(chain.pllInMhz)}MHz → VCO ${round(chain.vcoMhz)}MHz → ${round(chain.pllOutMhz)}MHz`
        : `${srcLabel} × ${mul} = ${round(chain.pllOutMhz)}MHz`
  }

  const adcCodegen = spec.adc.codegen
  const highDriveMhz = spec.codegen.highDriveMhz ?? 0
  // 需要先使能并等待的振荡器：PLL 作为系统源时为其输入源，否则为系统源本身
  const oscOnMacro = usePll
    ? spec.codegen.oscEnum[clock.pllSource]
    : spec.codegen.oscEnum[clock.source]
  // RTC / USB 48MHz 时钟源（仅在显式配置时生成）
  let rtcCall: string | null = null
  if (clock.rtcSource) {
    const src = spec.lowPower?.rtc.sources.find((s) => s.key === clock.rtcSource)
    if (src) rtcCall = `rcu_rtc_clock_config(${src.macro})`
  }
  const usbCalls: string[] = []
  if (clock.usbSource) {
    const src = spec.usb48?.sources.find((s) => s.key === clock.usbSource)
    if (src) {
      if (src.extraApi && src.extraMacro) usbCalls.push(`${src.extraApi}(${src.extraMacro})`)
      usbCalls.push(`${src.api}(${src.macro})`)
    }
  }

  return {
    device: config.device,
    includeHeader: fw.header,
    systemBase: fw.header.replace(/\.h$/, ''),
    prefix: config.naming.prefix || 'MX_',
    oscOnMacro,
    usePll,
    pllOscMacro: spec.codegen.oscEnum.PLL,
    pllCall,
    pllComment,
    ahbMacro: fillMacro(spec.codegen.prescaler.ahb, 'div', clock.ahb),
    apb1Macro: fillMacro(spec.codegen.prescaler.apb1, 'div', clock.apb1),
    apb2Macro: fillMacro(spec.codegen.prescaler.apb2, 'div', clock.apb2),
    adcApi: adcCodegen?.api ?? null,
    adcArg: adcCodegen ? fillMacro(adcCodegen.argMacro, 'id', clock.adc) : null,
    adcInclude: adcCodegen?.include ?? null,
    sysclkSourceMacro: spec.codegen.sysclkSource[clock.source],
    nvicPriorityGroupMacro: spec.codegen.nvicPriorityGroupMacro ?? null,
    highDrive: highDriveMhz > 0 && chain.sysclkMhz > highDriveMhz,
    highDriveMhz,
    sysclkMhz: round(chain.sysclkMhz),
    ahbMhz: round(chain.ahbMhz),
    apb1Mhz: round(chain.apb1Mhz),
    apb2Mhz: round(chain.apb2Mhz),
    adcMhz: round(chain.adcMhz),
    rtcCall,
    usbCalls,
  }
}

function round(v: number | null): number {
  return Math.round((v ?? 0) * 1000) / 1000
}

function buildUsartOut(config: ProjectConfig, deviceData: DeviceData): UsartOut[] {
  const derived = derivePeripheralState(config, deviceData)
  const out: UsartOut[] = []
  for (const u of derived.usart) {
    if (!u.inUse) continue
    const cfg = peripheralConfig(deviceData, u.id, config.peripherals)
    if (!cfg?.enabled) continue
    const p = cfg.params
    const fc = String(p.flowControl ?? 'NONE')
    const flowRts = fc === 'RTS' || fc === 'RTS_CTS' ? 'USART_RTS_ENABLE' : 'USART_RTS_DISABLE'
    const flowCts = fc === 'CTS' || fc === 'RTS_CTS' ? 'USART_CTS_ENABLE' : 'USART_CTS_DISABLE'
    let clockSourceCall: string | null = null
    let clockSourceLabel = ''
    if (u.spec.clockSourceApi) {
      const src = String(p.clockSource ?? u.spec.defaultClockSource)
      const cs = u.spec.clockSources.find((c) => c.key === src)
      if (cs) {
        clockSourceCall = `${u.spec.clockSourceApi}(${u.spec.clockSourceIdx}, ${cs.macro})`
        clockSourceLabel = cs.label
      }
    }
    out.push({
      id: u.id,
      periphMacro: u.spec.periphMacro,
      clockEnable: u.spec.clockEnable,
      baudrate: Number(p.baudrate ?? 115200),
      wordLength: String(p.wordLength ?? 'USART_WL_8BIT'),
      stopBits: String(p.stopBits ?? 'USART_STB_1BIT'),
      parity: String(p.parity ?? 'USART_PM_NONE'),
      flowRts,
      flowCts,
      txConfig: u.txPin ? 'USART_TRANSMIT_ENABLE' : 'USART_TRANSMIT_DISABLE',
      rxConfig: u.rxPin ? 'USART_RECEIVE_ENABLE' : 'USART_RECEIVE_DISABLE',
      clockSourceCall,
      clockSourceLabel,
      pinsText: u.signals.map((s) => `${s.signal}(${s.pin})`).join(', '),
    })
  }
  return out
}

function buildAdcOut(config: ProjectConfig, deviceData: DeviceData): AdcOut[] {
  const derived = derivePeripheralState(config, deviceData)
  const out: AdcOut[] = []
  for (const a of derived.adc) {
    if (!a.inUse) continue
    const cfg = peripheralConfig(deviceData, a.id, config.peripherals)
    if (!cfg?.enabled) continue
    const p = cfg.params
    const spec = a.spec
    const triggerMacro = String(p.externalTrigger ?? spec.defaults.externalTrigger)
    out.push({
      id: a.id,
      clockEnable: spec.clockEnable,
      argMulti: spec.periphArg ? `${spec.periphArg}, ` : '',
      argSingle: spec.periphArg ?? '',
      resolution: String(p.resolution ?? spec.defaults.resolution),
      dataAlignment: String(p.dataAlignment ?? spec.defaults.dataAlignment),
      groupMacro: spec.groupMacro,
      channelFunction: spec.channelFunction,
      channelCount: a.channels.length,
      channels: a.channels.map((ch, i) => ({
        rank: i + 1,
        channelMacro: `ADC_CHANNEL_${ch.channel}`,
      })),
      sampleTime: String(p.sampleTime ?? spec.defaults.sampleTime),
      triggerMacro,
      triggerEnabled: !triggerMacro.endsWith('_NONE'),
      scanMode: a.channels.length > 1,
      channelsText: a.channels.map((ch) => `IN${ch.channel}(${ch.pin})`).join(', '),
    })
  }
  return out
}

/** 生成 main.c 需要调用的外设初始化函数名 */
export function peripheralInitCalls(config: ProjectConfig, deviceData: DeviceData): string[] {
  const prefix = config.naming.prefix || 'MX_'
  const derived = derivePeripheralState(config, deviceData)
  const calls: string[] = []
  for (const u of derived.usart) {
    if (u.inUse && peripheralConfig(deviceData, u.id, config.peripherals)?.enabled) {
      calls.push(`${prefix}${u.id}_Init();`)
    }
  }
  for (const a of derived.adc) {
    if (a.inUse && peripheralConfig(deviceData, a.id, config.peripherals)?.enabled) {
      calls.push(`${prefix}${a.id}_Init();`)
    }
  }
  return calls
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
  const clockCtx = buildClockContext(config, deviceData)
  const usartOut = buildUsartOut(config, deviceData)
  const adcOut = buildAdcOut(config, deviceData)
  const hasUsart = usartOut.length > 0
  const hasAdc = adcOut.length > 0

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
      path: 'clock.h',
      content: render(CLOCK_H_TEMPLATE, {
        device: config.device,
        includeHeader: fw.header,
        prefix,
      }),
    },
    {
      path: 'clock.c',
      content: render(CLOCK_C_TEMPLATE, clockCtx),
    },
    ...(hasUsart
      ? [
          {
            path: 'usart.h',
            content: render(USART_H_TEMPLATE, { device: config.device, includeHeader: fw.header, prefix, usarts: usartOut }),
          },
          {
            path: 'usart.c',
            content: render(USART_C_TEMPLATE, { device: config.device, prefix, usarts: usartOut }),
          },
        ]
      : []),
    ...(hasAdc
      ? [
          {
            path: 'adc.h',
            content: render(ADC_H_TEMPLATE, { device: config.device, includeHeader: fw.header, prefix, adcs: adcOut }),
          },
          {
            path: 'adc.c',
            content: render(ADC_C_TEMPLATE, { device: config.device, prefix, adcs: adcOut }),
          },
        ]
      : []),
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
        hasUsart,
        hasAdc,
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
