// 器件数据校验（支持多器件）：引脚完整性、AF 表与引脚定义一致性、EXTI 分组正确性。
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
  console.log(
    `OK: ${pkg.device} ${pkg.package} | ${pkg.pins.length} pins | ${af.entries.length} AF entries | ${exti.entries.length} EXTI entries`,
  )
}
