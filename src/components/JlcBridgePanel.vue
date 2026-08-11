<script setup lang="ts">
import { computed, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useProjectStore } from '../stores/project'
import { getDeviceData, deviceIds } from '../data/device'
import {
  fetchMcuPinMap,
  fetchProjectInfo,
  findMcuCandidates,
  getEdaWindows,
  scanBridge,
  selectEdaWindow,
} from '../lib/jlc/bridge'
import {
  buildImportPlan,
  classifyEdaPin,
  matchDeviceIdBySymbol,
  normalizeEdaPinName,
} from '../lib/jlc/import'
import type {
  BridgeHealth,
  EdaComponentInfo,
  EdaProjectInfo,
  EdaWindow,
  ImportPlan,
  McuPinMap,
} from '../lib/jlc/types'
import type { PinAssignment } from '../types'

defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()

const store = useProjectStore()

const port = ref<number | null>(null)
const health = ref<BridgeHealth | null>(null)
const scanning = ref(false)
const windows = ref<EdaWindow[]>([])
const selectedWindowId = ref('')
const project = ref<EdaProjectInfo | null>(null)
const candidates = ref<EdaComponentInfo[]>([])
const selectedCandidate = ref<EdaComponentInfo | null>(null)
const pinMap = ref<McuPinMap | null>(null)
const plan = ref<ImportPlan | null>(null)
const matchMap = ref<Record<string, string>>({})
const loadingProject = ref(false)
const loadingMcus = ref(false)
const loadingPins = ref(false)

const connected = computed(() => port.value !== null && health.value?.edaConnected === true)
const supportedDeviceId = computed(() =>
  pinMap.value ? matchDeviceIdBySymbol(pinMap.value.symbolName, deviceIds) : null,
)

const statusType = computed(() => {
  if (connected.value) return 'success'
  if (port.value) return 'warning'
  return 'info'
})

const statusText = computed(() => {
  if (connected.value) return `已连接 · 端口 ${port.value}`
  if (port.value) return `桥已找到但 EDA 未连接 (端口 ${port.value})`
  return '未连接'
})

function close() {
  emit('update:modelValue', false)
}

async function connect() {
  scanning.value = true
  try {
    const found = await scanBridge()
    if (!found) {
      port.value = null
      health.value = null
      windows.value = []
      ElMessage.warning('未发现本地 Bridge Server，请先启动 bridge-server.mjs 并安装 run-api-gateway 扩展')
      return
    }
    port.value = found.port
    health.value = found.health
    await refreshWindows()
    ElMessage.success(`已连接 Bridge Server（端口 ${found.port}）`)
  } catch (err) {
    ElMessage.error(`连接失败: ${err instanceof Error ? err.message : String(err)}`)
  } finally {
    scanning.value = false
  }
}

async function refreshWindows() {
  if (!port.value) return
  try {
    windows.value = await getEdaWindows(port.value)
    const active = windows.value.find((w) => w.active) ?? windows.value[0]
    selectedWindowId.value = active?.windowId ?? ''
    if (active) await selectEdaWindow(port.value, active.windowId)
  } catch (err) {
    ElMessage.error(`读取 EDA 窗口失败: ${err instanceof Error ? err.message : String(err)}`)
  }
}

async function onWindowChange(windowId: string) {
  if (!port.value || !windowId) return
  try {
    await selectEdaWindow(port.value, windowId)
    project.value = null
    candidates.value = []
    resetPins()
  } catch (err) {
    ElMessage.error(`切换窗口失败: ${err instanceof Error ? err.message : String(err)}`)
  }
}

async function loadProject() {
  if (!port.value) return
  loadingProject.value = true
  try {
    project.value = await fetchProjectInfo(port.value)
    candidates.value = []
    resetPins()
    if (!project.value) ElMessage.warning('EDA 中当前没有打开工程')
  } catch (err) {
    ElMessage.error(`读取工程失败: ${err instanceof Error ? err.message : String(err)}`)
  } finally {
    loadingProject.value = false
  }
}

async function loadMcus() {
  if (!port.value) return
  loadingMcus.value = true
  try {
    candidates.value = await findMcuCandidates(port.value)
    selectedCandidate.value = null
    resetPins()
    if (candidates.value.length === 0) ElMessage.warning('当前原理图中未识别到 MCU 器件')
  } catch (err) {
    ElMessage.error(`扫描器件失败: ${err instanceof Error ? err.message : String(err)}`)
  } finally {
    loadingMcus.value = false
  }
}

function onCandidateChange(candidate: EdaComponentInfo | null) {
  selectedCandidate.value = candidate
  resetPins()
}

function resetPins() {
  pinMap.value = null
  plan.value = null
  matchMap.value = {}
}

async function loadPinMap() {
  if (!port.value || !selectedCandidate.value) return
  loadingPins.value = true
  try {
    pinMap.value = await fetchMcuPinMap(
      port.value,
      selectedCandidate.value.primitiveId,
      selectedWindowId.value || undefined,
    )
    const deviceId = supportedDeviceId.value
    if (deviceId) {
      const device = getDeviceData(deviceId)
      plan.value = buildImportPlan(device, pinMap.value.pins)
      const map: Record<string, string> = {}
      for (const item of plan.value.matched) map[item.edaName] = `→ ${item.canonical}`
      for (const item of plan.value.skipped) {
        map[item.edaName] =
          item.reason === 'not-io'
            ? '电源/空脚'
            : item.reason === 'special'
              ? '特殊引脚'
              : item.reason === 'no-net'
                ? '未连线'
                : '未匹配'
      }
      matchMap.value = map
    } else {
      plan.value = null
      const map: Record<string, string> = {}
      for (const p of pinMap.value.pins) {
        const cls = classifyEdaPin(p.name)
        map[p.name] = cls === 'IO' ? 'IO' : cls === 'POWER' ? '电源' : cls === 'NC' ? '空脚' : '未知'
      }
      matchMap.value = map
    }
  } catch (err) {
    ElMessage.error(`读取引脚失败: ${err instanceof Error ? err.message : String(err)}`)
  } finally {
    loadingPins.value = false
  }
}

function importAssignments(): PinAssignment[] {
  return (plan.value?.matched ?? []).map((item) => ({
    pin: item.canonical,
    label: item.net,
    mode: 'INPUT' as const,
    params: {
      outputType: 'PP',
      speed: '50',
      level: 'HIGH',
      pull: 'NONE',
      exti: { enabled: false, edge: 'FALLING' },
    },
  }))
}

async function applyPlan() {
  if (!plan.value || !supportedDeviceId.value) return
  const count = plan.value.matched.length
  if (count === 0) {
    ElMessage.warning('没有可导入的引脚')
    return
  }
  try {
    await ElMessageBox.confirm(
      `将导入 ${count} 个引脚（网络名作为标签，默认输入模式，可稍后调整）。\n当前已有配置会被替换，是否继续？`,
      '确认导入',
      { type: 'warning' },
    )
  } catch {
    return
  }
  if (store.projectName === 'untitled' && project.value?.name) {
    store.projectName = project.value.name
  }
  store.applyImport(plan.value.deviceId, importAssignments())
  ElMessage.success(`已导入 ${count} 个引脚配置`)
  close()
}

function closeText(name: string): string {
  if (supportedDeviceId.value) {
    const canonical = normalizeEdaPinName(getDeviceData(supportedDeviceId.value), name)
    if (canonical) return `→ ${canonical}`
  }
  return ''
}
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    title="嘉立创 EDA Pro 对接"
    width="880px"
    top="6vh"
    @close="close"
  >
    <div class="jlc-panel">
      <section class="section">
        <div class="section-title">1. 连接本地桥</div>
        <div class="row">
          <el-tag :type="statusType" size="small">{{ statusText }}</el-tag>
          <el-button size="small" type="primary" :loading="scanning" @click="connect">
            扫描连接
          </el-button>
          <el-button size="small" :disabled="!port" @click="refreshWindows">刷新窗口</el-button>
          <span class="hint">需先启动 bridge-server.mjs，并安装 run-api-gateway 扩展</span>
        </div>
        <div v-if="windows.length" class="row">
          <span class="label">EDA 窗口</span>
          <el-radio-group :model-value="selectedWindowId" size="small" @change="onWindowChange">
            <el-radio v-for="w in windows" :key="w.windowId" :value="w.windowId">
              {{ w.windowId.slice(0, 8) }}{{ w.active ? '（当前）' : '' }}
            </el-radio>
          </el-radio-group>
        </div>
      </section>

      <section v-if="port" class="section">
        <div class="section-title">2. 工程与 MCU</div>
        <div class="row">
          <el-button
            size="small"
            type="primary"
            plain
            :loading="loadingProject"
            :disabled="!selectedWindowId"
            @click="loadProject"
          >
            读取当前工程
          </el-button>
          <span v-if="project" class="info">
            工程：{{ project.name }}
            <template v-if="project.boards?.length">
              （{{ project.boards.map((b) => b.name).join(' / ') }}）
            </template>
          </span>
        </div>
        <div v-if="project" class="row" style="margin-top: 8px">
          <el-button size="small" :loading="loadingMcus" @click="loadMcus">
            扫描原理图 MCU
          </el-button>
          <span v-if="candidates.length" class="info">找到 {{ candidates.length }} 个候选器件</span>
        </div>
        <el-table
          v-if="project"
          :data="candidates"
          size="small"
          max-height="160"
          highlight-current-row
          @current-change="onCandidateChange"
        >
          <el-table-column prop="designator" label="位号" width="80" />
          <el-table-column prop="symbolName" label="符号 / 型号" />
        </el-table>
        <div v-if="selectedCandidate" class="row" style="margin-top: 8px">
          <el-button
            size="small"
            type="primary"
            :loading="loadingPins"
            @click="loadPinMap"
          >
            读取 {{ selectedCandidate.designator }} 引脚配置
          </el-button>
        </div>
      </section>

      <section v-if="pinMap" class="section">
        <div class="section-title">3. 引脚预览与导入</div>
        <div class="row">
          <span class="info">
            {{ pinMap.designator || pinMap.componentId }} ·
            {{ pinMap.symbolName }} · {{ pinMap.pins.length }} 脚
          </span>
          <el-button
            size="small"
            type="success"
            :disabled="!plan || plan.matched.length === 0"
            @click="applyPlan"
          >
            导入到工程（{{ plan?.matched.length ?? 0 }}）
          </el-button>
        </div>
        <el-alert
          v-if="!supportedDeviceId"
          type="warning"
          :closable="false"
          show-icon
          title="该器件不在 MCUCubeMX 支持列表内"
          :description="`当前支持：${deviceIds.join(' / ')}。仍可预览引脚网络，但无法导入。`"
          style="margin: 8px 0"
        />
        <el-alert
          v-else
          type="success"
          :closable="false"
          show-icon
          :title="`匹配器件：${supportedDeviceId}，可导入 ${plan?.matched.length ?? 0} 个引脚`"
          style="margin: 8px 0"
        />
        <el-table :data="pinMap.pins" size="small" max-height="300">
          <el-table-column prop="number" label="引脚号" width="70" />
          <el-table-column prop="name" label="符号引脚名" />
          <el-table-column prop="net" label="网络" width="140">
            <template #default="{ row }">
              <span :class="{ 'net-empty': !row.net }">{{ row.net ?? '—' }}</span>
            </template>
          </el-table-column>
          <el-table-column label="匹配" width="110">
            <template #default="{ row }">
              <span class="match">{{ matchMap[row.name] ?? closeText(row.name) }}</span>
            </template>
          </el-table-column>
        </el-table>
        <div v-if="plan" class="summary">
          可导入 {{ plan.matched.length }} 个，跳过 {{ plan.skipped.length }} 个
          （未匹配 / 电源 / 特殊引脚 / 未连线不纳入生成）
        </div>
      </section>
    </div>
  </el-dialog>
</template>

<style scoped>
.jlc-panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.section {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 10px 12px;
}
.section-title {
  font-weight: 600;
  margin-bottom: 8px;
  font-size: 13px;
  color: #374151;
}
.row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.label {
  color: #6b7280;
  font-size: 12px;
}
.info {
  color: #374151;
  font-size: 13px;
}
.hint {
  color: #9ca3af;
  font-size: 12px;
}
.net-empty {
  color: #c0c4cc;
}
.match {
  font-size: 12px;
  color: #409eff;
}
.summary {
  margin-top: 8px;
  font-size: 12px;
  color: #6b7280;
}
</style>
