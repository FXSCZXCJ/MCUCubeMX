<script setup lang="ts">
defineProps<{
  zoom: number
  rotation: number
  autoFit: boolean
}>()

const emit = defineEmits<{
  'update:autoFit': [value: boolean]
  zoom: [delta: number]
  reset: []
  rotate: [delta: number]
  'export-svg': []
  'export-png': []
}>()
</script>

<template>
  <div class="view-toolbar">
    <span class="zoom-label">显示比例 {{ Math.round(zoom * 100) }}%</span>
    <el-switch
      :model-value="autoFit"
      size="small"
      active-text="自动适配"
      @update:model-value="emit('update:autoFit', $event)"
    />
    <el-button-group>
      <el-button size="small" title="缩小" @click="emit('zoom', -0.25)">−</el-button>
      <el-button size="small" title="重置缩放与旋转" @click="emit('reset')">重置</el-button>
      <el-button size="small" title="放大" @click="emit('zoom', 0.25)">＋</el-button>
    </el-button-group>
    <span class="zoom-label">旋转 {{ rotation }}°</span>
    <el-button-group>
      <el-button size="small" title="逆时针旋转 45°" @click="emit('rotate', -45)">⟲45°</el-button>
      <el-button size="small" title="复位旋转" @click="emit('rotate', 360 - rotation)">复位</el-button>
      <el-button size="small" title="顺时针旋转 45°" @click="emit('rotate', 45)">⟳45°</el-button>
    </el-button-group>
    <el-button size="small" @click="emit('export-svg')">导出 SVG</el-button>
    <el-button size="small" @click="emit('export-png')">导出 PNG</el-button>
    <span class="zoom-label hint">滚轮缩放</span>
  </div>
</template>

<style scoped>
.view-toolbar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  flex-wrap: wrap;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 6px 10px;
  background: #ffffff;
  flex: none;
}
.zoom-label {
  font-size: 12px;
  color: #6b7280;
}
.hint {
  color: #9ca3af;
}
</style>
