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

#include "gd32l23x.h"

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
}

<% if (hasExti) { %>
/**
  * @brief  初始化外部中断（EXTI）
  * @note   Cortex-M23 优先级分组固定，nvic_irq_enable 仅需一个优先级参数
  */
void <%= prefix %>EXTI_Init(void)
{
<% extiPins.forEach(function(p){ %>
    /* <%= p.label %> (<%= p.pinName %>) */
    exti_init(EXTI_<%= p.line %>, EXTI_INTERRUPT, EXTI_TRIG_<%= p.edge %>);

<% }); %>
<% irqs.forEach(function(irq){ %>
    nvic_irq_enable(<%= irq %>_IRQn, 0);
<% }); %>
}
<% } %>
`

export const APP_IT_C_TEMPLATE = `/**
  ******************************************************************************
  * @file    app_it.c
  * @brief   EXTI 中断服务函数 - 由 MCUCubeMX 自动生成
  * @note    若工程的 gd32l23x_it.c 已定义同名 handler，请删除其中的 EXTI 部分
  *          再使用本文件，避免符号重复定义；或将本文件加入编译。
  ******************************************************************************
  */

#include "gd32l23x.h"
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
- app_it.c: EXTI 中断服务函数骨架（仅在启用了外部中断时生成）
- project.json: 本次配置的工程文件，可重新导入 MCUCubeMX

## 集成步骤

1. 将 gpio.h / gpio.c 加入工程，并把 gpio.c 中的初始化函数在 main 中调用。
2. 若生成了 app_it.c：如工程已有 gd32l23x_it.c，请删除其中对应的 EXTI
   handler（EXTI0_IRQHandler、EXTI5_9_IRQHandler、EXTI10_15_IRQHandler 等），
   再将 app_it.c 加入编译；否则直接加入编译即可。
3. 在 app_it.c 的 USER CODE 区段内编写实际的中断处理逻辑。

## 引脚配置

<% config.pins.forEach(function(p){ %>
- <%= p.pin %>: <%= p.mode %> <%= p.label ? '(' + p.label + ')' : '' %>
<% }); %>
`
