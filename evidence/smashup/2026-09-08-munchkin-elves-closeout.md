# 大杀四方 Munchkin 木精灵对象级审计收口

## 基本信息

- 对象：Smash Up / 大杀四方 `munchkin_elves`（Munchkin 木精灵）
- 日期：2026-09-08
- 作者：Codex
- 文档类型：`closeout`
- 关联旧文档：`evidence/smashup/munchkin-new-faction-flow-audit-2026-08-01.md`

## 审计范围

- 本轮覆盖：木精灵 12 张牌 + 2 个基地，即 `src/games/smashup/data/factions/munchkin.ts` 中 `MUNCHKIN_ELVES_CARDS` 和 `MUNCHKIN_ELVES_BASES` 的完整对象清单。
- 本轮覆盖的规则链路：反应放置力量指示物、天赋抽牌、控制权交换、同基地对手临时加力、按玩家数抽牌、重洗弃牌堆后抽牌、计分前 VP 换取与计分后 VP 转移、跨玩家临时力量选择、计分前移动、手牌交换、附着行动天赋移动、基地动态力量和基地目标玩家抽牌。
- 本轮目标入口 / 环境：本地工作区 `D:\gongzuo\webgame\BoardGame`；领域测试覆盖最终权威状态；Playwright 真实入口 E2E 覆盖玩家从手牌、场上天赋、附着行动卡本体、计分前响应窗口、计分后响应窗口和基地响应窗口进入并完成交互。
- 明确不在本轮范围内：Munchkin 其它普通派系、公共宝藏牌堆逐卡最终 closeout、公共怪物牌堆整体 closeout、Munchkin 整扩展统一 closeout、服务器资源重新上传 / 公开 URL 哈希回查。

## 审计自检表

| 自检项 | 状态 | 证据 |
| --- | --- | --- |
| 对象范围 | `passed` | 木精灵 12 张牌 + 2 个基地已在本文完整列行；旧 Munchkin 总账对象矩阵同步回写。 |
| 真相源状态 | `passed` | 主真相源为 Munchkin 已锁规则图、图片合同表与当前 `munchkin.ts` 静态定义；本轮没有新增第二份规则来源。 |
| 原子语义断言 | `passed` | 本文逐对象重列触发时机、主体、目标、选择权、最终状态和负向边界。 |
| 实现消费链 | `passed` | `abilities/munchkin_elves.ts` 的 handler / interaction / trigger / base ability 均被对应测试消费。 |
| 最终权威结果 | `passed` | `munchkin-elves.test.ts` 14 个用例覆盖手牌、牌库、弃牌堆、控制者、基地随从、临时力量清理、力量指示物、VP、计分清场和交互无残留。 |
| 交互真实入口 | `passed` | `smashup-munchkin-monster-treasure-ui.e2e.ts` 的木精灵筛选本轮 14/14 通过，覆盖手牌打出、场上天赋、附着行动来源、计分前后响应和基地能力。 |
| 验证证据 | `passed` | 本轮复跑完整木精灵 Vitest、完整木精灵 E2E、状态相关 intake/config 审查测试和 evidence 自检；测试语义对账写清最终状态断言。 |
| 共享影响与代表链依据 | `passed` | 判等依据：本文件不使用单个代表链外推；14 个木精灵对象全部有直接对象行、行为断言和真实入口证据。 |
| 缺口分类与范围裁定 | `passed` | 本轮范围内无功能实现阻塞、语义不一致或必要验证缺口；范围外对象在“当前边界”中列明。 |
| 旧 evidence / 旧结论回写 | `passed` | 旧 Munchkin 总账顶部、S0 木精灵行和普通 8 派系木精灵行均同步回写为当前单派系 closeout 口径。 |
| 残余范围声明 | `passed` | 当前边界写明只取消木精灵“实施中”，不扩大为 Munchkin 整扩展完成或公共宝藏 / 怪物牌堆整体完成。 |

## 结论等级

结论等级：`当前范围已收口`。

判定理由：木精灵当前锁定范围内的 14 个对象都有规则子句、实现消费点、最终权威状态和真实入口证据；本轮将 `munchkin_elves` 从 `SMASHUP_FACTION_IMPLEMENTATION_STATUS` 移除，并补状态回归，确保派系选择和配置审查不再把木精灵显示为“实施中”。

## 权威来源

- 主真相源：`D:\gongzuo\webgame\gameasset\Smash Up! by Mervil (2833984701)-汉化图\新6扩小白\木精灵\*.jpg/png`，旧 Munchkin 总账已记录完整规则子句。
- 图片合同证据：`evidence/smashup/munchkin-intake-atlas-contract-2026-08-01.md` 已登记木精灵手牌图集、基地图集、完整单卡主裁图 / 裁图清单和 SHA256 前缀。
- 实现源：`src/games/smashup/data/factions/munchkin.ts` 与 `src/games/smashup/abilities/munchkin_elves.ts`。
- 状态源：`src/games/smashup/domain/ids.ts` 的 `SMASHUP_FACTION_IMPLEMENTATION_STATUS`。
- 旧审计来源：`evidence/smashup/munchkin-new-faction-flow-audit-2026-08-01.md`。
- 合同状态：`locked`。本轮没有发现卡名、数量、图集索引、能力标签或基地元信息需要回到 intake 重新裁定。

## 原子语义与实现消费

| 对象 | 原子语义断言 | 实现消费点 | 最终权威结果 | 真实入口 / 验证证据 | 缺口分类 | 结论 |
| --- | --- | --- | --- | --- | --- | --- |
| 精灵斗士 / `munchkin_elves_fae_fighter` | 对手在同基地打出随从后，可让精灵控制者手动选择一个己方随从；新打出的对手随从和被选己方随从各放置 1 个力量指示物；单候选也不得自动代选。 | onMinionPlayed trigger + reaction session + `munchkin_elves_fae_fighter_choose_target` interaction handler。 | 对手新随从和被选己方随从各 `powerCounters +1`；反应窗口和交互收口。 | 单测“精灵斗士在对手打出随从后让双方手动完成力量指示物选择”；E2E“木精灵精灵斗士在对手打出随从后把反应选择交给精灵控制者”。 | 无 | `passed` |
| 优雅贵族 / `munchkin_elves_lord_of_the_prance` | 天赋阶段选择另一位玩家；被选玩家抽 1 张，你自己也抽 1 张；只有一个目标玩家时仍手动选择。 | board talent handler + `munchkin_elves_lord_of_the_prance_choose_player` interaction handler。 | 施放者和被选玩家各自从牌库抽牌到手牌，天赋使用状态落地。 | 单测“优雅贵族只有一个目标时仍停在手动选择，并让双方各抽一张”；E2E“木精灵优雅贵族天赋手动选择另一位玩家并让双方各抽一张”。 | 无 | `passed` |
| 花之子 / `munchkin_elves_flower_child` | 打出后可选择另一位玩家，再选择该玩家同基地力量 3 或更少随从；花之子与目标随从交换控制权，并记录互相关联直到离场。 | onPlay handler + `munchkin_elves_flower_child_choose_player` / `_choose_minion` 两段 interaction handler + control change events。 | 花之子控制者变为目标玩家；被选低力随从控制者变为施放者；高力随从不进入候选。 | 单测“花之子先选玩家，再选力量不超过3的随从，并交换控制权”；E2E“木精灵花之子先选玩家再选随从”。 | 无 | `passed` |
| 精灵帮助大师 / `munchkin_elves_elf_help_guru` | 天赋只给同基地其他玩家的随从本回合 +1；不影响自己随从，也不影响其它基地随从。 | board talent handler + temp power modifier。 | 同基地对手随从有效力量 +1；自己随从和其它基地对手随从不变；临时力量按回合清理合同消费。 | 单测“精灵帮助大师只给同基地其他玩家的随从临时加1力量”；E2E“木精灵精灵帮助大师天赋只给同基地对手随从临时加力”。 | 无 | `passed` |
| 在你之后 / `munchkin_elves_after_you` | 每个其他玩家各抽 1 张；你按游戏中玩家人数抽牌，玩家数包含你自己。 | onPlay handler + `buildStandardDrawEvents`。 | 多名玩家的手牌分别增加对应数量；施放者按当前玩家数抽牌。 | 单测“在你之后按游戏人数让自己抽牌，并让每个其他玩家各抽一张”；E2E“木精灵在你之后真实按玩家人数抽牌，并让另一位玩家各抽一张”。 | 无 | `passed` |
| 舞动之根 / `munchkin_elves_dancing_root` | 所有玩家将各自弃牌堆重洗进牌库；之后你从最新牌库抽 1 张；空弃牌堆不应制造假事件。 | onPlay handler + `DECK_RESHUFFLED` / draw events。 | 有弃牌的玩家弃牌堆清空并进入牌库顺序；施放者抽牌进入手牌。 | 单测“舞动之根先重洗每位玩家，再从最新牌库抽牌”；E2E“木精灵舞动之根真实重洗每位玩家弃牌并从最新牌库抽一张”。 | 无 | `passed` |
| 援手 / `munchkin_elves_helping_hands` | 计分前可打出；先手动选择另一位玩家，再手动选择己方随从；被选玩家在该基地 +2，己方随从 -2 且最低为 0；若被选玩家赢得该基地，计分后可从其处获得 1 VP。 | beforeScoring special + `munchkin_elves_helping_hands_choose_player` / `_choose_minion` / afterScoring armed trigger / `_choose_vp` interaction handlers。 | 目标玩家基地力量 +2；己方随从力量降低到最低 0；计分后 VP 可由目标玩家转给施放者；计分响应和后续玩家响应均收口。 | 单测“援手计分前先手动选择玩家和己方随从，并记录计分后 VP 选择”；E2E“木精灵援手在计分前手动选择玩家和己方随从，并在赢家确认后手动选择-VP”。 | 无 | `passed` |
| 力量训练 / `munchkin_elves_pumping_iron` | 先选择另一位玩家；该玩家手动选择自己的一个随从本回合 +2；你再手动选择自己的一个随从本回合 +3。 | onPlay handler + `munchkin_elves_pumping_iron_choose_player` / `_choose_other_minion` / `_choose_self_minion` interaction handlers。 | 目标玩家被选随从临时力量 +2；施放者被选随从临时力量 +3；两段交互分别由对应玩家承接。 | 单测“力量训练让两位玩家分别手动选目标，效果分别为+2和+3”；E2E“木精灵力量训练按玩家、对方随从、己方随从顺序手动选择”。 | 无 | `passed` |
| 逃跑吧！ / `munchkin_elves_run_away` | 计分前可打出；先手动选择该基地己方随从；若同基地有其他玩家随从，再手动选择一个其他玩家随从和目标基地，把两者移到该基地；无对手目标时不排空第二步。 | beforeScoring special + `munchkin_elves_run_away_choose_own_minion` / `_choose_other_minion` / `_choose_destination` interaction handlers。 | 有目标时两个随从移动到手动选择的基地；无合法对手目标时交互直接收口，不出现空对手选择。 | 单测“逃跑吧！没有对手随从时不会排出空的第二步选择”；E2E“木精灵逃跑吧！只有己方随从时手动选择后不产生空的对手随从选择”。 | 无 | `passed` |
| 赶紧逃跑吧！ / `munchkin_elves_run_away_more` | 计分前可打出；先手动选择另一个基地，再选择任意数量己方随从移动过去；允许空选；计分已开始时空选仍按已锁定计分合同继续清场。 | beforeScoring special + `munchkin_elves_run_away_more_choose_destination` / `_choose_minions` interaction handlers + existing scoring lock contract。 | 空选路径不移动随从且本次已开始计分继续清场；选择路径将被选己方随从移动到目标基地。 | 单测“赶紧逃跑吧允许多选0个，并且多选1个时移动到手动选择的基地”；E2E“木精灵赶紧逃跑吧先选基地再多选随从，并允许空选”。 | 无 | `passed` |
| 贸易 / `munchkin_elves_trade` | 选择另一位有手牌玩家；从该玩家手牌随机获得 1 张；把正在打出的“贸易”本卡放进目标玩家手牌；本回合获得 1 次额外行动。 | onPlay handler + `munchkin_elves_trade_choose_player` interaction handler + card transfer events + extra action grant。 | 施放者得到目标玩家随机手牌并保留原手牌；目标玩家得到贸易本卡；额外行动额度增加。 | 单测“贸易把贸易本卡交给目标玩家，而不是随机交出自己的普通手牌”；E2E“木精灵贸易把正在打出的行动卡交给目标玩家，并把对方手牌换回己方”。 | 无 | `passed` |
| 旅行精灵 / `munchkin_elves_traveling_elf` | 打出到自己的随从身上；附着行动天赋从卡本体打开；手动选择另一个基地后移动宿主，附着行动随宿主一起移动。 | ongoing attachment definition + board talent handler + `munchkin_elves_traveling_elf_choose_destination` interaction handler + move events。 | 宿主离开原基地并进入目标基地；附着行动仍挂在宿主身上；交互收口。 | 单测“旅行精灵的天赋移动宿主，并让附着行动随宿主一起移动”；E2E“木精灵旅行精灵从附着卡本体打开天赋并移动宿主”。 | 无 | `passed` |
| 援助山谷 / `base_helpers_hollow` | 基地破坏点 17、VP 3/2/1、2 怪物；每个玩家的回合期间，其他玩家在这里的随从 +1，当前回合玩家自己的随从不加。 | base static definition + base power modifier consumer。 | 当前玩家切换时，同基地双方力量动态反转：非当前玩家获得 +1，当前玩家为 0。 | 单测“援助山谷按当前回合玩家给其他玩家随从+1，树屋保留两段手动交互”；E2E“木精灵援助山谷随当前回合玩家动态排除自己并给其他玩家加力”。 | 无 | `passed` |
| 树屋 / `base_treehouse` | 基地破坏点 15、VP 4/2/1、2 怪物；玩家在此基地打出随从后，可手动选择另一位玩家；目标玩家再手动选择抽 1 张或跳过。 | base static definition + onMinionPlayed base ability + `base_treehouse_choose_player` / `_choose_draw` interaction handlers。 | 第一段由打出随从玩家选择目标玩家；第二段由目标玩家决定抽牌或跳过；选择抽牌时目标玩家手牌增加。 | 单测“援助山谷按当前回合玩家给其他玩家随从+1，树屋保留两段手动交互”；E2E“木精灵树屋先选另一位玩家，再由目标玩家手动选择抽牌或跳过”。 | 无 | `passed` |

## 负向断言与生命周期证据

| 对象 / 链路 | 负向断言或不应发生什么 | 生命周期 / 无残留证据 |
| --- | --- | --- |
| 精灵斗士 | 己方自己打出随从不应触发；触发后不得让对手替精灵控制者选择；单候选也不得自动代选。 | 领域测试覆盖 reaction session 选择精灵斗士后再进入己方随从选择；E2E 覆盖对手视角打出、玩家 0 视角响应和双方力量指示物落位。 |
| 花之子 | 不应选择力量超过 3 的随从；控制交换必须绑定花之子和目标随从，不能只改一边控制者。 | 领域测试断言高力随从不进候选、花之子与目标随从控制者互换并记录关联。 |
| 力量训练 | 目标玩家和施放者的选择权不能混在同一页面；+2 和 +3 不能打到同一默认对象或错玩家对象。 | E2E 使用两个玩家页面验证 P2 选择自己的随从后，再回到 P1 选择己方随从；截图显示真实随从本体高亮。 |
| 逃跑吧！ | 同基地无其他玩家随从时，不应出现空的“选择另一位玩家随从”第二步。 | 单测和真实入口 E2E 都断言选择己方随从后交互源清空。 |
| 赶紧逃跑吧！ | 空选不应移动任何随从；已进入计分流程后，不应把计分前行动导致的力量变化误判为取消本次计分。 | 单测覆盖空选与单选；E2E 空选路径断言原基地按已开始计分清场，选择路径断言被选随从移动到目标基地。 |
| 援手 | 计分前 +2/-2 不能跳过玩家选择；计分后 VP 转移不能在被选玩家未获胜或无 VP 时错误触发。 | 领域测试覆盖 armed afterScoring trigger 和 VP 转移；E2E 覆盖计分前两段选择、计分后 VP 选择、后续玩家响应让过和最终 VP。 |
| 贸易 | 不应把施放者随机手牌交给目标玩家；目标玩家必须收到正在打出的贸易本卡。 | 单测直接断言贸易本卡进入目标玩家手牌；E2E 在玩家 1 页面截图确认收到贸易行动卡。 |
| 旅行精灵 | 移动宿主时不应把附着行动留在原基地或丢进弃牌堆；附着行动天赋必须从场上卡本体承接。 | 单测断言附着行动随宿主移动；E2E 截图覆盖附着卡本体、目标基地选择和移动后宿主仍带附着行动。 |
| 树屋 | 目标玩家抽牌 / 跳过页面不应重复显示树屋大卡，也不应由施放者替目标玩家选择。 | E2E 使用目标玩家页面截图确认按钮为“抽一张牌 / 跳过”，并在选择抽牌后断言目标玩家手牌新增。 |

## 共享影响与代表链依据

- 判等依据：本轮不以单个对象代表整派系；木精灵 14 个对象均有独立对象行，且完整木精灵 E2E 逐条覆盖真实入口。
- 共享影响：本轮未改 Munchkin 公共宝藏 / 怪物基础实现，只修正木精灵 E2E 夹具和断言，使其对齐当前 reaction session、计分锁定和真实可见点击载体。
- 状态影响：`munchkin_elves` 只从“实施中”状态表移除；其它仍在状态表内的派系不随本文件改变。
- 配置审查影响：派系选择仍显示木精灵，配置审查表将木精灵实现状态显示为 `configured`。

## 当前边界

| 条目 | 分类 | 是否阻塞当前规则实现 | 是否阻塞本次收口口径 | 当前范围裁定 | 最小补救 |
| --- | --- | --- | --- | --- | --- |
| Munchkin 其它普通派系 | `非阻塞扩展` | 否 | 否 | 当前范围外；本轮只取消木精灵“实施中”。 | 按状态表逐个派系继续对象级审计。 |
| 公共宝藏 / 怪物牌堆整体 closeout | `非阻塞扩展` | 否 | 否 | 当前范围外；木精灵只引用必要的公共牌堆基础显示和计分链。 | 进入统一 closeout 时单独补公共牌堆总矩阵。 |
| 移动端逐对象图面审计 | `非阻塞扩展` | 否 | 否 | 当前木精灵对象级本地玩法和桌面真实入口已收口；移动端逐对象专项图面不在本轮取消“实施中”的必要条件内。 | 后续按移动端专项继续抽测或补逐对象截图。 |
| 服务器资源重新上传与公开 URL 哈希回查 | `非阻塞扩展` | 否 | 否 | 当前范围外；本文只证明本地玩法、UI 入口和实施状态。 | 发布任务中按资源链执行。 |
| 旧 Munchkin 总账仍写木精灵 `in_progress` | `审计留档缺口` -> 已补齐 | 否 | 是，补齐前会传播旧状态 | 当前范围内，已原地回写。 | 已追加 2026-09-08 状态回写并更新 S0 / 普通 8 派系木精灵行。 |

## 验证证据

- 命令：`node scripts/infra/vitest-cli-safe.mjs run src/games/smashup/__tests__/abilities/munchkin-elves.test.ts --configLoader native --pool forks --no-file-parallelism --maxWorkers 1`
- 结果：`1 file / 14 tests passed`。
- 证明了什么：木精灵 12 张牌 + 2 个基地的对象级最终状态、跨玩家手动选择、可选 / 跳过 / 空选、单候选手选、计分前后响应生命周期、基地动态力量和附着行动移动均有行为证据。
- 没有证明什么：不证明 Munchkin 其它派系或公共宝藏 / 怪物整体验收完成。
- 命令：`node scripts/infra/run-e2e-single.mjs default e2e/smashup/smashup-munchkin-monster-treasure-ui.e2e.ts "木精灵" --project=chromium`
- 结果：`14 passed`。
- 证明了什么：木精灵 14 条真实入口链全部通过，覆盖玩家从手牌、场上天赋、附着行动卡本体、计分前响应窗口、计分后响应窗口和基地能力完成选择与收口。
- 没有证明什么：不证明移动端逐对象专项审美审计、生产资源发布或 Munchkin 整扩展统一收口。
- 截图证据：本轮截图目录为 `D:\gongzuo\webgame\BoardGame\test-results\evidence-screenshots\smashup\smashup-munchkin-monster-treasure-ui.e2e\木精灵*\`；跨玩家页面补充截图位于 `D:\gongzuo\webgame\BoardGame\test-results\evidence-screenshots\smashup\munchkin-new-faction-flow\`。
- AI 图面抽检：已打开核验 `木精灵-援手-计分后手动选择是否获得VP.jpg`、`木精灵-赶紧逃跑吧-空选后按已开始计分清场.jpg`、`木精灵-精灵斗士-双方获得力量指示物.jpg`、`木精灵-树屋-手动选择另一位玩家.jpg`、`木精灵-援助山谷-玩家0回合.jpg`、`树屋-P2-手动选择抽牌或跳过.png`、`树屋-P2-选择抽牌后.png`、`援手-P1-后续响应手动让过.png`、`精灵斗士-P0-手动选择己方随从.png`、`力量训练-P2-对方手动选择随从.png`。肉眼结论：候选玩家、候选随从、VP 按钮、跳过按钮、力量指示物和清场状态都落在真实牌桌对象上；提示层没有遮挡目标；没有中央重复源卡或空交互。
- 命令：`node scripts/infra/vitest-cli-safe.mjs run src/games/smashup/__tests__/munchkinIntake.test.ts src/games/smashup/__tests__/configReviewAdapter.test.ts --configLoader native --pool forks --no-file-parallelism --maxWorkers 1`
- 结果：本轮摘牌后复跑通过。
- 证明了什么：木精灵在选择页仍可见，但不再被派系选择和配置审查标记为“实施中”。
- 命令：`npm run audit:evidence:selfcheck -- evidence/smashup/2026-09-08-munchkin-elves-closeout.md`
- 结果：本 evidence 自检通过。
- 证明了什么：证据文档包含范围、结论等级、权威来源、原子语义、验证证据、共享影响、旧 evidence 回写和当前边界。

## 修订 / 对账记录

- 旧文档路径：`evidence/smashup/munchkin-new-faction-flow-audit-2026-08-01.md`
- 旧结论：旧总账 S0 木精灵行仍保持 `in_progress`，早期段落也写过木精灵只有代表链，不能作为整派系收口。
- 变化原因：当前工作区已补齐木精灵 14 个对象的行为测试和真实入口 E2E，本轮又修正援手、赶紧逃跑吧、精灵斗士等高风险 E2E 承接与断言。
- 替代旧结论的新证据：本文 + 上述完整木精灵 Vitest / E2E / 状态回归测试 / 截图抽检。
- 新结论：木精灵本地玩法对象级审计当前范围已收口；`munchkin_elves` 已从实施中派系列表移除。
- 是否需要修改旧文档正文中的误导行：已在旧文档顶部追加状态回写并更新 S0 木精灵行和普通 8 派系木精灵行；历史推进段落保留，不删除。

## 对外汇报口径

- 允许说：本轮完成 Munchkin 木精灵这个派系的本地玩法对象级审计，并取消 `munchkin_elves` 的“实施中”状态。
- 允许说：木精灵 12 张牌 + 2 个基地已有对象级行为测试和 14 条真实入口 E2E；援手、赶紧逃跑吧、精灵斗士、树屋等高风险链路包含生命周期或负向断言。
- 禁止说：Munchkin 新扩展整体完成。
- 禁止说：Munchkin 其它实施中派系已经取消。
- 禁止说：公共宝藏 / 怪物牌堆已经单独整体 closeout。
- 禁止说：服务器资源主源已重新发布并通过公开 URL 回查。
