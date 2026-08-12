// 用 arm-none-eabi-gcc + GD32 固件库编译验证生成代码（支持多器件）。
// 用法: node scripts/verify-build.mjs [--project <project.json>]
// 固件库路径（环境变量，默认指向本机已有的库）:
//   GD32L23X_FIRMWARE_DIR: GD32L23x_Firmware_Library_V2.4.0/Firmware
//   GD32F4XX_FIRMWARE_DIR: hal_gigadevice/gd32f4xx（或官方 GD32F4xx 固件库 Firmware 目录）
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

const argIdx = process.argv.indexOf('--project')
const projectFile =
  argIdx >= 0 ? process.argv[argIdx + 1] : path.join(root, 'tests', 'fixtures', 'sample-project.json')

function die(msg) {
  console.error(`[verify-build] 失败: ${msg}`)
  process.exit(1)
}

const defaultDirs = {
  GD32L233RCT6:
    process.env.GD32L23X_FIRMWARE_DIR ||
    path.join(os.homedir(), 'GD32L23x_Firmware_Library_V2.4.0', 'Firmware'),
  GD32F427VE:
    process.env.GD32F4XX_FIRMWARE_DIR ||
    path.join(os.tmpdir(), 'hal_gigadevice', 'gd32f4xx'),
}

const config = JSON.parse(readFileSync(projectFile, 'utf8'))
const deviceId = config.device
if (!defaultDirs[deviceId]) die(`不支持的器件: ${deviceId}`)

const firmwareDir = defaultDirs[deviceId]
if (!existsSync(firmwareDir)) {
  die(`固件库目录不存在: ${firmwareDir}\n请设置对应的 GD32*XX_FIRMWARE_DIR 环境变量`)
}

let gcc = 'arm-none-eabi-gcc'
try {
  execFileSync(gcc, ['--version'], { stdio: 'ignore' })
} catch {
  die('未找到 arm-none-eabi-gcc，请安装 GNU Arm Embedded Toolchain')
}

const workDir = mkdtempSync(path.join(os.tmpdir(), 'mcucubemx-'))
const outDir = path.join(workDir, 'out')
console.log(`[${deviceId}] 工作目录: ${workDir}`)

// 1) 生成代码（与浏览器端同一逻辑）
try {
  execFileSync(process.execPath, ['node_modules/vite-node/vite-node.mjs', 'scripts/build-generated.mts', projectFile, outDir], {
    cwd: root,
    stdio: 'inherit',
  })
} catch {
  die('代码生成失败（请先 npm install）')
}

// 2) 组装编译命令
const isL23x = deviceId === 'GD32L233RCT6'
const flashKb = isL23x ? 256 : 512
const sramKb = isL23x ? 32 : 256
const mcu = isL23x ? 'cortex-m23' : 'cortex-m4'
// GD32F4xx 库按旧版 CMSIS 编写（NVIC->IPR），而 CMSIS 5.x 命名为 IP；编译期做兼容别名
const define = isL23x ? ['-DGD32L23x', '-DGD32L233'] : ['-DGD32F427', '-DIPR=IP']

let includes
let sources
let startup
if (isL23x) {
  const cmsis = path.join(firmwareDir, 'CMSIS', 'GD', 'GD32L23x', 'Include')
  const cmsisRoot = path.join(firmwareDir, 'CMSIS', 'Include')
  const spInc = path.join(firmwareDir, 'GD32L23x_standard_peripheral', 'Include')
  const spSrc = path.join(firmwareDir, 'GD32L23x_standard_peripheral', 'Source')
  includes = [cmsis]
  if (existsSync(cmsisRoot)) includes.push(cmsisRoot)
  includes.push(spInc)
  const templateDir = path.resolve(firmwareDir, '..', 'Template')
  if (existsSync(path.join(templateDir, 'gd32l23x_libopt.h'))) includes.push(templateDir)
  startup = path.join(firmwareDir, 'CMSIS', 'GD', 'GD32L23x', 'Source', 'GCC', 'startup_gd32l233.S')
  sources = [
    path.join(firmwareDir, 'CMSIS', 'GD', 'GD32L23x', 'Source', 'system_gd32l23x.c'),
    path.join(spSrc, 'gd32l23x_gpio.c'),
    path.join(spSrc, 'gd32l23x_exti.c'),
    path.join(spSrc, 'gd32l23x_misc.c'),
    path.join(spSrc, 'gd32l23x_rcu.c'),
    path.join(spSrc, 'gd32l23x_adc.c'),
    path.join(spSrc, 'gd32l23x_usart.c'),
  ]
} else {
  const cmsis = path.join(firmwareDir, 'cmsis', 'gd', 'gd32f4xx', 'include')
  const spInc = path.join(firmwareDir, 'standard_peripheral', 'include')
  const spSrc = path.join(firmwareDir, 'standard_peripheral', 'source')
  const repoFw = path.join(root, 'scripts', 'firmware')
  includes = [cmsis, path.join(repoFw, 'cmsis'), spInc, repoFw]
  startup = path.join(repoFw, 'startup_gd32f427.S')
  sources = [
    path.join(firmwareDir, 'cmsis', 'gd', 'gd32f4xx', 'source', 'system_gd32f4xx.c'),
    path.join(spSrc, 'gd32f4xx_gpio.c'),
    path.join(spSrc, 'gd32f4xx_exti.c'),
    path.join(spSrc, 'gd32f4xx_misc.c'),
    path.join(spSrc, 'gd32f4xx_rcu.c'),
    path.join(spSrc, 'gd32f4xx_adc.c'),
    path.join(spSrc, 'gd32f4xx_pmu.c'),
    path.join(spSrc, 'gd32f4xx_usart.c'),
  ]
}

const compiled = [startup, ...sources]
for (const f of ['gpio.c', 'clock.c', 'app_it.c', 'main.c']) {
  const p = path.join(outDir, f)
  if (existsSync(p)) compiled.push(p)
}

// 3) 最小链接脚本
const ld = path.join(workDir, 'link.ld')
writeFileSync(
  ld,
  `MEMORY
{
  FLASH (rx) : ORIGIN = 0x08000000, LENGTH = ${flashKb}K
  RAM (rwx)  : ORIGIN = 0x20000000, LENGTH = ${sramKb}K
}
_estack = ORIGIN(RAM) + LENGTH(RAM);
`,
)

const args = [
  `-mcpu=${mcu}`,
  '-mthumb',
  '-O1',
  '-g',
  '-Wall',
  '-ffunction-sections',
  '-fdata-sections',
  ...define,
  ...includes.flatMap((i) => ['-I', i]),
  ...compiled,
  '-T',
  ld,
  '-Wl,--gc-sections',
  '-specs=nano.specs',
  '-o',
  path.join(workDir, 'firmware.elf'),
]

console.log('编译链接中...')
try {
  execFileSync(gcc, args, { stdio: 'inherit' })
} catch {
  die('编译链接失败，详见上方输出')
}

console.log(`\n[verify-build] OK: ${deviceId} 生成代码已通过 arm-none-eabi-gcc 完整编译链接`)
console.log(`输出: ${path.join(workDir, 'firmware.elf')}`)
