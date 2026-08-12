<script setup lang="ts">
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useProjectStore } from '../stores/project'
import { solvePll, validateClock } from '../lib/clock'
import type { PllSolution } from '../lib/clock'
import { peripheralsOf } from '../lib/clock/tree'
import CollapsiblePanel from './CollapsiblePanel.vue'

const store = useProjectStore()
const spec = computed(() => store.deviceData.clockSpec)
const config = computed(() => store.clock)
const validation = computed(() => validateClock(spec.value, config.value))

function setPllParam(key: string, value: number | undefined) {
  if (value === undefined) return
  store.setClock({ pll: { ...config.value.pll, [key]: value } })
}

function fmtFreq(v: number | null, max: number): string {
  const s = v === null || !Number.isFinite(v) ? '无效' : `${Math.round(v * 1000) / 1000} MHz`
  return `${s} / 上限 ${max} MHz`
}

function overLimit(v: number | null, max: number): boolean {
  return v !== null && Number.isFinite(v) && v > max
}

function peripheralsOfNode(id: string): string[] {
  return peripheralsOf(spec.value, id)
}

const clockSelectEntries = computed(() => Object.entries(spec.value.clockSelect ?? {}))

/* ===== RTC / USB / PLL 自动解算 ===== */
const rtcSources = computed(() => spec.value.lowPower?.rtc.sources ?? [])
const usbSources = computed(() => spec.value.usb48?.sources ?? [])
const pllTarget = ref(64)
const pllSource = ref<string | null>(null)
const pllSolutions = ref<PllSolution[] | null>(null)
const pllSolveError = ref('')

function runSolve() {
  const result = solvePll(spec.value, pllTarget.value, pllSource.value ?? undefined)
  pllSolutions.value = result.solutions
  pllSolveError.value = result.error ?? ''
}

function describeSolution(sol: PllSolution): string {
  return Object.entries(sol.params)
    .map(([k, v]) => `${k}=${v}`)
    .join(' / ')
}

function applySolution(sol: PllSolution) {
  store.setClock({
    source: 'PLL',
    pllSource: sol.pllSource,
    pll: { ...config.value.pll, ...sol.params },
  })
  ElMessage.success(
    `已应用 PLL：${describeSolution(sol)}（SYSCLK ${Math.round(sol.pllOutMhz * 1000) / 1000}MHz）`,
  )
}
</script>

<template>
  <div class="clock-editor">
    <CollapsiblePanel
      title="系统时钟源"
      body-padding
      class="sec"
      :class="{ 'sec-focus': store.clockFocus === 'source' }"
    >
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
    </CollapsiblePanel>

    <CollapsiblePanel
      title="PLL 配置"
      body-padding
      class="sec"
      :class="{ 'sec-focus': store.clockFocus === 'pll', 'sec-dim': config.source !== 'PLL' }"
    >
      <template #extra>
        <el-tag v-if="config.source !== 'PLL'" size="small" type="info">未使用</el-tag>
      </template>
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
    </CollapsiblePanel>

    <CollapsiblePanel
      title="SYSCLK"
      body-padding
      class="sec"
      :class="{ 'sec-focus': store.clockFocus === 'sysclk' }"
    >
      <div class="freq-line">
        <span
          class="freq-val"
          :class="{ over: overLimit(validation.chain.sysclkMhz, spec.sysclkMaxMhz) }"
        >
          {{ fmtFreq(validation.chain.sysclkMhz, spec.sysclkMaxMhz) }}
        </span>
      </div>
      <div class="hint">SYSCLK 由时钟源与 PLL 决定；AHB/APB1/APB2/ADC 分频见下方各总线。</div>
    </CollapsiblePanel>

    <CollapsiblePanel
      title="AHB 分频"
      body-padding
      class="sec"
      :class="{ 'sec-focus': store.clockFocus === 'ahb' }"
    >
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
    </CollapsiblePanel>

    <CollapsiblePanel
      title="APB1 分频"
      body-padding
      class="sec"
      :class="{ 'sec-focus': store.clockFocus === 'apb1' }"
    >
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
    </CollapsiblePanel>

    <CollapsiblePanel
      title="APB2 分频"
      body-padding
      class="sec"
      :class="{ 'sec-focus': store.clockFocus === 'apb2' }"
    >
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
    </CollapsiblePanel>

    <CollapsiblePanel
      title="ADC 时钟"
      body-padding
      class="sec"
      :class="{ 'sec-focus': store.clockFocus === 'adc' }"
    >
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
    </CollapsiblePanel>

    <CollapsiblePanel
      v-if="spec.lowPower"
      title="RTC / 低功耗时钟"
      body-padding
      class="sec"
      :class="{ 'sec-focus': store.clockFocus === 'rtc' }"
    >
      <div class="field">
        <span class="field-label">RTC 时钟源</span>
        <el-select
          :model-value="config.rtcSource ?? null"
          size="small"
          style="width: 220px"
          @update:model-value="(v: string | null) => store.setRtcSource(v)"
        >
          <el-option label="未配置" :value="null" />
          <el-option v-for="s in rtcSources" :key="s.key" :label="s.label" :value="s.key" />
        </el-select>
      </div>
      <div class="freq-line">
        <span class="freq-val">RTC 频率：{{ fmtFreq(validation.chain.rtcMhz, 0.1) }}</span>
      </div>
      <div class="hint">FWDGT 固定使用 IRC32K；RTC 挂载：{{ peripheralsOfNode('rtc').join('、') || '—' }}</div>
    </CollapsiblePanel>

    <CollapsiblePanel
      v-if="spec.usb48"
      title="USB 48MHz"
      body-padding
      class="sec"
      :class="{ 'sec-focus': store.clockFocus === 'usb48' }"
    >
      <div class="field">
        <span class="field-label">时钟源</span>
        <el-select
          :model-value="config.usbSource ?? null"
          size="small"
          style="width: 220px"
          @update:model-value="(v: string | null) => store.setUsbSource(v)"
        >
          <el-option label="未配置" :value="null" />
          <el-option v-for="s in usbSources" :key="s.key" :label="s.label" :value="s.key" />
        </el-select>
      </div>
      <div class="freq-line">
        <span
          class="freq-val"
          :class="{
            over:
              validation.chain.ck48mMhz !== null &&
              Math.abs(validation.chain.ck48mMhz - 48) > 1e-9,
          }"
        >
          USB 时钟：{{
            validation.chain.ck48mMhz === null
              ? '未配置'
              : `${Math.round(validation.chain.ck48mMhz * 1000) / 1000} MHz（需 48MHz）`
          }}
        </span>
      </div>
      <div class="hint">挂载外设：{{ peripheralsOfNode('usb48').join('、') || '—' }}</div>
    </CollapsiblePanel>

    <CollapsiblePanel title="PLL 自动解算" body-padding class="sec">
      <div class="field">
        <span class="field-label">目标 SYSCLK</span>
        <el-input-number
          :model-value="pllTarget"
          :min="1"
          :max="spec.sysclkMaxMhz"
          :step="1"
          size="small"
          @update:model-value="(v: number | undefined) => v !== undefined && (pllTarget = v)"
        />
        <span class="unit">MHz</span>
        <el-select
          :model-value="pllSource"
          size="small"
          style="width: 150px"
          placeholder="PLL 输入源"
          clearable
          @update:model-value="(v: string) => (pllSource = v)"
        >
          <el-option
            v-for="id in spec.pll.sourceOptions"
            :key="id"
            :label="spec.sources.find((s) => s.id === id)?.label ?? id"
            :value="id"
          />
        </el-select>
        <el-button size="small" type="primary" plain @click="runSolve">自动解算</el-button>
      </div>
      <div v-if="pllSolveError" class="hint over">{{ pllSolveError }}</div>
      <div v-if="pllSolutions?.length" class="solve-list">
        <div v-for="(sol, i) in pllSolutions" :key="i" class="solve-row">
          <span>{{ describeSolution(sol) }}</span>
          <span class="solve-freq">→ {{ Math.round(sol.pllOutMhz * 1000) / 1000 }}MHz</span>
          <el-button size="small" @click="applySolution(sol)">应用</el-button>
        </div>
      </div>
      <div v-else-if="!pllSolveError" class="hint">输入目标频率后点击「自动解算」获取合法 PLL 组合。</div>
    </CollapsiblePanel>

    <CollapsiblePanel
      title="可选时钟源的外设"
      body-padding
      class="sec"
    >
      <template #extra>
        <el-tag size="small" type="info">{{ clockSelectEntries.length }} 个</el-tag>
      </template>
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
    </CollapsiblePanel>

    <CollapsiblePanel title="校验结果" body-padding class="sec">
      <ul v-if="validation.issues.length" class="issue-list">
        <li v-for="(iss, i) in validation.issues" :key="i" :class="iss.severity">
          <el-tag :type="iss.severity === 'error' ? 'danger' : 'warning'" size="small" effect="dark">
            {{ iss.severity === 'error' ? '错误' : '警告' }}
          </el-tag>
          <span>{{ iss.message }}</span>
        </li>
      </ul>
      <div v-else class="hint">当前时钟链路全部合法，可直接生成代码。</div>
    </CollapsiblePanel>
  </div>
</template>

<style scoped>
.clock-editor {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.sec-focus {
  border-color: #4f46e5 !important;
  box-shadow: 0 0 0 2px rgba(79, 70, 229, 0.12);
}
.sec-dim {
  opacity: 0.6;
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
.solve-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 8px;
}
.solve-row {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12.5px;
  color: #374151;
  background: #f5f7ff;
  border-radius: 6px;
  padding: 4px 8px;
}
.solve-freq {
  color: #4f46e5;
  font-weight: 600;
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
</style>
