import { defineStore } from 'pinia'
import type { Conflict, PinAssignment, PinGroup, PinMode, ProjectConfig } from '../types'
import { getDeviceData } from '../data/device'
import type { DeviceData } from '../data/device'
import { checkConflicts } from '../lib/conflicts'
import { colorForGroup } from '../lib/groups'

function newAssignment(mode: PinMode, pin: string): PinAssignment {
  return {
    pin,
    mode,
    params: {
      outputType: 'PP',
      speed: '50',
      level: 'HIGH',
      pull: 'NONE',
      exti: { enabled: false, edge: 'FALLING' },
    },
  }
}

export const useProjectStore = defineStore('project', {
  state: () => ({
    deviceId: 'GD32L233RCT6' as string,
    projectName: 'untitled',
    prefix: 'MX_',
    assignments: {} as Record<string, PinAssignment>,
    groups: [] as PinGroup[],
    selectedPin: null as string | null,
    unlocked: [] as string[],
  }),

  getters: {
    conflicts(): Conflict[] {
      return checkConflicts(this.config, this.deviceData, this.unlocked)
    },
    errors(): Conflict[] {
      return this.conflicts.filter((c) => c.severity === 'error')
    },
    warnings(): Conflict[] {
      return this.conflicts.filter((c) => c.severity === 'warning')
    },
    assignedCount(): number {
      return Object.keys(this.assignments).length
    },
    config(): ProjectConfig {
      return {
        version: 1,
        device: this.deviceId,
        pins: Object.values(this.assignments),
        groups: this.groups,
        naming: { prefix: this.prefix },
      }
    },
    deviceData(): DeviceData {
      return getDeviceData(this.deviceId)
    },
  },

  actions: {
    switchDevice(id: string) {
      if (id === this.deviceId || !getDeviceData(id)) return
      this.deviceId = id
      this.clearAll()
    },
    selectPin(name: string | null) {
      this.selectedPin = name
    },
    assign(mode: PinMode, label: string, func?: string) {
      const pin = this.selectedPin
      if (!pin) return
      const existing = this.assignments[pin]
      const fn = func?.trim() || undefined
      const next: PinAssignment = {
        ...(existing ?? newAssignment(mode, pin)),
        mode,
        label: label.trim() || undefined,
        function: fn,
      }
      // 输入/输出模式不携带功能信号
      if (mode === 'INPUT' || mode === 'OUTPUT') delete next.function
      this.assignments = { ...this.assignments, [pin]: next }
    },
    updateParams(patch: Partial<PinAssignment['params']>) {
      const pin = this.selectedPin
      if (!pin || !this.assignments[pin]) return
      const existing = this.assignments[pin]
      this.assignments = {
        ...this.assignments,
        [pin]: { ...existing, params: { ...existing.params, ...patch } },
      }
    },
    clearPin(name: string) {
      const next = { ...this.assignments }
      delete next[name]
      this.assignments = next
      if (this.selectedPin === name) this.selectedPin = null
    },
    clearAll() {
      this.assignments = {}
      this.groups = []
      this.selectedPin = null
    },
    addGroup(name: string) {
      const trimmed = name.trim()
      if (!trimmed || this.groups.some((g) => g.name === trimmed)) return
      this.groups = [
        ...this.groups,
        { name: trimmed, pins: [], color: colorForGroup(this.groups.length) },
      ]
    },
    renameGroup(oldName: string, newName: string) {
      const trimmed = newName.trim()
      if (!trimmed || this.groups.some((g) => g.name === trimmed && g.name !== oldName)) return
      this.groups = this.groups.map((g) => (g.name === oldName ? { ...g, name: trimmed } : g))
    },
    deleteGroup(name: string) {
      this.groups = this.groups.filter((g) => g.name !== name)
    },
    setPinGroup(pin: string, groupName: string | null) {
      // 单归属：先从所有组移除，再加入目标组
      this.groups = this.groups.map((g) => ({
        ...g,
        pins: g.pins.filter((p) => p !== pin),
      }))
      if (!groupName) return
      this.groups = this.groups.map((g) =>
        g.name === groupName ? { ...g, pins: [...g.pins, pin] } : g,
      )
    },
    unlock(name: string) {
      if (!this.unlocked.includes(name)) {
        this.unlocked = [...this.unlocked, name]
      }
    },
    setPrefix(prefix: string) {
      this.prefix = prefix.replace(/[^A-Za-z0-9_]/g, '') || 'MX_'
    },
    loadConfig(config: ProjectConfig) {
      this.assignments = {}
      for (const assignment of config.pins) {
        this.assignments[assignment.pin] = assignment
      }
      this.groups = (config.groups ?? []).map((g, i) => ({
        name: g.name,
        pins: g.pins,
        color: g.color ?? colorForGroup(i),
      }))
      this.prefix = config.naming?.prefix || 'MX_'
    },
    /** 应用嘉立创导入结果：必要时切换器件并整体替换引脚配置 */
    applyImport(deviceId: string, assignments: PinAssignment[]) {
      if (deviceId !== this.deviceId && getDeviceData(deviceId)) {
        this.deviceId = deviceId
      }
      const next: Record<string, PinAssignment> = {}
      for (const assignment of assignments) {
        next[assignment.pin] = assignment
      }
      this.assignments = next
      this.selectedPin = null
    },
  },
})
