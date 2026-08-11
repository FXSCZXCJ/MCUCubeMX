import { describe, expect, it } from 'vitest'
import { checkConflicts } from '../src/lib/conflicts'
import { device } from '../src/data/device'
import type { ProjectConfig } from '../src/types'

function config(pins: ProjectConfig['pins']): ProjectConfig {
  return { version: 1, device: 'GD32L233RCT6', pins, naming: { prefix: 'MX_' } }
}

const base = (pin: string, mode: 'INPUT' | 'OUTPUT' = 'INPUT') => ({
  pin,
  mode,
  params: { pull: 'NONE' as const, exti: { enabled: false, edge: 'FALLING' as const } },
})

describe('冲突检查', () => {
  it('同一引脚重复分配报错', () => {
    const conflicts = checkConflicts(config([base('PA5'), base('PA5')]), device)
    expect(conflicts.some((c) => c.code === 'DUPLICATE_PIN' && c.severity === 'error')).toBe(true)
  })

  it('特殊引脚默认锁定，解锁后放行', () => {
    const locked = checkConflicts(config([{ ...base('PB2'), mode: 'OUTPUT' }]), device)
    expect(locked.some((c) => c.code === 'SPECIAL_PIN_LOCKED')).toBe(true)
    const unlocked = checkConflicts(config([{ ...base('PB2'), mode: 'OUTPUT' }]), device, ['PB2'])
    expect(unlocked.some((c) => c.code === 'SPECIAL_PIN_LOCKED')).toBe(false)
  })

  it('晶振引脚作为 GPIO 给出警告', () => {
    const conflicts = checkConflicts(config([base('PF0')]), device)
    expect(conflicts.some((c) => c.code === 'SPECIAL_PIN_OSC' && c.severity === 'warning')).toBe(true)
  })

  it('PA0 与 PB0 同用 EXTI0 报错', () => {
    const pins = [base('PA0'), base('PB0')].map((p) => ({
      ...p,
      params: { pull: 'NONE' as const, exti: { enabled: true, edge: 'FALLING' as const } },
    }))
    const conflicts = checkConflicts(config(pins), device)
    expect(conflicts.some((c) => c.code === 'EXTI_LINE_CONFLICT')).toBe(true)
  })

  it('不同 EXTI 线不冲突', () => {
    const pins = [base('PA0'), base('PA1')].map((p) => ({
      ...p,
      params: { pull: 'NONE' as const, exti: { enabled: true, edge: 'FALLING' as const } },
    }))
    const conflicts = checkConflicts(config(pins), device)
    expect(conflicts.some((c) => c.code === 'EXTI_LINE_CONFLICT')).toBe(false)
  })

  it('电源引脚不可配置', () => {
    const conflicts = checkConflicts(config([base('VDD')]), device)
    expect(conflicts.some((c) => c.code === 'PIN_NOT_CONFIGURABLE')).toBe(true)
  })

  it('重复标签给出警告', () => {
    const conflicts = checkConflicts(
      config([
        { ...base('PA5'), mode: 'OUTPUT', label: 'LED_R' },
        { ...base('PA6'), mode: 'OUTPUT', label: 'LED_R' },
      ]),
      device,
    )
    expect(conflicts.some((c) => c.code === 'DUPLICATE_LABEL')).toBe(true)
  })
})
