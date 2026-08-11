# MCUCubeMX — GD32 引脚配置与代码生成工具

一个纯本地 Web 应用：数据驱动渲染 LQFP 封装图，点击引脚配置 GPIO/EXTI，实时冲突检查，
一键生成并下载可编译的 `gpio.h` / `gpio.c` / EXTI 中断文件；并可与**嘉立创 EDA Pro 专业版**
实时双向同步引脚配置。

当前支持的器件：

- **GD32L233RCT6**：LQFP64、256KB Flash、32KB SRAM、Cortex-M23 @64MHz（GD32L23x 标准外设库）
- **GD32F427VE**：LQFP100、512KB Flash、256KB SRAM、Cortex-M4 @200MHz（GD32F4xx 标准外设库）

## 效果图

![MCUCubeMX 效果图](docs/images/app-screenshot.png)

## 功能特性

### 封装图

- 数据驱动程序化生成，按状态着色（未配置/输出/输入/EXTI/冲突/电源/特殊）
- GPIO 名显示在芯片内部，配置标签显示在引脚外侧（不截断），上下侧标签交错防重叠，四角引脚向内让位
- **45° 步进旋转**（旋转时文字保持水平可读），自动适配旋转后的实际占用空间
- **悬停显示引脚详情**：类型/别名/当前配置（模式、输出参数、上下拉、EXTI），以及可配置 AF 列表（后续实现）
- Pin 1 方向标记圆点；支持**导出 SVG / PNG**
- 点击引脚选中并联动右侧配置面板

### 引脚配置与冲突检查

- 输出：推挽/开漏、速度档位、初始电平；输入：上下拉、EXTI 边沿（上升/下降/双边沿）
- 标签命名 + 分组宏定义；配置工程文件（JSON）导入/导出
- 冲突检查：特殊引脚保护（NRST/BOOT/SWD 需显式解锁）、EXTI 线冲突、电源引脚拦截、重复标签

### 代码生成

- EJS 模板生成 `gpio.h`（分组宏定义）、`gpio.c`（`MX_GPIO_Init` / `MX_EXTI_Init`）、
  `app_it.c`（EXTI 中断骨架，带 USER CODE 区段）、`project.json`、`README.md`，打包 ZIP 下载
- 按器件的固件档案自动适配（头文件、速度档位、NVIC 优先级分组、EXTI 边沿枚举）
- 本地 `arm-none-eabi-gcc` + 官方固件库编译验证生成代码

### 嘉立创 EDA Pro 对接

- 顶栏按钮：**同步到 EDA**、**从 EDA 同步**、**嘉立创**（完整面板）
- 官方 WebSocket 桥（`run-api-gateway` 扩展 + `bridge-server.mjs`），`npm run dev` 自动拉起
- 读取：当前工程/板/原理图子页、MCU 器件识别（鼠标选中优先）、引脚→网络映射（端口/线段识别）
- 导入：对比变更（新增/修改/不变/移除）后写入工程配置
- 同步：**四种模式**——线段模式（改网络名）/ 端口模式（新增/更新端口）/ 转化为网络端口（删线段放端口）/ 转化为线段（删端口放线段）
- 同步时把引脚配置属性（`PAx_MODE/LABEL/PULL/EXTI/OTYPE/SPEED/LEVEL`）写入 MCU 元件本身
- 记住所选 MCU，打开面板自动恢复，**一键同步**（可勾选“同步免确认”）
- 失败时控制台输出详细日志（`[JLC]` 前缀）

详细对接说明见 [scripts/jlc/README.md](scripts/jlc/README.md)。

## 快速开始

```bash
npm install
npm run dev        # http://localhost:5173
```

**嘉立创对接（可选）**：在嘉立创 EDA Pro 安装 `run-api-gateway` 扩展并勾选“允许外部交互”；
开发模式下 `npm run dev` 会自动启动本地桥，也可以在面板顶部一键复制 `npm run dev:all` 命令。

## 开发命令

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 启动开发服务器（自动拉起嘉立创本地桥） |
| `npm run dev:all` | 同时启动 Vite + 嘉立创桥 |
| `npm run jlc:bridge` | 仅启动嘉立创本地桥 |
| `npm run build` | 类型检查（vue-tsc）+ 生产构建 |
| `npm run test` | 单元/快照/集成测试（Vitest，桥在线时自动跑 EDA 集成用例） |
| `npm run lint` | ESLint |
| `npm run validate:device` | 校验器件数据（引脚完整性、AF 表、EXTI 分组） |
| `npm run verify:build` | 用 arm-none-eabi-gcc + GD32 固件库编译验证生成代码 |

## 编译验证

`npm run verify:build` 会调用浏览器端同一套生成逻辑，把样例配置生成到临时目录，再与
对应器件的固件库（CMSIS + 标准外设库）一起用 arm-none-eabi-gcc 完整编译链接。

固件库路径通过环境变量指定（不纳入本仓库，遵守其软件许可）：

```powershell
$env:GD32L23X_FIRMWARE_DIR = "D:\...\GD32L23x_Firmware_Library_V2.4.0\Firmware"
npm run verify:build
```

GD32F427VE 的验证：`$env:GD32F4XX_FIRMWARE_DIR = "D:\...\gd32f4xx"` 后执行
`node scripts/verify-build.mjs --project tests/fixtures/sample-project-f427.json`。
F4xx 编译验证使用仓库自带的 CMSIS 5 内核头（`scripts/firmware/cmsis`，Apache-2.0）
与最小 startup（`scripts/firmware/startup_gd32f427.S`）。

## 器件数据来源

`data/devices/gd32l233rct6/` 下的 JSON 均转录自 **GD32L233xx Datasheet Rev1.9**，每条数据带溯源：

- `package.json`：Table 2-3（GD32L233Rx LQFP64 引脚定义），含 64 引脚、类型、封装边、
  特殊引脚标志、alternate/additional 功能列表
- `af.json`：Table 2-9 ~ 2-13（Port A/B/C/D/F 复用功能表，AF0~AF9），已用官方例程中的
  `gpio_af_set` 调用交叉核对 AF 编号
- `exti.json`：EXTI 线 = 引脚号，中断分组（EXTI0~4 / EXTI5_9 / EXTI10_15）与
  startup_gd32l233.S 向量表一致

`scripts/validate-device-data.mjs` 强制执行一致性校验：引脚唯一连续、每边引脚数、
AF 表与引脚定义集合一致、EXTI 分组正确。

## 架构

```
src/
  data/device.ts          器件数据加载与查询（多器件注册表）
  lib/packageSvg.ts       封装图几何、配色与旋转/导出辅助
  lib/conflicts/          冲突检查规则
  lib/codegen/            EJS 模板 + 生成器 + ZIP 导出
  lib/jlc/                嘉立创桥客户端、引脚归一化、导入/导出计划、偏好存储
  stores/project.ts       Pinia 状态（配置、解锁、持久化）
  components/             封装图 / 引脚表 / 配置面板 / 冲突面板 / 生成预览 / 嘉立创对接面板
data/devices/gd32l233rct6/  器件数据（package / af / exti）
scripts/                  validate-device-data / verify-build / build-generated / jlc 桥
tests/                    数据、冲突、代码生成、封装图、JLC 导入/偏好、EDA 集成测试
```

代码生成使用 EJS（`<% %>` 定界符），浏览器端以 `client: true` 编译，不依赖 node 内置模块
（`vite.config.ts` 将 ejs 惰性引用的 fs/path 替换为空 stub，`tests/browserEjs.test.ts` 验证）。

## 路线图

- **Phase 1（当前）**：引脚配置 + GPIO/EXTI 代码生成 + 编译验证 + 嘉立创 EDA Pro 双向同步
- **Phase 2**：时钟树配置（合法性计算 + 生成 `system_gd32l23x.c` 覆盖段）
- **Phase 3**：外设生成（UART/SPI/I2C/ADC/TIMER 的 AF 自动分配与实例冲突检查）
- **Phase 4**：工程级导出（Keil/GCC/Embedded Builder、链接脚本、`main.c` 骨架、多型号支持）
