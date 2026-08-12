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

describe('时钟代码生成 GD32L233RCT6', () => {
  const config = loadFixture('sample-project.json')
  const files = generateProject(config, getDeviceData(config.device))

  it('总是生成 clock.h / clock.c', () => {
    expect(files.map((f) => f.path)).toContain('clock.h')
    expect(files.map((f) => f.path)).toContain('clock.c')
  })

  it('clock.h 声明 MX_Clock_Init', () => {
    const h = file(files, 'clock.h')
    expect(h).toContain('#include "gd32l23x.h"')
    expect(h).toContain('void MX_Clock_Init(void);')
  })

  it('clock.c 含 PLL 配置与分频宏（IRC16M ×4 = 64MHz）', () => {
    const c = file(files, 'clock.c')
    expect(c).toContain('rcu_osci_on(RCU_IRC16M);')
    expect(c).toContain('rcu_pll_config(RCU_PLLSRC_IRC16M, RCU_PLL_MUL4);')
    expect(c).toContain('rcu_ahb_clock_config(RCU_AHB_CKSYS_DIV1);')
    expect(c).toContain('rcu_apb1_clock_config(RCU_APB1_CKAHB_DIV2);')
    expect(c).toContain('rcu_apb2_clock_config(RCU_APB2_CKAHB_DIV1);')
    expect(c).toContain('rcu_adc_clock_config(RCU_ADCCK_APB2_DIV4);')
    expect(c).toContain('rcu_system_clock_source_config(RCU_CKSYSSRC_PLL);')
    expect(c).not.toContain('nvic_priority_group_set')
  })

  it('HXTAL 直连时不生成 PLL 配置', () => {
    const cfg: ProjectConfig = {
      ...config,
      clock: { ...config.clock!, source: 'HXTAL', hxtalMhz: 8 },
    }
    const c = file(generateProject(cfg, getDeviceData(cfg.device)), 'clock.c')
    expect(c).toContain('rcu_osci_on(RCU_HXTAL);')
    expect(c).not.toContain('rcu_pll_config')
    expect(c).toContain('rcu_system_clock_source_config(RCU_CKSYSSRC_HXTAL);')
  })
})

describe('时钟代码生成 GD32F427VE', () => {
  const config = loadFixture('sample-project-f427.json')
  const files = generateProject(config, getDeviceData(config.device))

  it('clock.c 含 ADC 头文件、PLL 四参数与 NVIC 分组', () => {
    const c = file(files, 'clock.c')
    expect(c).toContain('#include "gd32f4xx_adc.h"')
    expect(c).toContain('rcu_pll_config(RCU_PLLSRC_HXTAL, 25, 400, 2, 9);')
    expect(c).toContain('nvic_priority_group_set(NVIC_PRIGROUP_PRE2_SUB2);')
    expect(c).toContain('rcu_system_clock_source_config(RCU_CKSYSSRC_PLLP);')
    expect(c).toContain('adc_clock_config(ADC_ADCCK_PCLK2_DIV4);')
  })

  it('SYSCLK 200MHz 时输出高压驱动模式', () => {
    const c = file(files, 'clock.c')
    expect(c).toContain('pmu_ldo_output_select(PMU_LDOVS_HIGH);')
    expect(c).toContain('pmu_highdriver_mode_enable();')
    expect(c).toContain('pmu_highdriver_switch_select(PMU_HIGHDR_SWITCH_EN);')
  })

  it('SYSCLK 低于 168MHz 时不输出高压驱动模式', () => {
    const cfg: ProjectConfig = {
      ...config,
      clock: {
        ...config.clock!,
        pllSource: 'HXTAL',
        pll: { psc: 25, n: 320, p: 4, q: 9 },
      },
    }
    const c = file(generateProject(cfg, getDeviceData(cfg.device)), 'clock.c')
    expect(c).toContain('SYSCLK=80MHz')
    expect(c).not.toContain('pmu_highdriver_mode_enable')
  })
})

describe('project.json 往返', () => {
  it('保留 clock 配置', () => {
    for (const name of ['sample-project.json', 'sample-project-f427.json']) {
      const config = loadFixture(name)
      const files = generateProject(config, getDeviceData(config.device))
      const round = JSON.parse(file(files, 'project.json'))
      expect(round.clock).toEqual(config.clock)
      expect(round).toEqual(config)
    }
  })
})

describe('RTC / USB 48MHz 代码生成', () => {
  it('L233：clock.c 生成 RTC 与 USBD 时钟源配置', () => {
    const config = loadFixture('sample-project.json')
    const c = file(generateProject(config, getDeviceData(config.device)), 'clock.c')
    expect(c).toContain('rcu_rtc_clock_config(RCU_RTCSRC_LXTAL);')
    expect(c).toContain('rcu_usbd_clock_config(RCU_USBDSRC_IRC48M);')
  })

  it('F427：clock.c 生成 RTC 与 CK48M 配置（PLL48M 时含 rcu_pll48m_clock_config）', () => {
    const config: ProjectConfig = {
      ...loadFixture('sample-project-f427.json'),
      clock: {
        ...loadFixture('sample-project-f427.json').clock!,
        usbSource: 'PLL48M',
        pll: { psc: 25, n: 384, p: 2, q: 8 },
      },
    }
    const c = file(generateProject(config, getDeviceData(config.device)), 'clock.c')
    expect(c).toContain('rcu_rtc_clock_config(RCU_RTCSRC_LXTAL);')
    expect(c).toContain('rcu_pll48m_clock_config(RCU_PLL48MSRC_PLLQ);')
    expect(c).toContain('rcu_ck48m_clock_config(RCU_CK48MSRC_PLL48M);')
  })

  it('旧配置（无 rtcSource/usbSource）不生成 RTC/USB 代码', () => {
    const config: ProjectConfig = {
      ...loadFixture('sample-project.json'),
      clock: { ...loadFixture('sample-project.json').clock! },
    }
    delete (config.clock as unknown as Record<string, unknown>).rtcSource
    delete (config.clock as unknown as Record<string, unknown>).usbSource
    const c = file(generateProject(config, getDeviceData(config.device)), 'clock.c')
    expect(c).not.toContain('rcu_rtc_clock_config')
    expect(c).not.toContain('rcu_usbd_clock_config')
  })
})
