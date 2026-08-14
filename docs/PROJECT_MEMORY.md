# MCUCubeMX 项目记忆

> 供 Codex 代理与其他工具使用：修改代码前先读本文件。最后更新：2026-08-14。

## 1. 项目概述

- 定位：纯本地 Web 应用，数据驱动渲染 GD32 MCU 封装图，点击配置引脚/外设/时钟树，一键生成可编译的 C 代码，并与嘉立创 EDA Pro 双向同步。
- 技术栈：Vite + Vue3 + TypeScript + Pinia + Element Plus + 原生 SVG；EJS（浏览器端 `client:true` 编译）做代码模板；JSZip 打包。
- 器件：GD32L233RCT6（LQFP64、Cortex-M23）、GD32F427VE（LQFP100、Cortex-M4）。固件库不纳入仓库，验证时用本机路径。
- 无后端、无路由；顶栏「GPIO / 时钟」切换整个工作区。

## 2. 目录与架构

- `src/data/device.ts`：多器件注册表 `devices`，加载 `package/af/exti/clock/peripherals/interrupts` JSON，提供 `lookup`（引脚/AF/EXTI 查询）与 `getClockSpec/getDeviceData`。
- `src/lib/`：
  - `packageSvg.ts`：封装图几何、旋转、导出辅助。
  - `clock/`：`index.ts`（computeClock 频率链、validateClock 校验、solvePll 自动解算、defaultClock/mergeClockConfig）、`tree.ts`（SVG 树布局，节点/贝塞尔边/外设 chips）。
  - `codegen/`：`index.ts`（prepare → generateProject(config, deviceData, selection)）、`templates.ts`（EJS 常量模板）。
  - `peripherals/index.ts`：外设实例推导（USART/ADC）与默认参数。
  - `allocation.ts`：ADC 通道→引脚、EXTI 线→引脚枚举（供分配面板）。
  - `pinOverwrite.ts`：占用确认覆盖 + 撤回（`usePinOverwrite`）。
  - `conflicts/`、`usage.ts`、`groups.ts`、`jlc/`（桥/导入导出/偏好）。
- `src/stores/project.ts`：Pinia。状态含 `deviceId/projectName/prefix/assignments/groups/selectedPin/clockFocus/peripherals/unlocked/clock`；`config` getter 组装 `ProjectConfig`；动作含 `assign/clearPin/setPinAssignment/setClock/setClockFocus/setRtcSource/setUsbSource/setPeripheral/loadConfig/switchDevice` 等。
- `src/components/`：`PackageView`（封装图）、`ClockTreeView`（时钟树 SVG）、`ClockEditorPanel`（时钟配置）、`PinTable/PinConfigPanel/GroupsPanel/PeripheralUsagePanel/PeripheralConfigPanel/ExtiAllocationPanel/AdcChannelPanel/ConflictsPanel`、`CollapsiblePanel`（可折叠卡片）、`ViewToolbar`（共享缩放/旋转/导出）、`CodegenDialog`（子项选择）、`JlcBridgePanel`。
- `data/devices/<id>/`：`package.json`（引脚定义）、`af.json`、`exti.json`、`clock.json`、`peripherals.json`、`interrupts.json`。
- `scripts/`：`validate-device-data.mjs`、`verify-build.mjs`、`build-generated.mts`、`gen-interrupts.mjs`、`jlc/bridge-server.mjs`、`firmware/`（F427 最小 startup 与 libopt）。

## 3. 器件数据 schema 要点

- `package.json`：`pinsPerSide`、`pins[]`（number/name/type: IO|POWER|NC/side/level/aliases/special: nrst|boot|swd|osc/alternate/additional）、`firmware` 档案（header/rcuPrefix/speeds/extiEdgePrefix/nvic/define/core）。
- `af.json`：`entries[]` `{pin, af 0..15, signal}`；signal 格式 `PERIPH_SIGNAL`，与 package.alternate 集合一致。
- `exti.json`：`entries[]` `{pin, line=引脚号, irq}`；分组 EXTI0~4 / EXTI5_9 / EXTI10_15。
- `clock.json`：`sources`（freqMhz 或 hxtal{min,max,default} 或 pll 标记）、`pll`（params/mul 或 psc/n/p/q、sourceOptions、vco/in/out 限制）、`ahb/apb1/apb2`（options/maxMhz/default）、`adc`（options[APB2/AHB/IRC16M]）、`codegen`（sysclkSource/oscEnum/pllSrc/pllApi/prescaler 宏模板、nvicPriorityGroupMacro、highDriveMhz）、`peripherals`（各总线外设清单）、`clockSelect`（外设→可选时钟源）、`timerDomains`（APB1/APB2 TIMER 域，分频>1 时 ×2）、`lowPower`（LXTAL/IRC32K/RTC 源/FWDGT）、`usb48`（IRC48M/PLL 源与 API）。
- `peripherals.json`：`usart[]`（afPrefix/periphMacro/clockEnable/可选 clockSourceApi+clockSourceIdx+clockSources）、`adc[]`（periphArg: F4xx 为 ADC0/1/2、L23x 为 null；channelFunction 差异：L23x `adc_routine_channel_config` vs F4xx `adc_regular_channel_config`）、`adcInternal[]`（内部通道 TEMP/VREF/VBAT/VSLCD，仅显示）。
- `interrupts.json`：`irqs[]` `{name, number, comment}`，由 `node scripts/gen-interrupts.mjs` 从 CMSIS IRQn 枚举生成（自动处理 #ifdef 分支）。

## 4. 配置模型（ProjectConfig）

- `version:1`、`device`、`pins[]`（pin/mode: INPUT|OUTPUT|AF|ANALOG/function?/label?/params{outputType,speed,level,pull,exti}）、`groups[]`（单归属）、`naming.prefix`、`clock`（source/hxtalMhz/pllSource/pll/ahb/apb1/apb2/adc/可选 rtcSource/usbSource）、`peripherals`（实例 id → {enabled, params}）。
- 旧配置缺省字段全部兼容：clock 缺省用器件默认、rtcSource/usbSource 缺省不生成代码、peripherals 缺省按默认参数。

## 5. 时钟树

- 链路：源（IRC16M/HXTAL/IRC48M/LXTAL/IRC32K）→ PLL → SYSCLK → AHB → APB1/APB2 → ADC；TIMER 域 ×1/×2；辅助列 RTC/FWDGT/USB48/SysTick。
- `computeClock` 输出 pllIn/pllOut/vco/sysclk/ahb/apb1/apb2/adc/apb1TimerMhz/apb2TimerMhz/systickMhz/rtcMhz/ck48mMhz。
- `validateClock` 校验：HXTAL 范围、PLL 参数/输入/VCO/输出、总线分频与上限、ADC、RTC 源、USB 48MHz（PLL 源须≈48MHz）。
- `solvePll(spec, targetMhz, sourceId?)`：L23x 整数倍频；F4xx 遍历 psc×n÷p（优先输入≈1MHz 组合），返回候选列表。
- 生成 `clock.c`：`MX_Clock_Init`（振荡器、PLL、分频、SYSCLK 源、RTC/USB 源、F427 高压驱动与 NVIC 分组）；旧配置无 rtc/usb 字段不输出。

## 6. 外设（USART/ADC）

- 由 AF/ANALOG 引脚自动归并实例（`derivePeripheralState`）；`PeripheralConfigPanel` 配置参数。
- 生成 `usart.h/c`（`MX_USARTx_Init`：波特率/字长/停止位/校验/流控/时钟源/收发使能）、`adc.h/c`（`MX_ADCx_Init`：分辨率/对齐/通道/采样/触发/校准；L23x 无 periph 参数、F4xx 带 `ADC0`）。
- 已知：L23x LPUART 是独立固件库模块（`lpuart_*`），当前未纳入 USART 生成；F427 无 USART 时钟源选择。

## 7. 代码生成

- `generateProject(config, deviceData, selection?)`；`CodegenSelection`：pinDefs(gpio.h)/pinInit(gpio.c+app_it.c)/clockDefs(clock.h)/clockInit(clock.c)/periphInit(usart,adc)；project.json+README 始终生成。`exportZip` 同参。
- EJS 模板注意：`if/forEach` 结束标签用 `-%>` 修剪空行，否则快照多空行；快照更新 `npx vitest run tests/codegen.test.ts -u`。
- README 模板按选择动态生成文件说明与集成步骤（withClock/hasUsart/hasAdc/hasExti 标志）。

## 8. ADC/中断分配面板

- `allocation.ts`：`adcChannels`（外部通道→引脚，additional 中 INn）、`adcFunctionOf`（取原始写法 ADC_INx/ADC012_INx）、`extiLines`（IO 引脚编号≤15）、`extiIrqOf`。
- `AdcChannelPanel`：全通道 + 下拉分配；已使用绿色/未使用灰色；选中已占用引脚弹窗确认覆盖（`usePinOverwrite`），覆盖/迁移/清除可撤回；下方内部通道仅显示。
- `ExtiAllocationPanel`：16 条 EXTI 线下拉分配 + 触发边沿选择 + 覆盖确认/撤回；下方全部 NVIC 内部中断仅显示（来自 interrupts.json）。
- 内部通道/中断均为展示，不参与生成。

## 9. 嘉立创 EDA 对接

- 桥：`scripts/jlc/bridge-server.mjs`（端口 49620，WS `/eda` `/agent`，HTTP `/health` `/execute`）；EDA 需安装 run-api-gateway 扩展。
- `npm run dev` 由 vite 插件自动拉起；插件 spawn 必须 `detached:true + unref`，否则 vite-node 脚本（verify-build）会挂起。
- 面板功能：同步/导入、线段/端口模式、属性写入 MCU 元件、记住 MCU、免确认等；详细见 `scripts/jlc/README.md`。

## 10. 开发命令与验证

- `npm run dev` / `npm run build`（vue-tsc + vite）/ `npm run test`（Vitest，当前 175+ 项）/ `npm run lint` / `npm run validate:device` / `npm run verify:build`。
- verify-build：浏览器同一套生成逻辑（vite-node）→ 临时目录 + 本机 arm-none-eabi-gcc + 固件库链接。固件路径环境变量：
  - `GD32L23X_FIRMWARE_DIR` → `D:\Project\GD32_Project\TX_RTOS\GD32L23x_Firmware_Library_V2.4.0\Firmware`
  - `GD32F4XX_FIRMWARE_DIR` → `%TEMP%\hal_gigadevice\gd32f4xx`
- 数据校验：引脚唯一连续/每边数量、AF 集合一致、EXTI 分组、clock 档位/宏映射、peripherals 结构、interrupts 唯一。

## 11. 已知坑与决策

- git 全局代理 `http://127.0.0.1:7897` 常失效：推送失败用 `git -c http.proxy= -c https.proxy= push origin main` 直连。
- vite-node（verify-build）必须桥插件 detached+unref（见 §9），否则进程不退出。
- EJS 空段需 `-%>`；Element Plus 布尔 prop 缺省为 false，需 `withDefaults`（见 CollapsiblePanel）。
- 覆盖引脚配置类操作一律走 `usePinOverwrite`（确认 + 撤回），不要直接覆盖。
- 沙箱只读/网络受限时无法跑浏览器自动化与推送，属环境问题。

## 12. 状态与路线图

- Phase 1（完成）：引脚配置 + GPIO/EXTI 生成 + 编译验证 + 嘉立创双向同步。
- Phase 2（完成）：图形化时钟树（频率链/校验/clock.c）+ 完整时钟域 + PLL 自动解算。
- Phase 3（进行中）：已完成 AF/模拟、外设使用侧边栏、引脚分组、USART/ADC 外设配置与生成、中断线/ADC 通道分配面板；待办：SPI/I2C/TIMER 扩展、外设中断/DMA 支持、LPUART 纳入。
- Phase 4（未开始）：工程级导出（Keil/GCC/CMake、链接脚本、main 骨架、多型号）。
- 风格约定：中文界面与提交信息；小步快跑（每 1~2 周可验证子版本）。
