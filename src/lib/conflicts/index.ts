import type { Conflict, PinAssignment, ProjectConfig } from '../../types'
import type { DeviceData } from '../../data/device'

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
    } else if (assignment.mode === 'OUTPUT' && exti?.enabled) {
      conflicts.push({
        severity: 'warning',
        code: 'EXTI_ON_OUTPUT',
        message: `${name} 是输出模式，EXTI 配置将被忽略`,
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

  return conflicts
}

export function portsInUse(config: ProjectConfig): string[] {
  const ports = new Set<string>()
  for (const assignment of config.pins) {
    ports.add(assignment.pin.charAt(1).toUpperCase())
  }
  return [...ports].sort()
}
