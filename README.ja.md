# Xagent

DeepSeek Harness のワークスペースで Claude Code・Codex のセッションを管理し、スマートフォンやタブレットから作業用 PC の会話を続けられます。

[中文](README.md) · [English](README.en.md)

## インストール

現在のテスト版は `0.7.1-xagent.1` です。パッケージ名は `xagent` で、npm には未公開です。対応する `.tgz` を DSH のプラグイン管理からインストールするか、次のコマンドを使用してください。

```sh
dsh plugin --profile desktop add -w /path/to/xagent-0.7.1-xagent.1.tgz
```

Web profile では `desktop` を `web` に変更してください。インストール後は DSH を再起動します。

プラグイン画面で Xcodex アカウントにログインします。既定のサーバーは [agent.xcodex.vip](https://agent.xcodex.vip) です。メールアドレスとパスワード、または Google ログインを利用できます。モバイル端末でも同じアカウントを使用します。

利用する Agent は PC にインストールして設定してください。旧 `@xcoder/xagent` パッケージとの同時有効化は避けてください。

機能・設定・検証範囲は [会話機能の記録](docs/design/baseline-chat-restoration.md)、今後の作業は [TODO](docs/TODO.md) を参照してください。

## 参考・ライセンス

本プロジェクトは [ds-harness-remote](https://github.com/liguobao/ds-harness-remote) の設計と実装を参考にしています。

[MIT ライセンス](LICENSE) を採用しています。Agent 管理に使用した Orca コードの [ライセンス](packages/plugin/ORCA-LICENSE) と [実装記録](packages/plugin/src/managed-agents/EXTRACTION.md) を含め、必要な著作権・ライセンス表記を保持しています。
