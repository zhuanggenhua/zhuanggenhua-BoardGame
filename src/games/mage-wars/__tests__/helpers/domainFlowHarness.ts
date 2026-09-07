import { createInitialSystemState, executePipeline } from '../../../../engine/pipeline';
import { FLOW_COMMANDS, type PhaseExitResult } from '../../../../engine/systems/FlowSystem';
import {
    getCurrentInteractionData,
    getCurrentInteractionSummary,
    getPromptOption as getEnginePromptOption,
    getPromptOptions as getEnginePromptOptions,
} from '../../../../engine/testing/interactionTestFacade';
import type { Command, MatchState, RandomFn } from '../../../../engine/types';
import { MageWarsDomain, MAGE_WARS_COMMANDS } from '../../domain';
import {
    getFormalStartingZoneIdFromConfig,
    getPresetSpellbookCardIdsFromConfig,
    getPresetSpellbookCountFromConfig,
    getPresetSpellbookEntriesFromConfig,
} from '../../data/configPackage';
import {
    ARENA_ZONE_IDS,
    MAGE_IDS,
} from '../../domain/ids';
import type {
    MageWarsArenaObjectState,
    MageWarsCommand,
    MageWarsCore,
    MageWarsEvent,
    MageWarsPhase,
} from '../../domain/types';
import { engineConfig } from '../../game';

export const playerIds = ['0', '1'];
export const PLAYER_ZERO_START_ZONE = getFormalStartingZoneIdFromConfig(0);
export const PLAYER_ONE_START_ZONE = getFormalStartingZoneIdFromConfig(1);

export const fixedRandom: RandomFn = {
    random: () => 0.5,
    d: () => 3,
    range: (min: number) => min,
    shuffle: <T,>(array: T[]) => [...array],
};

export const CAT_ATTACK_LINE = '利爪：快速近战 2 骰；冲锋+2';
export const CAT_ATTACK_WITH_DEFENSE_LINE = '利爪：快速近战 2 骰；防御图标 `8+ / 1x`；冲锋+2';

export type MageWarsPromptData = Record<string, unknown> & {
    sourceId?: string;
    options?: MageWarsPromptOption[];
    ai?: { decisions?: unknown[] };
    choiceRequest?: unknown;
};

export type MageWarsPromptOption = {
    id: string;
    label?: string;
    value?: Record<string, unknown>;
};

export type MageWarsPrompt = {
    id: string;
    kind?: string;
    playerId?: string;
    sourceId?: string;
    data: MageWarsPromptData;
};

export const beastmasterSpellIds = (): number[] => getPresetSpellbookCardIdsFromConfig(MAGE_IDS.BEASTMASTER_APPRENTICE);

export function setupState(phase?: MageWarsPhase): MatchState<MageWarsCore> {
    const sys = createInitialSystemState(playerIds, engineConfig.systems, 'local:mage-wars-domain-flow');
    const effectivePhase = phase ?? 'reset';
    const core = MageWarsDomain.setup(playerIds, fixedRandom);
    return {
        core: {
            ...core,
            // 单玩家领域夹具预先视为对手已完成当前准备阶段，保留既有单命令断言；正式联机仍要求双方真实点击完成。
            phaseReadyPlayerIds: effectivePhase === 'planning' ? [] : ['1'],
        },
        sys: phase ? { ...sys, phase } : sys,
    };
}

export function withPlayerInZone(
    core: MageWarsCore,
    playerId: string,
    zoneId: typeof ARENA_ZONE_IDS[keyof typeof ARENA_ZONE_IDS],
): MageWarsCore {
    return {
        ...core,
        players: {
            ...core.players,
            [playerId]: {
                ...core.players[playerId],
                mageZoneId: zoneId,
            },
        },
        arena: core.arena.map((zone) => {
            const withoutPlayer = zone.occupantIds.filter((occupantId) => occupantId !== playerId);
            return zone.id === zoneId
                ? { ...zone, occupantIds: [...withoutPlayer, playerId] }
                : { ...zone, occupantIds: withoutPlayer };
        }),
    };
}

export function withArenaObject(core: MageWarsCore, object: MageWarsArenaObjectState): MageWarsCore {
    return {
        ...core,
        objects: {
            ...core.objects,
            [object.id]: object,
        },
        arena: core.arena.map((zone) => {
            if (zone.id !== object.zoneId) return zone;
            return {
                ...zone,
                objectIds: zone.objectIds.includes(object.id)
                    ? zone.objectIds
                    : [...zone.objectIds, object.id],
                conjurationIds: object.kind === 'conjuration' && !zone.conjurationIds.includes(object.id)
                    ? [...zone.conjurationIds, object.id]
                    : zone.conjurationIds,
            };
        }),
    };
}

export function withArenaObjectDisplayText(
    core: MageWarsCore,
    objectId: string,
    rulesText: string,
): MageWarsCore {
    const object = core.objects[objectId];
    if (!object) return core;
    return {
        ...core,
        objects: {
            ...core.objects,
            [objectId]: {
                ...object,
                attackOrTraitLine: undefined,
                rulesText,
            },
        },
    };
}

export function withCurrentPlayer(core: MageWarsCore, playerId: string): MageWarsCore {
    return {
        ...core,
        currentPlayerId: playerId,
    };
}

export function withPlayerMage(
    core: MageWarsCore,
    playerId: string,
    mageId: typeof MAGE_IDS[keyof typeof MAGE_IDS],
): MageWarsCore {
    const spellbookEntries = getPresetSpellbookEntriesFromConfig(mageId);
    return {
        ...core,
        players: {
            ...core.players,
            [playerId]: {
                ...core.players[playerId],
                mageId,
                spellbookEntries,
                spellbookCount: getPresetSpellbookCountFromConfig(mageId),
            },
        },
    };
}

export function makeArenaObject(
    id: string,
    ownerId: string,
    zoneId: typeof ARENA_ZONE_IDS[keyof typeof ARENA_ZONE_IDS],
    overrides: Partial<MageWarsArenaObjectState> = {},
): MageWarsArenaObjectState {
    return {
        id,
        kind: 'creature',
        ownerId,
        sourceSpellCardId: 2906,
        sourceObjectId: 'spell-card-2906',
        name: ownerId === '0' ? '野性山猫' : '敌方生物',
        zoneId,
        life: 4,
        damage: 0,
        armor: 0,
        actionReady: true,
        guarding: false,
        statusTokens: {},
        attackOrTraitLine: CAT_ATTACK_LINE,
        ...overrides,
    };
}

export function makeVisibleEnchantmentObject(
    id: string,
    ownerId: string,
    zoneId: typeof ARENA_ZONE_IDS[keyof typeof ARENA_ZONE_IDS],
    overrides: Partial<MageWarsArenaObjectState> = {},
): MageWarsArenaObjectState {
    return makeArenaObject(id, ownerId, zoneId, {
        kind: 'enchantment',
        sourceSpellCardId: 1800,
        sourceObjectId: 'spell-card-1800',
        name: '剧痛难当',
        life: 1,
        damage: 0,
        armor: 0,
        actionReady: false,
        typeLine: '结界 / 诅咒',
        attackOrTraitLine: undefined,
        rulesText: '每当本生物进行非法术远程或近战攻击时，少投掷2颗攻击骰子。',
        revealed: true,
        ...overrides,
    });
}

export function makeCounterstrikeEnchantmentObject(
    id: string,
    ownerId: string,
    zoneId: typeof ARENA_ZONE_IDS[keyof typeof ARENA_ZONE_IDS],
    anchoredToObjectId: string,
): MageWarsArenaObjectState {
    return makeVisibleEnchantmentObject(id, ownerId, zoneId, {
        sourceSpellCardId: 1903,
        sourceObjectId: 'spell-card-1903',
        name: '反戈一击',
        typeLine: '结界 / 战争图标',
        attackOrTraitLine: undefined,
        rulesText: undefined,
        anchoredToObjectId,
    });
}

export function makeVampiricEnchantmentObject(
    id: string,
    ownerId: string,
    zoneId: typeof ARENA_ZONE_IDS[keyof typeof ARENA_ZONE_IDS],
    anchoredToObjectId: string,
): MageWarsArenaObjectState {
    return makeVisibleEnchantmentObject(id, ownerId, zoneId, {
        sourceSpellCardId: 1910,
        sourceObjectId: 'spell-card-1910',
        name: '鲜血贪噬',
        typeLine: '结界 / 吸血',
        attackOrTraitLine: undefined,
        rulesText: undefined,
        anchoredToObjectId,
    });
}

export function makeMentalCalmEnchantmentObject(
    id: string,
    ownerId: string,
    zoneId: typeof ARENA_ZONE_IDS[keyof typeof ARENA_ZONE_IDS],
    anchoredToObjectId: string,
): MageWarsArenaObjectState {
    return makeVisibleEnchantmentObject(id, ownerId, zoneId, {
        sourceSpellCardId: 1912,
        sourceObjectId: 'spell-card-1912',
        name: '心灵安抚',
        typeLine: '结界 / 精神',
        attackOrTraitLine: undefined,
        rulesText: undefined,
        anchoredToObjectId,
    });
}

export function makeSuppressionCloakEquipmentObject(
    id: string,
    ownerId: string,
    zoneId: typeof ARENA_ZONE_IDS[keyof typeof ARENA_ZONE_IDS],
): MageWarsArenaObjectState {
    return makeArenaObject(id, ownerId, zoneId, {
        kind: 'equipment',
        sourceSpellCardId: 3705,
        sourceObjectId: 'spell-card-3705',
        name: '抑制斗篷',
        actionReady: false,
        attackOrTraitLine: undefined,
        rulesText: undefined,
        combatTraitsSource: 'config',
        anchoredToPlayerId: ownerId,
    });
}

export function makeDemonCuirassEquipmentObject(
    id: string,
    ownerId: string,
    zoneId: typeof ARENA_ZONE_IDS[keyof typeof ARENA_ZONE_IDS],
): MageWarsArenaObjectState {
    return makeArenaObject(id, ownerId, zoneId, {
        kind: 'equipment',
        sourceSpellCardId: 3700,
        sourceObjectId: 'spell-card-3700',
        name: '恶魔胸甲',
        actionReady: false,
        attackOrTraitLine: undefined,
        rulesText: undefined,
        combatTraitsSource: 'config',
        anchoredToPlayerId: ownerId,
    });
}

export function runCommand(
    state: MatchState<MageWarsCore>,
    command: MageWarsCommand | Command<typeof FLOW_COMMANDS.ADVANCE_PHASE, Record<string, never>>,
    random: RandomFn = fixedRandom,
) {
    return executePipeline(
        {
            domain: engineConfig.domain,
            systems: engineConfig.systems,
            systemsConfig: engineConfig.systemsConfig,
        },
        state,
        command as unknown as MageWarsCommand,
        random,
        playerIds,
    );
}

export function validateCommand(
    state: MatchState<MageWarsCore>,
    command: MageWarsCommand,
): string | undefined {
    return MageWarsDomain.validate(state, command).error;
}

export function readMageWarsPhaseExitEvents(result: MageWarsEvent[] | PhaseExitResult | void): MageWarsEvent[] {
    if (!result) return [];
    return (Array.isArray(result) ? result : result.events ?? []) as MageWarsEvent[];
}

export function planCommand(spellCardIds: number[], playerId = '0'): MageWarsCommand {
    return {
        type: MAGE_WARS_COMMANDS.PLAN_SPELLS,
        playerId,
        payload: { spellCardIds },
    };
}

export function actionLogKinds(state: MatchState<MageWarsCore>): string[] {
    return state.sys.actionLog.entries.map((entry) => entry.kind);
}

export function getCurrentPrompt(state: MatchState<MageWarsCore>): MageWarsPrompt | undefined {
    const summary = getCurrentInteractionSummary(state);
    if (!summary.id) return undefined;
    const data = getCurrentInteractionData<MageWarsPromptData, MageWarsCore>(state) ?? {};
    return {
        id: summary.id,
        ...(summary.kind ? { kind: summary.kind } : {}),
        ...(summary.playerId ? { playerId: summary.playerId } : {}),
        ...(summary.sourceId ? { sourceId: summary.sourceId } : {}),
        data,
    };
}

export function getSimpleChoicePrompt(
    state: MatchState<MageWarsCore>,
    expectedSourceId?: string,
): MageWarsPrompt {
    const prompt = getCurrentPrompt(state);
    if (!prompt) {
        throw new Error('Expected a simple-choice prompt, but no prompt is active');
    }
    if (prompt.kind !== 'simple-choice') {
        throw new Error(`Expected a simple-choice prompt, but found ${prompt.kind ?? 'unknown'}`);
    }
    if (expectedSourceId && prompt.sourceId !== expectedSourceId) {
        throw new Error(`Expected prompt source ${expectedSourceId}, but found ${prompt.sourceId ?? 'none'}`);
    }
    return {
        ...prompt,
        data: {
            ...prompt.data,
            sourceId: prompt.sourceId ?? prompt.data.sourceId,
            options: getPromptOptions(state),
        },
    };
}

export function getPromptSourceId(state: MatchState<MageWarsCore>): string | undefined {
    return getCurrentInteractionSummary(state).sourceId;
}

export function getPromptOptions(state: MatchState<MageWarsCore>): MageWarsPromptOption[] {
    return getEnginePromptOptions(state);
}

export function getPromptOption(
    state: MatchState<MageWarsCore>,
    optionId: string,
): MageWarsPromptOption {
    return getEnginePromptOption(state, (option) => option.id === optionId, optionId);
}

export function getPromptInteractionId(
    state: MatchState<MageWarsCore>,
    expectedSourceId?: string,
): string {
    const prompt = expectedSourceId
        ? getSimpleChoicePrompt(state, expectedSourceId)
        : getCurrentPrompt(state);
    if (!prompt) {
        throw new Error('Expected an active prompt id, but no prompt is active');
    }
    return prompt.id;
}

export function expectNoPrompt(state: MatchState<MageWarsCore>): void {
    const prompt = getCurrentPrompt(state);
    if (prompt) {
        throw new Error(`Expected no active prompt, but found ${prompt.sourceId ?? prompt.kind ?? prompt.id}`);
    }
}

export function withPreparedPlayerMage(
    core: MageWarsCore,
    playerId: string,
    mageId: typeof MAGE_IDS[keyof typeof MAGE_IDS],
    preparedSpellCardIds: number[],
    mana = 20,
): MageWarsCore {
    const mageCore = withPlayerMage(core, playerId, mageId);
    return {
        ...mageCore,
        players: {
            ...mageCore.players,
            [playerId]: {
                ...mageCore.players[playerId],
                mana,
                actionReady: true,
                quickcastReady: true,
                preparedSpellCardIds,
                preparedSpellSlots: preparedSpellCardIds.length,
            },
        },
    };
}

export function castObjectSpellCommand(
    spellCardId: number,
    manaCost: number,
    targetObjectId: string,
): MageWarsCommand {
    return {
        type: MAGE_WARS_COMMANDS.CAST_SPELL,
        playerId: '0',
        payload: {
            spellCardId,
            manaCost,
            targetObjectId,
        },
    };
}
