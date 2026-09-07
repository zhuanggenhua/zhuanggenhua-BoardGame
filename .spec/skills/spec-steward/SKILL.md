---
name: spec-steward
description: 维护 BoardGame .spec 结构、规范落点、索引和名册；新增/修改/删除 Agent、Skill、知识或规则，或需要把改动沉淀进 knowledge/ 时使用。
---

# Spec Steward（仓库管家）

保证对 `.spec/` 的任何改动都放对位置、格式合规、索引与名册同步，并在开发完成后把“改了什么、为什么”沉淀回知识库。
本技能不复述业务规范；权威在 `.spec/AGENTS.md`、`knowledge/README.md`、`rules/system.md` 和对应 skill 正文。

## 何时使用

- 新增 / 修改 / 删除一个子 Agent、Skill、知识文档或规则时。
- 完成一处代码 / 设计改动后，要把它沉淀进 `knowledge/` 时。
- 不确定某份内容该放哪（rules / standards / features / agents / skills / decisions）时。
- 需要清理 AI 文档冗余、降低误读、压缩长规则或做全量自查时。
- 用户问“规范有没有问题 / 规范的规范有没有问题 / 要不要更新规范”时，先定位对应规范责任，而不是默认进入全量整理。

## 前置条件

- 能随时查阅 `.spec/AGENTS.md`（调度核心、宿主差异）与 `knowledge/README.md`（知识导航）。
- 改动目标明确（知道要加 / 改 / 删什么）。

## 操作步骤

### 流程 A · 维护结构（新增 / 修改 / 删除能力）

1. **判类型**——这份内容属于哪一类：
   - 禁止碰什么（护栏）→ `rules/`（硬规则在 `rules/system.md`，无 frontmatter）
   - 怎么做（流程 / 规范）→ `knowledge/standards/`（见 `knowledge/README.md`）
   - 某功能的设计 / 记录 → `knowledge/features/<领域>/...`（见 `knowledge/README.md`）
   - 一个职能角色 → `agents/`（先过 `.spec/AGENTS.md` 的准入口径，再照 `reviewer` 范例写）
   - 可复用方法 → `skills/<name>/SKILL.md`（目录名即 skill 名；description 只写触发条件，不概括流程）
   - 决策原因 → `decisions/`（ADR，只记录为什么）
2. **放对位置 + 命名**：
   - agent 文件：`<name>.agent.md`
   - skill 目录：`skills/<name>/SKILL.md`
   - knowledge 文档：kebab-case，放在 `standards/` 或 `features/`
3. **写 frontmatter**：
   - agents：仅 `name` + `description`
   - skills：仅 `name` + `description`
   - knowledge：`name` + `description` + `metadata`（`type` / `status`）
   - rules / decisions：无 frontmatter
4. **同步登记**：
   - 加 / 删子 Agent → 更新 `.spec/AGENTS.md` 子 Agent 名册与宿主差异表
   - 加 / 删知识文档 → 更新 `knowledge/README.md`
   - 加 / 删 ADR → 更新 `decisions/README.md`
   - 改动影响调度 → 更新 `.spec/AGENTS.md` 调度核心

### 流程 B · 沉淀知识（改动完成后）

1. 一句话总结：这次改了什么、为什么。
2. 判断文档归属：
   - 影响开发流程 / 规范 → 更新 `knowledge/standards/` 对应文件。
   - 影响功能设计 → 找 `knowledge/features/` 对应文档；有就更新，没有就从 `_TEMPLATE.md` 新建。
   - 决策 → `decisions/` 新增 ADR。
   - 复发问题 / 踩坑经验 → 追加进 `knowledge/lessons.md`。
3. 更新正文：只保留当前有效内容，交付历史不入库（git 提交即历史）。
4. frontmatter `status` 只能取枚举：`设计中` / `实施中` / `已交付` / `历史归档`；`description` 保持一句话。
5. `knowledge/README.md` 导航行来源于 frontmatter `description`，同一句话口径。
6. 待执行事项走任务卡，不堆进知识库。

### 流程 C · 清理离线任务卡

- `.spec/tasks/` 目录只留未完成 / 进行中的卡。
- 任务完成后直接删除卡文件；历史在 git，不设归档目录。

### 流程 D · 规范问题归因与裁决

用户追问规范是否有问题时，先找“谁的规范问题”，再决定动作；不得把一个具体执行失误泛化成所有规范都要加章节。

1. **锁定被问对象**：
   - 用户点名 UI、E2E、教程、看图、资源、规则、部署、skill 治理或 Agent 路由时，先从 `knowledge/README.md`、`.spec/AGENTS.md` 和对应 skill 找责任入口。
   - 用户问“规范的规范”时，先检查治理入口：系统 `skill-governance` 与项目 `spec-steward`，再判断是否需要改项目适配。
   - 用户指出通用规范偷带单游戏 / 单产品对象时，先按系统 `skill-governance` 提炼信息、行为和验收角色；项目层只保留落点、索引或薄适配，不把具体对象扩写成跨游戏规则。
2. **区分三类结论**：
   - 已有规范正确，但本轮没执行 → 回答“执行失守”，不新增平行规则。
   - 规范已有但不可执行、触发不清或索引不通 → 更新对应 canonical-source、索引或适配入口。
   - 规范重复、过时、误导或抢职责 → 删除、降级为证据，或重构为薄引用；不要继续加一条反向覆盖。
3. **按裁决阶梯输出动作**：
   - 逐项判断 `不做 / 删除 / 审查现有职责 / 重构或迁移 / 改作者源或配置 / 新增入口`。
   - 每项都说明唯一真相源是谁；证据、账本、PASS 清单和任务记录不得升级成规范正文。
4. **禁止默认全量章节整理**：
   - 章节多、文件长、案例多只能作为候选症状；必须先证明它导致重复真相、索引漂移、执行误导或验收不可判，才进入拆分或压缩。
   - 能用一条自然流程或一个现有责任入口讲清的规范，不得为了“看起来完整”拆章节；只有定义、流程、例外、命名、验收或适配对象真实不同，才分章节或分卷。
   - 如果问题只属于某个专项规范，就修该专项；如果属于治理流程，就修治理入口；如果只是当轮没按已有规范执行，就记录为执行失守。

### 流程 E · AI 文档去噪自查

1. 只处理本轮 AI 执行文档；产品任务、事实资料和 evidence 只记候选问题。
2. 改写前列必保留语义：目标、触发、允许、禁止、失败命名、验收、主源。
3. 拆开定义、流程、例外、命名和验收；例子能进 skill / 任务卡 / evidence 就别抢主规范正文。
4. 只删重复、历史和不改判断的例子；拿不准就迁移或保留。
5. 全量清理分批落地，每批跑结构校验。

## 快速参考

| 内容 | 去处 | frontmatter |
| --- | --- | --- |
| 禁止碰 / 改 / 提交某物 | `rules/` | 无 |
| 怎么开发（流程 / 规范） | `knowledge/standards/` | 有 |
| 某功能的设计 / 记录 | `knowledge/features/...` | 有 |
| 决策（功能内 / 框架级） | `decisions/`（ADR） | 无 |
| 复发问题 / 踩坑经验 | `knowledge/lessons.md` | 有 |
| 职能角色 | `agents/` | 仅 name + description |
| 可复用方法 | `skills/<name>/SKILL.md` | 仅 name + description |

## 注意事项

- 不抄 SPEC，只指回它；同一规则只在一处定义。
- 索引漂移 = 知识隐身：新增 / 删除文档必须同步更新 `knowledge/README.md`。
- `knowledge/README.md` 强制被入口加载，导航行保持一句话。
- `rules/` 管禁止，`standards/` 管怎么做，别混。
- BoardGame 项目 skill 的落点是 `.spec/skills/`；宿主目录通过链接暴露，不维护第二份正文。
- 项目文档里的文件链接格式以 [`documentation-style`](../../knowledge/standards/documentation-style.md) 为准：指向仓内真实文件或目录时使用相对 Markdown 链接，不写 Windows 绝对路径或裸路径代替链接。

## 验证

- [ ] `npm run spec:lint` 通过。
- [ ] 内容在正确目录，命名合规。
- [ ] `.spec/AGENTS.md` 名册、宿主差异表、调度核心与实际一致。
- [ ] knowledge 文档 `status` 与现状一致；正文只含当前有效内容，无历史堆积。
- [ ] 没有把任何规矩复制进多处。
- [ ] 用户问规范问题时，已明确结论属于执行失守、规范缺口、索引缺口、重复真相、过时规则还是章节去噪；没有用“规范很长”替代责任归因。
- [ ] 文档去噪前后的核心语义仍可逐项对上，没有因压缩丢掉触发条件、例外、禁止动作或验收证据。
- [ ] 删除操作无悬空引用残留。
- [ ] `.spec/tasks/` 只含在途卡。

## 汇报口径

- 项目规范更新完成后，必须说明唯一真相源、作用范围和同步层角色。作用范围要明确写成全项目 / 多游戏、单游戏专项、单任务记录或证据记录，避免把项目级规则误报成单游戏规则。
