---
name: create-new-game
description: "BoardGame 新游戏创建或资源/data intake 流程。用于新增游戏、只给图片/位置先开工；按现有游戏模式分阶段推进并验收。"
---

# 创建新游戏工作流

## 职责边界

本 skill 只承载新 `gameId` 从规则 / 素材 intake 到骨架、实现、UI、验证的阶段路由和完成门槛。具体模板、命令、文件结构和长门禁放在 `references/`；主入口不复制正文。

- AI 规范维护不由本 skill 承担；回 `.spec/knowledge/README.md` 和 `spec-steward`。
- 已有游戏新增派系 / 角色 / 可玩单元不走本 skill；回 `.spec/skills/add-new-faction/SKILL.md` 或对应专项 workflow。
- 产品方案、proposal、tasks、spec delta 和具体游戏范围管理归 `openspec/`；本 skill 只负责 AI 执行流程。
- 数据录入、资源链、UI gate、审计、E2E、音频、关键图片、支撑能力均以对应 standards / skills 为主源。

## 必读路由

按当前阶段只读必要 reference：

| 场景 | 先读 |
| --- | --- |
| 流程边界、worktree、OpenSpec、百游戏模式 | `references/workflow-boundaries.md` |
| 来源裁定、素材 / 规则 intake、资源准入 | `references/preflight-gates.md` |
| 阶段 0 一票否决 | `references/intake-redlines.md` |
| 目录骨架、manifest、domain 文件布局 | `references/game-skeleton.md`、`references/manifest-generation.md` |
| 机制分解、数据结构、权限矩阵 | `references/mechanics-data-design.md` |
| Board/UI、设计稿、截图链 | `references/ui-implementation-gates.md` |
| 收尾、i18n、教程、音频、关键图片、debug | `references/finalization-checklist.md` |
| 架构审查、项目结构、截图链模板 | 对应 `references/*template*.md`、`references/project-structure.md` |

若 reference 与 `.spec/knowledge/standards/` 或专项 skill 冲突，先执行主源，并回头修正过时 reference。

## 现场和范围

- 新游戏默认建议独立 worktree，但创建、切换或派生分支前必须得到用户当轮明确授权。
- 一旦选定执行现场，后续读写、验证、截图和 OpenSpec 更新都必须落在同一现场。
- 共享基线改动和单游戏实现分开收口；误落到主工作区的新游戏实现不得顺手并入主线。
- 未获授权创建 worktree 时，只做读取、规则 / 素材核对、计划和证据整理；实施确实依赖隔离现场时，说明后果和最小授权动作。

## 阶段门槛

### S0 Intake

未闭合以下内容前，不得进入目录骨架、Board/UI、机制实现、E2E、截图或完成汇报：

- 规则源、对照源和用户指定真相源；
- 对象全集、规则对象 × 素材数量对账；
- 正式素材、候选素材、参考图和排除项职责；
- 基础规则语义覆盖矩阵；
- 图面字段、空间载体、setup、资源用途和运行时素材需求。

新游戏的第一优先级是数据录入：凡是已经读取过的图片、图集、截图或裁图，必须先回填数据录入规范要求的图片登记表，完成图面数据、对象 / 槽位、最终处置和处置依据；不得先判断“这张图有没有用”再决定是否登记。卡牌描述、i18n、运行时定义和机制实现只能消费锁定后的录入合同。

缺口只能写成 `blocked / disputed / out-of-scope / approved-programmatic` 等可追溯状态，不能用占位素材、CSS 图形、示意图或 E2E 绿灯顶替。

新游戏的正式 OpenSpec proposal 也必须建立在 S0 之上：proposal 不是 intake 的替代物，而是基于已录入事实做架构、数据模型、流程和任务拆分的规划产物。无需录完全部卡库，但至少要录入能跑通目标主流程的规则对象、卡牌/能力效果、状态变化、玩家决策和所需素材；另需主动查询尚未录入的派系/角色特色机制，凡可能改变共享引擎、对象模型或流程边界的机制都必须写入风险和设计依据。

### S1 骨架与 Manifest

Open Design 设计稿和 UI-facing 模型批准前，S1 只允许建立非 UI 目录骨架、manifest、domain 草稿、规则文件和资源索引；不得创建正式 Board、运行时 HUD 或玩家交互。设计稿批准后，再按 `references/game-skeleton.md` 补齐 Board、thumbnail、tutorial、audio、critical image resolver 和基础测试。主 skill 不维护代码模板。

最低验收：

- `npm run generate:manifests` 通过；
- 对应 `src/games/<gameId>` 冒烟测试通过；
- 大厅可发现该游戏，且没有用错误资源路径、`compressed/` 硬编码或缺失 i18n 冒充接入。

### S2 机制与数据设计

先把规则动作拆成状态、事件、命令、UI 承接和验证证据，再实现。正式事实、系统状态、派生读模型和纯 UI 状态必须分开。

S2 必须产出职责 owner 表：规则事实、正式状态、命令校验、命令执行、事件 reducer、读模型 / selector、UI Surface、动作列表 / action model、测试夹具和素材数据分别由哪个文件或目录承载。没有这张表时，不得进入 S3 领域内核或 S5 Board/UI；不得先把职责塞进 `game.ts` / `Board.tsx` 再承诺后续重构。

若当前新游戏 change 包含 `board-ui`、`runtime-entry` 或玩家可见交互，S2 不能在没有已批准的 Open Design 设计稿 / 交互合同的情况下标记完成：规则事实可以先依据主规则源整理，但 UI-facing 状态、事件、命令、选择项、可见字段和溢出策略必须回填设计稿结论。缺设计稿时只能停在 `in_progress`，不得直接进入 UI 实施或把临时模型当正式模型。

一票否决：

- 玩家必须选择但实现自动代选；
- 规则要求多候选但实现只有单例；
- 轨道 / 档位 / 非线性属性被压成裸数值；
- 随机 / 进度关系只有结果日志，没有可见状态承接；
- 空间放置、朝向或连接合法性缺少结构化数据或玩家决策。
- `game.ts` 或 `Board.tsx` 成为新规则、新 UI、新动作列表或新读模型的默认落点。

### S3 领域内核

实现 validate、execute、reduce、isGameOver 和最小领域测试。具体结构按 `engine-systems.md` 与 `references/mechanics-data-design.md`。

规则：

- validate 只裁定合法性，不改状态；
- execute 只产出事件或明确等待交互，不直接写 core；
- reduce 是纯函数，只改事件命中的状态路径；
- 终局读取走 `sys.gameover`，见 `engine-gameover.md`；
- 旧浏览器门禁只允许基于关键能力缺失，不按版本号硬拦全站。
- `game.ts` 只组装领域内核、注册系统和暴露必要入口；命令数、事件数或状态落地逻辑达到中等复杂度时，必须拆到 `domain/` 或行为 owner。`game.ts` 超过约 `1,000` 行、出现大型 `switch` 或同时承担 validate / execute / reduce 时，S3 不得直接标记完成；只有在 S2 owner 表写明白名单理由，并证明它仍是单一入口组装职责、不承载规则事实 / 校验 / 执行 / reducer 正文时，才允许放行。

### S4 系统组装

接入 FlowSystem、ActionLog、Undo、Interaction、ResponseWindow、Tutorial、Cheat 等系统时，先读对应主源：

- 引擎系统：`.spec/knowledge/standards/engine-systems.md`
- 行动日志：`.spec/knowledge/standards/engine-action-log.md`
- 撤回：`.spec/knowledge/standards/undo-auto-advance.md`
- 支撑能力：`.spec/skills/support-capability-integration/SKILL.md`
- AI：`.spec/skills/game-ai-adaptation/SKILL.md`

`commandTypes` 只列业务命令；系统命令由 adapter 合并。ResponseWindow 必须配置注入，禁止改引擎文件迁就单游戏。

### S5 Board/UI

进入主 UI 前先读 `references/ui-implementation-gates.md`。新游戏默认按“桌面基线 -> 桌面真实 E2E -> 桌面截图复看 -> 移动适配 -> 移动截图复看”推进。

S5 是硬阻塞步骤：当前 change 若包含 UI，执行到 UI 实施任务时必须检查 Open Design artifact、导出设计图、AI 图面核验、用户批准记录、UI 前置包和需求对齐表。任一缺失都必须停在 `blocked`，不得写 Board / runtime UI、不得启动实现 E2E，也不得用页面能打开或测试夹具通过替代设计稿门禁。

禁止：

- 先做低保真 Board，再事后补规则对象和素材；
- 多套 UI 家族长期并存；
- 为测试暴露正式 UI 中无游戏意义的切座、debug 或夹具按钮；
- 用通用壳层、其它游戏换皮或多层框体堆叠冒充正式 UI。
- 把动作列表、合法目标、规则推导、数据 registry、教程状态、动画生命周期或调试面板直接堆进 `Board.tsx`；`Board.tsx` 超过约 `1,000` 行或同时承担多个 UI 子区域时，必须先做体量审查，未通过白名单裁决则拆 Surface / read model / controller hook 后再继续实现。

### S6 收尾与启用

最终完成前必须回查：

- i18n、教学、音频、关键图片预加载、debug 配置、资源 manifest；
- 资源是否压缩、上传到服务器素材主源并远端回查；
- 本轮定义为基础体验的操作日志、撤回、音效、AI、教程、debug 是否在附加能力矩阵中逐项裁定；
- 真实入口可玩性、截图、E2E 和规则对象素材矩阵是否一致。

有可本地推进的缺口时继续推进，不发送完成式汇报。

## OpenSpec 边界

只要任务进入具体游戏布局、runtime 边界、实现阶段拆分、proposal、design、tasks 或 spec delta，就切到 `openspec/AGENTS.md`。一个新游戏默认应有唯一游戏主 spec，阶段性 change 只能作为增量推进，不能替代整体真相源。

foundation 完成不等于新游戏完成。整体完成判断必须回到用户需求对齐表、游戏主 spec、当前 active change 和真实验证证据。

## 附加能力矩阵

新游戏本体完成前后，必须逐项裁定：

- action-log；
- undo-system；
- audio-feedback；
- game-ai-system；
- tutorial-engine；
- debug-config。

状态只能是 `实施本轮 / 本轮明确跳过 / 仅保留底层接口，UI 暂不交付`。用户说“接入可选 / 可选都接 / 把可选接上”时，默认以上能力全部进入 `实施本轮`，除非用户或 OpenSpec 明确排除。

## 完成判定

不得把“教程通了”“夹具通了”“截图像个游戏”“页面能打开”包装成新游戏完成。完成前必须证明：

- 正式局内核心规则对象不是占位、固定序列或测试专供；
- 正式玩家入口不依赖教程注入、隐藏命令、调试按钮或脚本直发；
- 胜负、阶段推进、资源、随机、空间、对象真相和基础 UI 都有真实入口证据；
- 所有本轮范围内未完成项已被用户或 OpenSpec 明确接受为后续项。

最终汇报必须说明当前完成到哪个阶段、验证命令和截图 / evidence 在哪里、哪些项仍是 `blocked` 或后续范围。
