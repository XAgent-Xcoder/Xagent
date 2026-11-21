# Xagent

在 DeepSeek Harness 中管理 Agent 会话，并通过手机或平板连接工作电脑，继续同一条对话。

[English](README.en.md) · [日本語](README.ja.md)

## 功能

- 在 DSH 当前工作区内创建和继续 Claude Code、Codex 会话，与原有 DSH 对话并列展示。
- 按工作区组织会话，通过 Agent 标识区分对话，支持标题、重命名与归档。
- 读取电脑端 Agent 提供的模型列表，按实际能力选择模型和推理强度。
- 展示流式回复与工具调用，支持执行期间消息排队和 Agent 提问回答。
- 使用 Xcodex 账号登录、管理设备，通过加密连接远程访问电脑。

Agent 在电脑上执行任务，沿用本机配置。移动端需使用兼容的客户端；各端功能与验证范围见项目文档。

## 安装

当前测试版本：`0.7.1-xagent.1`。插件包名为 `xagent`，尚未发布到 npm。

下载该版本的 `.tgz` 插件包，在 DSH 插件管理中安装，或使用桌面版命令：

```sh
dsh plugin --profile desktop add -w /path/to/xagent-0.7.1-xagent.1.tgz
```

使用 Web profile 时将 `desktop` 替换为 `web`。安装完成后重启 DSH。

打开插件页面，选择「使用 Xcodex 账号登录」。默认服务为 [agent.xcodex.vip](https://agent.xcodex.vip)，支持邮箱密码和 Google 登录。手机使用同一账号发现电脑；在 DSH 当前工作区通过「Agent 会话」入口选择 Claude Code 或 Codex。

电脑需先安装并配置对应 Agent。不要同时启用旧的 `xcodex-remote` 或 `@xcoder/xagent` 包和当前插件。

## 文档

- [会话能力与配置](docs/design/baseline-chat-restoration.md)
- [当前版本修复记录](docs/design/model-discovery-native-create-fix.md)
- [开发流程](docs/development-workflow.md)
- [待完成事项](docs/TODO.md)
- [文档目录](docs/README.md)

## 参考与许可

本项目参考了 [ds-harness-remote](https://github.com/liguobao/ds-harness-remote) 的设计与实现。

项目采用 [MIT 许可证](LICENSE)。Agent 管理部分使用的 Orca 代码及来源说明见 [第三方许可证](packages/plugin/ORCA-LICENSE) 和 [实现记录](packages/plugin/src/managed-agents/EXTRACTION.md)。保留相关版权及许可声明。
