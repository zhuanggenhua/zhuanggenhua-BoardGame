import type { BetrayalCore } from "./game";

type BetrayalTutorialRuntimeSystemState = {
  eventStream?: { nextId?: number; entries?: unknown[] };
  decisionEpoch?: number;
  interaction?: { current?: { id?: string } };
  responseWindow?: { current?: { id?: string; currentResponderIndex?: number } };
};

export function buildBetrayalTutorialRuntimeSyncKey({
  core,
  sys,
}: {
  core: BetrayalCore;
  sys?: BetrayalTutorialRuntimeSystemState;
}): string {
  const explorers = [core.currentExplorer, ...core.otherExplorers]
    .map((explorer) =>
      [
        explorer.playerId,
        explorer.roomId,
        explorer.inventory.map((card) => card.id).join("/"),
      ].join(":"),
    )
    .join(";");
  const pendingCards = (core.pendingCardResolutionQueue ?? [])
    .map((resolution) =>
      [
        resolution.id,
        resolution.playerId,
        resolution.cardName,
        (resolution.requiredPlayerIds ?? []).join("/"),
        (resolution.acknowledgedPlayerIds ?? []).join("/"),
      ].join(":"),
    )
    .join(";");
  const discoveredRooms = core.rooms
    .filter((room) => room.state === "discovered")
    .map((room) => `${room.id}:${room.visualId}`)
    .join(",");

  return [
    sys?.eventStream?.nextId ?? 0,
    sys?.eventStream?.entries?.length ?? 0,
    sys?.decisionEpoch ?? 0,
    sys?.interaction?.current?.id ?? "",
    sys?.responseWindow?.current?.id ?? "",
    sys?.responseWindow?.current?.currentResponderIndex ?? "",
    core.phase,
    core.currentPlayer,
    core.recommendedAction,
    core.movesRemaining,
    core.activeRoomId,
    core.latestDiscovery?.kind ?? "",
    core.latestDiscovery?.title ?? "",
    core.latestDiscoveryOwnerPlayerId ?? "",
    core.recentRoll?.id ?? "",
    core.recentRoll?.kind ?? "",
    core.recentRoll?.dice.join("/") ?? "",
    core.scenarioRuntime.hauntTriggered ? "haunt" : "pre-haunt",
    core.scenarioRuntime.hauntScenarioCardId ?? "",
    core.scenarioRuntime.traitorPlayerId ?? "",
    pendingCards,
    explorers,
    discoveredRooms,
  ].join("|");
}
