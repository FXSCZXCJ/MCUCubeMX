<script setup lang="ts">
import { useProjectStore } from '../stores/project'

const store = useProjectStore()
</script>

<template>
  <div class="conflicts-panel">
    <el-empty
      v-if="store.conflicts.length === 0"
      description="无冲突"
      :image-size="52"
    />
    <ul v-else class="conflict-list">
      <li v-for="(c, i) in store.conflicts" :key="`${c.code}-${i}`">
        <el-tag :type="c.severity === 'error' ? 'danger' : 'warning'" size="small" effect="dark">
          {{ c.severity === 'error' ? '错误' : '警告' }}
        </el-tag>
        <span>{{ c.message }}</span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.conflicts-panel {
  padding: 10px 12px;
}
.conflict-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.conflict-list li {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 12.5px;
  color: #374151;
}
</style>
