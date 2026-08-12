<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import PackageView from './components/PackageView.vue'
import PinTable from './components/PinTable.vue'
import PinConfigPanel from './components/PinConfigPanel.vue'
import ConflictsPanel from './components/ConflictsPanel.vue'
import PeripheralUsagePanel from './components/PeripheralUsagePanel.vue'
import GroupsPanel from './components/GroupsPanel.vue'
import CodegenDialog from './components/CodegenDialog.vue'
import ClockTreeView from './components/ClockTreeView.vue'
import JlcBridgePanel from './components/JlcBridgePanel.vue'
import { useProjectStore } from './stores/project'
import { downloadBlob } from './lib/codegen'
import { deviceIds } from './data/device'
import type { ProjectConfig } from './types'

const store = useProjectStore()
const codegenVisible = ref(false)
const leftMode = ref<'gpio' | 'clock'>('gpio')
const jlcVisible = ref(false)
const jlcAction = ref<'sync' | 'import' | null>(null)
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
      if (config.version !== 1 || !deviceIds.includes(config.device)) {
        throw new Error('配置文件版本或器件不匹配')
      }
      if (config.device !== store.deviceId) {
        store.switchDevice(config.device)
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

function onSyncToEda() {
  jlcAction.value = 'sync'
  jlcVisible.value = true
}

function onImportFromEda() {
  jlcAction.value = 'import'
  jlcVisible.value = true
}

function onJlcActionConsumed() {
  jlcAction.value = null
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
        <el-select
          :model-value="store.deviceId"
          size="small"
          class="device-select"
          @update:model-value="store.switchDevice($event)"
        >
          <el-option v-for="id in deviceIds" :key="id" :label="id" :value="id" />
        </el-select>
        <span class="badge">{{ store.deviceData.device.package }} · {{ store.deviceData.device.core }}</span>
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
          style="width: 160px"
          @update:model-value="store.setPrefix($event)"
        >
          <template #prepend>前缀</template>
        </el-input>
        <el-button size="small" @click="onImportClick">导入配置</el-button>
        <el-button size="small" @click="exportConfig">导出配置</el-button>
        <el-button size="small" @click="clearAll">清空</el-button>
        <el-button size="small" type="warning" plain @click="onSyncToEda">同步到 EDA</el-button>
        <el-button size="small" type="success" plain @click="onImportFromEda">从 EDA 同步</el-button>
        <el-button size="small" type="primary" plain @click="jlcVisible = true">嘉立创</el-button>
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
        <div class="left-switch">
          <el-radio-group v-model="leftMode" size="small">
            <el-radio-button value="gpio">GPIO</el-radio-button>
            <el-radio-button value="clock">时钟</el-radio-button>
          </el-radio-group>
        </div>
        <PackageView v-if="leftMode === 'gpio'" />
        <div v-else class="clock-view-wrap">
          <ClockTreeView />
        </div>
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
          <div class="panel-title">外设使用情况</div>
          <PeripheralUsagePanel />
        </div>
        <div class="panel">
          <div class="panel-title">引脚分组</div>
          <GroupsPanel />
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
    <JlcBridgePanel
      :model-value="jlcVisible"
      :pending-action="jlcAction"
      @update:model-value="jlcVisible = $event"
      @action-consumed="onJlcActionConsumed"
    />
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
.device-select {
  width: 150px;
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
  grid-template-columns: minmax(560px, 1.5fr) minmax(360px, 0.9fr);
  gap: 14px;
  padding: 14px 18px;
  overflow: auto;
  align-items: start;
}
.left {
  position: sticky;
  top: 0;
  min-width: 0;
}
.left-switch {
  display: flex;
  justify-content: center;
  margin-bottom: 10px;
}
.clock-view-wrap {
  overflow-x: auto;
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
