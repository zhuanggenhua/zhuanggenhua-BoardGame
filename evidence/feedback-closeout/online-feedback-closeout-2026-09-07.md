# 线上反馈收口证据（2026-09-07）

## 本轮口径

- 处理口径：线上真实反馈。
- 初始统计时间：北京时间 2026-09-07 20:42:12。
- 最终回查时间：北京时间 2026-09-07 20:54:04。
- 真实读取入口：`https://api.easyboardgame.top/admin-api/feedback`。
- 真实写回入口：无管理 token 时使用生产 Mongo SSH 写入口，本轮两条写回均为 `writer=mongo-ssh`。
- 本地镜像：`temp/feedback-closeout/status-board.json`，只作为线上状态镜像，不是正式源。

## 初始线上读取

- 命令：`node .spec/skills/feedback-closeout/scripts/triage-open-feedback.mjs --statuses open,in_progress --limit 100 --slots 8 --mark-in-progress --out-dir temp/feedback-closeout/online-20260907-continue`
- 结果：`open=0`，`in_progress=2`，共 2 条代表项。
- 诊断包：
  - `temp/feedback-closeout/online-20260907-continue/6a9db27bdef4f2f0ea8353e3.md`
  - `temp/feedback-closeout/online-20260907-continue/6a9d643ddef4f2f0ea834ee5.md`

## 反馈结论

### 6a9db27bdef4f2f0ea8353e3

- 反馈原文：`[auto][react.error_boundary] Cannot read properties of undefined (reading 'default')`
- 现实含义：生产首页 `/` 的 React 懒加载组件解析失败，页面进入全局错误页并自动上报。
- 关键证据：错误堆栈命中 `Lazy` / `Suspense`，并出现在生产前端资源 `vendor-react-BClYuNVW.js` 与 `ConfigReviewRoutes-DVZ1ARDO.js` 附近；提交者 UA 为 `PerplexityBot/1.0`。
- 本轮修复：`src/lib/staleChunkReloadGuard.ts` 将 React lazy 解析 `default` 失败且堆栈来自生产 React chunk 的错误识别为旧包 / 懒加载失败，触发一次自动刷新；没有生产 chunk 堆栈的普通 `default` 读取错误仍不被当成旧包错误。
- 状态回写：北京时间 2026-09-07 20:53:11 已通过生产 Mongo SSH 写回 `resolved`，`matchedCount=1`，`modifiedCount=1`。

### 6a9d643ddef4f2f0ea834ee5

- 反馈原文：`[system][online-ai-watchdog] unsatisfiable-interaction-auto-skipped empty-options`
- 游戏 / 对象：Dice Throne，在线 AI watchdog，主阶段 `main1` 的 `card-give-hand` 多步骰子选择交互。
- 现实故障现象：AI 座位收到 `card-give-hand` 交互时，诊断显示可选项为 0，系统只能生成“跳过（无可用选项）”。
- 原始对局：`AT2AWtBdm9m`。
- 生产回查：`matches / rooms / gameStates / matchStates` 四个常见集合均查不到该对局，无法整局回放原始现场。
- 当前验证：当前代码已有与反馈快照同形状的回归，主阶段 `card-give-hand` 会从正在结算的奖励骰区枚举可重掷骰子，不再只生成空选项取消。
- 状态回写：北京时间 2026-09-07 20:53:43 已通过生产 Mongo SSH 写回 `resolved`，`matchedCount=1`，`modifiedCount=1`。

## 验证

- 针对性回归：`node scripts/infra/vitest-cli-safe.mjs run src/lib/__tests__/staleChunkReloadGuard.test.ts src/pages/__tests__/ConfigReviewRoutes.lazy.test.ts src/games/dicethrone/__tests__/basic-commands-coverage.test.ts --configLoader native --pool forks --no-file-parallelism --maxWorkers 1 --reporter=dot -t "staleChunkReloadGuard|ConfigReviewRoutes lazy page modules|线上反馈：main1 中抬一手"`：3 个测试文件通过，9 passed。
- 类型检查：`npm run typecheck`：通过。
- 本地镜像校验：`node scripts/verify/verify-feedback-status.mjs temp/feedback-closeout/status-board.json`：`feedback-status: ok`。

## 最终回查

- 命令：`node .spec/skills/feedback-closeout/scripts/triage-open-feedback.mjs --statuses open,in_progress --limit 100 --slots 8 --out-dir temp/feedback-closeout/online-20260907-final-recheck`
- 结果：`open=0`，`in_progress=0`，`totalFetched=0`，`uniqueGroups=0`。
- 精确回读：
  - `6a9db27bdef4f2f0ea8353e3`：生产状态为 `resolved`，`resolvedMethod` 已写入。
  - `6a9d643ddef4f2f0ea834ee5`：生产状态为 `resolved`，`resolvedMethod` 已写入。

## 剩余风险

- 本轮没有执行生产部署；代码修复进入线上仍需要后续按正式发布链路部署。
- Dice Throne 原始对局已不存在，本轮不能声称整局真实回放通过；结论基于反馈快照同形状回归和当前代码验证。

## 追加线上读取（北京时间 2026-09-07 23:37）

- 处理口径：线上真实反馈。
- 命令：`node .spec/skills/feedback-closeout/scripts/triage-open-feedback.mjs --base-url https://api.easyboardgame.top --statuses open,in_progress --limit 100 --out-dir temp/feedback-closeout/2026-09-07-current-recheck`
- 结果：`open=0`，`in_progress=2`，共 2 条代表项。
- 本地镜像：`temp/feedback-closeout/status-board.json`，仍只作为线上状态镜像。

### 6a9ec0a5def4f2f0ea8359ee

- 反馈原文：`[system][online-ai-watchdog] unsatisfiable-interaction-auto-skipped empty-options`
- 现实含义：Dice Throne 在线 AI 在 `main1` 主阶段处理 `card-give-hand`（抬一手）的多步选骰交互时，可选骰子被算成 0 个，但该交互要求至少选 1 个，系统只能生成“跳过（无可用选项）”。
- 关键快照：`matchId=q6FkI-m4nGl`，`playerId=1`，`currentPlayerId=0`，`phase=main1`，`sourceId=card-give-hand`，`sharedSelectability.totalOptions=0`，`enabledOptions=0`，`minSelectionCount=1`，合法动作只有 `interaction-cancel`。
- 原始对局回查：生产 Mongo 的 `matches` / `matchrecords` 未查到 `q6FkI-m4nGl`，不能声称整局真实回放通过。
- 本轮根因：可打牌判断能看到刚确认的普通骰区，但后续多步选骰和 AI 合法动作在 `main1` 按当前阶段查骰区，旧状态没有显式 `currentRollContext` 时无法回推到原投骰阶段，导致可选骰为空。
- 本轮修复：`src/games/dicethrone/domain/rollContext.ts` 允许 `undefined` / `main1` / `main2` 在没有显式当前骰区上下文时，从已确认的普通投骰状态恢复原投骰阶段；其它阶段不放宽。
- 回归测试：`src/games/dicethrone/__tests__/basic-commands-coverage.test.ts` 增加同形用例“线上反馈：main1 中抬一手应从已确认普通骰区生成可执行重掷，而不是空选项取消”，断言 AI 不再只生成空选项取消，并且生成的 `REROLL_DIE` 能通过真实命令管线执行。
- 验证：`npx vitest run src/games/dicethrone/__tests__/basic-commands-coverage.test.ts src/games/dicethrone/__tests__/roll-context.test.ts src/games/dicethrone/__tests__/response-window-interaction-lock.test.ts --configLoader native --reporter=dot`：3 个测试文件通过，242 passed。
- 类型检查：`npm run typecheck`：通过。
- 状态回写：北京时间 2026-09-07 23:38:27 已通过生产 Mongo SSH 写回 `resolved`，`matchedCount=1`，`modifiedCount=1`，并同步本地镜像。

### 6a9ed318def4f2f0ea835ba9

- 反馈原文：`[system][infra-cpu-watch] game-server CPU sustained high: average=100.84% highSamples=3/3 threshold=80% decision=restarted restarted=yes`
- 现实含义：生产游戏服务器容器连续 3 次采样超过 80% CPU，平均 100.84%，看门脚本已执行重启并上报系统反馈。
- 证据文件：生产机 `/home/admin/BoardGame/logs/game-server-cpu-watch/20260907T150602Z-boardgame-game-server.txt`。
- 采样证据：`86.09%`、`112.12%`、`104.30%`，平均 `100.84%`，决策为 `restarted=yes`。
- 重启证据：容器 `boardgame-game-server` 当前 `startedAt=2026-09-07T15:07:04.339834284Z`，与告警后重启时间吻合；`restart-history.log` 后续多轮为 `decision=ok`。
- 当前恢复证据：北京时间 2026-09-07 23:39 左右 `docker stats` 回查 `boardgame-game-server` CPU 约 `3.94%`，内存约 `503.6MiB / 1GiB`。
- 采样文件分析：`20260907T150602Z-boardgame-game-server.cpuprofile` 显示耗时集中在在线 AI 自动恢复、状态广播、差异计算、状态保存前清理和 Mongo 写入相关路径；同期日志存在 Dice Throne 对局 `3uEIQpc_Wdd` 在短时间内连续出现过期操作，状态号从 838 上升到 1175 以上。
- 当前结论：这条反馈只能证明“已自动重启止血且当前恢复”，还不能证明根本原因已定位；缺少能把 CPU 峰值精确闭环到某个房间循环、请求风暴、代码死循环或特定状态膨胀的证据，因此本轮保持 `in_progress`，不写 `resolved`。

## 追加回查（北京时间 2026-09-07 23:42）

- 线上回查命令：`node .spec/skills/feedback-closeout/scripts/triage-open-feedback.mjs --base-url https://api.easyboardgame.top --statuses open,in_progress --limit 100 --out-dir temp/feedback-closeout/2026-09-07-after-dicethrone-resolve-recheck`
- 线上回查结果：`open=0`，`in_progress=1`，剩余 1 条代表项：`6a9ed318def4f2f0ea835ba9`。
- 最终回查命令：`node .spec/skills/feedback-closeout/scripts/triage-open-feedback.mjs --base-url https://api.easyboardgame.top --statuses open,in_progress --limit 100 --out-dir temp/feedback-closeout/2026-09-07-final-recheck-2343`
- 最终回查结果：`open=0`，`in_progress=1`，剩余 1 条代表项：`6a9ed318def4f2f0ea835ba9`。
- 生产 Mongo 精确回读：`6a9ec0a5def4f2f0ea8359ee` 为 `resolved`，`resolvedMethod` 完整；`6a9ed318def4f2f0ea835ba9` 仍为 `in_progress`。
- 本地镜像校验：`node scripts/verify/verify-feedback-status.mjs temp/feedback-closeout/status-board.json`：`feedback-status: ok`。
- 未部署说明：本轮没有执行生产部署；Dice Throne 修复已在本地验证并回写反馈状态，代码进入线上仍需后续发布链路。
