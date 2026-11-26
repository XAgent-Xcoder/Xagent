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
    2 分钟内刚连上过且 attempt ≤ 1 时走快速重拨。**所有分支（含快速重拨）最终都被
    `maxDelayMs` 封顶**，保留原有「delay ∈ [0, maxDelayMs]」配置契约（测试以
    `maxDelayMs=1/100` 的紧预算断言重连时机）。
  - hello.ack 处（`this.online = true`）重置 `connectAttempt`、记录 `lastConnectedAt`。
- 注: 控制面心跳（25s/75s）xagent 原本就有（`protocol/src/index.ts:70`、
  `server-connection.ts:437`），未重复搬。

### 2. retained-event 重放 ⚠️ 已回退（与 xagent 传输层安全契约冲突）
- 参考: `connection.go:616-640`（`replayRetainedEvents` + `activateStreamAndReplay`）。
- 结论: **不在 gateway 层移植**。尝试把 Linger 的「断开自动续传 / 慢消费背压保留」搬进
  `remote-typert-gateway.ts` 后，破坏了两条经评审的传输层不变量，对应测试失败：
  - `native-stream-recovery`「carrier 仍连接时慢消费必须失败」：原设计对慢消费者
    清空缓冲并抛 `TRANSPORT_CLOSED`（"reconnect to recover"），是防内存耗尽的资源保护边界；
    改成「丢最老一半留最新」会掩盖停滞客户端。
  - `client-reconnect`「在恢复的 carrier 上重开读流并加载 Host 历史」：原设计是
    gateway 在 transport 断开时**失败旧流**（`TRANSPORT_CLOSED`），由**客户端层**在恢复的
    carrier 上重开新流并经 `session/history` 回填——即源码注释「Do not reopen streams or
    replay RPCs here」。gateway 内自动续传越过了这层职责分离。
- 关键发现: Linger 想补的「重连重放保留事件」能力，xagent **已在正确的层（客户端重连 +
  `session-history-cache.ts` 的 `RemoteSessionHistoryCache` snapshot/cursor/按 seq 续帧 +
  `iterateWithCachedSnapshot` 的 `backfillRange`）实现**。故无需在 gateway 重复造轮子。
- 处置: `remote-typert-gateway.ts` 已 `git checkout db746a5` 完整回退到上游，保留安全契约。

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
- 6 项落地改动（1 改 server-connection + 5 新模块）+ login-shell/UI 修复均通过 esbuild TS parse。
- Guardrail 接线 additive: `TerminalPolicy` 第 4 参可选，3 个既有构造点（harness-remote-bridge/acp/gateway/service）不改行为。
- **完整 tsc 通过（0 错误）**: `pnpm install` 后先构建 crypto/protocol/client-core/webrtc 四个 workspace 依赖，
  再 `pnpm check`（tsconfig.test.json，含测试）。首轮 tsc 抓出并修复: desktop-takeover send 参数隐式 any、
  launch.ts 相对导入缺 .js 后缀、model-scheduling drain() 返回 void 误用 .catch、
  persistent-memory/proactive 私有字段与方法重名(entries/rules→records/ruleList)、consolidate merge 解构方向。
- **测试回归三分法（关键）**: 首跑 full suite 17 失败。用 `git worktree` 在上游 `db746a5` 建基线对照：
  - 与上游同路径（含空格）基线对比 → **我的改动引入 0 回归**（mine 6 失败 = baseline 6 失败，完全相同）。
  - 6 个失败全是环境性: native-rtc-node-probe / werift-rtc / harness-remote-bridge(path traversal) /
    managed-agent-backend / remote-tools（macOS native/Electron 探针），以及 acp-opencode-native-api
    （checkout 路径含空格触发 `URLSearchParams`(+) vs `encodeURIComponent`(%20) 编码差异，源码未改）。
  - 首轮多出的 11 个失败是我的改动违反既有契约，已逐一修复而非改测试:
    server-connection 退避未受 `maxDelayMs` 封顶（4）→ 封顶；launch.ts host 登录 shell 注入污染显式 base env（1）
    → 仅在默认 process.env 情形注入；managed-agent UI `document` 未定义 + agent label 包 span 破坏
    button 直接文本子节点契约（4）→ `typeof document` 守卫 + label 作直接子节点；
    remote-typert-gateway 慢消费背压/自动续传破坏传输安全不变量（2）→ 整体回退（见第 2 项）。
- 测试: `scripts/check-with-budget.py` 依赖 systemd-run（Linux 专用），macOS 上以 `nice -n 15 vitest run --maxWorkers=2` 等效限资源执行。
- 待: 真机断连/慢消费回归 + CDP 连真 Chrome 冒烟 + iOS VoIP 保活真机验收。
