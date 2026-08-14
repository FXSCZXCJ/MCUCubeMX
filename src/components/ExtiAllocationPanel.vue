<script setup lang="ts">
import { computed } from 'vue'
import { useProjectStore } from '../stores/project'
import { extiIrqOf, extiLines } from '../lib/allocation'
import { describeAssignment, usePinOverwrite } from '../lib/pinOverwrite'
import type { ExtiEdge } from '../types'

const store = useProjectStore()
const overwrite = usePinOverwrite(store)

const lines = computed(() => extiLines(store.deviceData))

const EDGE_LABELS: Record<ExtiEdge, string> = {
  RISING: '上升沿',
  FALLING: '下降沿',
  BOTH: '双边沿',
}

function holderOf(line: number) {
  const row = lines.value.find((l) => l.line === line)
  if (!row) return undefined
  return row.pins.find((p) => {
    const a = store.assignments[p.name]
    return a?.mode === 'INPUT' && a.params.exti?.enabled
  })
}

function optionHint(pinName: string, holderName: string | undefined): string {
  if (pinName === holderName) return ''
  const a = store.assignments[pinName]
  return a ? `（${describeAssignment(a)}）` : ''
}

function onSelect(line: number, value: string | undefined) {
  if (!value) return
  const holder = holderOf(line)
  if (value === holder?.name) return
  const edge = holder ? store.assignments[holder.name]?.params.exti?.edge ?? 'FALLING' : 'FALLING'
  const changes = [
    {
      pin: value,
      prev: store.assignments[value],
      apply: () =>
        store.setPinAssignment(value, {
          pin: value,
          mode: 'INPUT' as const,
          params: { pull: 'NONE', exti: { enabled: true, edge } },
        }),
    },
  ]
  if (holder && holder.name !== value) {
    changes.push({
      pin: holder.name,
      prev: store.assignments[holder.name],
      apply: () => store.clearPin(holder.name),
    })
  }
  overwrite.commit(`EXTI${line}（${value}）`, changes)
}

function onClear(pinName: string) {
  overwrite.commit(`清除 ${pinName} 的 EXTI 配置`, [
    {
      pin: pinName,
      prev: store.assignments[pinName],
      apply: () => store.clearPin(pinName),
    },
  ], { forceConfirm: true })
}

function onEdgeChange(pinName: string, edge: ExtiEdge) {
  const a = store.assignments[pinName]
  if (!a) return
  store.setPinAssignment(pinName, {
    ...a,
    params: { ...a.params, exti: { ...a.params.exti!, edge } },
  })
}
</script>

<template>
  <div class="exti-panel">
    <div v-if="overwrite.undo.value" class="undo-bar">
      <span>已覆盖：{{ overwrite.undo.value.label }}</span>
      <el-button size="small" type="primary" plain @click="overwrite.rollback()">撤回</el-button>
    </div>
    <template v-for="row in lines" :key="row.line">
      <div v-if="row.line === 0 || row.line === 5 || row.line === 10" class="group-head">
        {{ extiIrqOf(row.line) }} 中断组
      </div>
      <div class="exti-row" :class="{ used: !!holderOf(row.line) }">
        <span class="line-chip" :class="{ used: !!holderOf(row.line) }">EXTI{{ row.line }}</span>
        <el-select
          :model-value="holderOf(row.line)?.name ?? ''"
          size="small"
          placeholder="未分配"
          clearable
          style="width: 150px"
          @update:model-value="(v: string | undefined) => onSelect(row.line, v)"
        >
          <el-option
            v-for="p in row.pins"
            :key="p.name"
            :label="`${p.name}${optionHint(p.name, holderOf(row.line)?.name)}`"
            :value="p.name"
          />
        </el-select>
        <template v-if="holderOf(row.line)">
          <span class="pin-info">
            <b>{{ holderOf(row.line)!.name }}</b>
            <span v-if="store.assignments[holderOf(row.line)!.name]?.label" class="label">
              {{ store.assignments[holderOf(row.line)!.name]?.label }}
            </span>
          </span>
          <el-select
            :model-value="store.assignments[holderOf(row.line)!.name]?.params.exti?.edge ?? 'FALLING'"
            size="small"
            style="width: 92px"
            @update:model-value="(v: ExtiEdge) => onEdgeChange(holderOf(row.line)!.name, v)"
          >
            <el-option v-for="(label, key) in EDGE_LABELS" :key="key" :label="label" :value="key" />
          </el-select>
          <el-button size="small" text type="danger" @click="onClear(holderOf(row.line)!.name)">
            清除
          </el-button>
        </template>
      </div>
    </template>
  </div>
</template>

<style scoped>
.exti-panel {
  padding: 8px 12px 12px;
  user-select: none;
  -webkit-user-select: none;
}
.undo-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  background: #fef3c7;
  border: 1px solid #fde68a;
  border-radius: 6px;
  padding: 4px 8px;
  margin-bottom: 8px;
  font-size: 12px;
  color: #92400e;
}
.group-head {
  font-size: 11.5px;
  font-weight: 700;
  color: #6b7280;
  margin: 8px 0 4px;
  border-top: 1px dashed #e5e7eb;
  padding-top: 6px;
}
.group-head:first-child {
  border-top: none;
  margin-top: 0;
  padding-top: 0;
}
.exti-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 6px;
  border-radius: 6px;
  font-size: 12.5px;
  color: #374151;
}
.exti-row.used {
  background: #f0fdfa;
}
.line-chip {
  width: 62px;
  text-align: center;
  flex-shrink: 0;
  font-weight: 700;
  color: #6b7280;
  background: #f3f4f6;
  border: 1px solid #e5e7eb;
  border-radius: 5px;
  padding: 2px 0;
  font-size: 12px;
}
.line-chip.used {
  color: #0f766e;
  background: #ccfbf1;
  border-color: #5eead4;
}
.pin-info {
  display: flex;
  align-items: center;
  gap: 8px;
}
.label {
  color: #6b7280;
  background: #f3f4f6;
  border-radius: 4px;
  padding: 0 6px;
  font-size: 11px;
}
</style>
