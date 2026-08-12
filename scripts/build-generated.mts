// 生成工程文件到指定目录（由 verify-build.mjs 以 vite-node 调用，保证与浏览器端同一套生成逻辑）
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { generateProject, peripheralInitCalls } from '../src/lib/codegen/index'
import { getDeviceData } from '../src/data/device'
import type { ProjectConfig } from '../src/types'

const configPath = process.argv[2]
const outDir = process.argv[3]
if (!configPath || !outDir) {
  console.error('用法: vite-node scripts/build-generated.mts <project.json> <outdir>')
  process.exit(1)
}

const config = JSON.parse(readFileSync(configPath, 'utf8')) as ProjectConfig
const files = generateProject(config, getDeviceData(config.device))
mkdirSync(outDir, { recursive: true })
for (const file of files) {
  writeFileSync(path.join(outDir, file.path), file.content)
}

const prefix = config.naming.prefix || 'MX_'
const deviceData = getDeviceData(config.device)
const periphCalls = peripheralInitCalls(config, deviceData)
const periphIncludes = [
  periphCalls.some((c) => c.includes('USART')) ? '#include "usart.h"' : '',
  periphCalls.some((c) => c.includes('ADC')) ? '#include "adc.h"' : '',
]
  .filter(Boolean)
  .join('\n')
const main = `#include "gpio.h"
#include "clock.h"
${periphIncludes}

int main(void)
{
    ${prefix}Clock_Init();
    ${prefix}GPIO_Init();
${periphCalls.map((c) => `    ${c}`).join('\n')}
${config.pins.some((p) => p.mode === 'INPUT' && p.params.exti?.enabled) ? `    ${prefix}EXTI_Init();\n` : ''}    while (1) {
    }
}
`
writeFileSync(path.join(outDir, 'main.c'), main)
console.log(`generated ${files.length} files + main.c -> ${outDir}`)
