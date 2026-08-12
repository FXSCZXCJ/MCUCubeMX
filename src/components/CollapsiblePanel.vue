<script setup lang="ts">
import { ref } from 'vue'

const props = withDefaults(
  defineProps<{
    title: string
    /** 标题右侧徽标（如引脚数 x/64） */
    badge?: string | number
    /** 默认展开，默认 true */
    defaultOpen?: boolean
    /** 内容区是否需要内边距（内容自身已带 padding 时置 false） */
    bodyPadding?: boolean
  }>(),
  {
    defaultOpen: true,
    bodyPadding: false,
  },
)

const open = ref(props.defaultOpen)
</script>

<template>
  <div class="panel collapsible-panel">
    <div class="panel-title" @click="open = !open">
      <span class="title-text">{{ title }}</span>
      <span class="title-right">
        <slot name="extra" />
        <span v-if="badge !== undefined" class="badge">{{ badge }}</span>
        <span class="chevron" :class="{ open }">▾</span>
      </span>
    </div>
    <el-collapse-transition>
      <div v-show="open" class="panel-body" :class="{ padded: bodyPadding }">
        <slot />
      </div>
    </el-collapse-transition>
  </div>
</template>

<style scoped>
.panel {
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  overflow: hidden;
  flex: none;
}
.panel-title {
  font-weight: 600;
  padding: 9px 12px;
  border-bottom: 1px solid #f0f1f3;
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
  user-select: none;
  -webkit-user-select: none;
}
.panel-title:hover {
  background: #fafbfc;
}
.title-text {
  font-size: 13px;
}
.title-right {
  display: flex;
  align-items: center;
  gap: 8px;
}
.badge {
  font-size: 12px;
  color: #6b7280;
  font-weight: 400;
}
.chevron {
  font-size: 12px;
  color: #9ca3af;
  transition: transform 0.2s ease;
  line-height: 1;
}
.chevron.open {
  transform: rotate(180deg);
}
.panel-body {
  min-width: 0;
}
.panel-body.padded {
  padding: 12px;
}
</style>
