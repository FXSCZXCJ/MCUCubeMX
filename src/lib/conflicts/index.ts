import type { Conflict, PinAssignment, ProjectConfig } from '../../types'
import type { DeviceData } from '../../data/device'
import { derivePeripheralState } from '../peripherals'

const BLOCKED_SPECIALS = ['nrst', 'boot', 'swd']

export function checkConflicts(
  config: ProjectConfig,
  deviceData: DeviceData,
  unlocked: string[] = [],
): Conflict[] {
  const conflicts: Conflict[] = []
  const { lookup } = deviceData
  const unlockedSet = new Set(unlocked.map((n) => n.toUpperCase()))
  const seen = new Map<string, number>()
  const extiByLine = new Map<number, PinAssignment[]>()
  const labelMap = new Map<string, string[]>()

  for (const assignment of config.pins) {
    const pin = lookup.findPin(assignment.pin)
    if (!pin) {
      conflicts.push({
        severity: 'error',
        code: 'UNKNOWN_PIN',
        message: `未知引脚: ${assignment.pin}`,
        pins: [assignment.pin],
      })
      continue
    }
    const name = pin.name.toUpperCase()

    if (seen.has(name)) {
      conflicts.push({
        severity: 'error',
        code: 'DUPLICATE_PIN',
        message: `引脚 ${name} 被重复分配`,
        pins: [name],
      })
    }
    seen.set(name, (seen.get(name) ?? 0) + 1)

    if (!lookup.isGpio(pin)) {
      conflicts.push({
        severity: 'error',
        code: 'PIN_NOT_CONFIGURABLE',
        message: `${name} 是${pin.type === 'POWER' ? '电源' : pin.type === 'NC' ? '空' : '特殊'}引脚，不能配置为 GPIO`,
        pins: [name],
      })
      continue
    }

    if (pin.special && BLOCKED_SPECIALS.includes(pin.special) && !unlockedSet.has(name)) {
      conflicts.push({
        severity: 'error',
        code: 'SPECIAL_PIN_LOCKED',
        message: `${name} 是特殊引脚（${pin.special.toUpperCase()}），默认禁止配置，可在配置面板中显式解锁`,
        pins: [name],
      })
    }
    if (pin.special === 'osc') {
      conflicts.push({
        severity: 'warning',
        code: 'SPECIAL_PIN_OSC',
        message: `${name} 默认用于晶振（OSCIN/OSCOUT），作为 GPIO 使用前请确认 HXTAL 未启用`,
        pins: [name],
      })
    }

    if (assignment.label) {
      const labels = labelMap.get(assignment.label) ?? []
      labels.push(name)
      labelMap.set(assignment.label, labels)
    }

    const exti = assignment.params.exti
    if (assignment.mode === 'INPUT' && exti?.enabled) {
      const line = lookup.pinIndex(name)
      const list = extiByLine.get(line) ?? []
      list.push(assignment)
      extiByLine.set(line, list)
    } else if (assignment.mode !== 'INPUT' && exti?.enabled) {
      conflicts.push({
        severity: 'warning',
        code: 'EXTI_ON_NON_INPUT',
        message: `${name} 不是输入模式，EXTI 配置将被忽略`,
        pins: [name],
      })
    }
  }

  for (const [line, list] of extiByLine) {
    if (list.length > 1) {
      const pins = list.map((a) => a.pin.toUpperCase())
      conflicts.push({
        severity: 'error',
        code: 'EXTI_LINE_CONFLICT',
        message: `${pins.join(' / ')} 共用 EXTI${line} 中断线，同一时刻只能启用一个`,
        pins,
      })
    }
  }

  for (const [label, pins] of labelMap) {
    if (pins.length > 1) {
      conflicts.push({
        severity: 'warning',
        code: 'DUPLICATE_LABEL',
        message: `标签 "${label}" 被多个引脚使用（${pins.join(' / ')}），生成的宏名会冲突`,
        pins,
      })
    }
  }

  // AF / 模拟信号互斥：同一信号只能分配到一个引脚
  const afBySignal = new Map<string, string[]>()
  const analogBySignal = new Map<string, string[]>()
  for (const assignment of config.pins) {
    if (!assignment.function) continue
    if (assignment.mode === 'AF') {
      const list = afBySignal.get(assignment.function) ?? []
      list.push(assignment.pin.toUpperCase())
      afBySignal.set(assignment.function, list)
    } else if (assignment.mode === 'ANALOG') {
      const list = analogBySignal.get(assignment.function) ?? []
      list.push(assignment.pin.toUpperCase())
      analogBySignal.set(assignment.function, list)
    }
  }
  for (const [signal, pins] of afBySignal) {
    if (pins.length > 1) {
      conflicts.push({
        severity: 'error',
        code: 'AF_SIGNAL_DUPLICATE',
        message: `${pins.join(' / ')} 重复使用 AF 信号 ${signal}（外设信号需互斥）`,
        pins,
      })
    }
  }
  for (const [signal, pins] of analogBySignal) {
    if (pins.length > 1) {
      conflicts.push({
        severity: 'error',
        code: 'ANALOG_DUPLICATE',
        message: `${pins.join(' / ')} 重复使用模拟通道 ${signal}（同一模拟通道只能分配一次）`,
        pins,
      })
    }
  }

  // 外设实例完整性（USART TX/RX 配对、时钟源合法性）
  const periph = derivePeripheralState(config, deviceData)
  for (const u of periph.usart) {
    if (!u.inUse) continue
    if (u.txPin && !u.rxPin) {
      conflicts.push({
        severity: 'warning',
        code: 'USART_RX_MISSING',
        message: `${u.id} 仅配置了 TX（${u.txPin}），未配置 RX；若只发送可忽略此警告`,
        pins: [u.txPin],
      })
    }
    if (u.rxPin && !u.txPin) {
      conflicts.push({
        severity: 'warning',
        code: 'USART_TX_MISSING',
        message: `${u.id} 仅配置了 RX（${u.rxPin}），未配置 TX；若只接收可忽略此警告`,
        pins: [u.rxPin],
      })
    }
    const storedSource = config.peripherals?.[u.id]?.params?.clockSource
    if (
      u.spec.clockSourceApi &&
      typeof storedSource === 'string' &&
      !u.spec.clockSources.some((c) => c.key === storedSource)
    ) {
      conflicts.push({
        severity: 'error',
        code: 'PERIPHERAL_CLOCK_INVALID',
        message: `${u.id} 时钟源 ${storedSource} 不受该器件支持`,
        pins: u.signals.map((s) => s.pin),
      })
    }
  }

  return conflicts
}

export function portsInUse(config: ProjectConfig): string[] {
  const ports = new Set<string>()
  for (const assignment of config.pins) {
    ports.add(assignment.pin.charAt(1).toUpperCase())
  }
  return [...ports].sort()
}
