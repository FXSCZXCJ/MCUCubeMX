// 器件数据校验（支持多器件）：引脚完整性、AF 表与引脚定义一致性、EXTI 分组正确性、clock.json 结构。
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const devicesDir = path.join(root, 'data', 'devices')
const errors = []

const devices = readdirSync(devicesDir).filter((name) =>
  statSync(path.join(devicesDir, name)).isDirectory(),
)

for (const dev of devices) {
  const read = (name) => JSON.parse(readFileSync(path.join(devicesDir, dev, name), 'utf8'))
  const pkg = read('package.json')
  const af = read('af.json')
  const exti = read('exti.json')
  const clock = read('clock.json')
  const periph = read('peripherals.json')
  const interrupts = read('interrupts.json')
  const fail = (msg) => errors.push(`[${dev}] ${msg}`)
  const pins = pkg.pins
  const pinsPerSide = pkg.pinsPerSide

  if (!pinsPerSide || pins.length !== pinsPerSide * 4) {
    fail(`pins 数量应为 ${pinsPerSide * 4}，实际 ${pins?.length}`)
    continue
  }
  if (!pkg.firmware?.header || !pkg.firmware?.speeds?.length || !pkg.firmware?.define) {
    fail('缺少完整的 firmware 档案（header/speeds/define）')
  }

  const numbers = pins.map((p) => p.number)
  if (new Set(numbers).size !== numbers.length) fail('引脚编号存在重复')
  for (let n = 1; n <= numbers.length; n++) {
    if (!numbers.includes(n)) fail(`缺少封装脚 #${n}`)
  }
  const sides = ['top', 'right', 'bottom', 'left']
  const sideCounts = { top: 0, right: 0, bottom: 0, left: 0 }
  const validSpecials = new Set(['nrst', 'boot', 'swd', 'osc'])
  for (const pin of pins) {
    if (!sides.includes(pin.side)) fail(`${pin.name}: 非法 side ${pin.side}`)
    else sideCounts[pin.side]++
    if (pin.special && !validSpecials.has(pin.special)) fail(`${pin.name}: 非法 special ${pin.special}`)
    if (!['IO', 'POWER', 'NC'].includes(pin.type)) fail(`${pin.name}: 非法 type ${pin.type}`)
  }
  for (const side of sides) {
    if (sideCounts[side] !== pinsPerSide) fail(`side ${side} 应有 ${pinsPerSide} 个引脚，实际 ${sideCounts[side]}`)
  }

  const pinSet = new Set(pins.map((p) => p.name))
  const seenAf = new Set()
  const afByPin = new Map()
  for (const entry of af.entries) {
    if (!pinSet.has(entry.pin)) fail(`af.json 引用未知引脚 ${entry.pin}`)
    if (!Number.isInteger(entry.af) || entry.af < 0 || entry.af > 15) fail(`${entry.pin}: af 越界 ${entry.af}`)
    if (!entry.signal || typeof entry.signal !== 'string') fail(`${entry.pin} AF${entry.af}: 缺少 signal`)
    const key = `${entry.pin}|${entry.af}|${entry.signal}`
    if (seenAf.has(key)) fail(`af.json 重复记录 ${key}`)
    seenAf.add(key)
    const list = afByPin.get(entry.pin) ?? new Set()
    list.add(entry.signal)
    afByPin.set(entry.pin, list)
  }
  for (const pin of pins) {
    if (pin.type !== 'IO') continue
    const altSet = new Set(pin.alternate ?? [])
    const afSignals = afByPin.get(pin.name) ?? new Set()
    const missing = [...altSet].filter((s) => !afSignals.has(s))
    const extra = [...afSignals].filter((s) => !altSet.has(s))
    if (missing.length) fail(`${pin.name}: 引脚定义有但 AF 表缺少 ${missing.join(',')}`)
    if (extra.length) fail(`${pin.name}: AF 表多出 ${extra.join(',')}`)
  }

  const extiSeen = new Set()
  for (const entry of exti.entries) {
    const pin = pins.find((p) => p.name === entry.pin)
    if (!pin) fail(`exti.json 引用未知引脚 ${entry.pin}`)
    if (pin && pin.type !== 'IO') fail(`${entry.pin}: 非 IO 引脚不应有 EXTI`)
    if (pin && pin.type === 'IO') {
      const index = Number.parseInt(entry.pin.slice(2), 10)
      if (entry.line !== index) fail(`${entry.pin}: line ${entry.line} 与引脚号 ${index} 不一致`)
      const expect = entry.line <= 4 ? `EXTI${entry.line}` : entry.line <= 9 ? 'EXTI5_9' : 'EXTI10_15'
      if (entry.irq !== expect) fail(`${entry.pin}: irq ${entry.irq} 应为 ${expect}`)
    }
    if (extiSeen.has(entry.pin)) fail(`exti.json 重复 ${entry.pin}`)
    extiSeen.add(entry.pin)
  }

  // ===== clock.json 结构校验 =====
  if (!clock || typeof clock !== 'object') {
    fail('缺少 clock.json')
  } else {
    validateClockData(clock, fail)
  }
  validatePeripheralData(periph, fail)
  validateInterruptsData(interrupts, pkg.device, fail)
}

function validatePeripheralData(periph, fail) {
  if (!periph || typeof periph !== 'object') return fail('缺少 peripherals.json')
  if (!Array.isArray(periph.usart) || !Array.isArray(periph.adc)) {
    return fail('peripherals.json 需要 usart/adc 数组')
  }
  const ids = new Set()
  for (const u of periph.usart) {
    if (!u.id || !u.afPrefix || !u.periphMacro || !u.clockEnable) {
      fail(`peripherals.usart 缺少字段: ${JSON.stringify(u)}`)
      continue
    }
    if (ids.has(u.id)) fail(`peripherals.usart 重复 id ${u.id}`)
    ids.add(u.id)
    if (u.clockSourceApi) {
      if (!u.clockSourceIdx || !Array.isArray(u.clockSources) || u.clockSources.length === 0) {
        fail(`${u.id} 时钟源配置不完整（api/idx/clockSources）`)
      }
      if (!u.defaultClockSource) fail(`${u.id} 缺少 defaultClockSource`)
      for (const c of u.clockSources ?? []) {
        if (!c.key || !c.label || !c.macro) fail(`${u.id} clockSources 条目非法`)
      }
    }
  }
  for (const a of periph.adc) {
    if (!a.id || !a.afPrefix || !a.clockEnable || !a.channelFunction || !a.groupMacro) {
      fail(`peripherals.adc 缺少字段: ${JSON.stringify(a)}`)
      continue
    }
    if (ids.has(a.id)) fail(`peripherals.adc 重复 id ${a.id}`)
    ids.add(a.id)
    for (const k of ['resolutions', 'dataAlignments', 'sampleTimes', 'externalTriggers']) {
      if (!Array.isArray(a[k]) || a[k].length === 0) {
        fail(`${a.id} ${k} 不能为空`)
      } else {
        for (const o of a[k]) {
          if (!o.label || !o.macro) fail(`${a.id} ${k} 条目非法`)
        }
      }
    }
    const d = a.defaults
    if (!d || ![d.resolution, d.dataAlignment, d.sampleTime, d.externalTrigger].every(Boolean)) {
      fail(`${a.id} defaults 不完整`)
    }
  }
  if (periph.adcInternal !== undefined) {
    if (!Array.isArray(periph.adcInternal) || periph.adcInternal.length === 0) {
      fail('peripherals.adcInternal 不能为空')
    } else {
      const seen = new Set()
      for (const c of periph.adcInternal) {
        if (!Number.isInteger(c.channel) || !c.label) {
          fail(`peripherals.adcInternal 条目非法: ${JSON.stringify(c)}`)
          continue
        }
        if (seen.has(c.channel)) fail(`peripherals.adcInternal 重复通道 ${c.channel}`)
        seen.add(c.channel)
      }
    }
  }
}

function validateInterruptsData(interrupts, device, fail) {
  if (!interrupts || typeof interrupts !== 'object') return fail('缺少 interrupts.json')
  if (interrupts.device !== device) fail(`interrupts.device 应为 ${device}`)
  if (!Array.isArray(interrupts.irqs) || interrupts.irqs.length === 0) {
    return fail('interrupts.irqs 不能为空')
  }
  const names = new Set()
  const numbers = new Set()
  for (const irq of interrupts.irqs) {
    if (!irq.name || typeof irq.name !== 'string' || !Number.isInteger(irq.number)) {
      fail(`interrupts.irqs 条目非法: ${JSON.stringify(irq)}`)
      continue
    }
    if (names.has(irq.name)) fail(`interrupts.irqs 重复名称 ${irq.name}`)
    if (numbers.has(irq.number)) fail(`interrupts.irqs 重复编号 ${irq.number}`)
    names.add(irq.name)
    numbers.add(irq.number)
  }
}

function validateClockData(clock, fail) {
  const pos = (n) => n > 0 && Number.isFinite(n)
  if (!pos(clock.sysclkMaxMhz)) fail('clock.sysclkMaxMhz 应为正数')
  const sourceIds = new Set()
  if (!Array.isArray(clock.sources) || clock.sources.length === 0) {
    fail('clock.sources 不能为空')
  } else {
    for (const s of clock.sources) {
      if (!s.id || !s.label) fail(`clock.sources 缺少 id/label: ${JSON.stringify(s)}`)
      if (sourceIds.has(s.id)) fail(`clock.sources 重复 id ${s.id}`)
      sourceIds.add(s.id)
      if (s.hxtal) {
        const h = s.hxtal
        if (!(h.min < h.max && pos(h.min) && pos(h.max))) fail(`clock.sources.${s.id}.hxtal 范围非法`)
        if (!(h.default >= h.min && h.default <= h.max)) fail(`clock.sources.${s.id}.hxtal.default 超出范围`)
      } else if (!pos(s.freqMhz) && !s.pll) {
        fail(`clock.sources.${s.id} 需要 freqMhz、hxtal 或 pll 标记`)
      }
    }
  }
  const pll = clock.pll
  if (!pos(pll?.outMaxMhz)) fail('clock.pll.outMaxMhz 应为正数')
  if (!Array.isArray(pll?.sourceOptions) || pll.sourceOptions.length === 0) {
    fail('clock.pll.sourceOptions 不能为空')
  } else {
    for (const id of pll.sourceOptions) {
      if (!sourceIds.has(id)) fail(`clock.pll.sourceOptions 引用未知源 ${id}`)
    }
  }
  if (!Array.isArray(pll?.params) || pll.params.length === 0) {
    fail('clock.pll.params 不能为空')
  } else {
    const keys = new Set()
    for (const p of pll.params) {
      if (!p.key || !p.label) fail(`clock.pll.params 缺少 key/label: ${JSON.stringify(p)}`)
      if (keys.has(p.key)) fail(`clock.pll.params 重复 key ${p.key}`)
      keys.add(p.key)
      if (p.kind === 'select') {
        if (!Array.isArray(p.options) || !p.options.includes(p.default)) {
          fail(`clock.pll.params.${p.key} select 需要 options 且 default 在其中`)
        }
      } else if (p.kind === 'number') {
        if (!(p.min <= p.default && p.default <= p.max)) fail(`clock.pll.params.${p.key} default 超出范围`)
      } else {
        fail(`clock.pll.params.${p.key} kind 非法: ${p.kind}`)
      }
    }
  }
  for (const bus of ['ahb', 'apb1', 'apb2']) {
    const b = clock[bus]
    if (!pos(b?.maxMhz)) fail(`clock.${bus}.maxMhz 应为正数`)
    if (!Array.isArray(b?.options) || b.options.length === 0 || !b.options.every((o) => pos(o))) {
      fail(`clock.${bus}.options 非法`)
    } else if (!b.options.includes(b.default)) {
      fail(`clock.${bus}.default ${b.default} 不在 options 中`)
    }
  }
  const adc = clock.adc
  if (!pos(adc?.maxMhz)) fail('clock.adc.maxMhz 应为正数')
  if (!Array.isArray(adc?.options) || adc.options.length === 0) {
    fail('clock.adc.options 不能为空')
  } else {
    const ids = new Set()
    for (const o of adc.options) {
      if (!o.id || !o.label || !pos(o.div)) fail(`clock.adc.options 非法: ${JSON.stringify(o)}`)
      if (ids.has(o.id)) fail(`clock.adc.options 重复 id ${o.id}`)
      ids.add(o.id)
      if (!['APB1', 'APB2', 'AHB', 'IRC16M', 'IRC48M', 'PLL'].includes(o.source)) {
        fail(`clock.adc.options.${o.id} source 非法: ${o.source}`)
      }
    }
    if (!ids.has(adc.default)) fail(`clock.adc.default ${adc.default} 不在 options 中`)
  }
  if (adc?.codegen) {
    if (!adc.codegen.api || !adc.codegen.argMacro?.includes('<id>')) {
      fail('clock.adc.codegen 需要 api 与包含 <id> 的 argMacro')
    }
  }
  for (const bus of ['ahb', 'apb1', 'apb2', 'adc']) {
    const list = clock.peripherals?.[bus]
    if (!Array.isArray(list) || list.length === 0) {
      fail(`clock.peripherals.${bus} 不能为空`)
    } else {
      const seen = new Set()
      for (const name of list) {
        if (typeof name !== 'string' || !name.trim()) {
          fail(`clock.peripherals.${bus} 含非法项`)
          continue
        }
        if (seen.has(name)) fail(`clock.peripherals.${bus} 重复 ${name}`)
        seen.add(name)
      }
    }
  }
  if (clock.clockSelect !== undefined) {
    if (typeof clock.clockSelect !== 'object' || Array.isArray(clock.clockSelect)) {
      fail('clock.clockSelect 应为对象')
    } else {
      for (const [peri, options] of Object.entries(clock.clockSelect)) {
        if (!peri.trim()) fail('clock.clockSelect 含空外设名')
        if (!Array.isArray(options) || options.length === 0) {
          fail(`clock.clockSelect.${peri} 可选时钟源不能为空`)
          continue
        }
        const seen = new Set()
        for (const opt of options) {
          if (typeof opt !== 'string' || !opt.trim()) {
            fail(`clock.clockSelect.${peri} 含非法选项`)
            continue
          }
          if (seen.has(opt)) fail(`clock.clockSelect.${peri} 重复选项 ${opt}`)
          seen.add(opt)
        }
      }
    }
  }
  if (clock.timerDomains !== undefined) {
    if (!Array.isArray(clock.timerDomains) || clock.timerDomains.length === 0) {
      fail('clock.timerDomains 不能为空')
    } else {
      for (const d of clock.timerDomains) {
        if (
          !d.id ||
          !['apb1', 'apb2'].includes(d.bus) ||
          !Array.isArray(d.peripherals) ||
          d.peripherals.length === 0
        ) {
          fail(`clock.timerDomains 条目非法: ${JSON.stringify(d)}`)
        }
      }
    }
  }
  const lp = clock.lowPower
  if (lp) {
    if (!(pos(lp.lxtalMhz) && pos(lp.irc32kMhz))) {
      fail('clock.lowPower lxtal/irc32k 频率应为正数')
    }
    if (!lp.rtc?.sources?.length || !lp.rtc.default || !Array.isArray(lp.rtc.peripherals)) {
      fail('clock.lowPower.rtc 配置不完整')
    } else {
      for (const s of lp.rtc.sources) {
        if (!s.key || !s.label || !s.macro) fail(`clock.lowPower.rtc.sources 条目非法: ${JSON.stringify(s)}`)
        if (s.freqMhz === undefined && !s.divHxtal) {
          fail(`clock.lowPower.rtc.sources.${s.key} 需要 freqMhz 或 divHxtal`)
        }
      }
      if (!lp.rtc.sources.some((s) => s.key === lp.rtc.default)) {
        fail('clock.lowPower.rtc.default 不在 sources 中')
      }
    }
    if (!lp.fwdgt?.source || !Array.isArray(lp.fwdgt.peripherals)) {
      fail('clock.lowPower.fwdgt 配置不完整')
    }
  }
  const usb = clock.usb48
  if (usb) {
    if (!usb.label || !usb.default || !Array.isArray(usb.sources) || usb.sources.length === 0) {
      fail('clock.usb48 配置不完整')
    } else {
      for (const s of usb.sources) {
        if (!s.key || !s.label || !s.macro || !s.api) {
          fail(`clock.usb48.sources 条目非法: ${JSON.stringify(s)}`)
        }
        if (s.extraApi && !s.extraMacro) fail(`clock.usb48.sources.${s.key} 需要 extraMacro`)
      }
      if (!usb.sources.some((s) => s.key === usb.default)) fail('clock.usb48.default 不在 sources 中')
    }
  }
  const cg = clock.codegen
  if (!cg) return fail('clock.codegen 缺失')
  for (const s of clock.sources ?? []) {
    if (!cg.sysclkSource?.[s.id]) fail(`clock.codegen.sysclkSource 缺少 ${s.id}`)
    if (!cg.oscEnum?.[s.id]) fail(`clock.codegen.oscEnum 缺少 ${s.id}`)
  }
  const hasPll = (clock.sources ?? []).some((s) => s.pll)
  if (hasPll) {
    if (!cg.oscEnum?.PLL) fail('clock.codegen.oscEnum 缺少 PLL')
    if (!cg.sysclkSource?.PLL) fail('clock.codegen.sysclkSource 缺少 PLL')
    if (!cg.pllApi?.name || !Array.isArray(cg.pllApi.args)) fail('clock.codegen.pllApi 非法')
    const paramKeys = new Set((clock.pll?.params ?? []).map((p) => p.key))
    for (const a of cg.pllApi?.args ?? []) {
      if (a !== 'src' && !paramKeys.has(a)) fail(`clock.codegen.pllApi.args 引用未知参数 ${a}`)
    }
    if (cg.pllApi?.args.includes('mul') && !cg.pllApi?.mulMacro?.includes('<mul>')) {
      fail('clock.codegen.pllApi.mulMacro 应包含 <mul>')
    }
  }
  for (const bus of ['ahb', 'apb1', 'apb2']) {
    if (!cg.prescaler?.[bus]?.includes('<div>')) fail(`clock.codegen.prescaler.${bus} 应包含 <div>`)
  }
  for (const srcId of (clock.pll?.sourceOptions ?? [])) {
    if (!cg.pllSrc?.[srcId]) fail(`clock.codegen.pllSrc 缺少 ${srcId}`)
  }
}

if (errors.length) {
  console.error(`器件数据校验失败（${errors.length} 项）：`)
  for (const e of errors) console.error(`  - ${e}`)
  process.exit(1)
}
for (const dev of devices) {
  const pkg = JSON.parse(readFileSync(path.join(devicesDir, dev, 'package.json'), 'utf8'))
  const af = JSON.parse(readFileSync(path.join(devicesDir, dev, 'af.json'), 'utf8'))
  const exti = JSON.parse(readFileSync(path.join(devicesDir, dev, 'exti.json'), 'utf8'))
  const interrupts = JSON.parse(readFileSync(path.join(devicesDir, dev, 'interrupts.json'), 'utf8'))
  console.log(
    `OK: ${pkg.device} ${pkg.package} | ${pkg.pins.length} pins | ${af.entries.length} AF | ${exti.entries.length} EXTI | clock 源=${JSON.parse(readFileSync(path.join(devicesDir, dev, 'clock.json'), 'utf8')).sources.length} | periph u/a=${JSON.parse(readFileSync(path.join(devicesDir, dev, 'peripherals.json'), 'utf8')).usart.length}/${JSON.parse(readFileSync(path.join(devicesDir, dev, 'peripherals.json'), 'utf8')).adc.length} | IRQs=${interrupts.irqs.length}`,
  )
}
