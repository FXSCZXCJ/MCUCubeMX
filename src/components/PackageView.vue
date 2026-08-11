<script setup lang="ts">
import { computed } from 'vue'
import { device } from '../data/device'
import { PIN_COLORS, SVG_SIZE, BODY, MARGIN, pinGeometry, type PinState } from '../lib/packageSvg'
import { useProjectStore } from '../stores/project'
import type { PinDef } from '../types'

const store = useProjectStore()

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
</script>

<template>
  <div class="package-view">
    <svg
      :width="SVG_SIZE"
      :height="SVG_SIZE"
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

    <div class="legend">
      <span v-for="(color, key) in PIN_COLORS" :key="key" class="legend-item">
        <i :style="{ background: color.fill, borderColor: color.stroke }" />
        <em>{{ key }}</em>
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
.package-svg {
  max-width: 100%;
  height: auto;
  background: #ffffff;
  border-radius: 8px;
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
