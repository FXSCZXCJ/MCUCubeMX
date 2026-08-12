import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { generateProject } from '../src/lib/codegen'
import { getDeviceData } from '../src/data/device'

const config = JSON.parse(
  readFileSync(path.join(__dirname, 'fixtures', 'sample-project-af.json'), 'utf8'),
)
const files = generateProject(config, getDeviceData(config.device))
const gpioC = files.find((f) => f.path === 'gpio.c')!.content

describe('代码生成 AF/模拟', () => {
  it('gpio.c 输出 gpio_af_set 与 ANALOG 段', () => {
    expect(gpioC).toContain('gpio_af_set(GPIOA, GPIO_AF_7, GPIO_PIN_2);')
    expect(gpioC).toContain('gpio_af_set(GPIOA, GPIO_AF_7, GPIO_PIN_3);')
    expect(gpioC).toContain('gpio_mode_set(GPIOA, GPIO_MODE_ANALOG, GPIO_PUPD_NONE, GPIO_PIN_0);')
  })

  it('project.json 往返包含 function 与 groups', () => {
    const roundtrip = JSON.parse(files.find((f) => f.path === 'project.json')!.content)
    expect(roundtrip.pins.find((p: { pin: string }) => p.pin === 'PA2').function).toBe(
      'USART1_TX',
    )
    expect(roundtrip.groups).toEqual([
      { name: 'UART', pins: ['PA2', 'PA3'], color: '#7c4dff' },
    ])
  })
})
