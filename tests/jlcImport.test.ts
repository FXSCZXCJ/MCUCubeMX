import { describe, expect, it } from 'vitest'
import { devices, deviceIds } from '../src/data/device'
import {
  buildExportPlan,
  buildImportDiff,
  buildImportPlan,
  classifyEdaPin,
  matchDeviceIdBySymbol,
  normalizeEdaPinName,
  prioritizeSelectedCandidates,
  resolveModelName,
  stripEdaPinSuffix,
  stripPartSuffix,
} from '../src/lib/jlc/import'
import type { EdaPinInfo } from '../src/lib/jlc/types'
import type { PinAssignment } from '../src/types'

const gd32 = devices['GD32L233RCT6']

describe('嘉立创引脚名分类与归一化', () => {
  it('电源/空脚/GPIO 分类', () => {
    expect(classifyEdaPin('VDD_1')).toBe('POWER')
    expect(classifyEdaPin('VSSA')).toBe('POWER')
    expect(classifyEdaPin('VBAT')).toBe('POWER')
    expect(classifyEdaPin('NC')).toBe('NC')
    expect(classifyEdaPin('PA0')).toBe('IO')
    expect(classifyEdaPin('PA0-WKUP')).toBe('UNKNOWN') // 带后缀，靠别名匹配
    expect(classifyEdaPin('NRST')).toBe('UNKNOWN')
  })

  it('去掉 WKUP/TAMPER-RTC 等后缀', () => {
    expect(stripEdaPinSuffix('PA0-WKUP')).toBe('PA0')
    expect(stripEdaPinSuffix('PC13-TAMPER-RTC')).toBe('PC13')
    expect(stripEdaPinSuffix('PD0-OSC_IN')).toBe('PD0')
    expect(stripEdaPinSuffix('VDD_1')).toBe('VDD_1')
    expect(stripEdaPinSuffix('NRST')).toBe('NRST')
  })

  it('GD32L233RCT6 别名直接命中', () => {
    expect(normalizeEdaPinName(gd32, 'PA0-WKUP')).toBe('PA0')
    expect(normalizeEdaPinName(gd32, 'PC13-TAMPER-RTC')).toBe('PC13')
    expect(normalizeEdaPinName(gd32, 'PC14-OSC32IN')).toBe('PC14')
    expect(normalizeEdaPinName(gd32, 'SWDIO')).toBe('PA13')
    expect(normalizeEdaPinName(gd32, 'SWCLK')).toBe('PA14')
    expect(normalizeEdaPinName(gd32, 'BOOT1')).toBe('PB2')
    expect(normalizeEdaPinName(gd32, 'BOOT0')).toBe('PD3')
    expect(normalizeEdaPinName(gd32, 'OSCIN')).toBe('PF0')
    expect(normalizeEdaPinName(gd32, 'OSCOUT')).toBe('PF1')
  })

  it('后缀剥离后命中规范引脚', () => {
    expect(normalizeEdaPinName(gd32, 'PD0-OSC_IN')).toBe('PD0')
    expect(normalizeEdaPinName(gd32, 'PA5-SPI0_SCK')).toBe('PA5')
  })

  it('电源/未知引脚返回 null', () => {
    expect(normalizeEdaPinName(gd32, 'VDD_1')).toBeNull()
    expect(normalizeEdaPinName(gd32, 'VSS_2')).toBeNull()
    expect(normalizeEdaPinName(gd32, 'FOO')).toBeNull()
  })
})

describe('器件识别', () => {
  it('带 LCSC 后缀/尾缀的符号名', () => {
    expect(matchDeviceIdBySymbol('GD32L233RCT6_C3202813', deviceIds)).toBe('GD32L233RCT6')
    expect(matchDeviceIdBySymbol('GD32F427VET6', deviceIds)).toBe('GD32F427VE')
    expect(matchDeviceIdBySymbol('GD32L233RCT6', deviceIds)).toBe('GD32L233RCT6')
  })

  it('不支持的器件返回 null', () => {
    expect(matchDeviceIdBySymbol('STM32F103C8T6', deviceIds)).toBeNull()
    expect(matchDeviceIdBySymbol('BME280', deviceIds)).toBeNull()
  })
})

describe('器件型号解析', () => {
  it('优先使用非模板的 Name 属性（符号名 223 不影响）', () => {
    expect(
      resolveModelName({
        name: 'GD32L233RCT6',
        symbolName: 'GD32L223RCT6',
        componentName: 'GD32L233RCT6_1',
      }),
    ).toBe('GD32L233RCT6')
  })

  it('模板名回退到器件库条目名并去掉 _N 子部件后缀', () => {
    expect(
      resolveModelName({
        name: '={Manufacturer Part}',
        symbolName: 'GD32L223RCT6',
        componentName: 'GD32L233RCT6_1',
      }),
    ).toBe('GD32L233RCT6')
    expect(stripPartSuffix('GD32F427VET6_2')).toBe('GD32F427VET6')
  })

  it('再回退到 LCSC 名称 / 符号名', () => {
    expect(
      resolveModelName({
        name: '',
        symbolName: 'X',
        componentName: '',
        otherProperty: { 'LCSC Part Name': 'GD32F427VET6' },
      }),
    ).toBe('GD32F427VET6')
    expect(
      resolveModelName({ name: '', symbolName: 'GD32L223RCT6', componentName: '' }),
    ).toBe('GD32L223RCT6')
  })
})

describe('导入计划构建', () => {
  const pins: EdaPinInfo[] = [
    { number: '1', name: 'PA0-WKUP', x: 0, y: 0, net: 'ADC' },
    { number: '2', name: 'PC13-TAMPER-RTC', x: 0, y: 0, net: null },
    { number: '3', name: 'SWDIO', x: 0, y: 0, net: 'SWDIO_NET' },
    { number: '4', name: 'VDD_1', x: 0, y: 0, net: '3V3' },
    { number: '5', name: 'PA1', x: 0, y: 0, net: 'SDA' },
    { number: '6', name: 'PB2', x: 0, y: 0, net: 'BOOT1' },
    { number: '7', name: 'FOO', x: 0, y: 0, net: 'X' },
    { number: '8', name: 'PA3', x: 0, y: 0, net: null },
  ]

  const plan = buildImportPlan(gd32, pins)

  it('只保留可匹配且已连线的普通 IO 引脚', () => {
    expect(plan.matched.map((m) => m.canonical).sort()).toEqual(['PA0', 'PA1'])
    expect(plan.matched[0]).toMatchObject({ edaName: 'PA0-WKUP', net: 'ADC' })
  })

  it('未连线/特殊/电源/未知引脚按原因跳过', () => {
    const byName = new Map(plan.skipped.map((s) => [s.edaName, s.reason]))
    expect(byName.get('PC13-TAMPER-RTC')).toBe('no-net')
    expect(byName.get('SWDIO')).toBe('special')
    expect(byName.get('VDD_1')).toBe('not-io')
    expect(byName.get('PB2')).toBe('special')
    expect(byName.get('FOO')).toBe('unmatched')
    expect(byName.get('PA3')).toBe('no-net')
  })

  it('重复引脚只保留一次', () => {
    const dup = buildImportPlan(gd32, [
      { number: '1', name: 'PA1', x: 0, y: 0, net: 'A' },
      { number: '2', name: 'PA1', x: 0, y: 0, net: 'B' },
    ])
    expect(dup.matched).toHaveLength(1)
  })
})

describe('MCU 候选优先选中', () => {
  const candidates = [
    { primitiveId: 'e36', designator: 'U1', name: '', symbolName: 'STM32F103C8T6', symbolUuid: '' },
    { primitiveId: 'e999', designator: 'U2', name: '', symbolName: 'BME280', symbolUuid: '' },
    { primitiveId: 'e123', designator: 'U3', name: '', symbolName: 'MPU-6050', symbolUuid: '' },
  ]

  it('鼠标选中的器件排最前并成为首选', () => {
    const { list, preferred } = prioritizeSelectedCandidates(candidates, ['e999'])
    expect(list[0].primitiveId).toBe('e999')
    expect(preferred?.primitiveId).toBe('e999')
  })

  it('没有选中时保持原顺序且无首选', () => {
    const { list, preferred } = prioritizeSelectedCandidates(candidates, [])
    expect(list.map((c) => c.primitiveId)).toEqual(['e36', 'e999', 'e123'])
    expect(preferred).toBeNull()
  })

  it('选中多个时按原相对顺序排在前面', () => {
    const { list, preferred } = prioritizeSelectedCandidates(candidates, ['e123', 'e36'])
    expect(list[0].primitiveId).toBe('e36')
    expect(list[1].primitiveId).toBe('e123')
    expect(preferred?.primitiveId).toBe('e36')
  })
})

describe('导入变更对比', () => {
  const current: Record<string, PinAssignment> = {
    PA0: { pin: 'PA0', label: 'LED', mode: 'OUTPUT', params: {} },
    PA1: { pin: 'PA1', label: 'SDA', mode: 'INPUT', params: {} },
    PA2: { pin: 'PA2', label: 'OLD', mode: 'INPUT', params: {} },
  }
  const plan = {
    deviceId: 'GD32L233RCT6',
    matched: [
      { canonical: 'PA0', edaName: 'PA0-WKUP', net: 'ADC' },
      { canonical: 'PA1', edaName: 'PA1', net: 'SDA' },
      { canonical: 'PA5', edaName: 'PA5', net: 'LED_R' },
    ],
    skipped: [],
  }

  it('区分新增/修改/不变/移除', () => {
    const diff = buildImportDiff(current, plan)
    const byPin = new Map(diff.map((d) => [d.pin, d.kind]))
    expect(byPin.get('PA0')).toBe('change')
    expect(byPin.get('PA1')).toBe('keep')
    expect(byPin.get('PA5')).toBe('add')
    expect(byPin.get('PA2')).toBe('remove')
  })

  it('变更项带新旧标签', () => {
    const diff = buildImportDiff(current, plan)
    const pa0 = diff.find((d) => d.pin === 'PA0')
    expect(pa0).toMatchObject({ oldLabel: 'LED', newLabel: 'ADC', oldMode: 'OUTPUT', newMode: 'INPUT' })
  })
})

describe('导出到 EDA 计划构建', () => {
  const gd32 = devices['GD32L233RCT6']
  const assignments: PinAssignment[] = [
    { pin: 'PA0', label: 'ADC', mode: 'INPUT', params: {} },
    { pin: 'PA1', label: 'SDA', mode: 'INPUT', params: {} },
    { pin: 'PA5', label: 'LED_R', mode: 'INPUT', params: {} },
    { pin: 'PA2', label: '', mode: 'INPUT', params: {} },
    { pin: 'PB2', label: 'BOOT', mode: 'INPUT', params: {} },
    { pin: 'PA3', label: 'X', mode: 'INPUT', params: {} },
  ]
  const pinMap: EdaPinInfo[] = [
    { number: '1', name: 'PA0-WKUP', x: 0, y: 0, net: 'ADC' },
    { number: '2', name: 'PA1', x: 0, y: 0, net: 'INT' },
    { number: '3', name: 'PA5', x: 0, y: 0, net: null },
  ]

  it('未连线引脚也放置标签，其余按原因跳过', () => {
    const plan = buildExportPlan(gd32, assignments, pinMap)
    expect(plan.changes.map((c) => c.pin).sort()).toEqual(['PA1', 'PA5'])
    expect(plan.changes.find((c) => c.pin === 'PA1')).toMatchObject({
      oldNet: 'INT',
      newNet: 'SDA',
      mode: 'INPUT',
      x: 0,
      y: 0,
    })
    expect(plan.changes.find((c) => c.pin === 'PA5')).toMatchObject({
      oldNet: null,
      newNet: 'LED_R',
    })
    expect(plan.kept.map((c) => c.pin)).toEqual(['PA0'])
    const skippedReason = new Map(plan.skipped.map((s) => [s.pin, s.skipReason]))
    expect(skippedReason.get('PA2')).toContain('未设置标签')
    expect(skippedReason.get('PB2')).toContain('特殊引脚')
    expect(skippedReason.get('PA3')).toContain('未找到')
  })

  it('输出引脚标记为 OUT 方向并带坐标', () => {
    const plan = buildExportPlan(
      gd32,
      [{ pin: 'PA4', label: 'LED_R', mode: 'OUTPUT', params: {} }],
      [{ number: '4', name: 'PA4', x: 100, y: 200, net: 'X' }],
    )
    expect(plan.changes[0]).toMatchObject({ mode: 'OUTPUT', x: 100, y: 200, newNet: 'LED_R' })
  })
})
