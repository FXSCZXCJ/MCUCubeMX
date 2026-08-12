<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useProjectStore } from '../stores/project'
import { validateClock } from '../lib/clock'
import { buildClockTree } from '../lib/clock/tree'
import { normalizeRotation } from '../lib/packageSvg'
import { downloadBlob } from '../lib/codegen'
import ViewToolbar from './ViewToolbar.vue'

const store = useProjectStore()
const spec = computed(() => store.deviceData.clockSpec)
const config = computed(() => store.clock)

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

const EXPORT_SCALE = 2

/** 序列化当前时钟树 SVG（保留旋转与文字反向补偿样式），用于导出 */
function buildExportSvg(): string {
  const svg = svgRef.value
  if (!svg) return ''
  const clone = svg.cloneNode(true) as SVGSVGElement
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  if (clone.style.transform) {
    clone.style.transform = clone.style.transform.replace(/translate\([^)]*\)\s*/g, '').trim()
  }
  const style = document.createElementNS('http://www.w3.org/2000/svg', 'style')
  style.textContent = '.tree-text{transform-box:fill-box;transform-origin:center;}'
  clone.insertBefore(style, clone.firstChild)
  clone.setAttribute('width', String(tree.value.width * EXPORT_SCALE))
  clone.setAttribute('height', String(tree.value.height * EXPORT_SCALE))
  return new XMLSerializer().serializeToString(clone)
}

function exportSvg() {
  const str = buildExportSvg()
  if (!str) return
  downloadBlob(new Blob([str], { type: 'image/svg+xml' }), `clock-${spec.value.device}.svg`)
  ElMessage.success('时钟树 SVG 已导出')
}

function exportPng() {
  const str = buildExportSvg()
  if (!str) return
  const sizeW = tree.value.width * EXPORT_SCALE
  const sizeH = tree.value.height * EXPORT_SCALE
  const img = new Image()
  img.onload = () => {
    const canvas = document.createElement('canvas')
    canvas.width = sizeW
    canvas.height = sizeH
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      ElMessage.error('无法创建画布')
      return
    }
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, sizeW, sizeH)
    ctx.drawImage(img, 0, 0, sizeW, sizeH)
    canvas.toBlob((blob) => {
      if (!blob) {
        ElMessage.error('PNG 生成失败')
        return
      }
      downloadBlob(blob, `clock-${spec.value.device}.png`)
      ElMessage.success('时钟树 PNG 已导出')
    }, 'image/png')
  }
  img.onerror = () => ElMessage.error('SVG 渲染失败，无法导出 PNG')
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(str)}`
}

/* ===== 节点交互 ===== */
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
  store.setClockFocus(nodeSection(id))
}

function nodeOf(id: string) {
  return tree.value.nodes.find((n) => n.id === id)
}

/* ===== 汇总栏 ===== */
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

function overLimit(v: number | null, max: number): boolean {
  return v !== null && Number.isFinite(v) && v > max
}
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

    <ViewToolbar
      :zoom="effectiveZoom"
      :rotation="rotation"
      :auto-fit="autoFit"
      @update:auto-fit="autoFit = $event"
      @zoom="changeManual"
      @reset="reset"
      @rotate="rotateBy"
      @export-svg="exportSvg"
      @export-png="exportPng"
    />

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
  height: 100%;
  min-height: 0;
  user-select: none;
  -webkit-user-select: none;
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
.clock-stage {
  flex: 1;
  min-height: 0;
  overflow: auto;
  display: flex;
  justify-content: center;
  align-items: center;
  background: #ffffff;
  border: 1px solid #e5e7eb;
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
  user-select: none;
  -webkit-user-select: none;
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
