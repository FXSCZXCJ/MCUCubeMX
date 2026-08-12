<script setup lang="ts">
import { computed } from 'vue'
import { useProjectStore } from '../stores/project'
import {
  derivePeripheralState,
  peripheralConfig,
  USART_BAUD_RATES,
  USART_FLOW_CONTROLS,
  USART_PARITIES,
  USART_STOP_BITS,
  USART_WORD_LENGTHS,
} from '../lib/peripherals'

const store = useProjectStore()
const derived = computed(() => derivePeripheralState(store.config, store.deviceData))
const usartInUse = computed(() => derived.value.usart.filter((u) => u.inUse))
const adcInUse = computed(() => derived.value.adc.filter((a) => a.inUse))

function cfgOf(id: string) {
  return peripheralConfig(store.deviceData, id, store.peripherals)!
}

function setParam(id: string, key: string, value: string | number | boolean) {
  store.setPeripheral(id, { params: { [key]: value } })
}

function setEnabled(id: string, enabled: boolean) {
  store.setPeripheral(id, { enabled })
}

function clockSourceLabel(id: string, key: string): string {
  const us = store.deviceData.peripheralSpec.usart.find((u) => u.id === id)
  return us?.clockSources.find((c) => c.key === key)?.label ?? key
}
</script>

<template>
  <div class="periph-panel">
    <el-empty
      v-if="usartInUse.length === 0 && adcInUse.length === 0"
      description="先在引脚上选择复用(AF)或模拟功能"
      :image-size="48"
    />

    <template v-if="usartInUse.length">
      <div class="group-head">串口 USART</div>
      <div v-for="u in usartInUse" :key="u.id" class="periph-card">
        <div class="card-head">
          <strong>{{ u.label }}</strong>
          <span class="pins">
            <em v-for="s in u.signals" :key="s.signal">{{ s.signal }} → {{ s.pin }}</em>
          </span>
          <el-switch
            :model-value="cfgOf(u.id).enabled"
            size="small"
            @update:model-value="(v: boolean) => setEnabled(u.id, v)"
          />
        </div>
        <div class="field-grid">
          <label class="field">
            <span>波特率</span>
            <el-select
              :model-value="Number(cfgOf(u.id).params.baudrate)"
              filterable
              allow-create
              size="small"
              style="width: 150px"
              @update:model-value="(v: string | number) => setParam(u.id, 'baudrate', Number(v))"
            >
              <el-option v-for="b in USART_BAUD_RATES" :key="b" :label="String(b)" :value="b" />
            </el-select>
          </label>
          <label class="field">
            <span>字长</span>
            <el-select
              :model-value="String(cfgOf(u.id).params.wordLength)"
              size="small"
              style="width: 150px"
              @update:model-value="(v: string) => setParam(u.id, 'wordLength', v)"
            >
              <el-option v-for="o in USART_WORD_LENGTHS" :key="o.value" :label="o.label" :value="o.value" />
            </el-select>
          </label>
          <label class="field">
            <span>停止位</span>
            <el-select
              :model-value="String(cfgOf(u.id).params.stopBits)"
              size="small"
              style="width: 150px"
              @update:model-value="(v: string) => setParam(u.id, 'stopBits', v)"
            >
              <el-option v-for="o in USART_STOP_BITS" :key="o.value" :label="o.label" :value="o.value" />
            </el-select>
          </label>
          <label class="field">
            <span>校验</span>
            <el-select
              :model-value="String(cfgOf(u.id).params.parity)"
              size="small"
              style="width: 150px"
              @update:model-value="(v: string) => setParam(u.id, 'parity', v)"
            >
              <el-option v-for="o in USART_PARITIES" :key="o.value" :label="o.label" :value="o.value" />
            </el-select>
          </label>
          <label class="field">
            <span>流控</span>
            <el-select
              :model-value="String(cfgOf(u.id).params.flowControl)"
              size="small"
              style="width: 150px"
              @update:model-value="(v: string) => setParam(u.id, 'flowControl', v)"
            >
              <el-option v-for="o in USART_FLOW_CONTROLS" :key="o.value" :label="o.label" :value="o.value" />
            </el-select>
          </label>
          <label v-if="u.spec.clockSourceApi" class="field">
            <span>时钟源</span>
            <el-select
              :model-value="String(cfgOf(u.id).params.clockSource)"
              size="small"
              style="width: 190px"
              @update:model-value="(v: string) => setParam(u.id, 'clockSource', v)"
            >
              <el-option
                v-for="c in u.spec.clockSources"
                :key="c.key"
                :label="c.label"
                :value="c.key"
              />
            </el-select>
          </label>
          <span v-else class="field note">时钟源：固定总线时钟（{{ clockSourceLabel(u.id, u.spec.defaultClockSource) }}）</span>
        </div>
      </div>
    </template>

    <template v-if="adcInUse.length">
      <div class="group-head">ADC</div>
      <div v-for="a in adcInUse" :key="a.id" class="periph-card">
        <div class="card-head">
          <strong>{{ a.label }}</strong>
          <span class="pins">
            <em v-for="ch in a.channels" :key="ch.channel">IN{{ ch.channel }} → {{ ch.pin }}</em>
          </span>
          <el-switch
            :model-value="cfgOf(a.id).enabled"
            size="small"
            @update:model-value="(v: boolean) => setEnabled(a.id, v)"
          />
        </div>
        <div class="field-grid">
          <label class="field">
            <span>分辨率</span>
            <el-select
              :model-value="String(cfgOf(a.id).params.resolution)"
              size="small"
              style="width: 150px"
              @update:model-value="(v: string) => setParam(a.id, 'resolution', v)"
            >
              <el-option v-for="o in a.spec.resolutions" :key="o.macro" :label="o.label" :value="o.macro" />
            </el-select>
          </label>
          <label class="field">
            <span>数据对齐</span>
            <el-select
              :model-value="String(cfgOf(a.id).params.dataAlignment)"
              size="small"
              style="width: 150px"
              @update:model-value="(v: string) => setParam(a.id, 'dataAlignment', v)"
            >
              <el-option v-for="o in a.spec.dataAlignments" :key="o.macro" :label="o.label" :value="o.macro" />
            </el-select>
          </label>
          <label class="field">
            <span>采样时间</span>
            <el-select
              :model-value="String(cfgOf(a.id).params.sampleTime)"
              size="small"
              style="width: 150px"
              @update:model-value="(v: string) => setParam(a.id, 'sampleTime', v)"
            >
              <el-option v-for="o in a.spec.sampleTimes" :key="o.macro" :label="o.label" :value="o.macro" />
            </el-select>
          </label>
          <label class="field">
            <span>触发源</span>
            <el-select
              :model-value="String(cfgOf(a.id).params.externalTrigger)"
              size="small"
              style="width: 170px"
              @update:model-value="(v: string) => setParam(a.id, 'externalTrigger', v)"
            >
              <el-option v-for="o in a.spec.externalTriggers" :key="o.macro" :label="o.label" :value="o.macro" />
            </el-select>
          </label>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.periph-panel {
  padding: 8px 12px 12px;
  user-select: none;
  -webkit-user-select: none;
}
.group-head {
  font-size: 11.5px;
  font-weight: 700;
  color: #6b7280;
  margin: 8px 0 6px;
}
.group-head:first-child {
  margin-top: 0;
}
.periph-card {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 10px;
  margin-bottom: 10px;
  background: #fafbfc;
}
.card-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
  flex-wrap: wrap;
}
.card-head strong {
  font-size: 13px;
}
.pins {
  flex: 1;
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  min-width: 0;
}
.pins em {
  font-style: normal;
  font-size: 11px;
  color: #4f46e5;
  background: #eef2ff;
  border-radius: 4px;
  padding: 1px 6px;
}
.field-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
  gap: 8px;
}
.field {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #374151;
}
.field > span {
  width: 58px;
  flex-shrink: 0;
}
.field.note {
  color: #6b7280;
}
</style>
