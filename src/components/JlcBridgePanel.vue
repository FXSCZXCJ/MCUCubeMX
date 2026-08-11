<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useProjectStore } from '../stores/project'
import { getDeviceData, deviceIds } from '../data/device'
import {
  applySyncActions,
  fetchMcuPinMap,
  fetchProjectInfo,
  findMcuCandidates,
  getSelectedPrimitiveIds,
  getEdaWindows,
  scanBridge,
  selectEdaWindow,
} from '../lib/jlc/bridge'
import {
  buildExportPlan,
  buildImportDiff,
  buildImportPlan,
  classifyEdaPin,
  matchDeviceIdBySymbol,
  normalizeEdaPinName,
  pickRememberedMcu,
  prioritizeSelectedCandidates,
  resolveModelName,
} from '../lib/jlc/import'
import { loadPrefs, mergePrefs, savePrefs } from '../lib/jlc/prefs'
import type { JlcPrefs } from '../lib/jlc/prefs'
import type {
  BridgeHealth,
  EdaComponentInfo,
  EdaProjectInfo,
  EdaWindow,
  ExportPlan,
  ImportDiffItem,
  ImportChangeKind,
  ImportPlan,
  McuPinMap,
  SyncAction,
} from '../lib/jlc/types'
import type { PinAssignment } from '../types'

const props = defineProps<{
  modelValue: boolean
  pendingAction?: 'sync' | 'import' | null
}>()
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'action-consumed': []
}>()

const store = useProjectStore()

const port = ref<number | null>(null)
const health = ref<BridgeHealth | null>(null)
const scanning = ref(false)
const windows = ref<EdaWindow[]>([])
const selectedWindowId = ref('')
const project = ref<EdaProjectInfo | null>(null)
const candidates = ref<EdaComponentInfo[]>([])
const selectedIds = ref<string[]>([])
const selectedCandidate = ref<EdaComponentInfo | null>(null)
const pinMap = ref<McuPinMap | null>(null)
const plan = ref<ImportPlan | null>(null)
const matchMap = ref<Record<string, string>>({})
const importPreview = ref<ImportDiffItem[] | null>(null)
const exportPreview = ref<ExportPlan | null>(null)
const exporting = ref(false)
const syncing = ref(false)
const prefs = ref<JlcPrefs>(loadPrefs())
const loadingProject = ref(false)
const loadingMcus = ref(false)
const loadingPins = ref(false)

const connected = computed(() => port.value !== null && health.value?.edaConnected === true)
const supportedDeviceId = computed(() =>
  pinMap.value ? matchDeviceIdBySymbol(pinMap.value.modelName || pinMap.value.symbolName, deviceIds) : null,
)
const symbolMismatch = computed(
  () =>
    !!pinMap.value &&
    !!pinMap.value.modelName &&
    !!pinMap.value.symbolName &&
    pinMap.value.modelName !== pinMap.value.symbolName,
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

const otherBoards = computed(() =>
  (project.value?.boards ?? []).filter((b) => b.name !== project.value?.currentBoard),
)

const kindLabels: Record<ImportChangeKind, string> = {
  add: '新增',
  change: '修改',
  keep: '不变',
  remove: '移除',
}

function kindText(kind: string): string {
  return kindLabels[kind as ImportChangeKind] ?? kind
}

function isNetworkError(err: unknown): boolean {
  return (
    err instanceof TypeError ||
    (err instanceof Error && /failed to fetch|networkerror|fetch failed/i.test(err.message))
  )
}

function bridgeErrorMessage(err: unknown, portValue: number | null): string {
  if (isNetworkError(err)) {
    return `无法连接本地桥 (127.0.0.1:${portValue ?? '49620-49629'})：请先运行 npm run jlc:bridge，并确认桥进程存活`
  }
  return err instanceof Error ? err.message : String(err)
}

function close() {
  emit('update:modelValue', false)
}

async function connect(silent = false) {
  scanning.value = true
  try {
    const found = await scanBridge()
    if (!found) {
      port.value = null
      health.value = null
      windows.value = []
      if (!silent) ElMessage.warning('未发现本地 Bridge Server，请先运行 npm run jlc:bridge')
      return
    }
    port.value = found.port
    health.value = found.health
    await refreshWindows()
    if (!silent) ElMessage.success(`已连接 Bridge Server（端口 ${found.port}）`)
  } catch (err) {
    if (!silent) ElMessage.error(`连接失败: ${bridgeErrorMessage(err, port.value)}`)
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
    ElMessage.error(`读取 EDA 窗口失败: ${bridgeErrorMessage(err, port.value)}`)
  }
}

async function onWindowChange(windowId: string) {
  if (!port.value || !windowId) return
  try {
    await selectEdaWindow(port.value, windowId)
    project.value = null
    candidates.value = []
    selectedIds.value = []
    resetPins()
  } catch (err) {
    ElMessage.error(`切换窗口失败: ${bridgeErrorMessage(err, port.value)}`)
  }
}

async function loadProject() {
  if (!port.value) return
  loadingProject.value = true
  try {
    project.value = await fetchProjectInfo(port.value)
    candidates.value = []
    selectedIds.value = []
    resetPins()
    if (!project.value) ElMessage.warning('EDA 中当前没有打开工程')
  } catch (err) {
    // 桥中途掉线是常见原因：尝试重连一次后重试
    if (isNetworkError(err)) {
      await connect(true)
      if (port.value) {
        try {
          project.value = await fetchProjectInfo(port.value)
          candidates.value = []
          selectedIds.value = []
          resetPins()
          return
        } catch {
          /* 交给下面的统一提示 */
        }
      }
    }
    ElMessage.error(`读取工程失败: ${bridgeErrorMessage(err, port.value)}`)
  } finally {
    loadingProject.value = false
  }
}

async function loadMcus() {
  if (!port.value) return
  loadingMcus.value = true
  try {
    const all = await findMcuCandidates(port.value)
    let selected: string[] = []
    try {
      selected = await getSelectedPrimitiveIds(port.value, selectedWindowId.value || undefined)
    } catch {
      /* 读取选中失败不影响候选列表 */
    }
    selectedIds.value = selected
    const { list, preferred } = prioritizeSelectedCandidates(all, selected)
    candidates.value = list.map((c) => ({ ...c, modelName: resolveModelName(c) }))
    selectedCandidate.value = preferred
    resetPins()
    if (candidates.value.length === 0) {
      ElMessage.warning('当前原理图中未识别到 MCU 器件')
    } else if (preferred) {
      ElMessage.success(`已优先选中 EDA 中鼠标选中的 ${preferred.designator}（${preferred.symbolName}）`)
    }
  } catch (err) {
    ElMessage.error(`扫描器件失败: ${bridgeErrorMessage(err, port.value)}`)
  } finally {
    loadingMcus.value = false
  }
}

function onCandidateChange(candidate: EdaComponentInfo | null) {
  selectedCandidate.value = candidate
  resetPins()
  if (candidate) {
    mergePrefs({
      designator: candidate.designator,
      symbolName: candidate.symbolName || candidate.modelName,
    })
  }
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
    mergePrefs({
      designator: pinMap.value.designator,
      symbolName: pinMap.value.symbolName || pinMap.value.modelName,
      deviceId: supportedDeviceId.value ?? store.deviceId,
    })
  } catch (err) {
    ElMessage.error(`读取引脚失败: ${bridgeErrorMessage(err, port.value)}`)
  } finally {
    loadingPins.value = false
  }
}

/** 静默跑完整链路：连桥 → 窗口 → 工程 → MCU → 引脚映射 */
async function autoSetup(): Promise<boolean> {
  if (!port.value || !health.value?.edaConnected) {
    await connect(true)
  }
  if (!port.value) return false
  if (!project.value) await loadProject()
  if (candidates.value.length === 0) await loadMcus()

  const remembered = pickRememberedMcu(candidates.value, prefs.value.designator)
  if (remembered && selectedCandidate.value?.primitiveId !== remembered.primitiveId) {
    selectedCandidate.value = remembered
    resetPins()
  }
  if (!selectedCandidate.value && candidates.value.length > 0) {
    selectedCandidate.value = candidates.value[0]
  }
  if (!pinMap.value && selectedCandidate.value) await loadPinMap()
  return !!pinMap.value
}

async function oneClickSync() {
  if (syncing.value) return
  syncing.value = true
  try {
    const ok = await autoSetup()
    if (!ok) {
      ElMessage.warning('自动准备失败：请检查桥与 EDA 连接状态')
      return
    }
    if (!supportedDeviceId.value) {
      ElMessage.warning('当前 MCU 不在支持列表，无法同步')
      return
    }
    prepareExport()
    if (!exportPreview.value) return
    if (prefs.value.autoSync) {
      await confirmExport()
    }
    // 未开启免确认时，等待用户在变更对比对话框里点“执行同步”
  } finally {
    syncing.value = false
  }
}

let setupPromise: Promise<boolean> | null = null

/** 保证只跑一次完整准备链路，后续动作复用其结果 */
function ensureSetup(): Promise<boolean> {
  if (!setupPromise) {
    setupPromise = autoSetup().finally(() => {
      setupPromise = null
    })
  }
  return setupPromise
}

watch(
  () => props.pendingAction,
  (action) => {
    if (!action) return
    void (async () => {
      await ensureSetup()
      if (action === 'sync') {
        await oneClickSync()
      } else {
        applyPlan()
      }
      emit('action-consumed')
    })()
  },
  { immediate: true },
)

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

function applyPlan() {
  if (!plan.value || !supportedDeviceId.value) return
  if (plan.value.matched.length === 0) {
    ElMessage.warning('没有可导入的引脚')
    return
  }
  importPreview.value = buildImportDiff(store.assignments, plan.value)
}

function confirmImport() {
  if (!plan.value || !importPreview.value) return
  const added = importPreview.value.filter((i) => i.kind === 'add').length
  const changed = importPreview.value.filter((i) => i.kind === 'change').length
  const removed = importPreview.value.filter((i) => i.kind === 'remove').length
  if (store.projectName === 'untitled' && project.value?.name) {
    store.projectName = project.value.name
  }
  store.applyImport(plan.value.deviceId, importAssignments())
  importPreview.value = null
  ElMessage.success(
    `已导入 ${plan.value.matched.length} 个引脚（新增 ${added}、修改 ${changed}、移除 ${removed}）`,
  )
  close()
}

function prepareExport() {
  if (!port.value || !pinMap.value || !supportedDeviceId.value) return
  const device = getDeviceData(supportedDeviceId.value)
  exportPreview.value = buildExportPlan(device, store.config.pins, pinMap.value.pins)
}

async function confirmExport() {
  if (!port.value || !exportPreview.value) return
  const changes = exportPreview.value.changes
  if (changes.length === 0) {
    ElMessage.info('没有需要同步的网络变更')
    exportPreview.value = null
    return
  }
  exporting.value = true
  try {
    const syncActions: SyncAction[] = changes.map((c) => ({
      action: c.action ?? 'place-port',
      net: c.newNet,
      x: c.x ?? 0,
      y: c.y ?? 0,
      direction: c.mode === 'OUTPUT' ? 'OUT' : 'IN',
      rotation: c.rotation ?? 0,
      portId: c.portId,
      oldNet: c.oldNet,
    }))
    const result = await applySyncActions(
      port.value,
      syncActions,
      selectedWindowId.value || undefined,
    )
    const fail = result.failed.length ? `，失败 ${result.failed.length}` : ''
    ElMessage.success(
      `同步完成：更新端口 ${result.updated}、更换端口 ${result.replaced}、改线段网络 ${result.renamed}、新增端口 ${result.placed}${fail}`,
    )
    exportPreview.value = null
    await loadPinMap()
  } catch (err) {
    ElMessage.error(`同步失败: ${bridgeErrorMessage(err, port.value)}`)
  } finally {
    exporting.value = false
  }
}

function closeText(name: string): string {
  if (supportedDeviceId.value) {
    const canonical = normalizeEdaPinName(getDeviceData(supportedDeviceId.value), name)
    if (canonical) return `→ ${canonical}`
  }
  return ''
}

const actionLabels: Record<string, string> = {
  'update-port': '更新端口',
  'replace-port': '更换端口',
  'rename-wire': '改线段网络',
  'place-port': '新增端口',
}

function actionText(action: string | undefined): string {
  return actionLabels[action ?? ''] ?? '—'
}

onMounted(() => {
  void ensureSetup()
})
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
        <div class="row" style="margin-bottom: 8px">
          <el-button size="small" type="primary" :loading="syncing" @click="oneClickSync">
            一键同步
          </el-button>
          <el-checkbox v-model="prefs.autoSync" size="small" @change="savePrefs(prefs)">
            同步免确认
          </el-checkbox>
          <span class="hint">首次手动配置一次，之后自动恢复所选 MCU</span>
        </div>
        <div class="row">
          <el-tag :type="statusType" size="small">{{ statusText }}</el-tag>
          <el-button size="small" type="primary" :loading="scanning" @click="connect">
            扫描连接
          </el-button>
          <el-button size="small" :disabled="!port" @click="refreshWindows">刷新窗口</el-button>
          <span class="hint">需先启动 bridge-server.mjs，并安装 run-api-gateway 扩展</span>
        </div>
        <el-alert
          v-if="!port"
          type="info"
          :closable="false"
          show-icon
          title="未检测到本地桥"
          description="请先在终端运行 npm run jlc:bridge（或 npm run dev:all 一键启动），并确保 EDA 已安装 run-api-gateway 扩展。"
          style="margin-top: 8px"
        />
        <el-alert
          v-else-if="!health?.edaConnected"
          type="warning"
          :closable="false"
          show-icon
          title="桥已启动但 EDA 未连接"
          description="请在 EDA 顶部菜单 API Gateway → 重新连接；若仍失败，检查扩展管理器已勾选“允许外部交互”。"
          style="margin-top: 8px"
        />
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
          <template v-if="project">
            <span class="info">工程：{{ project.name }}</span>
            <el-tag v-if="project.currentBoard" size="small" type="success">
              当前板：{{ project.currentBoard }}
            </el-tag>
            <el-tag v-if="project.currentPage" size="small" type="success" effect="plain">
              当前页：{{ project.currentPage }}
            </el-tag>
          </template>
        </div>
        <el-collapse v-if="project && otherBoards.length" class="boards-collapse">
          <el-collapse-item :title="`其他板（${otherBoards.length}）`" name="other">
            <div v-for="b in otherBoards" :key="b.name" class="board-item">
              {{ b.name }}
              <span v-if="b.schematicName" class="sub">· {{ b.schematicName }}</span>
              <div v-if="b.pages?.length" class="pages">
                <el-tag
                  v-for="p in b.pages"
                  :key="p"
                  size="small"
                  :type="b.name === project?.currentBoard && p === project?.currentPage ? 'success' : 'info'"
                  class="page-tag"
                >
                  {{ p }}
                </el-tag>
              </div>
            </div>
          </el-collapse-item>
        </el-collapse>
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
          <el-table-column label="型号">
            <template #default="{ row }">
              <span>{{ row.modelName || row.symbolName }}</span>
              <span v-if="row.modelName && row.modelName !== row.symbolName" class="sub">
                （符号 {{ row.symbolName }}）
              </span>
            </template>
          </el-table-column>
          <el-table-column label="来源" width="110">
            <template #default="{ row }">
              <el-tag
                v-if="selectedIds.includes(row.primitiveId)"
                type="warning"
                size="small"
              >
                EDA 已选中
              </el-tag>
            </template>
          </el-table-column>
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
            {{ pinMap.modelName || pinMap.symbolName }} · {{ pinMap.pins.length }} 脚
            <span v-if="symbolMismatch" class="sub">（符号 {{ pinMap.symbolName }}）</span>
          </span>
          <el-button
            size="small"
            type="success"
            :disabled="!plan || plan.matched.length === 0"
            @click="applyPlan"
          >
            导入到工程（{{ plan?.matched.length ?? 0 }}）
          </el-button>
          <el-button
            size="small"
            type="warning"
            plain
            :disabled="!supportedDeviceId || store.assignedCount === 0"
            :loading="exporting"
            @click="prepareExport"
          >
            同步到 EDA
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
          v-else-if="symbolMismatch"
          type="warning"
          :closable="false"
          show-icon
          title="符号名与器件名不一致，请核对引脚定义"
          :description="`器件显示为 ${pinMap?.modelName}，但所附符号名为 ${pinMap?.symbolName}。该符号可能是其它芯片改名而来（本工程 U1 符号疑似由 STM32L100RCT6 改的），导入前请对照数据手册确认 64 脚定义一致。`"
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

  <el-dialog
    :model-value="!!importPreview"
    title="确认导入（变更对比）"
    width="720px"
    top="8vh"
    @close="importPreview = null"
  >
    <el-alert
      type="info"
      :closable="false"
      show-icon
      title="导入将整体替换当前引脚配置，网络名作为标签，默认输入模式"
      style="margin-bottom: 8px"
    />
    <el-table :data="importPreview ?? []" size="small" max-height="320">
      <el-table-column prop="pin" label="引脚" width="90" />
      <el-table-column label="类型" width="80">
        <template #default="{ row }">
          <el-tag
            size="small"
            :type="
              row.kind === 'remove'
                ? 'danger'
                : row.kind === 'change'
                  ? 'warning'
                  : row.kind === 'add'
                    ? 'success'
                    : 'info'
            "
          >
            {{ kindText(row.kind) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="当前">
        <template #default="{ row }">
          {{ row.oldLabel || '—' }}
          <span v-if="row.oldMode" class="sub">· {{ row.oldMode }}</span>
        </template>
      </el-table-column>
      <el-table-column label="导入后">
        <template #default="{ row }">
          <span class="match">{{ row.newLabel || '—' }}</span>
          <span v-if="row.newMode" class="sub">· {{ row.newMode }}</span>
        </template>
      </el-table-column>
    </el-table>
    <template #footer>
      <el-button @click="importPreview = null">取消</el-button>
      <el-button type="primary" @click="confirmImport">确认导入</el-button>
    </template>
  </el-dialog>

  <el-dialog
    :model-value="!!exportPreview"
    title="确认同步到 EDA（变更对比）"
    width="720px"
    top="8vh"
    @close="exportPreview = null"
  >
    <template v-if="exportPreview">
      <el-alert
        type="warning"
        :closable="false"
        show-icon
        title="按引脚现有连接方式同步：端口方向不符→删除重放；线段→改线段网络；未连→新增 IN/OUT 端口"
        :description="`跳过 ${exportPreview.skipped.length} 条（无标签/特殊引脚/未找到引脚）。`"
        style="margin-bottom: 8px"
      />
      <el-table :data="exportPreview.changes" size="small" max-height="280">
        <el-table-column prop="pin" label="引脚" width="90" />
        <el-table-column prop="edaName" label="EDA 引脚" width="150" />
        <el-table-column label="操作" width="100">
          <template #default="{ row }">
            <el-tag
              size="small"
              :type="
                row.action === 'replace-port'
                  ? 'danger'
                  : row.action === 'update-port'
                    ? 'warning'
                    : row.action === 'rename-wire'
                      ? 'primary'
                      : 'success'
              "
            >
              {{ actionText(row.action) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="当前网络">
          <template #default="{ row }">{{ row.oldNet ?? '未连接' }}</template>
        </el-table-column>
        <el-table-column label="目标网络">
          <template #default="{ row }">
            <span class="match">{{ row.newNet }}</span>
          </template>
        </el-table-column>
      </el-table>
      <div class="summary">
        将同步 {{ exportPreview.changes.length }} 个引脚（更新端口 / 改线段 / 新增端口）；
        {{ exportPreview.kept.length }} 条无需改动；
        跳过 {{ exportPreview.skipped.length }} 条。
      </div>
    </template>
    <template #footer>
      <el-button @click="exportPreview = null">取消</el-button>
      <el-button
        type="warning"
        :loading="exporting"
        :disabled="!exportPreview || exportPreview.changes.length === 0"
        @click="confirmExport"
      >
        执行同步
      </el-button>
    </template>
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
.sub {
  font-size: 12px;
  color: #9ca3af;
}
.summary {
  margin-top: 8px;
  font-size: 12px;
  color: #6b7280;
}
.boards-collapse {
  margin-top: 8px;
  border: 1px solid #f0f1f3;
  border-radius: 6px;
}
.board-item {
  font-size: 12px;
  padding: 3px 6px;
  color: #374151;
}
.pages {
  margin-top: 4px;
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.page-tag {
  cursor: default;
}
</style>
