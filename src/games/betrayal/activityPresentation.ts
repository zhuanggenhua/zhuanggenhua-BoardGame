import type { BetrayalCore } from "./game";

type ActivityText = (key: string, options?: Record<string, unknown>) => string;

type BetrayalActivityEntry = BetrayalCore["activityLog"][number];

export type BetrayalBoardResultFeedback = {
  kind: "heal";
  title: string;
  detail: string;
  targetName: string | null;
  targetLabel: string | null;
  traitSummary: string;
  traitCount: number;
  meta: string;
};

export type BetrayalActivityPresentation = {
  visibleActivityEntries: BetrayalActivityEntry[];
  latestLogEntry: BetrayalActivityEntry | null;
  visibleBoardResultFeedback: BetrayalBoardResultFeedback | null;
  earlierLogEntries: BetrayalActivityEntry[];
};

export function resolveBetrayalActivityPresentation({
  core,
  text,
}: {
  core: BetrayalCore;
  text: ActivityText;
}): BetrayalActivityPresentation {
  const visibleActivityEntries = core.activityLog.filter(
    (entry) => !entry.id.startsWith("scenario-started-"),
  );
  const latestLogEntry = visibleActivityEntries[0] ?? null;
  const visibleBoardResultFeedback = resolveBoardResultFeedback(
    latestLogEntry,
    text,
  );
  return {
    visibleActivityEntries,
    latestLogEntry,
    visibleBoardResultFeedback,
    earlierLogEntries: visibleActivityEntries.slice(1, 4),
  };
}

function resolveBoardResultFeedback(
  latestLogEntry: BetrayalActivityEntry | null,
  text: ActivityText,
): BetrayalBoardResultFeedback | null {
  const logText = latestLogEntry?.text?.trim();
  if (!logText) {
    return null;
  }
  const healMatch = logText.match(/埋葬([^，,。]+)[，,]\s*(治疗.+)$/);
  if (!healMatch) {
    return null;
  }
  const cardName = healMatch[1]?.trim() || text("board.inventory.item");
  const resultText = healMatch[2]?.trim() ?? "";
  const healDetailMatch = resultText.match(/^治疗(.+?)的(.+)$/);
  const targetName = healDetailMatch?.[1]?.trim() ?? null;
  const traitText = healDetailMatch?.[2]?.trim() ?? "";
  const traitNames = traitText
    ? traitText
        .split("和")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
  return {
    kind: "heal",
    title: `${cardName}已使用`,
    detail: resultText,
    targetName,
    targetLabel: targetName ? `治疗目标：${targetName}` : null,
    traitSummary: traitNames.length > 0 ? traitNames.join(" / ") : traitText,
    traitCount: traitNames.length,
    meta: "物品已移除",
  };
}
