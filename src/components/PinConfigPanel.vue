<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import { useProjectStore } from '../stores/project'
import { groupOfPin } from '../lib/groups'
import type { ExtiEdge, PinMode } from '../types'

const store = useProjectStore()

const pin = computed(() =>
  store.selectedPin ? store.deviceData.lookup.findPin(store.selectedPin) : undefined,
)
const assignment = computed(() => (store.selectedPin ? store.assignments[store.selectedPin] : undefined))
const speedOptions = computed(() => store.deviceData.device.firmware.speeds)
const locked = computed(() => {
  const p = pin.value
  return Boolean(p && p.special && ['nrst', 'boot', 'swd'].includes(p.special) && !store.unlocked.includes(p.name))
})
const afOptions = computed<string[]>(() => {
  if (!pin.value) return []
  const set = new Set<string>()
  for (const signals of store.deviceData.lookup.afSignalsOf(pin.value.name).values()) {
    for (const s of signals) {
      if (s !== 'EVENTOUT') set.add(s)
    }
  }
  return [...set].sort()
})
const analogOptions = computed<string[]>(() =>
  (pin.value?.additional ?? []).filter((s) => /^(ADC|DAC)/i.test(s)).sort(),
)
// 已被其它引脚占用的信号（互斥提示）
const usedSignals = computed(() => {
  const map = new Map<string, string>()
  for (const a of Object.values(store.assignments)) {
    if ((a.mode === 'AF' || a.mode === 'ANALOG') && a.function) {
      map.set(a.function, a.pin.toUpperCase())
    }
  }
  return map
})
const groupOptions = computed(() => store.groups.map((g) => g.name))

const form = reactive({
  mode: 'OUTPUT' as PinMode,
  label: '',
  function: '',
  group: '',
  outputType: 'PP',
  speed: '50',
  level: 'HIGH',
  pull: 'NONE',
  exti: false,
  edge: 'FALLING' as ExtiEdge,
})

watch(
  [pin, assignment],
  () => {
    const a = assignment.value
    if (a) {
      form.mode = a.mode
      form.label = a.label ?? ''
      form.function = a.function ?? ''
      form.group = pin.value ? groupOfPin(store.groups, pin.value.name)?.name ?? '' : ''
      form.outputType = a.params.outputType ?? 'PP'
      form.speed = a.params.speed ?? '50'
      form.level = a.params.level ?? 'HIGH'
      form.pull = a.params.pull ?? 'NONE'
      form.exti = a.params.exti?.enabled ?? false
      form.edge = a.params.exti?.edge ?? 'FALLING'
    } else {
      Object.assign(form, {
        mode: 'OUTPUT',
        label: '',
        function: '',
        group: '',
        outputType: 'PP',
        speed: '50',
        level: 'HIGH',
        pull: 'NONE',
        exti: false,
        edge: 'FALLING',
      })
    }
  },
  { immediate: true },
)

watch(
  () => form.mode,
  (mode) => {
    // 输入/输出模式不携带功能信号
    if (mode === 'INPUT' || mode === 'OUTPUT') form.function = ''
  },
)

function apply() {
  if (!store.selectedPin) return
  if ((form.mode === 'AF' || form.mode === 'ANALOG') && !form.function) {
    return
  }
  store.assign(form.mode, form.label, form.function)
  store.updateParams({
    outputType: form.outputType as 'PP' | 'OD',
    speed: form.speed as '2' | '10' | '50',
    level: form.level as 'HIGH' | 'LOW',
    pull: form.pull as 'NONE' | 'PULLUP' | 'PULLDOWN',
    exti: {
      enabled: form.mode === 'INPUT' && form.exti,
      edge: form.edge,
    },
  })
}

function onGroupChange(group: string) {
  if (store.selectedPin) store.setPinGroup(store.selectedPin, group || null)
}

function clear() {
  if (store.selectedPin) store.clearPin(store.selectedPin)
}
</script>

<template>
  <div class="config-panel">
    <template v-if="pin">
      <div class="panel-title">
        <strong>{{ pin.name }}</strong>
        <span class="panel-sub">封装脚 #{{ pin.number }} {{ pin.aliases?.length ? `（${pin.aliases.join('/')}）` : '' }}</span>
      </div>

      <el-alert
        v-if="pin.type === 'POWER'"
        title="电源引脚，不可配置为 GPIO"
        type="info"
        :closable="false"
      />
      <el-alert
        v-else-if="locked"
        :title="`${pin.name} 是特殊引脚（${pin.special?.toUpperCase()}），配置可能影响调试或启动`"
        type="warning"
        :closable="false"
        show-icon
      >
        <el-button size="small" type="warning" @click="store.unlock(pin.name)">确认解锁并配置</el-button>
      </el-alert>
      <el-alert
        v-else-if="pin.special === 'osc'"
        title="晶振引脚：作为 GPIO 前请确认 HXTAL 未启用"
        type="warning"
        :closable="false"
      />

      <template v-if="pin.type === 'IO'">
        <el-form label-width="86px" label-position="left" size="small">
          <el-form-item label="功能模式">
            <el-radio-group v-model="form.mode" :disabled="locked">
              <el-radio-button value="OUTPUT">输出</el-radio-button>
              <el-radio-button value="INPUT">输入</el-radio-button>
              <el-radio-button value="AF">复用(AF)</el-radio-button>
              <el-radio-button value="ANALOG">模拟</el-radio-button>
            </el-radio-group>
          </el-form-item>
          <el-form-item v-if="form.mode === 'AF'" label="复用功能">
            <el-select
              v-model="form.function"
              filterable
              placeholder="选择 AF 信号"
              style="width: 100%"
            >
              <el-option
                v-for="s in afOptions"
                :key="s"
                :label="usedSignals.has(s) ? `${s}（已被 ${usedSignals.get(s)} 使用）` : s"
                :value="s"
                :disabled="usedSignals.has(s)"
              />
            </el-select>
          </el-form-item>
          <el-form-item v-else-if="form.mode === 'ANALOG'" label="模拟信号">
            <el-select v-model="form.function" placeholder="选择 ADC/DAC 通道" style="width: 100%">
              <el-option
                v-for="s in analogOptions"
                :key="s"
                :label="usedSignals.has(s) ? `${s}（已被 ${usedSignals.get(s)} 使用）` : s"
                :value="s"
                :disabled="usedSignals.has(s)"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="标签">
            <el-input v-model="form.label" placeholder="如 LED_R / KEY_USER" :disabled="locked" />
          </el-form-item>

          <template v-if="form.mode === 'OUTPUT'">
            <el-form-item label="输出模式">
              <el-radio-group v-model="form.outputType">
                <el-radio-button value="PP">推挽</el-radio-button>
                <el-radio-button value="OD">开漏</el-radio-button>
              </el-radio-group>
            </el-form-item>
            <el-form-item label="速度">
            <el-select v-model="form.speed">
              <el-option v-for="s in speedOptions" :key="s" :label="`${s} MHz`" :value="s" />
            </el-select>
            </el-form-item>
            <el-form-item label="初始电平">
              <el-radio-group v-model="form.level">
                <el-radio-button value="HIGH">高</el-radio-button>
                <el-radio-button value="LOW">低</el-radio-button>
              </el-radio-group>
            </el-form-item>
          </template>

          <template v-else-if="form.mode === 'INPUT'">
            <el-form-item label="上下拉">
              <el-select v-model="form.pull">
                <el-option label="无" value="NONE" />
                <el-option label="上拉" value="PULLUP" />
                <el-option label="下拉" value="PULLDOWN" />
              </el-select>
            </el-form-item>
            <el-form-item label="外部中断">
              <el-switch v-model="form.exti" />
            </el-form-item>
            <el-form-item v-if="form.exti" label="触发边沿">
              <el-select v-model="form.edge">
                <el-option label="上升沿" value="RISING" />
                <el-option label="下降沿" value="FALLING" />
                <el-option label="双边沿" value="BOTH" />
              </el-select>
            </el-form-item>
          </template>
          <template v-else>
            <el-form-item>
              <span class="panel-hint">复用/模拟模式无额外 GPIO 参数</span>
            </el-form-item>
          </template>

          <el-form-item label="所属分组">
            <el-select
              :model-value="form.group"
              clearable
              placeholder="无分组"
              style="width: 100%"
              @update:model-value="onGroupChange"
            >
              <el-option v-for="g in groupOptions" :key="g" :label="g" :value="g" />
            </el-select>
          </el-form-item>

          <el-form-item>
            <el-button
              type="primary"
              :disabled="locked || ((form.mode === 'AF' || form.mode === 'ANALOG') && !form.function)"
              @click="apply"
            >
              应用配置
            </el-button>
            <el-button :disabled="!assignment" @click="clear">清除</el-button>
          </el-form-item>
        </el-form>
      </template>
    </template>
    <el-empty v-else description="点击左侧封装图或上方列表选择引脚" :image-size="72" />
  </div>
</template>

<style scoped>
.config-panel {
  padding: 10px 12px;
}
.panel-title {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 8px;
}
.panel-sub {
  font-size: 12px;
  color: #6b7280;
}
.panel-hint {
  font-size: 12px;
  color: #9ca3af;
}
</style>
