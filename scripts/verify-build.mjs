// 用 arm-none-eabi-gcc + GD32L23x 固件库编译验证生成代码。
// 用法: node scripts/verify-build.mjs [--project <project.json>]
// 固件库路径: 环境变量 GD32L23X_FIRMWARE_DIR，默认本机 D:\Project\GD32_Project\TX_RTOS\GD32L23x_Firmware_Library_V2.4.0
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

const firmwareDir =
  process.env.GD32L23X_FIRMWARE_DIR ||
  'D:\\Project\\GD32_Project\\TX_RTOS\\GD32L23x_Firmware_Library_V2.4.0\\Firmware'

const argIdx = process.argv.indexOf('--project')
const projectFile =
  argIdx >= 0 ? process.argv[argIdx + 1] : path.join(root, 'tests', 'fixtures', 'sample-project.json')

function die(msg) {
  console.error(`[verify-build] 失败: ${msg}`)
  process.exit(1)
}

if (!existsSync(firmwareDir)) {
  die(`固件库目录不存在: ${firmwareDir}\n请设置环境变量 GD32L23X_FIRMWARE_DIR 指向 GD32L23x_Firmware_Library_V2.4.0/Firmware`)
}

let gcc = 'arm-none-eabi-gcc'
try {
  execFileSync(gcc, ['--version'], { stdio: 'ignore' })
} catch {
  die('未找到 arm-none-eabi-gcc，请安装 GNU Arm Embedded Toolchain')
}

const workDir = mkdtempSync(path.join(os.tmpdir(), 'mcucubemx-'))
const outDir = path.join(workDir, 'out')
console.log(`工作目录: ${workDir}`)

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
const cmsis = path.join(firmwareDir, 'CMSIS', 'GD', 'GD32L23x', 'Include')
const cmsisRoot = path.join(firmwareDir, 'CMSIS', 'Include')
const spInc = path.join(firmwareDir, 'GD32L23x_standard_peripheral', 'Include')
const startup = path.join(firmwareDir, 'CMSIS', 'GD', 'GD32L23x', 'Source', 'GCC', 'startup_gd32l233.S')
const system = path.join(firmwareDir, 'CMSIS', 'GD', 'GD32L23x', 'Source', 'system_gd32l23x.c')
const spSrc = path.join(firmwareDir, 'GD32L23x_standard_peripheral', 'Source')

const includes = [cmsis]
if (existsSync(cmsisRoot)) includes.push(cmsisRoot)
includes.push(spInc)
// gd32l23x_libopt.h 是固件库 Template 中的配置头（正式工程中会复制到工程目录）
const templateDir = path.resolve(firmwareDir, '..', 'Template')
if (existsSync(path.join(templateDir, 'gd32l23x_libopt.h'))) {
  includes.push(templateDir)
} else {
  die(`未找到 ${path.join(templateDir, 'gd32l23x_libopt.h')}`)
}

const sources = [startup, system, path.join(spSrc, 'gd32l23x_gpio.c'), path.join(spSrc, 'gd32l23x_exti.c'), path.join(spSrc, 'gd32l23x_misc.c'), path.join(spSrc, 'gd32l23x_rcu.c')]
for (const f of ['gpio.c', 'app_it.c', 'main.c']) {
  const p = path.join(outDir, f)
  if (existsSync(p)) sources.push(p)
}

// 3) 最小链接脚本（FLASH 256KB / RAM 32KB）
const ld = path.join(workDir, 'cortex-m23.ld')
writeFileSync(
  ld,
  `MEMORY
{
  FLASH (rx) : ORIGIN = 0x08000000, LENGTH = 256K
  RAM (rwx)  : ORIGIN = 0x20000000, LENGTH = 32K
}
_estack = ORIGIN(RAM) + LENGTH(RAM);
`,
)

const args = [
  '-mcpu=cortex-m23',
  '-mthumb',
  '-O1',
  '-g',
  '-Wall',
  '-ffunction-sections',
  '-fdata-sections',
  '-DGD32L23x',
  '-DGD32L233',
  ...includes.flatMap((i) => ['-I', i]),
  ...sources,
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

console.log('\n[verify-build] OK: 生成代码已通过 arm-none-eabi-gcc 完整编译链接')
console.log(`输出: ${path.join(workDir, 'firmware.elf')}`)
