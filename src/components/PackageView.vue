<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import {
  PIN_COLORS,
  normalizeRotation,
  outsideLabelDy,
  packageGeometry,
  pinGeometry,
  type PinState,
} from '../lib/packageSvg'
import { downloadBlob } from '../lib/codegen'
import { useProjectStore } from '../stores/project'
import type { PinDef } from '../types'

const store = useProjectStore()
const device = computed(() => store.deviceData.device)
const geo = computed(() => packageGeometry(device.value))
const viewRef = ref<HTMLElement | null>(null)
const svgRef = ref<SVGSVGElement | null>(null)
const autoFit = ref(true)
const manualFactor = ref(1)
const autoZoom = ref(1)
const rotation = ref(0)
const hoverPin = ref<PinDef | null>(null)
const hoverPos = ref<{ x: number; y: number } | null>(null)

const MIN_ZOOM = 0.4
const MAX_ZOOM = 2.5
const EXPORT_SCALE = 2
// 面板内固定占用：工具栏 + 图例 + 间距 + 底部边距（用于按可用高度自适应）
const CHROME_HEIGHT = 86

const effectiveZoom = computed(() =>
  Math.min(
    MAX_ZOOM,
    Math.max(MIN_ZOOM, (autoFit.value ? autoZoom.value * manualFactor.value : manualFactor.value)),
  ),
)

let observer: ResizeObserver | null = null

function updateAutoZoom() {
  const el = viewRef.value
  if (!el) return
  const width = el.clientWidth
  const top = el.getBoundingClientRect().top
  const availHeight = window.innerHeight - top - 12 - CHROME_HEIGHT
  // 测量内容真实包围盒（含反向补偿后保持水平的文字），再按旋转角度精确换算
  let w = geo.value.svgSize
  let h = geo.value.svgSize
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
  autoZoom.value = Math.min(
    MAX_ZOOM,
    Math.max(MIN_ZOOM, Math.min(width / rotW, availHeight / rotH)),
  )
}

function rotateBy(delta: number) {
  rotation.value = normalizeRotation(rotation.value + delta)
  updateAutoZoom()
}

onMounted(() => {
  observer = new ResizeObserver(updateAutoZoom)
  if (viewRef.value) observer.observe(viewRef.value)
  window.addEventListener('resize', updateAutoZoom)
  updateAutoZoom()
})

onUnmounted(() => {
  observer?.disconnect()
  window.removeEventListener('resize', updateAutoZoom)
})

function changeManual(delta: number) {
  manualFactor.value = Math.min(2, Math.max(0.5, Math.round((manualFactor.value + delta) * 20) / 20))
}

function reset() {
  autoFit.value = true
  manualFactor.value = 1
  rotation.value = 0
  updateAutoZoom()
}

function stateOf(pin: PinDef): PinState {
  if (pin.type === 'POWER') return 'power'
  const inConflict = store.conflicts.some((c) => c.pins.includes(pin.name))
  if (inConflict) return 'conflict'
  const assignment = store.assignments[pin.name]
  if (assignment) {
    if (assignment.params.exti?.enabled) return 'exti'
    return assignment.mode === 'OUTPUT' ? 'output' : 'input'
  }
  if (pin.special) return 'special'
  return 'unassigned'
}

function onPinClick(pin: PinDef) {
  if (pin.type === 'POWER') return
  store.selectPin(pin.name)
}

const pins = computed(() =>
  device.value.pins.map((pin) => {
    const g = pinGeometry(pin, geo.value)
    return {
      pin,
      g,
      labelDy: outsideLabelDy(pin, geo.value.pinsPerSide),
      color: PIN_COLORS[stateOf(pin)],
      selected: store.selectedPin === pin.name,
    }
  }),
)

const hoverAssignment = computed(() =>
  hoverPin.value ? store.assignments[hoverPin.value.name] : undefined,
)

const hoverAfSignals = computed(() => hoverPin.value?.alternate ?? [])

const hoverTypeText = computed(() => {
  const pin = hoverPin.value
  if (!pin) return ''
  if (pin.type === 'POWER') return '电源'
  if (pin.type === 'NC') return '空脚'
  if (pin.special === 'swd') return '特殊（SWD 调试）'
  if (pin.special === 'boot') return '特殊（BOOT）'
  if (pin.special === 'nrst') return '特殊（NRST）'
  if (pin.special === 'osc') return '特殊（晶振）'
  return 'IO'
})

const hoverPullText = computed(() => {
  const pull = hoverAssignment.value?.params.pull
  return pull === 'PULLUP' ? '上拉' : pull === 'PULLDOWN' ? '下拉' : '无'
})

const hoverExtiText = computed(() => {
  const edge = hoverAssignment.value?.params.exti?.edge
  return edge === 'RISING' ? '上升沿' : edge === 'BOTH' ? '双边沿' : '下降沿'
})

// 旋转封装图时文字反向补偿，保持水平可读（文字仍随引脚移动）
const pinTextStyle = computed(() => ({ transform: `rotate(${-rotation.value}deg)` }))

function onPinHover(pin: PinDef, event: MouseEvent) {
  hoverPin.value = pin
  hoverPos.value = { x: event.clientX, y: event.clientY }
}

function onPinMove(event: MouseEvent) {
  hoverPos.value = { x: event.clientX, y: event.clientY }
}

function onPinLeave() {
  hoverPin.value = null
  hoverPos.value = null
}

/** 序列化当前封装图 SVG（保留旋转与文字反向补偿样式），用于导出 */
function buildExportSvg(): string {
  const svg = svgRef.value
  if (!svg) return ''
  const clone = svg.cloneNode(true) as SVGSVGElement
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  const style = document.createElementNS('http://www.w3.org/2000/svg', 'style')
  style.textContent = '.pin-text{transform-box:fill-box;transform-origin:center;}'
  clone.insertBefore(style, clone.firstChild)
  const size = geo.value.svgSize * EXPORT_SCALE
  clone.setAttribute('width', String(size))
  clone.setAttribute('height', String(size))
  return new XMLSerializer().serializeToString(clone)
}

function exportSvg() {
  const str = buildExportSvg()
  if (!str) return
  downloadBlob(
    new Blob([str], { type: 'image/svg+xml' }),
    `${store.projectName || 'device'}-${device.value.device}.svg`,
  )
  ElMessage.success('SVG 已导出')
}

function exportPng() {
  const str = buildExportSvg()
  if (!str) return
  const size = geo.value.svgSize * EXPORT_SCALE
  const img = new Image()
  img.onload = () => {
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      ElMessage.error('无法创建画布')
      return
    }
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, size, size)
    ctx.drawImage(img, 0, 0, size, size)
    canvas.toBlob((blob) => {
      if (!blob) {
        ElMessage.error('PNG 生成失败')
        return
      }
      downloadBlob(blob, `${store.projectName || 'device'}-${device.value.device}.png`)
      ElMessage.success('PNG 已导出')
    }, 'image/png')
  }
  img.onerror = () => ElMessage.error('SVG 渲染失败，无法导出 PNG')
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(str)}`
}

const LEGEND_LABELS: Record<string, string> = {
  unassigned: '未配置',
  output: '输出',
  input: '输入',
  exti: '外部中断',
  conflict: '冲突',
  power: '电源',
  special: '特殊引脚',
  selected: '选中',
}

const DEBUG_ALIASES = ['SWDIO', 'SWCLK', 'JTDO', 'NJTRST', 'JTDI']

function defaultLabel(pin: PinDef): string {
  if (pin.special === 'swd') {
    const hit = (pin.aliases ?? []).find((a) => DEBUG_ALIASES.includes(a))
    if (hit) return hit
  }
  const alias = pin.aliases?.[0]
  if (alias && alias !== pin.name) return alias
  return pin.name
}

// 引脚内侧标签：已配置的标签名，或特殊引脚的默认标签（仅显示，不参与生成）
function displayLabel(pin: PinDef): string | undefined {
  if (pin.type === 'POWER' || pin.type === 'NC') return undefined
  const assignment = store.assignments[pin.name]
  if (assignment) return assignment.label || pin.name
  if (pin.special) return defaultLabel(pin)
  return undefined
}
</script>

<template>
  <div ref="viewRef" class="package-view">
    <div class="package-toolbar">
      <span class="zoom-label">显示比例 {{ Math.round(effectiveZoom * 100) }}%</span>
      <el-switch v-model="autoFit" size="small" active-text="自动适配" />
      <el-button-group>
        <el-button size="small" title="缩小" @click="changeManual(-0.25)">−</el-button>
        <el-button size="small" title="重置：自动适配 100%" @click="reset">重置</el-button>
        <el-button size="small" title="放大" @click="changeManual(0.25)">＋</el-button>
      </el-button-group>
      <span class="zoom-label">旋转 {{ rotation }}°</span>
      <el-button-group>
        <el-button size="small" title="逆时针旋转 45°" @click="rotateBy(-45)">⟲45°</el-button>
        <el-button size="small" title="复位旋转" @click="rotateBy(360 - rotation)">复位</el-button>
        <el-button size="small" title="顺时针旋转 45°" @click="rotateBy(45)">⟳45°</el-button>
      </el-button-group>
      <el-button size="small" @click="exportSvg">导出 SVG</el-button>
      <el-button size="small" @click="exportPng">导出 PNG</el-button>
    </div>
    <div class="package-stage">
      <svg
        ref="svgRef"
        :width="geo.svgSize * effectiveZoom"
        :height="geo.svgSize * effectiveZoom"
        :viewBox="`0 0 ${geo.svgSize} ${geo.svgSize}`"
        :style="{ transform: `rotate(${rotation}deg)` }"
        class="package-svg"
      >
        <!-- 芯片本体 -->
        <rect
          :x="geo.margin"
          :y="geo.margin"
          :width="geo.body"
          :height="geo.body"
          rx="10"
          fill="#ffffff"
          stroke="#374151"
          stroke-width="2"
        />
        <!-- Pin 1 方向标记：左上角凹陷圆点 -->
        <circle :cx="geo.margin + 50" :cy="geo.margin + 50" r="10" fill="#374151">
          <title>Pin 1 方向标记</title>
        </circle>
        <!-- 器件名与型号合并为同一文字块，反向补偿旋转时两行不会互相重叠 -->
        <text
          class="pin-text"
          :style="pinTextStyle"
          :x="geo.svgSize / 2"
          :y="geo.svgSize / 2 - 8"
          text-anchor="middle"
          font-size="16"
          font-weight="600"
          fill="#374151"
        >
          {{ device.device }}
          <tspan :x="geo.svgSize / 2" dy="22" font-size="12" font-weight="400" fill="#6b7280">
            {{ device.package }} · {{ device.core }}
          </tspan>
        </text>

        <g
          v-for="item in pins"
          :key="item.pin.number"
          class="pin"
          :class="{ selectable: item.pin.type === 'IO' }"
          @click="onPinClick(item.pin)"
          @mouseenter="onPinHover(item.pin, $event)"
          @mousemove="onPinMove"
          @mouseleave="onPinLeave"
        >
          <rect
            :x="item.g.x"
            :y="item.g.y"
            :width="item.g.w"
            :height="item.g.h"
            rx="2"
            :fill="item.color.fill"
            :stroke="item.selected ? '#7c4dff' : item.color.stroke"
            :stroke-width="item.selected ? 2.5 : 1"
          />
          <text
            class="pin-text"
            :style="pinTextStyle"
            :x="item.g.x + item.g.w / 2"
            :y="item.g.y + item.g.h / 2 + 3"
            text-anchor="middle"
            font-size="9"
            :fill="item.pin.type === 'POWER' ? '#ffffff' : '#374151'"
          >
            {{ item.pin.number }}
          </text>
          <text
            class="pin-text"
            :style="pinTextStyle"
            :x="item.g.innerX"
            :y="item.g.innerY"
            :text-anchor="item.g.innerAnchor"
            font-size="9"
            fill="#1f2329"
          >
            {{ item.pin.name }}
          </text>
          <text
            v-if="displayLabel(item.pin) && displayLabel(item.pin) !== item.pin.name"
            class="pin-text"
            :style="pinTextStyle"
            :x="item.g.labelX"
            :y="item.g.labelY + item.labelDy"
            :text-anchor="item.g.anchor"
            font-size="7"
            fill="#455a64"
          >
            {{ displayLabel(item.pin) }}
          </text>
        </g>
      </svg>

      <div
        v-if="hoverPin && hoverPos"
        class="pin-popover"
        :style="{ left: `${hoverPos.x + 16}px`, top: `${hoverPos.y + 16}px` }"
      >
        <div class="pop-title">
          {{ hoverPin.name }}
          <span class="sub">#{{ hoverPin.number }}</span>
        </div>
        <div class="pop-line">
          类型：{{ hoverTypeText }}
          <span v-if="hoverPin.aliases?.length" class="sub">（别名 {{ hoverPin.aliases.join(' / ') }}）</span>
        </div>
        <template v-if="hoverAssignment">
          <div class="pop-line">标签：{{ hoverAssignment.label || '—' }}</div>
          <div class="pop-line">模式：{{ hoverAssignment.mode }}</div>
          <div v-if="hoverAssignment.mode === 'OUTPUT'" class="pop-line">
            输出：{{ hoverAssignment.params.outputType }} / {{ hoverAssignment.params.speed }}MHz /
            {{ hoverAssignment.params.level }}
          </div>
          <div v-if="hoverAssignment.params.pull && hoverAssignment.params.pull !== 'NONE'" class="pop-line">
            上下拉：{{ hoverPullText }}
          </div>
          <div v-if="hoverAssignment.params.exti?.enabled" class="pop-line">
            EXTI：{{ hoverExtiText }}
          </div>
        </template>
        <div v-else class="pop-line">未配置</div>
        <div v-if="hoverAfSignals.length" class="pop-af">
          <div class="pop-line">可配置 AF（后续实现）：</div>
          <div class="af-tags">
            <span v-for="af in hoverAfSignals" :key="af" class="af-tag" title="AF 配置将在后续版本实现">
              {{ af }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <div class="legend">
      <span
        v-for="(color, key) in PIN_COLORS"
        :key="key"
        class="legend-item"
        :title="key"
      >
        <i :style="{ background: color.fill, borderColor: color.stroke }" />
        <em>{{ LEGEND_LABELS[key] ?? key }}</em>
      </span>
    </div>
  </div>
</template>

<style scoped>
.package-view {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: center;
}
.package-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  justify-content: center;
}
.zoom-label {
  font-size: 12px;
  color: #6b7280;
}
.package-stage {
  width: 100%;
  overflow: auto;
  display: flex;
  justify-content: center;
  background: #ffffff;
  border-radius: 8px;
}
.package-svg {
  flex: none;
  transform-origin: center center;
  transition: transform 0.2s ease;
}
.pin-text {
  transform-box: fill-box;
  transform-origin: center;
  transition: transform 0.2s ease;
}
.pin-popover {
  position: fixed;
  z-index: 3000;
  min-width: 200px;
  max-width: 320px;
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.12);
  padding: 8px 10px;
  font-size: 12px;
  color: #374151;
  pointer-events: none;
}
.pop-title {
  font-weight: 600;
  font-size: 13px;
  margin-bottom: 4px;
}
.pop-line {
  margin: 2px 0;
}
.pop-af {
  margin-top: 6px;
  border-top: 1px dashed #e5e7eb;
  padding-top: 6px;
}
.af-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 4px;
}
.af-tag {
  background: #f3f4f6;
  border: 1px solid #e5e7eb;
  border-radius: 4px;
  padding: 1px 6px;
  font-size: 11px;
  color: #6b7280;
  cursor: not-allowed;
}
.pin.selectable {
  cursor: pointer;
}
.pin.selectable:hover rect {
  stroke-width: 2;
}
.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: center;
  font-size: 12px;
  color: #4b5563;
}
.legend-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  cursor: help;
}
.legend-item i {
  width: 12px;
  height: 12px;
  border: 1px solid;
  border-radius: 2px;
  display: inline-block;
}
.legend-item em {
  font-style: normal;
}
</style>
