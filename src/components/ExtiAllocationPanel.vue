<script setup lang="ts">
import { computed } from 'vue'
import { useProjectStore } from '../stores/project'
import { extiAllocations } from '../lib/usage'

const store = useProjectStore()
const allocations = computed(() => extiAllocations(store.config, store.deviceData))

function isGroupStart(line: number): boolean {
  return line === 0 || line === 5 || line === 10
}
</script>

<template>
  <div class="exti-panel">
    <template v-for="alloc in allocations" :key="alloc.line">
      <div v-if="isGroupStart(alloc.line)" class="group-head">
        {{ alloc.irq }} 中断组
      </div>
      <div class="exti-row" :class="{ used: alloc.enabled }">
        <span class="line-chip" :class="{ used: alloc.enabled }">EXTI{{ alloc.line }}</span>
        <span class="pin-cell">
          <template v-if="alloc.enabled">
            <b>{{ alloc.pin }}</b>
            <span v-if="alloc.label" class="label">{{ alloc.label }}</span>
            <span class="edge">{{ alloc.edge }}</span>
          </template>
          <span v-else class="unused">未分配</span>
        </span>
        <el-tag :type="alloc.enabled ? 'success' : 'info'" size="small" effect="plain">
          {{ alloc.enabled ? '已分配' : '空闲' }}
        </el-tag>
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
  gap: 10px;
  padding: 4px 0;
  font-size: 12.5px;
}
.exti-row.used {
  background: #f5f7ff;
  border-radius: 6px;
  padding: 4px 8px;
}
.line-chip {
  width: 64px;
  flex-shrink: 0;
  font-weight: 600;
  color: #6b7280;
  font-size: 12px;
}
.line-chip.used {
  color: #4f46e5;
}
.pin-cell {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex-wrap: wrap;
}
.pin-cell .label {
  color: #6b7280;
  background: #f3f4f6;
  border-radius: 4px;
  padding: 0 6px;
  font-size: 11px;
}
.pin-cell .edge {
  color: #d97706;
  font-size: 11.5px;
}
.unused {
  color: #9ca3af;
}
</style>
