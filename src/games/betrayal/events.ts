import type { GameEvent } from '../../engine/types';
import type { BetrayalBloodFromStoneSetupPlacement } from './bloodFromStoneSetupReadModel';
import type { BetrayalCorpseLootedPayload } from './deathStateReadModel';
import type { BetrayalEventRollReplacementResult } from './eventRollReplacementModel';
import type {
    BetrayalDeckKind,
    BetrayalDiscoverySummary,
    BetrayalDustRuntimeState,
    BetrayalDustSicknessSwapResult,
    BetrayalEndgameResult,
    BetrayalExplorerSummary,
    BetrayalHauntAttackTarget,
    BetrayalHelpingHandsMonsterTurnStartedPayload,
    BetrayalHelpingHandsRuntimeState,
    BetrayalInventoryCard,
    BetrayalMagicCameraRuntimeState,
    BetrayalMonsterMovementRollResult,
    BetrayalMonsterStatusKind,
    BetrayalPendingCardResolutionState,
    BetrayalPendingEventChoiceState,
    BetrayalPendingEventRollResolutionState,
    BetrayalRoomDrawResolution,
    BetrayalRoomNode,
    BetrayalRoomTileAdjustmentSelection,
    BetrayalTraitKey,
    BetrayalTurnEndedPayload,
    BetrayalUponReflectionRuntimeState,
} from './game';
import type {
    BetrayalHelpingHandsAttackRewardChoice,
} from './hauntAttackRewardReadModel';
import type { BetrayalHauntRollResult } from './hauntProgress';
import type { BetrayalHauntSetupQueueEntryId } from './hauntSetupModel';
import type {
    BetrayalHauntFirstPlayerResolution,
    BetrayalHauntTraitorResolution,
} from './hauntTraitorResolutionModel';
import type {
    BetrayalBloodFromStoneGazeDamageRoll,
    BetrayalMonsterMovementRollGroupResult,
} from './monsterActionReadModel';
import type { BetrayalMonsterDamageOutcome } from './monsterReadModel';
import type {
    PossessionUseEffectProfile,
    UseEffectProfile,
} from './possessionEffects';
import type { BetrayalRoomEffectUsedPayload } from './roomEnterEffectModel';
import type {
    BetrayalScenarioCardId,
    BetrayalScenarioId,
} from './scenarioConfig';
import type {
    BetrayalTradeAcceptedPayload,
    BetrayalTradeDeclinedPayload,
    BetrayalTradeRequestedPayload,
} from './trade';

type BetrayalDynamiteExplorerRoll = {
    playerId: string;
    displayName: string;
    dice: number[];
    passiveBonus: number;
    total: number;
    passed: boolean;
    traitsBeforeDamage: BetrayalExplorerSummary['traits'];
};

type BetrayalDynamiteMonsterRoll = {
    monsterId: string;
    monsterName: string;
    dice: number[];
    total: number;
    passed: boolean;
    monsterDamageOutcome?: BetrayalMonsterDamageOutcome | null;
};
export const EVENTS = {
    EXPLORER_SELECTED: 'EXPLORER_SELECTED',
    EXPLORER_CONFIRMED: 'EXPLORER_CONFIRMED',
    SCENARIO_CARD_PROPOSED: 'SCENARIO_CARD_PROPOSED',
    SCENARIO_CARD_CONFIRMED: 'SCENARIO_CARD_CONFIRMED',
    SCENARIO_STARTED: 'SCENARIO_STARTED',
    EXPLORER_MOVED: 'EXPLORER_MOVED',
    ROOM_EXPLORED: 'ROOM_EXPLORED',
    EVENT_CHOICE_RESOLVED: 'EVENT_CHOICE_RESOLVED',
    EVENT_ROLLED: 'EVENT_ROLLED',
    TOOTH_NECKLACE_CHOICE_STARTED: 'TOOTH_NECKLACE_CHOICE_STARTED',
    TOOTH_NECKLACE_TRAIT_GAINED: 'TOOTH_NECKLACE_TRAIT_GAINED',
    CARD_RESOLUTION_ACKNOWLEDGED: 'CARD_RESOLUTION_ACKNOWLEDGED',
    POSSESSION_USED: 'POSSESSION_USED',
    RABBIT_FOOT_USED: 'RABBIT_FOOT_USED',
    EVENT_ROLL_FINALIZED: 'EVENT_ROLL_FINALIZED',
    ROOM_EFFECT_USED: 'ROOM_EFFECT_USED',
    POSSESSION_TRADE_REQUESTED: 'POSSESSION_TRADE_REQUESTED',
    POSSESSION_TRADED: 'POSSESSION_TRADED',
    POSSESSION_TRADE_DECLINED: 'POSSESSION_TRADE_DECLINED',
    CORPSE_LOOTED: 'CORPSE_LOOTED',
    TURN_ENDED: 'TURN_ENDED',
    RECENT_ROLL_ACKNOWLEDGED: 'RECENT_ROLL_ACKNOWLEDGED',
    TURN_END_ROLL_ACKNOWLEDGED: 'TURN_END_ROLL_ACKNOWLEDGED',
    DAMAGE_ALLOCATION_RESOLVED: 'DAMAGE_ALLOCATION_RESOLVED',
    HAUNT_TRIGGERED: 'HAUNT_TRIGGERED',
    HAUNT_ATTACK_RESOLVED: 'HAUNT_ATTACK_RESOLVED',
    DYNAMITE_ATTACK_RESOLVED: 'DYNAMITE_ATTACK_RESOLVED',
    MONSTER_DAMAGE_RESOLVED: 'MONSTER_DAMAGE_RESOLVED',
    MONSTER_TURN_START_RESOLVED: 'MONSTER_TURN_START_RESOLVED',
    MONSTER_MOVEMENT_GROUP_ROLLED: 'MONSTER_MOVEMENT_GROUP_ROLLED',
    MONSTER_MOVED: 'MONSTER_MOVED',
    MONSTER_ATTACK_HERO_RESOLVED: 'MONSTER_ATTACK_HERO_RESOLVED',
    BLOOD_FROM_STONE_MONSTER_TURN_ENDED: 'BLOOD_FROM_STONE_MONSTER_TURN_ENDED',
    BLOOD_FROM_STONE_EXTRA_STONE_CHERUBS_PLACED: 'BLOOD_FROM_STONE_EXTRA_STONE_CHERUBS_PLACED',
    HELPING_HANDS_ATTACK_REWARD_RESOLVED: 'HELPING_HANDS_ATTACK_REWARD_RESOLVED',
    HELPING_HANDS_MONSTER_TURN_STARTED: 'HELPING_HANDS_MONSTER_TURN_STARTED',
    HELPING_HANDS_TROLL_HAND_MOVED: 'HELPING_HANDS_TROLL_HAND_MOVED',
    HELPING_HANDS_TROLL_HAND_ATTACK_RESOLVED: 'HELPING_HANDS_TROLL_HAND_ATTACK_RESOLVED',
    HELPING_HANDS_MONSTER_TURN_ENDED: 'HELPING_HANDS_MONSTER_TURN_ENDED',
    JACK_LEARNED: 'JACK_LEARNED',
    EXORCISM_STUDIED: 'EXORCISM_STUDIED',
    JACK_EXORCISED: 'JACK_EXORCISED',
    MUMMY_NAME_STUDIED: 'MUMMY_NAME_STUDIED',
    MUMMY_BANISHMENT_LEARNED: 'MUMMY_BANISHMENT_LEARNED',
    MUMMY_BANISHED: 'MUMMY_BANISHED',
    MUMMY_GIRL_PICKED_UP: 'MUMMY_GIRL_PICKED_UP',
    MUMMY_GIRL_GIVEN: 'MUMMY_GIRL_GIVEN',
    MUMMY_OMEN_GIVEN: 'MUMMY_OMEN_GIVEN',
    MUMMY_ATTACK_REWARD_RESOLVED: 'MUMMY_ATTACK_REWARD_RESOLVED',
    DUST_SEARCH_RESOLVED: 'DUST_SEARCH_RESOLVED',
    DUST_CURE_RESOLVED: 'DUST_CURE_RESOLVED',
    SICKNESS_EXCHANGE_REQUESTED: 'SICKNESS_EXCHANGE_REQUESTED',
    SICKNESS_EXCHANGE_RESOLVED: 'SICKNESS_EXCHANGE_RESOLVED',
    HAUNT_SETUP_ENTRY_CONFIRMED: 'HAUNT_SETUP_ENTRY_CONFIRMED',
    PHOTO_TAKEN: 'PHOTO_TAKEN',
    MAGIC_CAMERA_SMASHED: 'MAGIC_CAMERA_SMASHED',
    PHANTOM_PHOTOGRAPHER_ATTACK_RESOLVED: 'PHANTOM_PHOTOGRAPHER_ATTACK_RESOLVED',
    BLOOD_FROM_STONE_PEEKABOO_RESOLVED: 'BLOOD_FROM_STONE_PEEKABOO_RESOLVED',
    UPON_REFLECTION_CURSE_BREAK_ATTEMPTED: 'UPON_REFLECTION_CURSE_BREAK_ATTEMPTED',
    UPON_REFLECTION_EVENT_HINT_GIVEN: 'UPON_REFLECTION_EVENT_HINT_GIVEN',
    SCENARIO_COMPLETED: 'SCENARIO_COMPLETED',
} as const;

export type BetrayalEvent =
    | GameEvent<typeof EVENTS.EXPLORER_SELECTED, { playerId: string; explorerId: string }>
    | GameEvent<typeof EVENTS.EXPLORER_CONFIRMED, { playerId: string }>
    | GameEvent<typeof EVENTS.SCENARIO_CARD_PROPOSED, { playerId: string; candidateId: BetrayalScenarioCardId; title: string; logText: string }>
    | GameEvent<typeof EVENTS.SCENARIO_CARD_CONFIRMED, { playerId: string; candidateId: BetrayalScenarioCardId; title: string; logText: string }>
    | GameEvent<typeof EVENTS.SCENARIO_STARTED, { playerIds: string[]; scenarioId: BetrayalScenarioId }>
    | GameEvent<typeof EVENTS.EXPLORER_MOVED, {
        playerId: string;
        roomId: string;
        logText: string;
        moveCost?: number;
        consumeMove?: boolean;
        usedActionId?: string;
        controlledToken?: 'jack-spirit' | 'feverish';
        skeletonKeyCardId?: string;
        skeletonKeyRoll?: number;
        skeletonKeyBuried?: boolean;
        bloodFromStoneTurnStartVisibleStoneCherubIds?: string[];
        bloodFromStoneNewLineOfSightDamageRoll?: BetrayalBloodFromStoneGazeDamageRoll;
    }>
    | GameEvent<typeof EVENTS.ROOM_EXPLORED, {
        playerId: string;
        roomId: string;
        room: Pick<BetrayalRoomNode, 'name' | 'hint' | 'tags' | 'discoveryReward' | 'visualId' | 'doorways' | 'backVisualId' | 'orientationTurns' | 'discoveryEffect' | 'endTurnEffect' | 'enterEffect'>;
        deckKind: BetrayalDeckKind | null;
        drawnCard?: BetrayalInventoryCard;
        roomDiscoveryCards?: BetrayalInventoryCard[];
        buriedRoomDiscoveryCards?: BetrayalInventoryCard[];
        eventEffect?: UseEffectProfile;
        eventDescription?: string;
        eventRollPending?: {
            kind?: 'trait' | 'dice';
            trait?: BetrayalTraitKey;
            dice?: number;
            label?: string;
        };
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
        eventRoll?: {
            kind?: 'trait' | 'dice';
            trait?: BetrayalTraitKey;
            total: number;
            label: string;
            eventDescription?: string;
            rollLabel?: string;
            dice?: number[];
            passiveBonus?: number;
            branchThresholds?: { min: number; label: string; effect: UseEffectProfile }[];
        };
        skippedEventWithIdol?: {
            name: string;
        };
        skippedEventWithTraitorPower?: boolean;
        skippedEventWithUponReflection?: boolean;
        skippedRoomWithHolySymbol?: {
            name: string;
        };
        roomDrawResolution?: BetrayalRoomDrawResolution;
        discovery: BetrayalDiscoverySummary;
        nextPendingEventChoice?: BetrayalPendingEventChoiceState;
        logText: string;
        mummyForcedOmenSearch?: {
            role: 'hero-book' | 'traitor-wedding-omen';
            cardId: string;
            cardName: string;
            shuffledOmenDeck: BetrayalInventoryCard[];
        };
        hauntRoll?: BetrayalHauntRollResult;
        hauntTriggered?: boolean;
        hauntRevealResolution?: BetrayalHauntRevealResolution;
        roomTileAdjustment?: BetrayalRoomTileAdjustmentSelection;
    }>
    | GameEvent<typeof EVENTS.EVENT_CHOICE_RESOLVED, {
        playerId: string;
        sourceTitle: string;
        eventDescription?: string;
        accepted: boolean;
        hauntTriggered?: boolean;
        hauntTraitorPlayerId?: string | null;
        hauntCardNumber?: number;
        hauntTriggerLabel?: string;
        hauntRevealResolution?: BetrayalHauntRevealResolution;
        hauntTraitorResolution?: BetrayalHauntTraitorResolution;
        dustSetup?: BetrayalDustRuntimeState;
        magicCameraSetup?: BetrayalMagicCameraRuntimeState;
        helpingHandsSetup?: BetrayalHelpingHandsRuntimeState;
        uponReflectionSetup?: BetrayalUponReflectionRuntimeState;
        hauntRoll?: BetrayalPendingEventRollResolutionState['hauntRoll'];
        nextPendingEventChoice?: BetrayalPendingEventChoiceState;
        eventEffect?: UseEffectProfile;
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
        eventRoll?: {
            kind?: 'trait' | 'dice';
            trait?: BetrayalTraitKey;
            total: number;
            label: string;
            eventDescription?: string;
            rollLabel?: string;
            dice?: number[];
            passiveBonus?: number;
            branchThresholds?: { min: number; label: string; effect: UseEffectProfile }[];
        };
        drawnEventCardNameToBury?: string;
        discovery: BetrayalDiscoverySummary;
        logText: string;
    }>
    | GameEvent<typeof EVENTS.EVENT_ROLLED, {
        rollId: string;
        playerId: string;
        sourceTitle: string;
        eventDescription?: string;
        eventEffect?: UseEffectProfile;
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
        eventRoll: {
            kind?: 'trait' | 'dice';
            trait?: BetrayalTraitKey;
            total: number;
            label: string;
            eventDescription?: string;
            rollLabel?: string;
            dice?: number[];
            passiveBonus?: number;
            branchThresholds?: { min: number; label: string; effect: UseEffectProfile }[];
        };
        nextPendingEventChoice?: BetrayalPendingEventChoiceState;
        discovery: BetrayalDiscoverySummary;
        drawnEventCardNameToBury?: string;
        logText: string;
    }>
    | GameEvent<typeof EVENTS.TOOTH_NECKLACE_CHOICE_STARTED, {
        playerId: string;
        cardId: string;
        cardName: string;
        allowedTraits: BetrayalTraitKey[];
        deferredTurnEnd: BetrayalTurnEndedPayload;
        logText: string;
    }>
    | GameEvent<typeof EVENTS.TOOTH_NECKLACE_TRAIT_GAINED, {
        playerId: string;
        cardId: string;
        cardName: string;
        accepted: boolean;
        trait?: BetrayalTraitKey;
        deferredTurnEnd: BetrayalTurnEndedPayload;
        logText: string;
    }>
    | GameEvent<typeof EVENTS.CARD_RESOLUTION_ACKNOWLEDGED, {
        playerId: string;
        resolution: BetrayalPendingCardResolutionState;
        remainingCount: number;
        acknowledgedPlayerIds?: string[];
        remainingAcknowledgementCount?: number;
        logText: string;
    }>
    | GameEvent<typeof EVENTS.POSSESSION_USED, {
        playerId: string;
        cardId: string;
        effect: PossessionUseEffectProfile;
        targetPlayerId?: string;
        targetRoomId?: string;
        targetRoomIdsByTokenId?: Record<string, string>;
        replacementRollTotal?: number;
        eventRollReplacement?: BetrayalEventRollReplacementResult;
        logText: string;
    }>
    | GameEvent<typeof EVENTS.RABBIT_FOOT_USED, {
        playerId: string;
        cardId: string;
        cardName?: string;
        dieIndex: number;
        newPip: number;
        dieIndices?: number[];
        newPips?: number[];
        mentalDamageAfterReroll?: number;
        eventRerollEffect?: UseEffectProfile;
        eventRerollDeathPrevention?: BetrayalPendingEventRollResolutionState['deathPrevention'];
        eventRerollHaunt?: Omit<BetrayalPendingEventRollResolutionState, 'rollId' | 'playerId' | 'sourceTitle' | 'effect' | 'requiredPlayerIds' | 'acknowledgedPlayerIds' | 'nextPendingEventChoice' | 'deathPrevention' | 'hauntRoll'>;
        logText: string;
    }>
    | GameEvent<typeof EVENTS.EVENT_ROLL_FINALIZED, {
        rollId: string;
        playerId: string;
        triggerPlayerId: string;
        sourceTitle: string;
        requiredPlayerIds: string[];
        acknowledgedPlayerIds: string[];
        remainingAcknowledgementCount: number;
        isFullyAcknowledged: boolean;
        effect: UseEffectProfile;
        nextPendingEventChoice?: BetrayalPendingEventChoiceState;
        deathPrevention?: BetrayalPendingEventRollResolutionState['deathPrevention'];
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
        hauntRoll?: BetrayalPendingEventRollResolutionState['hauntRoll'];
        logText: string;
    }>
    | GameEvent<typeof EVENTS.ROOM_EFFECT_USED, BetrayalRoomEffectUsedPayload>
    | GameEvent<typeof EVENTS.POSSESSION_TRADE_REQUESTED, BetrayalTradeRequestedPayload>
    | GameEvent<typeof EVENTS.POSSESSION_TRADED, BetrayalTradeAcceptedPayload>
    | GameEvent<typeof EVENTS.POSSESSION_TRADE_DECLINED, BetrayalTradeDeclinedPayload>
    | GameEvent<typeof EVENTS.CORPSE_LOOTED, BetrayalCorpseLootedPayload>
    | GameEvent<typeof EVENTS.TURN_ENDED, BetrayalTurnEndedPayload>
    | GameEvent<typeof EVENTS.RECENT_ROLL_ACKNOWLEDGED, {
        playerId: string;
        rollId: string;
        sourceTitle: string;
        requiredPlayerIds: string[];
        acknowledgedPlayerIds: string[];
        remainingAcknowledgementCount: number;
        isFullyAcknowledged: boolean;
        logText: string;
    }>
    | GameEvent<typeof EVENTS.TURN_END_ROLL_ACKNOWLEDGED, {
        previousPlayerId: string;
        nextPlayerId: string;
        logText: string;
        monsterMovementRoll?: BetrayalMonsterMovementRollResult | null;
        helpingHandsMonsterTurnControllerPlayerId?: string;
        skipBloodFromStoneMonsterTurnStart?: boolean;
    }>
    | GameEvent<typeof EVENTS.DAMAGE_ALLOCATION_RESOLVED, {
        playerId: string;
        sourceTitle: string;
        damageKind: 'physical' | 'mental' | 'general';
        amount: number;
        traits: BetrayalTraitKey[];
        nextPlayerId?: string;
        monsterMovementRoll?: BetrayalMonsterMovementRollResult | null;
        turnLogText?: string;
        helpingHandsMonsterTurnControllerPlayerId?: string;
        skipBloodFromStoneMonsterTurnStart?: boolean;
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
            releasedJackSpiritRoomId?: string;
            nextPlayerId?: string;
            monsterMovementRoll?: BetrayalMonsterMovementRollResult | null;
            turnLogText?: string;
            helpingHandsMonsterTurnControllerPlayerId?: string;
            skipBloodFromStoneMonsterTurnStart?: boolean;
            prevented: boolean;
        };
        logText: string;
    }>
    | GameEvent<typeof EVENTS.HAUNT_TRIGGERED, {
        traitorPlayerId: string | null;
        hauntRevealerPlayerId?: string;
        nextPlayerId: string;
        hauntCardNumber?: number;
        hauntTriggerLabel: string;
        hauntRevealResolution?: BetrayalHauntRevealResolution;
        hauntTraitorResolution?: BetrayalHauntTraitorResolution;
        hauntFirstPlayerResolution?: BetrayalHauntFirstPlayerResolution;
        dustSetup?: BetrayalDustRuntimeState;
        magicCameraSetup?: BetrayalMagicCameraRuntimeState;
        helpingHandsSetup?: BetrayalHelpingHandsRuntimeState;
        uponReflectionSetup?: BetrayalUponReflectionRuntimeState;
        logText: string;
    }>
    | GameEvent<typeof EVENTS.HAUNT_ATTACK_RESOLVED, {
        attackerPlayerId: string;
        target: BetrayalHauntAttackTarget;
        defenderPlayerId?: string;
        defenderMonsterId?: string;
        defeatedPlayerId?: string;
        defeatedMonsterId?: string;
        defeatedMonsterRoomId?: string;
        releasedJackSpiritRoomId?: string;
        monsterDamageOutcome?: BetrayalMonsterDamageOutcome;
        outcome: 'wound' | 'traitor-defeated' | 'hero-defeated' | 'jack-damaged' | 'phantom-killed' | 'phantom-stunned' | 'troll-hand-resisted' | 'no-damage';
        attackerRoll?: number;
        defenderRoll?: number;
        damageToAttacker?: number;
        damageToDefender?: number;
        damageKind?: 'physical' | 'mental';
        weaponCardId?: string;
        weaponName?: string;
        weaponAttackBonus?: number;
        weaponExtraDice?: number;
        weaponSpeedCost?: number;
        weaponAttackTrait?: BetrayalTraitKey;
        attackRoll?: {
            id: string;
            dice: number[];
            passiveBonus: number;
            latestLabel: string;
            attackerTraitsBeforeDamage: BetrayalExplorerSummary['traits'];
            defenderTraitsBeforeDamage?: BetrayalExplorerSummary['traits'];
        };
        deathPrevention?: {
            playerId: string;
            cardId: string;
            rollTotal: number;
            dice: number[];
            minTotal: number;
            damageAmount: number;
            damageKind: 'physical' | 'mental';
            traitsBeforeDamage: BetrayalExplorerSummary['traits'];
            releasedJackSpiritRoomId?: string;
            prevented: boolean;
        };
        helpingHandsAttackRewardChoice?: BetrayalHelpingHandsAttackRewardChoice;
        logText: string;
    }>
    | GameEvent<typeof EVENTS.DYNAMITE_ATTACK_RESOLVED, {
        attackerPlayerId: string;
        cardId: string;
        cardName: string;
        targetRoomId: string;
        targetRoomName: string;
        explorerRolls: BetrayalDynamiteExplorerRoll[];
        monsterRolls: BetrayalDynamiteMonsterRoll[];
        logText: string;
    }>
    | GameEvent<typeof EVENTS.MONSTER_DAMAGE_RESOLVED, {
        playerId: string;
        monsterId: string;
        monsterName: string;
        damageAmount: number;
        damageTrait: BetrayalTraitKey;
        monsterDamageOutcome: BetrayalMonsterDamageOutcome;
        logText: string;
    }>
    | GameEvent<typeof EVENTS.MONSTER_TURN_START_RESOLVED, {
        playerId: string;
        monsterId: string;
        monsterName: string;
        previousStatus: BetrayalMonsterStatusKind;
        nextStatus: BetrayalMonsterStatusKind;
        flippedStunnedSideUp: boolean;
        skippedTurn: boolean;
        startedTurn: boolean;
        movementGroupId?: string;
        logText: string;
    }>
    | GameEvent<typeof EVENTS.MONSTER_MOVEMENT_GROUP_ROLLED, {
        result: BetrayalMonsterMovementRollGroupResult;
        logText: string;
    }>
    | GameEvent<typeof EVENTS.MONSTER_MOVED, {
        playerId: string;
        monsterId: string;
        monsterName: string;
        fromRoomId: string;
        toRoomId: string;
        moveCost: number;
        moveRemaining: number;
        teleportMove: boolean;
        logText: string;
    }>
    | GameEvent<typeof EVENTS.MONSTER_ATTACK_HERO_RESOLVED, {
        playerId: string;
        monsterId: string;
        monsterName: string;
        targetPlayerId: string;
        attackTrait: BetrayalTraitKey;
        damageKind: 'physical' | 'mental';
        monsterRoll: number;
        heroRoll: number;
        damageToHero?: number;
        monsterDamageOutcome?: BetrayalMonsterDamageOutcome;
        dice: number[];
        defenderTraitsBeforeDamage: BetrayalExplorerSummary['traits'];
        logText: string;
    }>
    | GameEvent<typeof EVENTS.BLOOD_FROM_STONE_MONSTER_TURN_ENDED, {
        controllerPlayerId: string;
        nextPlayerId: string;
        damageRolls: BetrayalBloodFromStoneGazeDamageRoll[];
        logText: string;
        turnLogText: string;
    }>
    | GameEvent<typeof EVENTS.BLOOD_FROM_STONE_EXTRA_STONE_CHERUBS_PLACED, {
        playerId: string;
        placements: BetrayalBloodFromStoneSetupPlacement[];
        logText: string;
    }>
    | GameEvent<typeof EVENTS.HELPING_HANDS_ATTACK_REWARD_RESOLVED, {
        attackerPlayerId: string;
        defenderPlayerId: string;
        choice: 'damage' | 'steal';
        stolenCardId?: string;
        stolenCardName?: string;
        damageToDefender?: number;
        damageKind?: 'physical' | 'mental';
        defeatedPlayerId?: string;
        deathPrevention?: {
            playerId: string;
            cardId: string;
            rollTotal: number;
            dice: number[];
            minTotal: number;
            damageAmount: number;
            damageKind: 'physical' | 'mental';
            traitsBeforeDamage: BetrayalExplorerSummary['traits'];
            prevented: boolean;
        };
        logText: string;
    }>
    | GameEvent<typeof EVENTS.HELPING_HANDS_MONSTER_TURN_STARTED, BetrayalHelpingHandsMonsterTurnStartedPayload>
    | GameEvent<typeof EVENTS.HELPING_HANDS_TROLL_HAND_MOVED, {
        controllerPlayerId: string;
        monsterId: string;
        fromRoomId: string;
        toRoomId: string;
        moveCost: number;
        moveRemaining: number;
        logText: string;
    }>
    | GameEvent<typeof EVENTS.HELPING_HANDS_TROLL_HAND_ATTACK_RESOLVED, {
        controllerPlayerId: string;
        targetPlayerId: string;
        trollHandIds: string[];
        combined: boolean;
        attackDice?: number[];
        attackerRoll: number;
        defenderRoll: number;
        damageToDefender?: number;
        defenderTraitsBeforeDamage?: BetrayalExplorerSummary['traits'];
        defeatedPlayerId?: string;
        deathPrevention?: {
            playerId: string;
            cardId: string;
            rollTotal: number;
            dice: number[];
            minTotal: number;
            damageAmount: number;
            damageKind: 'physical' | 'mental';
            traitsBeforeDamage: BetrayalExplorerSummary['traits'];
            prevented: boolean;
        };
        logText: string;
    }>
    | GameEvent<typeof EVENTS.HELPING_HANDS_MONSTER_TURN_ENDED, {
        controllerPlayerId: string;
        nextPlayerId: string;
        logText: string;
    }>
    | GameEvent<typeof EVENTS.JACK_LEARNED, {
        playerId: string;
        grantedToPlayerId: string | null;
        rollTotal: number;
        success: boolean;
        logText: string;
    }>
    | GameEvent<typeof EVENTS.EXORCISM_STUDIED, {
        playerId: string;
        roomId: string;
        rollTotal: number;
        success: boolean;
        logText: string;
    }>
    | GameEvent<typeof EVENTS.JACK_EXORCISED, {
        playerId: string;
        roomId: string;
        rollTotal: number;
        dice: number[];
        passiveBonus: number;
        regionBonus: number;
        success: boolean;
        logText: string;
    }>
    | GameEvent<typeof EVENTS.MUMMY_NAME_STUDIED, {
        playerId: string;
        roomId: string;
        rollTotal: number;
        dice: number[];
        passiveBonus: number;
        success: boolean;
        logText: string;
    }>
    | GameEvent<typeof EVENTS.MUMMY_BANISHMENT_LEARNED, {
        playerId: string;
        roomId: string;
        rollTotal: number;
        dice: number[];
        passiveBonus: number;
        success: boolean;
        logText: string;
    }>
    | GameEvent<typeof EVENTS.MUMMY_BANISHED, {
        playerId: string;
        roomId: string;
        heroRoll: number;
        mummyRoll: number;
        heroDice: number[];
        mummyDice: number[];
        passiveBonus: number;
        success: boolean;
        logText: string;
    }>
    | GameEvent<typeof EVENTS.MUMMY_GIRL_PICKED_UP, {
        playerId: string;
        roomId: string;
        logText: string;
    }>
    | GameEvent<typeof EVENTS.MUMMY_GIRL_GIVEN, {
        playerId: string;
        monsterId: string;
        roomId: string;
        logText: string;
    }>
    | GameEvent<typeof EVENTS.MUMMY_OMEN_GIVEN, {
        playerId: string;
        monsterId: string;
        roomId: string;
        cardId: string;
        cardName: string;
        logText: string;
    }>
    | GameEvent<typeof EVENTS.MUMMY_ATTACK_REWARD_RESOLVED, {
        controllerPlayerId: string;
        monsterId: string;
        monsterName: string;
        defenderPlayerId: string;
        choice: 'damage' | 'steal';
        stolenCardId?: string;
        stolenCardName?: string;
        damageToHero?: number;
        damageKind?: 'physical';
        logText: string;
    }>
    | GameEvent<typeof EVENTS.DUST_SEARCH_RESOLVED, {
        playerId: string;
        roomId: string;
        trait: Extract<BetrayalTraitKey, 'knowledge' | 'sanity'>;
        rollTotal: number;
        dice: number[];
        passiveBonus: number;
        success: boolean;
        swap?: BetrayalDustSicknessSwapResult;
        logText: string;
    }>
    | GameEvent<typeof EVENTS.DUST_CURE_RESOLVED, {
        playerId: string;
        roomId: string;
        trait: BetrayalTraitKey;
        rollTotal: number;
        dice: number[];
        passiveBonus: number;
        researchBonus: number;
        success: boolean;
        swap?: BetrayalDustSicknessSwapResult;
        logText: string;
    }>
    | GameEvent<typeof EVENTS.SICKNESS_EXCHANGE_REQUESTED, {
        requesterPlayerId: string;
        targetPlayerId: string;
        logText: string;
    }>
    | GameEvent<typeof EVENTS.SICKNESS_EXCHANGE_RESOLVED, {
        requesterPlayerId: string;
        targetPlayerId: string;
        accepted: boolean;
        swap?: BetrayalDustSicknessSwapResult;
        logText: string;
    }>
    | GameEvent<typeof EVENTS.HAUNT_SETUP_ENTRY_CONFIRMED, {
        playerId: string;
        entryId: BetrayalHauntSetupQueueEntryId;
        logText: string;
    }>
    | GameEvent<typeof EVENTS.PHOTO_TAKEN, {
        playerId: string;
        targetPlayerId: string;
        trait: BetrayalTraitKey;
        rollTotal: number;
        dice: number[];
        passiveBonus: number;
        success: boolean;
        logText: string;
    }>
    | GameEvent<typeof EVENTS.MAGIC_CAMERA_SMASHED, {
        playerId: string;
        rollTotal: number;
        dice: number[];
        passiveBonus: number;
        success: boolean;
        logText: string;
    }>
    | GameEvent<typeof EVENTS.PHANTOM_PHOTOGRAPHER_ATTACK_RESOLVED, {
        monsterId: string;
        targetPlayerId: string;
        monsterRoll: number;
        heroRoll: number;
        damageToHero?: number;
        defeatedPlayerId?: string;
        dice: number[];
        logText: string;
    }>
    | GameEvent<typeof EVENTS.BLOOD_FROM_STONE_PEEKABOO_RESOLVED, {
        playerId: string;
        sameRoomMonsterId: string;
        lineOfSightMonsterId: string;
        rollTotal: number;
        dice: number[];
        passiveBonus: number;
        mirrorBonus: number;
        success: boolean;
        damageDice?: number[];
        damageAmount?: number;
        logText: string;
    }>
    | GameEvent<typeof EVENTS.UPON_REFLECTION_CURSE_BREAK_ATTEMPTED, {
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
        logText: string;
    }>
    | GameEvent<typeof EVENTS.UPON_REFLECTION_EVENT_HINT_GIVEN, {
        revealerPlayerId: string;
        targetPlayerId: string;
        eventName: string;
        eventText: string;
        turnNumber: number;
        logText: string;
    }>
    | GameEvent<typeof EVENTS.SCENARIO_COMPLETED, { result: BetrayalEndgameResult }>;
