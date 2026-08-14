# AGENTS.md

本仓库：**MCUCubeMX** —— 纯本地 Web 的 GD32 单片机引脚配置与代码生成工具（Vue3 + TS + Vite，无后端）。

在修改代码前，**必须先阅读 [docs/PROJECT_MEMORY.md](docs/PROJECT_MEMORY.md)**，其中记录了：

- 技术栈、目录结构与架构地图
- 器件数据层（`data/devices/<id>/` 各 JSON 的 schema 与校验）
- 配置模型（`ProjectConfig` / Pinia store）与代码生成（`generateProject` + `CodegenSelection`）
- 时钟树、外设（USART/ADC）、中断/ADC 分配面板的数据流与交互约定
- 开发命令、测试/编译验证方法、已知坑与历史决策

关键约束：

- 语言：界面与提交信息使用中文。
- 纯前端，无后端；数据全部数据驱动（新增器件只需补 `data/devices/<id>/` 数据）。
- 生成的 C 代码面向 GD32 标准外设库（非 HAL）；`verify-build` 用本机 arm-none-eabi-gcc 编译验证。
- 修改后需保持 `npm run validate:device`、`npm run test`、`npm run build`、`npm run lint` 全绿。
- 提交遵循现有中文风格；本机 git 全局代理 `127.0.0.1:7897` 可能失效，推送失败时用
  `git -c http.proxy= -c https.proxy= push origin main` 直连重试。
