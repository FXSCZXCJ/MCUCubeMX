import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { generateProject } from '../src/lib/codegen'
import { getDeviceData } from '../src/data/device'
import type { ProjectConfig } from '../src/types'

const fixturesDir = path.join(__dirname, 'fixtures')

function loadFixture(name: string): ProjectConfig {
  return JSON.parse(readFileSync(path.join(fixturesDir, name), 'utf8')) as ProjectConfig
}

function file(files: { path: string; content: string }[], name: string): string {
  const f = files.find((x) => x.path === name)
  if (!f) throw new Error(`缺少生成文件 ${name}`)
  return f.content
}

describe('USART 代码生成 GD32L233RCT6', () => {
  const config = loadFixture('sample-project.json')
  const files = generateProject(config, getDeviceData(config.device))

  it('usart.c 含波特率/字长/停止位/校验/流控/收发与时钟源', () => {
    const c = file(files, 'usart.c')
    expect(c).toContain('void MX_USART0_Init(void)')
    expect(c).toContain('rcu_periph_clock_enable(RCU_USART0);')
    expect(c).toContain('rcu_usart_clock_config(IDX_USART0, RCU_USARTSRC_CKAPB);')
    expect(c).toContain('usart_baudrate_set(USART0, 115200);')
    expect(c).toContain('usart_word_length_set(USART0, USART_WL_8BIT);')
    expect(c).toContain('usart_stop_bit_set(USART0, USART_STB_1BIT);')
    expect(c).toContain('usart_parity_config(USART0, USART_PM_NONE);')
    expect(c).toContain('usart_hardware_flow_rts_config(USART0, USART_RTS_DISABLE);')
    expect(c).toContain('usart_transmit_config(USART0, USART_TRANSMIT_ENABLE);')
    expect(c).toContain('usart_receive_config(USART0, USART_RECEIVE_ENABLE);')
    expect(c).toContain('usart_enable(USART0);')
  })

  it('usart.h 声明初始化函数', () => {
    const h = file(files, 'usart.h')
    expect(h).toContain('void MX_USART0_Init(void);')
  })

  it('project.json 往返保留 peripherals', () => {
    expect(JSON.parse(file(files, 'project.json')).peripherals).toEqual(config.peripherals)
  })
})

describe('ADC 代码生成 GD32L233RCT6（单 ADC 无 periph 参数）', () => {
  const config = loadFixture('sample-project.json')
  const files = generateProject(config, getDeviceData(config.device))

  it('adc.c 使用 adc_routine_channel_config 且无 periph 参数', () => {
    const c = file(files, 'adc.c')
    expect(c).toContain('void MX_ADC0_Init(void)')
    expect(c).toContain('rcu_periph_clock_enable(RCU_ADC);')
    expect(c).toContain('adc_resolution_config(ADC_RESOLUTION_12B);')
    expect(c).toContain('adc_data_alignment_config(ADC_DATAALIGN_RIGHT);')
    expect(c).toContain('adc_channel_length_config(ADC_ROUTINE_CHANNEL, 1);')
    expect(c).toContain('adc_routine_channel_config(1, ADC_CHANNEL_0, ADC_SAMPLETIME_13POINT5);')
    expect(c).toContain('adc_enable();')
    expect(c).toContain('adc_calibration_enable();')
    expect(c).toContain('adc_software_trigger_enable(ADC_ROUTINE_CHANNEL);')
    expect(c).not.toContain('adc_enable(ADC0')
  })
})

describe('USART/ADC 代码生成 GD32F427VE（带 ADC periph 参数）', () => {
  const config = loadFixture('sample-project-f427.json')
  const files = generateProject(config, getDeviceData(config.device))

  it('adc.c 使用 adc_regular_channel_config(ADC0, ...)', () => {
    const c = file(files, 'adc.c')
    expect(c).toContain('rcu_periph_clock_enable(RCU_ADC0);')
    expect(c).toContain('adc_resolution_config(ADC0, ADC_RESOLUTION_12B);')
    expect(c).toContain('adc_channel_length_config(ADC0, ADC_REGULAR_CHANNEL, 1);')
    expect(c).toContain('adc_regular_channel_config(ADC0, 1, ADC_CHANNEL_0, ADC_SAMPLETIME_15);')
    expect(c).toContain('adc_enable(ADC0);')
    expect(c).toContain('adc_calibration_enable(ADC0);')
    expect(c).toContain('adc_software_trigger_enable(ADC0, ADC_REGULAR_CHANNEL);')
  })

  it('usart.c 不生成时钟源配置 API（F427 固定总线时钟）', () => {
    const c = file(files, 'usart.c')
    expect(c).toContain('usart_baudrate_set(USART0, 115200);')
    expect(c).not.toContain('rcu_usart_clock_config')
  })
})
