<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import PackageView from './components/PackageView.vue'
import PinTable from './components/PinTable.vue'
import PinConfigPanel from './components/PinConfigPanel.vue'
import ConflictsPanel from './components/ConflictsPanel.vue'
import CodegenDialog from './components/CodegenDialog.vue'
import { useProjectStore } from './stores/project'
import { downloadBlob } from './lib/codegen'
import type { ProjectConfig } from './types'

const store = useProjectStore()
const codegenVisible = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)

function onImportClick() {
  fileInput.value?.click()
}

function onFileSelected(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    try {
      const config = JSON.parse(String(reader.result)) as ProjectConfig
      if (config.version !== 1 || config.device !== store.device) {
        throw new Error('配置文件版本或器件不匹配')
      }
      store.loadConfig(config)
      ElMessage.success('配置导入成功')
    } catch (err) {
      ElMessage.error(`导入失败: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  reader.readAsText(file)
  input.value = ''
}

function exportConfig() {
  const blob = new Blob([JSON.stringify(store.config, null, 2)], { type: 'application/json' })
  downloadBlob(blob, `${store.projectName || 'project'}.json`)
  ElMessage.success('配置已导出')
}

async function clearAll() {
  if (store.assignedCount === 0) return
  try {
    await ElMessageBox.confirm('确定清空所有引脚配置？', '提示', { type: 'warning' })
    store.clearAll()
  } catch {
    /* 用户取消 */
  }
}
</script>

<template>
  <div class="app">
    <header class="app-header">
      <div class="brand">
        <strong>MCUCubeMX</strong>
        <span class="badge">{{ store.device }} · {{ store.packageName }}</span>
      </div>
      <div class="toolbar">
        <el-input
          v-model="store.projectName"
          size="small"
          placeholder="工程名"
          class="project-name"
        />
        <el-input
          :model-value="store.prefix"
          size="small"
          style="width: 96px"
          @update:model-value="store.setPrefix($event)"
        >
          <template #prepend>前缀</template>
        </el-input>
        <el-button size="small" @click="onImportClick">导入配置</el-button>
        <el-button size="small" @click="exportConfig">导出配置</el-button>
        <el-button size="small" @click="clearAll">清空</el-button>
        <el-button
          size="small"
          type="primary"
          :disabled="store.assignedCount === 0"
          @click="codegenVisible = true"
        >
          生成代码
        </el-button>
        <input ref="fileInput" type="file" accept=".json,application/json" hidden @change="onFileSelected" />
      </div>
    </header>

    <main class="app-main">
      <section class="left">
        <PackageView />
      </section>
      <section class="right">
        <div class="panel">
          <div class="panel-title">
            引脚列表 <span class="panel-count">{{ store.assignedCount }}/{{ 64 }}</span>
          </div>
          <div class="table-wrap">
            <PinTable />
          </div>
        </div>
        <div class="panel">
          <div class="panel-title">引脚配置</div>
          <PinConfigPanel />
        </div>
        <div class="panel">
          <ConflictsPanel />
        </div>
      </section>
    </main>

    <CodegenDialog v-model="codegenVisible" />
  </div>
</template>

<style scoped>
.app {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 10px 18px;
  background: #ffffff;
  border-bottom: 1px solid #e5e7eb;
  flex-wrap: wrap;
}
.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 16px;
}
.badge {
  font-size: 12px;
  color: #6b7280;
  background: #f3f4f6;
  border-radius: 10px;
  padding: 2px 10px;
}
.toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
}
.project-name {
  width: 140px;
}
.app-main {
  display: grid;
  grid-template-columns: minmax(420px, 1.15fr) minmax(360px, 1fr);
  gap: 14px;
  padding: 14px 18px;
  overflow: auto;
  align-items: start;
}
.left {
  position: sticky;
  top: 0;
}
.right {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.panel {
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  overflow: hidden;
}
.panel-title {
  font-weight: 600;
  padding: 9px 12px;
  border-bottom: 1px solid #f0f1f3;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.panel-count {
  font-size: 12px;
  color: #6b7280;
  font-weight: 400;
}
.table-wrap {
  height: 260px;
}
</style>
