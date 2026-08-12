// EJS 模板（以 TS 字符串常量内嵌，浏览器与 Node 校验脚本共用同一份代码）
// 注意：模板使用 EJS 的 <% %> 定界符，与 Vue 模板语法无冲突。

export const GPIO_H_TEMPLATE = `/* USER CODE BEGIN Header */
/**
  ******************************************************************************
  * @file    gpio.h
  * @brief   GPIO 引脚定义 - 由 MCUCubeMX 自动生成
  * @target  <%= device %>
  * @note    重新生成时本文件会被覆盖，请把手写代码放在 USER CODE 区段内
  ******************************************************************************
  */
/* USER CODE END Header */

#ifndef __GPIO_H
#define __GPIO_H

#include "<%= includeHeader %>"

<% groups.forEach(function(g){ %>
/* ==================== <%= g.name %> ==================== */
<% g.pins.forEach(function(p){ %>
#define <%= p.label %>_Pin         <%= p.macroPin %>
#define <%= p.label %>_GPIO_Port   <%= p.macroPort %>
<% }); %>
<% }); %>

/* 初始化函数声明 */
void <%= prefix %>GPIO_Init(void);
<% if (hasExti) { %>
void <%= prefix %>EXTI_Init(void);
<% } %>

#endif /* __GPIO_H */
`

export const GPIO_C_TEMPLATE = `/**
  ******************************************************************************
  * @file    gpio.c
  * @brief   GPIO 初始化 - 由 MCUCubeMX 自动生成
  * @target  <%= device %>
  ******************************************************************************
  */

#include "gpio.h"

/**
  * @brief  初始化 GPIO 引脚
  */
void <%= prefix %>GPIO_Init(void)
{
    /* 使能 GPIO 时钟 */
<% ports.forEach(function(port){ %>
    rcu_periph_clock_enable(RCU_GPIO<%= port %>);
<% }); %>

    /* ============ 输出引脚 ============ */
<% outputPins.forEach(function(p){ %>
    /* <%= p.label %> (<%= p.pinName %>) */
    gpio_mode_set(GPIO<%= p.port %>, GPIO_MODE_OUTPUT, GPIO_PUPD_<%= p.pull %>, GPIO_PIN_<%= p.pin %>);
    gpio_output_options_set(GPIO<%= p.port %>, GPIO_OTYPE_<%= p.otype %>, GPIO_OSPEED_<%= p.speed %>MHZ, GPIO_PIN_<%= p.pin %>);
    gpio_<%= p.level === 'HIGH' ? 'bit_set' : 'bit_reset' %>(GPIO<%= p.port %>, GPIO_PIN_<%= p.pin %>);

<% }); %>
    /* ============ 输入引脚 ============ */
<% inputPins.forEach(function(p){ %>
    /* <%= p.label %> (<%= p.pinName %>) */
    gpio_mode_set(GPIO<%= p.port %>, GPIO_MODE_INPUT, GPIO_PUPD_<%= p.pull %>, GPIO_PIN_<%= p.pin %>);

<% }); %>
<% if (afPins.length) { -%>
    /* ============ 复用功能引脚 ============ */
<% afPins.forEach(function(p){ -%>
    /* <%= p.label %> (<%= p.pinName %> : <%= p.func %>) */
    gpio_mode_set(GPIO<%= p.port %>, GPIO_MODE_AF, GPIO_PUPD_NONE, GPIO_PIN_<%= p.pin %>);
    gpio_af_set(GPIO<%= p.port %>, GPIO_AF_<%= p.af %>, GPIO_PIN_<%= p.pin %>);

<% }); -%>
<% } -%>
<% if (analogPins.length) { -%>
    /* ============ 模拟引脚 ============ */
<% analogPins.forEach(function(p){ -%>
    /* <%= p.label %> (<%= p.pinName %> : <%= p.func %>) */
    gpio_mode_set(GPIO<%= p.port %>, GPIO_MODE_ANALOG, GPIO_PUPD_NONE, GPIO_PIN_<%= p.pin %>);

<% }); -%>
<% } -%>
}

<% if (hasExti) { %>
/**
  * @brief  初始化外部中断（EXTI）
<% if (nvicGroup) { %>
  * @note   NVIC 优先级分组为 <%= prigroupMacro %>，nvic_irq_enable 使用（抢占, 子）优先级
<% } else { %>
  * @note   Cortex-M23 优先级分组固定，nvic_irq_enable 仅需一个优先级参数
<% } %>
  */
void <%= prefix %>EXTI_Init(void)
{
<% if (nvicGroup) { %>
    nvic_priority_group_set(<%= prigroupMacro %>);
<% } %>
<% extiPins.forEach(function(p){ %>
    /* <%= p.label %> (<%= p.pinName %>) */
    exti_init(EXTI_<%= p.line %>, EXTI_INTERRUPT, <%= p.edge %>);

<% }); %>
<% irqs.forEach(function(irq){ %>
    nvic_irq_enable(<%= irq %>_IRQn, 0<%= nvicGroup ? ', 0' : '' %>);
<% }); %>
}
<% } %>
`

export const CLOCK_H_TEMPLATE = `/* USER CODE BEGIN Header */
/**
  ******************************************************************************
  * @file    clock.h
  * @brief   系统时钟配置声明 - 由 MCUCubeMX 自动生成
  * @target  <%= device %>
  * @note    重新生成时本文件会被覆盖，请把手写代码放在 USER CODE 区段内
  ******************************************************************************
  */
/* USER CODE END Header */

#ifndef __CLOCK_H
#define __CLOCK_H

#include "<%= includeHeader %>"

/* 时钟初始化函数声明 */
void <%= prefix %>Clock_Init(void);

#endif /* __CLOCK_H */
`

export const CLOCK_C_TEMPLATE = `/**
  ******************************************************************************
  * @file    clock.c
  * @brief   系统时钟配置 - 由 MCUCubeMX 自动生成
  * @target  <%= device %>
  * @note    时钟值由 MCUCubeMX 时钟树计算：SYSCLK=<%= sysclkMhz %>MHz
  *          AHB=<%= ahbMhz %>MHz / APB1=<%= apb1Mhz %>MHz / APB2=<%= apb2Mhz %>MHz / ADC=<%= adcMhz %>MHz
  *          重新生成时本文件会被覆盖，请把手写代码放在 USER CODE 区段内。
  *          若固件库 system_<%= systemBase %>.c 在 SystemInit 中已配置时钟，
  *          请在 main 启动后调用 <%= prefix %>Clock_Init() 覆盖为本次配置。
  ******************************************************************************
  */

#include "clock.h"
<% if (adcInclude) { -%>
#include "<%= adcInclude %>"
<% } -%>

/**
  * @brief  按 MCUCubeMX 时钟树配置系统时钟
  */
void <%= prefix %>Clock_Init(void)
{
<% if (highDrive) { -%>
    /* 高压驱动模式（SYSCLK 超过 <%= highDriveMhz %>MHz） */
    rcu_periph_clock_enable(RCU_PMU);
    pmu_ldo_output_select(PMU_LDOVS_HIGH);
    pmu_highdriver_mode_enable();
    pmu_highdriver_switch_select(PMU_HIGHDR_SWITCH_EN);

<% } -%>
    /* 使能并等待时钟源稳定 */
    rcu_osci_on(<%= oscOnMacro %>);
    rcu_osci_stab_wait(<%= oscOnMacro %>);

<% if (usePll) { -%>
    /* 配置 PLL：<%= pllComment %> */
    <%= pllCall %>;

    /* 使能 PLL 并等待稳定 */
    rcu_osci_on(<%= pllOscMacro %>);
    rcu_osci_stab_wait(<%= pllOscMacro %>);

<% } -%>
    /* AHB / APB1 / APB2 / ADC 分频 */
    rcu_ahb_clock_config(<%= ahbMacro %>);
    rcu_apb1_clock_config(<%= apb1Macro %>);
    rcu_apb2_clock_config(<%= apb2Macro %>);
<% if (adcApi) { -%>
    <%= adcApi %>(<%= adcArg %>);
<% } -%>

    /* 选择系统时钟源 */
    rcu_system_clock_source_config(<%= sysclkSourceMacro %>);
<% if (nvicPriorityGroupMacro) { -%>
    /* NVIC 优先级分组 */
    nvic_priority_group_set(<%= nvicPriorityGroupMacro %>);
<% } -%>

    /* USER CODE BEGIN ClockInit */
    /* USER CODE END ClockInit */
}
`

export const APP_IT_C_TEMPLATE = `/**
  ******************************************************************************
  * @file    app_it.c
  * @brief   EXTI 中断服务函数 - 由 MCUCubeMX 自动生成
  * @note    若工程的 gd32l23x_it.c 已定义同名 handler，请删除其中的 EXTI 部分
  *          再使用本文件，避免符号重复定义；或将本文件加入编译。
  ******************************************************************************
  */

#include "<%= includeHeader %>"
#include "gpio.h"

<% handlers.forEach(function(h){ %>
void <%= h.irq %>_IRQHandler(void)
{
<% h.lines.forEach(function(line){ %>
    if (RESET != exti_interrupt_flag_get(EXTI_<%= line %>)) {
        exti_interrupt_flag_clear(EXTI_<%= line %>);
        /* USER CODE BEGIN <%= h.irq %>_EXTI<%= line %> */
        /* USER CODE END <%= h.irq %>_EXTI<%= line %> */
    }
<% }); %>
}
<% }); %>
`

export const README_TEMPLATE = `# MCUCubeMX 生成结果

目标器件: <%= device %>
生成时间: <%= date %>

## 文件说明

- gpio.h: 引脚宏定义（按组别分组）与初始化函数声明
- gpio.c: GPIO 与 EXTI 初始化实现（MX_GPIO_Init / MX_EXTI_Init）
- clock.h / clock.c: 系统时钟树配置（MX_Clock_Init，SYSCLK/AHB/APB1/APB2/ADC）
- app_it.c: EXTI 中断服务函数骨架（仅在启用了外部中断时生成）
- project.json: 本次配置的工程文件，可重新导入 MCUCubeMX

## 集成步骤

1. 将 gpio.h / gpio.c 加入工程，并把 gpio.c 中的初始化函数在 main 中调用。
2. 将 clock.h / clock.c 加入工程，并在 main 启动后调用 MX_Clock_Init()
   覆盖固件库 system 文件中的默认时钟；若固件库 system 文件已在
   SystemInit 中配置了相同时钟，可跳过调用。
3. 若生成了 app_it.c：如工程已有 gd32l23x_it.c，请删除其中对应的 EXTI
   handler（EXTI0_IRQHandler、EXTI5_9_IRQHandler、EXTI10_15_IRQHandler 等），
   再将 app_it.c 加入编译；否则直接加入编译即可。
4. 在 app_it.c 的 USER CODE 区段内编写实际的中断处理逻辑。

## 引脚配置

<% config.pins.forEach(function(p){ %>
- <%= p.pin %>: <%= p.mode %><%= p.function ? ' [' + p.function + ']' : '' %><%= p.label ? '(' + p.label + ')' : '' %>
<% }); %>

## 时钟配置

<% if (config.clock) { -%>
- 时钟源: <%= config.clock.source %><%= config.clock.source === 'HXTAL' ? ' (' + config.clock.hxtalMhz + 'MHz)' : '' %>
<% if (config.clock.source === 'PLL') { -%>
- PLL 输入: <%= config.clock.pllSource %><% Object.keys(config.clock.pll).forEach(function(k){ %>，<%= k %>=<%= config.clock.pll[k] %><% }); %>
<% } -%>
- AHB / APB1 / APB2 分频: ÷<%= config.clock.ahb %> / ÷<%= config.clock.apb1 %> / ÷<%= config.clock.apb2 %>
- ADC 时钟: <%= config.clock.adc %>
<% } else { -%>
- 使用器件默认时钟（未在 MCUCubeMX 中单独配置）
<% } -%>
`
