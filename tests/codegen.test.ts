import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { generateProject } from '../src/lib/codegen'
import type { ProjectConfig } from '../src/types'

const config = JSON.parse(
  readFileSync(path.join(__dirname, 'fixtures', 'sample-project.json'), 'utf8'),
) as ProjectConfig

function file(files: { path: string; content: string }[], name: string): string {
  const f = files.find((x) => x.path === name)
  if (!f) throw new Error(`缺少生成文件 ${name}`)
  return f.content
}

describe('代码生成 (sample-project)', () => {
  const files = generateProject(config)

  it('生成 gpio.h / gpio.c / app_it.c / project.json / README.md', () => {
    expect(files.map((f) => f.path).sort()).toEqual(
      ['README.md', 'app_it.c', 'gpio.c', 'gpio.h', 'project.json'].sort(),
    )
  })

  it('gpio.h 包含按组别的宏定义', () => {
    const h = file(files, 'gpio.h')
    expect(h).toContain('#define LED_R_Pin         GPIO_PIN_5')
    expect(h).toContain('#define LED_R_GPIO_Port   GPIOA')
    expect(h).toContain('#define KEY_USER_Pin         GPIO_PIN_13')
    expect(h).toContain('void MX_GPIO_Init(void);')
    expect(h).toContain('void MX_EXTI_Init(void);')
  })

  it('gpio.c 生成时钟、输出、输入与 EXTI 初始化', () => {
    const c = file(files, 'gpio.c')
    expect(c).toContain('rcu_periph_clock_enable(RCU_GPIOA);')
    expect(c).toContain('rcu_periph_clock_enable(RCU_GPIOC);')
    expect(c).toContain('gpio_mode_set(GPIOA, GPIO_MODE_OUTPUT, GPIO_PUPD_NONE, GPIO_PIN_5);')
    expect(c).toContain('gpio_output_options_set(GPIOA, GPIO_OTYPE_PP, GPIO_OSPEED_50MHZ, GPIO_PIN_5);')
    expect(c).toContain('gpio_bit_set(GPIOA, GPIO_PIN_5);')
    expect(c).toContain('gpio_mode_set(GPIOC, GPIO_MODE_INPUT, GPIO_PUPD_PULLDOWN, GPIO_PIN_13);')
    expect(c).toContain('exti_init(EXTI_13, EXTI_INTERRUPT, EXTI_TRIG_FALLING);')
    expect(c).toContain('nvic_irq_enable(EXTI10_15_IRQn, 0);')
  })

  it('app_it.c 生成 EXTI10_15_IRQHandler 且带 USER CODE 区段', () => {
    const it = file(files, 'app_it.c')
    expect(it).toContain('void EXTI10_15_IRQHandler(void)')
    expect(it).toContain('exti_interrupt_flag_get(EXTI_13)')
    expect(it).toContain('/* USER CODE BEGIN EXTI10_15_EXTI13 */')
  })

  it('project.json 可往返还原配置', () => {
    const roundTrip = JSON.parse(file(files, 'project.json')) as ProjectConfig
    expect(roundTrip).toEqual(config)
  })

  it('生成内容与快照一致', () => {
    expect(file(files, 'gpio.h')).toMatchSnapshot()
    expect(file(files, 'gpio.c')).toMatchSnapshot()
    expect(file(files, 'app_it.c')).toMatchSnapshot()
  })
})
