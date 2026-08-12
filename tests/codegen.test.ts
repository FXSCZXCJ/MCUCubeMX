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

describe('代码生成 GD32L233RCT6 (sample-project)', () => {
  const config = loadFixture('sample-project.json')
  const files = generateProject(config, getDeviceData(config.device))

  it('生成完整文件集', () => {
    expect(files.map((f) => f.path).sort()).toEqual(
      ['README.md', 'app_it.c', 'clock.c', 'clock.h', 'gpio.c', 'gpio.h', 'project.json'].sort(),
    )
  })

  it('生成 clock.h/clock.c', () => {
    expect(file(files, 'clock.h')).toContain('void MX_Clock_Init(void);')
    const c = file(files, 'clock.c')
    expect(c).toContain('rcu_system_clock_source_config')
    expect(c).toContain('SYSCLK=64MHz')
  })

  it('gpio.h 包含按组别的宏定义', () => {
    const h = file(files, 'gpio.h')
    expect(h).toContain('#define LED_R_Pin         GPIO_PIN_5')
    expect(h).toContain('#define LED_R_GPIO_Port   GPIOA')
    expect(h).toContain('#include "gd32l23x.h"')
    expect(h).toContain('void MX_EXTI_Init(void);')
  })

  it('gpio.c 生成时钟、输出、输入与 EXTI 初始化', () => {
    const c = file(files, 'gpio.c')
    expect(c).toContain('rcu_periph_clock_enable(RCU_GPIOA);')
    expect(c).toContain('gpio_output_options_set(GPIOA, GPIO_OTYPE_PP, GPIO_OSPEED_50MHZ, GPIO_PIN_5);')
    expect(c).toContain('exti_init(EXTI_13, EXTI_INTERRUPT, EXTI_TRIG_FALLING);')
    expect(c).toContain('nvic_irq_enable(EXTI10_15_IRQn, 0);')
  })

  it('project.json 可往返还原', () => {
    expect(JSON.parse(file(files, 'project.json'))).toEqual(config)
  })

  it('生成内容与快照一致', () => {
    expect(file(files, 'gpio.h')).toMatchSnapshot()
    expect(file(files, 'gpio.c')).toMatchSnapshot()
    expect(file(files, 'app_it.c')).toMatchSnapshot()
  })
})

describe('代码生成 GD32F427VE (sample-project-f427)', () => {
  const config = loadFixture('sample-project-f427.json')
  const files = generateProject(config, getDeviceData(config.device))

  it('使用 gd32f4xx.h，生成 NVIC 分组与双优先级参数', () => {
    const h = file(files, 'gpio.h')
    expect(h).toContain('#include "gd32f4xx.h"')
    const c = file(files, 'gpio.c')
    expect(c).toContain('nvic_priority_group_set(NVIC_PRIGROUP_PRE2_SUB2);')
    expect(c).toContain('nvic_irq_enable(EXTI10_15_IRQn, 0, 0);')
    expect(c).toContain('gpio_output_options_set(GPIOA, GPIO_OTYPE_PP, GPIO_OSPEED_50MHZ, GPIO_PIN_5);')
    expect(c).toContain('exti_init(EXTI_13, EXTI_INTERRUPT, EXTI_TRIG_FALLING);')
  })

  it('app_it.c 生成 EXTI10_15_IRQHandler', () => {
    const it = file(files, 'app_it.c')
    expect(it).toContain('void EXTI10_15_IRQHandler(void)')
    expect(it).toContain('exti_interrupt_flag_get(EXTI_13)')
  })

  it('生成内容与快照一致', () => {
    expect(file(files, 'gpio.h')).toMatchSnapshot()
    expect(file(files, 'gpio.c')).toMatchSnapshot()
  })
})
