<script setup lang="ts">
import { computed } from 'vue'
import { useProjectStore } from '../stores/project'
import { adcChannelOf, adcChannels, adcFunctionOf } from '../lib/allocation'
import { describeAssignment, usePinOverwrite } from '../lib/pinOverwrite'

const store = useProjectStore()
const overwrite = usePinOverwrite(store)

const channels = computed(() => adcChannels(store.deviceData))
const adcInternal = computed(() => store.deviceData.peripheralSpec.adcInternal ?? [])

function holderOf(channel: number) {
  const row = channels.value.find((c) => c.channel === channel)
  if (!row) return undefined
  return row.pins.find((p) => {
    const a = store.assignments[p.name]
    return a?.mode === 'ANALOG' && !!a.function && adcChannelOf(a.function) === channel
  })
}

function optionHint(pinName: string, holderName: string | undefined): string {
  if (pinName === holderName) return ''
  const a = store.assignments[pinName]
  return a ? `（${describeAssignment(a)}）` : ''
}

function onSelect(channel: number, value: string | undefined) {
  if (!value) return
  const holder = holderOf(channel)
  if (value === holder?.name) return
  const pinDef = store.deviceData.lookup.findPin(value)
  if (!pinDef) return
  const func = adcFunctionOf(pinDef, channel)
  if (!func) return
  const changes = [
    {
      pin: value,
      prev: store.assignments[value],
      apply: () =>
        store.setPinAssignment(value, {
          pin: value,
          mode: 'ANALOG' as const,
          function: func,
          params: {},
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
  overwrite.commit(`ADC_IN${channel}（${value}）`, changes)
}

function onClear(pinName: string) {
  overwrite.commit(`清除 ${pinName} 的 ADC 配置`, [
    {
      pin: pinName,
      prev: store.assignments[pinName],
      apply: () => store.clearPin(pinName),
    },
  ], { forceConfirm: true })
}
</script>

<template>
  <div class="adc-panel">
    <div v-if="overwrite.undo.value" class="undo-bar">
      <span>已覆盖：{{ overwrite.undo.value.label }}</span>
      <el-button size="small" type="primary" plain @click="overwrite.rollback()">撤回</el-button>
    </div>
    <div v-for="row in channels" :key="row.channel" class="adc-row" :class="{ used: !!holderOf(row.channel) }">
      <span class="ch-chip" :class="{ used: !!holderOf(row.channel) }">ADC_IN{{ row.channel }}</span>
      <el-select
        :model-value="holderOf(row.channel)?.name ?? ''"
        size="small"
        placeholder="未分配"
        clearable
        style="width: 150px"
        @update:model-value="(v: string | undefined) => onSelect(row.channel, v)"
      >
        <el-option
          v-for="p in row.pins"
          :key="p.name"
          :label="`${p.name}${optionHint(p.name, holderOf(row.channel)?.name)}`"
          :value="p.name"
        />
      </el-select>
      <span v-if="holderOf(row.channel)" class="pin-info">
        <b>{{ holderOf(row.channel)!.name }}</b>
        <span v-if="store.assignments[holderOf(row.channel)!.name]?.label" class="label">
          {{ store.assignments[holderOf(row.channel)!.name]?.label }}
        </span>
        <el-button size="small" text type="danger" @click="onClear(holderOf(row.channel)!.name)">
          清除
        </el-button>
      </span>
    </div>

    <div v-if="adcInternal.length" class="group-head">内部通道（仅显示）</div>
    <div v-for="ch in adcInternal" :key="ch.channel" class="adc-row internal">
      <span class="ch-chip internal">ADC_IN{{ ch.channel }}</span>
      <span class="pin">{{ ch.label }}</span>
      <span class="fn">{{ ch.note }}</span>
      <el-tag size="small" type="info" effect="plain">内部</el-tag>
    </div>
  </div>
</template>

<style scoped>
.adc-panel {
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
  margin: 10px 0 4px;
  border-top: 1px dashed #e5e7eb;
  padding-top: 6px;
}
.adc-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 5px 6px;
  border-radius: 6px;
  font-size: 12.5px;
  color: #374151;
}
.adc-row.used {
  background: #f0fdfa;
}
.adc-row.internal {
  opacity: 0.9;
}
.ch-chip {
  width: 86px;
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
.ch-chip.used {
  color: #0f766e;
  background: #ccfbf1;
  border-color: #5eead4;
}
.ch-chip.internal {
  color: #7c3aed;
  background: #f5f3ff;
  border-color: #ddd6fe;
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
