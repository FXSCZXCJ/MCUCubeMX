<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import { findPin } from '../data/device'
import { useProjectStore } from '../stores/project'
import type { ExtiEdge, PinMode } from '../types'

const store = useProjectStore()

const pin = computed(() => (store.selectedPin ? findPin(store.selectedPin) : undefined))
const assignment = computed(() => (store.selectedPin ? store.assignments[store.selectedPin] : undefined))
const locked = computed(() => {
  const p = pin.value
  return Boolean(p && p.special && ['nrst', 'boot', 'swd'].includes(p.special) && !store.unlocked.includes(p.name))
})

const form = reactive({
  mode: 'OUTPUT' as PinMode,
  label: '',
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

function apply() {
  if (!store.selectedPin) return
  store.assign(form.mode, form.label)
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
              <el-radio-button value="AF" disabled>复用(Phase 3)</el-radio-button>
            </el-radio-group>
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
                <el-option label="2 MHz" value="2" />
                <el-option label="10 MHz" value="10" />
                <el-option label="50 MHz" value="50" />
              </el-select>
            </el-form-item>
            <el-form-item label="初始电平">
              <el-radio-group v-model="form.level">
                <el-radio-button value="HIGH">高</el-radio-button>
                <el-radio-button value="LOW">低</el-radio-button>
              </el-radio-group>
            </el-form-item>
          </template>

          <template v-else>
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

          <el-form-item>
            <el-button type="primary" :disabled="locked" @click="apply">应用配置</el-button>
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
</style>
