<script setup lang="ts">
import { computed } from 'vue'
import { useProjectStore } from '../stores/project'
import { deriveUsage } from '../lib/usage'

const store = useProjectStore()
const usage = computed(() => deriveUsage(store.config, store.deviceData))

const MODE_LABEL: Record<string, string> = { INPUT: '输入', OUTPUT: '输出' }
const EDGE_LABEL: Record<string, string> = { RISING: '上升沿', FALLING: '下降沿', BOTH: '双边沿' }
</script>

<template>
  <div class="usage-panel">
    <template v-if="usage.peripherals.length || usage.exti.length || usage.gpio.length">
      <div v-if="usage.peripherals.length" class="usage-group">
        <div class="usage-title">外设</div>
        <div v-for="p in usage.peripherals" :key="p.name" class="periph">
          <span class="periph-name">{{ p.name }}</span>
          <span v-for="item in p.items" :key="item.signal + item.pin" class="periph-item">
            {{ item.display }}→{{ item.pin }}
          </span>
        </div>
      </div>

      <div v-if="usage.exti.length" class="usage-group">
        <div class="usage-title">外部中断</div>
        <div v-for="e in usage.exti" :key="e.pin" class="periph">
          <span class="periph-name">EXTI{{ e.line }}</span>
          <span class="periph-item">{{ e.pin }}（{{ EDGE_LABEL[e.edge] ?? e.edge }}）</span>
        </div>
      </div>

      <div v-if="usage.gpio.length" class="usage-group">
        <div class="usage-title">通用 GPIO</div>
        <div class="gpio-list">
          <span v-for="g in usage.gpio" :key="g.pin" class="gpio-item">
            {{ g.pin }}{{ g.label ? `·${g.label}` : '' }}({{ MODE_LABEL[g.mode] }})
          </span>
        </div>
      </div>
    </template>
    <el-empty v-else description="暂无引脚配置" :image-size="48" />
  </div>
</template>

<style scoped>
.usage-panel {
  padding: 8px 12px;
  max-height: 280px;
  overflow: auto;
}
.usage-group {
  margin-bottom: 8px;
}
.usage-title {
  font-size: 12px;
  color: #6b7280;
  margin-bottom: 4px;
}
.periph {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 4px 8px;
  font-size: 12px;
  margin: 2px 0;
}
.periph-name {
  font-weight: 600;
  color: #374151;
}
.periph-item {
  color: #1971c2;
  background: #e7f5ff;
  border-radius: 4px;
  padding: 0 5px;
}
.gpio-list {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.gpio-item {
  font-size: 12px;
  color: #4b5563;
  background: #f3f4f6;
  border-radius: 4px;
  padding: 0 5px;
}
</style>
