# Mage Wars 用户纠正覆盖账本

> 角色：`drift-check / evidence`。本文件只把用户在 Mage Wars PC Open Design 设计稿线上反复指出的纠正，映射到规则证据、项目设计合同和送验前检查项。它不是独立规范来源；新增硬规则必须回写到 `.spec/knowledge/standards/ui-change-gates.md`、`.spec/skills/ui-design-pipeline/SKILL.md`、`.spec/skills/ui-audit-loop/SKILL.md` 或 `.spec/skills/mage-wars-ui-design-memory/SKILL.md` 后，再由本账本引用。

## 使用方式

- 下一版 UI 设计、Open Design artifact、导出 PNG 或 AI 图面核验前，必须逐行复核本账本。
- 任一行的 `必须检查` 在整屏图里无法确认时，当前稿只能是 `REVISE` 或 `blocked`，不得打开给用户人工验收。
- 用户新增纠正时，先判断本账本是否已有等价覆盖；没有覆盖就补本账本或先回 canonical-source 补规则，再重审图。
- 本账本不允许替代规则书、素材合同或专项 skill；它只防止漏读、漏检和把同一错误反复带入下一稿。

## 覆盖矩阵

| 用户纠正 / 意图 | 现实问题 | 真相源 / 已落点 | 必须检查 | 当前覆盖 |
| --- | --- | --- | --- | --- |
| 不要凭直觉设计，一切基于规则 | 先画布局后找理由，导致规则对象和隐藏信息错 | `ui-design-pipeline` 设计启动硬门禁；`step1-runtime-board-saturated-ui-design.md` 规则到界面结论 | 本轮实际读取规则页、法术书合同、字段合同、素材矩阵，并写出三条以上会改变画面的规则结论 | covered |
| 使用 Open Design，不要生图 | 把 Open Design artifact 和 media 生图链混淆 | `ui-design-pipeline` 交付形态裁定；`docs/infra/open-design.md`；设计 README 当前状态 | artifact 元数据必须是 Open Design artifact；不得调用 `od media generate` 或 imagegen | covered |
| 先 UI 设计，再设计稿，再人工验收，再实现 | 设计未批就进真实页面 / E2E / 移动端 | `ui-design-pipeline` UI 设计先于设计稿；`ui-change-gates.md` 0.0C；设计 README 当前状态 | 用户未明确批准前，不启动真实 Board/UI、真实页面 E2E、移动端适配 | covered |
| PC 没好不要管移动端 | 用移动端或运行页截图替代 PC 设计通过 | `ui-design-pipeline` PC 基线先于移动端；`ui-change-gates.md` 0.0C | 当前交付只允许 PC Open Design 设计稿候选；移动端状态必须 blocked | covered |
| 设计稿通过前不能实施 | 把设计候选当实现依据 | `ui-design-pipeline` 设计稿不是实现；设计 README implementation-freeze | 最终汇报必须写明真实实现冻结，等用户批准设计稿 | covered |
| 规则里没有“手牌” | 套用卡牌游戏默认手牌概念 | `mage-wars-ui-design-memory`；`step1-runtime-board-saturated-ui-design.md`；学徒法术书合同 | 可见文案、aria、class、审计和汇报只能用法术书、已计划法术、弃牌堆、隐性结界 | covered |
| 法术书不是底边装饰，当前可支配对象要能看 | 可用法术被缩成不可读小牌或入口 | `mage-wars-ui-design-memory` 法术书裁决；`ui-design-pipeline` 当前可支配对象守恒 | 法术书一页 6 张、单张足够读卡面主体、分类标签左侧、分页贴近牌列 | covered |
| 计划牌大小和法术书一致 | 已计划法术被弱化成角落挂件 | `mage-wars-ui-design-memory` 法术书 / 已计划裁决 | 两张已计划法术与法术书当前页卡面同尺寸，并有独立计划槽 | covered |
| 已计划和已选法术不要重复 | 同一规则对象被画成两个实体 | `ui-design-pipeline` 规则对象实体锚点守恒；设计 README v49 / v50 裁定 | 当前来源只能引用已计划法术实体，不再额外画同名“已选法术”大卡 | covered |
| 卡面已有名字和费用，不要外部复写 | 用 UI chip 重写卡面字段，浪费空间且重复 | `ui-design-pipeline` 卡面字段不复写；`ui-ux.md` 正式素材已含信息不得复读 | 名称、费用、射程、目标、骰数默认由可读卡面承担；外部只补运行态 | covered |
| UI 和卡牌内容不要重复的规范不够硬 | 组牌 / 法术书编辑器仍在卡牌下方、已选列表和校验文案重复卡名、类型、费用或卡面字段，说明旧规则没有明确“卡池编辑器也适用”且缺文本扫描门槛 | `game-ui-design/references/layout-interaction-patterns.md` 卡池 / 组牌 / 法术书编辑器硬门禁；`mage-wars-ui-design-memory` 用户原话反思表 | 法术书构筑稿中，卡外可见 UI 只显示构筑法术点、合法 / 非法原因、选中状态、操作控件和一处唯一数量 owner；不得在卡牌下方或已选区重复法术名、类型、法力费用、射程、目标、骰数和正文。送验前做 DOM 文本扫描并人工复看。 | covered-by-current-design-audit |
| 操作态卡牌也要能放大但不能抢主点击 | 规划态、施法态或目标选择态里，卡牌单击已经承担选牌、施法或选目标；若没有独立放大镜，玩家要么看不了牌，要么单击放大会破坏主流程 | `ui-change-gates.md` 操作态次级检视入口；`mage-wars-ui-design-memory` 用户原话反思表 | 法术书规划态、已计划法术施法态、场上卡和附件卡可选态若已有主规则动作，必须显示独立放大镜或等价入口；E2E 点放大镜打开大图且不增加选中数量 / 不改目标来源，再点卡面进入计划 / 施法 / 目标选择。 | covered-by-runtime-e2e |
| 编辑法术书不应出现席位 / P1 / P2 | 把对局玩家位置放进法术书编辑器主栏，会让玩家误以为法术书编辑在控制先后手或座位，而不是编辑“这本书绑定哪个法师” | `game-ui-design/references/layout-interaction-patterns.md` 玩家位置 / 席位只属于对局设置、所有权归属、先后手或棋盘 lane；`mage-wars-ui-design-memory` 用户原话反思表 | Mage Wars 组书设计稿左栏只显示法术书身份、绑定法师和来源入口；不常驻 P1/P2、玩家一 / 玩家二或席位。若需要应用给某位玩家，只在对局 setup 或提交摘要处理。 | covered-by-current-design-audit |
| 搜索框不应抢主视觉 | 搜索框使用长示例词、占据主栏宽度或被筛选行拉伸成高面板，都会压低卡池主体，违反“卡牌候选可读优先” | `game-ui-design/references/layout-interaction-patterns.md` 搜索 / 筛选是工具，不是主对象；`mage-wars-ui-design-memory` 用户原话反思表 | 搜索框默认紧凑，只显示短 placeholder；筛选按钮和卡牌池承担主操作，搜索不得用长词撑大、不得被拉伸成高面板、不得压缩卡牌可读面积；送验前量宽度和高度。 | covered-by-current-design-audit |
| 组书页状态标签不能写废话 | `排斥成本`、`下一张到上限`、`再加一张`、`排斥示例`、`上限看能力牌` 这类文案只是在命名规则类别，没有告诉玩家具体成本、余量、冲突和下一步，导致玩家仍要猜 | `game-ui-design/references/layout-interaction-patterns.md` 卡池 / 组牌状态标签可行动信息门禁；`mage-wars-ui-design-memory` 用户原话反思表 | 法术池、选中详情、右侧法术书和校验区不得出现空泛类别标签；必须改成 `需 9 点；火焰排斥 x3`、`5/6；再加 1 张封顶`、`4/4；先移除 1 张`、`限定邪术师；当前兽王不可用` 这类可行动信息。送验前文本扫描禁止废话词命中。 | covered-by-current-design-audit |
| 组书页必须有多级筛选 | 只按攻击 / 结界 / 生物 / 魔物 / 装备 / 咒语过滤，无法区分自然、火焰、圣光、黑暗、超魔、原力、治疗等学派 / 元素；反过来，把蝙蝠、手套、靴子、传送门、胸甲等子类型也塞进学派下拉，会把多级筛选做成混乱标签堆；同时漏掉 Hearthstone 有、Mage Wars 卡牌也有的打出法力费用过滤 | `game-ui-design/references/layout-interaction-patterns.md` 多级筛选门禁；配置包 `schoolLine` / `typeLine` / `manaCost` / `rawCost` 数据分布 | 卡池筛选必须分层展示类型、学派 / 元素、等级 / 构筑成本、打出法力费用、合法性 / 冲突、书内 / 未加入；学派层只能含正式学派 / 元素词，子类型如需筛选必须另设低权重入口；搜索框仍保持紧凑工具，不得替代结构化筛选。 | covered-by-runtime-e2e-v18 |
| 法术书清单不能用四格样本冒充完整书 | 兽王标准起始书是 50 个条目 / 67 张，右侧只显示四个格子会把大集合误画成少量样例，无法浏览、定位和修正几十张卡 | `docs/games/mage-wars/rule/standard-starting-spellbooks.md` 标准书数量；`game-ui-design/references/layout-interaction-patterns.md` 大集合承载门禁 | 法术书清单必须显示总张数、条目数、显示范围，并用可滚动 deck list 承载几十张；每行显示法术点、名称、`当前 / 上限` 和成本 / 限制状态。四张冲突卡只能作为“需处理项”，不能作为整本书列表。 | covered-by-current-design-audit |
| xN 是什么鬼，不是已经有 x/y 了吗 | 卡图和清单同时显示数量，或给每张卡下方常驻同权重操作按钮，都会制造多套 owner 和按钮网格，画面比成熟组牌界面更乱 | `game-ui-design/references/layout-interaction-patterns.md` 计数唯一 owner 与卡牌本体点击；`mage-wars-ui-design-memory` 用户原话反思表；Hearthstone 类组牌范式 | 若右侧清单已显示 `当前 / 上限`，卡池卡图、已选缩略图和问题队列不得再显示 `xN`、数量角标、每卡常驻按钮或第二套数量文案；审计必须检查设计稿正文没有 `xN`、`count-badge`，截图中卡池主视觉不是按钮网格。 | covered-by-current-design-audit |
| 卡组限制不止总牌数 | 只显示 `67 / 67 张` 会误导玩家以为组书合法性只看张数，漏掉法师能力牌法术点上限、训练成本、相斥成本、每卡数量上限、限定 / 史诗 / 初级例外 | 规则书第 37 页“法术点上限 / 受训”；第 38 页“同名法术上限 / 法术特性”；`game-ui-design/references/layout-interaction-patterns.md` 构筑合法性门禁；`mage-wars-ui-design-memory` 用户原话反思表 | 顶部容量必须显示法术点 `当前 / 上限`，总张数 / 条目数只能做次级读数；右侧每条必须显示数量 `当前 / 上限` 和本条法术点占用。 | covered-by-current-design-audit |
| 组书页不再内嵌当前法师切换 | 当前已确认流程是 setup 页直接选择法术书；法师只是法术书绑定信息。构筑器里再放一套法师切换，会把训练规则 owner、保存库归属和 P1 / P2 应用目标混在一起 | 规则书第 37 页“能力牌限制”；`game-ui-design/references/layout-interaction-patterns.md` 已绑定 loadout 直接选择与玩家位置边界；`mage-wars-ui-design-memory` 用户原话反思表 | Mage Wars setup 页主对象是法术书库，标准起始书和命名副本同屏同级；组书页只显示选中书绑定的法师上下文和法师详情入口。组书页不得出现第二套法师切换器、P1 / P2 / 席位主控或先后手控件。 | covered-by-current-design-audit |
| 当前法师身份不能多处重复 | v13 同时显示左上法师主缩略图、`当前法师：兽王`、active 法师选项和 `兽王标准书` tab，导致法师身份、构筑来源和预设名称抢同一个身份 owner | `game-ui-design/references/layout-interaction-patterns.md` 所选身份唯一 owner；`mage-wars-ui-design-memory` 用户原话反思表 | 法师身份只由顶部已选法师上下文 / 规则卡入口承载；来源 / 库项不得复写法师名；文本 / DOM 审计确认无可见 `当前法师：兽王`、无 `兽王标准书`、无构筑器内法师切换器。 | covered-by-current-design-audit-v14 |
| 角色 / 法师详情不能没入口，但不能新增一行详情控件 | v15 为补详情入口又新增同级 `详情` 按钮，导致法师身份 owner 被拆成“法师按钮 + 详情按钮”，不符合成熟组牌页由英雄 / 法师本体承接详情的范式 | `game-ui-design/references/layout-interaction-patterns.md` 所选身份详情入口；`mage-wars-ui-design-memory` 用户原话反思表；法师能力牌素材；Summoner Wars 组牌本体点击 / 放大预览不变量 | 默认态只能由已选法师主控本体打开临时详情层；不得出现独立 `详情` 按钮、新行控件、第二张身份卡或内部法师切换器。详情层展示能力牌原图和构筑影响，关闭后回到组书页。 | covered-by-current-design-audit-v16 |
| 新法术书必须从预定义 / 选中书保存命名副本 | 把保存书藏成角落 `DIY 法术书` 小区、用 `暂无命名副本` 空态替代新建入口，或让新书默认从 `空白自组` 开始，会把“选择一份法术书 loadout”和“构筑编辑器工具”拆成两套入口，也违背 Mage Wars 起始法术书作为玩家起点的流程 | `game-ui-design/references/layout-interaction-patterns.md` 预定义配置与命名副本同库模型；`mage-wars-ui-design-memory` 用户原话反思表；Summoner Wars 自定义牌组选择的加号入口 / DIY 身份不变量 | 选书 / setup 页和构筑器都必须显示同一个法术书库：标准起始书 / 预定义书、命名副本和 `+` 新建入口同级；`+` 表示新建未绑定法术书，必须先选择绑定法师，再用该法师标准起始书进入新草稿；已有命名副本可更新原副本，也可在构筑器内另存为新 id；玩家命名副本最多 10 本，数据层拒绝第 11 本，UI / 扫描暴露上限。默认 E2E 不得从空白自组建一张牌冒充法术书。 | covered-by-runtime-e2e |
| 新建魔法书后必须能选择法师 | 把“构筑器不常驻第二套法师切换器”误读成“新建未绑定法术书也不需要选择法师”，会导致 `+` 隐式沿用当前法师，玩家无法在新建流程里决定这本书绑定谁 | `game-ui-design/references/layout-interaction-patterns.md` `+` 新建未绑定配置先选身份；`mage-wars-ui-design-memory` 用户原话反思表；Hearthstone 新 deck 先选 class 的参考不变量 | 选书页 `+`、构筑器顶部 `+`、展开库 `+` 都必须先打开绑定法师候选层；候选层显示四名法师；选择后构筑器 `data-mage-id` 等于玩家选的法师，牌表来自该法师标准起始书；保存后的命名副本 `mageId` 等于玩家选的法师；构筑器默认态仍无常驻法师切换器。 | covered-by-runtime-e2e-v19 |
| 选中法术书不应再命名为当前法术书 | 被高亮 / 选中的库项已经表达正在编辑或正在使用，再把标题、按钮、输入框和说明写成 `当前法术书` / `当前书`，会制造第二个概念 owner，玩家会以为“选中书”和“当前书”是两件事 | `game-ui-design/references/layout-interaction-patterns.md` 选中态复写门禁；`mage-wars-ui-design-memory` 用户原话反思表；Hearthstone 类组牌范式只保留卡池和 deck list 职责，不把选中态另起名 | 可见文案改为 `法术书库`、`法术书清单`、`编辑选中书`、`更新选中副本`、`命名副本名称`、`新建法术书`、`另存新书` 和 `书内`；DOM / E2E 扫描禁止 `当前法术书`、`当前法师法术书库`、`编辑当前书`、`更新当前副本`、`给当前书取名`、`新书从当前书`、`当前书内` 回归。 | covered-by-runtime-e2e |
| 法术点 / 构筑容量只能有一个总体 owner，必须脚本扫描防复发 | v15 顶部容量、右侧清单标题和详情层同时显示 `法术点` 或 `120 / 120`，玩家会看到三套同一容量读数，说明仅靠人工自审没有卡住重复 UI | `game-ui-design/references/layout-interaction-patterns.md` 总体容量 owner 与机械检查规则；`mage-wars-ui-design-memory` 用户原话反思表；`.spec/tools/scan-ui-duplicate-owners.mjs` | 顶部容量区是总体法术点 `当前 / 上限` 唯一 owner；右侧标题只显示当前可见范围 / 条目数，详情层只说明训练和计点依据，不复写 `法术点 120 / 120`。送验前运行重复 owner 扫描，默认态 `法术点` 和 `120 / 120` 均只能出现一次。 | covered-by-current-design-audit-v16 |
| 右侧清单不能用圆球 / 简单几何替代卡图 | 右侧 deck list 行代表具体法术牌，蓝色圆球或首字类型标无法让玩家识别卡牌，也把低质程序化几何当成正式素材 | `game-ui-design/references/layout-interaction-patterns.md` 已选清单卡牌身份 owner 门禁；`mage-wars-ui-design-memory` 用户原话反思表；正式卡图裁片 manifest | 法术书清单每行左侧必须用真实卡图缩略或正式卡背；类型 / 学派只能作辅助信息。截图和 DOM 扫描不得出现 `.cost` 圆形类型标、普通 icon 或无来源几何身份标。 | covered-by-current-design-audit |
| 图面第一眼仍明显有问题 | 自动审计只检查元素存在，会漏掉错误参考图、筛选区过高、卡池被推到下半屏、设计说明抢主视觉、首屏卡池稀疏、横向墙牌被塞进竖牌壳等玩家一眼可见的问题 | `game-ui-design/SKILL.md` 外部参考必须是实际操作态；`game-ui-design/references/layout-interaction-patterns.md` 成熟组牌主视觉与素材比例门禁；`mage-wars-ui-design-memory` 用户原话反思表 | Mage Wars 组书截图送验前必须同时检查：外部参考图不是导入 / 选英雄入口，顶部说明退场，筛选区是工具栏不是筛选墙，法术牌库当前视口完整可见行由真实卡面连续填满，墙体牌按官方横向比例显示且无黑边 / 拉伸。 | covered-by-current-design-audit |
| 炉石参考必须逐项正反对照 | 只写“参考炉石”会继续保留炉石没有的大管理栏、规则说明块、重复完成区和第二套范围按钮，也可能漏掉炉石已有的卡池主视觉、右侧 deck list、紧凑筛选、法力费用筛选和已选 deck / hero owner | `game-ui-design/references/layout-interaction-patterns.md` 点名成熟参考正反对照门禁；`mage-wars-ui-design-memory` 用户原话反思表；`hearthstone-deckbuilder-comparison.md` | 送验前必须列出 `炉石有 / Mage Wars 没有 / 为什么没有` 与 `Mage Wars 有 / 炉石没有 / 为什么保留`；没有 Mage Wars 规则、素材比例、保存模型或玩家任务理由的目标独有 UI 必须删除、折叠或降权。默认组书页不得出现大管理栏、说明文案、第二完成区、默认展开法术书库或第二套 `全部卡牌 / 书内 / 可加入 / 墙体` 范围按钮。 | covered-by-current-implementation-v18 |
| 标准书卡不应常驻编辑并另存 | 选书页每张标准起始书卡底部曾常驻 `编辑并另存`，这不是选择法术书的主动作，也不是成熟 deck / loadout 选择页的常见主控；它让预设选择卡变成按钮网格，并把保存副本入口提前到错误层级 | `game-ui-design/references/layout-interaction-patterns.md` 成熟参考正反对照与目标独有常驻控件自证；`mage-wars-ui-design-memory` 用户原话反思表；`hearthstone-deckbuilder-comparison.md` | 标准书卡只能用卡本体点击完成选择；编辑通过统一 `编辑选中书` 入口进入构筑器；保存 / 命名副本在构筑器内完成。代码和 E2E 必须断言不存在 `mage-wars-mage-selection-edit-standard-spellbook-*` 与 `编辑并另存`。 | covered-by-runtime-e2e |
| 选书卡不应把可点击性写成状态 | `点击使用` 只是复述卡片可以点，不告诉玩家新的选择差异；当选中态已有描边、P1/P2 标记和可访问性状态时，`已使用` 也会重复同一事实 | `game-ui-design/references/layout-interaction-patterns.md` 可点击对象不复述可点击性；`mage-wars-ui-design-memory` 用户原话反思表；`.spec/tools/scan-ui-duplicate-owners.mjs` 选书页扫描合同 | 标准书和命名副本卡的摘要只保留法术书数量等差异信息；选中由视觉高亮和 P1/P2 标记承担。代码 / E2E / 选书页 DOM 扫描断言无 `点击使用`、`Click to use`、`已使用`、`In use`。 | covered-by-runtime-e2e |
| 新增 UI 元素前必须逐项反思 | 之前是用户指出一个多余元素才修一个，说明设计阶段没有把所有常驻元素过一遍职责、成熟参考和退场条件 | `game-ui-design/references/layout-interaction-patterns.md` 信息归属与不重复；`ui-change-gates.md` 元素职责审计前置；`mage-wars-ui-design-memory` 用户原话反思表 | 选书 / 组书送验前必须逐项审按钮、标签、徽章、输入、状态、说明、弹层入口和装饰壳层：有唯一玩家任务、成熟参考对照和 Mage Wars 规则 / 保存模型理由；说不清的删掉、折叠或降权。 | covered-by-current-implementation |
| 组书卡池卡牌太小 | 卡池是组书主视觉，7.75rem 级别卡牌在 1920x1080 下难以看清牌名、费用和图面主体，违反“看不清先放大，不靠卡外复写” | `game-ui-design/references/layout-interaction-patterns.md` 当前候选卡可读；`ui-change-gates.md` 素材比例和可读性门禁；Mage Wars 组书 E2E 像素测量 | 卡池普通法术卡最小网格宽度提升并由 `data-min-card-width-rem` 与真实浏览器宽高断言卡住；墙体牌仍按横向比例显示。 | covered-by-runtime-e2e |
| 法师详情入口必须可被一眼找到 | 入口虽然在已选法师主控上，但截图没有标出“点哪里”，用户难以判断角色详情链路是否真的覆盖 | `game-ui-design/references/layout-interaction-patterns.md` 所选身份详情入口；`e2e-verification.md` 展开 / 详情 UI 必须截图入口可见态和展开态；`show-image-to-user` 多图标记 | 默认态仍由法师主控本体打开能力牌详情，不新增同级详情按钮；最终图组必须有红圈标注入口的整屏图和详情打开图。 | covered-by-runtime-e2e |
| 命名副本必须有 DIY 身份标记 | 玩家保存的命名副本与标准起始书同库同级后，如果没有 DIY 标记，会看不出它是玩家自定义副本，也没有吸收 Summoner Wars 自定义牌组的身份不变量 | Summoner Wars `CustomDeckCard` / `PlayerStatusCard` DIY 标记；`game-ui-design/references/layout-interaction-patterns.md` 预定义配置与玩家命名副本同库模型；`mage-wars-ui-design-memory` 用户原话反思表 | 选书页命名副本卡和组书法术书库命名副本行显示 DIY 徽章；标准起始书无 DIY；扫描 / E2E 断言有命名副本时每个命名副本项都有 DIY。 | covered-by-runtime-e2e |
| 生命 / 法力 / 聚魔这类全员相同基础属性不要在选书页重复 | Mage Wars 学徒法师 setup 页把 24 / 10 / 10 这种所有候选一致的信息重复写在应用目标、候选卡和摘要上，玩家无法从中做选择 | `ui-change-gates.md` 无差异信息不重复展示、重复 UI 要代码验收；`mage-wars-ui-design-memory` 用户原话反思表 | 选书 / setup gate 只展示法术书身份、绑定法师和会影响选择的差异项；生命24、初始法力10、聚魔10 不出现在额外 UI 文本 / chip / 摘要中，且有代码检索、DOM 文本扫描或 E2E 断言防复发 | covered-by-runtime-e2e |
| 不要常驻确认 / 执行 / 取消 | 规则没有授权时伪造二次确认，占空间 | `ui-design-pipeline` 确认控件授权；`step1-runtime-board-saturated-ui-design.md` 统一动作规则 | 选中来源后高亮合法目标，目标本体点击推进；没有常驻确认按钮 | covered |
| 开放式设计 / 场地直选优先 | 用代理面板、问号块、目标摘要替代真实对象 | `ui-design-pipeline` 开放式直选裁决；`ui-change-gates.md` 0.0 / 0.0D | 合法目标在棋盘格 / 场上卡 / token 本体高亮，代理 UI 仅在有规则理由时出现 | covered |
| 玩家提示挂角色头像，不挂场地 | 把“选择目标 / 行动中”做成卡在地图顶部或中央的提示条，会让玩家误以为竞技场本体是提示载体 | `mage-wars-ui-design-memory` 用户原话反思表；`ui-design-pipeline` 开放式直选裁决 | 当前玩家提示在法师头像 / 角色 HUD；竞技场只承接区域语义、来源 / 合法目标高亮、骰子、token 和结果反馈 | covered |
| 法师提示卡和代表法师本人的卡不是一个东西 | 把 HUD 提示卡、竞技场法师实体和详情层混用，会导致提示挂错层、战场实体职责被 UI 壳替代，且 E2E 用含混命名把错误固化 | `mage-wars-ui-design-memory` 法师对象职责与 v80 基线裁定；TTS / atlas 证据：`mages-core-atlas.json` 中 `2600/2605/2606/2603` 是密集文字法师规则 / 提示卡，`2601/2604/2607/2602` 是人物 / 肖像 frame | 规则对象覆盖矩阵必须拆 `法师战场实体 / 法师本体`、`玩家 / 法师规则提示卡`、`法师规则 / 提示卡详情` 三行；当前 v80 基线采用“竞技场人物本体 + 玩家 HUD 规则提示卡”。未来改布局时，只验是否继续拆清职责并避免图面混淆，不把 v80 坐标当全局硬规。 | current-baseline-v80 |
| 召唤师本身也是单位，必须和同格单位放一起 | 法师虽有 `mageZoneId` 却被单独渲染到另一层，导致同格时不进入双方单位的归属带和容量预算 | `design-system/game-ui/MASTER.md` 4.14；`mage-wars-ui-design-memory` 1.6 | 压力态把双方各一名法师和五个生物放入同格；棋盘只渲染一组稳定归属带，当前桌面基线为复合轴：先按固定席位左右分 lane，同席位法师和单位在各自 lane 内上下分行排列；每个 owner lane 一列最多 3 个，双方各 6 个时每边 2 列 × 3 行；不得重叠、压扁或先用滚动隐藏 | covered-by-runtime-e2e |
| 场地里的红框牌密密麻麻写满了字是提示卡 | 把密集文字法师规则 / 提示卡当作场地本体，玩家会以为竞技场里摆的是说明书，不是法师本人 | `mage-wars-ui-design-memory` 1.6；`rule-to-ui-element-list.md` 法师 atlas 与 UI 元素清单 | 截图检查不得只看 role 名，要看图面是否把密集文字提示 / 参考卡误画成竞技场实体；当前 v80 基线用人物可识别素材承载场地本体。 | covered-by-v80 |
| 规则提示卡和玩家卡图的位置错了，应该交换 | v79 只把场地从密集规则卡改成人物本体，但玩家 HUD 仍是人物卡图；这只修了一半，仍没有执行用户反复强调的当前稿交换方案 | `mage-wars-ui-design-memory` 1.6；`rule-to-ui-element-list.md` v80 基线复核 | 当前 v80 基线：场地格子 = 人物 / 肖像法师本体；玩家 HUD = 密集文字规则提示卡。它是 Mage Wars 当前稿的已定设计，不是下个游戏的固定模板。 | current-baseline-v80 |
| 地图是最下层，不要躲着地图 | 把底图当不可遮挡矩形，导致牌区拥挤 | `ui-design-pipeline` 层级模型；`ui-change-gates.md` 0.0D | 底图拆成必须保护的规则热区和可覆盖纹理区；牌区可开放 overlay 覆盖低权重石砖 | covered |
| UI 是分层，不只是分布局 | 只看几何不重叠，玩家视角仍拥挤 | `ui-design-pipeline` 分层先于分区；`ui-audit-loop` 玩家视角审计 | 审计要看背景层、对象层、主交互 overlay、结算 overlay、辅助 HUD，不只看 DOM 几何 | covered |
| 右下 / 底部空白必须有职责 | 删除 UI 后留下死空，不把空间还给主对象 | `mage-wars-ui-design-memory` 底部空间裁决；`ui-design-pipeline` 空白职责 | 右下和底边若空着，必须承载法术书、已计划、弃牌堆、分页、回合结束或结算预留 | covered |
| 己方 HUD 左侧不能空出无职责大带 / 不因场上实体避让 | 把“避让左列实体”做成固定大比例左偏移，会让角色面板脱离左下服务区；把顶层 HUD 当成棋盘实体的一部分，会把分层 UI 错写成空间排斥；提示卡整卡吃点击会让底层 A2 当前对象无法真实点击 | `ui-ux.md` 顶层 HUD 不避让场景实体；`ui-change-gates.md` HUD 不挤压主布局；`mage-wars-ui-design-memory` 左下顶层锚点 | 己方 HUD 稳定锚在左下顶层界面层，不因 A2 / 首列 / 任意场上实体存在而横向漂移。E2E 必须验 HUD 外壳和提示卡本体不吃输入、只有放大镜 / 眼睛 / 属性 tooltip 等真实控件命中、底部法术书 / 计划槽不被挤压、己方 HUD left gap 不进入大比例偏移；若当前任务对象冲突，按层级 / 命中区 / 同层 HUD 重排 / 当前目标提权处理，不用场景实体避让算法。 | covered-by-current-runtime-e2e |
| 属性 UI 只改位置不等于允许缩小 | 操作态自动 compact 或误传 compact 会让玩家 HUD / 属性 UI 变成小版，背离用户只授权调整位置的范围 | `ui-change-gates.md` 主信息压缩必须证明收益；`mage-wars-ui-design-memory` 用户原话反思表 | Mage Wars 桌面 Board 中玩家 HUD 默认保持完整尺寸；选中法术、单位、确认计划、目标选择和教程步骤不得触发桌面 compact。E2E / 单测要查 HUD 密度仍为 full。 | covered-by-current-runtime-e2e |
| 1366×768 不允许靠整体缩小适配 | 为了让底部三块不遮挡，把 1920×1080 桌面 UI 层整体缩到约 0.71，会让 HUD、法术书和计划槽一起变小，玩家看到的是低可读压缩版而不是比例适配 | `ui-responsive-layout.md` 桌面压力态响应式主源；`ui-change-gates.md` 响应式改动不降级主信息；`mage-wars-ui-design-memory` 用户原话反思表 | 1366×768 下桌面 UI 层不整体缩放；HUD 保持 full；法术书仍显示 6 张；计划草稿进入 2 个计划槽；底部只留约 8px 安全空隙；法术书、HUD、计划区和确认按钮不相交且可点击。 | covered-by-current-runtime-e2e |
| 确认计划已选结果必须直接进计划槽 | 用卡面 `已选` / `选 N` 小标签表达计划草稿，玩家看不到牌最终放到哪个计划槽 | `ui-change-gates.md` 草稿结果进入目标槽位；`mage-wars-ui-design-memory` 用户原话反思表 | 计划阶段点击法术书卡后，右侧两个计划槽位直接显示草稿法术牌；源法术书卡只保留选中描边，不再显示已选角标。教程截图 1/2、2/2 必须覆盖确认前槽位。 | covered-by-current-runtime-e2e |
| 同格单位先左右分阵营，同阵营上下分行且保持可读尺寸 | 把用户的“上下排列”误解成双方整体上下分区、横向 wrap、缩小卡片或重叠压叠，都会让单位归属和可读性错误 | `ui-change-gates.md` 多实体布局要验方向和尺寸；`mage-wars-ui-design-memory` 用户原话反思表 | 同格双方实体当前桌面基线用复合轴：owner lane 为左右，同 owner 实体排列轴为上下分行；每列最多 3 个，超过自动换列；E2E 必须查两个轴、列数、每列数量、实体尺寸、同侧和跨列不重叠、无动作浮层遮挡，不能只查 owner 正确或对象存在。 | covered-by-current-runtime-e2e |
| 分页按钮保持原样，页码不要占大空间 | 改错对象，把按钮样式也改了 | `mage-wars-ui-design-memory` 分页专项裁决 | 按钮样式、方向、位置保持用户认可形态；页码轻量附属于法术书浏览，不撑大栏 | covered |
| 标签放左侧 | 分类标签挤占底部牌列 / 页码空间 | `mage-wars-ui-design-memory` 法术书裁决；设计 README v66 后裁定 | 分类标签在法术书左侧，不能压缩卡牌可读尺寸 | covered |
| 骰子、token 不能省略 | 为了干净删掉规则信息 | `mage-wars-ui-design-memory` 用户原话反思；`rule-to-ui-element-list.md` 规则对象矩阵 | 攻击骰、效果骰、燃烧 token、守卫 / 行动 token 在饱和态可见；伤害状态在受伤对象本体上用受伤遮罩 + 贴宿主剩余 / 总生命读数可见，不强制物理伤害 token 图 | covered |
| 伤害 token 没必要，现代 UI 代替更合适 | 把物理 token 存在机械等同为数字 UI 必须用 token 图，或反过来把现代 UI 误写成任意数字徽章都可用 | `ui-change-gates.md` 规则物件不等于强制贴图；`mage-wars-ui-design-memory` 伤害状态裁决；`rule-to-ui-element-list.md` 伤害状态行 | 伤害作为连续数值状态，默认由对象本体红色受伤遮罩 + 贴宿主剩余 / 总生命读数承载；只有燃烧、守卫、行动等离散状态 / 行动标记继续按 token 物件验收 | covered |
| 守卫必须用 token，伤害可以走现代 UI | 把“token 是否存在”误当成唯一标准，忽略守卫是离散规则身份而伤害是连续累计数值 | `ui-change-gates.md` 规则物件不等于强制贴图、token/角标不盖主体；`mage-wars-ui-design-memory` 用户原话反思表 | 守卫 / 护卫、燃烧、行动准备等可被规则引用的离散状态必须用真实 token 图或等价正式状态物件；伤害必须贴受伤对象本体并可读，但不强制物理 token 图 | covered |
| 护盾、爱心、右下角圆球都不是 Mage Wars 状态语法 | 用通用护盾 / 爱心 icon 或右下角数字球替代真实 token 与生命读数 | `ui-change-gates.md` 规则物件不等于强制贴图；`mage-wars-ui-design-memory` 护盾 / 爱心纠偏；`rule-to-ui-element-list.md` Token / 状态层 | 守卫 / 状态用真实 token 图；能力动作进入屏幕中下统一动作 dock，不用通用 SVG 护盾 / 爱心；伤害 / 血量用受伤遮罩 + 剩余 / 总生命读数，不出现右下角圆形数字球 | covered |
| 守卫必须在宿主中下方，不能变成小卡片动作堆 | 把可点击守卫动作做成右上角按钮堆，并把其它能力小卡片放在守卫下方，玩家会把小卡片误读成守卫附属物 | `mage-wars-ui-design-memory` 用户原话反思表；`rule-to-ui-element-list.md` 守卫 token 行 | 守卫状态 token 和可点击守卫动作 token 都贴选中宿主中下方；守卫动作不使用护盾 icon、右上角按钮壳或小卡片壳；其它能力入口进入屏幕中下统一动作 dock，不出现在守卫附近或顶部横幅 | covered-by-runtime-e2e |
| 守卫单位旁不能出现让人误读的能力小牌 | 单位能力快捷入口使用来源牌面缩略图或锚在格子 / 宿主附近，玩家会把它看成守卫单位附属的小牌或额外场上实体 | `mage-wars-ui-design-memory` 用户原话反思表；`rule-to-ui-element-list.md` 当前动作层 / 守卫 token 行 | 能力触发按 Summoner Wars 职责分层：来源本体选中，顶部横幅只做描述提示，能力按钮直接位于来源单位 / 法师卡牌正下方并水平居中，目标回到棋盘本体高亮；由单测 / E2E 断言没有 img / svg 小牌，且 placement 为 `source-card-below` | covered-by-runtime-e2e |
| 顶部横幅不是能力按钮容器 | 把 Summoner Wars 式顶部横幅误读成按钮 dock，会把描述提示和玩家动作混在一起 | `mage-wars-ui-design-memory` 用户原话反思表；`rule-to-ui-element-list.md` 单位能力动作入口行 | 顶部横幅 / 阶段条只显示当前描述或提示；能力按钮固定在来源单位 / 法师卡牌正下方并水平居中，测试字段为 `source-card-below` | covered-by-runtime-e2e |
| 伤害显示复用 Summoner Wars 显隐合同，并提供眼睛开关 | 只做剩余 / 总生命读数但没有显隐控制，或改成自创常驻压牌面样式，会偏离用户认可的成熟样本 | `ui-change-gates.md` 同类视觉先对照成熟样本；`mage-wars-ui-design-memory` 用户原话反思表；`rule-to-ui-element-list.md` 伤害状态 / 生命读数行 | 红色受伤遮罩按伤害比例贴对象本体；生命读数默认 hover / 聚焦显示，眼睛按钮切换全场常显；没有右下角圆球、爱心 / 护盾或物理伤害 token 图 | covered-by-runtime-e2e |
| 墙法术结算后应该把墙牌摆上边界 | 只显示泛化彩色墙条会让正式墙法术牌面缺席，也无法证明 `sourceSpellCardId` 对应素材被消费 | `mage-wars-ui-design-memory` 用户原话反思表；`rule-to-ui-element-list.md` 墙体 / 墙壁法术牌行 | 墙体目标仍点击共享边界；结算后边界上必须可见源墙法术正式牌面 / 墙牌，E2E 断言墙牌预览、来源卡 id 和 `spell-card` 视觉类型 | covered-by-runtime-e2e |
| 攻击掷骰应该在上层 / 目标附近 | 把结算主体边栏化 | `ui-design-pipeline` 当前结算主体；`step1-runtime-board-saturated-ui-design.md` 结算层 | 骰子、效果骰、伤害、燃烧 token 位于主舞台上层，并锚定来源 / 目标 / 动作链 | covered |
| token / 状态贴对象，不只在日志 | 状态离开宿主，玩家不知道谁受影响 | `step1-runtime-board-saturated-ui-design.md` 行动标记和状态 token；`ui-audit-loop` 保护槽位 | token 不脱离宿主，不压住关键卡面信息，数量或堆叠关系可读 | covered |
| 描边不贴边 | 把用户说的描边几何问题误读成“对象目标是否整格高亮”的语义问题，导致悬浮外扩框仍可能存在 | `ui-change-gates.md` 高亮必须清楚贴合、目标高亮要验几何；`mage-wars-ui-design-memory` 用户原话反思表 | 目标描边必须沿目标卡牌 / 法师本体可见边界；E2E 不能只查绿色存在，必须量目标框与本体四边差值，常规容差不超过 2px | covered |
| 对手计划旧左上镜像基线 | 隐藏计划法术曾被挂到错误边栏；该左上镜像基线已被用户当前“对方计划放右上角吧”覆盖，不再作为送验要求 | 历史 `step1-runtime-board-saturated-ui-design.md`；当前 `mage-wars-ui-design-memory` | 当前实现只保留隐藏信息边界：对手已计划只显示卡背 / 数量，不公开正面或卡名；位置按当前基线放右上对手 HUD 左侧相邻 | superseded-by-current-right-top-baseline |
| 弃牌堆放右侧竖向空位，不能小过头 | 归档入口过小、放错位或抢位 | `mage-wars-ui-design-memory` 弃牌裁决；设计 README v73-v75 裁定 | 弃牌堆位于用户标注右侧空位，尺寸低权重但可识别，不压计划 / 回合结束 / 对手状态 | covered |
| 弃牌堆规则上能看就显示正面 | 公开归档被误画成隐藏信息 | 规则 `page_015.md`；`ui-design-pipeline` 公开归档；`mage-wars-ui-design-memory` | 弃牌堆显示紧凑顶牌正面 / 半露正面 + 数量；点击可展开完整公开弃牌 | covered |
| 看对方弃牌要切换视角，不是新增对手弃牌 UI | 在己方视角新增 `mw-opponent-discard` / `mage-wars-opponent-discard-pile` 会复制第二套同类 owner UI，玩家看到的是临时面板，不是成熟游戏里的公开视角切换 | `ui-ux.md` 组件来源；`ui-change-gates.md` 视角切换复用原槽位；`tutorial-design.md` 真实视角和 owner；`e2e-verification.md` 视角切换 / 观察他人公开信息；`mage-wars-ui-design-memory` 用户原话反思表 | Mage Wars 教程必须点击对手 HUD 左上眼睛进入对手公开视角；同一个 `mw-discard` 显示对手弃牌并带 owner 断言；返回自己视角后同槽位恢复己方弃牌；代码和 E2E 负向断言旧平行对手弃牌锚点不存在 | covered-by-current-runtime-e2e |
| 返回自己视角要用大杀四方同类居中视角横幅 | 把返回入口放左上角会把“正在看谁的公开区”降级成局部按钮，而不是成熟游戏里的整页视角状态 | `ui-change-gates.md` 同类视觉先对照成熟样本；`mage-wars-ui-design-memory` 用户原话反思表；Smash Up `opponent_view` 横幅实现 | Mage Wars 对手公开视角横幅必须位于上方居中，按钮组水平居中；E2E 量 `mage-wars-public-view-banner` 外壳和内层按钮组中心，不再允许 `left-16 top-4` 式局部摆放 | covered-by-current-runtime-e2e |
| 守卫动作按钮不能写成“进行守卫”长解释 | 守卫标记是行动结算后的状态；把动作栏按钮写成“进行守卫”并在教程里再解释“不是技能或目标”，说明按钮和教程没有直接服从规则原文 | `tutorial-design.md` 文案来自规则和当前画面；`ui-change-gates.md` 规则动作不加自造解释；规则书 `page_013.md` / `page_031.md` / `page_045.md` | 动作栏只写规则短名“守卫”；教程引用规则书关于快速行动和守卫标记的原文，UI 独有句只说明点阿希拉牧师和屏幕中下行动条；守卫标记只在结果态显示在单位下方 | covered-by-current-runtime-e2e |
| 卡背只用于隐藏信息 | 用卡背误导公开内容未知 | 规则 `page_015.md`；隐藏结界 `page_020.md`；设计合同隐藏信息边界 | 卡背只用于对手已计划、未公开法术书、隐性结界；公开弃牌不用卡背 | covered |
| 避免边框 / 容器感 / 普通蓝圆 | 壳层和粗糙程序化对象抢走游戏主体 | `ui-design-pipeline` 框体职责与 programmatic UI；`ui-ux.md` 开放式主舞台 | 不出现厚边框、封闭大卡片、无语义黑影、普通蓝圆效果骰；自制 UI 必须有材质和来源裁定 | covered |
| 地图不能套两层，外面不应再有一圈 | 16:9 牌桌壳、4:3 地图视窗和圆角 / 渐变暗带叠加后，玩家会把桌面留白误认成第二张棋盘；只证明 transform 变化仍可能只是框内平移 | `ui-change-gates.md` 地图 / 棋盘视窗可自由查看、开放场景不套比例框；`board-coordinate-contract.md` 完整 4x3 坐标合同；本轮真实入口截图复核 | 地图视窗铺满真实牌桌地图层，正式 4x3 原图作为同一坐标父容器里的大场景；玩家状态、法术书牌列、计划确认区和已计划法术不得留在 16:9 内框或自造摆放范围内，必须按类似 Unity Canvas 的真实视口九宫格锚点对齐；不得再叠加无职责圆角、阴影、左右暗带、上下渐变圈或外层黑带；默认缩放看全 12 区域且不压底部三块可见主对象，放大 / 拖拽后地图覆盖视窗、对象热区贴竞技场，底部三块可见主对象同一基线 | covered-by-current-runtime-audit |
| 选中态不要改变布局 | 选中后生成左右特大牌或挤压牌列 | `ui-design-pipeline` 选中态不得改变常驻布局占位；`mage-wars-ui-design-memory` | 选中只用描边、抬升、发光、短状态或临时检视；不改变牌列 / 计划槽尺寸 | covered |
| 用户标注图里的元素不能随意删 | 标注的骰子、token、弃牌、分页等被省略 | `ui-design-pipeline` 用户标注元素守恒；`ui-audit-loop` 用户点名元素逐项审计 | 送验前逐项回答用户标注元素是否仍在、规则名称是什么、若收起入口在哪里 | covered |
| 设计要按数据理解布局 | 只凭感觉看图，不核坐标、尺寸、比例 | `ui-design-pipeline` 空间预算 / 可读性预算；本账本 | 导出 geometry，核卡牌尺寸、弃牌堆尺寸、计划牌比例、压叠、可读性和槽位关系 | covered |
| 视觉肯定先 AI 验收，再人工验收 | 把未通过候选交给用户挑错 | `ui-audit-loop` 自见失败不得送验；`show-image-to-user` final gate | AI 自审发现基础问题时继续重构；只有 AI_PASS 且打开原图后才请用户看 | covered |
| 验收图不能是空态 | E2E 通过但截图缺已计划、弃牌、骰子、状态，导致用户纠正项被技术绿灯掩盖 | `mage-wars-ui-design-memory` 规则到 UI 到实现执行顺序；`e2e-verification.md` 状态型截图口径 | 设计稿 / 真实 Board/UI 送验截图必须构造饱和交互态：法术书 6 张、已计划 2 张、公开弃牌正面、骰子、效果骰、伤害状态、燃烧 / 守卫 / 行动 token、来源和合法目标高亮同时可见；空开局只能作诊断 | covered |
| 教程主流程图组不能混入基础验证 / 拖拽诊断图 | 旧最终图组把 foundation Board 截图、拖拽姿态截图和教程截图混成同一序列，导致 `02=>04` 看起来像同一教程链路里计划槽突然变化 | `e2e-verification.md` 主流程图组不得混入辅助证据；`evidence/mage-wars-tutorial/pass-manifest-20260902-flow-sync-v3.json` | Mage Wars 教程最终图组只允许包含 `/play/mage-wars/tutorial` 当前主流程截图；基础 Board、拖拽 / 缩放、移动端对照、诊断图或旧图必须单独分组。PASS 清单生成前检查所有图角色均为主流程，并能逐张写出相邻过渡。 | covered-by-current-e2e-v3 |
| 计划槽位不能靠肉眼猜，必须验数量和来源 | 旧图面让人误以为 02 两个槽位默认填满同一张法术，说明只看 `2/2` 或只看截图不够 | `ui-change-gates.md` 草稿结果进入目标槽位；`e2e-verification.md` 截图与断言逐步对应；`pass-manifest-20260902-flow-sync-v3.json` | 截图前必须断言计划草稿槽位数量和 `source-card-id`：`1/2` 时只有一张来源牌，`2/2` 时两张来源牌可区分；不得用确认按钮进度、源牌小标签或旧截图替代槽位事实。 | covered-by-current-e2e-v3 |
| 每次设计完用用户原话反思 | 审计只看几何 / DOM，不回看用户纠正 | `mage-wars-ui-design-memory` 用户原话反思表；本账本 | 最终审计必须逐条列用户原话自审和本账本自审，不得只报分数 | covered |
| 单个问题不要默认多层规范同时改 | 把问题本质误判成“改了多处”或制造多重真相 | `spec-steward` 多重真相定义；本账本角色声明 | 修改前先裁定 canonical-source / adapter / evidence；审计和本账本只能引用，不各自创造新规则 | covered |
| 规则到 UI 不能靠纠正账本兜底，必须先有对象覆盖矩阵 | 用户没有逐条骂到的规则对象可能继续被遗漏，例如骰子、token、公开弃牌、已计划法术或合法目标高亮 | `mage-wars-ui-design-memory` 规则对象覆盖矩阵；本账本仅作 drift-check / evidence | 设计 / 实现 / 送验前必须列出 foundation 规则对象，每行裁定可见性、实体锚点、素材 / 程序化来源和截图验收方式；无结论行按遗漏处理 | covered |
| 规则到 UI 再到实现不能只看最后一张图 | 规则对象、交互职责和用户纠正项在实现时被遗漏 | `mage-wars-ui-design-memory` 规则到 UI 到实现执行顺序；`generated-design-implementation.md` | 实现前必须重新锁规则对象、唯一实体锚点、主交互链，并逐条把本账本映射到真实 Board/UI 承载位置 | covered |
| 设计稿到实现不能漏掉纠正项 | 只按最后一张图的大致布局实现，容易重新漏骰子、token、公开弃牌堆正面、分页样式或规则术语 | `generated-design-implementation`；`.spec/knowledge/standards/generated-design-implementation.md`；`board-layout-contract.md` | 真实 Board/UI 实现前必须逐项消费本账本；实现截图必须回答每个用户纠正项在图面中的承载、是否可读、是否被省略或误改 | covered |
| 不允许自创未经验证的战棋主交互 | 把单位行动做成全局按钮栏、把结算做成常驻骰盘，脱离正常战棋的单位直选和攻击因果 | `design-system/game-ui/source-families.md` 的“棋盘对象 / 位置直选”“事件驱动主舞台结算”；`design-system/games/mage-wars.md` 的战术单位适配 | 验收图必须同时证明：法师和生物本体可选；合法移动 / 攻击候选只在棋盘；守卫仅在选中单位附近；无常驻动作栏或骰盘；真实攻击事件才短暂出现骰子 | covered-by-runtime-e2e |
| 点击计划槽也要能去掉计划 | 计划草稿已经进入目标槽位，但旧交互只允许回点法术书原卡取消，玩家会被迫回到原列表找同一张牌 | `ui-ux.md` 可逆选择由结果槽位承接；`ui-change-gates.md` 可逆选择验结果槽位；`mage-wars-ui-design-memory` 用户原话反思表 | 计划阶段点击已计划槽位里的草稿牌本体会删除该槽位草稿；确认按钮进度回退；重新点法术书原卡可恢复；点放大镜只打开检视且不改变计划数量 | covered-by-current-runtime-e2e |
| 计划教程一步就讲当前一步 | 把分类、翻页、选两张牌、确认计划和后续法术效果塞进一张教程卡，会让文案、高亮、真实点击和截图过渡对不上 | `tutorial-design.md` 单步只承接当前输入或结果；`tutorial-workflow` 文案自检；`mage-wars-ui-design-memory` 用户原话反思表 | 计划段必须按真实动作拆为分类、翻页、选牌、分类、翻页、选牌、确认；每步只有一个高亮 / allowed target；语言包短句不得提前写多个后续点击；E2E 图组保留 1/2 和 2/2 槽位事实 | covered-by-current-runtime-e2e |
| 己方血量 / 提示卡放左下，不是和手牌在一排；对手计划放右上角 | 上一版把己方 HUD、对手 HUD、对手已计划和底部牌列的职责混在一起：己方状态抢底部牌列，或把对手已计划留在当前用户已纠正的旧左上基线 | `mage-wars-ui-design-memory` 法术书 / 已计划 / 底部空间裁决；`ui-responsive-layout.md` 核心承载量和整屏锚点；本账本第 126 / 128 / 133 行 | 己方 HUD / 规则提示卡必须在左下独立层，底边高于法术书牌列；对手 HUD 在右上；对手已计划卡背放右上对手 HUD 左侧相邻且不遮挡；1366×768 仍显示 6 张法术书、2 个计划槽和确认入口 | covered-by-current-runtime-e2e |

## 当前下一稿 / 实现截图送验前最低勾选

- [ ] 规则真相源已在当前轮次实际读取，而不是继承摘要。
- [ ] 已按 `.spec/skills/mage-wars-ui-design-memory/SKILL.md` 的“规则到 UI 到实现执行顺序”锁定规则对象、唯一实体锚点和主交互链。
- [ ] 已建立规则对象覆盖矩阵；foundation 最低对象行都有 `visible`、`collapsed-with-visible-entry`、`hidden-by-rule`、`out-of-scope`、`blocked` 或 `approved-programmatic` 结论。
- [ ] Open Design artifact 路线确认，未调用 media 生图链。
- [ ] `法术书 / 已计划法术 / 弃牌堆 / 隐性结界` 牌区命名无“手牌”。
- [ ] 选书 / setup gate 没有把所有候选一致的生命24、初始法力10、聚魔10 等基础属性重复写进应用目标、候选卡、摘要或 chip；若展示差异项，必须有代码检索、DOM 文本扫描或 E2E 断言防复发。
- [ ] 组书 / 法术书编辑器没有 `排斥成本`、`下一张到上限`、`再加一张`、`排斥示例`、`上限看能力牌` 等废话标签；状态文案必须给出具体成本、倍率、余量、冲突对象或下一步。
- [ ] 组书 / 法术书编辑器有类型、学派 / 元素、等级 / 构筑成本、打出法力费用、合法性 / 冲突、书内 / 未加入等多级筛选；不同系法术不能只靠搜索框或单层类型按钮区分；学派下拉不得混入蝙蝠、手套、靴子、传送门、胸甲等子类型；打出法力费用不得和构筑法术点混成同一个读数。
- [ ] 法术书清单若有几十张卡，必须用分组 / 滚动 / 分页承载，并显示总张数、条目数和显示范围；少量问题卡只能作为“需处理项”，不能冒充整本书。
- [ ] 组书 / 法术书编辑器顶部必须显示法术点或等价构筑资源 `当前 / 上限`，且顶部容量区是总体容量唯一 owner；右侧标题、摘要、详情层不得再复写同一个 `当前 / 上限`，总张数 / 条目数只能作为次级读数，不能单独冒充合法性。
- [ ] 组书 / 法术书编辑器不得内嵌第二套法师切换；切换法师只通过选书 / setup 页选择另一份绑定对应法师的法术书完成，组书页只显示选中书绑定的法师上下文、训练规则和构筑合法性，不出现 P1 / P2 / 席位主控。
- [ ] 组书 / 法术书编辑器必须能从已选法师主控本体进入法师详情 / 能力牌规则回看；详情默认收起，打开后展示能力牌原图和构筑影响，关闭后不占用卡池或法术书清单空间；默认态不得新增同级 `详情` 按钮、新行控件或第二张身份卡。
- [ ] 选书 / setup 页和组书页的法术书库必须把标准起始书 / 预定义书、玩家命名副本和 `+` 新建入口作为同级项展示；`+` 表示新建未绑定法术书，必须先打开绑定法师候选层，再用玩家选择的法师标准起始书进入新草稿；已有命名副本既能更新原副本，也能在构筑器内另存新书；玩家命名副本最多 10 本，数据层、UI 属性和扫描必须同时卡住上限；不得用角落 `DIY 法术书`、`暂无命名副本`、`还没有 DIY 法术书`、隐式沿用当前法师或 `空白自组` 主入口冒充流程。
- [ ] 选书 / setup 页标准起始书卡不得常驻 `编辑并另存` / `编辑保存副本` 这类成熟参考没有且无法自证的次按钮；标准书编辑只能先选中书，再从统一 `编辑选中书` 入口进入构筑器，保存命名副本在构筑器内完成。
- [ ] 选书 / setup 页标准书和命名副本卡不得把可点击性复述成可见状态；若卡本体已可点击，默认态不得显示 `点击使用`、`Click to use`，选中态已有高亮或 P1/P2 标记时不得再显示 `已使用`、`In use`；送验前运行 `.spec/tools/scan-ui-duplicate-owners.mjs --contract mage-wars-spellbook-selection temp/mage-wars-spellbook-selection-default-dom.html` 或等价 E2E 断言。
- [ ] 组书 / 法术书编辑器送验前必须运行重复 owner 扫描或等价 DOM / E2E 断言，覆盖 `法术点`、`120 / 120`、所选法师身份、`当前法术书`、`当前法师法术书库`、`编辑当前书`、`更新当前副本`、`给当前书取名`、`新书从当前书`、`当前书内`、`xN`、`席位`、`P1`、`P2`、`兽王标准书`、独立 `详情` 入口、`DIY 法术书`、`暂无命名副本`、`空白自组`、`全部卡牌`、第二套范围按钮组、缺少 `+` 新建入口或缺少 10 本上限属性等回归。
- [ ] 法术书右侧清单每行必须用真实卡图缩略或正式卡背承载卡牌身份；不得用圆球、首字、普通 icon、类型色块或简单几何替代。
- [ ] 组书 / 法术书编辑器截图第一眼像成熟组牌页：外部参考图不是导入 / 选英雄入口，筛选区不压低卡池、当前视口完整可见卡池行由真实卡面连续填满且不是空白样例区、卡池主视觉不是每卡常驻按钮网格、横向墙牌按横向比例显示且没有黑边 / 拉伸。
- [ ] 点名 Hearthstone 或其它成熟组牌参考后，送验前必须附正反对照：参考有而 Mage Wars 没有的逐项说明缺失理由；Mage Wars 有而参考没有的逐项说明保留理由；解释不了的 UI 已删除、折叠或降权。
- [ ] 法术书 6 张可读，计划牌与法术书同尺寸，分页按钮样式未被误改。
- [ ] 桌面 HUD / 属性 UI 在计划、选中、目标选择和教程步骤中保持完整尺寸；没有因操作态自动 compact。
- [ ] 己方 HUD / 属性 UI 是左下顶层界面锚点；A2、首列或场上实体存在时不得触发横向安全偏移或无职责大带，HUD 外壳和提示卡本体不吃输入，只有放大镜、眼睛和属性 tooltip 等真实控件命中，被 HUD 视觉覆盖的当前可操作实体仍有主体点击点命中场上对象。
- [ ] 1366×768 桌面压力态没有整层 UI 缩小：HUD 为 full，法术书 6 张、2 个计划槽、确认按钮和底部约 8px 空隙同时可见、不相交、可点击。
- [ ] 确认计划前，已选法术牌直接进入己方计划槽位；法术书卡面没有 `已选` / `选 N` 小标签或角标替代槽位。
- [ ] 计划槽里的草稿牌本体可点击取消该槽位计划，进度和草稿数组同步回退；重新点击法术书原卡能恢复；槽位放大镜只检视，不改变计划。
- [ ] 计划教程段每张卡只对应当前真实动作：分类、翻页、选牌、分类、翻页、选牌、确认分别有独立高亮 / allowed target / 截图，文案不提前串多个后续操作或后续法术效果。
- [ ] 同格双方单位 / 法师实体按当前桌面基线左右分 owner lane；同 owner 单位上下分行、不重叠、尺寸可读；每列最多 3 个、超过自动换列，双方各 6 个时每边 2 列 × 3 行；E2E 同时覆盖两个轴向、列数、每列数量、最小尺寸、非重叠和无动作浮层遮挡。
- [ ] 对手计划在右上对手 HUD 左侧相邻卡背，己方计划在己方槽位；对手计划不公开正面 / 卡名且不遮挡对手 HUD。
- [ ] 弃牌堆在右侧竖向空位，显示正面半露 + 数量，点击语义是公开检视。
- [ ] 查看对手公开弃牌通过对手公开视角切换复用同一个弃牌槽；不存在 `mw-opponent-discard` / `mage-wars-opponent-discard-pile` 或平行对手弃牌 UI。
- [ ] 攻击骰、效果骰、伤害状态 / 伤害数值、燃烧 token、守卫 / 行动 token 未省略；墙体法术结算后边界上显示源墙法术正式牌面 / 墙牌，不退化成泛化墙条；伤害不强制物理 token 图，但必须贴受伤对象本体并以受伤遮罩 + 生命读数可读，不出现通用护盾 / 爱心或右下角圆形数字球。
- [ ] 设计稿 / 真实 Board/UI 截图是饱和交互态，不是空开局或只证明页面可运行的技术截图。
- [ ] 当前动作由来源对象和棋盘 / 场上对象本体承接，合法目标高亮，不出现无授权常驻确认。
- [ ] 当前玩家提示挂在法师头像 / 角色 HUD；竞技场只保留阶段、区域语义和真实对象高亮，不承载第二个玩家提示条。
- [ ] 法师战场实体 / 法师本体、玩家 / 法师规则提示卡、法师规则 / 提示卡详情已在矩阵中分开命名、分开素材职责、分开验收；当前 v80 基线是竞技场人物本体 + 玩家 HUD 规则提示卡，后续改稿必须说明是否沿用该基线或如何等价替代。
- [ ] 地图是底层承载，不再为了避开地图牺牲法术书、计划牌、弃牌堆或结算层。
- [ ] 没有无职责大空白、厚边框容器、无语义黑影、普通蓝圆或粗糙占位。
- [ ] 几何数据与整屏玩家视角都通过；不能只用“不重叠”证明玩家友好。
- [ ] 审计输出逐条引用本账本，不在审计里新增独立 PASS/FAIL 规则。
- [ ] 若进入真实 Board/UI 实现，最新实现截图已逐项对照 v75 原图、v75 审计、几何证据和本账本；任何漏项都必须判 `REVISE`。
- [ ] 若进入真实 Board/UI 实现，每一条用户纠正都已映射到真实截图里的承载位置；没有承载位置或只由 E2E 文案证明的条目按未覆盖处理。
