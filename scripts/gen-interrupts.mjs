// 一次性工具：从 CMSIS 头文件 IRQn 枚举生成 data/devices/<id>/interrupts.json
// 用法: node scripts/gen-interrupts.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function evalCond(expr, defines) {
  return expr
    .split(/\s*\|\|\s*/)
    .map((p) => p.trim())
    .some((t) =>
      t
        .split(/\s*&&\s*/)
        .map((x) => x.trim())
        .every((x) => {
          const def = x.match(/^defined\s*\(\s*(\w+)\s*\)$/)
          if (def) return !!defines[def[1]]
          const ndef = x.match(/^!defined\s*\(\s*(\w+)\s*\)$/)
          if (ndef) return !defines[ndef[1]]
          return !!defines[x]
        }),
    )
}

function parseIrqn(headerPath, defines) {
  const text = readFileSync(headerPath, 'utf8')
  const start = text.indexOf('typedef enum IRQn')
  const end = text.indexOf('} IRQn_Type;')
  if (start < 0 || end < 0) throw new Error(`无法定位 IRQn 枚举: ${headerPath}`)
  const lines = text.slice(start, end).split(/\r?\n/)
  const stack = []
  let active = true
  const irqs = []
  for (const raw of lines) {
    const line = raw.replace(/\/\*.*?\*\//g, '').trim()
    if (!line) continue
    const mIf = line.match(/^#if\s+(.*)$/)
    const mIfdef = line.match(/^#ifdef\s+(\w+)/)
    const mIfndef = line.match(/^#ifndef\s+(\w+)/)
    if (mIf || mIfdef || mIfndef) {
      const cond = mIf ? evalCond(mIf[1], defines) : mIfdef ? !!defines[mIfdef[1]] : !defines[mIfndef[1]]
      stack.push({ parentActive: active, taken: active && cond })
      active = active && cond
      continue
    }
    if (/^#else/.test(line)) {
      const top = stack[stack.length - 1]
      active = top.parentActive && !top.taken
      top.taken = true
      continue
    }
    if (/^#endif/.test(line)) {
      active = stack.pop().parentActive
      continue
    }
    if (!active) continue
    const entry = line.match(/^(\w+)\s*=\s*(-?\d+),?\s*(.*)$/)
    if (entry) {
      irqs.push({
        name: entry[1],
        number: Number(entry[2]),
        comment: (entry[3] || '').replace(/^\/\*!?\s*|\*\/$/g, '').trim(),
      })
    }
  }
  return irqs
}

const targets = [
  {
    id: 'gd32l233rct6',
    device: 'GD32L233RCT6',
    header:
      'D:/Project/GD32_Project/TX_RTOS/GD32L23x_Firmware_Library_V2.4.0/Firmware/CMSIS/GD/GD32L23x/Include/gd32l23x.h',
    defines: { GD32L233: true },
    source: 'GD32L23x CMSIS gd32l23x.h IRQn_Type（GD32L233 分支）',
  },
  {
    id: 'gd32f427ve',
    device: 'GD32F427VE',
    header:
      process.env.TEMP + '/hal_gigadevice/gd32f4xx/cmsis/gd/gd32f4xx/include/gd32f4xx.h',
    defines: { GD32F427: true },
    source: 'GD32F4xx CMSIS gd32f4xx.h IRQn_Type（GD32F427 分支）',
  },
]

for (const t of targets) {
  const irqs = parseIrqn(t.header, t.defines)
  const out = {
    device: t.device,
    source: t.source,
    irqs,
  }
  writeFileSync(
    path.join(root, 'data', 'devices', t.id, 'interrupts.json'),
    JSON.stringify(out, null, 2) + '\n',
  )
  console.log(`${t.device}: ${irqs.length} IRQs -> data/devices/${t.id}/interrupts.json`)
}
