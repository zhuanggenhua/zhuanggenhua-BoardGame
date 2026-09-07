import { BETRAYAL_COMMANDS } from "./commands";
import type {
  BetrayalCore,
  BetrayalExplorerSummary,
  BetrayalMonsterSummary,
  BetrayalRoomNode,
} from "./game";
import {
  resolveHelpingHandsTrollHandAttackOptions,
  resolveHelpingHandsTrollHandMoveOptions,
  type BetrayalHelpingHandsTrollHandAttackOption,
} from "./hauntAttackRewardReadModel";
import { resolveHelpingHandsControllerPlayerId } from "./hauntScenarioReadModel";
import {
  resolveBetrayalMonsterActionPanel,
  resolveBetrayalNormalMonsterAttackTargets,
  resolveHelpingHandsMonsterTurnStatus,
  resolveMagicCameraPhantomAttackTargets,
  type BetrayalHelpingHandsMonsterTurnStatus,
  type BetrayalMonsterActionPanelReadModel,
  type BetrayalMonsterActionSlot,
} from "./monsterActionReadModel";

export type BetrayalPhantomPhotographerAttackOption = {
  monsterId: string;
  targetPlayerId: string;
};

export type BetrayalHelpingHandsTrollHandMoveEntry = {
  monster: BetrayalMonsterSummary;
  fromRoom: BetrayalRoomNode | null;
  targetRooms: BetrayalRoomNode[];
  targetRoomIds: ReadonlySet<string>;
  moveRemaining: number;
};

export type BetrayalMonsterMoveEntry = {
  slot: BetrayalMonsterActionSlot & { monsterId: string };
  monster: BetrayalMonsterSummary;
  targetRooms: BetrayalRoomNode[];
  targetRoomIds: ReadonlySet<string>;
  moveRemaining: number;
};

export type BetrayalMonsterAttackEntry = {
  kind: "phantom-photographer" | "normal";
  slot: BetrayalMonsterActionSlot & { monsterId: string };
  monster: BetrayalMonsterSummary;
  targetPlayerIds: ReadonlySet<string>;
};

export type BetrayalMonsterActionSelectionReadModel = {
  phantomPhotographerAttackOptions: BetrayalPhantomPhotographerAttackOption[];
  helpingHandsTrollHandAttackOptions: BetrayalHelpingHandsTrollHandAttackOption[];
  helpingHandsMonsterTurnStatus: BetrayalHelpingHandsMonsterTurnStatus;
  isHelpingHandsMonsterTurnController: boolean;
  helpingHandsTrollHandMoveEntries: BetrayalHelpingHandsTrollHandMoveEntry[];
  selectedHelpingHandsTrollHandMoveEntry: BetrayalHelpingHandsTrollHandMoveEntry | null;
  selectedHelpingHandsTrollHandMoveMonsterId: string | null;
  isHelpingHandsTrollHandMoveMode: boolean;
  helpingHandsMovableTrollHandIds: ReadonlySet<string>;
  monsterActionPanel: BetrayalMonsterActionPanelReadModel;
  isDeadTraitorJackSpiritControlTurn: boolean;
  controlledMoveMonsterId: string | null;
  monsterTurnStartActionSlot: BetrayalMonsterActionSlot | null;
  monsterMovementRollActionSlot: BetrayalMonsterActionSlot | null;
  bloodFromStoneMonsterTurnEndActionSlot: BetrayalMonsterActionSlot | null;
  monsterMoveSlots: Array<BetrayalMonsterActionSlot & { monsterId: string }>;
  selectedMonsterMoveSlot:
    | (BetrayalMonsterActionSlot & { monsterId: string })
    | null;
  selectedMonsterMoveEntry: BetrayalMonsterMoveEntry | null;
  selectedMonsterMoveMonsterId: string | null;
  isMonsterMoveMode: boolean;
  monsterMovableIds: ReadonlySet<string>;
  phantomPhotographerAttackMonsterIds: ReadonlySet<string>;
  monsterAttackSlots: Array<BetrayalMonsterActionSlot & { monsterId: string }>;
  selectedMonsterAttackSlot:
    | (BetrayalMonsterActionSlot & { monsterId: string })
    | null;
  selectedMonsterAttackEntry: BetrayalMonsterAttackEntry | null;
  selectedMonsterAttackSourceId: string | null;
  isMonsterAttackMode: boolean;
  monsterAttackableIds: ReadonlySet<string>;
  phantomPhotographerTargetPlayerIds: ReadonlySet<string>;
  selectedMonsterAttackTargetPlayerIds: ReadonlySet<string>;
  helpingHandsTrollHandAttackTargetsByOptionId: ReadonlyMap<
    string,
    BetrayalExplorerSummary
  >;
  helpingHandsVisibleTrollHandAttackOptions: BetrayalHelpingHandsTrollHandAttackOption[];
  helpingHandsTrollHandAttackTargetPlayerIds: ReadonlySet<string>;
  helpingHandsCombinedTrollHandAttackOption: BetrayalHelpingHandsTrollHandAttackOption | null;
  helpingHandsTrollHandAttackOption: BetrayalHelpingHandsTrollHandAttackOption | null;
  helpingHandsTrollHandAttackTarget: BetrayalExplorerSummary | null;
};

export function resolveBetrayalMonsterActionSelectionReadModel({
  core,
  allExplorers,
  viewerPlayerId,
  interactionMode,
  selectedHelpingHandsTrollHandMoveMonsterId,
  selectedMonsterMoveMonsterId,
  selectedMonsterAttackMonsterId,
  selectedHelpingHandsTrollHandTargetPlayerId,
}: {
  core: BetrayalCore;
  allExplorers: readonly BetrayalExplorerSummary[];
  viewerPlayerId: string;
  interactionMode: string;
  selectedHelpingHandsTrollHandMoveMonsterId: string | null;
  selectedMonsterMoveMonsterId: string | null;
  selectedMonsterAttackMonsterId: string | null;
  selectedHelpingHandsTrollHandTargetPlayerId: string | null;
}): BetrayalMonsterActionSelectionReadModel {
  const magicCamera = core.scenarioRuntime.magicCamera;
  const phantomPhotographerAttackOptions =
    core.phase === "haunt" &&
    core.scenarioRuntime.hauntCardNumber === 33 &&
    core.scenarioRuntime.traitorPlayerId === core.currentExplorer.playerId &&
    magicCamera &&
    !core.scenarioRuntime.deadExplorerPlayerIds.includes(
      core.currentExplorer.playerId,
    )
      ? core.monsters
          .filter(
            (monster) =>
              magicCamera.phantomPhotographerIds.includes(monster.id) &&
              !magicCamera.killedPhantomPhotographerIds.includes(monster.id) &&
              !magicCamera.stunnedPhantomPhotographerIds.includes(monster.id),
          )
          .flatMap((monster) =>
            resolveMagicCameraPhantomAttackTargets(core, monster).map(
              (target) => ({
                monsterId: monster.id,
                targetPlayerId: target.playerId,
              }),
            ),
          )
      : [];
  const helpingHandsTrollHandAttackOptions =
    core.phase === "haunt" &&
    resolveHelpingHandsControllerPlayerId(core) === viewerPlayerId
      ? resolveHelpingHandsTrollHandAttackOptions(core)
      : [];
  const helpingHandsMonsterTurnStatus =
    resolveHelpingHandsMonsterTurnStatus(core);
  const isHelpingHandsMonsterTurnController =
    core.phase === "haunt" &&
    helpingHandsMonsterTurnStatus.active &&
    helpingHandsMonsterTurnStatus.controllerPlayerId === viewerPlayerId;
  const helpingHandsTrollHandMoveEntries =
    isHelpingHandsMonsterTurnController
      ? helpingHandsMonsterTurnStatus.trollHandIds
          .map((monsterId) => {
            const monster =
              core.monsters.find((candidate) => candidate.id === monsterId) ??
              null;
            if (!monster) {
              return null;
            }
            const fromRoom =
              core.rooms.find((room) => room.id === monster.roomId) ?? null;
            const targetRooms = resolveHelpingHandsTrollHandMoveOptions(
              core,
              monster.id,
            );
            if (targetRooms.length === 0) {
              return null;
            }
            return {
              monster,
              fromRoom,
              targetRooms,
              targetRoomIds: new Set(targetRooms.map((room) => room.id)),
              moveRemaining:
                helpingHandsMonsterTurnStatus.moveRemainingById[monster.id] ??
                0,
            };
          })
          .filter(
            (
              entry,
            ): entry is BetrayalHelpingHandsTrollHandMoveEntry =>
              Boolean(entry),
          )
      : [];
  const selectedHelpingHandsTrollHandMoveEntry =
    helpingHandsTrollHandMoveEntries.find(
      (entry) =>
        entry.monster.id === selectedHelpingHandsTrollHandMoveMonsterId,
    ) ??
    helpingHandsTrollHandMoveEntries[0] ??
    null;
  const activeHelpingHandsTrollHandMoveMonsterId =
    selectedHelpingHandsTrollHandMoveEntry?.monster.id ?? null;
  const isHelpingHandsTrollHandMoveMode =
    interactionMode === "helpingHandsTrollMove" &&
    Boolean(selectedHelpingHandsTrollHandMoveEntry);
  const helpingHandsMovableTrollHandIds = new Set(
    helpingHandsTrollHandMoveEntries.map((entry) => entry.monster.id),
  );
  const monsterActionPanel = resolveBetrayalMonsterActionPanel(core);
  const isDeadTraitorJackSpiritControlTurn =
    core.phase === "haunt" &&
    core.scenarioRuntime.traitorPlayerId === core.currentPlayer &&
    core.scenarioRuntime.deadExplorerPlayerIds.includes(core.currentPlayer) &&
    core.scenarioRuntime.jackSpiritReleased &&
    Boolean(core.scenarioRuntime.jackSpiritRoomId);
  const controlledMoveMonsterId =
    isDeadTraitorJackSpiritControlTurn &&
    core.monsters.some((monster) => monster.id === "jack-spirit")
      ? "jack-spirit"
      : (() => {
          const feverishMonsterId = `feverish-${core.currentExplorer.playerId}`;
          const controlsFeverish =
            core.phase === "haunt" &&
            core.scenarioRuntime.deadExplorerPlayerIds.includes(
              core.currentExplorer.playerId,
            ) &&
            (core.scenarioRuntime.dust?.feverishPlayerIds ?? []).includes(
              core.currentExplorer.playerId,
            ) &&
            core.monsters.some((monster) => monster.id === feverishMonsterId);
          return controlsFeverish ? feverishMonsterId : null;
        })();
  const monsterTurnStartActionSlot =
    monsterActionPanel.slots.find(
      (slot) => slot.kind === "turn-start" && slot.enabled && slot.monsterId,
    ) ?? null;
  const monsterMovementRollActionSlot = !monsterTurnStartActionSlot
    ? (monsterActionPanel.slots.find(
        (slot) => slot.kind === "movement-roll" && slot.enabled && slot.groupId,
      ) ?? null)
    : null;
  const bloodFromStoneMonsterTurnEndActionSlot =
    !monsterTurnStartActionSlot && !monsterMovementRollActionSlot
      ? (monsterActionPanel.slots.find(
          (slot) =>
            slot.kind === "end-turn" &&
            slot.command ===
              BETRAYAL_COMMANDS.END_BLOOD_FROM_STONE_MONSTER_TURN &&
            slot.enabled,
        ) ?? null)
      : null;
  const monsterMoveSlots = monsterActionPanel.slots.filter(
    (slot): slot is BetrayalMonsterActionSlot & { monsterId: string } =>
      slot.kind === "move" && Boolean(slot.monsterId) && slot.enabled,
  );
  const selectedMonsterMoveSlot =
    monsterMoveSlots.find(
      (slot) => slot.monsterId === selectedMonsterMoveMonsterId,
    ) ??
    monsterMoveSlots[0] ??
    null;
  const selectedMonsterMoveEntry = (() => {
    if (!selectedMonsterMoveSlot) {
      return null;
    }
    const monster =
      core.monsters.find(
        (candidate) => candidate.id === selectedMonsterMoveSlot.monsterId,
      ) ?? null;
    if (!monster) {
      return null;
    }
    const targetRooms = selectedMonsterMoveSlot.targetRoomIds
      .map((roomId) => core.rooms.find((room) => room.id === roomId) ?? null)
      .filter((room): room is BetrayalRoomNode => Boolean(room));
    if (targetRooms.length === 0) {
      return null;
    }
    return {
      slot: selectedMonsterMoveSlot,
      monster,
      targetRooms,
      targetRoomIds: new Set(targetRooms.map((room) => room.id)),
      moveRemaining: selectedMonsterMoveSlot.moveRemaining ?? 0,
    };
  })();
  const activeMonsterMoveMonsterId =
    selectedMonsterMoveEntry?.monster.id ?? null;
  const isMonsterMoveMode =
    interactionMode === "monsterMove" && Boolean(selectedMonsterMoveEntry);
  const monsterMovableIds = new Set(
    monsterMoveSlots.map((slot) => slot.monsterId),
  );
  const phantomPhotographerAttackMonsterIds = new Set(
    phantomPhotographerAttackOptions.map((option) => option.monsterId),
  );
  const monsterAttackSlots = monsterActionPanel.slots.filter(
    (slot): slot is BetrayalMonsterActionSlot & { monsterId: string } =>
      slot.kind === "attack" &&
      Boolean(slot.monsterId) &&
      slot.enabled &&
      (phantomPhotographerAttackMonsterIds.has(slot.monsterId) ||
        slot.monsterId === "jack-spirit" ||
        slot.command === BETRAYAL_COMMANDS.MONSTER_ATTACK_HERO),
  );
  const selectedMonsterAttackSlot =
    monsterAttackSlots.find(
      (slot) => slot.monsterId === selectedMonsterAttackMonsterId,
    ) ??
    monsterAttackSlots[0] ??
    null;
  const selectedMonsterAttackEntry = (() => {
    if (!selectedMonsterAttackSlot) {
      return null;
    }
    const monster =
      core.monsters.find(
        (candidate) => candidate.id === selectedMonsterAttackSlot.monsterId,
      ) ?? null;
    if (!monster) {
      return null;
    }
    const phantomPhotographerTargetPlayerIds = new Set(
      phantomPhotographerAttackOptions
        .filter((option) => option.monsterId === monster.id)
        .map((option) => option.targetPlayerId),
    );
    if (phantomPhotographerTargetPlayerIds.size > 0) {
      return {
        kind: "phantom-photographer" as const,
        slot: selectedMonsterAttackSlot,
        monster,
        targetPlayerIds: phantomPhotographerTargetPlayerIds,
      };
    }
    const normalAttackTargets = resolveBetrayalNormalMonsterAttackTargets(
      core,
      monster.id,
    );
    if (
      !normalAttackTargets?.canResolveWithExistingCommand ||
      normalAttackTargets.targetPlayerIds.length === 0
    ) {
      return null;
    }
    return {
      kind: "normal" as const,
      slot: selectedMonsterAttackSlot,
      monster,
      targetPlayerIds: new Set(normalAttackTargets.targetPlayerIds),
    };
  })();
  const selectedMonsterAttackSourceId =
    interactionMode === "monsterAttack" &&
    selectedMonsterAttackMonsterId &&
    monsterAttackSlots.some(
      (slot) => slot.monsterId === selectedMonsterAttackMonsterId,
    )
      ? selectedMonsterAttackMonsterId
      : null;
  const isMonsterAttackMode =
    interactionMode === "monsterAttack" &&
    Boolean(selectedMonsterAttackEntry);
  const monsterAttackableIds = new Set(
    monsterAttackSlots.map((slot) => slot.monsterId),
  );
  const phantomPhotographerTargetPlayerIds =
    isMonsterAttackMode &&
    selectedMonsterAttackSourceId &&
    selectedMonsterAttackEntry?.kind === "phantom-photographer"
      ? selectedMonsterAttackEntry.targetPlayerIds
      : new Set<string>();
  const selectedMonsterAttackTargetPlayerIds =
    isMonsterAttackMode &&
    selectedMonsterAttackSourceId &&
    selectedMonsterAttackEntry
      ? selectedMonsterAttackEntry.targetPlayerIds
      : new Set<string>();
  const helpingHandsTrollHandAttackTargetsByOptionId = new Map<
    string,
    BetrayalExplorerSummary
  >();
  helpingHandsTrollHandAttackOptions.forEach((option) => {
    const target =
      allExplorers.find(
        (explorer) =>
          explorer.playerId === selectedHelpingHandsTrollHandTargetPlayerId &&
          option.targetPlayerIds.includes(explorer.playerId),
      ) ??
      allExplorers.find(
        (explorer) =>
          option.targetPlayerIds.includes(explorer.playerId) &&
          explorer.playerId !== core.currentExplorer.playerId,
      ) ??
      allExplorers.find((explorer) =>
        option.targetPlayerIds.includes(explorer.playerId),
      ) ??
      null;
    if (target) {
      helpingHandsTrollHandAttackTargetsByOptionId.set(option.id, target);
    }
  });
  const helpingHandsVisibleTrollHandAttackOptions =
    helpingHandsTrollHandAttackOptions.filter((option) =>
      helpingHandsTrollHandAttackTargetsByOptionId.has(option.id),
    );
  const helpingHandsTrollHandAttackTargetPlayerIds = new Set(
    helpingHandsVisibleTrollHandAttackOptions.flatMap(
      (option) => option.targetPlayerIds,
    ),
  );
  const helpingHandsCombinedTrollHandAttackOption =
    helpingHandsVisibleTrollHandAttackOptions.find((option) => option.combined) ??
    null;
  const helpingHandsTrollHandAttackOption =
    (selectedHelpingHandsTrollHandTargetPlayerId &&
      (helpingHandsVisibleTrollHandAttackOptions.find(
        (option) =>
          option.combined &&
          option.targetPlayerIds.includes(
            selectedHelpingHandsTrollHandTargetPlayerId,
          ),
      ) ??
        helpingHandsVisibleTrollHandAttackOptions.find((option) =>
          option.targetPlayerIds.includes(
            selectedHelpingHandsTrollHandTargetPlayerId,
          ),
        ))) ||
    helpingHandsCombinedTrollHandAttackOption ||
    helpingHandsVisibleTrollHandAttackOptions[0] ||
    null;
  const helpingHandsTrollHandAttackTarget = helpingHandsTrollHandAttackOption
    ? (helpingHandsTrollHandAttackTargetsByOptionId.get(
        helpingHandsTrollHandAttackOption.id,
      ) ?? null)
    : null;

  return {
    phantomPhotographerAttackOptions,
    helpingHandsTrollHandAttackOptions,
    helpingHandsMonsterTurnStatus,
    isHelpingHandsMonsterTurnController,
    helpingHandsTrollHandMoveEntries,
    selectedHelpingHandsTrollHandMoveEntry,
    selectedHelpingHandsTrollHandMoveMonsterId:
      activeHelpingHandsTrollHandMoveMonsterId,
    isHelpingHandsTrollHandMoveMode,
    helpingHandsMovableTrollHandIds,
    monsterActionPanel,
    isDeadTraitorJackSpiritControlTurn,
    controlledMoveMonsterId,
    monsterTurnStartActionSlot,
    monsterMovementRollActionSlot,
    bloodFromStoneMonsterTurnEndActionSlot,
    monsterMoveSlots,
    selectedMonsterMoveSlot,
    selectedMonsterMoveEntry,
    selectedMonsterMoveMonsterId: activeMonsterMoveMonsterId,
    isMonsterMoveMode,
    monsterMovableIds,
    phantomPhotographerAttackMonsterIds,
    monsterAttackSlots,
    selectedMonsterAttackSlot,
    selectedMonsterAttackEntry,
    selectedMonsterAttackSourceId,
    isMonsterAttackMode,
    monsterAttackableIds,
    phantomPhotographerTargetPlayerIds,
    selectedMonsterAttackTargetPlayerIds,
    helpingHandsTrollHandAttackTargetsByOptionId,
    helpingHandsVisibleTrollHandAttackOptions,
    helpingHandsTrollHandAttackTargetPlayerIds,
    helpingHandsCombinedTrollHandAttackOption,
    helpingHandsTrollHandAttackOption,
    helpingHandsTrollHandAttackTarget,
  };
}
