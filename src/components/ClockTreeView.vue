<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useProjectStore } from '../stores/project'
import { validateClock } from '../lib/clock'
import { buildClockTree, peripheralsOf } from '../lib/clock/tree'
import { normalizeRotation } from '../lib/packageSvg'

const store = useProjectStore()
const spec = computed(() => store.deviceData.clockSpec)
const config = computed(() => store.clock)
const focus = ref<string | null>(null)

const validation = computed(() => validateClock(spec.value, config.value))
const tree = computed(() =>
  buildClockTree(spec.value, config.value, validation.value.chain, validation.value),
)

/* ===== 旋转 / 缩放 / 自适应 ===== */
const stageRef = ref<HTMLElement | null>(null)
const svgRef = ref<SVGSVGElement | null>(null)
const autoFit = ref(true)
const manualFactor = ref(1)
const autoZoom = ref(1)
const rotation = ref(0)
const bboxW = ref(tree.value.width)
const bboxH = ref(tree.value.height)
const MIN_ZOOM = 0.4
const MAX_ZOOM = 2.5

const effectiveZoom = computed(() =>
  Math.min(
    MAX_ZOOM,
    Math.max(MIN_ZOOM, autoFit.value ? autoZoom.value * manualFactor.value : manualFactor.value),
  ),
)

// 旋转时钟树时文字反向补偿，保持水平可读
const textStyle = computed(() => ({ transform: `rotate(${-rotation.value}deg)` }))

let observer: ResizeObserver | null = null

function updateAutoZoom() {
  const el = stageRef.value
  if (!el) return
  const width = el.clientWidth
  const height = el.clientHeight
  if (width <= 0 || height <= 0) return
  let w = tree.value.width
  let h = tree.value.height
  if (svgRef.value) {
    try {
      const bb = svgRef.value.getBBox()
      if (bb.width > 0 && bb.height > 0) {
        w = bb.width
        h = bb.height
      }
    } catch {
      /* 保持默认尺寸 */
    }
  }
  const rad = (rotation.value * Math.PI) / 180
  const c = Math.abs(Math.cos(rad))
  const s = Math.abs(Math.sin(rad))
  const rotW = w * c + h * s
  const rotH = w * s + h * c
  bboxW.value = rotW
  bboxH.value = rotH
  autoZoom.value = Math.min(
    MAX_ZOOM,
    Math.max(MIN_ZOOM, Math.min(width / rotW, height / rotH)),
  )
}

function rotateBy(delta: number) {
  rotation.value = normalizeRotation(rotation.value + delta)
  updateAutoZoom()
}

function changeManual(delta: number) {
  manualFactor.value = Math.min(2, Math.max(0.5, Math.round((manualFactor.value + delta) * 20) / 20))
}

function reset() {
  autoFit.value = true
  manualFactor.value = 1
  rotation.value = 0
  updateAutoZoom()
}

function onWheel(event: WheelEvent) {
  const factor = event.deltaY < 0 ? 1.1 : 1 / 1.1
  manualFactor.value = Math.min(2, Math.max(0.5, manualFactor.value * factor))
}

onMounted(() => {
  observer = new ResizeObserver(updateAutoZoom)
  if (stageRef.value) observer.observe(stageRef.value)
  window.addEventListener('resize', updateAutoZoom)
  updateAutoZoom()
})

onUnmounted(() => {
  observer?.disconnect()
  window.removeEventListener('resize', updateAutoZoom)
})

/* ===== 编辑交互 ===== */
function nodeSection(id: string): string {
  if (id === 'pll') return 'pll'
  if (id === 'sysclk') return 'sysclk'
  if (id === 'ahb') return 'ahb'
  if (id === 'apb1') return 'apb1'
  if (id === 'apb2') return 'apb2'
  if (id === 'adc') return 'adc'
  return 'source'
}

function onNodeClick(id: string) {
  // 点击 PLL 节点且当前未启用 PLL 时，先切换系统源为 PLL
  if (id === 'pll' && config.value.source !== 'PLL') {
    store.setClock({ source: 'PLL' })
  }
  focus.value = nodeSection(id)
}

function setPllParam(key: string, value: number | undefined) {
  if (value === undefined) return
  store.setClock({ pll: { ...config.value.pll, [key]: value } })
}

function nodeOf(id: string) {
  return tree.value.nodes.find((n) => n.id === id)
}

function fmtFreq(v: number | null, max: number): string {
  const s = v === null || !Number.isFinite(v) ? '无效' : `${Math.round(v * 1000) / 1000} MHz`
  return `${s} / 上限 ${max} MHz`
}

function overLimit(v: number | null, max: number): boolean {
  return v !== null && Number.isFinite(v) && v > max
}

const summaryKeys = ['sysclkMhz', 'ahbMhz', 'apb1Mhz', 'apb2Mhz', 'adcMhz'] as const
function summaryMax(key: (typeof summaryKeys)[number]): number {
  switch (key) {
    case 'sysclkMhz':
      return spec.value.sysclkMaxMhz
    case 'ahbMhz':
      return spec.value.ahb.maxMhz
    case 'apb1Mhz':
      return spec.value.apb1.maxMhz
    case 'apb2Mhz':
      return spec.value.apb2.maxMhz
    case 'adcMhz':
      return spec.value.adc.maxMhz
  }
}

function summaryLabel(key: (typeof summaryKeys)[number]): string {
  return key.replace('Mhz', '').toUpperCase()
}

function summaryVal(v: number | null): string {
  return v === null || !Number.isFinite(v) ? '—' : `${Math.round(v * 1000) / 1000} MHz`
}

function peripheralsOfNode(id: string): string[] {
  return peripheralsOf(spec.value, id)
}

const clockSelectEntries = computed(() => Object.entries(spec.value.clockSelect ?? {}))
</script>

<template>
  <div class="clock-view">
    <div class="view-header">
      <div class="view-title">时钟树配置</div>
      <div class="view-tools">
        <el-tag :type="validation.ok ? 'success' : 'danger'" size="small">
          {{ validation.ok ? '链路合法' : `${validation.errors.length} 项错误` }}
        </el-tag>
        <el-button size="small" @click="store.resetClock()">恢复默认时钟</el-button>
      </div>
    </div>

    <div class="clock-body">
      <div class="tree-pane">
        <div class="clock-toolbar">
          <span class="zoom-label">显示比例 {{ Math.round(effectiveZoom * 100) }}%</span>
          <el-switch v-model="autoFit" size="small" active-text="自动适配" />
          <el-button-group>
            <el-button size="small" title="缩小" @click="changeManual(-0.25)">−</el-button>
            <el-button size="small" title="重置缩放与旋转" @click="reset">重置</el-button>
            <el-button size="small" title="放大" @click="changeManual(0.25)">＋</el-button>
          </el-button-group>
          <span class="zoom-label">旋转 {{ rotation }}°</span>
          <el-button-group>
            <el-button size="small" title="逆时针旋转 45°" @click="rotateBy(-45)">⟲45°</el-button>
            <el-button size="small" title="复位旋转" @click="rotateBy(360 - rotation)">复位</el-button>
            <el-button size="small" title="顺时针旋转 45°" @click="rotateBy(45)">⟳45°</el-button>
          </el-button-group>
          <span class="zoom-label">滚轮缩放</span>
        </div>
        <div ref="stageRef" class="clock-stage" @wheel.prevent="onWheel">
          <div
            class="clock-rotator"
            :style="{ width: `${bboxW * effectiveZoom}px`, height: `${bboxH * effectiveZoom}px` }"
          >
            <svg
              ref="svgRef"
              :width="tree.width * effectiveZoom"
              :height="tree.height * effectiveZoom"
              :viewBox="`0 0 ${tree.width} ${tree.height}`"
              :style="{ transform: `translate(-50%, -50%) rotate(${rotation}deg)` }"
              class="clock-svg"
            >
              <defs>
                <marker
                  id="arrow"
                  viewBox="0 0 10 10"
                  refX="9"
                  refY="5"
                  markerWidth="7"
                  markerHeight="7"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" />
                </marker>
                <marker
                  id="arrow-err"
                  viewBox="0 0 10 10"
                  refX="9"
                  refY="5"
                  markerWidth="7"
                  markerHeight="7"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="#ef4444" />
                </marker>
              </defs>
              <g v-for="e in tree.edges" :key="e.id">
                <path
                  :d="e.path"
                  :class="{ 'edge-err': e.error }"
                  :marker-end="e.error ? 'url(#arrow-err)' : 'url(#arrow)'"
                  class="tree-edge"
                />
                <text
                  v-if="e.label"
                  :x="(nodeOf(e.from)!.x + nodeOf(e.from)!.w / 2 + nodeOf(e.to)!.x + nodeOf(e.to)!.w / 2) / 2"
                  :y="(nodeOf(e.from)!.y + nodeOf(e.from)!.h + nodeOf(e.to)!.y) / 2"
                  class="edge-label tree-text"
                  :style="textStyle"
                  text-anchor="middle"
                >
                  {{ e.label }}
                </text>
              </g>
              <g
                v-for="n in tree.nodes"
                :key="n.id"
                class="tree-node"
                @click="onNodeClick(n.id)"
              >
                <title>{{ n.title }}</title>
                <rect
                  :x="n.x"
                  :y="n.y"
                  :width="n.w"
                  :height="n.h"
                  rx="8"
                  :class="{
                    'node-active': n.active,
                    'node-error': n.error,
                    'node-idle': !n.active && !n.error,
                    'node-source': n.kind === 'source',
                  }"
                />
                <text
                  :x="n.x + n.w / 2"
                  :y="n.y + 23"
                  text-anchor="middle"
                  class="node-label tree-text"
                  :style="textStyle"
                >
                  {{ n.label }}
                </text>
                <text
                  :x="n.x + n.w / 2"
                  :y="n.y + 42"
                  text-anchor="middle"
                  class="node-sub tree-text"
                  :style="textStyle"
                >
                  {{ n.sub }}
                </text>
              </g>
              <g
                v-for="chip in tree.chips"
                :key="`${chip.node}-${chip.label}`"
                class="peri-chip"
                @click="onNodeClick(chip.node)"
              >
                <title>点击聚焦 {{ chip.label }} 所属总线配置</title>
                <rect :x="chip.x" :y="chip.y" :width="chip.w" height="16" rx="8" />
                <text
                  :x="chip.x + chip.w / 2"
                  :y="chip.y + 11"
                  text-anchor="middle"
                  class="chip-text tree-text"
                  :style="textStyle"
                >
                  {{ chip.label }}
                </text>
              </g>
            </svg>
          </div>
        </div>
        <div class="tree-tip">点击节点可在右侧编辑对应参数；非法项会以红色标出</div>
      </div>

      <div class="editor-pane">
        <section id="sec-source" class="sec" :class="{ 'sec-focus': focus === 'source' }">
          <div class="sec-title">系统时钟源</div>
          <el-radio-group
            :model-value="config.source"
            @update:model-value="(v: string) => store.setClock({ source: v })"
          >
            <el-radio-button v-for="s in spec.sources" :key="s.id" :value="s.id">
              {{ s.label }}
            </el-radio-button>
          </el-radio-group>
          <div v-if="config.source === 'HXTAL'" class="field">
            <span class="field-label">HXTAL 频率</span>
            <el-input-number
              :model-value="config.hxtalMhz"
              :min="spec.sources.find((s) => s.hxtal)?.hxtal?.min"
              :max="spec.sources.find((s) => s.hxtal)?.hxtal?.max"
              :step="1"
              size="small"
              @update:model-value="(v: number | undefined) => v !== undefined && store.setClock({ hxtalMhz: v })"
            />
            <span class="unit">MHz</span>
          </div>
          <div class="hint">IRC/HXTAL 直连时 SYSCLK 即该源频率；选择 PLL 后进入下方 PLL 配置。</div>
        </section>

        <section
          id="sec-pll"
          class="sec"
          :class="{ 'sec-focus': focus === 'pll', 'sec-dim': config.source !== 'PLL' }"
        >
          <div class="sec-title">
            PLL 配置
            <el-tag v-if="config.source !== 'PLL'" size="small" type="info">未使用</el-tag>
          </div>
          <template v-if="config.source === 'PLL'">
            <div class="field">
              <span class="field-label">PLL 输入源</span>
              <el-select
                :model-value="config.pllSource"
                size="small"
                style="width: 180px"
                @update:model-value="(v: string) => store.setClock({ pllSource: v })"
              >
                <el-option
                  v-for="id in spec.pll.sourceOptions"
                  :key="id"
                  :label="spec.sources.find((s) => s.id === id)?.label ?? id"
                  :value="id"
                />
              </el-select>
            </div>
            <div v-for="p in spec.pll.params" :key="p.key" class="field">
              <span class="field-label">{{ p.label }}</span>
              <el-input-number
                v-if="p.kind === 'number'"
                :model-value="config.pll[p.key]"
                :min="p.min"
                :max="p.max"
                :step="p.step ?? 1"
                size="small"
                @update:model-value="(v: number | undefined) => setPllParam(p.key, v)"
              />
              <el-select
                v-else
                :model-value="config.pll[p.key]"
                size="small"
                style="width: 180px"
                @update:model-value="(v: number) => setPllParam(p.key, v)"
              >
                <el-option v-for="o in p.options" :key="o" :label="String(o)" :value="o" />
              </el-select>
            </div>
          </template>
          <div v-else class="hint">系统时钟源不是 PLL，PLL 参数不参与当前链路。</div>
        </section>

        <section id="sec-sysclk" class="sec" :class="{ 'sec-focus': focus === 'sysclk' }">
          <div class="sec-title">SYSCLK</div>
          <div class="freq-line">
            <span
              class="freq-val"
              :class="{ over: overLimit(validation.chain.sysclkMhz, spec.sysclkMaxMhz) }"
            >
              {{ fmtFreq(validation.chain.sysclkMhz, spec.sysclkMaxMhz) }}
            </span>
          </div>
          <div class="hint">SYSCLK 由时钟源与 PLL 决定；AHB/APB1/APB2/ADC 分频见下方各总线。</div>
        </section>

        <section id="sec-ahb" class="sec" :class="{ 'sec-focus': focus === 'ahb' }">
          <div class="sec-title">AHB 分频</div>
          <el-select
            :model-value="config.ahb"
            size="small"
            style="width: 180px"
            @update:model-value="(v: number) => store.setClock({ ahb: v })"
          >
            <el-option v-for="o in spec.ahb.options" :key="o" :label="`÷${o}`" :value="o" />
          </el-select>
          <span class="freq-val" :class="{ over: overLimit(validation.chain.ahbMhz, spec.ahb.maxMhz) }">
            {{ fmtFreq(validation.chain.ahbMhz, spec.ahb.maxMhz) }}
          </span>
          <div class="peri-list">
            <el-tag
              v-for="peri in peripheralsOfNode('ahb')"
              :key="peri"
              size="small"
              type="info"
              effect="plain"
            >
              {{ peri }}
            </el-tag>
          </div>
        </section>

        <section id="sec-apb1" class="sec" :class="{ 'sec-focus': focus === 'apb1' }">
          <div class="sec-title">APB1 分频</div>
          <el-select
            :model-value="config.apb1"
            size="small"
            style="width: 180px"
            @update:model-value="(v: number) => store.setClock({ apb1: v })"
          >
            <el-option v-for="o in spec.apb1.options" :key="o" :label="`÷${o}`" :value="o" />
          </el-select>
          <span class="freq-val" :class="{ over: overLimit(validation.chain.apb1Mhz, spec.apb1.maxMhz) }">
            {{ fmtFreq(validation.chain.apb1Mhz, spec.apb1.maxMhz) }}
          </span>
          <div class="peri-list">
            <el-tag
              v-for="peri in peripheralsOfNode('apb1')"
              :key="peri"
              size="small"
              type="info"
              effect="plain"
            >
              {{ peri }}
            </el-tag>
          </div>
        </section>

        <section id="sec-apb2" class="sec" :class="{ 'sec-focus': focus === 'apb2' }">
          <div class="sec-title">APB2 分频</div>
          <el-select
            :model-value="config.apb2"
            size="small"
            style="width: 180px"
            @update:model-value="(v: number) => store.setClock({ apb2: v })"
          >
            <el-option v-for="o in spec.apb2.options" :key="o" :label="`÷${o}`" :value="o" />
          </el-select>
          <span class="freq-val" :class="{ over: overLimit(validation.chain.apb2Mhz, spec.apb2.maxMhz) }">
            {{ fmtFreq(validation.chain.apb2Mhz, spec.apb2.maxMhz) }}
          </span>
          <div class="peri-list">
            <el-tag
              v-for="peri in peripheralsOfNode('apb2')"
              :key="peri"
              size="small"
              type="info"
              effect="plain"
            >
              {{ peri }}
            </el-tag>
          </div>
        </section>

        <section id="sec-adc" class="sec" :class="{ 'sec-focus': focus === 'adc' }">
          <div class="sec-title">ADC 时钟</div>
          <el-select
            :model-value="config.adc"
            size="small"
            style="width: 200px"
            @update:model-value="(v: string) => store.setClock({ adc: v })"
          >
            <el-option v-for="o in spec.adc.options" :key="o.id" :label="o.label" :value="o.id" />
          </el-select>
          <span class="freq-val" :class="{ over: overLimit(validation.chain.adcMhz, spec.adc.maxMhz) }">
            {{ fmtFreq(validation.chain.adcMhz, spec.adc.maxMhz) }}
          </span>
          <div class="peri-list">
            <el-tag
              v-for="peri in peripheralsOfNode('adc')"
              :key="peri"
              size="small"
              type="info"
              effect="plain"
            >
              {{ peri }}
            </el-tag>
          </div>
        </section>

        <section class="sec">
          <div class="sec-title">
            可选时钟源的外设
            <el-tag size="small" type="info">{{ clockSelectEntries.length }} 个</el-tag>
          </div>
          <div class="select-list">
            <div v-for="[peri, options] in clockSelectEntries" :key="peri" class="select-row">
              <span class="select-name">{{ peri }}</span>
              <span class="select-opts">
                <el-tag v-for="opt in options" :key="opt" size="small" type="warning" effect="plain">
                  {{ opt }}
                </el-tag>
              </span>
            </div>
          </div>
          <div class="hint">未列出的外设直接使用所在总线时钟（如 TIMER 跟随 APB 分频）。</div>
        </section>

        <section class="sec">
          <div class="sec-title">校验结果</div>
          <ul v-if="validation.issues.length" class="issue-list">
            <li v-for="(iss, i) in validation.issues" :key="i" :class="iss.severity">
              <el-tag :type="iss.severity === 'error' ? 'danger' : 'warning'" size="small" effect="dark">
                {{ iss.severity === 'error' ? '错误' : '警告' }}
              </el-tag>
              <span>{{ iss.message }}</span>
            </li>
          </ul>
          <div v-else class="hint">当前时钟链路全部合法，可直接生成代码。</div>
        </section>
      </div>
    </div>

    <div class="summary-bar">
      <div class="summary">
        <span v-for="k in summaryKeys" :key="k" class="summary-item">
          {{ summaryLabel(k) }}:
          <b :class="{ over: overLimit(validation.chain[k], summaryMax(k)) }">
            {{ summaryVal(validation.chain[k]) }}
          </b>
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.clock-view {
  display: flex;
  flex-direction: column;
  gap: 10px;
  height: calc(100vh - 196px);
  min-height: 460px;
  min-width: 920px;
}
.view-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex: none;
}
.view-title {
  font-weight: 600;
  font-size: 14px;
}
.view-tools {
  display: flex;
  align-items: center;
  gap: 8px;
}
.clock-body {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(560px, 1.5fr) minmax(340px, 1fr);
  gap: 14px;
}
.tree-pane {
  display: flex;
  flex-direction: column;
  min-height: 0;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 8px;
  background: #fafbfc;
  gap: 6px;
}
.clock-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  flex: none;
}
.zoom-label {
  font-size: 12px;
  color: #6b7280;
}
.clock-stage {
  flex: 1;
  min-height: 0;
  overflow: auto;
  display: flex;
  justify-content: center;
  align-items: center;
  background: #ffffff;
  border-radius: 8px;
}
.clock-rotator {
  position: relative;
  flex: none;
}
.clock-svg {
  position: absolute;
  left: 50%;
  top: 50%;
  transform-origin: center center;
  transition: transform 0.2s ease;
}
.tree-text {
  transform-box: fill-box;
  transform-origin: center;
  transition: transform 0.2s ease;
}
.tree-edge {
  stroke: #94a3b8;
  stroke-width: 2;
  stroke-linecap: round;
  fill: none;
}
.tree-edge:not(.edge-err) {
  stroke: #7c8db5;
}
.edge-err {
  stroke: #ef4444;
}
.edge-label {
  font-size: 12.5px;
  font-weight: 700;
  fill: #1e293b;
  stroke: #ffffff;
  stroke-width: 3px;
  paint-order: stroke;
}
.tree-node {
  cursor: pointer;
}
.tree-node rect {
  stroke-width: 1.6;
}
.peri-chip {
  cursor: pointer;
}
.peri-chip rect {
  fill: #eef2ff;
  stroke: #c7d2fe;
  stroke-width: 1;
  transition: fill 0.15s ease;
}
.peri-chip:hover rect {
  fill: #e0e7ff;
}
.chip-text {
  font-size: 8.5px;
  font-weight: 600;
  fill: #3730a3;
}
.node-source {
  stroke-dasharray: 4 3;
}
.node-active {
  fill: #e0e7ff;
  stroke: #4f46e5;
}
.node-error {
  fill: #fee2e2;
  stroke: #ef4444;
}
.node-idle {
  fill: #f3f4f6;
  stroke: #9ca3af;
}
.node-label {
  font-size: 13px;
  font-weight: 600;
  fill: #1f2937;
}
.node-sub {
  font-size: 11px;
  fill: #6b7280;
}
.tree-tip {
  font-size: 11.5px;
  color: #6b7280;
  text-align: center;
  flex: none;
}
.editor-pane {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
  overflow-y: auto;
  padding-right: 2px;
}
.sec {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 10px 12px;
  transition:
    border-color 0.2s,
    box-shadow 0.2s;
  flex: none;
}
.sec-focus {
  border-color: #4f46e5;
  box-shadow: 0 0 0 2px rgba(79, 70, 229, 0.12);
}
.sec-dim {
  opacity: 0.6;
}
.sec-title {
  font-weight: 600;
  font-size: 13px;
  margin-bottom: 8px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.field {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}
.field-label {
  width: 110px;
  font-size: 12.5px;
  color: #374151;
  flex-shrink: 0;
}
.unit {
  font-size: 12px;
  color: #6b7280;
}
.freq-line {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.freq-val {
  font-size: 12.5px;
  color: #374151;
  margin-left: 8px;
}
.peri-list {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 8px;
}
.peri-list .el-tag {
  margin-right: 0;
}
.select-list {
  display: flex;
  flex-direction: column;
  gap: 7px;
}
.select-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.select-name {
  width: 72px;
  font-size: 12.5px;
  font-weight: 600;
  color: #1f2937;
  flex-shrink: 0;
}
.select-opts {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}
.over {
  color: #dc2626;
  font-weight: 700;
}
.hint {
  font-size: 11.5px;
  color: #6b7280;
  margin-top: 4px;
}
.issue-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.issue-list li {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 12px;
  color: #374151;
}
.summary-bar {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 8px 12px;
  background: #ffffff;
  flex: none;
}
.summary {
  display: flex;
  gap: 14px;
  flex-wrap: wrap;
  font-size: 12.5px;
  color: #374151;
}
.summary b.over {
  color: #dc2626;
}
</style>
