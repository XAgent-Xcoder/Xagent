# Linger 借鉴路线图

来源: https://github.com/simplexai-labs/linger （本地副本 `xagent-analysis/linger`）。
本文档记录从 Linger 借鉴的能力、验证结论（源码证据）与实施状态。
对标文档: `packages/plugin/src/managed-agents/EXTRACTION.md`（Orca 借鉴）。

## 已落地（本仓库）

### 1. 重连退避 + jitter + 快速重拨窗口 ✅
- 参考: `linger/apps/computer/local-daemon/internal/daemon/connection.go:599-612`
  （`defaultRetryDelay`: ceiling = 1s·2^attempt cap 5；jitter = ceiling/2 + rand(ceiling/2+1)），
  `:597 gatewayRestartRedialWindow = 2 * time.Minute`。
- 实现: `packages/plugin/src/server-connection.ts`
  - 新增字段 `connectAttempt`（hello 成功时清零）、`lastConnectedAt`。
  - `waitBeforeRetry()`: 指数退避 `min(1s·2^attempt, maxDelayMs)` + 半 ceiling jitter；
    2 分钟内刚连上过且 attempt ≤ 1 时走 ≤1s 快速重拨。
  - hello.ack 处（`this.online = true`）重置 `connectAttempt`、记录 `lastConnectedAt`。
- 注: 控制面心跳（25s/75s）xagent 原本就有（`protocol/src/index.ts:70`、
  `server-connection.ts:437`），未重复搬。

### 2. retained-event 重放 ✅
- 参考: `connection.go:616-640`（`replayRetainedEvents` + `activateStreamAndReplay`，
  `ledger.Replay(operationIDs)` 后逐帧 `stream.Send`）。
- xagent 语境差异: Linger daemon 有本地持久 ledger；xagent 的等价物是
  `session-history-cache.ts` 的 `RemoteSessionHistoryCache`
  （snapshot + cursor + 按 seq 续帧，`recordFollowSnapshot`/`recordFollowFrame`），
  以及 `iterateWithCachedSnapshot` 的 `backfillRange`（`session/page` 补缺失 seq，
  缺口 >200 则 resync）。这些**原本就存在**，缺口是「transport 中途断开时没接上」。
- 实现: `packages/plugin/src/remote-typert-gateway.ts`
  - `AsyncValueQueue.push`: 慢消费溢出时由「清空 + TRANSPORT_CLOSED」改为
    背压保留（丢最老一半、留最新状态帧，置 `overflowed`）。
  - `iterate()` catch: transport 断开（非业务错误）且为 `session/follow` 时，
    从 historyCache 快照 + cursor 走 `iterateWithCachedSnapshot` 续传，而非直接 throw。
  - `resumeDepth`（默认 0，恢复时 +1）贯穿 `openRaw`→`iterate`→`iterateWithCachedSnapshot`，
    限制恢复嵌套为 1 层，防止 host 持续不可达时无限递归。

## 已落地（本仓库，新增 5 个自包含模块）

### 3. Proactive「每晚学习」→ `src/proactive.ts` ✅
- 参考: `linger/apps/node-services/src/agent/agent-features/proactive/*`
  （决策是 prompt 工程，`judge.ts` 仅构造 prompt，真正判断在 LLM），
  `src/memory/proactive-dreaming.ts`（每晚把 clue consolidate 成 rule，`clueDays = 14`）。
- 实现: `Proactive` 类 — `buildJudgePrompt(context, rules)` 构造评估 prompt（LLM 判 `notify`/`reason`/`urgency`）；
  `parseJudgeVerdict` 容错解析 LLM JSON；`recordClue` 记录用户反馈（informed/noisy/ignored/acted）；
  `consolidateNight()` 把重复线索 consolidate 成 `ProactiveRule`（无 LLM 时确定性：≥2 次 noisy→suppress、≥2 次 informed→notify），
  规则经 `PersistentMemory` 持久化（kind=preference, source=proactive-rule）；`evaluate(context)` 决定是否 `push.send(...)`。
- 依赖: push 通道由调用方注入（`ProactivePush.send`），接 iOS VoIP 唤醒（Xagent-IOS `VoIPKeepAlive.swift`）是 transport 侧步骤。

### 4. Guardrail（动作前确认 / LLM 复核）→ `src/guardrail.ts` + `terminal-policy.ts` ✅
- 参考: `linger/apps/computer/local-daemon/internal/linger/localtools/`
  （`cua_service.go`、`agent_browser.go`、`context/resolver.go` 的 native confirmation/policy；per-provider：Pi 不复核、Antigravity 申请权限时复核）。
- 实现: `createGuardrail(rules, reviewer?)` — 规则优先（deny > allow > review），`review()`（异步，含 LLM 复核）与 `reviewSync()`（同步规则路，供无法 await 的 dispatch 用，review fail-open）双入口；
  `DEFAULT_GUARDRAIL_RULES`（rm -rf /、force push、磁盘格式化、凭证外传模式）。
- 接线: `TerminalPolicy` 构造器加可选 `guardrail?: Guardrail` 第 4 参（additive，默认不改行为），
  `check()` 在 `terminal/write` 时用 `reviewSync` 拦高危键入命令，deny → `PERMISSION_DENIED`。
  与 allowlist 并存：allowlist 决定「能不能调」，Guardrail 决定「这次该不该放行」。

### 5. Model Scheduling（队列 + 自适应并发）→ `src/model-scheduling.ts` ✅
- 参考: `linger/apps/node-services/src/agent/runner-gateway/model-queue.ts`
  （priority :29-30；`SUBSCRIPTION_CONCURRENCY={10,10}`、`API_CONCURRENCY={1,8}`；
  `probedConcurrencyRange`: verified 1→{1,1}、N→{N,max(N,8)}）。
- 实现: `createModelScheduler(kind)` — 优先级队列（urgent>normal>low），按端点 in-flight cap；
  `probedConcurrencyRange` 与 Linger 一致（subscription 固定 10/10，api 1 起步探到 max(verified,8)）；
  干净批次完成 → 抬 cap；失败批次不抬 cap，按 verified 级重试。`waiting()`/`endpoints()`/`close()` 可观测。
- 接线: 由调用方注入任务（`enqueue({endpoint,priority,run})`），transport 无关。

### 6. 持久 Memory / Wiki → `src/persistent-memory.ts` ✅
- 参考: `linger/apps/node-services/src/memory`、`src/llm-wiki`、`prompts/{memory,llm-wiki}`。
- 实现: `PersistentMemory` — zod schema（`MemoryEntry`: id/kind[text=user|project|context|preference]/text/source/createdAt/lastRecalled/recallCount），
  原子 JSON 持久化（临时文件+rename，崩溃不留半写文件）；`remember`/`recall`（关键词打分+召回统计）/`forget`/`entries`/`consolidate`
  （确定性剪枝：>N 天未召回、精确重复；可选 LLM judge 合并相关条目）。`openPersistentMemory(directory)` 工厂。

### 7. 桌面接管（真 Chrome CDP）→ `src/desktop-takeover.ts` ✅
- 参考: `linger/apps/computer/local-daemon/internal/linger/localtools/native_browser.go:216`、
  `native_cdp.go:158`（CDP `DialContext` 连用户已登录真浏览器，非新 VM）。
- 实现: `connectCdp(wsEndpoint)` — 全局 WebSocket（Node 22+/Electron）上 CDP 协议，`send(method,params)` id 关联 + `on(event)` 订阅；
  `listCdpTargets(httpOrigin)` 读 `/json`；`openCdpTab(httpOrigin,url)` 走 `/json/new` 开新 tab 并 attach；
  `tabActions(connection)` 高层助手（navigate/evaluate/title/url）。operates 真实已登录浏览器（cookie/session/profile 完整）。

## 验证记录
- 全部 7 项改动（2 改 + 5 新模块）均通过 esbuild TS parse。
- 参数链路人工审计: `resumeDepth` 在 openRaw/iterate/iterateWithCachedSnapshot 三处签名与全部调用点一致，递归截断正确。
- Guardrail 接线 additive: `TerminalPolicy` 第 4 参可选，3 个既有构造点（harness-remote-bridge/acp/gateway/service）不改行为。
- 待: 完整 `tsc`（需先安装 workspace 依赖）+ host 行为测试 + 真机断连/慢消费回归 + CDP 连真 Chrome 冒烟。
