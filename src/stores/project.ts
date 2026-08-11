import { defineStore } from 'pinia'
import type { Conflict, PinAssignment, PinMode, ProjectConfig } from '../types'
import { device } from '../data/device'
import { checkConflicts } from '../lib/conflicts'

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
    device: device.device,
    packageName: device.package,
    projectName: 'untitled',
    prefix: 'MX_',
    assignments: {} as Record<string, PinAssignment>,
    selectedPin: null as string | null,
    unlocked: [] as string[],
  }),

  getters: {
    conflicts(): Conflict[] {
      return checkConflicts(this.config, device, this.unlocked)
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
        device: this.device as ProjectConfig['device'],
        pins: Object.values(this.assignments),
        naming: { prefix: this.prefix },
      }
    },
  },

  actions: {
    selectPin(name: string | null) {
      this.selectedPin = name
    },
    assign(mode: PinMode, label: string) {
      const pin = this.selectedPin
      if (!pin) return
      const existing = this.assignments[pin]
      const next: PinAssignment = existing
        ? { ...existing, mode, label: label.trim() || undefined }
        : { ...newAssignment(mode, pin), label: label.trim() || undefined }
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
      this.selectedPin = null
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
      this.prefix = config.naming?.prefix || 'MX_'
    },
  },
})
