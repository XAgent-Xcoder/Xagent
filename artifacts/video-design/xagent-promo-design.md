# Xagent 产品宣传片 — 设计方案（v2，仅设计，未产片）

日期：2026-11-23 · 工作区：/Users/joseph/projects/Xagent
状态：设计已确认关键选项；素材自采已授权；App 显示名已改。等待采集前置条件就绪后创建独立 OpenMotion 工程制作。

## 0. 任务边界

- 使用已连接的 OpenMotion 插件（连接已验证，dataDirectory：`/Users/joseph/.openmotion-dsh/data`）。
- 两条指定参考均为「参考创作」类型：只有参考视频 + 动效说明，没有原片工程；按参考的叙事与动效语法创作独立新作品，**不承诺精确复刻**。
- 保留现有工程：当前工作区已有「OpenMotion 示例短片」（id: `project`），不触碰。
- 本片交付时创建**新的独立工程**，返回准确工程链接，打开检查内容；后续修改都在同一工程进行。
- 全片**静音**（未提供音频）。Logo 可用文字品牌。
- 本轮只交付设计 + 素材清单，不创建工程、不渲染。

## 1. 已读取的参考资源（准确 ID）

### 参考 A：Supabase — connector in Gemini Enterprise
- ID：`motion-713872a8-8a62-4e4f-abc1-867d74c642e3` · 16.3s · 1280×720
- 叙事：一次「启用」动作把数据源接入对话。
- 段落：黑场 → 标题展开 → 输入框 → 插件菜单 → 连接器加入 → 启用开关 → 回到输入 → 提问 → 发送 → 双品牌锁定 → 退出。
- 借用的动效语法：
  1. 现有列表项先出现，新项**从下方加入并对齐**；
  2. 开关**灰→绿**后菜单收起，回到全景；
  3. **指针只在操作时出现**，不持续遮挡名称；
  4. 输入框逐步填入文字，发送按钮最后触发；
  5. 落版双品牌**尺寸接近**、中间小乘号、背光各归一侧；
  6. 深色界面、低亮背光、启用绿相互区分，文本保留足够字号。

### 参考 B：Supabase Pipelines — near real-time analytics sync
- ID：`motion-b7699fbd-9519-4fa6-8d45-f42141378d93` · 36.1s · 1256×720
- 叙事：**压力 → 分工 → 配置 → 同步**的因果链，产品作用有前因后果。
- 段落：产品标题 → 主张 → 单库 → 数据增加 → 延迟面板 → 红色过载 → 分工主张 → 增加目标 → 配置 → 启动 → 数据流 → 双库 → 结构同步 → 表字段 → 新字段传递 → 结语 → 品牌。
- 借用的动效语法：
  1. 压力可视化：数据条增多 + 状态面板**绿正常→红上升**，幅度与颜色同时变化；
  2. 配置按顺序展示，**启动后才画流线**；
  3. 细流线**单向**从源进入目标，不用双向箭头造成含义混淆；
  4. **结构变化沿同一通路传播**：左端新增 → 标签沿连接线移动 → 右端出现并高亮；
  5. 结语**分别交代两端结果**，不把所有变化写成「更快」；
  6. 线框设备 + 等宽字段文字 + 黑底高对比。

## 2. 产品事实核对（已核实）

| 项 | 核对结果 | 来源 |
| --- | --- | --- |
| 产品名 | **Xagent**；插件包名 `xagent`，当前测试版 `0.7.1-xagent.1`（根 package.json 已核实），**尚未发布 npm**，用 `.tgz` 安装 | README.zh.md / package.json |
| 安装命令 | `dsh plugin --profile desktop add -w /path/to/xagent-0.7.1-xagent.1.tgz`（Web profile 换 `web`），装完重启 DSH | README.zh.md |
| 登录品牌 | **Xcodex 账号**（自有品牌），默认服务 agent.xcodex.vip，邮箱密码 + Google | README.zh.md |
| 核心功能 | 在 DSH 当前工作区创建/继续 **Claude Code、Codex** 会话，与 DSH 对话并列；工作区组织、Agent 标识、模型/推理强度、流式回复 + 工具调用、消息排队、Agent 提问回答 | README.zh.md |
| 远程连接 | 同账号设备发现、身份固定、**端到端加密** | README.zh.md / PRODUCT.md |
| **Android 客户端** | **`/Users/joseph/projects/Xagent-Android`**（独立仓库，Flutter，dsh-go 系）：本机 PRoot 运行 DSH + SSH/远程主机 + xcodex 远程账号（`remote_screen.dart` / `pairing_page.dart`）；**不是**本工作区 `apps/android`（RN 旧客户端） | 已读 README/AGENTS/源码 |
| **iOS 客户端** | **`/Users/joseph/projects/Xagent-IOS`**（独立仓库，Flutter，dsh-go fork 的 iOS 远程客户端）：配对/中继/LAN/WebRTC 直连电脑 DSH，含 xcodex 账号页（`relay_account_page.dart`） | 已读 README/源码 |
| 手机端登录文案 | 两端真实 UI 文案均为「**使用 xcodex 账号登录**」「输入邮箱和密码，服务器校验账号并签发凭证」，默认服务器 agent.xcodex.vip | 两端 `remote_zh.arb` 已核实 |
| App 显示名 | 原均为 **AgentPort**；已按确认改为 **Xagent**（见 §8 已完成改动） | AndroidManifest.xml / Info.plist |
| Web 品牌视觉 | xcodex Remote：深色 #0a0a0a、卡片 #141414、浅蓝 #9db6ef | docs/branding-xcodex.md |
| 可用强调蓝 | DeepSeek 蓝 #4D6BFE（DSH/Android 视觉系） | AGENTS.md |
| Xcodex 标识 | `apps/server/web/public/xcodex-mark.svg` 存在 | 已核实 |
| DSH 桌面 profile | 现装旧 `ds-harness-remote` + `xcodex-remote`，**未装当前 xagent**；README 禁止新旧同时启用 → 采集用**隔离测试 profile** | `~/.dsh/profiles` 已核实 |
| 模拟器环境 | Android：Pixel_10 AVD + SDK emulator/adb 可用；iOS：iOS 26.5 模拟器运行时存在（当前无已启动设备） | 已核实 |

### 素材与能力风险（采集时核验，不虚构）
1. `docs/images/` 6 张旧截图属 DSH Remote 时代，当前 README 未引用，**默认过期不用**；本轮模型无图像输入能力，未目视核验，采集阶段全部重拍。
2. **Flutter 客户端的 xcodex 远程集成仍在演进**（Xagent-Android 有 2026-11-23 的 settings-xcodex phase-b 设计稿）。S5–S7 的登录/发现/同步/新建镜头以**模拟器实测可用**为准；若某步骤尚未打通，如实报告并调整分镜（例如只展示已验证的同步），不伪造界面。
3. 「手机端新建 DSH / Claude Code / Codex 对话」在 Flutter 客户端的实际入口与能力需实测确认（M13）；本工作区 RN 客户端支持该流程，但本片主角是上述两个 Flutter 仓库。
4. iOS 分发方式（TestFlight / 自签 / 其他）未确认，影响 S5 下载卡片文案；暂用中性「Xagent for iOS」。
5. DeepSeek Harness 落版标识：默认用文字 wordmark（已获许可）；如有官方 logo 文件可替换。

## 3. 创意概念（已确认）

**一句话**：参考 B 的「压力—分工—配置—同步」因果链作骨架，参考 A 的「一次启用动作」语法用在配置三步骤（装插件、登录、连手机），讲清 Xagent 的前因后果。

> 任务在电脑上跑，人不能一直守着 → 电脑继续执行、手机随身继续 → 装插件、Xcodex 登录、手机同账号连接 → 同一条对话两端同步、手机新建 DSH/Claude Code/Codex 对话 → 两端各自结果 → 双品牌落版。

- 片名（工作标题）：`Xagent — 把电脑上的 Agent 装进口袋`
- 时长：**~50s 完整版**（已确认；精简版未选）
- 画幅：**16:9，1920×1080**
- 声音：**静音**
- 文案：**中文短句 + 英文产品名**（已确认）
- 落版：**Xagent × DeepSeek Harness**（已确认）
- 真实 UI：截图/录屏嵌入「线框设备」圆角遮罩，周边压暗；文字、流线、开关、指针、品牌全部原生可编辑层。

## 4. 分镜脚本（主版本 ~50s）

| # | 时间 | 画面内容 | 动效（参考来源） | 文案（建议） | 素材 |
| --- | --- | --- | --- | --- | --- |
| S0 | 0.0–2.5 | 黑场，中心标题展开 | 标题展开（A） | `Xagent`＋副行「把电脑上的 Agent 装进口袋」 | 原生 |
| S1 | 2.5–7.0 | 线框电脑，任务条/流式线增多；状态面板「Agent 正在执行」绿 → 人离开图标 → 面板转红「你已离开电脑」 | 压力可视化（B） | 「任务还在跑，人不能一直守在电脑前。」 | 原生线框；可选 M6 小窗 |
| S2 | 7.0–9.5 | 中心短句；左右浮现电脑/手机线框节点 | 分工主张（B） | 「电脑继续执行，手机随身继续。」 | 原生 |
| S3 | 9.5–16.0 | DSH 插件管理界面：现有列表先出现，`xagent` 项从下方加入对齐；.tgz 命令 chip；启用开关灰→绿后收起 | 新项加入+开关（A）；指针只在操作时出现 | 「在 DSH 中安装 xagent 插件」；等宽命令 `dsh plugin --profile desktop add -w xagent-0.7.1-xagent.1.tgz` | M1、M2 |
| S4 | 16.0–21.0 | Xcodex 登录卡片：邮箱密码 + Google；指针点击 → 成功绿勾；账号 chip 点亮 | 输入/启用语法（A） | 「使用 Xcodex 账号登录」 | M3、M4 |
| S5 | 21.0–27.0 | 手机线框升起；`Xagent for Android` / `Xagent for iOS` 下载卡片滑入；手机内「使用 xcodex 账号登录」（真实文案）；设备列表出现电脑「在线」→ 连接 → 细蓝线 + 锁图标 | 配置按顺序、启动后才画线（B） | 「手机下载 App，同一账号登录」→「发现你的电脑 · 端到端加密」 | M8–M10、M14 |
| S6 | 27.0–34.0 | 左：DSH 工作区「Agent 会话」，Claude Code / Codex chip 与 DSH 对话并列，流式回复+工具卡；消息 token 沿细蓝线**单向**流入手机；手机聊天页出现同一条对话 | 数据流+双端同步（B） | 「同一条对话，两端同步。」 | M5、M6、M11、M12 |
| S7 | 34.0–41.0 | 手机「新建对话」→ 后端选择 DSH / Claude Code / Codex → 新会话 token 沿同一通路**反向单独一镜**回到电脑；电脑会话列表新增一行高亮 | 结构变化沿同一通路传播（B）；每镜单向 | 「在手机上，新建 DSH / Claude Code / Codex 对话。」 | M13、M7（能力以实测为准） |
| S8 | 41.0–46.0 | 双节点各自结果：电脑任务条继续（绿），手机对话气泡继续（蓝） | 结语分别交代两端（B） | 「电脑上，任务继续执行。」「手机上，随时接着聊。」 | 复用 S6 元素 |
| S9 | 46.0–50.0 | 双品牌落版：**Xagent × DeepSeek Harness**，并排、小乘号、背光各一侧；0.3s 退出 | 双品牌锁定（A） | `Xagent × DeepSeek Harness` | M15 |

节奏规则：每个配置步骤一个完整「操作→状态变化」闭环；流线只在连接建立后出现；S6/S7 各保持单向；真实截图停留 ≥2s。

## 5. 视觉规范

- 色板：背景 `#0a0a0a` · 卡片/设备框 `#141414` · 主强调 `#4D6BFE`（流线/主操作/手机侧背光）· 次强调 `#9db6ef`（电脑侧背光/辅助）· 成功/启用 `#2fd48e`（保留灰→绿语义）· 警示 `#d77869`（仅 S1）· 正文 `#f0f5f1`
- 字体：无衬线中心短句（中文黑体类 + 英文产品名同族）；命令、会话字段、版本号等宽。
- 真实 UI：深色主题优先；线框设备圆角遮罩、周边压暗；关键操作用原生指针/高亮圈重演。
- 动效总规则：指针只在操作时出现；新项从下方加入对齐；开关灰→绿后收起；流线单向细线；变化沿通路传播后终点高亮；落版双品牌尺寸接近。
- 可编辑性：文字/chip/流线/开关/品牌原生层；截图/录屏为设备框内媒体层，可替换。

## 6. 素材自采计划（已授权自采）

### 前置条件（需要你配合的仅 1 项）
- **测试账号**：提供一个可展示的 Xcodex 测试账号，或在我搭好的隔离测试 profile 里登录一次（电脑端 + 手机端各一次）。成片会遮罩邮箱。
- 其余环境我已核实可用：Pixel_10 AVD、iOS 26.5 模拟器运行时、两个 Flutter 仓库、插件源码。

### 采集步骤
1. **插件包**：在本仓库按资源预算规则构建 `packages/**` 并打包 `xagent-0.7.1-xagent.1.tgz`（npm pack，发布入口已提交在 dist）。
2. **隔离测试 profile**：新建独立 DSH profile 安装该 tgz（**不动**现有 desktop profile 里的旧 ds-harness-remote/xcodex-remote，避免新旧同时启用），启动 web GUI，登录测试账号。
3. **电脑端素材 M1–M7**（深色主题，≥1920 宽）：
   - M1 插件管理页 xagent 已安装/启用；M2（可选）安装过程录屏
   - M3 「使用 Xcodex 账号登录」入口 + 登录表单；M4 登录后设备/主机在线状态
   - M5 工作区「Agent 会话」列表（CC/Codex 与 DSH 对话并列）
   - M6 一条真实流式对话录屏 5–10s（含工具卡、模型选择；CC、Codex 各一条更佳）
   - M7 会话列表新增一行的前后对照
4. **Android 素材 M8–M13**（Xagent-Android，Pixel_10 模拟器，显示名已改 Xagent）：
   - 按该仓库资源预算规则构建/运行 Flutter App；xcodex 登录同一测试账号
   - M8 启动/图标页；M9 登录页；M10 设备发现在线→连接录屏；M11 工作区/会话列表；M12 与 M6 同一条对话的聊天页流式录屏；M13 新建对话（后端选择 DSH/CC/Codex）录屏
   - **先实测 xcodex 远程链路可用**（见 §2 风险 2/3），不可用的镜头如实调整
5. **iOS 素材 M14**（Xagent-IOS，iOS 26.5 模拟器，显示名已改 Xagent）：
   - Xcode + Flutter 构建到模拟器（无需真机签名）；采集与 M8–M13 对应画面
   - 若 iOS 链路暂不完整，主版本以 Android 演示，iOS 以下载卡片 + 文字出现
6. **品牌 M15**：Xagent 文字 wordmark（无现成 logo）；DeepSeek Harness 文字 wordmark（如有官方 logo 可替换）；xcodex mark 已有 SVG。
7. **核验**：所有素材与文案一致、账号遮罩、深色主题；当前模型无图像输入，目视质检需切换图像能力模型或由你确认。

## 7. 可选精简版（未选，仅留档）

~20s：标题(2s) → 装插件(4s) → 登录(3s) → 手机连接(4s) → 同步/新建合并(5s) → 落版(2s)。同一工程内另出 composition。

## 8. 已确认决策与已完成改动

| 问题 | 决策 |
| --- | --- |
| 素材来源 | **授权自采** |
| 时长 | **~50s 完整版** |
| 文案语言 | **中文短句 + 英文产品名** |
| 落版品牌 | **Xagent × DeepSeek Harness** |
| App 显示名 | **先改成 Xagent 再录素材** |
| iOS | 在 **Xagent-IOS** 仓库（已定位并纳入采集） |

已完成的改动（均为未提交的工作区修改，供你审阅）：
- `Xagent-Android/app/android/app/src/main/AndroidManifest.xml`：`android:label` AgentPort → **Xagent**
- `Xagent-IOS/app/ios/Runner/Info.plist`：`CFBundleDisplayName` AgentPort → **Xagent**
- 本文件：`artifacts/video-design/xagent-promo-design.md`（设计稿，仓库已忽略 artifacts/）

仍开放的小项（不阻塞设计）：iOS 分发方式（下载卡片文案）、DeepSeek Harness 官方 logo 文件（如有）、测试账号。

## 9. 后续执行计划

1. **采集前置**：你提供测试账号（或在测试 profile 登录一次）；我构建插件 tgz + 隔离 profile + 两端模拟器运行。
2. **自采素材**：按 §6 采集 M1–M15，实测核验 Flutter 端 xcodex 链路；不可用镜头如实调整分镜。
3. **创建工程**：`openmotion_create_project` 新建独立工程（projectType=reference_video，referenceUrl 用参考 B 的 previewUrl；requirements 写入本设计摘要 + 两条参考 ID），保留现有工程。
4. **制作**：按 §4 原生重建 + 素材嵌入，静音，1920×1080。
5. **交付**：预览检查 → 导出 MP4（自动技术校验）→ 返回准确工程链接并打开核对内容。
6. **后续修改**：一律同一工程（版本历史可回滚）。
