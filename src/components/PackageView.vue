<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { device } from '../data/device'
import { PIN_COLORS, SVG_SIZE, BODY, MARGIN, pinGeometry, type PinState } from '../lib/packageSvg'
import { useProjectStore } from '../stores/project'
import type { PinDef } from '../types'

const store = useProjectStore()
const viewRef = ref<HTMLElement | null>(null)
const autoFit = ref(true)
const manualFactor = ref(1)
const autoZoom = ref(1)

const MIN_ZOOM = 0.6
const MAX_ZOOM = 2.5

const effectiveZoom = computed(() =>
  Math.min(
    MAX_ZOOM,
    Math.max(MIN_ZOOM, (autoFit.value ? autoZoom.value * manualFactor.value : manualFactor.value)),
  ),
)

let observer: ResizeObserver | null = null

onMounted(() => {
  observer = new ResizeObserver((entries) => {
    const width = entries[0]?.contentRect.width
    if (width) {
      autoZoom.value = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, width / SVG_SIZE))
    }
  })
  if (viewRef.value) observer.observe(viewRef.value)
})

onUnmounted(() => observer?.disconnect())

function changeManual(delta: number) {
  manualFactor.value = Math.min(2, Math.max(0.5, Math.round((manualFactor.value + delta) * 20) / 20))
}

function reset() {
  autoFit.value = true
  manualFactor.value = 1
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
  device.pins.map((pin) => ({
    pin,
    g: pinGeometry(pin),
    color: PIN_COLORS[stateOf(pin)],
    selected: store.selectedPin === pin.name,
  })),
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
    </div>
    <div class="package-stage">
      <svg
        :width="SVG_SIZE * effectiveZoom"
        :height="SVG_SIZE * effectiveZoom"
        :viewBox="`0 0 ${SVG_SIZE} ${SVG_SIZE}`"
        class="package-svg"
      >
        <!-- 芯片本体 -->
        <rect
          :x="MARGIN"
          :y="MARGIN"
          :width="BODY"
          :height="BODY"
          rx="10"
          fill="#ffffff"
          stroke="#374151"
          stroke-width="2"
        />
        <text
          :x="SVG_SIZE / 2"
          :y="SVG_SIZE / 2 - 8"
          text-anchor="middle"
          font-size="16"
          font-weight="600"
          fill="#374151"
        >
          GD32L233RCT6
        </text>
        <text :x="SVG_SIZE / 2" :y="SVG_SIZE / 2 + 14" text-anchor="middle" font-size="12" fill="#6b7280">
          LQFP64 · Cortex-M23
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
            font-size="8"
            fill="#374151"
          >
            {{ item.pin.number }}
          </text>
          <text
            :x="item.g.labelX"
            :y="item.g.labelY"
            :text-anchor="item.g.anchor"
            font-size="9.5"
            fill="#1f2329"
          >
            {{ item.pin.name }}
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
