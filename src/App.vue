<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import PackageView from './components/PackageView.vue'
import PinTable from './components/PinTable.vue'
import PinConfigPanel from './components/PinConfigPanel.vue'
import PeripheralConfigPanel from './components/PeripheralConfigPanel.vue'
import ConflictsPanel from './components/ConflictsPanel.vue'
import PeripheralUsagePanel from './components/PeripheralUsagePanel.vue'
import ExtiAllocationPanel from './components/ExtiAllocationPanel.vue'
import AdcChannelPanel from './components/AdcChannelPanel.vue'
import GroupsPanel from './components/GroupsPanel.vue'
import CollapsiblePanel from './components/CollapsiblePanel.vue'
import CodegenDialog from './components/CodegenDialog.vue'
import ClockTreeView from './components/ClockTreeView.vue'
import ClockEditorPanel from './components/ClockEditorPanel.vue'
import JlcBridgePanel from './components/JlcBridgePanel.vue'
import { useProjectStore } from './stores/project'
import { downloadBlob } from './lib/codegen'
import { deviceIds } from './data/device'
import type { ProjectConfig } from './types'

const store = useProjectStore()
const codegenVisible = ref(false)
const viewMode = ref<'gpio' | 'clock'>('gpio')
const svgCollapsed = ref(false)
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
        <el-radio-group v-model="viewMode" size="small" class="view-switch">
          <el-radio-button value="gpio">GPIO</el-radio-button>
          <el-radio-button value="clock">时钟</el-radio-button>
        </el-radio-group>
        <el-button size="small" @click="svgCollapsed = !svgCollapsed">
          {{ svgCollapsed ? '展开左栏' : '折叠左栏' }}
        </el-button>
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

    <main class="app-main" :class="{ collapsed: svgCollapsed }">
      <template v-if="viewMode === 'gpio'">
        <section v-show="!svgCollapsed" class="svg-pane">
          <PackageView />
        </section>
        <aside class="config-pane">
          <CollapsiblePanel title="引脚配置">
            <PinConfigPanel />
          </CollapsiblePanel>
          <CollapsiblePanel title="外设配置" :default-open="false">
            <PeripheralConfigPanel />
          </CollapsiblePanel>
          <CollapsiblePanel title="引脚列表" :badge="`${store.assignedCount}/${64}`">
            <div class="table-wrap">
              <PinTable />
            </div>
          </CollapsiblePanel>
          <CollapsiblePanel title="外设使用情况">
            <PeripheralUsagePanel />
          </CollapsiblePanel>
          <CollapsiblePanel title="中断线分配">
            <ExtiAllocationPanel />
          </CollapsiblePanel>
          <CollapsiblePanel title="ADC 通道分配">
            <AdcChannelPanel />
          </CollapsiblePanel>
          <CollapsiblePanel title="引脚分组">
            <GroupsPanel />
          </CollapsiblePanel>
          <CollapsiblePanel title="检查结果">
            <ConflictsPanel />
          </CollapsiblePanel>
        </aside>
      </template>
      <template v-else>
        <section v-show="!svgCollapsed" class="svg-pane">
          <ClockTreeView />
        </section>
        <aside class="config-pane">
          <ClockEditorPanel />
        </aside>
      </template>
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
  height: 58px;
  flex: none;
  background: #ffffff;
  border-bottom: 1px solid #e5e7eb;
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
.view-switch {
  margin-right: 4px;
}
.project-name {
  width: 140px;
}
.app-main {
  height: calc(100vh - 58px);
  display: grid;
  grid-template-columns: minmax(560px, 1.5fr) minmax(360px, 0.9fr);
  gap: 14px;
  padding: 12px 18px;
  overflow: hidden;
}
.app-main.collapsed {
  grid-template-columns: 1fr;
}
.svg-pane {
  min-width: 0;
  height: 100%;
  overflow: hidden;
}
.config-pane {
  height: 100%;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-right: 2px;
}
.table-wrap {
  height: 260px;
}
</style>
