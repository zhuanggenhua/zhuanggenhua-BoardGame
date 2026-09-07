# 大杀四方 Munchkin 牧师对象级审计收口

## 基本信息

- 对象：Smash Up / 大杀四方 `munchkin_clerics`（Munchkin 牧师）
- 日期：2026-09-08
- 作者：Codex
- 文档类型：`closeout`
- 关联旧文档：`evidence/smashup/munchkin-new-faction-flow-audit-2026-08-01.md`

## 审计范围

- 本轮覆盖：牧师 12 张牌 + 2 个基地，即 `src/games/smashup/data/factions/munchkin.ts` 中 `MUNCHKIN_CLERICS_CARDS` 和 `MUNCHKIN_CLERICS_BASES` 的完整对象清单。
- 本轮覆盖的规则链路：随机回收、计分后移动、模式选择、可选回收、持续行动移动、附着诅咒、临时力量、附着行动摧毁、跨玩家弃牌堆行动、计分后基地回牌库顶、亡灵怪物回怪物牌库底。
- 本轮目标入口 / 环境：本地工作区 `D:\gongzuo\webgame\BoardGame`；领域测试覆盖最终权威状态；Playwright 真实入口 E2E 覆盖玩家从手牌、场上天赋、计分响应窗口和基地响应窗口进入并完成交互。
- 明确不在本轮范围内：Munchkin 其它普通派系、公共宝藏牌堆逐卡最终 closeout、公共怪物牌堆整体 closeout、Munchkin 整扩展统一 closeout、服务器资源重新上传 / 公开 URL 哈希回查。

## 审计自检表

| 自检项 | 状态 | 证据 |
| --- | --- | --- |
| 对象范围 | `passed` | 牧师 12 张牌 + 2 个基地已在本文完整列行；旧 Munchkin 总账对象矩阵同步回写。 |
| 真相源状态 | `passed` | 主真相源为 Munchkin 已锁规则图、图片合同表与当前 `munchkin.ts` 静态定义；本轮没有新增第二份规则来源。 |
| 原子语义断言 | `passed` | 本文逐对象重列触发时机、主体、目标、选择权、最终状态和负向边界。 |
| 实现消费链 | `passed` | `abilities/munchkin_clerics.ts` 的 handler / interaction、Munchkin 公共怪物事件归约、`ongoingModifiers` 和 base ability 均被对应测试消费。 |
| 最终权威结果 | `passed` | `munchkin-clerics.test.ts` 15 个用例覆盖手牌、弃牌堆、牌库顶、怪物牌库底、基地随从、临时力量、附着行动、压制、计分清场和交互无残留。 |
| 交互真实入口 | `passed` | `smashup-munchkin-monster-treasure-ui.e2e.ts` 的牧师筛选本轮 14/14 通过，覆盖手牌打出、场上天赋、持续行动来源、计分前后响应和基地能力。 |
| 验证证据 | `passed` | 本轮复跑完整牧师 Vitest、完整牧师 E2E、状态相关 intake/config 审查测试和 evidence 自检；测试语义对账写清最终状态断言。 |
| 共享影响与代表链依据 | `passed` | 判等依据：本文件不使用单个代表链外推；14 个牧师对象全部有直接对象行、行为断言和真实入口证据。 |
| 缺口分类与范围裁定 | `passed` | 本轮范围内无功能实现阻塞、语义不一致或必要验证缺口；范围外对象在“当前边界”中列明。 |
| 旧 evidence / 旧结论回写 | `passed` | 旧 Munchkin 总账顶部、S0 牧师行和普通 8 派系牧师行均同步回写为当前单派系 closeout 口径。 |
| 残余范围声明 | `passed` | 当前边界写明只取消牧师“实施中”，不扩大为 Munchkin 整扩展完成或公共宝藏 / 怪物牌堆整体完成。 |

## 结论等级

结论等级：`当前范围已收口`。

判定理由：牧师当前锁定范围内的 14 个对象都有规则子句、实现消费点、最终权威状态和真实入口证据；本轮将 `munchkin_clerics` 从 `SMASHUP_FACTION_IMPLEMENTATION_STATUS` 移除，并补状态回归，确保派系选择和配置审查不再把牧师显示为“实施中”。

## 权威来源

- 主真相源：`D:\gongzuo\webgame\gameasset\Smash Up! by Mervil (2833984701)-汉化图\新6扩小白\牧师\*.jpg/png`，旧 Munchkin 总账已记录完整规则子句。
- 图片合同证据：`evidence/smashup/munchkin-intake-atlas-contract-2026-08-01.md` 已登记牧师手牌图集、基地图集、完整单卡主裁图 / 裁图清单和 SHA256 前缀。
- 实现源：`src/games/smashup/data/factions/munchkin.ts` 与 `src/games/smashup/abilities/munchkin_clerics.ts`。
- 状态源：`src/games/smashup/domain/ids.ts` 的 `SMASHUP_FACTION_IMPLEMENTATION_STATUS`。
- 旧审计来源：`evidence/smashup/munchkin-new-faction-flow-audit-2026-08-01.md`。
- 合同状态：`locked`。本轮没有发现卡名、数量、图集索引、能力标签或基地元信息需要回到 intake 重新裁定。

## 原子语义与实现消费

| 对象 | 原子语义断言 | 实现消费点 | 最终权威结果 | 真实入口 / 验证证据 | 缺口分类 | 结论 |
| --- | --- | --- | --- | --- | --- | --- |
| 红衣主教 / `munchkin_clerics_cardinal` | 天赋从自己弃牌堆随机回收两张牌；不足两张时只回收现有牌；使用后标记已用。 | `registerMunchkinClericsAbilities` 中 talent handler + 弃牌堆随机选择事件。 | 选中的弃牌移入手牌，弃牌堆减少，天赋使用状态落地。 | 单测“红衣主教天赋从至少五张弃牌堆随机回收两张到手牌”；E2E“牧师红衣主教从真实天赋入口随机回收两张弃牌堆牌”。 | 无 | `passed` |
| 资深修士 / `munchkin_clerics_deep_friar` | 计分后可选移动同基地另一个己方随从到另一基地；第一步选随从，第二步选基地，单候选也不得自动替玩家选择。 | afterScoring special + `munchkin_clerics_deep_friar_minion` / `_base` 两段 interaction handler。 | 被选随从离开正在计分基地并留在目标基地；正在计分基地清场只处理剩余对象；响应窗口和触发队列无残留。 | 单测含完整 GameTestRunner 计分响应链；E2E“牧师资深修士从计分后真实响应窗口先选随从再选基地”。 | 无 | `passed` |
| 特纳 / `munchkin_clerics_turner` | 打出时若有两个合法分支，先手动选择摧毁本基地亡灵怪物或回收弃牌堆随机随从；选择摧毁分支后再手动选亡灵怪物。 | onPlay handler + `munchkin_clerics_turner_mode` / `_monster` interaction。 | 亡灵怪物从基地移除，普通怪物保留；回收分支把随机随从重洗入牌库。 | 单测“特纳在两个合法模式都存在时必须先手动选择模式”；E2E“牧师特纳从真实打出入口先选模式再手动选亡灵怪物”。 | 无 | `passed` |
| 圣临者 / `munchkin_clerics_holy_roller` | 打出时可以把弃牌堆一张随机牌重洗进牌库，也可以跳过；跳过时弃牌堆和牌库不变。 | onPlay handler + `munchkin_clerics_holy_roller_mode` interaction。 | 发动分支减少弃牌堆并让目标牌进入牌库；跳过分支不改变弃牌堆。 | 单测“圣临者的可选回收必须停在手动确认态”；E2E“牧师圣临者从真实打出入口必须手动确认或跳过回收”。 | 无 | `passed` |
| 垃圾处理 / `munchkin_clerics_bin_and_gone` | 持续行动所在基地之外的基地计分后，可以移动那座基地的一个随从到本行动所在基地；来源持续行动和目标随从都需真实承接。 | afterScoring ongoing trigger + `munchkin_clerics_bin_and_gone_minion` interaction。 | 被选随从移动到持续行动所在基地；原计分基地清空；交互无残留。 | 单测“垃圾处理在另一个基地计分后先手动选择随从”；E2E“牧师垃圾处理在计分后从真实持续行动入口手动移动另一个基地的随从”。 | 无 | `passed` |
| 光盘 / `munchkin_clerics_collection_plate` | 打出时从自己弃牌堆随机回收两张牌，不足两张时只回收现有牌；该强制效果不新增确认。 | onPlay handler + `CARD_RECOVERED_FROM_DISCARD` 事件。 | 回收牌进入手牌，光盘进入弃牌堆，行动额度消耗。 | 单测“光盘从弃牌堆随机回收两张”；E2E“牧师光盘从真实手牌入口自动回收两张弃牌堆牌”。 | 无 | `passed` |
| 监禁诅咒 / `munchkin_clerics_curse_of_imprisonment` | 作为持续行动附着到任意随从，压制宿主能力；移除后宿主能力恢复。 | 附着行动静态定义 + `isCardSuppressed` / ongoing effect 消费。 | 宿主能力被压制，附着行动在目标随从上；移除后压制消失。 | 单测“两张诅咒牌压制 / 恢复”；E2E“牧师监禁诅咒从真实手牌入口手动选择对手随从并附着”。 | 无 | `passed` |
| 无用诅咒 / `munchkin_clerics_curse_of_uselessness` | 作为持续行动附着到任意随从，宿主力量不计入基地力量；移除后力量重新计入。 | 附着行动静态定义 + `getTotalEffectivePowerOnBase` 消费。 | 宿主仍在基地但对基地总力量贡献归零；移除后恢复。 | 单测“两张诅咒牌压制 / 恢复”；E2E“牧师无用诅咒从真实手牌入口手动选择对手随从并排除基地力量”。 | 无 | `passed` |
| 好习惯 / `munchkin_clerics_good_habits` | 打出后让当前所有基地的随从本回合 +1；其它保护规则仍应限制受影响对象；回合结束清理临时力量。 | onPlay handler + temp power modifier + TURN_ENDED 清理。 | 合法随从获得临时力量，受保护随从不被对手行动影响，回合结束临时修正归零。 | 单测“好习惯影响当前所有基地的仆从，并在回合结束清理”；E2E“牧师好习惯从真实手牌入口遵守呆瓜兽人行动保护”。 | 无 | `passed` |
| 加入团队 / `munchkin_clerics_join_the_club` | 打出时手动选择一个基地，只给该基地现有随从本回合 +1；其它基地不应增加力量。 | onPlay handler + playNeedsBase 目标基地消费。 | 目标基地随从获得临时力量，非目标基地保持原值。 | 单测“加入团队只给目标基地的现有仆从增加临时力量”；E2E“牧师加入团队从真实手牌入口先高亮基地再手动选择目标基地”。 | 无 | `passed` |
| 解除诅咒 / `munchkin_clerics_remove_curse` | 打出时选择场上基地或随从身上的一个附着行动并摧毁；候选只包含附着行动，单候选也必须手选。 | onPlay handler + `munchkin_clerics_remove_curse_action` interaction。 | 被选附着行动离场进入拥有者弃牌堆，未选附着行动保留。 | 单测“解除诅咒只显示基地或仆从身上的附着行动”；E2E“牧师解除诅咒从真实行动卡入口手动选择场上附着行动”。 | 无 | `passed` |
| 回忆祷词 / `munchkin_clerics_word_of_recall` | 每个其他玩家弃牌堆随机展示一张行动；玩家选择其中一张作为额外行动，或选择不打出；未选牌仍留在原弃牌堆。 | onPlay handler + `munchkin_clerics_word_of_recall_action` interaction + immediate extra action。 | 选中行动转入当前玩家手牌并开放即时额外行动；未选行动保持原归属；永久行动上限不增加。 | 单测“回忆祷词每个其他玩家随机展示一张行动”；E2E“牧师回忆祷词从其他玩家弃牌堆手动选择一张行动作为额外行动”。 | 无 | `passed` |
| 圣洁酒店 / `base_hotel_of_holiness` | 计分后逐张手动选择此基地上的随从，按选择顺序放到各自拥有者牌库顶；之后正常推进，当前玩家回顶牌可被下一抽牌步骤抽入手牌。 | base afterScoring ability + `munchkin_clerics_hotel_of_holiness_minion` interaction。 | 基地随从清空；非当前玩家目标留在牌库顶；当前玩家目标先回顶再被正常抽牌流程收入手牌。 | 单测“圣洁酒店逐张手动选择顺序”；E2E“牧师圣洁酒店在计分后逐张手动选择随从顺序并回各自牌库顶”。 | 无 | `passed` |
| 抓鬼 / `base_whack_a_ghoul` | 亡灵怪物被打到此基地时自动放回怪物牌库底，不发放宝藏；普通怪物不受影响。 | Munchkin monster played 后处理 + `MUNCHKIN_MONSTER_TO_DECK_BOTTOM` 归约。 | 亡灵怪物离开基地并进入怪物牌库底；普通怪物保留在基地；怪物弃牌堆和玩家手牌不被误改。 | 单测两条抓鬼事件链；E2E“牧师抓鬼从真实法师天赋入口拦截亡灵怪物并保留普通怪物”。 | 无 | `passed` |

## 负向断言与生命周期证据

| 对象 / 链路 | 负向断言或不应发生什么 | 生命周期 / 无残留证据 |
| --- | --- | --- |
| 资深修士 | 移走的随从不应被同一座计分基地后续清场弃置；目标基地力量不能再次触发第二座基地计分。 | 新增完整计分响应窗口领域回归：进入 afterScoring reaction session、选择资深修士、选择随从、选择基地、继续计分到 `finalState`；最终移动随从留在目标基地，源资深修士进入弃牌堆。 |
| 圣临者 / 回忆祷词 | 可选效果必须有跳过按钮；选择跳过或不打出时不应自动改动弃牌堆、牌库或永久行动上限。 | 单测覆盖跳过分支；E2E 覆盖可见按钮和点击后的流程收口。 |
| 特纳 / 解除诅咒 / 圣洁酒店 | 单候选阶段也不得自动替玩家选择；二选一和逐张顺序选择必须由玩家点击确认。 | 单测断言 `autoResolveIfSingle=false`；E2E 截图显示候选卡面 / 随从本体 / 基地本体可见，并由真实点击推进。 |
| 监禁诅咒 / 无用诅咒 | 附着牌移除后不应永久压制宿主，也不应永久排除宿主力量。 | 单测用 `ONGOING_DETACHED` 事件验证压制和力量贡献恢复。 |
| 好习惯 / 加入团队 | 临时力量不应跨回合保留；加入团队不应影响非目标基地。 | 单测验证 TURN_ENDED 后清理；E2E 验证目标基地与非目标基地差异。 |
| 抓鬼 | 亡灵回牌库底不应发放宝藏；普通怪物不应被抓鬼移走。 | 单测覆盖怪物牌库、怪物弃牌堆和玩家手牌；E2E 两次召唤分别覆盖亡灵和普通怪物。 |

## 共享影响与代表链依据

- 判等依据：本轮不以单个对象代表整派系；牧师 14 个对象均有独立对象行，且完整牧师 E2E 逐条覆盖真实入口。
- 共享影响：本轮未改 Munchkin 公共宝藏 / 怪物基础实现，只修正牧师 E2E 夹具和断言，并补资深修士计分窗口领域回归；公共牌堆整体 closeout 另由对应公共牌堆证据承担。
- 状态影响：`munchkin_clerics` 只从“实施中”状态表移除；其它仍在状态表内的派系不随本文件改变。
- 配置审查影响：派系选择仍显示牧师，配置审查表将牧师实现状态显示为 `configured`。

## 当前边界

| 条目 | 分类 | 是否阻塞当前规则实现 | 是否阻塞本次收口口径 | 当前范围裁定 | 最小补救 |
| --- | --- | --- | --- | --- | --- |
| Munchkin 其它普通派系 | `非阻塞扩展` | 否 | 否 | 当前范围外；本轮只取消牧师“实施中”。 | 按状态表逐个派系继续对象级审计。 |
| 公共宝藏 / 怪物牌堆整体 closeout | `非阻塞扩展` | 否 | 否 | 当前范围外；牧师只引用必要的怪物触发和公共牌堆基础链。 | 进入统一 closeout 时单独补公共牌堆总矩阵。 |
| 服务器资源重新上传与公开 URL 哈希回查 | `非阻塞扩展` | 否 | 否 | 当前范围外；本文只证明本地玩法、UI 入口和实施状态。 | 发布任务中按资源链执行。 |
| 旧 Munchkin 总账仍写牧师 `in_progress` | `审计留档缺口` -> 已补齐 | 否 | 是，补齐前会传播旧状态 | 当前范围内，已原地回写。 | 已追加 2026-09-08 状态回写并更新 S0 / 普通 8 派系牧师行。 |

## 验证证据

- 命令：`node scripts/infra/vitest-cli-safe.mjs run src/games/smashup/__tests__/abilities/munchkin-clerics.test.ts --configLoader native --pool forks --no-file-parallelism --maxWorkers 1`
- 结果：`1 file / 15 tests passed`。
- 证明了什么：牧师 12 张牌 + 2 个基地的对象级最终状态、可选 / 跳过 / 单候选手选、计分响应生命周期和抓鬼怪物归还链路均有行为证据。
- 没有证明什么：不证明 Munchkin 其它派系或公共宝藏 / 怪物整体验收完成。
- 命令：`node scripts/infra/run-e2e-single.mjs default e2e/smashup/smashup-munchkin-monster-treasure-ui.e2e.ts "牧师" --project=chromium`
- 结果：`14 passed`。
- 证明了什么：牧师 14 条真实入口链全部通过，覆盖玩家从手牌、场上天赋、持续行动来源、计分响应窗口和基地能力完成选择与收口。
- 没有证明什么：不证明移动端逐对象专项审美审计、生产资源发布或 Munchkin 整扩展统一收口。
- 截图证据：本轮截图目录为 `D:\gongzuo\webgame\BoardGame\test-results\evidence-screenshots\smashup\smashup-munchkin-monster-treasure-ui.e2e\牧师*\`，14 个当前运行目录合计覆盖抓鬼、解除诅咒、红衣主教、光盘、好习惯、加入团队、监禁诅咒、无用诅咒、资深修士、特纳、圣临者、垃圾处理、圣洁酒店和回忆祷词。
- AI 图面抽检：已打开核验 `牧师-抓鬼-召唤亡灵时手动选择弃牌.jpg`、`牧师-资深修士-手动选择另一个己方随从.jpg`、`牧师-圣洁酒店-按选择顺序回牌库顶并完成正常抽牌.jpg`。肉眼结论：候选卡面 / 随从本体 / 基地收口图清楚，提示层没有遮挡目标，公共怪物 / 宝藏小牌仍在牌库旁，未出现中央重复源卡或空交互。
- 命令：`node scripts/infra/vitest-cli-safe.mjs run src/games/smashup/__tests__/munchkinIntake.test.ts src/games/smashup/__tests__/configReviewAdapter.test.ts --configLoader native --pool forks --no-file-parallelism --maxWorkers 1`
- 结果：本轮摘牌后复跑通过。
- 证明了什么：牧师在选择页仍可见，但不再被派系选择和配置审查标记为“实施中”。
- 命令：`npm run audit:evidence:selfcheck -- evidence/smashup/2026-09-08-munchkin-clerics-closeout.md`
- 结果：本 evidence 自检通过。
- 证明了什么：证据文档包含范围、结论等级、权威来源、原子语义、验证证据、共享影响、旧 evidence 回写和当前边界。

## 修订 / 对账记录

- 旧文档路径：`evidence/smashup/munchkin-new-faction-flow-audit-2026-08-01.md`
- 旧结论：旧总账 S0 牧师行仍保持 `in_progress`，早期段落也写过牧师只有解除诅咒代表链。
- 变化原因：当前工作区已补齐牧师 14 个对象的行为测试和真实入口 E2E，本轮又修正资深修士、抓鬼、圣洁酒店三条验证链。
- 替代旧结论的新证据：本文 + 上述完整牧师 Vitest / E2E / 状态回归测试 / 截图抽检。
- 新结论：牧师本地玩法对象级审计当前范围已收口；`munchkin_clerics` 已从实施中派系列表移除。
- 是否需要修改旧文档正文中的误导行：已在旧文档顶部追加状态回写并更新 S0 牧师行和普通 8 派系牧师行；历史推进段落保留，不删除。

## 对外汇报口径

- 允许说：本轮完成 Munchkin 牧师这个派系的本地玩法对象级审计，并取消 `munchkin_clerics` 的“实施中”状态。
- 允许说：牧师 12 张牌 + 2 个基地已有对象级行为测试和 14 条真实入口 E2E；资深修士、圣洁酒店、回忆祷词、抓鬼等高风险链路包含生命周期或负向断言。
- 禁止说：Munchkin 新扩展整体完成。
- 禁止说：Munchkin 其它实施中派系已经取消。
- 禁止说：公共宝藏 / 怪物牌堆已经单独整体 closeout。
- 禁止说：服务器资源主源已重新发布并通过公开 URL 回查。
