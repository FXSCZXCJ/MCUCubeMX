/* 最小 Cortex-M4 启动文件（MCUCubeMX 编译验证用）：
 * 包含复位向量与 EXTI 中断向量（弱定义），其余向量指向 Default_Handler。 */
    .syntax unified
    .cpu cortex-m4
    .fpu softvfp
    .thumb

.section .isr_vector, "a", %progbits
    .align 2
    .globl g_pfnVectors
g_pfnVectors:
    .word _estack
    .word Reset_Handler
    .word NMI_Handler
    .word HardFault_Handler
    .word MemManage_Handler
    .word BusFault_Handler
    .word UsageFault_Handler
    .word 0
    .word 0
    .word 0
    .word 0
    .word SVC_Handler
    .word DebugMon_Handler
    .word 0
    .word PendSV_Handler
    .word SysTick_Handler
    .rept 5
    .word Default_Handler
    .endr
    .word EXTI0_IRQHandler       /* 22 */
    .word EXTI1_IRQHandler       /* 23 */
    .word EXTI2_IRQHandler       /* 24 */
    .word EXTI3_IRQHandler       /* 25 */
    .word EXTI4_IRQHandler       /* 26 */
    .rept 12
    .word Default_Handler
    .endr
    .word EXTI5_9_IRQHandler     /* 39 */
    .rept 16
    .word Default_Handler
    .endr
    .word EXTI10_15_IRQHandler   /* 56 */
    .rept 24
    .word Default_Handler
    .endr

.section .text
    .align 2
    .globl Reset_Handler
    .type Reset_Handler, %function
Reset_Handler:
    ldr sp, =_estack
    bl SystemInit
    bl main
    b .
    .size Reset_Handler, .-Reset_Handler

    .align 1
    .thumb_func
    .weak NMI_Handler
    .type NMI_Handler, %function
NMI_Handler:
    b .
    .size NMI_Handler, .-NMI_Handler

    .macro weak_handler name
    .thumb_func
    .weak \name
    .type \name, %function
\name:
    b .
    .size \name, .-\name
    .endm

    weak_handler HardFault_Handler
    weak_handler MemManage_Handler
    weak_handler BusFault_Handler
    weak_handler UsageFault_Handler
    weak_handler SVC_Handler
    weak_handler DebugMon_Handler
    weak_handler PendSV_Handler
    weak_handler SysTick_Handler
    weak_handler Default_Handler
    weak_handler EXTI0_IRQHandler
    weak_handler EXTI1_IRQHandler
    weak_handler EXTI2_IRQHandler
    weak_handler EXTI3_IRQHandler
    weak_handler EXTI4_IRQHandler
    weak_handler EXTI5_9_IRQHandler
    weak_handler EXTI10_15_IRQHandler

    .end
