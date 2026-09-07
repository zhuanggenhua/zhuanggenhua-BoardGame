import { createBaseSystems, createGameEngine } from '../../engine';
import { registerGameAiRuntime } from '../../engine/ai';
import { registerCriticalImageResolver } from '../../core';
import type {
    DomainCore,
    GameEvent,
    MatchState,
    PlayerId,
    RandomFn,
    ValidationResult,
} from '../../engine/types';
import { createCheatSystem } from '../../engine/systems';
import {
    BETRAYAL_ACTION_LOG_ALLOWLIST,
    BETRAYAL_UNDO_ALLOWLIST,
    formatBetrayalActionEntry,
} from './actionLog';
import {
    cloneDiscoverySummary,
    clonePendingEventChoice,
    clonePendingEventRollResolution,
    cloneTurnEndedPayload,
} from './cardResolutionStateModel';
import {
    applyBetrayalDynamiteAttackResolvedState,
    applyBetrayalHauntAttackResolvedState,
    applyBetrayalHelpingHandsAttackRewardResolvedState,
    applyBetrayalHelpingHandsTrollHandAttackResolvedState,
    applyBetrayalMummyAttackRewardResolvedState,
} from './attackStateModel';
import {
    applyBetrayalBloodFromStoneExtraStoneCherubsPlacedState,
    applyBetrayalBloodFromStonePeekabooResolvedState,
} from './bloodFromStoneHauntStateModel';
import {
    applyBetrayalExorcismStudiedState,
    applyBetrayalJackExorcisedState,
    applyBetrayalJackLearnedState,
} from './crimsonJackHauntStateModel';
import {
    applyBetrayalDustCureResolvedState,
    applyBetrayalDustSearchResolvedState,
    applyBetrayalSicknessExchangeRequestedState,
    applyBetrayalSicknessExchangeResolvedState,
} from './dustHauntStateModel';
import {
    applyBetrayalMagicCameraSmashedState,
    applyBetrayalPhantomPhotographerAttackResolvedState,
    applyBetrayalPhotoTakenState,
} from './magicCameraHauntStateModel';
import {
    applyBetrayalMummyBanishmentLearnedState,
    applyBetrayalMummyBanishedState,
    applyBetrayalMummyGirlGivenState,
    applyBetrayalMummyGirlPickedUpState,
    applyBetrayalMummyNameStudiedState,
    applyBetrayalMummyOmenGivenState,
} from './mummyHauntStateModel';
import {
    applyBetrayalUponReflectionCurseBreakAttemptedState,
    applyBetrayalUponReflectionEventHintGivenState,
} from './uponReflectionHauntStateModel';
import {
    applyBetrayalTurnEndedState,
    applyBetrayalTurnEndRollAcknowledgedState,
} from './turnEndStateModel';
import { resolveBetrayalEndTurnCommandEvents } from './turnEndCommandResolutionModel';
import { applyBetrayalScenarioCompletedState } from './scenarioCompletionStateModel';
import { applyBetrayalHauntTriggeredState } from './hauntTriggeredStateModel';
import { betrayalCriticalImageResolver } from './criticalImageResolver';
import { createBetrayalAiRuntime } from './ai';
import { BETRAYAL_COMMANDS } from './commands';
import type { BetrayalCommand, BetrayalCommandMap } from './commandTypes';
import { EVENTS, type BetrayalEvent } from './events';
import {
    appendActivity,
    cloneMonster,
    clonePendingCardResolution,
    cloneScenarioRuntimeStatus,
    replaceExplorers,
    syncCurrentExplorerProjection,
} from './coreStateModel';
import { BETRAYAL_INITIAL_DECK_COUNTS } from './deckModel';
import { validateBetrayalEventChoiceResolution } from './eventChoiceResolutionModel';
import {
    resolveBetrayalCardResolutionAcknowledgedPayload,
    resolveBetrayalEventRolledPayload,
    resolveBetrayalEventRollFinalizedPayload,
    resolveBetrayalEventChoiceCommandEvents,
    resolveBetrayalRecentRollAcknowledgedPayload,
} from './eventCommandResolutionModel';
import {
    applyBetrayalEventChoiceResolvedState,
    applyBetrayalEventRollFinalizedState,
    applyBetrayalEventRolledState,
} from './eventResolutionStateModel';
import {
    rollBetrayalDicePips,
} from './diceRules';
import {
    resolveDustSicknessSwap,
    type BetrayalDustEndTurnResult,
} from './dustHauntRules';
import {
    applyBetrayalEventRollReplacementState,
} from './eventRollReplacementModel';
import {
    cloneRolledDamageResult,
    cloneSourceEventRoll,
} from './eventEffectResolutionModel';
import {
    canPlayerAcknowledgeRecentRoll,
    isPendingCardResolutionFullyAcknowledged,
    resolveAcknowledgeableRecentRoll,
    resolvePendingCardResolutionAcknowledgedPlayerIds,
    resolvePendingCardResolutionRequiredPlayerIds,
    resolvePendingEventRollResolutionAcknowledgedPlayerIds,
    resolvePendingEventRollResolutionRequiredPlayerIds,
    resolvePendingTurnEndRoll,
    resolveRecentRollRequiredPlayerIds,
} from './acknowledgementReadModel';
import {
    resolveBloodFromStoneSelectedExtraStoneCherubPlacements,
    resolveBloodFromStoneSetupPlacementPlan,
} from './bloodFromStoneSetupReadModel';
import {
    applyBetrayalCorpseLootedState,
    createBetrayalCorpseLootedPayload,
    resolveCorpseLootTargets,
} from './deathStateReadModel';
import {
    clonePendingDamageAllocation,
    formatDeathPreventionLog,
    resolveBetrayalDamageAllocationResolvedPayload,
    rollDeathPrevention,
    validateBetrayalDamageAllocationResolution,
    wouldExplorerDieFromAttackDamage,
    wouldExplorerDieFromMentalDamage,
} from './damageResolutionModel';
import { applyBetrayalDamageAllocationAftermathState } from './damageAftermathStateModel';
import {
    MUMMY_GIRL_STEAL_CARD_ID,
    resolveHelpingHandsPendingAttackReward,
    resolveHelpingHandsStealableCards,
    resolveHelpingHandsTrollHandAttackOptions,
    resolveHelpingHandsTrollHandMoveCost,
    resolveHelpingHandsTrollHandMoveOptions,
    resolveMummyGirlStealCard,
    resolveMummyPendingAttackReward,
    resolveMummyStealableCards,
    type BetrayalHelpingHandsAttackRewardChoice,
    type BetrayalMummyAttackRewardChoice,
} from './hauntAttackRewardReadModel';
import {
    resolveBetrayalHauntSetupQueue,
    resolveHauntSetupQueueWithEntryStatus,
    type BetrayalHauntSetupQueueEntry,
} from './hauntSetupModel';
import {
    cloneUponReflectionRuntimeState,
} from './hauntRuntimeSetupModel';
import {
    type BetrayalHauntFirstPlayerResolution,
    type BetrayalHauntTraitorResolution,
} from './hauntTraitorResolutionModel';
import {
    findMummyWeddingOmenCard,
} from './mummyHauntRules';
import {
    resolveMummyTraitorVictoryResult,
} from './hauntVictoryModel';
import {
    canCureTheDust,
    canSearchForCure,
    canSmashMagicCamera,
    canTakeMagicCameraPhoto,
    canUseStalkThePrey,
    countExorcismCirclesInRegion,
    resolveBloodFromStonePeekabooSelection,
    resolveStalkThePreyTargets,
    validateHauntSpecialActionBudget,
} from './hauntSpecialActionReadModel';
import {
    findHelpingHandsTrollHand,
    findMummyMonster,
    findPhantomPhotographer,
    hasBloodFromStoneMirror,
    hasLivingHeroWithBookInRoom,
    hasOmenBook,
    isBetrayalLibraryRoom,
    isBloodFromStoneHaunt,
    isDustHaunt,
    isHelpingHandsHaunt,
    isMagicCameraHaunt,
    isMummyHaunt,
    isMummyNameStudyRoom,
    isUponReflectionHaunt,
    isBetrayalPlayerControllingMonster,
    resolveControlledRoomId,
    shouldDeadPlayerControlFeverish,
} from './hauntScenarioReadModel';
import {
    createInitialMonsterTurnRuntimeState,
    canPlayerControlStandardMonsterTurn,
    resolveBloodFromStoneMonsterTurnStatus,
    resolveHelpingHandsMonsterTurnStatus,
    resolveMagicCameraPhantomAttackTargets,
    type BetrayalBloodFromStoneMonsterTurnRuntimeState,
    type BetrayalMonsterTurnRuntimeState,
} from './monsterActionReadModel';
import {
    isBetrayalBloodFromStoneMonsterTurnCommand,
    isBetrayalHelpingHandsMonsterTurnCommand,
    isBetrayalStandardMonsterTurnCommand,
    validateBetrayalMonsterActionCommand,
} from './monsterActionCommandValidation';
import {
    createBetrayalHelpingHandsMonsterTurnStartedEvent,
    resolveBetrayalMonsterAttackHeroResolvedPayload,
    resolveBetrayalMonsterDamageResolvedPayload,
    resolveBetrayalMonsterMovedPayload,
    resolveBetrayalMonsterMovementGroupRolledPayload,
    resolveBetrayalMonsterTurnStartResolvedPayload,
    resolveBloodFromStoneMonsterTurnEndedPayload,
} from './monsterActionResolutionModel';
import {
    applyBloodFromStoneMonsterTurnEndedState,
    applyBetrayalHelpingHandsMonsterTurnEndedState,
    applyBetrayalHelpingHandsMonsterTurnStartedState,
    applyBetrayalHelpingHandsTrollHandMovedState,
    applyBetrayalMonsterAttackHeroResolvedState,
    applyBetrayalMonsterDamageResolvedState,
    applyBetrayalMonsterMovedState,
    applyBetrayalMonsterMovementGroupRolledState,
    applyBetrayalMonsterTurnStartResolvedState,
} from './monsterActionStateModel';
import {
    canUseBookForPendingEventRoll,
    canUseHolySymbolForDiscovery,
    canUseIdolToSkipEvent,
    canUseSkeletonKeyForMove,
    resolveTurnStartInventoryCardIds,
    validateBetrayalPossessionSpecialActionCommand,
    validateBetrayalRecentRollRerollItemCommand,
} from './possessionActionReadModel';
import { resolveBetrayalRoomSpecialActionStatus } from './roomActionReadModel';
import {
    applyBetrayalRoomEffectUsedState,
    createBetrayalRoomEffectUsedPayload,
    type BetrayalRoomEnterEffect,
} from './roomEnterEffectModel';
import {
    type BetrayalRoomEndTurnEffect,
    type BetrayalRoomEndTurnEffectResult,
} from './roomEndTurnEffectModel';
import { applyBetrayalRoomExploredState } from './roomExploredStateModel';
import { applyBetrayalExplorerMovedState } from './movementStateModel';
import { resolveBetrayalExplorerMovedPayload } from './movementResolutionModel';
import { resolveBetrayalRoomExploredPayload } from './roomDiscoveryEventModel';
import { readBetrayalScenarioId } from './roomSetup';
import { canUseBetrayalTraitorPowers } from './traitorPowerRules';
import {
    rollNonCombatTraitCheck,
    rollNonCombatTraitCheckWithDice,
    rollTrait,
    rollTraitCheckWithDice,
} from './traitRollModel';
import {
    BETRAYAL_SCENARIO_CARD_IDS,
    BETRAYAL_DISCOVERY_POOLS,
    BETRAYAL_EXPLORER_CATALOG,
    BETRAYAL_SCENARIO_CONFIGS,
    BETRAYAL_SHARED_PRE_HAUNT_SETUP,
    DEFAULT_BETRAYAL_SCENARIO_CARD_ID,
    DEFAULT_BETRAYAL_SCENARIO_ID,
    getBetrayalScenarioCardCandidate,
    isBetrayalScenarioCardId,
    resolveImplementedScenarioIdForCard,
    type BetrayalDeckKind as ConfigDeckKind,
    type BetrayalHauntRevealResolution,
    type BetrayalRoomDoorway,
    type BetrayalRoomEdge,
    type BetrayalRoomFloor,
    type BetrayalRoomVisualId,
    type BetrayalEventSeed,
    type BetrayalInventoryKind as ConfigInventoryKind,
    type BetrayalInventorySeed,
    type BetrayalMonsterSeed,
    type BetrayalRecommendedAction as ConfigRecommendedAction,
    type BetrayalRoomDiscoverySymbol,
    type BetrayalRoomDiscoveryTemplate,
    type BetrayalRoomSeed,
    type BetrayalScenarioCardId,
    type BetrayalScenarioId,
    type BetrayalScenarioOutcome,
    type BetrayalTraitKey as ConfigTraitKey,
} from './scenarioConfig';
import {
    BETRAYAL_TRAIT_LABEL as TRAIT_LABEL,
    resolveInventoryEffectId,
    type UseEffectProfile,
} from './possessionEffects';
import {
    resolveBetrayalPossessionUsedPayload,
} from './possessionUseResolution';
import { applyBetrayalPossessionUsedState } from './possessionUseState';
import { applyBetrayalRecentRollRerollState } from './recentRollRerollStateModel';
import { resolveBetrayalRecentRollRerollPayload } from './recentRollRerollResolutionModel';
import {
    DRAW_POOL,
    cloneInventoryCard,
    clonePossessionOrderByKind,
} from './possessionDeckModel';
import {
    EVENT_POOL,
    cloneEventTemplate,
} from './eventDeckModel';
import type { BetrayalMonsterDefinitionId } from './domain/monsterDefinitions';
import {
    resolveMonsterTrait,
} from './monsterReadModel';
import {
    cloneExplorerSummary,
    findExplorerByPlayerId,
    getAllExplorers,
    resolveTurnStartSpeed,
} from './explorerReadModel';
import {
    BETRAYAL_TRAIT_KEYS,
    buildTraitTracksFromTemplate,
    cloneTraitTracks,
    moveExplorerTraitSteps,
    normalizeExplorerTraitTracks,
} from './traitTrackModel';
import {
    cloneBetrayalRoom,
    refreshExplorableRoomSlots,
    roomTileAdjustmentSelectionsMatch,
    roomDistanceByLayout,
} from './roomMapModel';
import {
    resolveBetrayalMoveCost,
    resolveMoveTargetRooms,
} from './movementReadModel';
import {
    ROOM_DISCOVERY_DECK_POOL,
    canConnectDoorwaysToEntry,
    cloneBuriedRoomTileSummary,
    cloneRoomDiscoveryDeckEntry,
    cloneRoomDrawResolution,
    cloneRoomTemplate,
    groupRoomDiscoveryDeckByFloor,
    isRoomOrientationTurns,
    makeRoomDiscoveryDeckFromFloorPools,
    orientDoorwaysForPlacement,
    resolveExplorableRoomSlots,
    resolveRoomDraw,
    resolveRoomPlacementContext,
    resolveRoomPlacementOrientationOptions,
    resolveRoomTemplateDiscoveryDeckKind,
    resolveRoomTileAdjustmentOptionsForPlacement,
} from './roomDiscoveryModel';
import {
    formatAttackRangeLabel,
    isAttackTargetInWeaponRange,
    isDynamiteCardId,
    isDynamiteTargetRoom,
    isPendingDamageAllocationForAttackRoll,
    resolveAttackWeaponEffect,
    resolveDynamiteInventoryCard,
} from './attackRules';
import { resolveBetrayalHauntAttackCommandEvents } from './attackResolutionModel';
import {
    applyBetrayalTradeAcceptedState,
    canUseDogForTrade,
    clearBetrayalPendingTradeAgreement,
    createBetrayalPendingTradeAgreement,
    createBetrayalTradeRequestedPayload,
    resolveBetrayalTradeAgreementEventPayload,
    resolveBetrayalTradeCardStatus,
    resolveDogTradeTargets,
    resolveTradeCardIds,
    resolveTradeTargets,
} from './trade';
import {
    resolveNextLivingPlayerIdInTurnOrder,
    rotateToNextLivingPlayer,
} from './turnOrderReadModel';
import { resolveRecommendedAction } from './recommendedActionReadModel';

export { resolveUseEffect } from './possessionEffects';
export { resolveInventoryEffectId } from './possessionEffects';
export type { PossessionUseEffectProfile, UseEffectProfile } from './possessionEffects';
export {
    BETRAYAL_MONSTER_DEFINITIONS,
    createBetrayalMonsterFromDefinition,
    getBetrayalMonsterDefinition,
} from './domain/monsterDefinitions';
export type {
    BetrayalMonsterDefinition,
    BetrayalMonsterDefinitionId,
} from './domain/monsterDefinitions';

export type BetrayalTraitKey = ConfigTraitKey;
export type BetrayalInventoryKind = ConfigInventoryKind;
export type BetrayalDeckKind = ConfigDeckKind;
export type { BetrayalRoomDiscoverySymbol };
export type { BetrayalRoomEdge, BetrayalRoomVisualId, BetrayalRoomFloor };
export type BetrayalPhase = 'characterSelect' | 'preHaunt' | 'haunt' | 'endgame';
export type BetrayalRecommendedAction = ConfigRecommendedAction;
export type BetrayalRoomMarkerToken = 'obstacle' | 'secretPassage' | 'blessing';
export type BetrayalHauntAttackTarget =
    | 'traitor'
    | 'hero'
    | 'jack-spirit'
    | 'phantom-photographer'
    | 'troll-hand'
    | 'dynamite-room';

export interface BetrayalInventoryCard {
    id: string;
    name: string;
    kind: BetrayalInventoryKind;
}

export interface BetrayalExplorerTemplate {
    explorerId: string;
    displayName: string;
    portraitAsset: string;
    tokenAsset?: string;
    color: string;
    traits: Record<BetrayalTraitKey, number>;
    traitTracks: Record<BetrayalTraitKey, BetrayalExplorerTraitTrackSeed>;
    abilityName: string;
    abilityText: string;
}

export interface BetrayalTraitTrackState {
    trackId: string;
    values: number[];
    position: number;
    startPosition: number;
    criticalPosition: number;
    skullPosition: number;
    maxPosition: number;
}

export type BetrayalTraitTrackMap = Record<BetrayalTraitKey, BetrayalTraitTrackState>;

export interface BetrayalExplorerSummary {
    playerId: string;
    explorerId: string;
    displayName: string;
    portraitAsset: string;
    tokenAsset?: string;
    roomId: string;
    traits: Record<BetrayalTraitKey, number>;
    traitTracks: BetrayalTraitTrackMap;
    inventory: BetrayalInventoryCard[];
}

export interface BetrayalMonsterSummary {
    id: string;
    definitionId?: BetrayalMonsterDefinitionId;
    name: string;
    portraitAsset: string;
    tokenAsset?: string;
    roomId: string;
    might: number;
    speed: number;
    sanity?: number;
    knowledge?: number;
    damage: number;
}

export type BetrayalMonsterStatusKind = 'active' | 'stunned' | 'killed';


export interface BetrayalMonsterTraitReadModel {
    might: number;
    speed: number;
    sanity: number | null;
    knowledge: number | null;
    usesTraitTrack: false;
}

export interface BetrayalMonsterStatusSummary {
    monsterId: string;
    name: string;
    roomId: string | null;
    traits: BetrayalMonsterTraitReadModel;
    damage: number;
    status: BetrayalMonsterStatusKind;
    canBeStunned: boolean;
    stunned: boolean;
    killed: boolean;
    removedFromHouse: boolean;
    slowsHeroMovement: boolean;
    canAttack: boolean;
    canBeAttacked: boolean;
    canHoldPossessions: boolean;
    canExploreNewRooms: boolean;
    defaultAttackTrait: BetrayalTraitKey;
    ruleNotes: string[];
}

export interface BetrayalCorpseSummary {
    playerId: string;
    explorerId: string;
    displayName: string;
    roomId: string;
    roomName: string | null;
    shouldLayTokenFlat: true;
    inventory: BetrayalInventoryCard[];
    itemCount: number;
    omenCount: number;
    lootedThisTurn: boolean;
    canBeLootedByCurrentExplorer: boolean;
    lootableCardIds: string[];
    ruleNotes: string[];
}

export interface BetrayalDeathStateSummary {
    hauntDeathRulesActive: boolean;
    livingExplorerPlayerIds: string[];
    deadExplorerPlayerIds: string[];
    corpseLootedThisTurnPlayerIds: string[];
    corpses: BetrayalCorpseSummary[];
    ruleNotes: string[];
}

export interface BetrayalRoomNode {
    id: string;
    name: string;
    floor: BetrayalRoomFloor;
    x: number;
    y: number;
    connectedRoomIds: string[];
    entryRoomId?: string;
    entryEdge?: BetrayalRoomEdge;
    orientationTurns: 0 | 1 | 2 | 3;
    state: 'discovered' | 'unexplored';
    startingTile?: boolean;
    hint: string;
    tags: string[];
    discoveryReward: BetrayalDeckKind | null;
    visualId: BetrayalRoomVisualId;
    doorways: BetrayalRoomDoorway[];
    backVisualId: Extract<BetrayalRoomVisualId, 'backUpper' | 'backGround' | 'backBasement'>;
    discoveryEffect?: RoomTemplate['discoveryEffect'];
    endTurnEffect?: BetrayalRoomEndTurnEffect;
    enterEffect?: BetrayalRoomEnterEffect;
    markerTokens?: BetrayalRoomMarkerToken[];
}

export interface BetrayalRoomPlacementPreview {
    slotId: string;
    floor: BetrayalRoomFloor;
    entryRoomId: string | null;
    entryEdge: BetrayalRoomEdge;
    deckKind: BetrayalDeckKind | null;
    skippedRoomName?: string;
    buriedRoomNames?: string[];
    room: Pick<BetrayalRoomNode, 'name' | 'hint' | 'tags' | 'discoveryReward' | 'visualId' | 'doorways' | 'backVisualId' | 'orientationTurns' | 'discoveryEffect' | 'endTurnEffect' | 'enterEffect'>;
    orientationOptions: {
        orientationTurns: 0 | 1 | 2 | 3;
        doorways: BetrayalRoomDoorway[];
    }[];
    defaultOrientationTurns: 0 | 1 | 2 | 3;
    requiresTileAdjustment: boolean;
    tileAdjustmentOptions: BetrayalRoomTileAdjustmentOption[];
}

export interface BetrayalRoomDiscoveryDeckEntry {
    floor: BetrayalRoomFloor;
    room: BetrayalRoomDiscoveryTemplate;
}

export interface BetrayalBuriedRoomTileSummary {
    floor: BetrayalRoomFloor;
    name: string;
    visualId: BetrayalRoomDiscoveryTemplate['visualId'];
    reason: 'areaMismatch' | 'holySymbol' | 'sealedRegion';
}

export interface BetrayalRoomDrawResolution {
    requestedFloor: BetrayalRoomFloor;
    selectedRoom: {
        floor: BetrayalRoomFloor;
        name: string;
        visualId: BetrayalRoomDiscoveryTemplate['visualId'];
    } | null;
    buriedRoomTiles: BetrayalBuriedRoomTileSummary[];
    exhausted: boolean;
    requiresTileAdjustment: boolean;
    usedUnifiedDeck: boolean;
}

export interface BetrayalRoomTileAdjustmentSelection {
    roomId: string;
    x: number;
    y: number;
    entryRoomId: string;
    entryEdge: BetrayalRoomEdge;
    orientationTurns: 0 | 1 | 2 | 3;
}

export interface BetrayalRoomTileAdjustmentOption extends BetrayalRoomTileAdjustmentSelection {
    roomName: string;
    fromX: number;
    fromY: number;
    entryRoomName: string;
    openDoorwayCount: number;
}

export interface BetrayalDiscoverySummary {
    kind: BetrayalRoomDiscoverySymbol;
    title: string;
    summary: string;
    detail: string;
    tone: 'neutral' | 'accent' | 'warning';
    resolutionSteps?: BetrayalDiscoveryResolutionStep[];
}

export type BetrayalDiscoveryResolutionStepKind =
    | 'room-effect'
    | 'room-discovery-card'
    | 'buried-room-discovery-card'
    | 'drawn-card'
    | 'haunt-roll'
    | 'event-effect';

export interface BetrayalDiscoveryResolutionStep {
    id: string;
    kind: BetrayalDiscoveryResolutionStepKind;
    text: string;
    deckKind?: BetrayalDeckKind;
    cardId?: string;
}

export interface BetrayalActivityEntry {
    id: string;
    text: string;
    tone: BetrayalDiscoverySummary['tone'];
}

interface BetrayalRolledDamageResult {
    damageKind: 'physical' | 'mental';
    rolls: number[];
    total: number;
    appliedAmount: number;
}

type BetrayalEventRollRecentKind = 'eventTraitCheck' | 'eventDiceRoll';

interface BetrayalSourceEventRollState {
    id: string;
    kind: BetrayalEventRollRecentKind;
    playerId: string;
    sourceTitle: string;
    eventDescription?: string;
    trait?: BetrayalTraitKey;
    rollLabel?: string;
    dice: number[];
    passiveBonus: number;
    total: number;
    latestLabel: string;
}

export interface BetrayalRecentRollState {
    id: string;
    kind: BetrayalEventRollRecentKind | 'eventRolledDamage' | 'hauntRoll' | 'mysticElevator' | 'attackRoll' | 'roomEndTurnTraitCheck' | 'deathPrevention' | 'hauntActionTraitCheck' | 'monsterMoveRoll';
    playerId: string;
    sourceTitle: string;
    eventDescription?: string;
    trait?: BetrayalTraitKey;
    rollLabel?: string;
    dice: number[];
    passiveBonus: number;
    requiredPlayerIds?: string[];
    acknowledgedPlayerIds?: string[];
    branchThresholds?: { min: number; label: string; effect: UseEffectProfile }[];
    latestLabel: string;
    eventRolledDamageResults?: BetrayalRolledDamageResult[];
    sourceEventRoll?: BetrayalSourceEventRollState;
    eventEffectSnapshot?: {
        traitsBeforeEffect: BetrayalExplorerSummary['traits'];
        traitTracksBeforeEffect: BetrayalTraitTrackMap;
        roomIdBeforeEffect: string;
        possessionOrderByKindBeforeEffect: Record<Exclude<BetrayalDeckKind, 'event'>, BetrayalInventoryCard[]>;
        currentExplorerInventoryBeforeEffect: BetrayalInventoryCard[];
        deckCountsBeforeEffect: Record<BetrayalDeckKind, number>;
        damageRolls: number[];
        rolledDamageResults: BetrayalRolledDamageResult[];
        drawnCards: BetrayalInventoryCard[];
    };
    roomId?: string;
    roomsBeforeRoll?: BetrayalRoomNode[];
    roomEndTurn?: {
        kind: BetrayalRoomEndTurnEffect;
        roomName: string;
        roomId: string;
        originalRoomId: string;
        traitsBeforeEffect: BetrayalExplorerSummary['traits'];
        previousPhysicalDamage: number;
        previousDestinationRoomId?: string;
        nextPlayerId?: string;
        monsterMovementRoll?: BetrayalMonsterMovementRollResult | null;
        turnLogText?: string;
        helpingHandsMonsterTurnControllerPlayerId?: string;
        skipBloodFromStoneMonsterTurnStart?: boolean;
    };
    attack?: {
        target: BetrayalHauntAttackTarget;
        defenderPlayerId?: string;
        damageKind: 'physical' | 'mental';
        previousDamageToAttacker: number;
        previousDamageToDefender: number;
        defenderRoll: number;
        defenderDefenseExtraDice?: number;
        attackerTraitsBeforeDamage: BetrayalExplorerSummary['traits'];
        defenderTraitsBeforeDamage?: BetrayalExplorerSummary['traits'];
        weaponCardId?: string;
        weaponName?: string;
        weaponAttackBonus?: number;
        weaponExtraDice?: number;
        weaponSpeedCost?: number;
        weaponAttackTrait?: BetrayalTraitKey;
    };
    deathPrevention?: {
        cardId: string;
        minTotal: number;
        damageKind: 'physical' | 'mental' | 'general';
        damageAmount: number;
        damageTraits?: BetrayalTraitKey[];
        traitsBeforeDamage: BetrayalExplorerSummary['traits'];
        scenarioRuntimeBeforeDefeat: BetrayalScenarioRuntimeStatus;
        monstersBeforeDefeat: BetrayalMonsterSummary[];
        releasedJackSpiritRoomId?: string;
        nextPlayerId?: string;
        monsterMovementRoll?: BetrayalMonsterMovementRollResult | null;
        turnLogText?: string;
        helpingHandsMonsterTurnControllerPlayerId?: string;
        skipBloodFromStoneMonsterTurnStart?: boolean;
    };
    consumedRabbitFootCardIds: string[];
    lastRabbitFootRerollDieIndex?: number;
    lastRabbitFootRerollPreviousDice?: number[];
}

export interface BetrayalPendingEventRollResolutionState {
    rollId: string;
    playerId: string;
    sourceTitle: string;
    effect: UseEffectProfile;
    requiredPlayerIds?: string[];
    acknowledgedPlayerIds?: string[];
    nextPendingEventChoice?: BetrayalPendingEventChoiceState;
    deathPrevention?: {
        playerId: string;
        cardId: string;
        rollTotal: number;
        dice: number[];
        minTotal: number;
        damageAmount: number;
        damageKind: 'physical' | 'mental' | 'general';
        damageTraits: BetrayalTraitKey[];
        traitsBeforeDamage: BetrayalExplorerSummary['traits'];
        prevented: boolean;
    };
    hauntTriggered?: boolean;
    hauntCardNumber?: number;
    hauntTriggerLabel?: string;
    hauntTraitorPlayerId?: string | null;
    hauntRevealResolution?: BetrayalHauntRevealResolution;
    hauntTraitorResolution?: BetrayalHauntTraitorResolution;
    dustSetup?: BetrayalDustRuntimeState;
    magicCameraSetup?: BetrayalMagicCameraRuntimeState;
    helpingHandsSetup?: BetrayalHelpingHandsRuntimeState;
    uponReflectionSetup?: BetrayalUponReflectionRuntimeState;
    hauntRoll?: {
        threshold: number;
        successHauntId: number;
        successHauntTriggerLabel?: string;
        successTraitorSelection?: 'current-explorer' | 'magic-camera-owner';
    };
    requiresAcknowledgement?: boolean;
}

export interface BetrayalPendingEventRollStartState {
    playerId: string;
    roomId: string;
    sourceTitle: string;
    eventDescription?: string;
}

export interface BetrayalMonsterMovementRollResult {
    monsterId: string;
    monsterName: string;
    playerId: string;
    speed: number;
    dice: number[];
    total: number;
    moveAllowance: number;
}

export interface BetrayalHelpingHandsMonsterTurnStartedPayload {
    controllerPlayerId: string;
    moveAllowance: number;
    moveDice: number[];
    logText: string;
}

export interface BetrayalTurnEndedPayload {
    previousPlayerId: string;
    nextPlayerId: string;
    logText: string;
    roomEndTurnEffect?: BetrayalRoomEndTurnEffectResult | null;
    monsterMovementRoll?: BetrayalMonsterMovementRollResult | null;
    helpingHandsMonsterTurnControllerPlayerId?: string;
    deferAdvanceUntilRollAcknowledged?: boolean;
    turnLogText?: string;
    dustEndTurn?: BetrayalDustEndTurnResult;
    magicCameraEndTurnCapturedEssencePlayerIds?: string[];
    deferredHelpingHandsMonsterTurnStart?: BetrayalHelpingHandsMonsterTurnStartedPayload;
    extraTurnAfterCurrentTurn?: BetrayalExtraTurnAfterCurrentTurnState;
    skipBloodFromStoneMonsterTurnStart?: boolean;
}

interface BetrayalExtraTurnAfterCurrentTurnState {
    playerId: string;
    sourceCardId: string;
    sourceCardName: string;
}

export interface BetrayalPendingEventChoiceState {
    id: string;
    playerId: string;
    sourceTitle: string;
    eventDescription?: string;
    acceptLabel?: string;
    declineLabel?: string;
    effect: UseEffectProfile;
    sourceKind?: 'event' | 'item' | 'event-symbol-skip';
    eventSymbolSkip?: {
        roomId: string;
        roomName: string;
        method: 'idol' | 'traitorPower';
    };
    itemResolution?: 'tooth-necklace-end-turn';
    itemCardId?: string;
    deferredTurnEnd?: BetrayalTurnEndedPayload;
}

export type BetrayalPendingCardResolutionStepKind = Extract<
    BetrayalDiscoveryResolutionStepKind,
    'room-effect' | 'room-discovery-card' | 'buried-room-discovery-card' | 'drawn-card' | 'haunt-roll' | 'event-effect'
>;

export interface BetrayalPendingCardResolutionProcessCard {
    cardId?: string;
    cardName: string;
    deckKind: BetrayalDeckKind;
    outcome: 'buried' | 'gained';
    text: string;
}

export interface BetrayalPendingCardResolutionState {
    id: string;
    playerId: string;
    requiredPlayerIds?: string[];
    acknowledgedPlayerIds?: string[];
    deckKind?: BetrayalDeckKind;
    cardId?: string;
    cardName: string;
    discoveryTitle: string;
    stepKind: BetrayalPendingCardResolutionStepKind;
    text: string;
    index: number;
    total: number;
    processCards?: BetrayalPendingCardResolutionProcessCard[];
}

export interface BetrayalPendingTradeAgreementState {
    id: string;
    playerId: string;
    targetPlayerId: string;
    cardIds: string[];
    targetCardIds: string[];
    useDog?: boolean;
    sourceCardId?: string;
}

export interface BetrayalPendingDamageAllocationState {
    id: string;
    playerId: string;
    sourceTitle: string;
    damageKind: 'physical' | 'mental' | 'general';
    amount: number;
    originalAmount: number;
    damageReductionAmount?: number;
    allowedTraits: BetrayalTraitKey[];
    damageReplacement?: {
        kind: 'brooch-general-damage';
        cardId: string;
        cardName: string;
    };
    forcedTraitSequence?: BetrayalTraitKey[];
    allowSkull: boolean;
    traitsBeforeDamage: BetrayalExplorerSummary['traits'];
    nextPlayerId?: string;
    nextDamageAllocations?: BetrayalPendingDamageAllocationState[];
    monsterMovementRoll?: BetrayalMonsterMovementRollResult | null;
    turnLogText?: string;
    helpingHandsMonsterTurnControllerPlayerId?: string;
    skipBloodFromStoneMonsterTurnStart?: boolean;
}

export interface BetrayalAllTraitCheckResult {
    trait: BetrayalTraitKey;
    total: number;
    dice: number[];
    passiveBonus: number;
    passed: boolean;
}

export interface BetrayalEndgameResult {
    hauntId: 'mummy-rampage' | 'crimson-jack-returns' | 'the-dust' | 'blood-from-a-stone' | 'helping-hands' | 'magic-camera' | 'upon-reflection';
    hauntTitle: string;
    outcome: BetrayalScenarioOutcome;
    winners: string[];
    traitorPlayerId: string;
    survivorsEscaped: string[];
    reward: {
        stars: number;
        omens: number;
        logs: number;
    };
    stats: {
        roomsExplored: number;
        omensDrawn: number;
        itemsDrawn: number;
        eventsDrawn: number;
    };
}

export interface BetrayalDustSicknessToken {
    id: string;
    value: number | null;
}

export interface BetrayalDustRuntimeState {
    sicknessTokensByPlayerId: Record<string, BetrayalDustSicknessToken[]>;
    permanentTraitorPlayerIds: string[];
    researchRoomIds: string[];
    exchangedSicknessThisTurnPlayerIds: string[];
    feverishPlayerIds: string[];
    pendingSicknessExchange?: {
        id: string;
        requesterPlayerId: string;
        targetPlayerId: string;
    };
}

export interface BetrayalMagicCameraRuntimeState {
    cameraDestroyed: boolean;
    cameraHolderPlayerId: string | null;
    heroEssencePlayerIds: string[];
    capturedEssencePlayerIds: string[];
    phantomPhotographerIds: string[];
    killedPhantomPhotographerIds: string[];
    stunnedPhantomPhotographerIds: string[];
}

export interface BetrayalMummyRuntimeState {
    mummyMonsterId: string;
    sarcophagusRoomId: string;
    girlRoomId: string | null;
    girlHolderPlayerId: string | null;
    girlHeldByMummy: boolean;
    mummyCarriedOmenIds: string[];
    mummyCarriedCards: BetrayalInventoryCard[];
    pendingAttackReward?: BetrayalMummyAttackRewardChoice;
    knowledgeTokenCount: number;
    trueNameFound: boolean;
    banishmentSpellLearned: boolean;
    bookRequired: boolean;
    requiredOmenIds: string[];
}

export interface BetrayalHelpingHandsRuntimeState {
    strangeAmuletCardId: string;
    strangeAmuletFoundDuringSetup: boolean;
    trollHandIds: string[];
    monsterTurnAfterPlayerId: string;
    activeMonsterTurn: boolean;
    monsterTurnControllerPlayerId: string | null;
    trollHandMoveAllowance: number;
    trollHandMoveDice: number[];
    trollHandMoveRemainingById: Record<string, number>;
    trollHandAttackUsedIdsThisTurn: string[];
    pendingAttackReward?: BetrayalHelpingHandsAttackRewardChoice;
}

export interface BetrayalDustSicknessSwapResult {
    fromPlayerId: string;
    toPlayerId: string;
    fromTokenId: string;
    toTokenId: string;
}

export interface BetrayalUponReflectionSecretCombination {
    trait: BetrayalTraitKey;
    omenId: string;
    omenName: string;
    roomId: string | null;
    roomName: string;
    roomVisualId?: BetrayalRoomVisualId;
}

export interface BetrayalUponReflectionBreakAttempt {
    playerId: string;
    roomId: string;
    roomName: string;
    trait: BetrayalTraitKey;
    omenId: string;
    omenName: string;
    rollTotal: number;
    dice: number[];
    passiveBonus: number;
    successRoll: boolean;
    combinationCorrect: boolean;
}

export interface BetrayalUponReflectionHintedEvent {
    revealerPlayerId: string;
    targetPlayerId: string;
    eventName: string;
    eventText: string;
    turnNumber: number;
}

export interface BetrayalUponReflectionRuntimeState {
    revealerPlayerId: string;
    secretCombination: BetrayalUponReflectionSecretCombination | null;
    breakAttempts: BetrayalUponReflectionBreakAttempt[];
    hintedEvents: BetrayalUponReflectionHintedEvent[];
}

export interface BetrayalScenarioRuntimeStatus {
    hauntTriggered: boolean;
    hauntRevealerPlayerId: string | null;
    traitorPlayerId: string | null;
    hauntTraitorResolution: BetrayalHauntTraitorResolution | null;
    hauntFirstPlayerResolution: BetrayalHauntFirstPlayerResolution | null;
    nextHauntPlayerId: string | null;
    hauntRollThreshold: number;
    omensDiscovered: number;
    hauntCardNumber: number | null;
    hauntTriggerLabel: string | null;
    hauntScenarioCardId: BetrayalScenarioCardId | null;
    hauntScenarioCardTitle: string | null;
    hauntScenarioCardLabel: string | null;
    triggeringOmenId: string | null;
    triggeringOmenName: string | null;
    hauntResolutionMatchedTrigger: boolean;
    hauntResolutionRepresentativeOnly: boolean;
    jackSpiritReleased: boolean;
    jackSpiritRoomId: string | null;
    jackSpiritHasMovedSinceRelease: boolean;
    exorcismCircleRoomIds: string[];
    knowledgeOfJackPlayerIds: string[];
    deadExplorerPlayerIds: string[];
    traitorCorpseRoomId: string | null;
    corpseLootedByPlayerIdsThisTurn: string[];
    usedRoomEffectIdsThisTurn: string[];
    hauntSetupQueue: BetrayalHauntSetupQueueEntry[];
    monsterStatusesById: Record<string, BetrayalMonsterStatusKind>;
    monsterTurn: BetrayalMonsterTurnRuntimeState;
    bloodFromStone?: BetrayalBloodFromStoneMonsterTurnRuntimeState;
    bloodFromStoneTurnStartVisibleStoneCherubIdsByPlayerId: Record<string, string[]>;
    bloodFromStoneNewLineOfSightDamagePlayerIdsThisTurn: string[];
    dust?: BetrayalDustRuntimeState;
    helpingHands?: BetrayalHelpingHandsRuntimeState;
    magicCamera?: BetrayalMagicCameraRuntimeState;
    mummy?: BetrayalMummyRuntimeState;
    uponReflection?: BetrayalUponReflectionRuntimeState;
}

export interface BetrayalCore {
    scenarioId: BetrayalScenarioId;
    scenarioCandidateIds: BetrayalScenarioCardId[];
    proposedScenarioCardId: BetrayalScenarioCardId;
    scenarioCardConfirmations: Record<string, BetrayalScenarioCardId>;
    phase: BetrayalPhase;
    playerIds: string[];
    selectedExplorerByPlayerId: Record<string, string>;
    readyPlayerIds: string[];
    currentPlayer: string;
    activePlayerId: string | null;
    turnStartSpeed: number;
    movesRemaining: number;
    recommendedAction: BetrayalRecommendedAction;
    activeRoomId: string;
    turnEndedByDiscovery: boolean;
    currentExplorer: BetrayalExplorerSummary;
    currentExplorerTraits: Record<BetrayalTraitKey, number>;
    currentExplorerInventory: BetrayalInventoryCard[];
    otherExplorers: BetrayalExplorerSummary[];
    monsters: BetrayalMonsterSummary[];
    drawOrder: BetrayalDeckKind[];
    roomDiscoveryDeck: BetrayalRoomDiscoveryDeckEntry[];
    roomDiscoveryOrderByFloor: Record<BetrayalRoomFloor, RoomTemplate[]>;
    buriedRoomTiles: BetrayalBuriedRoomTileSummary[];
    possessionOrderByKind: Record<Exclude<BetrayalDeckKind, 'event'>, BetrayalInventoryCard[]>;
    eventOrder: EventTemplate[];
    deckCounts: Record<BetrayalDeckKind, number>;
    discardCounts: Record<BetrayalDeckKind, number>;
    rooms: BetrayalRoomNode[];
    exploreIndex: number;
    usedCardIdsThisTurn: string[];
    tradeUsedThisTurnPlayerIds: string[];
    turnStartInventoryCardIds: string[];
    receivedCardIdsThisTurnByPlayerId: Record<string, string[]>;
    nextNonCombatTraitReplacement: {
        playerId: string;
        sourceCardId: string;
        replacementTrait: BetrayalTraitKey;
    } | null;
    nextNonCombatTraitRollTotalReplacement: {
        playerId: string;
        sourceCardId: string;
        sourceCardName: string;
        selectedTotal: number;
    } | null;
    pendingExtraTurnAfterCurrentTurn: BetrayalExtraTurnAfterCurrentTurnState | null;
    pendingEventChoice: BetrayalPendingEventChoiceState | null;
    pendingEventRollStart?: BetrayalPendingEventRollStartState | null;
    pendingCardResolutionQueue: BetrayalPendingCardResolutionState[];
    pendingTradeAgreement: BetrayalPendingTradeAgreementState | null;
    pendingDamageAllocation: BetrayalPendingDamageAllocationState | null;
    pendingEventRollResolution?: BetrayalPendingEventRollResolutionState | null;
    recentRoll: BetrayalRecentRollState | null;
    recentAllTraitCheck: {
        sourceTitle: string;
        playerId: string;
        results: BetrayalAllTraitCheckResult[];
    } | null;
    latestRoomDrawResolution: BetrayalRoomDrawResolution | null;
    latestDiscovery: BetrayalDiscoverySummary | null;
    latestDiscoveryOwnerPlayerId: string | null;
    highlightedDeckKind: BetrayalDeckKind | null;
    activityLog: BetrayalActivityEntry[];
    scenarioRuntime: BetrayalScenarioRuntimeStatus;
    endgameResult: BetrayalEndgameResult | null;
}

export const EXPLORER_CATALOG: BetrayalExplorerTemplate[] = BETRAYAL_EXPLORER_CATALOG.map((entry) => ({ ...entry }));

type RoomTemplate = BetrayalRoomDiscoveryTemplate;

type EventTemplate = BetrayalEventSeed;

const DRAW_ORDER: BetrayalDeckKind[] = [...BETRAYAL_DISCOVERY_POOLS.drawOrder];

function createShuffledDiscoveryState(random: RandomFn) {
    const roomDiscoveryDeck = random.shuffle(ROOM_DISCOVERY_DECK_POOL.map(cloneRoomDiscoveryDeckEntry));
    return {
        drawOrder: random.shuffle([...DRAW_ORDER]),
        roomDiscoveryDeck,
        roomDiscoveryOrderByFloor: groupRoomDiscoveryDeckByFloor(roomDiscoveryDeck),
        possessionOrderByKind: {
            item: random.shuffle(DRAW_POOL.item.map(cloneInventoryCard)),
            omen: random.shuffle(DRAW_POOL.omen.map(cloneInventoryCard)),
        } satisfies Record<Exclude<BetrayalDeckKind, 'event'>, BetrayalInventoryCard[]>,
        eventOrder: random.shuffle(EVENT_POOL.map(cloneEventTemplate)),
    };
}

const DEFAULT_BETRAYAL_RANDOM: RandomFn = {
    random: () => 0.5,
    d: (max) => Math.max(1, Math.min(max, 1)),
    range: (min) => min,
    shuffle: (array) => [...array],
};

const nowEvent = <TType extends string, TPayload>(
    type: TType,
    payload: TPayload,
    timestamp: number,
): GameEvent<TType, TPayload> => ({
    type,
    payload,
    timestamp,
});

function cloneMonsterSeed(monster: BetrayalMonsterSeed): BetrayalMonsterSummary {
    return { ...monster };
}

function cloneInventorySeed(card: BetrayalInventorySeed): BetrayalInventoryCard {
    return { ...card };
}

function createExplorer(
    playerId: string,
    template: BetrayalExplorerTemplate,
    roomId: string,
    inventory: BetrayalInventorySeed[],
): BetrayalExplorerSummary {
    const explorer: BetrayalExplorerSummary = {
        playerId,
        explorerId: template.explorerId,
        displayName: template.displayName,
        portraitAsset: template.portraitAsset,
        tokenAsset: template.tokenAsset,
        roomId,
        traits: { ...template.traits },
        traitTracks: buildTraitTracksFromTemplate(template),
        inventory: inventory.map(cloneInventorySeed),
    };
    normalizeExplorerTraitTracks(explorer);
    return explorer;
}

function cloneCore(core: BetrayalCore): BetrayalCore {
    return {
        ...core,
        playerIds: [...core.playerIds],
        scenarioCandidateIds: [...core.scenarioCandidateIds],
        scenarioCardConfirmations: { ...core.scenarioCardConfirmations },
        selectedExplorerByPlayerId: { ...core.selectedExplorerByPlayerId },
        readyPlayerIds: [...core.readyPlayerIds],
        turnStartSpeed: core.turnStartSpeed ?? core.currentExplorer.traits.speed ?? core.movesRemaining,
        currentExplorer: cloneExplorerSummary(core.currentExplorer),
        currentExplorerTraits: { ...core.currentExplorerTraits },
        currentExplorerInventory: core.currentExplorerInventory.map(cloneInventoryCard),
        otherExplorers: core.otherExplorers.map(cloneExplorerSummary),
        monsters: core.monsters.map(cloneMonster),
        drawOrder: [...core.drawOrder],
        roomDiscoveryDeck: (core.roomDiscoveryDeck ?? makeRoomDiscoveryDeckFromFloorPools(core.roomDiscoveryOrderByFloor))
            .map(cloneRoomDiscoveryDeckEntry),
        roomDiscoveryOrderByFloor: {
            ground: core.roomDiscoveryOrderByFloor.ground.map(cloneRoomTemplate),
            upper: core.roomDiscoveryOrderByFloor.upper.map(cloneRoomTemplate),
            basement: core.roomDiscoveryOrderByFloor.basement.map(cloneRoomTemplate),
        },
        buriedRoomTiles: (core.buriedRoomTiles ?? []).map(cloneBuriedRoomTileSummary),
        possessionOrderByKind: {
            item: core.possessionOrderByKind.item.map(cloneInventoryCard),
            omen: core.possessionOrderByKind.omen.map(cloneInventoryCard),
        },
        eventOrder: core.eventOrder.map(cloneEventTemplate),
        deckCounts: { ...core.deckCounts },
        discardCounts: { ...core.discardCounts },
        rooms: core.rooms.map(cloneBetrayalRoom),
        usedCardIdsThisTurn: [...core.usedCardIdsThisTurn],
        tradeUsedThisTurnPlayerIds: [...core.tradeUsedThisTurnPlayerIds],
        turnStartInventoryCardIds: [...core.turnStartInventoryCardIds],
        receivedCardIdsThisTurnByPlayerId: Object.fromEntries(
            Object.entries(core.receivedCardIdsThisTurnByPlayerId).map(([playerId, cardIds]) => [playerId, [...cardIds]]),
        ),
        nextNonCombatTraitReplacement: core.nextNonCombatTraitReplacement
            ? { ...core.nextNonCombatTraitReplacement }
            : null,
        nextNonCombatTraitRollTotalReplacement: core.nextNonCombatTraitRollTotalReplacement
            ? { ...core.nextNonCombatTraitRollTotalReplacement }
            : null,
        pendingExtraTurnAfterCurrentTurn: core.pendingExtraTurnAfterCurrentTurn
            ? { ...core.pendingExtraTurnAfterCurrentTurn }
            : null,
        recentRoll: core.recentRoll
            ? {
                ...core.recentRoll,
                dice: [...core.recentRoll.dice],
                requiredPlayerIds: core.recentRoll.requiredPlayerIds
                    ? [...core.recentRoll.requiredPlayerIds]
                    : undefined,
                acknowledgedPlayerIds: core.recentRoll.acknowledgedPlayerIds
                    ? [...core.recentRoll.acknowledgedPlayerIds]
                    : undefined,
                branchThresholds: core.recentRoll.branchThresholds?.map((branch) => ({
                    ...branch,
                    effect: { ...branch.effect },
                })),
                eventRolledDamageResults: core.recentRoll.eventRolledDamageResults?.map(cloneRolledDamageResult),
                sourceEventRoll: core.recentRoll.sourceEventRoll
                    ? cloneSourceEventRoll(core.recentRoll.sourceEventRoll)
                    : undefined,
                eventEffectSnapshot: core.recentRoll.eventEffectSnapshot
                    ? {
                        ...core.recentRoll.eventEffectSnapshot,
                        traitsBeforeEffect: { ...core.recentRoll.eventEffectSnapshot.traitsBeforeEffect },
                        traitTracksBeforeEffect: cloneTraitTracks(core.recentRoll.eventEffectSnapshot.traitTracksBeforeEffect),
                        possessionOrderByKindBeforeEffect: clonePossessionOrderByKind(core.recentRoll.eventEffectSnapshot.possessionOrderByKindBeforeEffect),
                        deckCountsBeforeEffect: { ...core.recentRoll.eventEffectSnapshot.deckCountsBeforeEffect },
                        damageRolls: [...core.recentRoll.eventEffectSnapshot.damageRolls],
                        rolledDamageResults: (core.recentRoll.eventEffectSnapshot.rolledDamageResults ?? []).map(cloneRolledDamageResult),
                        drawnCards: core.recentRoll.eventEffectSnapshot.drawnCards.map(cloneInventoryCard),
                    }
                    : undefined,
                roomsBeforeRoll: core.recentRoll.roomsBeforeRoll?.map(cloneBetrayalRoom),
                roomEndTurn: core.recentRoll.roomEndTurn
                    ? {
                        ...core.recentRoll.roomEndTurn,
                        traitsBeforeEffect: { ...core.recentRoll.roomEndTurn.traitsBeforeEffect },
                    }
                    : undefined,
                attack: core.recentRoll.attack
                    ? {
                        ...core.recentRoll.attack,
                        attackerTraitsBeforeDamage: { ...core.recentRoll.attack.attackerTraitsBeforeDamage },
                        defenderTraitsBeforeDamage: core.recentRoll.attack.defenderTraitsBeforeDamage
                            ? { ...core.recentRoll.attack.defenderTraitsBeforeDamage }
                            : undefined,
                    }
                    : undefined,
                deathPrevention: core.recentRoll.deathPrevention
                    ? {
                        ...core.recentRoll.deathPrevention,
                        damageTraits: core.recentRoll.deathPrevention.damageTraits
                            ? [...core.recentRoll.deathPrevention.damageTraits]
                            : undefined,
                        traitsBeforeDamage: { ...core.recentRoll.deathPrevention.traitsBeforeDamage },
                        scenarioRuntimeBeforeDefeat: cloneScenarioRuntimeStatus(core.recentRoll.deathPrevention.scenarioRuntimeBeforeDefeat),
                        monstersBeforeDefeat: core.recentRoll.deathPrevention.monstersBeforeDefeat.map(cloneMonster),
                    }
                    : undefined,
                consumedRabbitFootCardIds: [...core.recentRoll.consumedRabbitFootCardIds],
                lastRabbitFootRerollDieIndex: core.recentRoll.lastRabbitFootRerollDieIndex,
                lastRabbitFootRerollPreviousDice: core.recentRoll.lastRabbitFootRerollPreviousDice
                    ? [...core.recentRoll.lastRabbitFootRerollPreviousDice]
                    : undefined,
            }
            : null,
        pendingEventChoice: core.pendingEventChoice
            ? clonePendingEventChoice(core.pendingEventChoice)
            : null,
        pendingEventRollStart: core.pendingEventRollStart
            ? { ...core.pendingEventRollStart }
            : null,
        pendingCardResolutionQueue: (core.pendingCardResolutionQueue ?? []).map(clonePendingCardResolution),
        pendingTradeAgreement: core.pendingTradeAgreement
            ? {
                ...core.pendingTradeAgreement,
                cardIds: [...core.pendingTradeAgreement.cardIds],
                targetCardIds: [...core.pendingTradeAgreement.targetCardIds],
            }
            : null,
        pendingDamageAllocation: core.pendingDamageAllocation
            ? clonePendingDamageAllocation(core.pendingDamageAllocation)
            : null,
        pendingEventRollResolution: core.pendingEventRollResolution
            ? clonePendingEventRollResolution(core.pendingEventRollResolution)
            : null,
        recentAllTraitCheck: core.recentAllTraitCheck
            ? {
                ...core.recentAllTraitCheck,
                results: core.recentAllTraitCheck.results.map((result) => ({
                    ...result,
                    dice: [...result.dice],
                })),
            }
            : null,
        latestRoomDrawResolution: core.latestRoomDrawResolution
            ? cloneRoomDrawResolution(core.latestRoomDrawResolution)
            : null,
        latestDiscovery: core.latestDiscovery ? cloneDiscoverySummary(core.latestDiscovery) : null,
        activityLog: core.activityLog.map((entry) => ({ ...entry })),
        turnEndedByDiscovery: core.turnEndedByDiscovery,
        scenarioRuntime: cloneScenarioRuntimeStatus(core.scenarioRuntime),
        endgameResult: core.endgameResult ? {
            ...core.endgameResult,
            winners: [...core.endgameResult.winners],
            survivorsEscaped: [...core.endgameResult.survivorsEscaped],
            reward: { ...core.endgameResult.reward },
            stats: { ...core.endgameResult.stats },
        } : null,
    };
}

function createInitialScenarioRuntimeStatus(): BetrayalScenarioRuntimeStatus {
    return {
        hauntTriggered: false,
        hauntRevealerPlayerId: null,
        traitorPlayerId: null,
        hauntTraitorResolution: null,
        hauntFirstPlayerResolution: null,
        nextHauntPlayerId: null,
        hauntRollThreshold: 5,
        omensDiscovered: 0,
        hauntCardNumber: null,
        hauntTriggerLabel: null,
        hauntScenarioCardId: null,
        hauntScenarioCardTitle: null,
        hauntScenarioCardLabel: null,
        triggeringOmenId: null,
        triggeringOmenName: null,
        hauntResolutionMatchedTrigger: false,
        hauntResolutionRepresentativeOnly: false,
        jackSpiritReleased: false,
        jackSpiritRoomId: null,
        jackSpiritHasMovedSinceRelease: false,
        exorcismCircleRoomIds: [],
        knowledgeOfJackPlayerIds: [],
        deadExplorerPlayerIds: [],
        traitorCorpseRoomId: null,
        corpseLootedByPlayerIdsThisTurn: [],
        usedRoomEffectIdsThisTurn: [],
        hauntSetupQueue: [],
        monsterStatusesById: {},
        monsterTurn: createInitialMonsterTurnRuntimeState(),
        bloodFromStoneTurnStartVisibleStoneCherubIdsByPlayerId: {},
        bloodFromStoneNewLineOfSightDamagePlayerIdsThisTurn: [],
    };
}

function normalizePlayerIds(playerIds: string[]): string[] {
    return playerIds.length >= 3 ? playerIds.map(String) : ['0', '1', '2', '3'];
}

function roomSeedToNode(room: BetrayalRoomSeed): BetrayalRoomNode {
    return {
        ...room,
        connectedRoomIds: [...room.connectedRoomIds],
        orientationTurns: room.orientationTurns ?? 0,
        tags: [...room.tags],
        doorways: room.doorways.map((doorway) => ({ ...doorway })),
    };
}

function scenarioConfigById(scenarioId: BetrayalScenarioId) {
    return BETRAYAL_SCENARIO_CONFIGS[scenarioId];
}

function scenarioInventoryForExplorer(scenarioId: BetrayalScenarioId, explorerId: string): BetrayalInventorySeed[] {
    return scenarioConfigById(scenarioId).startingInventoryByExplorerId[explorerId]?.map(cloneInventorySeed) ?? [];
}

export function getBetrayalScenarioConfig(scenarioId: BetrayalScenarioId) {
    return scenarioConfigById(scenarioId);
}

function buildRepresentativeRuntimeExplorers(core: BetrayalCore): BetrayalExplorerSummary[] {
    const representativeRoomIds = ['grand-staircase', 'upper-landing', 'basement-landing', 'entrance-hall', 'upper-landing', 'entrance-hall'];
    return core.playerIds.map((playerId, index) => {
        const template = EXPLORER_CATALOG[index % EXPLORER_CATALOG.length]!;
        return createExplorer(
            playerId,
            template,
            representativeRoomIds[index % representativeRoomIds.length]!,
            scenarioInventoryForExplorer(core.scenarioId, template.explorerId),
        );
    });
}

function makeBaseCore(
    playerIds: string[],
    phase: BetrayalPhase,
    random: RandomFn,
    scenarioId: BetrayalScenarioId = DEFAULT_BETRAYAL_SCENARIO_ID,
): BetrayalCore {
    const normalizedPlayerIds = normalizePlayerIds(playerIds);
    const rooms = createInitialRoomLayout(BETRAYAL_SHARED_PRE_HAUNT_SETUP.startingRoomLayout);
    const discoveryState = createShuffledDiscoveryState(random);
    const currentExplorer = createExplorer(
        normalizedPlayerIds[0]!,
        EXPLORER_CATALOG[0]!,
        BETRAYAL_SHARED_PRE_HAUNT_SETUP.explorerStartTileId,
        scenarioInventoryForExplorer(scenarioId, EXPLORER_CATALOG[0]!.explorerId),
    );
    const otherExplorers = normalizedPlayerIds.slice(1).map((playerId, index) => (
        createExplorer(
            playerId,
            EXPLORER_CATALOG[(index + 1) % EXPLORER_CATALOG.length]!,
            BETRAYAL_SHARED_PRE_HAUNT_SETUP.explorerStartTileId,
            scenarioInventoryForExplorer(
                scenarioId,
                EXPLORER_CATALOG[(index + 1) % EXPLORER_CATALOG.length]!.explorerId,
            ),
        )
    ));

    return syncCurrentExplorerProjection({
        scenarioId,
        scenarioCandidateIds: [...BETRAYAL_SCENARIO_CARD_IDS],
        proposedScenarioCardId: DEFAULT_BETRAYAL_SCENARIO_CARD_ID,
        scenarioCardConfirmations: {},
        phase,
        playerIds: normalizedPlayerIds,
        selectedExplorerByPlayerId: {},
        readyPlayerIds: [],
        currentPlayer: currentExplorer.playerId,
        activePlayerId: null,
        turnStartSpeed: currentExplorer.traits.speed,
        movesRemaining: currentExplorer.traits.speed,
        recommendedAction: 'explore',
        activeRoomId: currentExplorer.roomId,
        turnEndedByDiscovery: false,
        currentExplorer,
        currentExplorerTraits: { ...currentExplorer.traits },
        currentExplorerInventory: currentExplorer.inventory.map(cloneInventoryCard),
        otherExplorers,
        monsters: [],
        drawOrder: discoveryState.drawOrder,
        roomDiscoveryDeck: discoveryState.roomDiscoveryDeck,
        roomDiscoveryOrderByFloor: discoveryState.roomDiscoveryOrderByFloor,
        buriedRoomTiles: [],
        possessionOrderByKind: discoveryState.possessionOrderByKind,
        eventOrder: discoveryState.eventOrder,
        deckCounts: { ...BETRAYAL_INITIAL_DECK_COUNTS },
        discardCounts: { omen: 0, item: 0, event: 0 },
        rooms,
        exploreIndex: 0,
        usedCardIdsThisTurn: [],
        tradeUsedThisTurnPlayerIds: [],
        turnStartInventoryCardIds: currentExplorer.inventory.map((card) => card.id),
        receivedCardIdsThisTurnByPlayerId: {},
        nextNonCombatTraitReplacement: null,
        nextNonCombatTraitRollTotalReplacement: null,
        pendingExtraTurnAfterCurrentTurn: null,
        pendingEventChoice: null,
        pendingEventRollStart: null,
        pendingCardResolutionQueue: [],
        pendingTradeAgreement: null,
        pendingDamageAllocation: null,
        pendingEventRollResolution: null,
        recentRoll: null,
        recentAllTraitCheck: null,
        latestRoomDrawResolution: null,
        latestDiscovery: null,
        latestDiscoveryOwnerPlayerId: null,
        highlightedDeckKind: null,
        activityLog: [],
        scenarioRuntime: createInitialScenarioRuntimeStatus(),
        endgameResult: null,
    });
}

export function createBetrayalCharacterSelectCore(
    playerIds: string[] = ['0', '1', '2', '3'],
    random: RandomFn = DEFAULT_BETRAYAL_RANDOM,
    setupData?: unknown,
): BetrayalCore {
    return makeBaseCore(playerIds, 'characterSelect', random, readBetrayalScenarioId(setupData));
}

export function createBetrayalFoundationCore(
    playerIds: string[] = ['0', '1', '2', '3'],
    random: RandomFn = DEFAULT_BETRAYAL_RANDOM,
): BetrayalCore {
    const core = makeBaseCore(playerIds, 'preHaunt', random);
    const nextCore = replaceExplorers(core, buildRepresentativeRuntimeExplorers(core), core.playerIds[0]);
    const turnStartSpeed = resolveTurnStartSpeed(nextCore);
    return {
        ...nextCore,
        turnStartSpeed,
        movesRemaining: turnStartSpeed,
        turnStartInventoryCardIds: resolveTurnStartInventoryCardIds(nextCore),
    };
}

const MONSTER_ENCOUNTER_PREVIEW_MONSTERS: BetrayalMonsterSeed[] = [
    {
        id: 'werewolf',
        name: '狼人',
        portraitAsset: 'betrayal/monsters/werewolf',
        tokenAsset: 'betrayal/tokens/monsters/werewolf',
        roomId: 'grand-staircase',
        might: 5,
        speed: 4,
        damage: 2,
    },
    {
        id: 'spirit',
        name: '幽灵',
        portraitAsset: 'betrayal/monsters/spirit',
        tokenAsset: 'betrayal/tokens/monsters/ghost',
        roomId: 'upper-landing',
        might: 4,
        speed: 5,
        damage: 1,
    },
];

export function createBetrayalMonsterEncounterCore(
    playerIds: string[] = ['0', '1', '2', '3'],
    random: RandomFn = DEFAULT_BETRAYAL_RANDOM,
): BetrayalCore {
    const core = createBetrayalFoundationCore(playerIds, random);
    return {
        ...core,
        monsters: MONSTER_ENCOUNTER_PREVIEW_MONSTERS.map(cloneMonsterSeed),
    };
}

function templateByExplorerId(explorerId: string): BetrayalExplorerTemplate | undefined {
    return EXPLORER_CATALOG.find((template) => template.explorerId === explorerId);
}

function buildScenarioExplorers(core: BetrayalCore): BetrayalExplorerSummary[] {
    return core.playerIds.map((playerId, index) => {
        const selectedExplorerId = core.selectedExplorerByPlayerId[playerId];
        const template = templateByExplorerId(selectedExplorerId ?? '') ?? EXPLORER_CATALOG[index % EXPLORER_CATALOG.length]!;
        return createExplorer(
            playerId,
            template,
            BETRAYAL_SHARED_PRE_HAUNT_SETUP.explorerStartTileId,
            scenarioInventoryForExplorer(core.scenarioId, template.explorerId),
        );
    });
}

function completeMummyTraitorVictoryIfNeeded(core: BetrayalCore, timestamp: number): BetrayalCore | null {
    const result = resolveMummyTraitorVictoryResult(core);
    if (!result) {
        return null;
    }
    return reduceEvent(core, nowEvent(EVENTS.SCENARIO_COMPLETED, {
        result,
    }, timestamp));
}

function resolveUponReflectionOmenSelection(
    actor: BetrayalExplorerSummary,
    payload: BetrayalCommandMap[typeof BETRAYAL_COMMANDS.BREAK_MIRROR_CURSE],
): BetrayalInventoryCard | null {
    const requestedId = payload.omenId ? resolveInventoryEffectId(payload.omenId) : null;
    const requestedName = payload.omenName?.trim();
    const omenCards = actor.inventory.filter((card) => card.kind === 'omen');
    return omenCards.find((card) => (
        (requestedId && resolveInventoryEffectId(card.id) === requestedId)
        || (payload.omenId && card.id === payload.omenId)
        || (requestedName && card.name === requestedName)
    )) ?? null;
}

function roomMatchesUponReflectionSecret(
    room: BetrayalRoomNode | null | undefined,
    secret: BetrayalUponReflectionSecretCombination,
): boolean {
    if (!room) {
        return false;
    }
    return room.id === secret.roomId
        || room.name === secret.roomName
        || (secret.roomVisualId ? room.visualId === secret.roomVisualId : false);
}

function resolveUponReflectionHintEvent(core: BetrayalCore, eventName: string | undefined): EventTemplate | null {
    const requestedEventName = eventName?.trim();
    if (!requestedEventName) {
        return null;
    }
    const eventCard = core.eventOrder.find((candidate) => candidate.name === requestedEventName);
    return eventCard ? cloneEventTemplate(eventCard) : null;
}

function hasUsedMirrorHintThisTurn(core: BetrayalCore, revealerPlayerId: string): boolean {
    return core.usedCardIdsThisTurn.includes('give-mirror-hint')
        || Boolean(core.scenarioRuntime.uponReflection?.hintedEvents.some((hintedEvent) => (
            hintedEvent.revealerPlayerId === revealerPlayerId
            && hintedEvent.turnNumber === core.turnNumber
        )));
}

function reduceScenarioCompletionStateResolution(
    resolution: { core: BetrayalCore; scenarioCompletedResult?: BetrayalEndgameResult },
    timestamp: number,
): BetrayalCore {
    if (!resolution.scenarioCompletedResult) {
        return resolution.core;
    }
    return reduceEvent(resolution.core, nowEvent(EVENTS.SCENARIO_COMPLETED, {
        result: resolution.scenarioCompletedResult,
    }, timestamp));
}

function maskUponReflectionRuntimeForPlayer(
    uponReflection: BetrayalUponReflectionRuntimeState,
    viewingPlayerId: PlayerId,
): BetrayalUponReflectionRuntimeState {
    return {
        ...cloneUponReflectionRuntimeState(uponReflection),
        secretCombination: uponReflection.revealerPlayerId === viewingPlayerId
            ? uponReflection.secretCombination
                ? { ...uponReflection.secretCombination }
                : null
            : null,
    };
}

function maskDustRuntimeForPlayer(
    dust: BetrayalDustRuntimeState,
    viewingPlayerId: PlayerId,
): BetrayalDustRuntimeState {
    return {
        sicknessTokensByPlayerId: Object.fromEntries(
            Object.entries(dust.sicknessTokensByPlayerId).map(([playerId, tokens]) => [
                playerId,
                tokens.map((token) => (
                    playerId === viewingPlayerId
                        ? { ...token }
                        : { ...token, value: null }
                )),
            ]),
        ),
        permanentTraitorPlayerIds: dust.permanentTraitorPlayerIds.includes(viewingPlayerId)
            ? [viewingPlayerId]
            : [],
        researchRoomIds: [...dust.researchRoomIds],
        exchangedSicknessThisTurnPlayerIds: [...dust.exchangedSicknessThisTurnPlayerIds],
        feverishPlayerIds: [...dust.feverishPlayerIds],
        pendingSicknessExchange: dust.pendingSicknessExchange
            ? { ...dust.pendingSicknessExchange }
            : undefined,
    };
}

function createBetrayalPlayerView(state: BetrayalCore, viewingPlayerId: PlayerId): BetrayalCore {
    const view = cloneCore(state);
    if (view.scenarioRuntime.dust) {
        view.scenarioRuntime.dust = maskDustRuntimeForPlayer(view.scenarioRuntime.dust, viewingPlayerId);
    }
    if (view.scenarioRuntime.uponReflection) {
        view.scenarioRuntime.uponReflection = maskUponReflectionRuntimeForPlayer(
            view.scenarioRuntime.uponReflection,
            viewingPlayerId,
        );
    }
    const deathPreventionRuntime = view.recentRoll?.deathPrevention?.scenarioRuntimeBeforeDefeat;
    if (deathPreventionRuntime?.dust) {
        deathPreventionRuntime.dust = maskDustRuntimeForPlayer(deathPreventionRuntime.dust, viewingPlayerId);
    }
    if (deathPreventionRuntime?.uponReflection) {
        deathPreventionRuntime.uponReflection = maskUponReflectionRuntimeForPlayer(
            deathPreventionRuntime.uponReflection,
            viewingPlayerId,
        );
    }
    return view;
}

function ensureLibraryPresent(core: BetrayalCore): void {
    const existingLibrary = core.rooms.find((room) => room.name === '图书馆');
    if (existingLibrary) {
        return;
    }
    const upperWest = core.rooms.find((room) => room.id === 'upper-west');
    if (upperWest) {
        upperWest.name = '图书馆';
        upperWest.hint = '翻找旧案、了解 Crimson Jack 的最佳地点';
        upperWest.tags = ['知识', '调查', '图书馆'];
        upperWest.state = 'discovered';
        upperWest.discoveryReward = null;
    }
}

function createInitialRoomLayout(seeds: BetrayalRoomSeed[]): BetrayalRoomNode[] {
    const discoveredSeedIds = new Set(seeds.filter((room) => room.state === 'discovered').map((room) => room.id));
    const discoveredRooms = seeds
        .filter((room) => room.state === 'discovered')
        .map((seed) => {
            const room = roomSeedToNode(seed);
            room.connectedRoomIds = room.connectedRoomIds.filter((roomId) => discoveredSeedIds.has(roomId));
            room.doorways = room.doorways.map((doorway) => (
                doorway.connectsToRoomId && !discoveredSeedIds.has(doorway.connectsToRoomId)
                    ? {
                        edge: doorway.edge,
                        leadsToFloor: doorway.leadsToFloor,
                        note: doorway.note,
                    }
                    : { ...doorway }
            ));
            return room;
        });

    return refreshExplorableRoomSlots(discoveredRooms);
}

function isPlayersTurn(core: BetrayalCore, playerId: string): boolean {
    return core.currentPlayer === playerId;
}

function validateTurnEndRollAcknowledgement(core: BetrayalCore, command: BetrayalCommand): ValidationResult | null {
    const pendingRoll = resolvePendingTurnEndRoll(core);
    if (!pendingRoll) {
        return command.type === BETRAYAL_COMMANDS.ACKNOWLEDGE_TURN_END_ROLL
            ? { valid: false, error: '当前没有待确认的回合结束投骰。' }
            : null;
    }
    if (command.type === BETRAYAL_COMMANDS.ACKNOWLEDGE_TURN_END_ROLL) {
        return command.playerId === pendingRoll.playerId
            ? { valid: true }
            : { valid: false, error: '必须由刚刚投骰的玩家确认结果。' };
    }
    return { valid: false, error: '请先确认回合结束投骰结果。' };
}

function validateEventRollFinalization(core: BetrayalCore, command: BetrayalCommand): ValidationResult | null {
    const pending = core.pendingEventRollResolution;
    if (!pending) {
        return command.type === BETRAYAL_COMMANDS.FINALIZE_EVENT_ROLL
            ? { valid: false, error: '当前没有等待确认最终结果的事件骰。' }
            : null;
    }
    if (command.type !== BETRAYAL_COMMANDS.FINALIZE_EVENT_ROLL) {
        if (
            command.type === BETRAYAL_COMMANDS.USE_POSSESSION
            && canUseBookForPendingEventRoll(core, command.playerId, command.payload.cardId)
        ) {
            return { valid: true };
        }
        if (
            pending.requiresAcknowledgement === false
            && (command.type === BETRAYAL_COMMANDS.USE_RABBIT_FOOT
                || command.type === BETRAYAL_COMMANDS.USE_ROLL_REROLL_ITEM)
        ) {
            return null;
        }
        return { valid: false, error: '请先处理当前事件投掷结果。' };
    }
    if (pending.requiresAcknowledgement === false) {
        if (command.playerId !== pending.playerId) {
            return { valid: false, error: '只有触发事件的玩家可以继续处理当前投掷。' };
        }
        if (command.payload.rollId && command.payload.rollId !== pending.rollId) {
            return { valid: false, error: '当前投掷结果已经改变。' };
        }
        return { valid: true };
    }
    const requiredPlayerIds = resolvePendingEventRollResolutionRequiredPlayerIds(core, pending);
    if (!requiredPlayerIds.includes(command.playerId)) {
        return { valid: false, error: '只有本局玩家可以确认事件骰最终结果。' };
    }
    const acknowledgedPlayerIds = resolvePendingEventRollResolutionAcknowledgedPlayerIds(pending);
    if (acknowledgedPlayerIds.includes(command.playerId)) {
        return { valid: false, error: '你已经确认过当前事件骰最终结果。' };
    }
    if (command.payload.rollId && command.payload.rollId !== pending.rollId) {
        return { valid: false, error: '确认的投骰已不是当前事件骰。' };
    }
    return { valid: true };
}

function validateCardResolutionAcknowledgement(core: BetrayalCore, command: BetrayalCommand): ValidationResult | null {
    if (command.type !== BETRAYAL_COMMANDS.ACKNOWLEDGE_CARD_RESOLUTION) {
        return null;
    }
    const pendingResolution = (core.pendingCardResolutionQueue ?? [])[0];
    if (!pendingResolution) {
        return { valid: false, error: '当前没有待确认的翻牌结算。' };
    }
    const requiredPlayerIds = resolvePendingCardResolutionRequiredPlayerIds(pendingResolution);
    if (!requiredPlayerIds.includes(command.playerId)) {
        return { valid: false, error: '只有本局玩家可以确认当前翻牌结算。' };
    }
    const acknowledgedPlayerIds = resolvePendingCardResolutionAcknowledgedPlayerIds(pendingResolution);
    if (acknowledgedPlayerIds.includes(command.playerId)) {
        return { valid: false, error: '你已经确认过当前翻牌结算。' };
    }
    if (command.payload.resolutionId && command.payload.resolutionId !== pendingResolution.id) {
        return { valid: false, error: '必须按当前翻牌顺序确认。' };
    }
    return { valid: true };
}

function validateRecentRollAcknowledgement(core: BetrayalCore, command: BetrayalCommand): ValidationResult | null {
    if (command.type !== BETRAYAL_COMMANDS.ACKNOWLEDGE_RECENT_ROLL) {
        return null;
    }
    const recentRoll = resolveAcknowledgeableRecentRoll(core);
    if (!recentRoll) {
        return { valid: false, error: '当前没有待确认的投骰结果。' };
    }
    const requiredPlayerIds = resolveRecentRollRequiredPlayerIds(core, recentRoll);
    if (!requiredPlayerIds.includes(command.playerId)) {
        return { valid: false, error: '只有需要确认的玩家可以确认当前投骰结果。' };
    }
    if (!canPlayerAcknowledgeRecentRoll(core, command.playerId)) {
        return { valid: false, error: '你已经确认过当前投骰结果。' };
    }
    return { valid: true };
}

function validatePreHauntAction(state: MatchState<BetrayalCore>, command: BetrayalCommand): ValidationResult {
    const core = state.core;
    const canReuseDuringHaunt = core.phase === 'haunt' && (
        command.type === BETRAYAL_COMMANDS.EXPLORE_ROOM
        || command.type === BETRAYAL_COMMANDS.USE_ROOM_EFFECT
        || command.type === BETRAYAL_COMMANDS.USE_POSSESSION
        || command.type === BETRAYAL_COMMANDS.RESOLVE_EVENT_CHOICE
    );
    if (core.phase !== 'preHaunt' && !canReuseDuringHaunt) {
        return { valid: false, error: '当前不在运行时阶段。' };
    }
    if (command.type === BETRAYAL_COMMANDS.RESOLVE_TRADE_AGREEMENT) {
        const pendingTrade = core.pendingTradeAgreement;
        if (!pendingTrade) {
            return { valid: false, error: '当前没有待同意的交易。' };
        }
        if (pendingTrade.targetPlayerId !== command.playerId) {
            return { valid: false, error: '必须由交易接收方回应。' };
        }
        if (typeof command.payload.accept !== 'boolean') {
            return { valid: false, error: '交易回应必须选择同意或拒绝。' };
        }
        return { valid: true };
    }
    if (command.type === BETRAYAL_COMMANDS.RESOLVE_EVENT_CHOICE) {
        return validateBetrayalEventChoiceResolution(core, command.playerId, command.payload);
    }
    const recentRollRerollValidation = command.type === BETRAYAL_COMMANDS.USE_RABBIT_FOOT
        || command.type === BETRAYAL_COMMANDS.USE_ROLL_REROLL_ITEM
        ? validateBetrayalRecentRollRerollItemCommand(core, command.playerId, command.payload, {
            legacyRabbitFoot: command.type === BETRAYAL_COMMANDS.USE_RABBIT_FOOT,
        })
        : null;
    if (recentRollRerollValidation) {
        return recentRollRerollValidation;
    }
    const pendingDamageAllocationValidation = validateBetrayalDamageAllocationResolution(core, command);
    if (pendingDamageAllocationValidation) {
        return pendingDamageAllocationValidation;
    }
    const eventRollFinalization = validateEventRollFinalization(core, command);
    if (eventRollFinalization) {
        return eventRollFinalization;
    }
    const cardResolutionAcknowledgement = validateCardResolutionAcknowledgement(core, command);
    if (cardResolutionAcknowledgement) {
        return cardResolutionAcknowledgement;
    }
    if (command.type === BETRAYAL_COMMANDS.ROLL_EVENT) {
        const pending = core.pendingEventRollStart;
        if (!pending) {
            return { valid: false, error: '当前没有等待投掷的事件。' };
        }
        if (pending.playerId !== command.playerId) {
            return { valid: false, error: '只有触发事件的玩家可以投掷。' };
        }
        if (command.payload.sourceTitle && command.payload.sourceTitle !== pending.sourceTitle) {
            return { valid: false, error: '当前事件已经改变。' };
        }
        return { valid: true };
    }
    const recentRollAcknowledgement = validateRecentRollAcknowledgement(core, command);
    if (recentRollAcknowledgement?.valid) {
        return recentRollAcknowledgement;
    }
    if (core.pendingEventChoice) {
        return { valid: false, error: '请先处理当前事件。' };
    }
    if ((core.pendingCardResolutionQueue ?? []).length > 0) {
        return { valid: false, error: '请先确认当前翻牌结算。' };
    }
    if (core.pendingTradeAgreement) {
        return { valid: false, error: '请先等待交易接收方回应。' };
    }
    const pendingTurnEndRollValidation = validateTurnEndRollAcknowledgement(core, command);
    if (pendingTurnEndRollValidation) {
        return pendingTurnEndRollValidation;
    }
    const pendingRecentRollAcknowledgement = command.type === BETRAYAL_COMMANDS.ACKNOWLEDGE_RECENT_ROLL
        ? resolveAcknowledgeableRecentRoll(core)
        : null;
    const isRecentRollAcknowledgementParticipant = Boolean(
        pendingRecentRollAcknowledgement
        && resolveRecentRollRequiredPlayerIds(core, pendingRecentRollAcknowledgement).includes(command.playerId),
    );
    if (!isPlayersTurn(core, command.playerId) && !isRecentRollAcknowledgementParticipant) {
        return { valid: false, error: '还没有轮到该玩家。' };
    }
    if (
        core.turnEndedByDiscovery
        && command.type !== BETRAYAL_COMMANDS.END_TURN
        && command.type !== BETRAYAL_COMMANDS.USE_RABBIT_FOOT
        && command.type !== BETRAYAL_COMMANDS.USE_ROLL_REROLL_ITEM
        && !(command.type === BETRAYAL_COMMANDS.USE_POSSESSION && canUseBookForPendingEventRoll(core, command.playerId, command.payload.cardId))
        && command.type !== BETRAYAL_COMMANDS.ROLL_EVENT
        && command.type !== BETRAYAL_COMMANDS.FINALIZE_EVENT_ROLL
        && command.type !== BETRAYAL_COMMANDS.RESOLVE_EVENT_CHOICE
        && command.type !== BETRAYAL_COMMANDS.ACKNOWLEDGE_CARD_RESOLUTION
        && command.type !== BETRAYAL_COMMANDS.ACKNOWLEDGE_RECENT_ROLL
    ) {
        return { valid: false, error: '探索新房间后回合已经结束。' };
    }

    switch (command.type) {
        case BETRAYAL_COMMANDS.MOVE_TO_ROOM: {
            const payload = command.payload;
            const targetRooms = new Set(resolveMoveTargetRooms(core).map((room) => room.id));
            if (payload.useSkeletonKey && canUseSkeletonKeyForMove(core, payload.roomId)) {
                return { valid: true };
            }
            if (core.movesRemaining < resolveBetrayalMoveCost(core) || !targetRooms.has(payload.roomId)) {
                return { valid: false, error: '目标房间不可移动。' };
            }
            return { valid: true };
        }
        case BETRAYAL_COMMANDS.EXPLORE_ROOM: {
            const explorableSlots = resolveExplorableRoomSlots(core);
            const nextSlot = command.payload.roomId
                ? explorableSlots.find((room) => room.id === command.payload.roomId) ?? null
                : explorableSlots[0] ?? null;
            if (!nextSlot) {
                return { valid: false, error: '当前没有可探索房间。' };
            }
            if (command.payload.roomId && !explorableSlots.some((room) => room.id === command.payload.roomId)) {
                return { valid: false, error: '指定房间不是当前开放门位。' };
            }
            if (command.payload.useHolySymbol && !canUseHolySymbolForDiscovery(core)) {
                return { valid: false, error: '当前探索者不能使用圣符替换发现板块。' };
            }
            const placement = resolveRoomPlacementContext(core, nextSlot);
            const roomDraw = resolveRoomDraw(core, nextSlot.floor, {
                useHolySymbol: command.payload.useHolySymbol && canUseHolySymbolForDiscovery(core),
                placement,
            });
            const roomTemplate = roomDraw.roomTemplate;
            if (!roomTemplate) {
                return { valid: false, error: '当前区域没有可发现房间。' };
            }
            const deckKind = resolveRoomTemplateDiscoveryDeckKind(roomTemplate);
            const orientationOptions = resolveRoomPlacementOrientationOptions(
                core,
                roomTemplate,
                placement,
                roomDraw.selectedRoomRequiresOpenFrontier,
            );
            if (command.payload.useIdol) {
                if (!canUseIdolToSkipEvent(core)) {
                    return { valid: false, error: '当前探索者不能使用雕像跳过事件抽取。' };
                }
                if (deckKind !== 'event') {
                    return { valid: false, error: '雕像只能在发现事件符号板块时使用。' };
                }
            }
            if (command.payload.ignoreEventSymbolWithTraitorPower) {
                if (command.payload.useIdol) {
                    return { valid: false, error: '事件符号只能选择一种跳过方式。' };
                }
                if (!canUseBetrayalTraitorPowers(core, command.playerId)) {
                    return { valid: false, error: '只有作祟开始后的存活叛徒能忽略事件符号。' };
                }
                if (deckKind !== 'event') {
                    return { valid: false, error: '叛徒只能在发现事件符号板块时忽略事件符号。' };
                }
            }
            if (command.payload.orientationTurns !== undefined) {
                if (!isRoomOrientationTurns(command.payload.orientationTurns)) {
                    return { valid: false, error: '房间朝向无效。' };
                }
                if (!orientationOptions.some((option) => option.orientationTurns === command.payload.orientationTurns)) {
                    return {
                        valid: false,
                        error: canConnectDoorwaysToEntry(roomTemplate.doorways, placement.entryEdge, command.payload.orientationTurns)
                            ? '此朝向会封死当前区域。'
                            : '此朝向没有走廊连接入口。',
                    };
                }
            }
            if (roomDraw.resolution.requiresTileAdjustment) {
                const placementOrientationTurns = command.payload.orientationTurns
                    ?? orientationOptions[0]?.orientationTurns
                    ?? orientDoorwaysForPlacement(roomTemplate.doorways, placement.entryEdge).orientationTurns;
                const adjustmentOptions = resolveRoomTileAdjustmentOptionsForPlacement(
                    core,
                    roomTemplate,
                    placement,
                    placementOrientationTurns,
                );
                if (!command.payload.roomTileAdjustment) {
                    return { valid: false, error: '需要先调整该区域已有板块，保留至少一个开放走廊。' };
                }
                if (!adjustmentOptions.some((option) => roomTileAdjustmentSelectionsMatch(option, command.payload.roomTileAdjustment!))) {
                    return { valid: false, error: '该房间板块调整不能保留开放走廊。' };
                }
            }
            return { valid: true };
        }
        case BETRAYAL_COMMANDS.USE_POSSESSION: {
            return validateBetrayalPossessionSpecialActionCommand(core, command.playerId, command.payload);
        }
        case BETRAYAL_COMMANDS.USE_ROOM_EFFECT: {
            const actionStatus = resolveBetrayalRoomSpecialActionStatus(core);
            if (!actionStatus.canUse) {
                return { valid: false, error: actionStatus.reason ?? '当前房间没有可使用的房间效果。' };
            }
            return { valid: true };
        }
        case BETRAYAL_COMMANDS.TRADE_POSSESSION: {
            if (core.pendingTradeAgreement) {
                return { valid: false, error: '已有待同意的交易。' };
            }
            if (core.tradeUsedThisTurnPlayerIds.includes(core.currentExplorer.playerId)) {
                return { valid: false, error: '本回合已经完成过交易。' };
            }
            const cardIds = resolveTradeCardIds(command.payload);
            const tradeTargets = command.payload.useDog ? resolveDogTradeTargets(core) : resolveTradeTargets(core);
            const targetPlayerId = command.payload.targetPlayerId;
            const targetCardIds = command.payload.targetCardIds ?? [];
            const target = tradeTargets.find((explorer) => explorer.playerId === targetPlayerId);
            if ((cardIds.length === 0 && targetCardIds.length === 0) || !targetPlayerId) {
                return { valid: false, error: '缺少交易对象或持有物。' };
            }
            if (command.payload.useDog && !canUseDogForTrade(core)) {
                return { valid: false, error: '当前探索者不能使用狗进行远距交易。' };
            }
            const requesterCardStatuses = cardIds.map((cardId) => resolveBetrayalTradeCardStatus(core, cardId, {
                ownerPlayerId: core.currentExplorer.playerId,
                ownerRole: 'requester',
                useDogTrade: command.payload.useDog,
            }));
            const invalidRequesterCard = requesterCardStatuses.find((status) => !status.canTrade);
            if (invalidRequesterCard) {
                return { valid: false, error: invalidRequesterCard.reason ?? '当前探索者没有这件持有物。' };
            }
            if (!target) {
                return { valid: false, error: command.payload.useDog ? '狗只能和 4 格以内的玩家交易。' : '只能和同房间队友交易。' };
            }
            const targetCardStatuses = targetCardIds.map((cardId) => resolveBetrayalTradeCardStatus(core, cardId, {
                ownerPlayerId: target.playerId,
                ownerRole: 'target',
            }));
            const invalidTargetCard = targetCardStatuses.find((status) => !status.canTrade);
            if (invalidTargetCard) {
                return { valid: false, error: invalidTargetCard.reason ?? '交易对象没有这件持有物。' };
            }
            return { valid: true };
        }
        case BETRAYAL_COMMANDS.LOOT_CORPSE: {
            const corpseTargets = resolveCorpseLootTargets(core);
            const sourcePlayerId = command.payload.sourcePlayerId;
            const sourceExplorer = corpseTargets.find((explorer) => explorer.playerId === sourcePlayerId);
            const cardId = command.payload.cardId;
            if (!sourcePlayerId || !sourceExplorer || !cardId) {
                return { valid: false, error: '搜刮尸体必须先选择尸体和具体持有物。' };
            }
            if (!sourceExplorer.inventory.some((card) => card.id === cardId)) {
                return { valid: false, error: '该尸体上没有这件物品或预兆。' };
            }
            return { valid: true };
        }
        case BETRAYAL_COMMANDS.END_TURN:
            return { valid: true };
        case BETRAYAL_COMMANDS.ACKNOWLEDGE_RECENT_ROLL: {
            return recentRollAcknowledgement ?? { valid: false, error: '当前没有待确认的投骰结果。' };
        }
        case BETRAYAL_COMMANDS.ACKNOWLEDGE_TURN_END_ROLL:
            return { valid: false, error: '当前没有待确认的回合结束投骰。' };
        case BETRAYAL_COMMANDS.ACKNOWLEDGE_CARD_RESOLUTION:
            return { valid: false, error: '当前没有待确认的翻牌结算。' };
        case BETRAYAL_COMMANDS.RESOLVE_DAMAGE_ALLOCATION:
            return { valid: false, error: '当前没有待分配的伤害。' };
        case BETRAYAL_COMMANDS.HAUNT_ATTACK:
        case BETRAYAL_COMMANDS.RESOLVE_MONSTER_DAMAGE:
        case BETRAYAL_COMMANDS.RESOLVE_MONSTER_TURN_START:
        case BETRAYAL_COMMANDS.ROLL_MONSTER_MOVEMENT_GROUP:
        case BETRAYAL_COMMANDS.MOVE_MONSTER_TO_ROOM:
        case BETRAYAL_COMMANDS.MONSTER_ATTACK_HERO:
        case BETRAYAL_COMMANDS.END_BLOOD_FROM_STONE_MONSTER_TURN:
        case BETRAYAL_COMMANDS.PLACE_BLOOD_FROM_STONE_EXTRA_STONE_CHERUBS:
        case BETRAYAL_COMMANDS.GIVE_MIRROR_HINT:
        case BETRAYAL_COMMANDS.RESOLVE_HELPING_HANDS_ATTACK_REWARD:
        case BETRAYAL_COMMANDS.MOVE_HELPING_HANDS_TROLL_HAND:
        case BETRAYAL_COMMANDS.HELPING_HANDS_TROLL_HAND_ATTACK:
        case BETRAYAL_COMMANDS.END_HELPING_HANDS_MONSTER_TURN:
        case BETRAYAL_COMMANDS.TAKE_PHOTO:
        case BETRAYAL_COMMANDS.SMASH_MAGIC_CAMERA:
        case BETRAYAL_COMMANDS.PHANTOM_PHOTOGRAPHER_ATTACK:
        case BETRAYAL_COMMANDS.PLAY_PEEKABOO:
        case BETRAYAL_COMMANDS.LEARN_ABOUT_JACK:
        case BETRAYAL_COMMANDS.STUDY_EXORCISM:
        case BETRAYAL_COMMANDS.EXORCISE_JACK:
        case BETRAYAL_COMMANDS.STUDY_MUMMY_NAME:
        case BETRAYAL_COMMANDS.LEARN_MUMMY_BANISHMENT:
        case BETRAYAL_COMMANDS.BANISH_MUMMY:
        case BETRAYAL_COMMANDS.PICK_UP_MUMMY_GIRL:
        case BETRAYAL_COMMANDS.GIVE_GIRL_TO_MUMMY:
        case BETRAYAL_COMMANDS.GIVE_OMEN_TO_MUMMY:
        case BETRAYAL_COMMANDS.RESOLVE_MUMMY_ATTACK_REWARD:
        case BETRAYAL_COMMANDS.CONFIRM_HAUNT_SETUP_ENTRY:
            return { valid: false, error: '当前还未进入 haunt 阶段。' };
        case BETRAYAL_COMMANDS.COMPLETE_SCENARIO:
            return { valid: false, error: '真实首剧本不能通过手工结算完成。' };
        default:
            return { valid: false, error: '未知运行时命令。' };
    }
}

function validateHauntAction(state: MatchState<BetrayalCore>, command: BetrayalCommand): ValidationResult {
    const core = state.core;
    if (core.phase !== 'haunt') {
        return { valid: false, error: '当前不在 haunt 阶段。' };
    }
    const pendingHelpingHandsReward = resolveHelpingHandsPendingAttackReward(core);
    if (
        pendingHelpingHandsReward
        && command.type !== BETRAYAL_COMMANDS.RESOLVE_HELPING_HANDS_ATTACK_REWARD
        && command.type !== BETRAYAL_COMMANDS.ACKNOWLEDGE_RECENT_ROLL
    ) {
        return { valid: false, error: '请先选择造成伤害或偷取物品/预兆。' };
    }
    const pendingMummyReward = resolveMummyPendingAttackReward(core);
    if (
        pendingMummyReward
        && command.type !== BETRAYAL_COMMANDS.RESOLVE_MUMMY_ATTACK_REWARD
        && command.type !== BETRAYAL_COMMANDS.ACKNOWLEDGE_RECENT_ROLL
    ) {
        return { valid: false, error: '请先选择木乃伊造成伤害或偷取物品/预兆。' };
    }
    const recentRollRerollValidation = command.type === BETRAYAL_COMMANDS.USE_RABBIT_FOOT
        || command.type === BETRAYAL_COMMANDS.USE_ROLL_REROLL_ITEM
        ? validateBetrayalRecentRollRerollItemCommand(core, command.playerId, command.payload, {
            legacyRabbitFoot: command.type === BETRAYAL_COMMANDS.USE_RABBIT_FOOT,
        })
        : null;
    if (recentRollRerollValidation) {
        if (core.pendingDamageAllocation && !isPendingDamageAllocationForAttackRoll(core)) {
            return { valid: false, error: '请先分配当前伤害。' };
        }
        return recentRollRerollValidation;
    }
    const eventRollFinalization = validateEventRollFinalization(core, command);
    if (eventRollFinalization) {
        return eventRollFinalization;
    }
    const pendingDamageAllocationValidation = validateBetrayalDamageAllocationResolution(core, command);
    if (pendingDamageAllocationValidation) {
        return pendingDamageAllocationValidation;
    }
    const cardResolutionAcknowledgement = validateCardResolutionAcknowledgement(core, command);
    if (cardResolutionAcknowledgement) {
        return cardResolutionAcknowledgement;
    }
    if (command.type === BETRAYAL_COMMANDS.RESOLVE_TRADE_AGREEMENT) {
        if (isBetrayalPlayerControllingMonster(core, command.playerId)) {
            return { valid: false, error: '怪物不能使用持有物、预兆、兔脚、交易或搜刮尸体。' };
        }
        return validatePreHauntAction({ ...state, core: { ...core, phase: 'preHaunt' } }, command);
    }
    if (command.type === BETRAYAL_COMMANDS.RESOLVE_SICKNESS_EXCHANGE) {
        const pendingExchange = core.scenarioRuntime.dust?.pendingSicknessExchange;
        if (!pendingExchange) {
            return { valid: false, error: '当前没有待回应的疾病标记交换。' };
        }
        if (pendingExchange.targetPlayerId !== command.playerId) {
            return { valid: false, error: '必须由交换目标玩家回应。' };
        }
        if (typeof command.payload.accept !== 'boolean') {
            return { valid: false, error: '交换回应必须选择同意或拒绝。' };
        }
        return { valid: true };
    }
    if (core.scenarioRuntime.dust?.pendingSicknessExchange) {
        return { valid: false, error: '请先等待疾病标记交换回应。' };
    }
    const pendingTurnEndRollValidation = validateTurnEndRollAcknowledgement(core, command);
    if (pendingTurnEndRollValidation) {
        return pendingTurnEndRollValidation;
    }
    const recentRollAcknowledgement = validateRecentRollAcknowledgement(core, command);
    if (recentRollAcknowledgement?.valid) {
        return recentRollAcknowledgement;
    }
    if ((core.pendingCardResolutionQueue ?? []).length > 0) {
        return { valid: false, error: '请先确认当前翻牌结算。' };
    }
    const helpingHandsMonsterTurnStatus = resolveHelpingHandsMonsterTurnStatus(core);
    const isHelpingHandsMonsterCommand = isBetrayalHelpingHandsMonsterTurnCommand(command);
    if (helpingHandsMonsterTurnStatus.active && !isHelpingHandsMonsterCommand) {
        return { valid: false, error: '当前正在进行巨魔手怪物回合，请先完成巨魔手行动。' };
    }
    const bloodFromStoneMonsterTurnStatus = resolveBloodFromStoneMonsterTurnStatus(core);
    const isBloodFromStoneMonsterCommand = isBetrayalBloodFromStoneMonsterTurnCommand(core, command);
    if (bloodFromStoneMonsterTurnStatus.active && !isBloodFromStoneMonsterCommand) {
        return { valid: false, error: '当前正在进行石像小天使怪物回合，请先完成石像小天使行动。' };
    }
    if (
        bloodFromStoneMonsterTurnStatus.active
        && isBloodFromStoneMonsterCommand
        && bloodFromStoneMonsterTurnStatus.controllerPlayerId !== command.playerId
    ) {
        return { valid: false, error: '只有当前石像小天使怪物回合控制者能执行怪物行动。' };
    }
    if (!bloodFromStoneMonsterTurnStatus.active && isBloodFromStoneMonsterCommand) {
        return { valid: false, error: '石像小天使怪物回合尚未开始。' };
    }
    const isStandardMonsterTurnCommand = isBetrayalStandardMonsterTurnCommand(core, command);
    const pendingRecentRollAcknowledgement = command.type === BETRAYAL_COMMANDS.ACKNOWLEDGE_RECENT_ROLL
        ? resolveAcknowledgeableRecentRoll(core)
        : null;
    const isRecentRollAcknowledgementParticipant = Boolean(
        pendingRecentRollAcknowledgement
        && resolveRecentRollRequiredPlayerIds(core, pendingRecentRollAcknowledgement).includes(command.playerId),
    );
    if (
        !isPlayersTurn(core, command.playerId)
        && !(helpingHandsMonsterTurnStatus.active && isHelpingHandsMonsterCommand)
        && !(bloodFromStoneMonsterTurnStatus.active && isBloodFromStoneMonsterCommand)
        && !(isStandardMonsterTurnCommand && canPlayerControlStandardMonsterTurn(core, command.playerId))
        && !isRecentRollAcknowledgementParticipant
    ) {
        return { valid: false, error: '还没有轮到该玩家。' };
    }

    const actor = findExplorerByPlayerId(core, command.playerId);
    if (!actor) {
        return { valid: false, error: '当前行动者不存在。' };
    }
    const actorRoomId = resolveControlledRoomId(core, actor);
    const isTraitor = core.scenarioRuntime.traitorPlayerId === command.playerId;
    const isDead = core.scenarioRuntime.deadExplorerPlayerIds.includes(command.playerId);
    if (isStandardMonsterTurnCommand && !canPlayerControlStandardMonsterTurn(core, command.playerId)) {
        return { valid: false, error: '只有当前叛徒能执行普通怪物回合动作。' };
    }

    if (command.type === BETRAYAL_COMMANDS.HAUNT_ATTACK && core.usedCardIdsThisTurn.includes('haunt-attack')) {
        return { valid: false, error: '本回合已经攻击过。' };
    }

    if (
        isBetrayalPlayerControllingMonster(core, actor.playerId)
        && (
            command.type === BETRAYAL_COMMANDS.USE_POSSESSION
            || command.type === BETRAYAL_COMMANDS.TRADE_POSSESSION
            || command.type === BETRAYAL_COMMANDS.RESOLVE_TRADE_AGREEMENT
            || command.type === BETRAYAL_COMMANDS.LOOT_CORPSE
        )
    ) {
        return { valid: false, error: '怪物不能使用持有物、预兆、兔脚、交易或搜刮尸体。' };
    }

    const monsterActionValidation = validateBetrayalMonsterActionCommand(core, command);
    if (monsterActionValidation) {
        return monsterActionValidation;
    }

    switch (command.type) {
        case BETRAYAL_COMMANDS.MOVE_TO_ROOM:
            if (isDead) {
                if (shouldDeadPlayerControlFeverish(core, actor.playerId)) {
                    if (core.movesRemaining <= 0) {
                        return { valid: false, error: '狂热病患本回合没有剩余移动点。' };
                    }
                    const targetRoom = core.rooms.find((room) => room.id === command.payload.roomId);
                    const currentRoom = core.rooms.find((room) => room.id === actorRoomId);
                    if (!targetRoom || targetRoom.state !== 'discovered') {
                        return { valid: false, error: '目标房间不可移动。' };
                    }
                    if (targetRoom.id === actorRoomId || roomDistanceByLayout(currentRoom, targetRoom) !== 1) {
                        return { valid: false, error: '狂热病患只能移动到相邻房间。' };
                    }
                    return { valid: true };
                }
                if (!core.scenarioRuntime.jackSpiritReleased || actor.playerId !== core.scenarioRuntime.traitorPlayerId) {
                    return { valid: false, error: '该角色已死亡，当前不能移动。' };
                }
                if (core.movesRemaining <= 0) {
                    return { valid: false, error: '杰克之灵本回合没有剩余移动点。' };
                }
                const targetRoom = core.rooms.find((room) => room.id === command.payload.roomId);
                if (!targetRoom || targetRoom.state !== 'discovered') {
                    return { valid: false, error: '目标房间不可移动。' };
                }
                const currentRoom = core.rooms.find((room) => room.id === actorRoomId);
                if (targetRoom.id === actorRoomId) {
                    return { valid: false, error: '杰克之灵必须移动到相邻房间。' };
                }
                if (roomDistanceByLayout(currentRoom, targetRoom) !== 1) {
                    return { valid: false, error: '杰克之灵只能移动到相邻房间。' };
                }
                return { valid: true };
            }
            if (isTraitor && canUseStalkThePrey(core, actor)) {
                const target = core.rooms.find((room) => room.id === command.payload.roomId);
                if (target && resolveStalkThePreyTargets(core, actor).some((room) => room.id === target.id)) {
                    return { valid: true };
                }
            }
            return validatePreHauntAction({ ...state, core: { ...core, phase: 'preHaunt' } }, command);
        case BETRAYAL_COMMANDS.EXPLORE_ROOM:
            if (isDead) {
                return { valid: false, error: '死亡探索者不能探索新房间。' };
            }
            return validatePreHauntAction(state, command);
        case BETRAYAL_COMMANDS.USE_ROOM_EFFECT:
            if (isDead) {
                return { valid: false, error: '死亡探索者不能使用房间效果。' };
            }
            return validatePreHauntAction(state, command);
        case BETRAYAL_COMMANDS.USE_POSSESSION:
            return validatePreHauntAction(state, command);
        case BETRAYAL_COMMANDS.ROLL_EVENT: {
            const pending = core.pendingEventRollStart;
            if (!pending) {
                return { valid: false, error: '当前没有等待投掷的事件。' };
            }
            if (pending.playerId !== command.playerId) {
                return { valid: false, error: '只有触发事件的玩家可以投掷。' };
            }
            if (command.payload.sourceTitle && command.payload.sourceTitle !== pending.sourceTitle) {
                return { valid: false, error: '当前事件已经改变。' };
            }
            return { valid: true };
        }
        case BETRAYAL_COMMANDS.USE_RABBIT_FOOT:
        case BETRAYAL_COMMANDS.USE_ROLL_REROLL_ITEM:
        case BETRAYAL_COMMANDS.TRADE_POSSESSION:
        case BETRAYAL_COMMANDS.RESOLVE_TRADE_AGREEMENT:
        case BETRAYAL_COMMANDS.LOOT_CORPSE:
            return validatePreHauntAction({ ...state, core: { ...core, phase: 'preHaunt' } }, command);
        case BETRAYAL_COMMANDS.RESOLVE_EVENT_CHOICE:
            return validatePreHauntAction(state, command);
        case BETRAYAL_COMMANDS.END_TURN:
            return { valid: true };
        case BETRAYAL_COMMANDS.ACKNOWLEDGE_RECENT_ROLL: {
            return validateRecentRollAcknowledgement(core, command) ?? { valid: false, error: '当前没有待确认的投骰结果。' };
        }
        case BETRAYAL_COMMANDS.ACKNOWLEDGE_TURN_END_ROLL:
            return { valid: false, error: '当前没有待确认的回合结束投骰。' };
        case BETRAYAL_COMMANDS.RESOLVE_HELPING_HANDS_ATTACK_REWARD: {
            const pending = pendingHelpingHandsReward;
            if (!pending) {
                return { valid: false, error: '当前没有待选择的援手攻击奖励。' };
            }
            if (pending.attackerPlayerId !== actor.playerId) {
                return { valid: false, error: '必须由攻击获胜者选择伤害或偷牌。' };
            }
            if (command.payload.choice === 'damage') {
                return { valid: true };
            }
            if (command.payload.choice !== 'steal') {
                return { valid: false, error: '必须选择造成伤害或偷取物品/预兆。' };
            }
            const cardId = command.payload.cardId;
            if (!cardId) {
                return { valid: false, error: '偷取时必须选择一张物品或预兆。' };
            }
            if (!resolveHelpingHandsStealableCards(core, pending.defenderPlayerId).some((card) => card.id === cardId)) {
                return { valid: false, error: '只能偷取防守者持有的物品或预兆。' };
            }
            return { valid: true };
        }
        case BETRAYAL_COMMANDS.RESOLVE_MUMMY_ATTACK_REWARD: {
            const pending = pendingMummyReward;
            if (!pending) {
                return { valid: false, error: '当前没有待选择的木乃伊攻击奖励。' };
            }
            if (pending.controllerPlayerId !== actor.playerId) {
                return { valid: false, error: '必须由木乃伊控制者选择伤害或偷取。' };
            }
            if (command.payload.choice === 'damage') {
                return { valid: true };
            }
            if (command.payload.choice !== 'steal') {
                return { valid: false, error: '必须选择造成伤害或偷取物品/预兆。' };
            }
            const cardId = command.payload.cardId;
            if (!cardId) {
                return { valid: false, error: '偷取时必须选择一张物品或预兆。' };
            }
            if (!pending.stealableCardIds.includes(cardId)) {
                return { valid: false, error: '只能偷取防守者当前可被木乃伊夺取的物品或预兆。' };
            }
            if (!resolveMummyStealableCards(core, pending.defenderPlayerId).some((card) => card.id === cardId)) {
                return { valid: false, error: '该木乃伊奖励目标已经不再可偷。' };
            }
            return { valid: true };
        }
        case BETRAYAL_COMMANDS.MOVE_HELPING_HANDS_TROLL_HAND: {
            const status = resolveHelpingHandsMonsterTurnStatus(core);
            if (!status.active || status.controllerPlayerId !== actor.playerId) {
                return { valid: false, error: '只有当前奇异护符持有人能控制巨魔手移动。' };
            }
            const monster = findHelpingHandsTrollHand(core, command.payload.monsterId);
            if (!monster) {
                return { valid: false, error: '必须选择一个巨魔手。' };
            }
            if (!command.payload.roomId || !resolveHelpingHandsTrollHandMoveOptions(core, monster.id)
                .some((room) => room.id === command.payload.roomId)) {
                return { valid: false, error: '巨魔手只能移动到已发现且真实连接的房间。' };
            }
            return { valid: true };
        }
        case BETRAYAL_COMMANDS.HELPING_HANDS_TROLL_HAND_ATTACK: {
            const status = resolveHelpingHandsMonsterTurnStatus(core);
            if (!status.active || status.controllerPlayerId !== actor.playerId) {
                return { valid: false, error: '只有奇异护符持有人能控制巨魔手攻击。' };
            }
            const options = resolveHelpingHandsTrollHandAttackOptions(core);
            const option = command.payload.combined
                ? options.find((item) => item.combined)
                : options.find((item) => !item.combined && item.trollHandIds[0] === command.payload.monsterId);
            if (!option) {
                return { valid: false, error: command.payload.combined ? '两个巨魔手必须同板块且未行动才能合击。' : '必须选择一个可行动的巨魔手。' };
            }
            if (!command.payload.targetPlayerId || !option.targetPlayerIds.includes(command.payload.targetPlayerId)) {
                return { valid: false, error: '巨魔手只能攻击同板块的存活探索者。' };
            }
            return { valid: true };
        }
        case BETRAYAL_COMMANDS.END_HELPING_HANDS_MONSTER_TURN: {
            const status = resolveHelpingHandsMonsterTurnStatus(core);
            return status.active && status.controllerPlayerId === actor.playerId
                ? { valid: true }
                : { valid: false, error: '只有当前奇异护符持有人能结束巨魔手怪物回合。' };
        }
        case BETRAYAL_COMMANDS.TAKE_PHOTO: {
            const target = command.payload.targetPlayerId
                ? findExplorerByPlayerId(core, command.payload.targetPlayerId)
                : null;
            const trait = command.payload.trait ?? 'speed';
            if (!isMagicCameraHaunt(core) || isDead || !isTraitor) {
                return { valid: false, error: '只有魔法相机剧本中的存活叛徒能拍照。' };
            }
            if (!target || target.playerId === actor.playerId) {
                return { valid: false, error: '拍照必须选择一名英雄。' };
            }
            if (!Object.prototype.hasOwnProperty.call(actor.traits, trait)) {
                return { valid: false, error: '拍照成功后必须选择一个有效属性提升。' };
            }
            const actionBudget = validateHauntSpecialActionBudget(core, 'take-photo', actor);
            if (actionBudget) {
                return actionBudget;
            }
            if (!canTakeMagicCameraPhoto(core, actor, target.playerId)) {
                return { valid: false, error: '目标英雄没有本质，或不在叛徒同板块/魔法相机视线内。' };
            }
            return { valid: true };
        }
        case BETRAYAL_COMMANDS.SMASH_MAGIC_CAMERA:
            {
                const actionBudget = validateHauntSpecialActionBudget(core, 'smash-magic-camera', actor);
                if (actionBudget) {
                    return actionBudget;
                }
            }
            if (!canSmashMagicCamera(core, actor)) {
                return { valid: false, error: '必须由同板块的存活英雄砸毁叛徒持有的魔法相机。' };
            }
            return { valid: true };
        case BETRAYAL_COMMANDS.PHANTOM_PHOTOGRAPHER_ATTACK: {
            const monster = findPhantomPhotographer(core, command.payload.monsterId);
            const target = command.payload.targetPlayerId
                ? findExplorerByPlayerId(core, command.payload.targetPlayerId)
                : null;
            if (!isMagicCameraHaunt(core) || !monster) {
                return { valid: false, error: '当前没有可行动的幻影摄影师。' };
            }
            if (core.scenarioRuntime.magicCamera?.stunnedPhantomPhotographerIds.includes(monster.id)) {
                return { valid: false, error: '该幻影摄影师已被眩晕，当前不能攻击。' };
            }
            if (!target || target.playerId === core.scenarioRuntime.traitorPlayerId) {
                return { valid: false, error: '幻影摄影师必须选择一名英雄。' };
            }
            if (!resolveMagicCameraPhantomAttackTargets(core, monster).some((explorer) => explorer.playerId === target.playerId)) {
                return { valid: false, error: '目标英雄不在幻影摄影师视线内。' };
            }
            return { valid: true };
        }
        case BETRAYAL_COMMANDS.PLAY_PEEKABOO: {
            if (!isBloodFromStoneHaunt(core) || isTraitor || isDead) {
                return { valid: false, error: '只有第5号作祟《顽石之血》中的存活英雄能玩躲猫猫。' };
            }
            const actionBudget = validateHauntSpecialActionBudget(core, 'play-peekaboo', actor);
            if (actionBudget) {
                return actionBudget;
            }
            const selection = resolveBloodFromStonePeekabooSelection(
                core,
                actor,
                command.payload.sameRoomMonsterId,
                command.payload.lineOfSightMonsterId,
            );
            if (!selection.option) {
                return { valid: false, error: selection.reason ?? '当前没有合法的玩躲猫猫目标组合。' };
            }
            return { valid: true };
        }
        case BETRAYAL_COMMANDS.GIVE_MIRROR_HINT: {
            const uponReflection = core.scenarioRuntime.uponReflection;
            if (!isUponReflectionHaunt(core) || !uponReflection) {
                return { valid: false, error: '当前不是怪异的镜子作祟。' };
            }
            if (actor.playerId !== uponReflection.revealerPlayerId) {
                return { valid: false, error: '只有作祟揭秘者能给出镜中提示。' };
            }
            if (isDead) {
                return { valid: false, error: '死亡探索者不能给出镜中提示。' };
            }
            if (hasUsedMirrorHintThisTurn(core, actor.playerId)) {
                return { valid: false, error: '作祟揭秘者本回合已经给过镜中提示。' };
            }
            const target = command.payload.targetPlayerId
                ? findExplorerByPlayerId(core, command.payload.targetPlayerId)
                : null;
            if (!target || core.scenarioRuntime.deadExplorerPlayerIds.includes(target.playerId)) {
                return { valid: false, error: '镜中提示必须交给一名存活玩家。' };
            }
            if (!command.payload.eventName?.trim()) {
                return { valid: false, error: '镜中提示必须选择一张事件牌。' };
            }
            if (core.deckCounts.event <= 0 || core.eventOrder.length === 0) {
                return { valid: false, error: '事件牌堆没有可用于镜中提示的事件牌。' };
            }
            if (!resolveUponReflectionHintEvent(core, command.payload.eventName)) {
                return { valid: false, error: '镜中提示只能选择当前事件牌堆中的事件牌。' };
            }
            return { valid: true };
        }
        case BETRAYAL_COMMANDS.BREAK_MIRROR_CURSE: {
            const uponReflection = core.scenarioRuntime.uponReflection;
            if (!isUponReflectionHaunt(core) || !uponReflection?.secretCombination) {
                return { valid: false, error: '当前不是怪异的镜子作祟，或秘密组合尚未记录。' };
            }
            if (actor.playerId === uponReflection.revealerPlayerId) {
                return { valid: false, error: '作祟揭秘者被困镜中，不能执行破咒。' };
            }
            if (isDead) {
                return { valid: false, error: '死亡探索者不能破咒。' };
            }
            const trait = command.payload.trait;
            if (!trait || !BETRAYAL_TRAIT_KEYS.includes(trait)) {
                return { valid: false, error: '破咒必须选择一个有效属性。' };
            }
            if (!command.payload.omenId && !command.payload.omenName?.trim()) {
                return { valid: false, error: '破咒必须报出自己持有的一张预兆。' };
            }
            const selectedOmen = resolveUponReflectionOmenSelection(actor, command.payload);
            if (!selectedOmen) {
                return { valid: false, error: '破咒只能报出当前行动者持有的预兆。' };
            }
            const actionBudget = validateHauntSpecialActionBudget(core, 'break-mirror-curse', actor);
            if (actionBudget) {
                return actionBudget;
            }
            return { valid: true };
        }
        case BETRAYAL_COMMANDS.PLACE_BLOOD_FROM_STONE_EXTRA_STONE_CHERUBS: {
            if (!isBloodFromStoneHaunt(core) || isDead) {
                return { valid: false, error: '只有第5号作祟《顽石之血》中的存活英雄能补放石像小天使。' };
            }
            const plan = resolveBloodFromStoneSetupPlacementPlan(core);
            if (plan.pendingPlayerChoiceCount <= 0) {
                return { valid: false, error: '当前没有需要玩家选择房间的石像小天使。' };
            }
            const roomIds = command.payload.roomIds;
            if (!Array.isArray(roomIds) || roomIds.length !== plan.pendingPlayerChoiceCount) {
                return {
                    valid: false,
                    error: `必须选择 ${plan.pendingPlayerChoiceCount} 个房间来补放石像小天使。`,
                };
            }
            const legalRoomIds = new Set(plan.playerChoiceCandidateRoomIds);
            const invalidRoomId = roomIds.find((roomId) => !legalRoomIds.has(roomId));
            if (invalidRoomId) {
                return { valid: false, error: '石像小天使只能补放到屋内已发现房间。' };
            }
            return { valid: true };
        }
        case BETRAYAL_COMMANDS.CONFIRM_HAUNT_SETUP_ENTRY: {
            const entryId = command.payload.entryId;
            const setupQueue = resolveBetrayalHauntSetupQueue(core);
            const entry = setupQueue.find((candidate) => candidate.id === entryId);
            if (!entryId || !entry) {
                return { valid: false, error: '当前 setup 队列没有这个条目。' };
            }
            if (entry.status === 'resolved') {
                return { valid: false, error: '该 setup 条目已经确认。' };
            }
            if (
                !isDustHaunt(core)
                || (
                    entryId !== 'monster-card-left-of-revealer'
                    && entryId !== 'prepare-research-tokens'
                )
            ) {
                return { valid: false, error: '当前只支持确认灰尘 setup 条目。' };
            }
            return { valid: true };
        }
        case BETRAYAL_COMMANDS.HAUNT_ATTACK:
            if (command.payload.target === 'dynamite-room' || isDynamiteCardId(command.payload.weaponCardId)) {
                const dynamiteCard = resolveDynamiteInventoryCard(actor, command.payload.weaponCardId);
                if (command.payload.target !== 'dynamite-room' || !isDynamiteCardId(command.payload.weaponCardId)) {
                    return { valid: false, error: '炸药必须作为攻击使用，并选择当前或相邻板块作为目标。' };
                }
                if (isDead) {
                    return { valid: false, error: '死亡探索者不能使用炸药。' };
                }
                if (!dynamiteCard) {
                    return { valid: false, error: '当前探索者没有可用于攻击的炸药。' };
                }
                if (!core.turnStartInventoryCardIds.includes(dynamiteCard.id)) {
                    return { valid: false, error: '本回合新获得的武器不能立刻使用。' };
                }
                if (core.usedCardIdsThisTurn.includes(dynamiteCard.id)) {
                    return { valid: false, error: '这把武器本回合已经使用。' };
                }
                const targetRoomId = command.payload.targetRoomId;
                if (!targetRoomId) {
                    return { valid: false, error: '炸药攻击必须选择当前或相邻板块。' };
                }
                const targetRoom = core.rooms.find((room) => room.id === targetRoomId);
                if (!targetRoom || targetRoom.state !== 'discovered') {
                    return { valid: false, error: '炸药只能选择已发现板块。' };
                }
                if (!isDynamiteTargetRoom(core, actorRoomId, targetRoom.id)) {
                    return { valid: false, error: '炸药只能选择你所在的板块或相邻板块。' };
                }
                return { valid: true };
            }
            if (isDustHaunt(core)) {
                const weaponEffect = command.payload.weaponCardId
                    ? resolveAttackWeaponEffect(actor, command.payload.weaponCardId)
                    : null;
                if (command.payload.weaponCardId) {
                    if (!weaponEffect) {
                        return { valid: false, error: '当前探索者没有可用于攻击的这把武器。' };
                    }
                    if (!core.turnStartInventoryCardIds.includes(command.payload.weaponCardId)) {
                        return { valid: false, error: '本回合新获得的武器不能立刻使用。' };
                    }
                    if (core.usedCardIdsThisTurn.includes(command.payload.weaponCardId)) {
                        return { valid: false, error: '这把武器本回合已经使用。' };
                    }
                }
                const target = command.payload.targetPlayerId
                    ? findExplorerByPlayerId(core, command.payload.targetPlayerId)
                    : null;
                if (!target || target.playerId === actor.playerId) {
                    return { valid: false, error: '灰尘剧本必须选择另一名探索者作为攻击目标。' };
                }
                if (core.scenarioRuntime.deadExplorerPlayerIds.includes(target.playerId)) {
                    return { valid: false, error: '不能攻击已经死亡的探索者。' };
                }
                if (!isAttackTargetInWeaponRange(core, actorRoomId, target.roomId, weaponEffect)) {
                    return { valid: false, error: `灰尘剧本只能攻击${formatAttackRangeLabel(weaponEffect)}的探索者。` };
                }
                return { valid: true };
            }
            if (isHelpingHandsHaunt(core)) {
                if (isDead) {
                    return { valid: false, error: '死亡探索者不能在第12号作祟《援手》中攻击。' };
                }
                const weaponEffect = command.payload.weaponCardId
                    ? resolveAttackWeaponEffect(actor, command.payload.weaponCardId)
                    : null;
                if (command.payload.weaponCardId) {
                    if (!weaponEffect) {
                        return { valid: false, error: '当前探索者没有可用于攻击的这把武器。' };
                    }
                    if (!core.turnStartInventoryCardIds.includes(command.payload.weaponCardId)) {
                        return { valid: false, error: '本回合新获得的武器不能立刻使用。' };
                    }
                    if (core.usedCardIdsThisTurn.includes(command.payload.weaponCardId)) {
                        return { valid: false, error: '这把武器本回合已经使用。' };
                    }
                }
                if (command.payload.target === 'troll-hand') {
                    const trollHand = findHelpingHandsTrollHand(core, command.payload.targetMonsterId);
                    if (!trollHand || trollHand.roomId !== actorRoomId) {
                        return { valid: false, error: '必须和巨魔手处于同一房间才能攻击。' };
                    }
                    return { valid: true };
                }
                if (command.payload.target !== 'hero') {
                    return { valid: false, error: '自由混战只能攻击另一名探索者。' };
                }
                const target = command.payload.targetPlayerId
                    ? findExplorerByPlayerId(core, command.payload.targetPlayerId)
                    : null;
                if (
                    !target
                    || target.playerId === actor.playerId
                    || core.scenarioRuntime.deadExplorerPlayerIds.includes(target.playerId)
                    || !isAttackTargetInWeaponRange(core, actorRoomId, target.roomId, weaponEffect)
                ) {
                    return {
                        valid: false,
                        error: `自由混战只能攻击${formatAttackRangeLabel(weaponEffect)}的其他存活探索者。`,
                    };
                }
                return { valid: true };
            }
            if (isMagicCameraHaunt(core)) {
                if (command.payload.weaponCardId) {
                    const weaponEffect = resolveAttackWeaponEffect(actor, command.payload.weaponCardId);
                    if (!weaponEffect) {
                        return { valid: false, error: '当前探索者没有可用于攻击的这把武器。' };
                    }
                    if (!core.turnStartInventoryCardIds.includes(command.payload.weaponCardId)) {
                        return { valid: false, error: '本回合新获得的武器不能立刻使用。' };
                    }
                    if (core.usedCardIdsThisTurn.includes(command.payload.weaponCardId)) {
                        return { valid: false, error: '这把武器本回合已经使用。' };
                    }
                }
                if (command.payload.target === 'phantom-photographer') {
                    const monster = findPhantomPhotographer(core, command.payload.targetMonsterId);
                    if (isTraitor || isDead) {
                        return { valid: false, error: '只有存活英雄能攻击幻影摄影师。' };
                    }
                    if (!monster || monster.roomId !== actorRoomId) {
                        return { valid: false, error: '必须和幻影摄影师同板块才能攻击。' };
                    }
                    return { valid: true };
                }
                if (command.payload.target === 'traitor') {
                    const traitor = core.scenarioRuntime.traitorPlayerId
                        ? findExplorerByPlayerId(core, core.scenarioRuntime.traitorPlayerId)
                        : null;
                    if (isTraitor || isDead || !traitor || traitor.roomId !== actorRoomId) {
                        return { valid: false, error: '只有同板块的存活英雄能攻击叛徒。' };
                    }
                    return { valid: true };
                }
                if (command.payload.target === 'hero') {
                    const target = command.payload.targetPlayerId
                        ? findExplorerByPlayerId(core, command.payload.targetPlayerId)
                        : null;
                    if (!isTraitor || isDead || !target) {
                        return { valid: false, error: '只有存活叛徒能攻击指定英雄。' };
                    }
                    if (
                        target.playerId === actor.playerId
                        || target.playerId === core.scenarioRuntime.traitorPlayerId
                        || core.scenarioRuntime.deadExplorerPlayerIds.includes(target.playerId)
                        || target.roomId !== actorRoomId
                    ) {
                        return { valid: false, error: '叛徒只能攻击同板块的存活英雄。' };
                    }
                    return { valid: true };
                }
            }
            {
                const attackWeaponEffect = command.payload.weaponCardId
                    ? resolveAttackWeaponEffect(actor, command.payload.weaponCardId)
                    : null;
                if (command.payload.weaponCardId) {
                    if (!attackWeaponEffect) {
                        return { valid: false, error: '当前探索者没有可用于攻击的这把武器。' };
                    }
                    if (!core.turnStartInventoryCardIds.includes(command.payload.weaponCardId)) {
                        return { valid: false, error: '本回合新获得的武器不能立刻使用。' };
                    }
                    if (core.usedCardIdsThisTurn.includes(command.payload.weaponCardId)) {
                        return { valid: false, error: '这把武器本回合已经使用。' };
                    }
                }
                if (command.payload.target === 'traitor') {
                    const traitor = core.scenarioRuntime.traitorPlayerId
                        ? findExplorerByPlayerId(core, core.scenarioRuntime.traitorPlayerId)
                        : null;
                    if (!traitor || !isAttackTargetInWeaponRange(core, actorRoomId, traitor.roomId, attackWeaponEffect)) {
                        return {
                            valid: false,
                            error: attackWeaponEffect
                                ? `${attackWeaponEffect.card.name}只能攻击${formatAttackRangeLabel(attackWeaponEffect)}的叛徒。`
                                : '必须和叛徒处于同一房间才能攻击。',
                        };
                    }
                }
                if (command.payload.target === 'hero') {
                    const livingHeroesInAttackRange = getAllExplorers(core).filter((explorer) => (
                        explorer.playerId !== core.scenarioRuntime.traitorPlayerId
                        && !core.scenarioRuntime.deadExplorerPlayerIds.includes(explorer.playerId)
                        && isAttackTargetInWeaponRange(core, actorRoomId, explorer.roomId, attackWeaponEffect)
                    ));
                    if (livingHeroesInAttackRange.length === 0) {
                        return {
                            valid: false,
                            error: `当前${formatAttackRangeLabel(attackWeaponEffect)}没有可攻击的英雄。`,
                        };
                    }
                    if (!command.payload.targetPlayerId) {
                        return { valid: false, error: '必须选择要攻击的英雄。' };
                    }
                    if (
                        command.payload.targetPlayerId
                        && !livingHeroesInAttackRange.some((explorer) => explorer.playerId === command.payload.targetPlayerId)
                    ) {
                        return {
                            valid: false,
                            error: `指定的英雄不在当前${formatAttackRangeLabel(attackWeaponEffect)}。`,
                        };
                    }
                }
            }
            if (command.payload.target === 'traitor' && isTraitor) {
                return { valid: false, error: '叛徒不能攻击自己。' };
            }
            if (command.payload.target === 'jack-spirit' && !core.scenarioRuntime.jackSpiritReleased) {
                return { valid: false, error: '杰克之灵尚未出现。' };
            }
            if (command.payload.target === 'jack-spirit' && actor.roomId !== core.scenarioRuntime.jackSpiritRoomId) {
                return { valid: false, error: '必须和杰克之灵处于同一房间。' };
            }
            if (command.payload.target === 'hero' && !isTraitor && !isDead) {
                return { valid: false, error: '当前只有叛徒侧可主动攻击英雄。' };
            }
            return { valid: true };
        case BETRAYAL_COMMANDS.SEARCH_FOR_CURE: {
            const trait = command.payload.trait;
            if (!isDustHaunt(core) || isDead) {
                return { valid: false, error: '只有灰尘剧本中的存活探索者能寻找解药。' };
            }
            if (trait !== 'knowledge' && trait !== 'sanity') {
                return { valid: false, error: '寻找解药必须选择知识或神志。' };
            }
            if (!canSearchForCure(core, actor)) {
                return { valid: false, error: '必须在带有恶兆符号且没有研究标记的板块才能寻找解药。' };
            }
            const actionBudget = validateHauntSpecialActionBudget(core, 'search-for-cure', actor);
            if (actionBudget) {
                return actionBudget;
            }
            return { valid: true };
        }
        case BETRAYAL_COMMANDS.CURE_THE_DUST: {
            const trait = command.payload.trait;
            if (!isDustHaunt(core) || isDead) {
                return { valid: false, error: '只有灰尘剧本中的存活探索者能尝试治愈灰尘。' };
            }
            if (!trait || !Object.prototype.hasOwnProperty.call(actor.traits, trait)) {
                return { valid: false, error: '治愈灰尘必须选择一个有效属性。' };
            }
            if (!canCureTheDust(core, actor)) {
                return { valid: false, error: '必须在可研究板块或带研究标记的板块才能治愈灰尘。' };
            }
            const actionBudget = validateHauntSpecialActionBudget(core, 'cure-the-dust', actor);
            if (actionBudget) {
                return actionBudget;
            }
            return { valid: true };
        }
        case BETRAYAL_COMMANDS.REQUEST_SICKNESS_EXCHANGE: {
            const target = command.payload.targetPlayerId
                ? findExplorerByPlayerId(core, command.payload.targetPlayerId)
                : null;
            if (!isDustHaunt(core) || isDead) {
                return { valid: false, error: '只有灰尘剧本中的存活探索者能请求交换疾病标记。' };
            }
            if (!target || target.playerId === actor.playerId) {
                return { valid: false, error: '必须选择另一名探索者交换疾病标记。' };
            }
            if (core.scenarioRuntime.deadExplorerPlayerIds.includes(target.playerId) || target.roomId !== actor.roomId) {
                return { valid: false, error: '只能请求同板块的存活探索者交换疾病标记。' };
            }
            const actionBudget = validateHauntSpecialActionBudget(core, 'sickness-exchange', actor);
            if (actionBudget) {
                return actionBudget;
            }
            return { valid: true };
        }
        case BETRAYAL_COMMANDS.LEARN_ABOUT_JACK: {
            if (isTraitor || isDead) {
                return { valid: false, error: '只有存活英雄能调查杰克。' };
            }
            if (!isBetrayalLibraryRoom(core.rooms.find((room) => room.id === actor.roomId))) {
                return { valid: false, error: '必须在图书馆才能调查杰克。' };
            }
            const livingHeroWithoutKnowledge = getAllExplorers(core).some((explorer) => (
                explorer.playerId !== core.scenarioRuntime.traitorPlayerId
                && !core.scenarioRuntime.deadExplorerPlayerIds.includes(explorer.playerId)
                && !core.scenarioRuntime.knowledgeOfJackPlayerIds.includes(explorer.playerId)
            ));
            if (!livingHeroWithoutKnowledge) {
                return { valid: false, error: '所有存活英雄都已经掌握杰克线索。' };
            }
            const actionBudget = validateHauntSpecialActionBudget(core, 'learn-about-jack', actor);
            if (actionBudget) {
                return actionBudget;
            }
            return { valid: true };
        }
        case BETRAYAL_COMMANDS.STUDY_EXORCISM:
            if (isTraitor || isDead) {
                return { valid: false, error: '只有存活英雄能研究驱魔法阵。' };
            }
            if (core.rooms.find((room) => room.id === actor.roomId)?.discoveryReward !== 'event') {
                return { valid: false, error: '必须在带有事件标记的房间才能研究驱魔法阵。' };
            }
            {
                const actionBudget = validateHauntSpecialActionBudget(core, 'study-exorcism', actor);
                if (actionBudget) {
                    return actionBudget;
                }
            }
            return { valid: true };
        case BETRAYAL_COMMANDS.EXORCISE_JACK:
            if (isTraitor || isDead) {
                return { valid: false, error: '只有存活英雄能驱魔。' };
            }
            if (!core.scenarioRuntime.jackSpiritReleased || !core.scenarioRuntime.jackSpiritRoomId) {
                return { valid: false, error: '杰克之灵尚未出现。' };
            }
            if (actor.roomId !== core.scenarioRuntime.jackSpiritRoomId) {
                return { valid: false, error: '必须与杰克之灵处于同一房间。' };
            }
            {
                const actionBudget = validateHauntSpecialActionBudget(core, 'exorcise-jack', actor);
                if (actionBudget) {
                    return actionBudget;
                }
            }
            return { valid: true };
        case BETRAYAL_COMMANDS.STUDY_MUMMY_NAME:
            if (!isMummyHaunt(core) || isTraitor || isDead) {
                return { valid: false, error: '只有木乃伊横行剧本中的存活英雄能寻找木乃伊真名。' };
            }
            if (!isMummyNameStudyRoom(core, actor.roomId)) {
                return { valid: false, error: '必须在石棺房、书房或图书馆才能寻找木乃伊真名。' };
            }
            {
                const actionBudget = validateHauntSpecialActionBudget(core, 'study-mummy-name', actor);
                if (actionBudget) {
                    return actionBudget;
                }
            }
            return { valid: true };
        case BETRAYAL_COMMANDS.LEARN_MUMMY_BANISHMENT:
            if (!isMummyHaunt(core) || isTraitor || isDead) {
                return { valid: false, error: '只有木乃伊横行剧本中的存活英雄能学习驱逐法术。' };
            }
            if (!core.scenarioRuntime.mummy?.trueNameFound) {
                return { valid: false, error: '必须先找到木乃伊真名。' };
            }
            if (!hasOmenBook(actor)) {
                return { valid: false, error: '必须由持有书本的英雄学习驱逐法术。' };
            }
            {
                const actionBudget = validateHauntSpecialActionBudget(core, 'learn-mummy-banishment', actor);
                if (actionBudget) {
                    return actionBudget;
                }
            }
            return { valid: true };
        case BETRAYAL_COMMANDS.BANISH_MUMMY: {
            const mummy = findMummyMonster(core);
            if (!isMummyHaunt(core) || isTraitor || isDead) {
                return { valid: false, error: '只有木乃伊横行剧本中的存活英雄能驱逐木乃伊。' };
            }
            if (!core.scenarioRuntime.mummy?.banishmentSpellLearned || core.scenarioRuntime.mummy.knowledgeTokenCount < 2) {
                return { valid: false, error: '必须先取得两枚知识标记并学会驱逐法术。' };
            }
            if (!mummy || actor.roomId !== mummy.roomId) {
                return { valid: false, error: '行动英雄必须与木乃伊处于同一房间。' };
            }
            if (!hasLivingHeroWithBookInRoom(core, mummy.roomId)) {
                return { valid: false, error: '木乃伊所在房间必须有一名存活英雄持有书本。' };
            }
            const actionBudget = validateHauntSpecialActionBudget(core, 'banish-mummy', actor);
            if (actionBudget) {
                return actionBudget;
            }
            return { valid: true };
        }
        case BETRAYAL_COMMANDS.PICK_UP_MUMMY_GIRL: {
            const mummy = core.scenarioRuntime.mummy;
            if (!isMummyHaunt(core) || !mummy || isDead) {
                return { valid: false, error: '只有木乃伊横行剧本中的存活探索者能拾起女孩。' };
            }
            if (mummy.girlHeldByMummy || mummy.girlHolderPlayerId) {
                return { valid: false, error: '女孩已经被持有。' };
            }
            if (!mummy.girlRoomId || actorRoomId !== mummy.girlRoomId) {
                return { valid: false, error: '必须与女孩标记处于同一房间。' };
            }
            return { valid: true };
        }
        case BETRAYAL_COMMANDS.GIVE_GIRL_TO_MUMMY: {
            const mummy = core.scenarioRuntime.mummy;
            const mummyMonster = findMummyMonster(core);
            if (!isMummyHaunt(core) || !mummy || !mummyMonster || !isTraitor || isDead) {
                return { valid: false, error: '只有木乃伊横行剧本中的存活叛徒能把女孩交给木乃伊。' };
            }
            if (mummy.girlHolderPlayerId !== actor.playerId) {
                return { valid: false, error: '必须由当前持有女孩的探索者交给木乃伊。' };
            }
            if (actorRoomId !== mummyMonster.roomId) {
                return { valid: false, error: '必须与木乃伊处于同一房间才能交出女孩。' };
            }
            return { valid: true };
        }
        case BETRAYAL_COMMANDS.GIVE_OMEN_TO_MUMMY: {
            const mummy = core.scenarioRuntime.mummy;
            const mummyMonster = findMummyMonster(core);
            const card = findMummyWeddingOmenCard(actor, command.payload.cardId);
            if (!isMummyHaunt(core) || !mummy || !mummyMonster || !isTraitor || isDead) {
                return { valid: false, error: '只有木乃伊横行剧本中的存活叛徒能把圣符或指环交给木乃伊。' };
            }
            if (!card) {
                return { valid: false, error: '必须持有圣符或指环。' };
            }
            if (mummy.mummyCarriedOmenIds.includes(card.id)) {
                return { valid: false, error: '木乃伊已经携带这张预兆。' };
            }
            if (actorRoomId !== mummyMonster.roomId) {
                return { valid: false, error: '必须与木乃伊处于同一房间才能交出圣符或指环。' };
            }
            return { valid: true };
        }
        case BETRAYAL_COMMANDS.COMPLETE_SCENARIO:
            return { valid: false, error: '真实首剧本不能通过手工结算完成。' };
        default:
            return { valid: false, error: '未知 haunt 命令。' };
    }
}

function validateCommand(state: MatchState<BetrayalCore>, command: BetrayalCommand): ValidationResult {
    const core = state.core;
    if (core.phase === 'haunt') {
        return validateHauntAction(state, command);
    }
    switch (command.type) {
        case BETRAYAL_COMMANDS.SELECT_EXPLORER: {
            if (core.phase !== 'characterSelect') return { valid: false, error: '当前不在角色选择阶段。' };
            const explorerId = command.payload.explorerId;
            if (!templateByExplorerId(explorerId)) return { valid: false, error: '未知探索者。' };
            const takenByAnother = Object.entries(core.selectedExplorerByPlayerId)
                .some(([playerId, selectedExplorerId]) => playerId !== command.playerId && selectedExplorerId === explorerId);
            return takenByAnother ? { valid: false, error: '该探索者已被选择。' } : { valid: true };
        }
        case BETRAYAL_COMMANDS.CONFIRM_EXPLORER:
            if (core.phase !== 'characterSelect') return { valid: false, error: '当前不在角色选择阶段。' };
            return core.selectedExplorerByPlayerId[command.playerId]
                ? { valid: true }
                : { valid: false, error: '请先选择探索者。' };
        case BETRAYAL_COMMANDS.PROPOSE_SCENARIO_CARD:
            if (core.phase !== 'characterSelect') return { valid: false, error: '当前不在角色选择阶段。' };
            if (!isBetrayalScenarioCardId(command.payload.candidateId)) {
                return { valid: false, error: '未知剧本卡。' };
            }
            return core.scenarioCandidateIds.includes(command.payload.candidateId)
                ? { valid: true }
                : { valid: false, error: '该剧本卡不在本局候选池。' };
        case BETRAYAL_COMMANDS.CONFIRM_SCENARIO_CARD:
            if (core.phase !== 'characterSelect') return { valid: false, error: '当前不在角色选择阶段。' };
            if (!core.selectedExplorerByPlayerId[command.playerId]) {
                return { valid: false, error: '请先选择探索者。' };
            }
            if (!core.scenarioCandidateIds.includes(core.proposedScenarioCardId)) {
                return { valid: false, error: '当前剧本卡不在本局候选池。' };
            }
            return { valid: true };
        case BETRAYAL_COMMANDS.START_SCENARIO:
            if (core.phase !== 'characterSelect') return { valid: false, error: '当前不在角色选择阶段。' };
            {
                const missingExplorerPlayerId = core.playerIds.find(
                    (playerId) => !core.selectedExplorerByPlayerId[playerId],
                );
                if (missingExplorerPlayerId) {
                    return { valid: false, error: '每位玩家都需要先选择探索者。' };
                }
                const unconfirmedExplorerPlayerId = core.playerIds.find(
                    (playerId) => !core.readyPlayerIds.includes(playerId),
                );
                if (unconfirmedExplorerPlayerId) {
                    return { valid: false, error: '每位玩家都需要先确认探索者。' };
                }
                const missingConfirmationPlayerId = core.playerIds.find(
                    (playerId) => core.scenarioCardConfirmations[playerId] !== core.proposedScenarioCardId,
                );
                if (missingConfirmationPlayerId) {
                    return { valid: false, error: '请先确认当前剧本卡。' };
                }
                const implementedScenarioId = resolveImplementedScenarioIdForCard(core.proposedScenarioCardId);
                if (!implementedScenarioId) {
                    return { valid: false, error: '这个剧本现在不能开始。' };
                }
                if (command.payload.scenarioId && command.payload.scenarioId !== implementedScenarioId) {
                    return { valid: false, error: '开始剧本与当前剧本卡提议不一致。' };
                }
            }
            if (command.payload.scenarioId && !BETRAYAL_SCENARIO_CONFIGS[command.payload.scenarioId]) {
                return { valid: false, error: '未知剧本。' };
            }
            return Object.keys(core.selectedExplorerByPlayerId).length > 0
                ? { valid: true }
                : { valid: false, error: '至少需要一名玩家选择探索者。' };
        default:
            return validatePreHauntAction(state, command);
    }
}

function executeCommand(state: MatchState<BetrayalCore>, command: BetrayalCommand, random: RandomFn): BetrayalEvent[] {
    const core = state.core;
    const timestamp = command.timestamp ?? Date.now();

    switch (command.type) {
        case BETRAYAL_COMMANDS.SELECT_EXPLORER:
            return [nowEvent(EVENTS.EXPLORER_SELECTED, {
                playerId: command.playerId,
                explorerId: command.payload.explorerId,
            }, timestamp)];
        case BETRAYAL_COMMANDS.CONFIRM_EXPLORER:
            return [nowEvent(EVENTS.EXPLORER_CONFIRMED, { playerId: command.playerId }, timestamp)];
        case BETRAYAL_COMMANDS.PROPOSE_SCENARIO_CARD: {
            const candidate = getBetrayalScenarioCardCandidate(command.payload.candidateId);
            return [nowEvent(EVENTS.SCENARIO_CARD_PROPOSED, {
                playerId: command.playerId,
                candidateId: candidate.id,
                title: candidate.title,
                logText: `玩家 ${command.playerId} 提议剧本卡：${candidate.title}`,
            }, timestamp)];
        }
        case BETRAYAL_COMMANDS.CONFIRM_SCENARIO_CARD: {
            const candidate = getBetrayalScenarioCardCandidate(core.proposedScenarioCardId);
            return [nowEvent(EVENTS.SCENARIO_CARD_CONFIRMED, {
                playerId: command.playerId,
                candidateId: candidate.id,
                title: candidate.title,
                logText: `玩家 ${command.playerId} 确认剧本卡：${candidate.title}`,
            }, timestamp)];
        }
        case BETRAYAL_COMMANDS.START_SCENARIO:
            return [nowEvent(EVENTS.SCENARIO_STARTED, {
                playerIds: core.playerIds,
                scenarioId: command.payload.scenarioId
                    ?? resolveImplementedScenarioIdForCard(core.proposedScenarioCardId)
                    ?? core.scenarioId,
            }, timestamp)];
        case BETRAYAL_COMMANDS.MOVE_TO_ROOM: {
            const payload = resolveBetrayalExplorerMovedPayload(core, command, random);
            return payload ? [nowEvent(EVENTS.EXPLORER_MOVED, payload, timestamp)] : [];
        }
        case BETRAYAL_COMMANDS.EXPLORE_ROOM: {
            const payload = resolveBetrayalRoomExploredPayload(core, {
                playerId: command.playerId,
                payload: command.payload,
            }, random, timestamp);
            return payload ? [nowEvent(EVENTS.ROOM_EXPLORED, payload, timestamp)] : [];
        }
        case BETRAYAL_COMMANDS.ROLL_EVENT: {
            const payload = resolveBetrayalEventRolledPayload(core, command.playerId, random, timestamp);
            return payload ? [nowEvent(EVENTS.EVENT_ROLLED, payload, timestamp)] : [];
        }
        case BETRAYAL_COMMANDS.ACKNOWLEDGE_CARD_RESOLUTION: {
            const payload = resolveBetrayalCardResolutionAcknowledgedPayload(core, command.playerId);
            return payload ? [nowEvent(EVENTS.CARD_RESOLUTION_ACKNOWLEDGED, payload, timestamp)] : [];
        }
        case BETRAYAL_COMMANDS.ACKNOWLEDGE_RECENT_ROLL: {
            const payload = resolveBetrayalRecentRollAcknowledgedPayload(core, command.playerId);
            return payload ? [nowEvent(EVENTS.RECENT_ROLL_ACKNOWLEDGED, payload, timestamp)] : [];
        }
        case BETRAYAL_COMMANDS.FINALIZE_EVENT_ROLL: {
            const payload = resolveBetrayalEventRollFinalizedPayload(core, command.playerId, random);
            return payload ? [nowEvent(EVENTS.EVENT_ROLL_FINALIZED, payload, timestamp)] : [];
        }
        case BETRAYAL_COMMANDS.USE_POSSESSION: {
            const eventPayload = resolveBetrayalPossessionUsedPayload(core, command.playerId, command.payload, {
                random,
                timestamp,
            });
            return eventPayload ? [nowEvent(EVENTS.POSSESSION_USED, eventPayload, timestamp)] : [];
        }
        case BETRAYAL_COMMANDS.USE_RABBIT_FOOT:
        case BETRAYAL_COMMANDS.USE_ROLL_REROLL_ITEM: {
            const payload = resolveBetrayalRecentRollRerollPayload(core, command, random);
            return payload ? [nowEvent(EVENTS.RABBIT_FOOT_USED, payload, timestamp)] : [];
        }
        case BETRAYAL_COMMANDS.RESOLVE_EVENT_CHOICE:
            return resolveBetrayalEventChoiceCommandEvents(core, command, random, timestamp);
        case BETRAYAL_COMMANDS.USE_ROOM_EFFECT: {
            const payload = createBetrayalRoomEffectUsedPayload(core, command.playerId, random);
            if (!payload) {
                return [];
            }
            return [nowEvent(EVENTS.ROOM_EFFECT_USED, payload, timestamp)];
        }
        case BETRAYAL_COMMANDS.TRADE_POSSESSION: {
            const tradeRequestPayload = createBetrayalTradeRequestedPayload(core, command.playerId, command.payload);
            return tradeRequestPayload
                ? [nowEvent(EVENTS.POSSESSION_TRADE_REQUESTED, tradeRequestPayload, timestamp)]
                : [];
        }
        case BETRAYAL_COMMANDS.RESOLVE_TRADE_AGREEMENT: {
            const tradeAgreementEvent = resolveBetrayalTradeAgreementEventPayload(core, command.payload.accept);
            if (!tradeAgreementEvent) {
                return [];
            }
            return tradeAgreementEvent.kind === 'accepted'
                ? [nowEvent(EVENTS.POSSESSION_TRADED, tradeAgreementEvent.payload, timestamp)]
                : [nowEvent(EVENTS.POSSESSION_TRADE_DECLINED, tradeAgreementEvent.payload, timestamp)];
        }
        case BETRAYAL_COMMANDS.LOOT_CORPSE: {
            const corpseLootPayload = createBetrayalCorpseLootedPayload(core, command.playerId, command.payload);
            return corpseLootPayload ? [nowEvent(EVENTS.CORPSE_LOOTED, corpseLootPayload, timestamp)] : [];
        }
        case BETRAYAL_COMMANDS.END_TURN:
            return resolveBetrayalEndTurnCommandEvents(core, random, timestamp);
        case BETRAYAL_COMMANDS.ACKNOWLEDGE_TURN_END_ROLL: {
            const pendingRoll = resolvePendingTurnEndRoll(core);
            const roomEndTurn = pendingRoll?.roomEndTurn;
            const deathPreventionTurnEnd = pendingRoll?.deathPrevention?.nextPlayerId
                ? pendingRoll.deathPrevention
                : null;
            const nextPlayerId = roomEndTurn?.nextPlayerId ?? deathPreventionTurnEnd?.nextPlayerId;
            if (!pendingRoll || !nextPlayerId) {
                return [];
            }
            const monsterMovementRoll = roomEndTurn?.monsterMovementRoll
                ?? deathPreventionTurnEnd?.monsterMovementRoll
                ?? null;
            const helpingHandsMonsterTurnControllerPlayerId =
                roomEndTurn?.helpingHandsMonsterTurnControllerPlayerId
                ?? deathPreventionTurnEnd?.helpingHandsMonsterTurnControllerPlayerId;
            const skipBloodFromStoneMonsterTurnStart =
                roomEndTurn?.skipBloodFromStoneMonsterTurnStart
                ?? deathPreventionTurnEnd?.skipBloodFromStoneMonsterTurnStart;
            const nextExplorer = findExplorerByPlayerId(core, nextPlayerId);
            const turnLogText = roomEndTurn?.turnLogText
                ?? deathPreventionTurnEnd?.turnLogText
                ?? (nextExplorer ? `轮到${nextExplorer.displayName}` : '进入下一位玩家回合');
            return [nowEvent(EVENTS.TURN_END_ROLL_ACKNOWLEDGED, {
                previousPlayerId: pendingRoll.playerId,
                nextPlayerId,
                monsterMovementRoll,
                helpingHandsMonsterTurnControllerPlayerId,
                skipBloodFromStoneMonsterTurnStart,
                logText: turnLogText,
            }, timestamp), ...(helpingHandsMonsterTurnControllerPlayerId
                ? [createBetrayalHelpingHandsMonsterTurnStartedEvent(
                    helpingHandsMonsterTurnControllerPlayerId,
                    random,
                    timestamp,
                )]
                : [])];
        }
        case BETRAYAL_COMMANDS.RESOLVE_DAMAGE_ALLOCATION: {
            const damageAllocationPayload = resolveBetrayalDamageAllocationResolvedPayload(
                core,
                command.payload,
                random,
            );
            if (!damageAllocationPayload) {
                return [];
            }
            return [nowEvent(EVENTS.DAMAGE_ALLOCATION_RESOLVED, damageAllocationPayload, timestamp)];
        }
        case BETRAYAL_COMMANDS.HAUNT_ATTACK:
            return resolveBetrayalHauntAttackCommandEvents(core, command, random, timestamp);
        case BETRAYAL_COMMANDS.RESOLVE_MONSTER_DAMAGE: {
            const payload = resolveBetrayalMonsterDamageResolvedPayload(core, {
                playerId: command.playerId,
                payload: command.payload,
            });
            return payload ? [nowEvent(EVENTS.MONSTER_DAMAGE_RESOLVED, payload, timestamp)] : [];
        }
        case BETRAYAL_COMMANDS.RESOLVE_MONSTER_TURN_START: {
            const payload = resolveBetrayalMonsterTurnStartResolvedPayload(core, {
                playerId: command.playerId,
                payload: command.payload,
            });
            return payload ? [nowEvent(EVENTS.MONSTER_TURN_START_RESOLVED, payload, timestamp)] : [];
        }
        case BETRAYAL_COMMANDS.ROLL_MONSTER_MOVEMENT_GROUP: {
            const payload = resolveBetrayalMonsterMovementGroupRolledPayload(core, {
                playerId: command.playerId,
                payload: command.payload,
            }, random);
            return payload ? [nowEvent(EVENTS.MONSTER_MOVEMENT_GROUP_ROLLED, payload, timestamp)] : [];
        }
        case BETRAYAL_COMMANDS.MOVE_MONSTER_TO_ROOM: {
            const payload = resolveBetrayalMonsterMovedPayload(core, {
                playerId: command.playerId,
                payload: command.payload,
            });
            return payload ? [nowEvent(EVENTS.MONSTER_MOVED, payload, timestamp)] : [];
        }
        case BETRAYAL_COMMANDS.END_BLOOD_FROM_STONE_MONSTER_TURN: {
            const payload = resolveBloodFromStoneMonsterTurnEndedPayload(core, {
                playerId: command.playerId,
            }, random);
            return payload ? [nowEvent(EVENTS.BLOOD_FROM_STONE_MONSTER_TURN_ENDED, payload, timestamp)] : [];
        }
        case BETRAYAL_COMMANDS.PLACE_BLOOD_FROM_STONE_EXTRA_STONE_CHERUBS: {
            const plan = resolveBloodFromStoneSetupPlacementPlan(core);
            const existingExtraPlacementCount = plan.automaticExtraPlacements.length + plan.playerChoicePlacements.length;
            const placements = resolveBloodFromStoneSelectedExtraStoneCherubPlacements(
                core,
                command.payload.roomIds ?? [],
                existingExtraPlacementCount,
            );
            if (placements.length === 0) {
                return [];
            }
            const roomNames = placements.map((placement) => placement.roomName).join('、');
            return [nowEvent(EVENTS.BLOOD_FROM_STONE_EXTRA_STONE_CHERUBS_PLACED, {
                playerId: command.playerId,
                placements,
                logText: `补放 ${placements.length} 个石像小天使：${roomNames}`,
            }, timestamp)];
        }
        case BETRAYAL_COMMANDS.MONSTER_ATTACK_HERO: {
            const payload = resolveBetrayalMonsterAttackHeroResolvedPayload(core, {
                playerId: command.playerId,
                payload: command.payload,
            }, random);
            return payload ? [nowEvent(EVENTS.MONSTER_ATTACK_HERO_RESOLVED, payload, timestamp)] : [];
        }
        case BETRAYAL_COMMANDS.RESOLVE_HELPING_HANDS_ATTACK_REWARD: {
            const pending = resolveHelpingHandsPendingAttackReward(core);
            const attacker = pending ? findExplorerByPlayerId(core, pending.attackerPlayerId) : null;
            const defender = pending ? findExplorerByPlayerId(core, pending.defenderPlayerId) : null;
            if (!pending || !attacker || !defender) {
                return [];
            }
            if (command.payload.choice === 'steal') {
                const card = defender.inventory.find((item) => item.id === command.payload.cardId);
                if (!card || (card.kind !== 'item' && card.kind !== 'omen')) {
                    return [];
                }
                return [nowEvent(EVENTS.HELPING_HANDS_ATTACK_REWARD_RESOLVED, {
                    attackerPlayerId: attacker.playerId,
                    defenderPlayerId: defender.playerId,
                    choice: 'steal',
                    stolenCardId: card.id,
                    stolenCardName: card.name,
                    logText: `${attacker.displayName}没有造成伤害，改为从${defender.displayName}手中偷走${card.name}`,
                }, timestamp)];
            }
            const deathPreventionRoll = wouldExplorerDieFromAttackDamage(defender, pending.damageToDefender, pending.damageKind)
                ? rollDeathPrevention(random, defender)
                : null;
            const defenderDefeated = wouldExplorerDieFromAttackDamage(defender, pending.damageToDefender, pending.damageKind)
                && !deathPreventionRoll?.prevented;
            const deathPrevention = deathPreventionRoll
                ? {
                    ...deathPreventionRoll,
                    damageAmount: pending.damageToDefender,
                    damageKind: pending.damageKind,
                    traitsBeforeDamage: { ...pending.defenderTraitsBeforeDamage },
                }
                : undefined;
            const deathPreventionLog = formatDeathPreventionLog(deathPrevention);
            return [nowEvent(EVENTS.HELPING_HANDS_ATTACK_REWARD_RESOLVED, {
                attackerPlayerId: attacker.playerId,
                defenderPlayerId: defender.playerId,
                choice: 'damage',
                damageToDefender: pending.damageToDefender,
                damageKind: pending.damageKind,
                defeatedPlayerId: defenderDefeated ? defender.playerId : undefined,
                deathPrevention,
                logText: `${attacker.displayName}选择造成 ${pending.damageToDefender} 点 ${pending.damageKind} damage${deathPreventionLog}`,
            }, timestamp)];
        }
        case BETRAYAL_COMMANDS.RESOLVE_MUMMY_ATTACK_REWARD: {
            const pending = resolveMummyPendingAttackReward(core);
            const defender = pending ? findExplorerByPlayerId(core, pending.defenderPlayerId) : null;
            if (!pending || !defender) {
                return [];
            }
            if (command.payload.choice === 'steal') {
                const cardId = command.payload.cardId;
                const stolenCard = cardId === MUMMY_GIRL_STEAL_CARD_ID
                    ? resolveMummyGirlStealCard()
                    : defender.inventory.find((item) => item.id === cardId);
                if (!stolenCard || (stolenCard.kind !== 'item' && stolenCard.kind !== 'omen')) {
                    return [];
                }
                return [nowEvent(EVENTS.MUMMY_ATTACK_REWARD_RESOLVED, {
                    controllerPlayerId: pending.controllerPlayerId,
                    monsterId: pending.monsterId,
                    monsterName: pending.monsterName,
                    defenderPlayerId: defender.playerId,
                    choice: 'steal',
                    stolenCardId: stolenCard.id,
                    stolenCardName: stolenCard.name,
                    logText: `${pending.monsterName}没有造成伤害，改为从${defender.displayName}手中夺走${stolenCard.name}`,
                }, timestamp)];
            }
            return [nowEvent(EVENTS.MUMMY_ATTACK_REWARD_RESOLVED, {
                controllerPlayerId: pending.controllerPlayerId,
                monsterId: pending.monsterId,
                monsterName: pending.monsterName,
                defenderPlayerId: defender.playerId,
                choice: 'damage',
                damageToHero: pending.damageToHero,
                damageKind: 'physical',
                logText: `${pending.monsterName}选择造成 ${pending.damageToHero} 点 physical damage`,
            }, timestamp)];
        }
        case BETRAYAL_COMMANDS.MOVE_HELPING_HANDS_TROLL_HAND: {
            const monster = findHelpingHandsTrollHand(core, command.payload.monsterId);
            const targetRoom = command.payload.roomId
                ? core.rooms.find((room) => room.id === command.payload.roomId)
                : null;
            if (!monster || !targetRoom) {
                return [];
            }
            const moveCost = resolveHelpingHandsTrollHandMoveCost(core, monster.id);
            const helpingHands = core.scenarioRuntime.helpingHands;
            const moveRemaining = Math.max(
                0,
                (helpingHands?.trollHandMoveRemainingById[monster.id] ?? 0) - moveCost,
            );
            return [nowEvent(EVENTS.HELPING_HANDS_TROLL_HAND_MOVED, {
                controllerPlayerId: command.playerId,
                monsterId: monster.id,
                fromRoomId: monster.roomId,
                toRoomId: targetRoom.id,
                moveCost,
                moveRemaining,
                logText: `${monster.name}从${core.rooms.find((room) => room.id === monster.roomId)?.name ?? monster.roomId}移动到${targetRoom.name}，消耗 ${moveCost} 点移动`,
            }, timestamp)];
        }
        case BETRAYAL_COMMANDS.HELPING_HANDS_TROLL_HAND_ATTACK: {
            const options = resolveHelpingHandsTrollHandAttackOptions(core);
            const option = command.payload.combined
                ? options.find((item) => item.combined)
                : options.find((item) => !item.combined && item.trollHandIds[0] === command.payload.monsterId);
            const target = command.payload.targetPlayerId
                ? findExplorerByPlayerId(core, command.payload.targetPlayerId)
                : null;
            if (!option || !target) {
                return [];
            }
            const defenderTraitsBeforeDamage = { ...target.traits };
            const dice = rollBetrayalDicePips(random, option.might);
            const attackerRoll = dice.reduce((sum, pip) => sum + pip, 0);
            const defenderRoll = rollTrait(random, target.traits.might);
            const damageToDefender = Math.max(0, attackerRoll - defenderRoll);
            return [nowEvent(EVENTS.HELPING_HANDS_TROLL_HAND_ATTACK_RESOLVED, {
                controllerPlayerId: command.playerId,
                targetPlayerId: target.playerId,
                trollHandIds: option.trollHandIds,
                combined: option.combined,
                attackDice: dice,
                attackerRoll,
                defenderRoll,
                damageToDefender: damageToDefender || undefined,
                defenderTraitsBeforeDamage,
                logText: damageToDefender > 0
                    ? `${option.label}攻击${target.displayName}，造成 ${damageToDefender} 点 physical damage`
                    : `${option.label}攻击${target.displayName}，但没有造成伤害`,
            }, timestamp)];
        }
        case BETRAYAL_COMMANDS.END_HELPING_HANDS_MONSTER_TURN: {
            const helpingHands = core.scenarioRuntime.helpingHands;
            if (!helpingHands) {
                return [];
            }
            const nextPlayerId = rotateToNextLivingPlayer(
                core,
                helpingHands.monsterTurnAfterPlayerId,
            );
            const nextExplorer = findExplorerByPlayerId(core, nextPlayerId);
            return [nowEvent(EVENTS.HELPING_HANDS_MONSTER_TURN_ENDED, {
                controllerPlayerId: command.playerId,
                nextPlayerId,
                logText: `巨魔手怪物回合结束${nextExplorer ? `，轮到${nextExplorer.displayName}` : ''}`,
            }, timestamp)];
        }
        case BETRAYAL_COMMANDS.SEARCH_FOR_CURE: {
            const actor = findExplorerByPlayerId(core, command.playerId) ?? core.currentExplorer;
            const room = core.rooms.find((item) => item.id === actor.roomId)!;
            const trait = command.payload.trait ?? 'knowledge';
            const roll = rollNonCombatTraitCheckWithDice(random, core, actor, trait);
            const success = roll.total >= 5;
            const leftPlayerId = success ? null : resolveNextLivingPlayerIdInTurnOrder(core, actor.playerId);
            const swap = !success && leftPlayerId && core.scenarioRuntime.dust
                ? resolveDustSicknessSwap(core.scenarioRuntime.dust, actor.playerId, leftPlayerId, random) ?? undefined
                : undefined;
            return [nowEvent(EVENTS.DUST_SEARCH_RESOLVED, {
                playerId: actor.playerId,
                roomId: room.id,
                trait,
                rollTotal: roll.total,
                dice: roll.dice,
                passiveBonus: roll.passiveBonus,
                success,
                swap,
                logText: success
                    ? `${actor.displayName}寻找解药成功，在${room.name}放置了研究标记`
                    : `${actor.displayName}寻找解药失败${swap ? '，与左侧玩家随机交换了疾病标记' : ''}`,
            }, timestamp)];
        }
        case BETRAYAL_COMMANDS.CURE_THE_DUST: {
            const actor = findExplorerByPlayerId(core, command.playerId) ?? core.currentExplorer;
            const room = core.rooms.find((item) => item.id === actor.roomId)!;
            const trait = command.payload.trait ?? 'knowledge';
            const roll = rollNonCombatTraitCheckWithDice(random, core, actor, trait);
            const researchBonus = (core.scenarioRuntime.dust?.researchRoomIds.length ?? 0) * 2;
            const rollTotal = roll.total + researchBonus;
            const success = rollTotal >= 13;
            const leftPlayerId = success ? null : resolveNextLivingPlayerIdInTurnOrder(core, actor.playerId);
            const swap = !success && leftPlayerId && core.scenarioRuntime.dust
                ? resolveDustSicknessSwap(core.scenarioRuntime.dust, actor.playerId, leftPlayerId, random) ?? undefined
                : undefined;
            return [nowEvent(EVENTS.DUST_CURE_RESOLVED, {
                playerId: actor.playerId,
                roomId: room.id,
                trait,
                rollTotal,
                dice: roll.dice,
                passiveBonus: roll.passiveBonus,
                researchBonus,
                success,
                swap,
                logText: success
                    ? `${actor.displayName}完成治愈灰尘，英雄阵营胜利`
                    : `${actor.displayName}尝试治愈灰尘失败${swap ? '，与左侧玩家随机交换了疾病标记' : ''}`,
            }, timestamp)];
        }
        case BETRAYAL_COMMANDS.REQUEST_SICKNESS_EXCHANGE: {
            const requester = findExplorerByPlayerId(core, command.playerId) ?? core.currentExplorer;
            const target = findExplorerByPlayerId(core, command.payload.targetPlayerId ?? '');
            return [nowEvent(EVENTS.SICKNESS_EXCHANGE_REQUESTED, {
                requesterPlayerId: requester.playerId,
                targetPlayerId: target?.playerId ?? command.payload.targetPlayerId ?? '',
                logText: `${requester.displayName}请求交换疾病标记`,
            }, timestamp)];
        }
        case BETRAYAL_COMMANDS.RESOLVE_SICKNESS_EXCHANGE: {
            const pending = core.scenarioRuntime.dust?.pendingSicknessExchange;
            if (!pending) {
                return [];
            }
            const requester = findExplorerByPlayerId(core, pending.requesterPlayerId);
            const target = findExplorerByPlayerId(core, pending.targetPlayerId);
            const accepted = command.payload.accept;
            const swap = accepted && core.scenarioRuntime.dust
                ? resolveDustSicknessSwap(
                    core.scenarioRuntime.dust,
                    pending.requesterPlayerId,
                    pending.targetPlayerId,
                    random,
                ) ?? undefined
                : undefined;
            return [nowEvent(EVENTS.SICKNESS_EXCHANGE_RESOLVED, {
                requesterPlayerId: pending.requesterPlayerId,
                targetPlayerId: pending.targetPlayerId,
                accepted,
                swap,
                logText: accepted && swap
                    ? `${target?.displayName ?? '目标玩家'}同意了${requester?.displayName ?? '请求者'}的疾病标记交换`
                    : `${target?.displayName ?? '目标玩家'}拒绝了疾病标记交换`,
            }, timestamp)];
        }
        case BETRAYAL_COMMANDS.CONFIRM_HAUNT_SETUP_ENTRY: {
            const entryId = command.payload.entryId!;
            return [nowEvent(EVENTS.HAUNT_SETUP_ENTRY_CONFIRMED, {
                playerId: command.playerId,
                entryId,
                logText: entryId === 'monster-card-left-of-revealer'
                    ? '确认怪物参考卡已放在作祟揭秘者左侧。'
                    : '确认已准备 8 个研究 token，后续由寻找解药行动放置到对应房间。',
            }, timestamp)];
        }
        case BETRAYAL_COMMANDS.TAKE_PHOTO: {
            const actor = findExplorerByPlayerId(core, command.playerId) ?? core.currentExplorer;
            const target = findExplorerByPlayerId(core, command.payload.targetPlayerId ?? '');
            if (!target) {
                return [];
            }
            const trait = command.payload.trait ?? 'speed';
            const roll = rollNonCombatTraitCheckWithDice(random, core, actor, 'speed');
            const success = roll.total >= 6;
            return [nowEvent(EVENTS.PHOTO_TAKEN, {
                playerId: actor.playerId,
                targetPlayerId: target.playerId,
                trait,
                rollTotal: roll.total,
                dice: roll.dice,
                passiveBonus: roll.passiveBonus,
                success,
                logText: success
                    ? `${actor.displayName}拍下${target.displayName}，夺取本质并提升${TRAIT_LABEL[trait]}`
                    : `${actor.displayName}尝试拍下${target.displayName}，但照片失焦了`,
            }, timestamp)];
        }
        case BETRAYAL_COMMANDS.SMASH_MAGIC_CAMERA: {
            const actor = findExplorerByPlayerId(core, command.playerId) ?? core.currentExplorer;
            const roll = rollNonCombatTraitCheckWithDice(random, core, actor, 'sanity');
            const success = roll.total >= 6;
            return [nowEvent(EVENTS.MAGIC_CAMERA_SMASHED, {
                playerId: actor.playerId,
                rollTotal: roll.total,
                dice: roll.dice,
                passiveBonus: roll.passiveBonus,
                success,
                logText: success
                    ? `${actor.displayName}砸毁了魔法相机`
                    : `${actor.displayName}尝试砸毁魔法相机，但没能成功`,
            }, timestamp)];
        }
        case BETRAYAL_COMMANDS.PHANTOM_PHOTOGRAPHER_ATTACK: {
            const monster = findPhantomPhotographer(core, command.payload.monsterId);
            const target = findExplorerByPlayerId(core, command.payload.targetPlayerId ?? '');
            if (!monster || !target) {
                return [];
            }
            const dice = rollBetrayalDicePips(random, monster.sanity ?? 6);
            const monsterRoll = dice.reduce((sum, pip) => sum + pip, 0);
            const heroRoll = rollTrait(random, target.traits.sanity);
            const damageToHero = Math.max(0, monsterRoll - heroRoll);
            const defeated = wouldExplorerDieFromMentalDamage(target, damageToHero);
            return [nowEvent(EVENTS.PHANTOM_PHOTOGRAPHER_ATTACK_RESOLVED, {
                monsterId: monster.id,
                targetPlayerId: target.playerId,
                monsterRoll,
                heroRoll,
                damageToHero: damageToHero || undefined,
                defeatedPlayerId: defeated ? target.playerId : undefined,
                dice,
                logText: damageToHero > 0
                    ? `幻影摄影师用闪光攻击${target.displayName}，造成 ${damageToHero} 点精神伤害`
                    : `幻影摄影师拍向${target.displayName}，但没造成精神伤害`,
            }, timestamp)];
        }
        case BETRAYAL_COMMANDS.PLAY_PEEKABOO: {
            const actor = findExplorerByPlayerId(core, command.playerId) ?? core.currentExplorer;
            const selection = resolveBloodFromStonePeekabooSelection(
                core,
                actor,
                command.payload.sameRoomMonsterId,
                command.payload.lineOfSightMonsterId,
            );
            if (!selection.option) {
                return [];
            }
            const roll = rollNonCombatTraitCheckWithDice(random, core, actor, 'knowledge');
            const mirrorBonus = hasBloodFromStoneMirror(actor) ? 2 : 0;
            const rollTotal = roll.total + mirrorBonus;
            const success = rollTotal >= 4;
            const damageDice = success ? undefined : rollBetrayalDicePips(random, 2);
            const damageAmount = damageDice?.reduce((sum, pip) => sum + pip, 0);
            return [nowEvent(EVENTS.BLOOD_FROM_STONE_PEEKABOO_RESOLVED, {
                playerId: actor.playerId,
                sameRoomMonsterId: selection.option.sameRoomMonsterId,
                lineOfSightMonsterId: selection.option.lineOfSightMonsterId,
                rollTotal,
                dice: roll.dice,
                passiveBonus: roll.passiveBonus,
                mirrorBonus,
                success,
                damageDice,
                damageAmount,
                logText: success
                    ? `${actor.displayName}玩躲猫猫成功，移除了两只石像小天使`
                    : `${actor.displayName}玩躲猫猫失败，承受 ${damageAmount ?? 0} 点一般伤害`,
            }, timestamp)];
        }
        case BETRAYAL_COMMANDS.GIVE_MIRROR_HINT: {
            const revealer = findExplorerByPlayerId(core, command.playerId) ?? core.currentExplorer;
            const target = command.payload.targetPlayerId
                ? findExplorerByPlayerId(core, command.payload.targetPlayerId)
                : null;
            const eventCard = resolveUponReflectionHintEvent(core, command.payload.eventName);
            if (!target || !eventCard) {
                return [];
            }
            return [nowEvent(EVENTS.UPON_REFLECTION_EVENT_HINT_GIVEN, {
                revealerPlayerId: revealer.playerId,
                targetPlayerId: target.playerId,
                eventName: eventCard.name,
                eventText: eventCard.text,
                turnNumber: core.turnNumber,
                logText: `作祟揭秘者用事件牌「${eventCard.name}」给${target.displayName}作镜中提示；该事件不结算并放到一边`,
            }, timestamp)];
        }
        case BETRAYAL_COMMANDS.BREAK_MIRROR_CURSE: {
            const actor = findExplorerByPlayerId(core, command.playerId) ?? core.currentExplorer;
            const trait = command.payload.trait!;
            const selectedOmen = resolveUponReflectionOmenSelection(actor, command.payload);
            const secret = core.scenarioRuntime.uponReflection?.secretCombination;
            if (!selectedOmen || !secret) {
                return [];
            }
            const roomId = resolveControlledRoomId(core, actor);
            const room = core.rooms.find((item) => item.id === roomId);
            const roll = rollNonCombatTraitCheckWithDice(random, core, actor, trait);
            const successRoll = roll.total >= 5;
            const omenMatches = resolveInventoryEffectId(selectedOmen.id) === secret.omenId
                || selectedOmen.name === secret.omenName;
            const combinationCorrect = Boolean(
                successRoll
                && trait === secret.trait
                && omenMatches
                && roomMatchesUponReflectionSecret(room, secret)
            );
            return [nowEvent(EVENTS.UPON_REFLECTION_CURSE_BREAK_ATTEMPTED, {
                playerId: actor.playerId,
                roomId,
                roomName: room?.name ?? '当前房间',
                trait,
                omenId: resolveInventoryEffectId(selectedOmen.id),
                omenName: selectedOmen.name,
                rollTotal: roll.total,
                dice: roll.dice,
                passiveBonus: roll.passiveBonus,
                successRoll,
                combinationCorrect,
                logText: combinationCorrect
                    ? `${actor.displayName}完成破咒，镜中诅咒被打破`
                    : successRoll
                        ? `${actor.displayName}尝试破咒，作祟揭秘者给出否定反馈`
                        : `${actor.displayName}尝试破咒，但没有得到镜中反馈`,
            }, timestamp)];
        }
        case BETRAYAL_COMMANDS.LEARN_ABOUT_JACK: {
            const actor = core.currentExplorer;
            const rollTotal = rollNonCombatTraitCheck(random, core, actor, 'knowledge');
            const grantedToExplorer = rollTotal >= 5
                ? getAllExplorers(core).find((explorer) => (
                    explorer.playerId !== core.scenarioRuntime.traitorPlayerId
                    && !core.scenarioRuntime.deadExplorerPlayerIds.includes(explorer.playerId)
                    && !core.scenarioRuntime.knowledgeOfJackPlayerIds.includes(explorer.playerId)
                )) ?? actor
                : null;
            const grantedToPlayerId = grantedToExplorer?.playerId ?? null;
            return [nowEvent(EVENTS.JACK_LEARNED, {
                playerId: command.playerId,
                grantedToPlayerId,
                rollTotal,
                success: rollTotal >= 5,
                logText: rollTotal >= 5
                    ? `${actor.displayName}在图书馆查到了 Crimson Jack 的线索，交给${grantedToExplorer?.displayName ?? actor.displayName}`
                    : `${actor.displayName}翻遍了图书馆，但还没找到足够线索`,
            }, timestamp)];
        }
        case BETRAYAL_COMMANDS.STUDY_EXORCISM: {
            const actor = core.currentExplorer;
            const rollTotal = rollNonCombatTraitCheck(random, core, actor, 'knowledge');
            return [nowEvent(EVENTS.EXORCISM_STUDIED, {
                playerId: command.playerId,
                roomId: actor.roomId,
                rollTotal,
                success: rollTotal >= 5,
                logText: rollTotal >= 5
                    ? `${actor.displayName}布置了一处驱魔法阵`
                    : `${actor.displayName}研究驱魔失败，精神受到了反噬`,
            }, timestamp)];
        }
        case BETRAYAL_COMMANDS.EXORCISE_JACK: {
            const actor = core.currentExplorer;
            const regionBonus = countExorcismCirclesInRegion(core, actor.roomId);
            const sanityRoll = rollNonCombatTraitCheckWithDice(random, core, actor, 'sanity');
            const rollTotal = sanityRoll.total + regionBonus;
            return [nowEvent(EVENTS.JACK_EXORCISED, {
                playerId: command.playerId,
                roomId: actor.roomId,
                rollTotal,
                dice: sanityRoll.dice,
                passiveBonus: sanityRoll.passiveBonus,
                regionBonus,
                success: rollTotal >= 7,
                logText: rollTotal >= 7
                    ? `${actor.displayName}成功驱散了杰克之灵`
                    : `${actor.displayName}尝试驱魔失败，杰克之灵反扑了所有英雄`,
            }, timestamp)];
        }
        case BETRAYAL_COMMANDS.STUDY_MUMMY_NAME: {
            const actor = findExplorerByPlayerId(core, command.playerId) ?? core.currentExplorer;
            const room = core.rooms.find((item) => item.id === actor.roomId);
            const roll = rollNonCombatTraitCheckWithDice(random, core, actor, 'knowledge');
            const success = roll.total >= 6;
            return [nowEvent(EVENTS.MUMMY_NAME_STUDIED, {
                playerId: actor.playerId,
                roomId: actor.roomId,
                rollTotal: roll.total,
                dice: roll.dice,
                passiveBonus: roll.passiveBonus,
                success,
                logText: success
                    ? `${actor.displayName}在${room?.name ?? '当前房间'}找到了木乃伊真名，取得第 1 枚知识标记`
                    : `${actor.displayName}寻找木乃伊真名失败，暂未取得知识标记`,
            }, timestamp)];
        }
        case BETRAYAL_COMMANDS.LEARN_MUMMY_BANISHMENT: {
            const actor = findExplorerByPlayerId(core, command.playerId) ?? core.currentExplorer;
            const roll = rollNonCombatTraitCheckWithDice(random, core, actor, 'knowledge');
            const success = roll.total >= 6;
            return [nowEvent(EVENTS.MUMMY_BANISHMENT_LEARNED, {
                playerId: actor.playerId,
                roomId: actor.roomId,
                rollTotal: roll.total,
                dice: roll.dice,
                passiveBonus: roll.passiveBonus,
                success,
                logText: success
                    ? `${actor.displayName}用书本学会驱逐木乃伊的法术，取得第 2 枚知识标记`
                    : `${actor.displayName}翻查书本失败，尚未学会驱逐法术`,
            }, timestamp)];
        }
        case BETRAYAL_COMMANDS.BANISH_MUMMY: {
            const actor = findExplorerByPlayerId(core, command.playerId) ?? core.currentExplorer;
            const mummy = findMummyMonster(core);
            if (!mummy) {
                return [];
            }
            const heroRoll = rollTraitCheckWithDice(random, actor, 'sanity', core);
            const mummyDice = rollBetrayalDicePips(random, resolveMonsterTrait(mummy, 'sanity'));
            const mummyRoll = mummyDice.reduce((sum, pip) => sum + pip, 0);
            const success = heroRoll.total > mummyRoll;
            return [nowEvent(EVENTS.MUMMY_BANISHED, {
                playerId: actor.playerId,
                roomId: actor.roomId,
                heroRoll: heroRoll.total,
                mummyRoll,
                heroDice: heroRoll.dice,
                mummyDice,
                passiveBonus: heroRoll.passiveBonus,
                success,
                logText: success
                    ? `${actor.displayName}以神志压过木乃伊，将木乃伊驱逐回亡者之国`
                    : `${actor.displayName}驱逐木乃伊失败，木乃伊仍在宅邸中`,
            }, timestamp)];
        }
        case BETRAYAL_COMMANDS.PICK_UP_MUMMY_GIRL: {
            const actor = findExplorerByPlayerId(core, command.playerId) ?? core.currentExplorer;
            const room = core.rooms.find((item) => item.id === actor.roomId);
            return [nowEvent(EVENTS.MUMMY_GIRL_PICKED_UP, {
                playerId: actor.playerId,
                roomId: actor.roomId,
                logText: `${actor.displayName}在${room?.name ?? '当前房间'}拾起了女孩`,
            }, timestamp)];
        }
        case BETRAYAL_COMMANDS.GIVE_GIRL_TO_MUMMY: {
            const actor = findExplorerByPlayerId(core, command.playerId) ?? core.currentExplorer;
            const mummy = findMummyMonster(core);
            if (!mummy) {
                return [];
            }
            const room = core.rooms.find((item) => item.id === actor.roomId);
            return [nowEvent(EVENTS.MUMMY_GIRL_GIVEN, {
                playerId: actor.playerId,
                monsterId: mummy.id,
                roomId: actor.roomId,
                logText: `${actor.displayName}在${room?.name ?? '当前房间'}把女孩交给了木乃伊`,
            }, timestamp)];
        }
        case BETRAYAL_COMMANDS.GIVE_OMEN_TO_MUMMY: {
            const actor = findExplorerByPlayerId(core, command.playerId) ?? core.currentExplorer;
            const mummy = findMummyMonster(core);
            const card = findMummyWeddingOmenCard(actor, command.payload.cardId);
            if (!mummy || !card) {
                return [];
            }
            const room = core.rooms.find((item) => item.id === actor.roomId);
            return [nowEvent(EVENTS.MUMMY_OMEN_GIVEN, {
                playerId: actor.playerId,
                monsterId: mummy.id,
                roomId: actor.roomId,
                cardId: card.id,
                cardName: card.name,
                logText: `${actor.displayName}在${room?.name ?? '当前房间'}把${card.name}交给了木乃伊`,
            }, timestamp)];
        }
        case BETRAYAL_COMMANDS.COMPLETE_SCENARIO:
            return [];
        default:
            return [];
    }
}

function reduceEvent(state: BetrayalCore, event: BetrayalEvent): BetrayalCore {
    const core = cloneCore(state);
    switch (event.type) {
        case EVENTS.EXPLORER_SELECTED:
            {
                const scenarioCardConfirmations = { ...core.scenarioCardConfirmations };
                delete scenarioCardConfirmations[event.payload.playerId];
                return {
                ...core,
                    selectedExplorerByPlayerId: {
                        ...core.selectedExplorerByPlayerId,
                        [event.payload.playerId]: event.payload.explorerId,
                    },
                    readyPlayerIds: core.readyPlayerIds.filter((playerId) => playerId !== event.payload.playerId),
                    scenarioCardConfirmations,
                };
            }
        case EVENTS.EXPLORER_CONFIRMED:
            return core.readyPlayerIds.includes(event.payload.playerId)
                ? core
                : { ...core, readyPlayerIds: [...core.readyPlayerIds, event.payload.playerId] };
        case EVENTS.SCENARIO_CARD_PROPOSED:
            return {
                ...core,
                proposedScenarioCardId: event.payload.candidateId,
                scenarioCardConfirmations: {},
                activityLog: appendActivity(core, event.payload.logText, 'neutral'),
            };
        case EVENTS.SCENARIO_CARD_CONFIRMED:
            return {
                ...core,
                scenarioCardConfirmations: {
                    ...core.scenarioCardConfirmations,
                    [event.payload.playerId]: event.payload.candidateId,
                },
                activityLog: appendActivity(core, event.payload.logText, 'accent'),
            };
        case EVENTS.SCENARIO_STARTED: {
            core.scenarioId = event.payload.scenarioId;
            const scenario = scenarioConfigById(event.payload.scenarioId);
            const explorers = buildScenarioExplorers(core);
            const firstPlayerId = explorers[0]?.playerId ?? core.currentPlayer;
            core.scenarioRuntime = createInitialScenarioRuntimeStatus();
            ensureLibraryPresent(core);
            const startedCore = replaceExplorers({
                ...core,
                phase: 'preHaunt',
                currentPlayer: firstPlayerId,
                turnStartSpeed: 0,
                movesRemaining: 0,
                recommendedAction: 'explore',
                activeRoomId: explorers[0]?.roomId ?? core.activeRoomId,
                usedCardIdsThisTurn: [],
                tradeUsedThisTurnPlayerIds: [],
                receivedCardIdsThisTurnByPlayerId: {},
                latestDiscovery: null,
                latestDiscoveryOwnerPlayerId: null,
                highlightedDeckKind: null,
                pendingTradeAgreement: null,
                activePlayerId: null,
                activityLog: [{ id: `scenario-started-${scenario.id}`, text: scenario.logs.scenarioStarted, tone: 'accent' }],
                endgameResult: null,
            }, explorers, firstPlayerId);
            const turnStartSpeed = resolveTurnStartSpeed(startedCore, firstPlayerId);
            return {
                ...startedCore,
                turnStartSpeed,
                movesRemaining: turnStartSpeed,
                turnStartInventoryCardIds: resolveTurnStartInventoryCardIds(startedCore, firstPlayerId),
            };
        }
        case EVENTS.EXPLORER_MOVED: {
            return applyBetrayalExplorerMovedState(core, event);
        }
        case EVENTS.ROOM_EXPLORED: {
            const resolution = applyBetrayalRoomExploredState(core, event, DEFAULT_BETRAYAL_RANDOM);
            if (resolution.scenarioCompletedResult) {
                return reduceEvent(resolution.core, nowEvent(EVENTS.SCENARIO_COMPLETED, {
                    result: resolution.scenarioCompletedResult,
                }, event.timestamp));
            }
            if (resolution.hauntTriggeredPayload) {
                return reduceEvent(resolution.core, nowEvent(EVENTS.HAUNT_TRIGGERED, resolution.hauntTriggeredPayload, event.timestamp));
            }
            return resolution.core;
        }
        case EVENTS.EVENT_CHOICE_RESOLVED: {
            const resolution = applyBetrayalEventChoiceResolvedState(core, event);
            if (resolution.scenarioCompletedResult) {
                return reduceEvent(resolution.core, nowEvent(EVENTS.SCENARIO_COMPLETED, {
                    result: resolution.scenarioCompletedResult,
                }, event.timestamp));
            }
            if (resolution.hauntTriggeredPayload) {
                return reduceEvent(resolution.core, nowEvent(EVENTS.HAUNT_TRIGGERED, resolution.hauntTriggeredPayload, event.timestamp));
            }
            return resolution.core;
        }
        case EVENTS.CARD_RESOLUTION_ACKNOWLEDGED: {
            const acknowledgedPlayerIds = event.payload.acknowledgedPlayerIds
                ?? event.payload.resolution.acknowledgedPlayerIds
                ?? [];
            const acknowledgedResolution = {
                ...event.payload.resolution,
                acknowledgedPlayerIds: [...acknowledgedPlayerIds],
            };
            const isComplete = isPendingCardResolutionFullyAcknowledged(
                core,
                acknowledgedResolution,
                acknowledgedPlayerIds,
            );
            core.pendingCardResolutionQueue = (core.pendingCardResolutionQueue ?? [])
                .flatMap((resolution) => {
                    if (resolution.id !== event.payload.resolution.id) {
                        return [resolution];
                    }
                    return isComplete ? [] : [acknowledgedResolution];
                });
            const synced = syncCurrentExplorerProjection(core);
            return {
                ...synced,
                recommendedAction: resolveRecommendedAction(synced),
                activityLog: synced.activityLog,
            };
        }
        case EVENTS.RABBIT_FOOT_USED: {
            const resolution = applyBetrayalRecentRollRerollState(core, event);
            if (resolution.scenarioCompletedResult) {
                return reduceEvent(resolution.core, nowEvent(EVENTS.SCENARIO_COMPLETED, {
                    result: resolution.scenarioCompletedResult,
                }, event.timestamp));
            }
            return resolution.core;
        }
        case EVENTS.EVENT_ROLLED: {
            return applyBetrayalEventRolledState(core, event).core;
        }
        case EVENTS.EVENT_ROLL_FINALIZED: {
            const resolution = applyBetrayalEventRollFinalizedState(core, event);
            if (resolution.hauntTriggeredPayload) {
                return reduceEvent(resolution.core, nowEvent(EVENTS.HAUNT_TRIGGERED, resolution.hauntTriggeredPayload, event.timestamp));
            }
            return resolution.core;
        }
        case EVENTS.POSSESSION_USED: {
            if (event.payload.eventRollReplacement) {
                if (!applyBetrayalEventRollReplacementState(core, event.payload)) {
                    return core;
                }
                const synced = syncCurrentExplorerProjection(core);
                return {
                    ...synced,
                    recommendedAction: resolveRecommendedAction(synced),
                    activityLog: appendActivity(synced, event.payload.logText, 'accent'),
                };
            }
            applyBetrayalPossessionUsedState(core, event.payload);
            const synced = syncCurrentExplorerProjection(core);
            return {
                ...synced,
                recommendedAction: resolveRecommendedAction(synced),
                activityLog: appendActivity(synced, event.payload.logText, 'accent'),
            };
        }
        case EVENTS.ROOM_EFFECT_USED: {
            if (!applyBetrayalRoomEffectUsedState(core, event.payload, event.timestamp)) {
                return core;
            }
            const synced = syncCurrentExplorerProjection(core);
            return {
                ...synced,
                recommendedAction: resolveRecommendedAction(synced),
                activityLog: appendActivity(synced, event.payload.logText, 'accent'),
            };
        }
        case EVENTS.POSSESSION_TRADED: {
            const tradeResult = applyBetrayalTradeAcceptedState(core, event.payload);
            if (!tradeResult) {
                return core;
            }
            const synced = syncCurrentExplorerProjection(core);
            const tradeUsedThisTurnPlayerIds = Array.from(new Set([
                ...core.tradeUsedThisTurnPlayerIds,
                tradeResult.requesterPlayerId,
            ]));
            return {
                ...synced,
                recommendedAction: resolveRecommendedAction(synced),
                tradeUsedThisTurnPlayerIds,
                activityLog: appendActivity(synced, event.payload.logText, 'neutral'),
            };
        }
        case EVENTS.POSSESSION_TRADE_REQUESTED: {
            core.pendingTradeAgreement = createBetrayalPendingTradeAgreement(event.payload, event.timestamp);
            core.activePlayerId = event.payload.targetPlayerId;
            const synced = syncCurrentExplorerProjection(core);
            return {
                ...synced,
                recommendedAction: resolveRecommendedAction(synced),
                activityLog: appendActivity(synced, event.payload.logText, 'accent'),
            };
        }
        case EVENTS.POSSESSION_TRADE_DECLINED: {
            clearBetrayalPendingTradeAgreement(core);
            const synced = syncCurrentExplorerProjection(core);
            return {
                ...synced,
                recommendedAction: resolveRecommendedAction(synced),
                activityLog: appendActivity(synced, event.payload.logText, 'neutral'),
            };
        }
        case EVENTS.CORPSE_LOOTED: {
            if (!applyBetrayalCorpseLootedState(core, event.payload)) {
                return core;
            }
            const synced = syncCurrentExplorerProjection(core);
            return {
                ...synced,
                recommendedAction: resolveRecommendedAction(synced),
                activityLog: appendActivity(synced, event.payload.logText, 'neutral'),
            };
        }
        case EVENTS.DUST_SEARCH_RESOLVED: {
            return reduceScenarioCompletionStateResolution(
                applyBetrayalDustSearchResolvedState(core, event),
                event.timestamp,
            );
        }
        case EVENTS.DUST_CURE_RESOLVED: {
            return reduceScenarioCompletionStateResolution(
                applyBetrayalDustCureResolvedState(core, event),
                event.timestamp,
            );
        }
        case EVENTS.SICKNESS_EXCHANGE_REQUESTED: {
            return applyBetrayalSicknessExchangeRequestedState(core, event);
        }
        case EVENTS.SICKNESS_EXCHANGE_RESOLVED: {
            return reduceScenarioCompletionStateResolution(
                applyBetrayalSicknessExchangeResolvedState(core, event),
                event.timestamp,
            );
        }
        case EVENTS.HAUNT_SETUP_ENTRY_CONFIRMED: {
            core.scenarioRuntime.hauntSetupQueue = resolveHauntSetupQueueWithEntryStatus(
                core,
                event.payload.entryId,
                'resolved',
            );
            const synced = syncCurrentExplorerProjection(core);
            return {
                ...synced,
                activityLog: appendActivity(synced, event.payload.logText, 'accent'),
            };
        }
        case EVENTS.PHOTO_TAKEN: {
            return applyBetrayalPhotoTakenState(core, event);
        }
        case EVENTS.MAGIC_CAMERA_SMASHED: {
            return reduceScenarioCompletionStateResolution(
                applyBetrayalMagicCameraSmashedState(core, event),
                event.timestamp,
            );
        }
        case EVENTS.PHANTOM_PHOTOGRAPHER_ATTACK_RESOLVED: {
            return reduceScenarioCompletionStateResolution(
                applyBetrayalPhantomPhotographerAttackResolvedState(core, event),
                event.timestamp,
            );
        }
        case EVENTS.BLOOD_FROM_STONE_PEEKABOO_RESOLVED: {
            return reduceScenarioCompletionStateResolution(
                applyBetrayalBloodFromStonePeekabooResolvedState(core, event),
                event.timestamp,
            );
        }
        case EVENTS.TOOTH_NECKLACE_CHOICE_STARTED: {
            const synced = syncCurrentExplorerProjection(core);
            return {
                ...synced,
                pendingEventChoice: {
                    id: `tooth-necklace-${event.payload.playerId}-${event.timestamp}`,
                    playerId: event.payload.playerId,
                    sourceTitle: event.payload.cardName,
                    acceptLabel: '获得属性',
                    declineLabel: '跳过',
                    sourceKind: 'item',
                    itemResolution: 'tooth-necklace-end-turn',
                    itemCardId: event.payload.cardId,
                    deferredTurnEnd: cloneTurnEndedPayload(event.payload.deferredTurnEnd),
                    effect: {
                        mode: 'chosenTrait',
                        amount: 1,
                        allowedTraits: [...event.payload.allowedTraits],
                        recommendedAction: 'endTurn',
                    },
                },
                activePlayerId: event.payload.playerId,
                recommendedAction: 'endTurn',
                activityLog: appendActivity(synced, event.payload.logText, 'accent'),
            };
        }
        case EVENTS.TOOTH_NECKLACE_TRAIT_GAINED: {
            const actor = findExplorerByPlayerId(core, event.payload.playerId);
            if (actor && event.payload.accepted && event.payload.trait) {
                moveExplorerTraitSteps(actor, event.payload.trait, 1);
            }
            core.pendingEventChoice = null;
            const synced = syncCurrentExplorerProjection(core);
            const loggedCore: BetrayalCore = {
                ...synced,
                pendingEventChoice: null,
                activePlayerId: null,
                recommendedAction: 'endTurn',
                activityLog: appendActivity(
                    synced,
                    event.payload.logText,
                    event.payload.accepted ? 'accent' : 'neutral',
                ),
            };
            return reduceEvent(
                loggedCore,
                nowEvent(EVENTS.TURN_ENDED, cloneTurnEndedPayload(event.payload.deferredTurnEnd), event.timestamp),
            );
        }
        case EVENTS.TURN_ENDED: {
            const result = applyBetrayalTurnEndedState(core, event);
            if (result.scenarioCompletedResult) {
                return reduceScenarioCompletionStateResolution(result, event.timestamp);
            }
            if (result.helpingHandsMonsterTurnStartedPayload) {
                return reduceEvent(result.core, nowEvent(
                    EVENTS.HELPING_HANDS_MONSTER_TURN_STARTED,
                    result.helpingHandsMonsterTurnStartedPayload,
                    event.timestamp,
                ));
            }
            return result.core;
        }
        case EVENTS.DAMAGE_ALLOCATION_RESOLVED: {
            const result = applyBetrayalDamageAllocationAftermathState(core, event);
            if (result.scenarioCompletedResult) {
                return reduceScenarioCompletionStateResolution(result, event.timestamp);
            }
            if (result.turnEndRollAcknowledgedPayload) {
                return reduceEvent(
                    result.core,
                    nowEvent(EVENTS.TURN_END_ROLL_ACKNOWLEDGED, result.turnEndRollAcknowledgedPayload, event.timestamp),
                );
            }
            return result.core;
        }
        case EVENTS.RECENT_ROLL_ACKNOWLEDGED: {
            if (core.recentRoll?.id !== event.payload.rollId) {
                return core;
            }
            core.recentRoll = event.payload.isFullyAcknowledged
                ? null
                : {
                    ...core.recentRoll,
                    requiredPlayerIds: [...event.payload.requiredPlayerIds],
                    acknowledgedPlayerIds: [...event.payload.acknowledgedPlayerIds],
                };
            const synced = syncCurrentExplorerProjection(core);
            return {
                ...synced,
                recommendedAction: resolveRecommendedAction(synced),
                activityLog: appendActivity(synced, event.payload.logText, 'accent'),
            };
        }
        case EVENTS.TURN_END_ROLL_ACKNOWLEDGED: {
            const result = applyBetrayalTurnEndRollAcknowledgedState(core, event);
            return reduceScenarioCompletionStateResolution(result, event.timestamp);
        }
        case EVENTS.HAUNT_TRIGGERED: {
            return applyBetrayalHauntTriggeredState(core, event, DEFAULT_BETRAYAL_RANDOM);
        }
        case EVENTS.MONSTER_DAMAGE_RESOLVED: {
            return applyBetrayalMonsterDamageResolvedState(core, event);
        }
        case EVENTS.MONSTER_TURN_START_RESOLVED: {
            return applyBetrayalMonsterTurnStartResolvedState(core, event);
        }
        case EVENTS.MONSTER_MOVEMENT_GROUP_ROLLED: {
            return applyBetrayalMonsterMovementGroupRolledState(core, event);
        }
        case EVENTS.MONSTER_MOVED: {
            const movedCore = applyBetrayalMonsterMovedState(core, event);
            return completeMummyTraitorVictoryIfNeeded(movedCore, event.timestamp) ?? movedCore;
        }
        case EVENTS.MONSTER_ATTACK_HERO_RESOLVED: {
            return applyBetrayalMonsterAttackHeroResolvedState(core, event);
        }
        case EVENTS.BLOOD_FROM_STONE_MONSTER_TURN_ENDED: {
            const result = applyBloodFromStoneMonsterTurnEndedState(core, event);
            if (result.turnEndRollAcknowledgedPayload) {
                return reduceEvent(
                    result.core,
                    nowEvent(EVENTS.TURN_END_ROLL_ACKNOWLEDGED, result.turnEndRollAcknowledgedPayload, event.timestamp),
                );
            }
            return result.core;
        }
        case EVENTS.BLOOD_FROM_STONE_EXTRA_STONE_CHERUBS_PLACED: {
            return applyBetrayalBloodFromStoneExtraStoneCherubsPlacedState(core, event);
        }
        case EVENTS.DYNAMITE_ATTACK_RESOLVED: {
            return applyBetrayalDynamiteAttackResolvedState(core, event);
        }
        case EVENTS.HAUNT_ATTACK_RESOLVED: {
            return reduceScenarioCompletionStateResolution(
                applyBetrayalHauntAttackResolvedState(core, event),
                event.timestamp,
            );
        }
        case EVENTS.HELPING_HANDS_ATTACK_REWARD_RESOLVED: {
            return reduceScenarioCompletionStateResolution(
                applyBetrayalHelpingHandsAttackRewardResolvedState(core, event),
                event.timestamp,
            );
        }
        case EVENTS.MUMMY_ATTACK_REWARD_RESOLVED: {
            return reduceScenarioCompletionStateResolution(
                applyBetrayalMummyAttackRewardResolvedState(core, event),
                event.timestamp,
            );
        }
        case EVENTS.HELPING_HANDS_MONSTER_TURN_STARTED: {
            return applyBetrayalHelpingHandsMonsterTurnStartedState(core, event);
        }
        case EVENTS.HELPING_HANDS_TROLL_HAND_MOVED: {
            return applyBetrayalHelpingHandsTrollHandMovedState(core, event);
        }
        case EVENTS.HELPING_HANDS_TROLL_HAND_ATTACK_RESOLVED: {
            return reduceScenarioCompletionStateResolution(
                applyBetrayalHelpingHandsTrollHandAttackResolvedState(core, event),
                event.timestamp,
            );
        }
        case EVENTS.HELPING_HANDS_MONSTER_TURN_ENDED: {
            return applyBetrayalHelpingHandsMonsterTurnEndedState(core, event);
        }
        case EVENTS.JACK_LEARNED: {
            return applyBetrayalJackLearnedState(core, event);
        }
        case EVENTS.EXORCISM_STUDIED: {
            return applyBetrayalExorcismStudiedState(core, event);
        }
        case EVENTS.JACK_EXORCISED: {
            return reduceScenarioCompletionStateResolution(
                applyBetrayalJackExorcisedState(core, event),
                event.timestamp,
            );
        }
        case EVENTS.MUMMY_NAME_STUDIED: {
            return applyBetrayalMummyNameStudiedState(core, event);
        }
        case EVENTS.MUMMY_BANISHMENT_LEARNED: {
            return applyBetrayalMummyBanishmentLearnedState(core, event);
        }
        case EVENTS.MUMMY_BANISHED: {
            return reduceScenarioCompletionStateResolution(
                applyBetrayalMummyBanishedState(core, event),
                event.timestamp,
            );
        }
        case EVENTS.MUMMY_GIRL_PICKED_UP: {
            return applyBetrayalMummyGirlPickedUpState(core, event);
        }
        case EVENTS.MUMMY_GIRL_GIVEN: {
            return applyBetrayalMummyGirlGivenState(core, event);
        }
        case EVENTS.MUMMY_OMEN_GIVEN: {
            return reduceScenarioCompletionStateResolution(
                applyBetrayalMummyOmenGivenState(core, event),
                event.timestamp,
            );
        }
        case EVENTS.UPON_REFLECTION_EVENT_HINT_GIVEN: {
            return applyBetrayalUponReflectionEventHintGivenState(core, event);
        }
        case EVENTS.UPON_REFLECTION_CURSE_BREAK_ATTEMPTED: {
            return reduceScenarioCompletionStateResolution(
                applyBetrayalUponReflectionCurseBreakAttemptedState(core, event),
                event.timestamp,
            );
        }
        case EVENTS.SCENARIO_COMPLETED:
            return applyBetrayalScenarioCompletedState(core, event);
        default:
            return core;
    }
}

export const BetrayalDomain: DomainCore<BetrayalCore, BetrayalCommand, BetrayalEvent> = {
    gameId: 'betrayal',
    setup: (playerIds: PlayerId[], random: RandomFn, setupData?: unknown) => createBetrayalCharacterSelectCore(playerIds, random, setupData),
    validate: validateCommand,
    execute: executeCommand,
    reduce: reduceEvent,
    playerView: createBetrayalPlayerView,
    isGameOver: (state) => {
        if (state.phase !== 'endgame' || !state.endgameResult) {
            return undefined;
        }
        return {
            winners: state.endgameResult.winners,
            scores: Object.fromEntries(state.playerIds.map((playerId) => [
                playerId,
                state.endgameResult?.winners.includes(playerId) ? 1 : 0,
            ])),
        };
    },
};

const resolveBetrayalPendingCardResolutionRecovery = (args: {
    state: MatchState<unknown>;
    phase: string;
}) => {
    const core = args.state.core as Partial<Pick<BetrayalCore, 'pendingCardResolutionQueue'>> | undefined;
    const pendingResolution = core?.pendingCardResolutionQueue?.[0];
    if (!pendingResolution) {
        return null;
    }

    const requiredPlayerIds = pendingResolution.requiredPlayerIds?.length
        ? pendingResolution.requiredPlayerIds
        : [pendingResolution.playerId];
    const acknowledgedPlayerIds = new Set(pendingResolution.acknowledgedPlayerIds ?? []);
    const playerId = requiredPlayerIds.find((candidate) => !acknowledgedPlayerIds.has(candidate));
    if (!playerId) {
        return null;
    }

    const resolutionId = pendingResolution.id;
    return {
        playerId,
        fingerprintHint: `card-resolution:${playerId}:${args.phase}:${resolutionId}:${requiredPlayerIds.join(',')}:${[...acknowledgedPlayerIds].join(',')}`,
        attemptSuffix: `card-resolution:${playerId}:${resolutionId}`,
        command: {
            type: BETRAYAL_COMMANDS.ACKNOWLEDGE_CARD_RESOLUTION,
            payload: { resolutionId },
        },
    };
};

const resolveBetrayalPendingEventRollResolutionRecovery = (args: {
    state: MatchState<unknown>;
    phase: string;
}) => {
    const core = args.state.core as Partial<Pick<BetrayalCore, 'pendingEventRollResolution' | 'playerIds'>> | undefined;
    const pendingResolution = core?.pendingEventRollResolution;
    if (!pendingResolution) {
        return null;
    }
    if (pendingResolution.requiresAcknowledgement === false) {
        return null;
    }

    const requiredPlayerIds = resolvePendingEventRollResolutionRequiredPlayerIds(
        { playerIds: core?.playerIds ?? [] },
        pendingResolution,
    );
    const acknowledgedPlayerIds = new Set(resolvePendingEventRollResolutionAcknowledgedPlayerIds(pendingResolution));
    const playerId = requiredPlayerIds.find((candidate) => !acknowledgedPlayerIds.has(candidate));
    if (!playerId) {
        return null;
    }

    return {
        playerId,
        fingerprintHint: `event-roll-resolution:${playerId}:${args.phase}:${pendingResolution.rollId}:${requiredPlayerIds.join(',')}:${[...acknowledgedPlayerIds].join(',')}`,
        attemptSuffix: `event-roll-resolution:${playerId}:${pendingResolution.rollId}`,
        command: {
            type: BETRAYAL_COMMANDS.FINALIZE_EVENT_ROLL,
            payload: { rollId: pendingResolution.rollId },
        },
    };
};

const resolveBetrayalPendingEventRollStartRecovery = (args: {
    state: MatchState<unknown>;
    phase: string;
}) => {
    const core = args.state.core as Partial<Pick<BetrayalCore, 'pendingEventRollStart'>> | undefined;
    const pending = core?.pendingEventRollStart;
    if (!pending) {
        return null;
    }

    return {
        playerId: pending.playerId,
        fingerprintHint: `event-roll-start:${pending.playerId}:${args.phase}:${pending.roomId}:${pending.sourceTitle}`,
        attemptSuffix: `event-roll-start:${pending.playerId}:${pending.sourceTitle}`,
        command: {
            type: BETRAYAL_COMMANDS.ROLL_EVENT,
            payload: { sourceTitle: pending.sourceTitle },
        },
    };
};

const resolveBetrayalSeatLegalOnlyRecovery = (args: {
    state: MatchState<unknown>;
    phase: string;
}) => (
    resolveBetrayalPendingEventRollStartRecovery(args)
    ?? resolveBetrayalPendingEventRollResolutionRecovery(args)
    ?? resolveBetrayalPendingCardResolutionRecovery(args)
);

const shouldSuppressBetrayalActiveTurnRecovery = (args: {
    state: MatchState<unknown>;
}) => {
    const core = args.state.core as Partial<Pick<BetrayalCore, 'pendingCardResolutionQueue' | 'pendingEventRollResolution' | 'pendingEventRollStart'>> | undefined;
    return Boolean(
        core?.pendingCardResolutionQueue?.length
        || core?.pendingEventRollStart
        || core?.pendingEventRollResolution,
    );
};

const systems = [
    ...createBaseSystems<BetrayalCore>({
        actionLog: {
            commandAllowlist: BETRAYAL_ACTION_LOG_ALLOWLIST,
            formatEntry: formatBetrayalActionEntry,
        },
        undo: {
            snapshotCommandAllowlist: BETRAYAL_UNDO_ALLOWLIST,
        },
    }),
    createCheatSystem<BetrayalCore>(),
];

const baseEngineConfig = createGameEngine<BetrayalCore, BetrayalCommand, BetrayalEvent>({
    domain: BetrayalDomain,
    systems,
    minPlayers: 3,
    maxPlayers: 6,
    commandTypes: Object.values(BETRAYAL_COMMANDS),
});

export const engineConfig = {
    ...baseEngineConfig,
    onlineAiRecovery: {
        publicPregameLegalActionPhases: ['characterSelect'],
        resolveSeatLegalOnlyRecovery: resolveBetrayalSeatLegalOnlyRecovery,
        shouldSuppressActiveTurnCandidate: shouldSuppressBetrayalActiveTurnRecovery,
    },
};

export const betrayalAiRuntime = createBetrayalAiRuntime({
    validate: (state, command) => BetrayalDomain.validate(
        state as MatchState<BetrayalCore>,
        command as BetrayalCommand,
    ),
});

registerCriticalImageResolver('betrayal', betrayalCriticalImageResolver);
registerGameAiRuntime(betrayalAiRuntime);

export default engineConfig;
export { BETRAYAL_AUDIO_CONFIG as audioConfig } from './audio.config';
