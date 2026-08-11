# 嘉立创 EDA Pro 对接（MCUCubeMX ↔ EDA）

MCUCubeMX 通过官方 WebSocket 桥与嘉立创 EDA Pro 专业版实时通信：

```text
MCUCubeMX (浏览器) ──HTTP /execute──▶ bridge-server.mjs (:49620-49629)
                                      ──WS /eda──▶ run-api-gateway 扩展 ──▶ EDA Pro
```

## 一次性准备

1. 在嘉立创 EDA Pro 中安装官方扩展 **Run API Gateway**：
   <https://jlc-ext.com/item/oshwhub/run-api-gateway>
   安装后在扩展管理器里勾选 **允许外部交互** 与 **显示在顶部菜单**。
2. 启动本地桥（本目录的 `bridge-server.mjs` 是官方实现，MIT-0 许可）：

   ```powershell
   npm run jlc:bridge
   ```

   桥会自动占用 `49620-49629` 中的第一个空闲端口，并等待 EDA 扩展握手。
   开发时也可以用一条命令同时启动 Vite 和桥：

   ```powershell
   npm run dev:all
   ```

## 使用

1. 打开 EDA Pro，确保扩展已加载（顶部菜单出现 API Gateway）。
2. 打开 MCUCubeMX，点击顶栏 **嘉立创**。
3. **扫描连接** → 选择 EDA 窗口 → **读取当前工程** → **扫描原理图 MCU**。
4. 如果先在 EDA 原理图里用鼠标点选 MCU（如 U1），**扫描原理图 MCU** 会把它自动排到第一位并优先选中（列表中标有“EDA 已选中”）。
5. 选中 MCU（如 `GD32L233RCT6`）→ **读取引脚配置**。
6. 预览“引脚 → 网络”映射后点击 **导入到工程**：会先弹出**变更对比**对话框（新增/修改/不变/移除），确认后才写入。
7. 反向同步：点击 **同步到 EDA**，把工程里的标签作为网络名重命名原理图对应网络，同样先弹**变更对比**对话框确认。

导入规则：

- 只有能匹配到器件库规范引脚名、且已连线的普通 IO 引脚会被导入（网络名作为标签，默认输入模式）。
- 电源脚、NRST/BOOT/SWD 特殊脚、未连线与无法匹配的引脚会跳过，不纳入代码生成。
- 器件不在支持列表（当前为 GD32L233RCT6 / GD32F427VE）时只能预览，不能导入。
- 导出到 EDA 只做“网络重命名”（当前图页、全网络导线一起改），不建线/删线；未连线引脚、无标签引脚、网络重命名交叉的项会自动跳过。

## 说明

- 网络名由“引脚坐标 ↔ 导线端点”几何匹配得到，不依赖 BETA 的网络类接口，实测可靠。
- 面板打开时自动扫描桥；桥中途掉线会在“读取工程”时自动重连一次，并给出明确提示。
- 关闭桥：结束 `bridge-server.mjs` 进程即可；扩展会自动重连/重试。
- 集成测试：`tests/jlcBridge.integration.test.ts` 在本地桥在线时自动运行，离线自动跳过。
