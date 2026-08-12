<script setup lang="ts">
import { computed } from 'vue'
import { useProjectStore } from '../stores/project'
import { groupOfPin } from '../lib/groups'
import type { PinDef } from '../types'

const store = useProjectStore()

interface Row {
  pin: PinDef
  label: string
  mode: string
  func: string
  group: string
  exti: string
  conflict: boolean
}

const rows = computed<Row[]>(() =>
  store.deviceData.device.pins
    .filter((p) => p.type === 'IO')
    .map((pin) => {
      const a = store.assignments[pin.name]
      return {
        pin,
        label: a?.label ?? '',
        mode: a
          ? a.mode === 'OUTPUT'
            ? '输出'
            : a.mode === 'INPUT'
              ? '输入'
              : a.mode === 'AF'
                ? '复用'
                : '模拟'
          : '未配置',
        func: a?.function ?? '',
        group: groupOfPin(store.groups, pin.name)?.name ?? '',
        exti: a?.params.exti?.enabled ? a.params.exti.edge : '',
        conflict: store.conflicts.some((c) => c.pins.includes(pin.name)),
      }
    }),
)

function onRowClick(row: Row) {
  store.selectPin(row.pin.name)
}
</script>

<template>
  <el-table
    :data="rows"
    size="small"
    height="100%"
    highlight-current-row
    :current-row-key="store.selectedPin ?? undefined"
    row-key="pin.name"
    @row-click="onRowClick"
  >
    <el-table-column prop="pin.name" label="引脚" width="64" fixed />
    <el-table-column prop="pin.number" label="脚位" width="52" />
    <el-table-column label="特殊" width="52">
      <template #default="{ row }">
        <span v-if="row.pin.special">{{ row.pin.special.toUpperCase() }}</span>
      </template>
    </el-table-column>
    <el-table-column prop="label" label="标签" min-width="90" />
    <el-table-column prop="mode" label="模式" width="70" />
    <el-table-column prop="func" label="功能" min-width="110">
      <template #default="{ row }">
        <span v-if="row.func" class="func-text">{{ row.func }}</span>
      </template>
    </el-table-column>
    <el-table-column prop="group" label="分组" width="90" />
    <el-table-column prop="exti" label="EXTI" width="70" />
    <el-table-column label="冲突" width="52">
      <template #default="{ row }">
        <el-tag v-if="row.conflict" type="danger" size="small">是</el-tag>
      </template>
    </el-table-column>
  </el-table>
</template>

<style scoped>
.func-text {
  color: #1971c2;
  font-size: 12px;
}
</style>
