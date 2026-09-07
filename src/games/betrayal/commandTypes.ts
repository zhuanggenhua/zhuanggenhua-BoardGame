import type { Command } from '../../engine/types';
import { BETRAYAL_COMMANDS } from './commands';
import type { BetrayalCorpseLootCommandPayload } from './deathStateReadModel';
import type {
    BetrayalHauntAttackTarget,
    BetrayalTraitKey,
} from './game';
import type { BetrayalHauntSetupQueueEntryId } from './hauntSetupModel';
import type { BetrayalHelpingHandsTrollHandAttackCommandPayload } from './hauntAttackRewardReadModel';
import type { BetrayalPossessionUseCommandPayload } from './possessionUseResolution';
import type { BetrayalExploreRoomCommandPayload } from './roomDiscoveryModel';
import type {
    BetrayalScenarioCardId,
    BetrayalScenarioId,
} from './scenarioConfig';
import type { BetrayalTradePossessionCommandPayload } from './trade';
export type BetrayalCommandType = typeof BETRAYAL_COMMANDS[keyof typeof BETRAYAL_COMMANDS];

export type BetrayalCommandMap = {
    [BETRAYAL_COMMANDS.SELECT_EXPLORER]: { explorerId: string };
    [BETRAYAL_COMMANDS.CONFIRM_EXPLORER]: Record<string, never>;
    [BETRAYAL_COMMANDS.PROPOSE_SCENARIO_CARD]: { candidateId: BetrayalScenarioCardId };
    [BETRAYAL_COMMANDS.CONFIRM_SCENARIO_CARD]: Record<string, never>;
    [BETRAYAL_COMMANDS.START_SCENARIO]: { scenarioId?: BetrayalScenarioId };
    [BETRAYAL_COMMANDS.MOVE_TO_ROOM]: { roomId: string; useSkeletonKey?: boolean };
    [BETRAYAL_COMMANDS.EXPLORE_ROOM]: BetrayalExploreRoomCommandPayload;
    [BETRAYAL_COMMANDS.ROLL_EVENT]: { sourceTitle?: string };
    [BETRAYAL_COMMANDS.USE_POSSESSION]: BetrayalPossessionUseCommandPayload;
    [BETRAYAL_COMMANDS.USE_RABBIT_FOOT]: { cardId?: string; dieIndex?: number };
    [BETRAYAL_COMMANDS.USE_ROLL_REROLL_ITEM]: { cardId?: string; dieIndex?: number };
    [BETRAYAL_COMMANDS.FINALIZE_EVENT_ROLL]: { rollId?: string };
    [BETRAYAL_COMMANDS.RESOLVE_EVENT_CHOICE]: { accept?: boolean; trait?: BetrayalTraitKey; traits?: BetrayalTraitKey[]; targetRoomId?: string; cardId?: string };
    [BETRAYAL_COMMANDS.ACKNOWLEDGE_CARD_RESOLUTION]: { resolutionId?: string };
    [BETRAYAL_COMMANDS.USE_ROOM_EFFECT]: Record<string, never>;
    [BETRAYAL_COMMANDS.TRADE_POSSESSION]: BetrayalTradePossessionCommandPayload;
    [BETRAYAL_COMMANDS.RESOLVE_TRADE_AGREEMENT]: { accept: boolean };
    [BETRAYAL_COMMANDS.LOOT_CORPSE]: BetrayalCorpseLootCommandPayload;
    [BETRAYAL_COMMANDS.END_TURN]: Record<string, never>;
    [BETRAYAL_COMMANDS.ACKNOWLEDGE_RECENT_ROLL]: Record<string, never>;
    [BETRAYAL_COMMANDS.ACKNOWLEDGE_TURN_END_ROLL]: Record<string, never>;
    [BETRAYAL_COMMANDS.RESOLVE_DAMAGE_ALLOCATION]: { traits?: BetrayalTraitKey[]; useBrooch?: boolean };
    [BETRAYAL_COMMANDS.HAUNT_ATTACK]: {
        target: BetrayalHauntAttackTarget;
        targetPlayerId?: string;
        targetMonsterId?: string;
        targetRoomId?: string;
        weaponCardId?: string;
    };
    [BETRAYAL_COMMANDS.RESOLVE_MONSTER_DAMAGE]: {
        monsterId?: string;
        damageAmount?: number;
        damageTrait?: BetrayalTraitKey;
    };
    [BETRAYAL_COMMANDS.RESOLVE_MONSTER_TURN_START]: { monsterId?: string };
    [BETRAYAL_COMMANDS.ROLL_MONSTER_MOVEMENT_GROUP]: { groupId?: string };
    [BETRAYAL_COMMANDS.MOVE_MONSTER_TO_ROOM]: { monsterId?: string; roomId?: string };
    [BETRAYAL_COMMANDS.MONSTER_ATTACK_HERO]: { monsterId?: string; targetPlayerId?: string };
    [BETRAYAL_COMMANDS.END_BLOOD_FROM_STONE_MONSTER_TURN]: Record<string, never>;
    [BETRAYAL_COMMANDS.PLACE_BLOOD_FROM_STONE_EXTRA_STONE_CHERUBS]: { roomIds?: string[] };
    [BETRAYAL_COMMANDS.BREAK_MIRROR_CURSE]: { trait?: BetrayalTraitKey; omenId?: string; omenName?: string };
    [BETRAYAL_COMMANDS.GIVE_MIRROR_HINT]: { eventName?: string; targetPlayerId?: string };
    [BETRAYAL_COMMANDS.RESOLVE_HELPING_HANDS_ATTACK_REWARD]: { choice?: 'damage' | 'steal'; cardId?: string };
    [BETRAYAL_COMMANDS.MOVE_HELPING_HANDS_TROLL_HAND]: { monsterId?: string; roomId?: string };
    [BETRAYAL_COMMANDS.HELPING_HANDS_TROLL_HAND_ATTACK]: BetrayalHelpingHandsTrollHandAttackCommandPayload;
    [BETRAYAL_COMMANDS.END_HELPING_HANDS_MONSTER_TURN]: Record<string, never>;
    [BETRAYAL_COMMANDS.LEARN_ABOUT_JACK]: Record<string, never>;
    [BETRAYAL_COMMANDS.STUDY_EXORCISM]: Record<string, never>;
    [BETRAYAL_COMMANDS.EXORCISE_JACK]: Record<string, never>;
    [BETRAYAL_COMMANDS.STUDY_MUMMY_NAME]: Record<string, never>;
    [BETRAYAL_COMMANDS.LEARN_MUMMY_BANISHMENT]: Record<string, never>;
    [BETRAYAL_COMMANDS.BANISH_MUMMY]: Record<string, never>;
    [BETRAYAL_COMMANDS.PICK_UP_MUMMY_GIRL]: Record<string, never>;
    [BETRAYAL_COMMANDS.GIVE_GIRL_TO_MUMMY]: Record<string, never>;
    [BETRAYAL_COMMANDS.GIVE_OMEN_TO_MUMMY]: { cardId?: string };
    [BETRAYAL_COMMANDS.RESOLVE_MUMMY_ATTACK_REWARD]: { choice?: 'damage' | 'steal'; cardId?: string };
    [BETRAYAL_COMMANDS.SEARCH_FOR_CURE]: { trait?: Extract<BetrayalTraitKey, 'knowledge' | 'sanity'> };
    [BETRAYAL_COMMANDS.CURE_THE_DUST]: { trait?: BetrayalTraitKey };
    [BETRAYAL_COMMANDS.REQUEST_SICKNESS_EXCHANGE]: { targetPlayerId?: string };
    [BETRAYAL_COMMANDS.RESOLVE_SICKNESS_EXCHANGE]: { accept: boolean };
    [BETRAYAL_COMMANDS.CONFIRM_HAUNT_SETUP_ENTRY]: { entryId?: BetrayalHauntSetupQueueEntryId };
    [BETRAYAL_COMMANDS.TAKE_PHOTO]: { targetPlayerId?: string; trait?: BetrayalTraitKey };
    [BETRAYAL_COMMANDS.SMASH_MAGIC_CAMERA]: Record<string, never>;
    [BETRAYAL_COMMANDS.PHANTOM_PHOTOGRAPHER_ATTACK]: { monsterId?: string; targetPlayerId?: string };
    [BETRAYAL_COMMANDS.PLAY_PEEKABOO]: { sameRoomMonsterId?: string; lineOfSightMonsterId?: string };
    [BETRAYAL_COMMANDS.COMPLETE_SCENARIO]: Record<string, never>;
};

export type BetrayalCommand = {
    [Type in keyof BetrayalCommandMap]: Command<Type & string, BetrayalCommandMap[Type]>
}[keyof BetrayalCommandMap];
