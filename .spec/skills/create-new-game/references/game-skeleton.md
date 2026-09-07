# 新游戏目录骨架

## 角色

本文件只定义新 `gameId` 的目录职责和拆分门槛，不提供可复制代码模板。写代码前先从当前仓库选择最接近的已交付游戏作为实现参照；结构入口速览见 [`project-structure`](project-structure.md)，manifest 生成见 [`manifest-generation`](manifest-generation.md)。

## 必备目录

以下是新游戏最终目录合同，不代表可以在设计稿前一次性创建全部正式运行时文件。Open Design 设计稿和 UI-facing 数据模型批准前，只能建立非 UI 骨架；`Board.tsx`、`ui/` 下的正式组件和运行时交互必须在设计门通过后创建。

```text
src/games/<gameId>/
  manifest.ts
  game.ts
  Board.tsx
  thumbnail.tsx
  tutorial.ts
  audio.config.ts
  domain/
  rule/
  ui/
  config/ 或 data/
  __tests__/
```

职责：

- `manifest.ts`：清单元数据；`id` 必须与目录名一致，缩略图路径使用逻辑资源路径。
- `game.ts`：组装领域内核和引擎系统；`commandTypes` 只列业务命令，系统命令由引擎适配层合并。不得承载规则事实、命令校验、事件生成、状态 reducer、读模型或测试夹具正文。
- `Board.tsx`：设计门通过后的正式玩家 UI 入口；只做页面组合、React 状态绑定、handler wiring 和子 UI 挂载。超过约 `1,000` 行时先做体量审查；出现多职责区域且未通过白名单裁决时拆入 `ui/`、read model 或 controller hook。设计门通过前不得用占位 Board 冒充骨架完成。
- `thumbnail.tsx`：缩略图组件；优先使用项目统一 thumbnail 组件，不自写资源 URL。
- `tutorial.ts`、`audio.config.ts`：可先占位，但最终完成前必须按教程和音频规范裁定。
- `domain/`：规则状态、命令、事件、校验、执行、reducer、流程钩子和共享工具。
- `rule/`：规则合同、录入核对和实现消费说明。
- `config/` 或 `data/`：静态数据；按对象模型和资源合同选择，不把规则事实硬塞进 UI。
- `__tests__/`：工厂、冒烟、命令校验、流程和关键领域行为测试。

## Domain 默认形状

最小职责：

| 文件 | 职责 |
| --- | --- |
| `domain/index.ts` | 导出 DomainCore、命令 / 事件常量和必要类型；连接 setup / execute / reduce / validate / isGameOver |
| `domain/types.ts` | 类型 barrel；复杂游戏拆成 `core-types.ts`、`commands.ts`、`events.ts` |
| `domain/ids.ts` | 稳定 ID、枚举常量和对象 id 集合 |
| `domain/validate.ts` | 命令合法性；不改状态 |
| `domain/execute.ts` | 命令转事件或等待交互；不直接写 core |
| `domain/reducer.ts` | 事件转状态；纯函数，只改事件命中的状态路径 |
| `domain/utils.ts` | 领域内共享工具；不得变成跨游戏工具垃圾桶 |
| `domain/flowHooks.ts` | 中大型游戏的 FlowSystem 阶段钩子 |

拆分门槛：

- 命令数或事件数达到中等复杂度时，第一天就把 `types.ts` 拆成 barrel + `core-types.ts` / `commands.ts` / `events.ts`。
- `execute.ts` 或 `reducer.ts` 接近约 `1,000` 行、命令 / 事件超过约 `15` 个，按实体或命令类别拆到子目录。
- `game.ts` 超过约 `1,000` 行、出现大型 `switch` 或同时承担 validate / execute / reduce 时，必须拆到 `domain/` 或行为 owner；只有 owner 表证明它仍是单一入口组装职责时，才允许白名单放行；不要让 adapter 承担规则实现。
- `Board.tsx` 超过约 `1,000` 行时先做体量审查；同时出现动作列表、派生读模型、Surface JSX、教程 / 动画状态和调试面板且未通过白名单裁决时，必须先拆 Surface、read model、controller hook 或 action model，再继续追加功能。
- UI 子模块只承担显示和玩家动作承接；规则合法性、资源消耗、随机和胜负判断不得放进 UI。

## 引擎组装边界

- 所有游戏通过 `createGameEngine` 接入领域内核。
- 阶段以 `G.sys.phase` 为单一权威；阶段推进由 FlowSystem 和游戏 `flowHooks` 裁定。
- 新游戏默认使用 `createBaseSystems`；是否接入 Flow、Cheat、CharacterSelection、ResponseWindow、Tutorial、AI 等系统，按当前规则合同和支撑能力矩阵裁定。
- ResponseWindow、Interaction、ActionLog、Undo、EventStream 等共享系统只通过正式配置或领域事件消费；禁止为单游戏改引擎文件做特判。

## Manifest 与资源

- `manifest.id` 与目录名一致。
- 游戏类型为 `game` 时必须有 `game.ts` 和 `Board.tsx`。
- `src/games/manifest*.generated.ts(x)` 是生成文件，禁止手改；新增 / 修改 manifest 后运行 `npm run generate:manifests`。
- 图片资源走 `public/assets/i18n/<locale>/<gameId>/` 和对应 manifest；代码里不得硬编码 `compressed/` 或服务器 URL。

## 最小骨架验收

设计门通过前的非 UI 骨架只能证明：

- 非 UI 目录职责、规则来源和资源索引已建立，且没有把规则事实写进 UI 或占位文案。
- manifest 可生成，大厅能发现游戏。
- Domain setup、validate / execute / reduce / isGameOver 可以作为草稿或低层验证，但不得据此宣称正式游戏骨架完成。
- tutorial、audio、critical image、debug 等占位项已登记到后续收尾清单，不被误报为完成。

只有 Open Design 设计稿、UI-facing 数据模型和用户批准记录齐全后，才能补齐正式 Board / `ui/` 并进行完整 S1 骨架验收；此时还必须证明 Board 能从正式 route 挂载，不依赖隐藏调试命令。
