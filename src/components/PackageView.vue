<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import {
  PIN_COLORS,
  normalizeRotation,
  outsideLabelDy,
  packageGeometry,
  pinGeometry,
  type PinState,
} from '../lib/packageSvg'
import { useProjectStore } from '../stores/project'
import type { PinDef } from '../types'

const store = useProjectStore()
const device = computed(() => store.deviceData.device)
const geo = computed(() => packageGeometry(device.value))
const viewRef = ref<HTMLElement | null>(null)
const autoFit = ref(true)
const manualFactor = ref(1)
const autoZoom = ref(1)
const rotation = ref(0)

const MIN_ZOOM = 0.4
const MAX_ZOOM = 2.5
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
  const size = geo.value.svgSize
  // 旋转后按对角线占用空间（45° 最大为 √2 倍）计算自动适配
  const rotFactor = rotation.value % 180 === 0 ? 1 : Math.SQRT2
  autoZoom.value = Math.min(
    MAX_ZOOM,
    Math.max(MIN_ZOOM, Math.min(width / (size * rotFactor), availHeight / (size * rotFactor))),
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
    </div>
    <div class="package-stage">
      <svg
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
        <text
          :x="geo.svgSize / 2"
          :y="geo.svgSize / 2 - 8"
          text-anchor="middle"
          font-size="16"
          font-weight="600"
          fill="#374151"
        >
          {{ device.device }}
        </text>
        <text :x="geo.svgSize / 2" :y="geo.svgSize / 2 + 14" text-anchor="middle" font-size="12" fill="#6b7280">
          {{ device.package }} · {{ device.core }}
        </text>

        <g
          v-for="item in pins"
          :key="item.pin.number"
          class="pin"
          :class="{ selectable: item.pin.type === 'IO' }"
          @click="onPinClick(item.pin)"
        >
          <title>
            {{ item.pin.name }}（封装脚 #{{ item.pin.number }}）{{
              item.pin.aliases?.length ? ` · ${item.pin.aliases.join('/')}` : ''
            }}
          </title>
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
            :x="item.g.x + item.g.w / 2"
            :y="item.g.y + item.g.h / 2 + 3"
            text-anchor="middle"
            font-size="9"
            :fill="item.pin.type === 'POWER' ? '#ffffff' : '#374151'"
          >
            {{ item.pin.number }}
          </text>
          <text
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
