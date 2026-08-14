<script setup lang="ts">
import { computed } from 'vue'
import { useProjectStore } from '../stores/project'

const store = useProjectStore()

interface AdcChannelEntry {
  channel: number
  pin: string
  function: string
  label: string
}

const entries = computed<AdcChannelEntry[]>(() => {
  const list: AdcChannelEntry[] = []
  for (const a of store.config.pins) {
    if (a.mode !== 'ANALOG' || !a.function) continue
    const m = a.function.match(/(?:ADC\d*_)?IN(\d+)$/i)
    if (!m) continue
    const pinDef = store.deviceData.lookup.findPin(a.pin)
    list.push({
      channel: Number(m[1]),
      pin: pinDef?.name.toUpperCase() ?? a.pin.toUpperCase(),
      function: a.function,
      label: a.label ?? '',
    })
  }
  return list.sort((x, y) => x.channel - y.channel)
})
</script>

<template>
  <div class="adc-panel">
    <el-empty
      v-if="entries.length === 0"
      description="尚未配置模拟(Analog)引脚"
      :image-size="48"
    />
    <div v-for="e in entries" :key="e.pin" class="adc-row">
      <span class="ch-chip">IN{{ e.channel }}</span>
      <b class="pin">{{ e.pin }}</b>
      <span class="fn">{{ e.function }}</span>
      <span v-if="e.label" class="label">{{ e.label }}</span>
    </div>
    <div v-if="entries.length" class="hint">
      ADC 通道取自引脚上的模拟功能；F427 的 ADC0/1/2 当前统一映射到 ADC0。
    </div>
  </div>
</template>

<style scoped>
.adc-panel {
  padding: 8px 12px 12px;
  user-select: none;
  -webkit-user-select: none;
}
.adc-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 5px 0;
  font-size: 12.5px;
  color: #374151;
}
.ch-chip {
  width: 52px;
  text-align: center;
  flex-shrink: 0;
  font-weight: 700;
  color: #0f766e;
  background: #f0fdfa;
  border: 1px solid #99f6e4;
  border-radius: 5px;
  padding: 1px 0;
  font-size: 12px;
}
.pin {
  color: #1f2937;
}
.fn {
  color: #6b7280;
  font-size: 11.5px;
}
.label {
  color: #6b7280;
  background: #f3f4f6;
  border-radius: 4px;
  padding: 0 6px;
  font-size: 11px;
}
.hint {
  font-size: 11.5px;
  color: #9ca3af;
  margin-top: 6px;
}
</style>
