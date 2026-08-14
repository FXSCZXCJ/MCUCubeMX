import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import JSZip from 'jszip'
import { exportZip, generateProject, type CodegenSelection } from '../src/lib/codegen'
import { getDeviceData } from '../src/data/device'
import type { ProjectConfig } from '../src/types'

const fixturesDir = path.join(__dirname, 'fixtures')
const config = JSON.parse(
  readFileSync(path.join(fixturesDir, 'sample-project.json'), 'utf8'),
) as ProjectConfig
const dd = getDeviceData(config.device)

function paths(sel: Partial<CodegenSelection>) {
  const full: CodegenSelection = {
    pinDefs: true,
    pinInit: true,
    clockDefs: true,
    clockInit: true,
    periphInit: true,
    ...sel,
  }
  return generateProject(config, dd, full)
    .map((f) => f.path)
    .sort()
}

describe('代码生成子项选择', () => {
  it('默认全选：生成全部文件', () => {
    const all = generateProject(config, dd)
    expect(all.map((f) => f.path)).toEqual(
      expect.arrayContaining([
        'gpio.h',
        'gpio.c',
        'app_it.c',
        'clock.h',
        'clock.c',
        'usart.h',
        'usart.c',
        'adc.h',
        'adc.c',
        'project.json',
        'README.md',
      ]),
    )
  })

  it('仅引脚定义：只生成 gpio.h', () => {
    expect(paths({ pinDefs: true, pinInit: false, clockDefs: false, clockInit: false, periphInit: false })).toEqual(
      ['README.md', 'gpio.h', 'project.json'],
    )
  })

  it('仅引脚初始化：gpio.c + app_it.c', () => {
    expect(paths({ pinDefs: false, pinInit: true, clockDefs: false, clockInit: false, periphInit: false })).toEqual(
      ['README.md', 'app_it.c', 'gpio.c', 'project.json'],
    )
  })

  it('仅时钟初始化：clock.c 且 README 提到时钟', () => {
    const files = generateProject(config, dd, {
      pinDefs: false,
      pinInit: false,
      clockDefs: false,
      clockInit: true,
      periphInit: false,
    })
    expect(files.map((f) => f.path).sort()).toEqual(['README.md', 'clock.c', 'project.json'])
    expect(files.find((f) => f.path === 'README.md')!.content).toContain('MX_Clock_Init')
  })

  it('不选外设初始化：不生成 usart/adc 文件', () => {
    const files = generateProject(config, dd, {
      pinDefs: true,
      pinInit: true,
      clockDefs: true,
      clockInit: true,
      periphInit: false,
    })
    expect(files.some((f) => f.path.startsWith('usart') || f.path.startsWith('adc'))).toBe(false)
    expect(files.find((f) => f.path === 'README.md')!.content).not.toContain('usart.h')
  })

  it('exportZip 按选择打包', async () => {
    const blob = await exportZip(config, dd, {
      pinDefs: true,
      pinInit: false,
      clockDefs: false,
      clockInit: false,
      periphInit: false,
    })
    const zip = await JSZip.loadAsync(await blob.arrayBuffer())
    expect(Object.keys(zip.files).filter(Boolean).sort()).toEqual(['README.md', 'gpio.h', 'project.json'])
  })
})
