# Xagent Host 与服务端交接：iPhone 后台任务状态

目标仓库为 Xagent，建议归档于 docs/design/ios-live-activity.md。本文是待实施方案。配套设计见相邻 Xagent-IOS 仓库 docs/fork/2026-11-23-ios-移动端连接与同步增强-design.md 第五节。

## 用户场景

用户在手机发起或查看一轮正在运行的任务，随后锁屏。电脑上的 Claude Code 或 Codex 请求权限时，锁屏和灵动岛显示“待审批”。从电脑批准后恢复“运行中”，结束后显示结果。首版由 iOS 在前台创建 Live Activity。电脑独立发起任务时远程新建卡片留待后续。

## Host 插件

1. 先沿 packages/plugin/src/managed-agents/runtime.ts、claude-adapter.ts、codex-adapter.ts 和 questions.ts 核对两个 harness 的真实事件。原生 dsh 会话另沿 packages/plugin/src/tui-event-source.ts 查证。记录各模式能可靠识别哪些转换；缺事件的模式应明确标明。尤其检查手机断开后事件源是否继续工作。
2. 为每轮执行分配稳定、不透明的 runRef，建立与本机 host、会话、轮次的映射。向经既有归属校验的 iOS 客户端提供 runRef。一个会话的下一轮获得新的标识。子任务事件归并时，以本轮仍待处理的请求集合决定状态。
3. 在 Host 确认状态变化时上报下表事件。每轮维护递增 revision、最新状态及发生时间。离线时保存最新待发送状态，重连后重试，重复上报应幂等。保持事件采集独立于手机的 session/follow 或 WebRTC 订阅。

| Host 已确认的事实 | 活动状态 |
| --- | --- |
| 本轮已开始 | running |
| 有未决权限请求 | waiting_approval |
| 无待审批项，正在等待用户回答 | waiting_input |
| 最后一个阻塞请求已处理，本轮继续执行 | running |
| 本轮结束 | 按真实结束原因映射 done、failed 或 stopped |

令牌输出和计时跳秒不产生推送。Host 掉线只说明状态可能过期，不应生成失败或完成事件。

## Server 与 iOS 协议

优先评估将推送模块加入 apps/server。检查 src/server.ts、gateway.ts、store.ts、config.ts 的路由、身份、持久化和配置接入点。以下为拟新增操作，先与 iOS Agent 冻结字段、状态枚举、时间单位和样例，再实现双方。保持现有加密会话和 relay 协议兼容。

| 操作 | 调用方 | 内容与校验 |
| --- | --- | --- |
| 注册／轮换活动 | iOS → Server | runRef、activityId、活动专用 push token。校验设备身份、Host 归属及本轮订阅授权。环境按签名构建和服务端部署配置匹配。替换旧 token 后补发最新状态 |
| 上报状态 | Host → Server | runRef、revision、state、occurredAt。身份取自已认证 Host，只接受其拥有的任务；原子保存较新版本。允许先收到状态再注册活动 |
| 结束订阅 | iOS／Server | 用户关闭活动、解绑设备或 APNs 报告 token 失效时停发。设备解绑同时撤销该设备全部绑定，避免重试队列继续发出 |

服务端将状态分发给匹配且有效的订阅。推送仅含通用枚举、必要时间和不透明标识。会话标题、命令、路径、问题和回答留在加密业务通道。禁止记录原始 token 和密钥。

## APNs 投递

- iOS 负责前台创建活动、观察 pushTokenUpdates、注册和轮换 token、点击后恢复会话。普通通知的 device token 与活动 token 分开存储。
- Server 使用服务端密钥调用 APNs，开发与生产隔离。使用 liveactivity 推送类型及 <主应用 Bundle ID>.push-type.liveactivity 主题。aps 包含 Unix 秒 timestamp、event 和与 Swift ContentState 完全一致的 content-state。按任务串行发送，合并过时事件，重试前再次比对 revision，覆盖同秒连续转换。
- 建议完成时先发送显示终态的 update，再由可恢复的延迟任务发送 end 并携带最终状态。与 iOS 约定展示窗口、stale-date 和过期文案。只在状态有变化时推送，App 回到前台以 Host 真实状态校正。
- 按 APNs 响应分别处理接受、永久失败和可重试失败。对限流／临时故障退避重试，失效 token 仅撤销对应绑定。记录脱敏关联标识、revision、APNs 响应及错误类别。

## 交付顺序与验收

1. 先提交共享协议样例及两个 harness 的事件映射，再实现 Host 与 Server。服务端用模拟发送器验证乱序、重复、token 注册滞后、轮换、解绑、跨账号订阅拒绝，以及两轮任务并行。遵循 Xagent 仓库的测试资源约定。
2. 在联调环境部署带推送模块的 Server，配置相应 APNs 凭据，更新测试电脑上的 Host 插件，与带 Widget Extension 的 iOS 构建联调。旧客户端和旧插件应能继续正常使用既有会话。
3. 分别用 Claude Code 和 Codex 在真机执行：手机发起任务 → 锁屏 → 电脑触发审批 → 电脑批准 → 继续执行 → 完成；另测待回答、失败、点岛定位及漏推后回前台恢复。分别记录 Host 事件、APNs 接受结果、真机显示结果。
4. 发布记录标明 Server 版本、插件版本、iOS 构建及实际通过的场景。推送模块应可独立停用，不影响对话和审批。生产发布按仓库现行流程单独执行。

Apple 协议参考：[Starting and updating Live Activities with ActivityKit push notifications](https://developer.apple.com/documentation/activitykit/starting-and-updating-live-activities-with-activitykit-push-notifications)。
