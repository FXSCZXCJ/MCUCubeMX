<script setup lang="ts">
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useProjectStore } from '../stores/project'
import {
  DEFAULT_CODEGEN_SELECTION,
  downloadBlob,
  exportZip,
  generateProject,
  type CodegenSelection,
} from '../lib/codegen'

defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()

const store = useProjectStore()
const activeTab = ref('gpio.h')
const selection = ref<CodegenSelection>({ ...DEFAULT_CODEGEN_SELECTION })

const files = computed(() => generateProject(store.config, store.deviceData, selection.value))

const items: { key: keyof CodegenSelection; label: string; desc: string }[] = [
  { key: 'pinDefs', label: '引脚定义', desc: 'gpio.h（引脚宏）' },
  { key: 'pinInit', label: '引脚初始化', desc: 'gpio.c + EXTI 中断 app_it.c' },
  { key: 'clockDefs', label: '时钟定义', desc: 'clock.h' },
  { key: 'clockInit', label: '时钟初始化', desc: 'clock.c' },
  { key: 'periphInit', label: '外设初始化', desc: 'usart.h/c、adc.h/c' },
]

function updateSelection(key: keyof CodegenSelection, value: boolean) {
  selection.value = { ...selection.value, [key]: value }
  if (!files.value.some((f) => f.path === activeTab.value)) {
    activeTab.value = files.value[0]?.path ?? ''
  }
}

function selectAll(on: boolean) {
  selection.value = Object.fromEntries(items.map((i) => [i.key, on])) as unknown as CodegenSelection
}

function close() {
  emit('update:modelValue', false)
}

async function downloadZip() {
  const blob = await exportZip(store.config, store.deviceData, selection.value)
  downloadBlob(blob, `${store.projectName || 'project'}-code.zip`)
  ElMessage.success(`代码包已下载（${files.value.length} 个文件）`)
}

function downloadJson() {
  const blob = new Blob([JSON.stringify(store.config, null, 2)], { type: 'application/json' })
  downloadBlob(blob, `${store.projectName || 'project'}.json`)
}
</script>

<template>
  <el-dialog :model-value="modelValue" title="生成代码预览" width="72%" top="6vh" @close="close">
    <div class="dialog-body">
      <div class="selection-bar">
        <span class="selection-title">生成内容：</span>
        <el-checkbox
          v-for="item in items"
          :key="item.key"
          :model-value="selection[item.key]"
          :title="item.desc"
          @update:model-value="(v: boolean) => updateSelection(item.key, v)"
        >
          {{ item.label }}
        </el-checkbox>
        <el-button size="small" text type="primary" @click="selectAll(true)">全选</el-button>
        <el-button size="small" text @click="selectAll(false)">全不选</el-button>
      </div>
      <el-alert
        v-if="files.length === 0"
        title="未选择任何生成内容"
        type="info"
        :closable="false"
        show-icon
      />
      <el-tabs v-model="activeTab">
        <el-tab-pane v-for="file in files" :key="file.path" :label="file.path" :name="file.path">
          <pre class="code-preview">{{ file.content }}</pre>
        </el-tab-pane>
      </el-tabs>
    </div>
    <template #footer>
      <el-button @click="downloadJson">导出配置 JSON</el-button>
      <el-button type="primary" :disabled="files.length === 0" @click="downloadZip">
        下载代码包 (ZIP)
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.dialog-body {
  min-height: 40vh;
}
.selection-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  padding: 10px 12px;
  margin-bottom: 10px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #fafbfc;
  user-select: none;
  -webkit-user-select: none;
}
.selection-title {
  font-size: 13px;
  font-weight: 600;
  color: #374151;
}
.code-preview {
  background: #1e1e1e;
  color: #d4d4d4;
  padding: 14px;
  border-radius: 6px;
  font-size: 12.5px;
  line-height: 1.5;
  max-height: 56vh;
  overflow: auto;
  white-space: pre;
}
</style>
