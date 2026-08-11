# MCUCubeMX — GD32 引脚配置与代码生成工具

一个纯本地 Web 应用：数据驱动渲染 LQFP64 封装图，点击引脚配置 GPIO/EXTI，实时冲突检查，
一键生成并下载可编译的 `gpio.h` / `gpio.c` / EXTI 中断文件，支持配置导入导出。

当前目标器件：**GD32L233RCT6**（LQFP64、256KB Flash、32KB SRAM、Cortex-M23 @64MHz）。

## 功能

- 程序化生成的 LQFP64 封装图（悬停高亮、点击选中、按状态着色：未配置/输出/输入/EXTI/冲突/电源/特殊）
- 引脚配置面板：输出（推挽/开漏、2/10/50MHz、初始电平）、输入（上下拉、EXTI 边沿）、标签分组
- 冲突检查：特殊引脚保护（NRST/BOOT/SWD 需显式解锁）、EXTI 线冲突、电源引脚拦截、重复标签
- 代码生成（EJS 模板）：`gpio.h`（分组宏定义）、`gpio.c`（`MX_GPIO_Init` / `MX_EXTI_Init`）、
  `app_it.c`（EXTI 中断骨架，带 USER CODE 区段）、`project.json`、`README.md`
- 配置工程文件（JSON）导入/导出；生成结果打包 ZIP 下载

## 快速开始

```bash
npm install
npm run dev        # http://localhost:5173
```

## 开发命令

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 启动开发服务器 |
| `npm run build` | 类型检查（vue-tsc）+ 生产构建 |
| `npm run test` | 运行单元/快照测试（Vitest） |
| `npm run lint` | ESLint |
| `npm run validate:device` | 校验器件数据（64 引脚、AF 表、EXTI 分组） |
| `npm run verify:build` | 用 arm-none-eabi-gcc + GD32L23x 固件库编译验证生成代码 |

## 编译验证

`npm run verify:build` 会调用浏览器端同一套生成逻辑，把样例配置生成到临时目录，再与
GD32L23x 固件库（CMSIS + 标准外设库）一起用 arm-none-eabi-gcc 完整编译链接。

固件库路径通过环境变量指定（不纳入本仓库，遵守其软件许可）：

```powershell
$env:GD32L23X_FIRMWARE_DIR = "D:\...\GD32L23x_Firmware_Library_V2.4.0\Firmware"
npm run verify:build
```

默认路径为 `D:\Project\GD32_Project\TX_RTOS\GD32L23x_Firmware_Library_V2.4.0\Firmware`。

## 器件数据来源

`data/devices/gd32l233rct6/` 下的 JSON 均转录自 **GD32L233xx Datasheet Rev1.9**，每条数据带溯源：

- `package.json`：Table 2-3（GD32L233Rx LQFP64 引脚定义），含 64 引脚、类型、封装边、
  特殊引脚标志、alternate/additional 功能列表
- `af.json`：Table 2-9 ~ 2-13（Port A/B/C/D/F 复用功能表，AF0~AF9），已用官方例程中的
  `gpio_af_set` 调用交叉核对 AF 编号
- `exti.json`：EXTI 线 = 引脚号，中断分组（EXTI0~4 / EXTI5_9 / EXTI10_15）与
  startup_gd32l233.S 向量表一致

`scripts/validate-device-data.mjs` 强制执行一致性校验：64 脚唯一连续、每边 16 脚、
AF 表与引脚定义集合一致、EXTI 分组正确。

## 架构

```
src/
  data/device.ts          器件数据加载与查询
  lib/packageSvg.ts       封装图几何与配色（数据驱动，不手画 SVG）
  lib/conflicts/          冲突检查规则
  lib/codegen/            EJS 模板 + 生成器 + ZIP 导出
  stores/project.ts       Pinia 状态（配置、解锁、持久化）
  components/             封装图 / 引脚表 / 配置面板 / 冲突面板 / 生成预览
data/devices/gd32l233rct6/  器件数据（package / af / exti）
scripts/                  validate-device-data / verify-build / build-generated
tests/                    数据、冲突、代码生成、浏览器 EJS 模拟测试
```

代码生成使用 EJS（`<% %>` 定界符），浏览器端以 `client: true` 编译，不依赖 node 内置模块
（`vite.config.ts` 将 ejs 惰性引用的 fs/path 替换为空 stub，`tests/browserEjs.test.ts` 验证）。

## 路线图

- **Phase 1（当前）**：引脚配置 + GPIO/EXTI 代码生成 + 编译验证
- **Phase 2**：时钟树配置（合法性计算 + 生成 `system_gd32l23x.c` 覆盖段）
- **Phase 3**：外设生成（UART/SPI/I2C/ADC/TIMER 的 AF 自动分配与实例冲突检查）
- **Phase 4**：工程级导出（Keil/GCC/Embedded Builder、链接脚本、`main.c` 骨架、多型号支持）
