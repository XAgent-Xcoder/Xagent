# Xagent

Manage Agent sessions inside DeepSeek Harness and continue conversations from a phone or tablet connected to your work computer.

[中文](README.md) · [日本語](README.ja.md)

## Features

- Create Claude Code and Codex sessions in the current DSH workspace, alongside native DSH conversations.
- Organize conversations by workspace, identify the Agent, rename titles and archive sessions.
- Discover models from the computer's Agent and select supported reasoning settings.
- View streaming replies and tool activity, queue messages during execution and answer Agent questions.
- Sign in with an Xcodex account and manage devices over encrypted remote connections.

Agents run on the computer using its local configuration. Mobile access requires a compatible client; see the documentation for feature coverage and validation limits.

## Installation

Current test version: `0.7.1-xagent.1`. The package is currently named `xagent` and has not been published to npm.

Download the versioned `.tgz` package and install it through DSH plugin management, or run:

```sh
dsh plugin --profile desktop add -w /path/to/xagent-0.7.1-xagent.1.tgz
```

For a Web profile, replace `desktop` with `web`. Restart DSH after installation.

Open the plugin page and sign in with your Xcodex account using email/password or Google. The default server is [agent.xcodex.vip](https://agent.xcodex.vip). Use the same account on mobile to discover the computer. Create Claude Code or Codex sessions from the Agent session entry in the current workspace.

Install and configure the corresponding Agent on the computer first. Do not enable the old `@xcoder/xagent` package alongside this plugin.

## Documentation

- [Session features and configuration](docs/design/baseline-chat-restoration.md)
- [Current release fixes](docs/design/model-discovery-native-create-fix.md)
- [Development workflow](docs/development-workflow.md)
- [Pending work](docs/TODO.md)
- [Documentation index](docs/README.md)

## References and licenses

This project draws on the design and implementation of [ds-harness-remote](https://github.com/liguobao/ds-harness-remote).

Licensed under [MIT](LICENSE). Orca code used for Agent management retains its [third-party license](packages/plugin/ORCA-LICENSE); see the [implementation notes](packages/plugin/src/managed-agents/EXTRACTION.md) for provenance. Applicable copyright and license notices are retained.
