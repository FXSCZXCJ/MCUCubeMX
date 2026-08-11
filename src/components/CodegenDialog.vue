<script setup lang="ts">
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useProjectStore } from '../stores/project'
import { downloadBlob, exportZip, generateProject } from '../lib/codegen'

defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()

const store = useProjectStore()
const activeTab = ref('gpio.h')

const files = computed(() => generateProject(store.config, store.deviceData))

function close() {
  emit('update:modelValue', false)
}

async function downloadZip() {
  const blob = await exportZip(store.config, store.deviceData)
  downloadBlob(blob, `${store.projectName || 'project'}-code.zip`)
  ElMessage.success('代码包已下载')
}

function downloadJson() {
  const blob = new Blob([JSON.stringify(store.config, null, 2)], { type: 'application/json' })
  downloadBlob(blob, `${store.projectName || 'project'}.json`)
}
</script>

<template>
  <el-dialog :model-value="modelValue" title="生成代码预览" width="72%" top="6vh" @close="close">
    <div class="dialog-body">
      <el-tabs v-model="activeTab">
        <el-tab-pane v-for="file in files" :key="file.path" :label="file.path" :name="file.path">
          <pre class="code-preview">{{ file.content }}</pre>
        </el-tab-pane>
      </el-tabs>
    </div>
    <template #footer>
      <el-button @click="downloadJson">导出配置 JSON</el-button>
      <el-button type="primary" @click="downloadZip">下载代码包 (ZIP)</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.dialog-body {
  min-height: 40vh;
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
