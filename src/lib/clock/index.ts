import type {
  ClockAdcOption,
  ClockConfig,
  ClockParamSpec,
  ClockSpec,
} from '../../types'

export interface ClockChain {
  /** PLL 输入频率（未使用 PLL 时为 null） */
  pllInMhz: number | null
  /** PLL 输出频率（未使用 PLL 时为 null） */
  pllOutMhz: number | null
  /** VCO 频率（仅 F4xx 等多级 PLL；否则为 null） */
  vcoMhz: number | null
  sysclkMhz: number
  ahbMhz: number
  apb1Mhz: number
  apb2Mhz: number
  adcMhz: number
  /** APB 分频 >1 时 ×2 的 TIMER 时钟 */
  apb1TimerMhz: number
  apb2TimerMhz: number
  /** SysTick = AHB/8 */
  systickMhz: number
  /** RTC 时钟（未配置源时为 0） */
  rtcMhz: number
  /** USB 48MHz 时钟（未配置源时为 null） */
  ck48mMhz: number | null
}

export interface ClockIssue {
  code: string
  node: string
  severity: 'error' | 'warning'
  message: string
}

export interface ClockValidation {
  chain: ClockChain
  issues: ClockIssue[]
  errors: ClockIssue[]
  warnings: ClockIssue[]
  ok: boolean
}

export function sourceFreq(spec: ClockSpec, sourceId: string, hxtalMhz: number): number | null {
  const src = spec.sources.find((s) => s.id === sourceId)
  if (!src) return null
  if (src.hxtal) return hxtalMhz
  return src.freqMhz ?? null
}

/** 计算 PLL 输出（含 VCO，如器件定义）；不使用 PLL 时返回 null */
export function computePll(
  spec: ClockSpec,
  config: ClockConfig,
  pllInMhz: number | null,
): { pllOutMhz: number | null; vcoMhz: number | null } {
  if (pllInMhz === null || Number.isNaN(pllInMhz)) return { pllOutMhz: null, vcoMhz: null }
  const p = config.pll
  // 单级倍频（L23x）：out = in × mul
  if (spec.pll.params.length === 1 && spec.pll.params[0].key === 'mul') {
    return { pllOutMhz: pllInMhz * (p.mul ?? 0), vcoMhz: null }
  }
  // 多级 PLL（F4xx）：VCO = in / psc × n，out = VCO / p
  const psc = p.psc ?? 0
  const n = p.n ?? 0
  const pllP = p.p ?? 0
  if (psc <= 0 || pllP <= 0) return { pllOutMhz: null, vcoMhz: null }
  const vcoMhz = (pllInMhz / psc) * n
  return { pllOutMhz: vcoMhz / pllP, vcoMhz }
}

/** 按配置沿 源 → PLL → SYSCLK → AHB → APB1/APB2 → ADC 计算整条频率链 */
export function computeClock(spec: ClockSpec, config: ClockConfig): ClockChain {
  const srcFreq = sourceFreq(spec, config.source, config.hxtalMhz)
  let pllInMhz: number | null = null
  let pllOutMhz: number | null = null
  let vcoMhz: number | null = null
  let sysclkMhz: number

  if (config.source === 'PLL') {
    pllInMhz = sourceFreq(spec, config.pllSource, config.hxtalMhz)
    const pll = computePll(spec, config, pllInMhz)
    pllOutMhz = pll.pllOutMhz
    vcoMhz = pll.vcoMhz
    sysclkMhz = pllOutMhz ?? 0
  } else {
    sysclkMhz = srcFreq ?? 0
  }

  const ahbMhz = sysclkMhz / config.ahb
  const apb1Mhz = ahbMhz / config.apb1
  const apb2Mhz = ahbMhz / config.apb2
  const adcOpt = spec.adc.options.find((o) => o.id === config.adc)
  const adcMhz = adcOpt ? adcClockMhz(adcOpt, apb1Mhz, apb2Mhz, ahbMhz) : 0

  return {
    pllInMhz,
    pllOutMhz,
    vcoMhz,
    sysclkMhz,
    ahbMhz,
    apb1Mhz,
    apb2Mhz,
    adcMhz,
    apb1TimerMhz: apb1Mhz * (config.apb1 > 1 ? 2 : 1),
    apb2TimerMhz: apb2Mhz * (config.apb2 > 1 ? 2 : 1),
    systickMhz: ahbMhz / 8,
    rtcMhz: rtcClockMhz(spec, config),
    ck48mMhz: ck48mClockMhz(spec, config, pllOutMhz, vcoMhz),
  }
}

function rtcClockMhz(spec: ClockSpec, config: ClockConfig): number {
  const lp = spec.lowPower
  if (!lp || !config.rtcSource) return 0
  const src = lp.rtc.sources.find((s) => s.key === config.rtcSource)
  if (!src) return 0
  if (src.freqMhz !== undefined) return src.freqMhz
  if (src.divHxtal) return config.hxtalMhz / src.divHxtal
  return 0
}

function ck48mClockMhz(
  spec: ClockSpec,
  config: ClockConfig,
  pllOutMhz: number | null,
  vcoMhz: number | null,
): number | null {
  const usb = spec.usb48
  if (!usb || !config.usbSource) return null
  const src = usb.sources.find((s) => s.key === config.usbSource)
  if (!src) return null
  if (src.freqMhz !== undefined) return src.freqMhz
  // PLL 派生源：L23x 为 PLL 输出；F4xx 为 VCO/Q
  if (spec.pll.params.some((p) => p.key === 'q')) {
    const q = config.pll.q
    if (!q) return null
    return vcoMhz !== null ? vcoMhz / q : null
  }
  return pllOutMhz
}

export function adcClockMhz(opt: ClockAdcOption, apb1Mhz: number, apb2Mhz: number, ahbMhz: number): number {
  switch (opt.source) {
    case 'APB1':
      return apb1Mhz / opt.div
    case 'APB2':
      return apb2Mhz / opt.div
    case 'AHB':
      return ahbMhz / opt.div
    case 'IRC16M':
      return 16
    case 'IRC48M':
      return 48
    case 'PLL':
      return ahbMhz / opt.div
    default:
      return 0
  }
}

function fmtMhz(v: number): string {
  if (!Number.isFinite(v)) return '无效'
  return `${Math.round(v * 1000) / 1000} MHz`
}

function pushIssue(
  issues: ClockIssue[],
  severity: 'error' | 'warning',
  code: string,
  node: string,
  message: string,
) {
  issues.push({ severity, code, node, message })
}

export function validateClock(spec: ClockSpec, config: ClockConfig): ClockValidation {
  const issues: ClockIssue[] = []
  const chain = computeClock(spec, config)

  const src = spec.sources.find((s) => s.id === config.source)
  if (!src) {
    pushIssue(issues, 'error', 'UNKNOWN_SOURCE', 'source', `未知时钟源 ${config.source}`)
  }

  // HXTAL 范围
  const hxtalSpec = spec.sources.find((s) => s.hxtal)?.hxtal
  if (hxtalSpec) {
    const h = config.hxtalMhz
    if (!Number.isFinite(h) || h < hxtalSpec.min || h > hxtalSpec.max) {
      pushIssue(
        issues,
        'error',
        'HXTAL_RANGE',
        'hxtal',
        `HXTAL 频率 ${fmtMhz(h)} 超出允许范围 ${hxtalSpec.min}~${hxtalSpec.max} MHz`,
      )
    }
  }

  if (config.source === 'PLL') {
    validatePll(spec, config, chain, issues)
  }

  // 总线分频与上限
  validateBus(spec.ahb.options, spec.ahb.maxMhz, 'ahb', 'AHB', config.ahb, chain.ahbMhz, issues)
  validateBus(spec.apb1.options, spec.apb1.maxMhz, 'apb1', 'APB1', config.apb1, chain.apb1Mhz, issues)
  validateBus(spec.apb2.options, spec.apb2.maxMhz, 'apb2', 'APB2', config.apb2, chain.apb2Mhz, issues)

  if (chain.sysclkMhz > spec.sysclkMaxMhz) {
    pushIssue(
      issues,
      'error',
      'SYSCLK_OVER',
      'sysclk',
      `SYSCLK ${fmtMhz(chain.sysclkMhz)} 超过上限 ${spec.sysclkMaxMhz} MHz`,
    )
  }

  const adcOpt = spec.adc.options.find((o) => o.id === config.adc)
  if (!adcOpt) {
    pushIssue(issues, 'error', 'ADC_OPTION_INVALID', 'adc', `未知 ADC 分频选项 ${config.adc}`)
  } else if (chain.adcMhz > spec.adc.maxMhz) {
    pushIssue(
      issues,
      'error',
      'ADC_OVER',
      'adc',
      `ADC 时钟 ${fmtMhz(chain.adcMhz)} 超过上限 ${spec.adc.maxMhz} MHz`,
    )
  }

  // RTC 时钟源合法性
  if (config.rtcSource) {
    const lp = spec.lowPower
    if (!lp || !lp.rtc.sources.some((s) => s.key === config.rtcSource)) {
      pushIssue(
        issues,
        'error',
        'RTC_SOURCE_INVALID',
        'rtc',
        `RTC 时钟源 ${config.rtcSource} 不受该器件支持`,
      )
    }
  }

  // USB 48MHz 约束
  if (config.usbSource) {
    const usb = spec.usb48
    const src = usb?.sources.find((s) => s.key === config.usbSource)
    if (!src) {
      pushIssue(
        issues,
        'error',
        'USB_SOURCE_INVALID',
        'usb48',
        `USB 48MHz 时钟源 ${config.usbSource} 不受该器件支持`,
      )
    } else if (chain.ck48mMhz !== null && Math.abs(chain.ck48mMhz - 48) > 1e-9) {
      pushIssue(
        issues,
        'error',
        'USB48_INVALID',
        'usb48',
        `USB 48MHz 时钟为 ${fmtMhz(chain.ck48mMhz)}，需要 48MHz（请调整 PLL 参数或改用 IRC48M）`,
      )
    }
  }

  return {
    chain,
    issues,
    errors: issues.filter((i) => i.severity === 'error'),
    warnings: issues.filter((i) => i.severity === 'warning'),
    ok: issues.every((i) => i.severity !== 'error'),
  }
}

function validatePll(
  spec: ClockSpec,
  config: ClockConfig,
  chain: ClockChain,
  issues: ClockIssue[],
) {
  const pllSpec = spec.pll
  if (!pllSpec.sourceOptions.includes(config.pllSource)) {
    pushIssue(
      issues,
      'error',
      'PLL_SOURCE_INVALID',
      'pll',
      `PLL 输入源 ${config.pllSource} 不受支持`,
    )
  }
  for (const param of pllSpec.params) {
    const v = config.pll[param.key]
    const bad =
      param.kind === 'select'
        ? !param.options?.includes(v)
        : !Number.isFinite(v) ||
          (param.min !== undefined && v < param.min) ||
          (param.max !== undefined && v > param.max)
    if (bad) {
      pushIssue(
        issues,
        'error',
        'PLL_PARAM_RANGE',
        'pll',
        `PLL 参数 ${param.label} = ${v ?? '空'} 不合法${rangeText(param)}`,
      )
    }
  }
  if (pllSpec.inMinMhz !== undefined && chain.pllInMhz !== null && chain.pllInMhz > 0) {
    const inMin = pllSpec.inMinMhz
    const inMax = pllSpec.inMaxMhz ?? Infinity
    // 多级 PLL（F4xx）先经预分频 PSC，PLL 实际输入 = 源频率 / PSC
    const psc = config.pll.psc
    const pllIn = psc ? chain.pllInMhz / psc : chain.pllInMhz
    if (pllIn < inMin || pllIn > inMax) {
      pushIssue(
        issues,
        'error',
        'PLL_IN_RANGE',
        'pll',
        `PLL 输入 ${fmtMhz(pllIn)}（源 ${fmtMhz(chain.pllInMhz)} ÷${psc}）应处于 ${inMin}~${inMax} MHz`,
      )
    }
  }
  if (pllSpec.vcoMinMhz !== undefined && chain.vcoMhz !== null) {
    const vcoMin = pllSpec.vcoMinMhz
    const vcoMax = pllSpec.vcoMaxMhz ?? Infinity
    if (chain.vcoMhz < vcoMin || chain.vcoMhz > vcoMax) {
      pushIssue(
        issues,
        'error',
        'PLL_VCO_RANGE',
        'pll',
        `VCO ${fmtMhz(chain.vcoMhz)} 应处于 ${vcoMin}~${vcoMax} MHz`,
      )
    }
  }
  if (chain.pllOutMhz !== null && chain.pllOutMhz > pllSpec.outMaxMhz) {
    pushIssue(
      issues,
      'error',
      'PLL_OUT_RANGE',
      'pll',
      `PLL 输出 ${fmtMhz(chain.pllOutMhz)} 超过上限 ${pllSpec.outMaxMhz} MHz`,
    )
  }
}

function rangeText(param: ClockParamSpec): string {
  if (param.kind === 'select') return `（可选 ${param.options?.join(' / ')}）`
  if (param.min !== undefined || param.max !== undefined) {
    return `（范围 ${param.min ?? '-'}~${param.max ?? '-'}）`
  }
  return ''
}

function validateBus(
  options: number[],
  maxMhz: number,
  node: string,
  label: string,
  div: number,
  freqMhz: number,
  issues: ClockIssue[],
) {
  if (!options.includes(div)) {
    pushIssue(
      issues,
      'error',
      'BUS_DIV_INVALID',
      node,
      `${label} 分频 ${div} 不合法（可选 ${options.join(' / ')}）`,
    )
    return
  }
  if (freqMhz > maxMhz) {
    pushIssue(
      issues,
      'error',
      'BUS_OVER',
      node,
      `${label} 时钟 ${fmtMhz(freqMhz)} 超过上限 ${maxMhz} MHz`,
    )
  }
}

/** 选择默认 PLL 输入源：依次尝试各可选源，取首个在默认参数下合法的 */
export function pickDefaultPllSource(spec: ClockSpec): string {
  for (const id of spec.pll.sourceOptions) {
    const freq = sourceFreq(spec, id, spec.sources.find((s) => s.hxtal)?.hxtal?.default ?? 25)
    if (freq === null) continue
    const probe: ClockConfig = {
      source: 'PLL',
      hxtalMhz: spec.sources.find((s) => s.hxtal)?.hxtal?.default ?? 25,
      pllSource: id,
      pll: Object.fromEntries(spec.pll.params.map((p) => [p.key, p.default])),
      ahb: spec.ahb.default,
      apb1: spec.apb1.default,
      apb2: spec.apb2.default,
      adc: spec.adc.default,
    }
    const v = validateClock(spec, probe)
    if (v.ok) return id
  }
  return spec.pll.sourceOptions[0] ?? ''
}

export function defaultClock(spec: ClockSpec): ClockConfig {
  return {
    source: spec.sources.some((s) => s.pll) ? 'PLL' : (spec.sources[0]?.id ?? 'IRC16M'),
    hxtalMhz: spec.sources.find((s) => s.hxtal)?.hxtal?.default ?? 25,
    pllSource: pickDefaultPllSource(spec),
    pll: Object.fromEntries(spec.pll.params.map((p) => [p.key, p.default])),
    ahb: spec.ahb.default,
    apb1: spec.apb1.default,
    apb2: spec.apb2.default,
    adc: spec.adc.default,
  }
}

/** 以器件默认值为基底合并部分配置（用于 loadConfig / setClock，兼容旧配置） */
export function mergeClockConfig(spec: ClockSpec, partial?: Partial<ClockConfig>): ClockConfig {
  const base = defaultClock(spec)
  if (!partial) return base
  return {
    source: partial.source ?? base.source,
    hxtalMhz: partial.hxtalMhz ?? base.hxtalMhz,
    pllSource: partial.pllSource ?? base.pllSource,
    pll: { ...base.pll, ...(partial.pll ?? {}) },
    ahb: partial.ahb ?? base.ahb,
    apb1: partial.apb1 ?? base.apb1,
    apb2: partial.apb2 ?? base.apb2,
    adc: partial.adc ?? base.adc,
    ...(partial.rtcSource !== undefined ? { rtcSource: partial.rtcSource } : {}),
    ...(partial.usbSource !== undefined ? { usbSource: partial.usbSource } : {}),
  }
}

/* ===== PLL 目标频率自动解算 ===== */

export interface PllSolution {
  pllSource: string
  params: Record<string, number>
  pllInMhz: number
  vcoMhz: number | null
  pllOutMhz: number
}

export interface SolvePllResult {
  solutions: PllSolution[]
  error?: string
}

/** 输入目标 SYSCLK，返回合法 PLL 参数组合（按 p、n 排序，最多 8 组） */
export function solvePll(
  spec: ClockSpec,
  targetSysclkMhz: number,
  sourceId?: string,
): SolvePllResult {
  if (!Number.isFinite(targetSysclkMhz) || targetSysclkMhz <= 0) {
    return { solutions: [], error: '目标频率无效' }
  }
  if (targetSysclkMhz > spec.sysclkMaxMhz) {
    return { solutions: [], error: `目标 ${fmtMhz(targetSysclkMhz)} 超过上限 ${spec.sysclkMaxMhz}MHz` }
  }
  const srcId = sourceId ?? pickDefaultPllSource(spec)
  const hxtal = spec.sources.find((s) => s.hxtal)?.hxtal?.default ?? 25
  const pllIn = sourceFreq(spec, srcId, hxtal)
  if (pllIn === null || pllIn <= 0) {
    return { solutions: [], error: 'PLL 输入源不可用' }
  }

  // 单级倍频（L23x）
  if (spec.pll.params.length === 1 && spec.pll.params[0].key === 'mul') {
    const param = spec.pll.params[0]
    const mul = targetSysclkMhz / pllIn
    if (Math.abs(mul - Math.round(mul)) > 1e-6) {
      return { solutions: [], error: `目标 ${fmtMhz(targetSysclkMhz)} 无法由 ${pllIn}MHz 整数倍频得到` }
    }
    const m = Math.round(mul)
    if (m < (param.min ?? 0) || m > (param.max ?? Infinity)) {
      return { solutions: [], error: `倍频系数 ${m} 超出范围 ${param.min}~${param.max}` }
    }
    const out = pllIn * m
    if (out > spec.pll.outMaxMhz) {
      return { solutions: [], error: `输出 ${fmtMhz(out)} 超过 PLL 上限 ${spec.pll.outMaxMhz}MHz` }
    }
    return {
      solutions: [{ pllSource: srcId, params: { mul: m }, pllInMhz: pllIn, vcoMhz: null, pllOutMhz: out }],
    }
  }

  // 多级 PLL（F4xx：psc × n ÷ p）
  const pSpec = spec.pll
  const pscSpec = pSpec.params.find((p) => p.key === 'psc')
  const nSpec = pSpec.params.find((p) => p.key === 'n')
  const pSpec2 = pSpec.params.find((p) => p.key === 'p')
  if (!pscSpec || !nSpec || !pSpec2) {
    return { solutions: [], error: '器件 PLL 结构不受支持' }
  }
  const pOptions = pSpec2.options ?? [2, 4, 6, 8]
  const solutions: PllSolution[] = []
  for (const p of pOptions) {
    for (let psc = pscSpec.min ?? 2; psc <= (pscSpec.max ?? 63); psc++) {
      const pllInAfter = pllIn / psc
      if (pllInAfter < (pSpec.inMinMhz ?? 0) || pllInAfter > (pSpec.inMaxMhz ?? Infinity)) continue
      const n = (targetSysclkMhz * psc * p) / pllIn
      if (Math.abs(n - Math.round(n)) > 1e-6) continue
      const nv = Math.round(n)
      if (nv < (nSpec.min ?? 0) || nv > (nSpec.max ?? Infinity)) continue
      const vco = pllInAfter * nv
      if (vco < (pSpec.vcoMinMhz ?? 0) || vco > (pSpec.vcoMaxMhz ?? Infinity)) continue
      const out = vco / p
      if (out > pSpec.outMaxMhz) continue
      solutions.push({
        pllSource: srcId,
        params: { psc, n: nv, p },
        pllInMhz: pllIn,
        vcoMhz: vco,
        pllOutMhz: out,
      })
    }
  }
  // 推荐排序：PLL 输入（源/psc）最接近 1MHz 的组合优先（与官方例程一致），再按 p、n
  const inScore = (s: PllSolution) => Math.abs(s.pllInMhz / (s.params.psc ?? 1) - 1)
  solutions.sort(
    (a, b) =>
      inScore(a) - inScore(b) ||
      (a.params.p ?? 0) - (b.params.p ?? 0) ||
      (a.params.n ?? 0) - (b.params.n ?? 0),
  )
  if (solutions.length === 0) {
    return { solutions: [], error: `目标 ${fmtMhz(targetSysclkMhz)} 无合法 PLL 组合（检查输入 1~2MHz / VCO 100~500MHz）` }
  }
  return { solutions: solutions.slice(0, 8) }
}
