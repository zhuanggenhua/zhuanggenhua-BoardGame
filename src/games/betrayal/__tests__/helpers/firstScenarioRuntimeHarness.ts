import { expect } from 'vitest';
import type { RandomFn } from '../../../../engine/types';
import {
    acknowledgePendingCardResolutions,
    acknowledgePendingEventRollResolution,
    applyBetrayalCommand,
    BETRAYAL_FIXED_RANDOM,
    createBetrayalCommand,
    createBetrayalScriptedRandom,
    createCorpseLootReadyCore,
    createCrimsonJackHauntCore,
    createDogTradeReadyCore,
    createExchangeReadyCore,
    createFirstScenarioHauntCore,
    createFirstScenarioReadyToExorciseCore,
    createFirstScenarioReadyToLearnAboutJackCore,
    createFirstScenarioReadyToStudyExorcismCore,
    createDustFeverishAttackReadyCore,
    createDustFeverishNaturalMonsterTurnBeforeRollCore,
    createJackSpiritReviveReadyCore,
    createJackSpiritNaturalMonsterTurnBeforeRollCore,
    createJackSpiritMovementRollReadyCore,
    createJackSpiritPostReviveAttackReadyCore,
    createFirstScenarioReadyToTraitorVictoryCore,
    createStartedFirstScenarioCore,
    createTradeReadyCore,
    playMummyScenarioToSurvivorVictory,
    playMummyScenarioToTraitorVictory,
    playFirstScenarioToSurvivorVictory,
    playFirstScenarioToTraitorVictory,
    setScenarioTestTurnMovement,
} from '../../testing/firstScenarioTestUtils';
import {
    BetrayalDomain,
    EXPLORER_CATALOG,
    createBetrayalMonsterFromDefinition,
    getBetrayalMonsterDefinition,
    resolveUseEffect,
    type BetrayalDeckKind,
    type BetrayalCore,
    type UseEffectProfile,
} from '../../game';
import { BETRAYAL_COMMANDS } from '../../commands';
import {
    canUseBookForPendingEventRoll,
    canUseHolySymbolForDiscovery,
    canUseIdolToSkipEvent,
    canUseRecentRollRerollItemForRecentRoll,
    resolveBetrayalPossessionSpecialActionStatus,
    resolveRecentRollRerollSelectableDieIndices,
} from '../../possessionActionReadModel';
import {
    resolveBetrayalDeathStateSummary,
    resolveCorpseLootTargets,
} from '../../deathStateReadModel';
import {
    BETRAYAL_DISCOVERY_POOLS,
    BETRAYAL_SCENARIO_CARD_IDS,
    BETRAYAL_SCENARIO_CONFIGS,
    DEFAULT_BETRAYAL_SCENARIO_CARD_ID,
    isBetrayalEventRuntimeSupported,
    type BetrayalTraitKey,
    type BetrayalUseEffectSeed,
} from '../../scenarioConfig';
import { resolvePossessionAtlasVisual } from '../../possessionAtlas';
import { resolveInventoryEffectId } from '../../possessionEffects';
import { BETRAYAL_ROOM_TILE_VISUALS } from '../../roomAtlas';
import { EVENT_FRONT_FRAME_BY_TITLE } from '../../discoveryAtlas';
import { resolveBetrayalTradeCardStatus } from '../../trade';
import {
    isBetrayalRoomInLineOfSight,
    resolveBetrayalLineOfSightRoomIds,
} from '../../roomMapModel';
import { resolveAttackWeaponCardStatuses } from '../../attackRules';

export {
    acknowledgePendingCardResolutions,
    acknowledgePendingEventRollResolution,
    applyBetrayalCommand,
    BETRAYAL_FIXED_RANDOM,
    createBetrayalCommand,
    createBetrayalScriptedRandom,
    createCorpseLootReadyCore,
    createCrimsonJackHauntCore,
    createDogTradeReadyCore,
    createExchangeReadyCore,
    createFirstScenarioHauntCore,
    createFirstScenarioReadyToExorciseCore,
    createFirstScenarioReadyToLearnAboutJackCore,
    createFirstScenarioReadyToStudyExorcismCore,
    createDustFeverishAttackReadyCore,
    createDustFeverishNaturalMonsterTurnBeforeRollCore,
    createJackSpiritReviveReadyCore,
    createJackSpiritNaturalMonsterTurnBeforeRollCore,
    createJackSpiritMovementRollReadyCore,
    createJackSpiritPostReviveAttackReadyCore,
    createFirstScenarioReadyToTraitorVictoryCore,
    createStartedFirstScenarioCore,
    createTradeReadyCore,
    playMummyScenarioToSurvivorVictory,
    playMummyScenarioToTraitorVictory,
    playFirstScenarioToSurvivorVictory,
    playFirstScenarioToTraitorVictory,
    setScenarioTestTurnMovement,
    BETRAYAL_COMMANDS,
    BetrayalDomain,
    EXPLORER_CATALOG,
    isBetrayalRoomInLineOfSight,
    resolveBetrayalLineOfSightRoomIds,
    resolveBetrayalTradeCardStatus,
    resolveAttackWeaponCardStatuses,
    createBetrayalMonsterFromDefinition,
    getBetrayalMonsterDefinition,
    resolveUseEffect,
    canUseBookForPendingEventRoll,
    canUseHolySymbolForDiscovery,
    canUseIdolToSkipEvent,
    canUseRecentRollRerollItemForRecentRoll,
    resolveBetrayalDeathStateSummary,
    resolveBetrayalPossessionSpecialActionStatus,
    resolveCorpseLootTargets,
    resolveRecentRollRerollSelectableDieIndices,
    BETRAYAL_DISCOVERY_POOLS,
    BETRAYAL_SCENARIO_CARD_IDS,
    BETRAYAL_SCENARIO_CONFIGS,
    DEFAULT_BETRAYAL_SCENARIO_CARD_ID,
    isBetrayalEventRuntimeSupported,
    resolvePossessionAtlasVisual,
    resolveInventoryEffectId,
    BETRAYAL_ROOM_TILE_VISUALS,
    EVENT_FRONT_FRAME_BY_TITLE,
};

export type {
    RandomFn,
    BetrayalDeckKind,
    BetrayalCore,
    UseEffectProfile,
    BetrayalTraitKey,
    BetrayalUseEffectSeed,
};

export function findTestExplorer(core: BetrayalCore, playerId: string) {
    const explorer = [core.currentExplorer, ...core.otherExplorers].find((candidate) => candidate.playerId === playerId);
    if (!explorer) {
        throw new Error(`山屋测试夹具缺少玩家 ${playerId}`);
    }
    return explorer;
}

export function finalizePendingEventRollForTest(
    core: BetrayalCore,
    random: RandomFn = BETRAYAL_FIXED_RANDOM,
): BetrayalCore {
    const pending = core.pendingEventRollResolution;
    expect(pending).toBeTruthy();
    return acknowledgePendingEventRollResolution(core, 100, random);
}

export function declinePendingEventSymbolSkipForTest(core: BetrayalCore): BetrayalCore {
    if (core.pendingEventChoice?.sourceKind !== 'event-symbol-skip') {
        return core;
    }
    return applyBetrayalCommand(
        core,
        BETRAYAL_COMMANDS.RESOLVE_EVENT_CHOICE,
        core.pendingEventChoice.playerId,
        { accept: false },
        100,
        createBetrayalScriptedRandom(1, 2, 2),
    );
}

export function markRecentEventRollPendingFinalizationForTest(
    core: BetrayalCore,
    effect: UseEffectProfile = { mode: 'none', recommendedAction: 'endTurn' },
): void {
    expect(core.recentRoll).toBeTruthy();
    expect(core.recentRoll?.kind === 'eventTraitCheck' || core.recentRoll?.kind === 'eventDiceRoll').toBe(true);
    core.pendingEventRollResolution = {
        rollId: core.recentRoll!.id,
        playerId: core.recentRoll!.playerId,
        sourceTitle: core.recentRoll!.sourceTitle,
        effect,
    };
}

export function selectDefaultOpeningExplorers(core: BetrayalCore): BetrayalCore {
    return core.playerIds.reduce((draft, playerId, index) => {
        let next = applyBetrayalCommand(draft, BETRAYAL_COMMANDS.SELECT_EXPLORER, playerId, {
            explorerId: EXPLORER_CATALOG[index % EXPLORER_CATALOG.length]!.explorerId,
        });
        next = applyBetrayalCommand(next, BETRAYAL_COMMANDS.CONFIRM_EXPLORER, playerId, {});
        return next;
    }, core);
}

export function confirmScenarioCardForAllPlayers(core: BetrayalCore): BetrayalCore {
    return core.playerIds.reduce(
        (draft, playerId) => applyBetrayalCommand(draft, BETRAYAL_COMMANDS.CONFIRM_SCENARIO_CARD, playerId, {}),
        core,
    );
}

export function acknowledgeRecentRollForAllPlayers(core: BetrayalCore): BetrayalCore {
    expect(core.recentRoll).toBeTruthy();
    const recentRoll = core.recentRoll!;
    const requiredPlayerIds = recentRoll.requiredPlayerIds?.length
        ? recentRoll.requiredPlayerIds
        : core.playerIds.length > 0
            ? core.playerIds
            : [recentRoll.playerId];
    return requiredPlayerIds.reduce((draft, playerId) => {
        if (!draft.recentRoll || draft.recentRoll.acknowledgedPlayerIds?.includes(playerId)) {
            return draft;
        }
        return applyBetrayalCommand(draft, BETRAYAL_COMMANDS.ACKNOWLEDGE_RECENT_ROLL, playerId, {});
    }, core);
}

export function startFirstScenarioFromCharacterSelect(core: BetrayalCore): BetrayalCore {
    let next = selectDefaultOpeningExplorers(core);
    next = confirmScenarioCardForAllPlayers(next);
    return applyBetrayalCommand(next, BETRAYAL_COMMANDS.START_SCENARIO, next.playerIds[0] ?? '0', {});
}

export function isMagicCameraTestCard(card: BetrayalCore['currentExplorer']['inventory'][number]): boolean {
    return card.id === 'camera' || card.name === '魔法相机';
}

export function removeMagicCameraFromTestExplorer(
    explorer: BetrayalCore['currentExplorer'],
): BetrayalCore['currentExplorer'] {
    return {
        ...explorer,
        inventory: explorer.inventory.filter((card) => !isMagicCameraTestCard(card)),
    };
}

export function activateTestExplorer(core: BetrayalCore, playerId: string): void {
    const explorers = [core.currentExplorer, ...core.otherExplorers].map((explorer) => ({
        ...explorer,
        traits: { ...explorer.traits },
        traitTracks: Object.fromEntries(
            Object.entries(explorer.traitTracks).map(([trait, track]) => [
                trait,
                { ...track, values: [...track.values] },
            ]),
        ) as BetrayalCore['currentExplorer']['traitTracks'],
        inventory: explorer.inventory.map((card) => ({ ...card })),
    }));
    const active = explorers.find((explorer) => explorer.playerId === playerId);
    if (!active) {
        throw new Error(`山屋测试夹具不能切到缺失玩家 ${playerId}`);
    }
    core.currentPlayer = playerId;
    core.currentExplorer = active;
    core.otherExplorers = explorers.filter((explorer) => explorer.playerId !== playerId);
    core.activeRoomId = active.roomId;
    core.currentExplorerTraits = { ...active.traits };
    core.currentExplorerInventory = active.inventory.map((card) => ({ ...card }));
    core.turnStartInventoryCardIds = active.inventory.map((card) => card.id);
}

export function setTestExplorerRoom(core: BetrayalCore, playerId: string, roomId: string): void {
    const explorer = findTestExplorer(core, playerId);
    explorer.roomId = roomId;
    if (core.currentExplorer.playerId === playerId) {
        core.activeRoomId = roomId;
        core.currentExplorerRoomId = roomId;
    }
}

export function discoverTestRoom(core: BetrayalCore, roomId: string, name: string): void {
    core.rooms = core.rooms.map((room) => (
        room.id === roomId
            ? {
                ...room,
                name,
                state: 'discovered',
                hint: `${name}测试房间`,
                tags: ['测试'],
                discoveryReward: null,
                visualId: 'foyer',
            }
            : room
    ));
}

export function createMysticElevatorRoomEffectReadyCore(): BetrayalCore {
    const core = createStartedFirstScenarioCore();
    const upperDestination = core.rooms.find((room) => room.id === 'upper-north');
    const mysticElevator = BETRAYAL_DISCOVERY_POOLS.roomDiscoveryByFloor.upper.find(
        (room) => room.visualId === 'mysticElevator',
    );
    if (!mysticElevator || !upperDestination) {
        throw new Error('测试夹具缺少神秘电梯房间模板');
    }

    // 图面只有北门；在上层北侧放置时旋转为南门，连接上层平台。
    core.rooms = [
        ...core.rooms.map((room) => (
        room.id === 'upper-north'
            ? {
                ...room,
                name: mysticElevator.name,
                hint: mysticElevator.hint,
                tags: [...mysticElevator.tags],
                visualId: mysticElevator.visualId,
                state: 'discovered',
                discoveryReward: null,
                enterEffect: mysticElevator.enterEffect,
                endTurnEffect: mysticElevator.endTurnEffect,
            }
            : room
        )),
        {
            ...upperDestination,
            id: 'upper-elevator-destination',
            name: '上层电梯测试目标',
            x: upperDestination.x + 1,
        },
    ];
    setTestExplorerRoom(core, '0', 'upper-north');
    core.turnEndedByDiscovery = false;
    setScenarioTestTurnMovement(core, 2);
    return core;
}

export function activateBloodFromStoneMonsterTurn(core: BetrayalCore, controllerPlayerId = '0'): void {
    activateTestExplorer(core, controllerPlayerId);
    core.scenarioRuntime.hauntCardNumber = 5;
    core.scenarioRuntime.traitorPlayerId = null;
    core.scenarioRuntime.bloodFromStone = {
        monsterTurnAfterPlayerId: controllerPlayerId,
        activeMonsterTurn: true,
        monsterTurnControllerPlayerId: controllerPlayerId,
    };
    core.activePlayerId = controllerPlayerId;
    core.recommendedAction = 'endTurn';
}

export function setTestExplorerTraits(
    core: BetrayalCore,
    playerId: string,
    traits: Partial<Record<BetrayalTraitKey, number>>,
): void {
    if (core.currentExplorer.playerId === playerId) {
        core.currentExplorer = {
            ...core.currentExplorer,
            traits: { ...core.currentExplorer.traits, ...traits },
            inventory: [],
        };
        core.currentExplorerTraits = { ...core.currentExplorer.traits };
        core.currentExplorerInventory = [];
        return;
    }

    core.otherExplorers = core.otherExplorers.map((explorer) => (
        explorer.playerId === playerId
            ? {
                ...explorer,
                traits: { ...explorer.traits, ...traits },
                inventory: [],
            }
            : explorer
    ));
}

export function setTestExplorerInventory(
    core: BetrayalCore,
    playerId: string,
    inventory: BetrayalCore['currentExplorer']['inventory'],
    availableAtTurnStart = true,
): void {
    const nextInventory = inventory.map((card) => ({ ...card }));
    if (core.currentExplorer.playerId === playerId) {
        core.currentExplorer.inventory = nextInventory;
        core.currentExplorerInventory = nextInventory.map((card) => ({ ...card }));
        if (availableAtTurnStart) {
            core.turnStartInventoryCardIds = nextInventory.map((card) => card.id);
        }
        return;
    }

    core.otherExplorers = core.otherExplorers.map((explorer) => (
        explorer.playerId === playerId
            ? { ...explorer, inventory: nextInventory.map((card) => ({ ...card })) }
            : explorer
    ));
}

export function setTestOmenInventoryForHauntRoll(core: BetrayalCore, playerId = '0', count = 4): void {
    setTestExplorerInventory(
        core,
        playerId,
        Array.from({ length: count }, (_, index) => ({
            id: `test-omen-${index + 1}`,
            name: `测试预兆${index + 1}`,
            kind: 'omen' as const,
        })),
    );
}

export function setTestRoomDiscoveryDeck(
    core: BetrayalCore,
    deck: BetrayalCore['roomDiscoveryDeck'],
): void {
    const clonedDeck = deck.map((entry) => ({
        floor: entry.floor,
        room: {
            ...entry.room,
            tags: [...entry.room.tags],
            doorways: [...entry.room.doorways],
        },
    }));
    core.roomDiscoveryDeck = clonedDeck;
    core.roomDiscoveryOrderByFloor = {
        ground: clonedDeck.filter((entry) => entry.floor === 'ground').map((entry) => ({ ...entry.room })),
        upper: clonedDeck.filter((entry) => entry.floor === 'upper').map((entry) => ({ ...entry.room })),
        basement: clonedDeck.filter((entry) => entry.floor === 'basement').map((entry) => ({ ...entry.room })),
    };
}

export type TestRoomFloor = BetrayalCore['roomDiscoveryDeck'][number]['floor'];

export const TEST_ROOM_VISUAL_ID_BY_DISCOVERY_SYMBOL: Record<BetrayalDeckKind, Record<TestRoomFloor, string>> = {
    event: {
        ground: 'kitchen',
        upper: 'tower',
        basement: 'chasm',
    },
    item: {
        ground: 'vault',
        upper: 'gameRoom',
        basement: 'junkRoom',
    },
    omen: {
        ground: 'observatory',
        upper: 'winterBedroom',
        basement: 'ritualRoom',
    },
};

export function findTestRoomByVisualId(
    floor: TestRoomFloor,
    visualId: string,
): BetrayalCore['roomDiscoveryDeck'][number]['room'] {
    const room = BETRAYAL_DISCOVERY_POOLS.roomDiscoveryByFloor[floor].find(
        (candidate) => candidate.visualId === visualId,
    );
    if (!room) {
        throw new Error(`山屋测试夹具缺少${floor}房间 ${visualId}`);
    }
    return room;
}

export function setNextDiscoverySymbolRoomsForAllFloors(core: BetrayalCore, deckKind: BetrayalDeckKind): void {
    const roomVisualIds = TEST_ROOM_VISUAL_ID_BY_DISCOVERY_SYMBOL[deckKind];
    setTestRoomDiscoveryDeck(
        core,
        (['ground', 'upper', 'basement'] as TestRoomFloor[]).map((floor) => ({
            floor,
            room: findTestRoomByVisualId(floor, roomVisualIds[floor]),
        })),
    );
}

export function setNextEventSymbolRoomForTarget(core: BetrayalCore, targetRoomId: string): void {
    const targetFloor = targetRoomId.startsWith('upper')
        ? 'upper'
        : targetRoomId.startsWith('basement')
            ? 'basement'
            : 'ground';
    setTestRoomDiscoveryDeck(core, [{
        floor: targetFloor,
        room: findTestRoomByVisualId(
            targetFloor,
            TEST_ROOM_VISUAL_ID_BY_DISCOVERY_SYMBOL.event[targetFloor],
        ),
    }]);
}

export function setTestTraitTrack(
    core: BetrayalCore,
    playerId: string,
    trait: BetrayalTraitKey,
    values: number[],
    position: number,
    startPosition = 3,
): void {
    const explorer = findTestExplorer(core, playerId);
    explorer.traitTracks[trait] = {
        trackId: `test-${playerId}-${trait}`,
        values: [...values],
        position,
        startPosition,
        criticalPosition: 0,
        skullPosition: -1,
        maxPosition: values.length - 1,
    };
    explorer.traits[trait] = values[position] ?? 0;
    if (core.currentExplorer.playerId === playerId) {
        core.currentExplorerTraits = { ...core.currentExplorer.traits };
    }
}

export function setHighCapacityPhysicalDamageTracks(
    core: BetrayalCore,
    playerId: string,
    value = 4,
    position = 14,
): void {
    const values = Array.from({ length: position + 2 }, () => value);
    setTestTraitTrack(core, playerId, 'might', values, position, position);
    setTestTraitTrack(core, playerId, 'speed', values, position, position);
}

export function setHighCapacityGeneralDamageTracks(
    core: BetrayalCore,
    playerId: string,
    value = 4,
    position = 14,
): void {
    const values = Array.from({ length: position + 2 }, () => value);
    for (const trait of ['might', 'speed', 'knowledge', 'sanity'] as BetrayalTraitKey[]) {
        setTestTraitTrack(core, playerId, trait, values, position, position);
    }
}

export function setTestExplorerTraitsBelowCatalogStart(core: BetrayalCore, playerId: string): void {
    const explorer = findTestExplorer(core, playerId);
    const template = EXPLORER_CATALOG.find((entry) => entry.explorerId === explorer.explorerId);
    if (!template) {
        throw new Error(`山屋测试夹具缺少探索者模板 ${explorer.explorerId}`);
    }
    for (const trait of ['might', 'speed', 'knowledge', 'sanity'] as BetrayalTraitKey[]) {
        const startValue = template.traits[trait];
        setTestTraitTrack(
            core,
            playerId,
            trait,
            [1, Math.max(1, startValue - 1), startValue, startValue + 1],
            0,
            2,
        );
    }
}

export function traitTrackPosition(core: BetrayalCore, playerId: string, trait: BetrayalTraitKey): number {
    return findTestExplorer(core, playerId).traitTracks[trait].position;
}

export function criticalTraitValues(core: BetrayalCore, playerId: string): Record<BetrayalTraitKey, number> {
    const explorer = findTestExplorer(core, playerId);
    return Object.fromEntries(
        (['might', 'speed', 'knowledge', 'sanity'] as BetrayalTraitKey[]).map((trait) => {
            const track = explorer.traitTracks[trait];
            return [trait, track.values[track.criticalPosition] ?? 0];
        }),
    ) as Record<BetrayalTraitKey, number>;
}

export function traitTrackPositionTotal(
    core: BetrayalCore,
    playerId: string,
    traits: BetrayalTraitKey[],
): number {
    const explorer = findTestExplorer(core, playerId);
    return traits.reduce((total, trait) => total + explorer.traitTracks[trait].position, 0);
}

export function physicalTraitTotal(core: BetrayalCore, playerId: string): number {
    const explorer = findTestExplorer(core, playerId);
    return explorer.traits.might + explorer.traits.speed;
}

export function mentalTraitTotal(core: BetrayalCore, playerId: string): number {
    const explorer = findTestExplorer(core, playerId);
    return explorer.traits.knowledge + explorer.traits.sanity;
}

export function repeatTraitsForPendingDamage(
    core: BetrayalCore,
    traits: BetrayalTraitKey[],
): BetrayalTraitKey[] {
    const pending = core.pendingDamageAllocation;
    if (!pending) {
        return [];
    }
    const explorer = findTestExplorer(core, pending.playerId);
    const assignedTraits: BetrayalTraitKey[] = [];
    let remaining = pending.amount;
    for (const trait of traits) {
        if (remaining <= 0) {
            break;
        }
        if (!pending.allowedTraits.includes(trait)) {
            continue;
        }
        const track = explorer.traitTracks[trait];
        const floorPosition = pending.allowSkull ? track.skullPosition : track.criticalPosition;
        const assignableSteps = Math.max(0, track.position - floorPosition);
        const take = Math.min(remaining, assignableSteps);
        assignedTraits.push(...Array.from({ length: take }, () => trait));
        remaining -= take;
    }
    if (assignedTraits.length !== pending.amount) {
        throw new Error(`山屋测试夹具无法为 ${pending.sourceTitle} 分配 ${pending.amount} 点伤害`);
    }
    return assignedTraits;
}

export function expectPendingDamageForTest(
    core: BetrayalCore,
    expected: Partial<NonNullable<BetrayalCore['pendingDamageAllocation']>>,
): void {
    expect(core.pendingDamageAllocation).toMatchObject(expected);
}

export function resolvePendingDamageForTest(
    core: BetrayalCore,
    traits: BetrayalTraitKey[],
    timestamp = 100,
    deathPreventionRandoms: number[] = [],
): BetrayalCore {
    const acknowledgedCore = core.recentRoll?.kind === 'eventRolledDamage'
        ? acknowledgeRecentRollForAllPlayers(core)
        : core;
    expect(acknowledgedCore.pendingEventRollResolution).toBeNull();
    const pending = acknowledgedCore.pendingDamageAllocation;
    expect(pending).toBeTruthy();
    if (!pending) {
        return acknowledgedCore;
    }
    expect(BetrayalDomain.validate(
        { core: acknowledgedCore, sys: {} as never },
        createBetrayalCommand(BETRAYAL_COMMANDS.RESOLVE_DAMAGE_ALLOCATION, pending.playerId, { traits }),
    ).valid).toBe(true);
    return applyBetrayalCommand(
        acknowledgedCore,
        BETRAYAL_COMMANDS.RESOLVE_DAMAGE_ALLOCATION,
        pending.playerId,
        { traits },
        timestamp,
        deathPreventionRandoms.length > 0
            ? createBetrayalScriptedRandom(...deathPreventionRandoms)
            : BETRAYAL_FIXED_RANDOM,
    );
}

export function resolveCurrentPendingDamageForTest(
    core: BetrayalCore,
    timestamp = 100,
    deathPreventionRandoms: number[] = [],
): BetrayalCore {
    const pending = core.pendingDamageAllocation;
    expect(pending).toBeTruthy();
    if (!pending) {
        return core;
    }
    return resolvePendingDamageForTest(
        core,
        repeatTraitsForPendingDamage(core, pending.allowedTraits),
        timestamp,
        deathPreventionRandoms,
    );
}

export function acknowledgeSingleEventEffectResolution(
    core: BetrayalCore,
    cardName: string,
    expectedTextFragment: string,
): BetrayalCore {
    expect(core.latestDiscovery?.title).toBe(cardName);
    expect(core.latestDiscovery?.resolutionSteps?.some((step) =>
        step.kind === 'event-effect' &&
        step.text.includes(expectedTextFragment),
    )).toBe(true);

    if (core.pendingCardResolutionQueue.length > 0) {
        expect(core.pendingCardResolutionQueue).toHaveLength(1);
        expect(core.pendingCardResolutionQueue[0]).toMatchObject({
            deckKind: 'event',
            cardName,
            stepKind: 'event-effect',
            text: expect.stringContaining(expectedTextFragment),
            index: 1,
            total: 1,
        });
        expect(BetrayalDomain.validate(
            { core, sys: {} as never },
            createBetrayalCommand(BETRAYAL_COMMANDS.END_TURN, core.currentPlayer, {}),
        )).toMatchObject({
            valid: false,
            error: '请先确认当前翻牌结算。',
        });
        const nextCore = acknowledgePendingCardResolutions(core);
        expect(nextCore.pendingCardResolutionQueue).toEqual([]);
        return nextCore;
    }

    if (core.pendingEventRollResolution) {
        expect(core.pendingEventRollResolution.sourceTitle).toBe(cardName);
        expect(BetrayalDomain.validate(
            { core, sys: {} as never },
            createBetrayalCommand(BETRAYAL_COMMANDS.END_TURN, core.currentPlayer, {}),
        )).toMatchObject({
            valid: false,
            error: '请先处理当前事件投掷结果。',
        });
        const nextCore = acknowledgePendingEventRollResolution(core);
        expect(nextCore.pendingEventRollResolution).toBeNull();
        expect(nextCore.pendingCardResolutionQueue).toEqual([]);
        return nextCore;
    }

    expect(core.pendingCardResolutionQueue).toEqual([]);
    expect(core.pendingEventRollResolution).toBeNull();
    return core;
}

export function acknowledgeAnyPendingCardResolutions(core: BetrayalCore): BetrayalCore {
    if (core.pendingCardResolutionQueue.length === 0) {
        return core;
    }
    const nextCore = acknowledgePendingCardResolutions(core);
    expect(nextCore.pendingCardResolutionQueue).toEqual([]);
    return nextCore;
}

export function findConfiguredEventByName(eventName: string): typeof BETRAYAL_DISCOVERY_POOLS.events[number] {
    const event = BETRAYAL_DISCOVERY_POOLS.events.find((candidate) => candidate.name === eventName);
    if (!event) {
        throw new Error(`山屋测试夹具缺少事件牌：${eventName}`);
    }
    return event;
}

export function exploreConfiguredEventByName(
    eventName: string,
    randomResults: number[] = [],
    setupCore?: (core: BetrayalCore) => void,
): BetrayalCore {
    let core = createStartedFirstScenarioCore();
    setHighCapacityGeneralDamageTracks(core, '0');
    setupCore?.(core);
    core.drawOrder = ['event'];
    core.eventOrder = [findConfiguredEventByName(eventName)];
    core.deckCounts.event = core.eventOrder.length;
    setNextEventSymbolRoomForTarget(core, 'ground-north');
    core.currentExplorerTraits = { ...core.currentExplorer.traits };
    core.currentExplorerInventory = [...core.currentExplorer.inventory];

    core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, '0', { roomId: 'hallway' });
    return applyBetrayalCommand(
        core,
        BETRAYAL_COMMANDS.EXPLORE_ROOM,
        '0',
        { roomId: 'ground-north' },
        100,
        createBetrayalScriptedRandom(...randomResults),
    );
}

export function triggerUponReflectionHaunt(setupCore?: (core: BetrayalCore) => void): BetrayalCore {
    let core = exploreConfiguredEventByName('怪异的镜子', [], (draft) => {
        setTestOmenInventoryForHauntRoll(draft);
        setupCore?.(draft);
    });
    expect(core.pendingEventChoice?.effect.mode).toBe('optionalHauntRoll');
    core = applyBetrayalCommand(
        core,
        BETRAYAL_COMMANDS.RESOLVE_EVENT_CHOICE,
        '0',
        { accept: true },
        100,
        createBetrayalScriptedRandom(3, 3, 2, 2),
    );
    return acknowledgeAnyPendingCardResolutions(core);
}

export function prepareMirrorCurseBreaker(
    core: BetrayalCore,
    playerId = '1',
    traitOverride?: BetrayalTraitKey,
) {
    const secret = core.scenarioRuntime.uponReflection?.secretCombination;
    if (!secret) {
        throw new Error('测试夹具缺少怪异的镜子秘密组合');
    }
    const roomId = secret.roomId ?? core.rooms[0]?.id ?? 'entrance-hall';
    core.rooms = core.rooms.map((room) => (
        room.id === roomId
            ? {
                ...room,
                name: secret.roomName,
                visualId: secret.roomVisualId ?? room.visualId,
            }
            : room
    ));
    activateTestExplorer(core, playerId);
    core.currentExplorer.roomId = roomId;
    core.activeRoomId = roomId;
    setTestExplorerInventory(core, playerId, [{
        id: secret.omenId,
        name: secret.omenName,
        kind: 'omen',
    }]);
    const trait = traitOverride ?? secret.trait;
    setTestTraitTrack(core, playerId, trait, [5, 5, 5, 5, 5], 2, 2);
    return {
        secret,
        trait,
        omenId: secret.omenId,
        omenName: secret.omenName,
    };
}

export function exploreConfiguredEventByNameFromRoom(
    eventName: string,
    roomId: string,
    targetRoomId: string,
    randomResults: number[] = [],
    setupCore?: (core: BetrayalCore) => void,
): BetrayalCore {
    const core = createStartedFirstScenarioCore();
    setHighCapacityGeneralDamageTracks(core, '0');
    core.currentExplorer.roomId = roomId;
    core.activeRoomId = roomId;
    setupCore?.(core);
    core.drawOrder = ['event'];
    core.eventOrder = [findConfiguredEventByName(eventName)];
    core.deckCounts.event = core.eventOrder.length;
    setNextEventSymbolRoomForTarget(core, targetRoomId);
    core.currentExplorerTraits = { ...core.currentExplorer.traits };
    core.currentExplorerInventory = [...core.currentExplorer.inventory];

    return applyBetrayalCommand(
        core,
        BETRAYAL_COMMANDS.EXPLORE_ROOM,
        '0',
        { roomId: targetRoomId },
        100,
        createBetrayalScriptedRandom(...randomResults),
    );
}

export type BetrayalEventDeathRiskTag = 'damage' | 'directTraitLoss';

export function collectEventDeathRiskTags(
    effect: BetrayalUseEffectSeed | undefined,
    tags = new Set<BetrayalEventDeathRiskTag>(),
): Set<BetrayalEventDeathRiskTag> {
    if (!effect) {
        return tags;
    }

    switch (effect.mode) {
        case 'generalDamage':
        case 'generalDamageChoice':
        case 'fixedDamage':
        case 'rolledDamage':
            tags.add('damage');
            break;
        case 'placeExplorerInNextFloorStartingRoom':
            if (effect.basementFallbackDamage && effect.basementFallbackDamage.amount > 0) {
                tags.add('damage');
            }
            break;
        case 'trait':
        case 'chosenTrait':
            if (effect.amount < 0) {
                tags.add('directTraitLoss');
            }
            break;
        case 'allTraitChecks':
            if (effect.failAmount > 0) {
                tags.add('directTraitLoss');
            }
            collectEventDeathRiskTags(effect.allPassEffect, tags);
            break;
        case 'compound':
            for (const childEffect of effect.effects) {
                collectEventDeathRiskTags(childEffect, tags);
            }
            break;
        case 'optionalEffect':
            collectEventDeathRiskTags(effect.acceptEffect, tags);
            break;
        case 'optionalItemEffect':
            collectEventDeathRiskTags(effect.acceptEffect, tags);
            collectEventDeathRiskTags(effect.declineEffect, tags);
            break;
        case 'optionalEventRoll':
            for (const branch of effect.roll.branches) {
                collectEventDeathRiskTags(branch.effect, tags);
            }
            break;
        case 'chooseTraitRoll':
        case 'traitRoll':
            for (const branch of effect.branches) {
                collectEventDeathRiskTags(branch.effect, tags);
            }
            break;
        case 'optionalHauntRoll':
            collectEventDeathRiskTags(effect.failureEffect, tags);
            collectEventDeathRiskTags(effect.skippedOrStartedEffect, tags);
            break;
        default:
            break;
    }

    return tags;
}

export function collectEventTemplateDeathRiskTags(event: typeof BETRAYAL_DISCOVERY_POOLS.events[number]): string[] {
    const tags = collectEventDeathRiskTags(event.effect);
    for (const branch of event.roll?.branches ?? []) {
        collectEventDeathRiskTags(branch.effect, tags);
    }
    return [...tags].sort();
}

export function collectUseEffectModes(
    effect: BetrayalUseEffectSeed | undefined,
    modes = new Set<BetrayalUseEffectSeed['mode']>(),
): Set<BetrayalUseEffectSeed['mode']> {
    if (!effect) {
        return modes;
    }

    modes.add(effect.mode);
    switch (effect.mode) {
        case 'allTraitChecks':
            collectUseEffectModes(effect.allPassEffect, modes);
            break;
        case 'compound':
            for (const childEffect of effect.effects) {
                collectUseEffectModes(childEffect, modes);
            }
            break;
        case 'optionalItemEffect':
            collectUseEffectModes(effect.acceptEffect, modes);
            collectUseEffectModes(effect.declineEffect, modes);
            break;
        case 'optionalEventRoll':
            for (const branch of effect.roll.branches) {
                collectUseEffectModes(branch.effect, modes);
            }
            break;
        case 'chooseTraitRoll':
        case 'traitRoll':
            for (const branch of effect.branches) {
                collectUseEffectModes(branch.effect, modes);
            }
            break;
        case 'optionalHauntRoll':
            collectUseEffectModes(effect.failureEffect, modes);
            collectUseEffectModes(effect.skippedOrStartedEffect, modes);
            break;
        default:
            break;
    }

    return modes;
}

export function collectEventTemplateEffectModes(event: typeof BETRAYAL_DISCOVERY_POOLS.events[number]): string[] {
    const modes = collectUseEffectModes(event.effect);
    for (const branch of event.roll?.branches ?? []) {
        collectUseEffectModes(branch.effect, modes);
    }
    return [...modes].sort();
}

export function collectRuntimePossessionCards(): Array<BetrayalCore['currentExplorer']['inventory'][number]> {
    const cards = [
        ...BETRAYAL_DISCOVERY_POOLS.possessions.item,
        ...BETRAYAL_DISCOVERY_POOLS.possessions.omen,
        ...Object.values(BETRAYAL_SCENARIO_CONFIGS['first-scenario'].startingInventoryByExplorerId).flat(),
    ];
    const byId = new Map<string, BetrayalCore['currentExplorer']['inventory'][number]>();
    for (const card of cards) {
        if (!byId.has(card.id)) {
            byId.set(card.id, card);
        }
    }
    return [...byId.values()];
}

export function requireRuntimeOmenCard(cardId: string): BetrayalCore['currentExplorer']['inventory'][number] {
    const card = BETRAYAL_DISCOVERY_POOLS.possessions.omen.find((candidate) => candidate.id === cardId);
    if (!card) {
        throw new Error(`山屋单测缺少真实预兆卡：${cardId}`);
    }
    return { ...card };
}

export function collectRuntimePossessionCardNames(): string[] {
    return collectRuntimePossessionCards().map((card) => card.name);
}

export function createPossessionCoverageCore(): BetrayalCore {
    const core = createStartedFirstScenarioCore(['0', '1', '2']);
    core.phase = 'haunt';
    core.currentExplorer.inventory = collectRuntimePossessionCards().map((card) => ({ ...card }));
    core.currentExplorerInventory = core.currentExplorer.inventory.map((card) => ({ ...card }));
    core.turnStartInventoryCardIds = core.currentExplorer.inventory.map((card) => card.id);
    return core;
}

export function setDiscoveredTestRoom(
    core: BetrayalCore,
    roomId: string,
    overrides: Partial<BetrayalCore['rooms'][number]>,
): void {
    core.rooms = core.rooms.map((room) => (
        room.id === roomId
            ? {
                ...room,
                state: 'discovered',
                ...overrides,
            }
            : room
    ));
}

export function placeActiveTestExplorerInRoom(core: BetrayalCore, playerId: string, roomId: string): void {
    activateTestExplorer(core, playerId);
    core.currentExplorer.roomId = roomId;
    core.activeRoomId = roomId;
    core.turnEndedByDiscovery = false;
    core.pendingEventChoice = null;
    core.pendingDamageAllocation = null;
    core.recentRoll = null;
}

export function createOpenFrontierHauntTestCore(activePlayerId: string): BetrayalCore {
    const core = createStartedFirstScenarioCore(['0', '1', '2', '3']);
    core.phase = 'haunt';
    core.scenarioRuntime.hauntTriggered = true;
    core.scenarioRuntime.hauntRevealerPlayerId = '0';
    core.scenarioRuntime.traitorPlayerId = '2';
    core.scenarioRuntime.nextHauntPlayerId = activePlayerId;
    core.scenarioRuntime.hauntCardNumber = 1;
    core.scenarioRuntime.hauntTriggerLabel = '测试作祟';
    core.scenarioRuntime.hauntScenarioCardId = DEFAULT_BETRAYAL_SCENARIO_CARD_ID;
    core.scenarioRuntime.hauntScenarioCardTitle = '赤红杰克归来';
    core.scenarioRuntime.hauntScenarioCardLabel = '作祟 1';
    core.scenarioRuntime.triggeringOmenName = '测试恶兆';
    placeActiveTestExplorerInRoom(core, activePlayerId, 'entrance-hall');
    setScenarioTestTurnMovement(core, 6);
    return core;
}

export function lethalTraitsForPendingDamage(core: BetrayalCore, lethalTrait: BetrayalTraitKey): BetrayalTraitKey[] {
    const pending = core.pendingDamageAllocation;
    if (!pending) {
        throw new Error('expected pending damage allocation');
    }
    const explorer = findTestExplorer(core, pending.playerId);
    const orderedTraits = [
        lethalTrait,
        ...pending.allowedTraits.filter((trait) => trait !== lethalTrait),
    ];
    const traits: BetrayalTraitKey[] = [];
    let remaining = pending.amount;
    for (const trait of orderedTraits) {
        if (remaining <= 0) {
            break;
        }
        const track = explorer.traitTracks[trait];
        const floorPosition = pending.allowSkull ? track.skullPosition : track.criticalPosition;
        const assignableSteps = Math.max(0, track.position - floorPosition);
        const take = Math.min(remaining, assignableSteps);
        traits.push(...Array.from({ length: take }, () => trait));
        remaining -= take;
    }
    return traits;
}

export function createDustHauntCore(playerIds: string[] = ['0', '1', '2']): BetrayalCore {
    let core = createStartedFirstScenarioCore(playerIds);
    core.drawOrder = ['event'];
    core.eventOrder = [BETRAYAL_DISCOVERY_POOLS.events.find((event) => event.name === '一瓶微尘')!];
    core.currentExplorer.inventory = [
        ...core.currentExplorer.inventory,
        { id: 'omen-book', name: '书本', kind: 'omen' },
        { id: 'dog', name: '狗', kind: 'omen' },
        { id: 'mask', name: '面具', kind: 'omen' },
    ];
    core.currentExplorerInventory = [...core.currentExplorer.inventory];
    core.currentExplorerTraits = { ...core.currentExplorer.traits };
    setNextEventSymbolRoomForTarget(core, 'ground-north');

    core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, '0', { roomId: 'hallway' });
    core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.EXPLORE_ROOM, '0', { roomId: 'ground-north' });
    core = applyBetrayalCommand(
        core,
        BETRAYAL_COMMANDS.RESOLVE_EVENT_CHOICE,
        '0',
        { accept: true },
        100,
        createBetrayalScriptedRandom(3, 3, 3),
    );
    if (core.pendingEventRollResolution) {
        core = acknowledgePendingEventRollResolution(core);
    }
    return acknowledgePendingCardResolutions(core);
}

export function createDustTradeAndCorpseLootReadyCore(): BetrayalCore {
    const core = createDustHauntCore(['0', '1', '2']);
    activateTestExplorer(core, '0');
    core.currentExplorer.roomId = 'hallway';
    core.activeRoomId = 'hallway';
    core.currentExplorer.inventory = [
        { id: 'rope', name: '兔脚', kind: 'item' },
        { id: 'omen-book', name: '书本', kind: 'omen' },
    ];
    core.currentExplorerInventory = core.currentExplorer.inventory.map((card) => ({ ...card }));
    core.turnStartInventoryCardIds = core.currentExplorer.inventory.map((card) => card.id);
    core.otherExplorers = core.otherExplorers.map((explorer) => {
        if (explorer.playerId === '1') {
            return {
                ...explorer,
                roomId: 'hallway',
                inventory: [
                    { id: 'corpse-map', name: '地图', kind: 'item' },
                    { id: 'corpse-skull', name: '头骨', kind: 'omen' },
                ],
            };
        }
        if (explorer.playerId === '2') {
            return {
                ...explorer,
                roomId: 'hallway',
                inventory: [
                    { id: 'medical-kit', name: '急救包', kind: 'item' },
                ],
            };
        }
        return explorer;
    });
    core.scenarioRuntime.deadExplorerPlayerIds = ['1'];
    core.scenarioRuntime.corpseLootedByPlayerIdsThisTurn = [];
    core.scenarioRuntime.dust!.permanentTraitorPlayerIds = core.scenarioRuntime.dust!.permanentTraitorPlayerIds.filter((playerId) => playerId !== '1');
    core.scenarioRuntime.dust!.feverishPlayerIds = core.scenarioRuntime.dust!.feverishPlayerIds.filter((playerId) => playerId !== '1');
    core.monsters = core.monsters.filter((monster) => monster.id !== 'feverish-1');
    core.tradeUsedThisTurnPlayerIds = [];
    core.pendingTradeAgreement = null;
    core.activePlayerId = null;
    core.pendingEventChoice = null;
    core.recentRoll = null;
    core.latestDiscovery = null;
    core.latestDiscoveryOwnerPlayerId = null;
    core.recommendedAction = 'trade';
    return core;
}

export function createDustNonTraitorRabbitFootDeathReadyCore(): BetrayalCore {
    const core = createDustHauntCore(['0', '1', '2']);
    activateTestExplorer(core, '1');
    core.currentExplorer.roomId = 'hallway';
    core.activeRoomId = 'hallway';
    core.currentExplorer.inventory = [
        { id: 'skull', name: '头骨', kind: 'omen' },
        { id: 'rope', name: '兔脚', kind: 'item' },
        { id: 'map', name: '地图', kind: 'item' },
    ];
    core.currentExplorerInventory = core.currentExplorer.inventory.map((card) => ({ ...card }));
    core.turnStartInventoryCardIds = core.currentExplorer.inventory.map((card) => card.id);
    core.otherExplorers = core.otherExplorers.map((explorer) => ({
        ...explorer,
        roomId: explorer.playerId === '2' ? 'hallway' : explorer.roomId,
    }));
    core.scenarioRuntime.deadExplorerPlayerIds = [];
    core.scenarioRuntime.corpseLootedByPlayerIdsThisTurn = [];
    core.scenarioRuntime.dust!.permanentTraitorPlayerIds = core.scenarioRuntime.dust!.permanentTraitorPlayerIds.filter((playerId) => playerId !== '1');
    core.scenarioRuntime.dust!.feverishPlayerIds = core.scenarioRuntime.dust!.feverishPlayerIds.filter((playerId) => playerId !== '1');
    core.monsters = core.monsters.filter((monster) => monster.id !== 'feverish-1');
    for (const trait of ['might', 'speed', 'knowledge', 'sanity'] as BetrayalTraitKey[]) {
        setTestTraitTrack(core, '1', trait, [1], 0, 0);
    }
    core.currentExplorerTraits = { ...core.currentExplorer.traits };
    core.pendingDamageAllocation = {
        id: 'dust-non-traitor-rabbit-foot-loot-boundary',
        playerId: '1',
        sourceTitle: '灰尘冲动',
        damageKind: 'general',
        amount: 2,
        originalAmount: 2,
        allowedTraits: ['might', 'speed', 'knowledge', 'sanity'],
        allowSkull: true,
        traitsBeforeDamage: { ...core.currentExplorer.traits },
    };
    return core;
}

export function createFeverishControlReadyCore(): BetrayalCore {
    const core = createDustHauntCore();
    const playerId = '0';
    activateTestExplorer(core, playerId);
    core.currentExplorer.roomId = 'hallway';
    core.activeRoomId = 'hallway';
    core.scenarioRuntime.deadExplorerPlayerIds = Array.from(new Set([
        ...core.scenarioRuntime.deadExplorerPlayerIds,
        playerId,
    ]));
    core.scenarioRuntime.dust!.permanentTraitorPlayerIds = Array.from(new Set([
        ...core.scenarioRuntime.dust!.permanentTraitorPlayerIds,
        playerId,
    ]));
    core.scenarioRuntime.dust!.feverishPlayerIds = Array.from(new Set([
        ...core.scenarioRuntime.dust!.feverishPlayerIds,
        playerId,
    ]));
    core.currentExplorer.inventory = [
        { id: 'medical-kit', name: '急救包', kind: 'item' },
        { id: 'rope', name: '兔脚', kind: 'item' },
    ];
    core.currentExplorerInventory = core.currentExplorer.inventory.map((card) => ({ ...card }));
    core.turnStartInventoryCardIds = core.currentExplorer.inventory.map((card) => card.id);
    core.monsters = [
        ...core.monsters.filter((monster) => monster.id !== `feverish-${playerId}`),
        {
            id: `feverish-${playerId}`,
            name: '狂热病患',
            portraitAsset: 'betrayal/monsters/spirit',
            roomId: core.currentExplorer.roomId,
            might: 6,
            speed: 5,
            sanity: 3,
            knowledge: 3,
            damage: 1,
        },
    ];
    setScenarioTestTurnMovement(core, 2);
    return core;
}

export function createMagicCameraHauntCore(cameraOwnerPlayerId: string | null = '1'): BetrayalCore {
    let core = createStartedFirstScenarioCore(['0', '1', '2']);
    core.drawOrder = ['event'];
    setNextDiscoverySymbolRoomsForAllFloors(core, 'event');
    core.eventOrder = [BETRAYAL_DISCOVERY_POOLS.events.find((event) => event.name === '说“茄子”！')!];
    core.currentExplorer = removeMagicCameraFromTestExplorer(core.currentExplorer);
    core.otherExplorers = core.otherExplorers.map(removeMagicCameraFromTestExplorer);
    core.currentExplorer.inventory = [
        ...core.currentExplorer.inventory,
        { id: 'omen-book', name: '书本', kind: 'omen' },
        { id: 'dog', name: '狗', kind: 'omen' },
        { id: 'mask', name: '面具', kind: 'omen' },
    ];
    if (cameraOwnerPlayerId === '0') {
        core.currentExplorer.inventory = [
            ...core.currentExplorer.inventory,
            { id: 'camera', name: '魔法相机', kind: 'item' },
        ];
    }
    core.currentExplorerInventory = [...core.currentExplorer.inventory];
    core.currentExplorerTraits = { ...core.currentExplorer.traits };
    core.otherExplorers = core.otherExplorers.map((explorer) => {
        if (explorer.playerId === cameraOwnerPlayerId) {
            return { ...explorer, inventory: [...explorer.inventory, { id: 'camera', name: '魔法相机', kind: 'item' }] };
        }
        return explorer;
    });
    if (!cameraOwnerPlayerId) {
        core.possessionOrderByKind.item = [
            { id: 'camera', name: '魔法相机', kind: 'item' },
            ...core.possessionOrderByKind.item.filter((card) => card.id !== 'camera'),
        ];
    }

    core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, '0', { roomId: 'hallway' });
    setNextEventSymbolRoomForTarget(core, 'ground-north');
    core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.EXPLORE_ROOM, '0', { roomId: 'ground-north' });
    core = applyBetrayalCommand(
        core,
        BETRAYAL_COMMANDS.RESOLVE_EVENT_CHOICE,
        '0',
        { accept: true },
        100,
        createBetrayalScriptedRandom(3, 3, 3),
    );
    return acknowledgePendingCardResolutions(core);
}

export function createHelpingHandsHauntCore(playerIds: string[] = ['0', '1', '2']): BetrayalCore {
    let core = createStartedFirstScenarioCore(playerIds);
    core.drawOrder = ['event'];
    setNextDiscoverySymbolRoomsForAllFloors(core, 'event');
    core.eventOrder = [BETRAYAL_DISCOVERY_POOLS.events.find((event) => event.name === '大宅饿了')!];
    core.currentExplorer.inventory = [
        ...core.currentExplorer.inventory,
        { id: 'omen-book', name: '书本', kind: 'omen' },
        { id: 'dog', name: '狗', kind: 'omen' },
        { id: 'mask', name: '面具', kind: 'omen' },
    ];
    setTestExplorerInventory(core, '1', [
        { id: 'ring', name: '指环', kind: 'omen' },
    ]);
    setTestExplorerInventory(core, '2', [
        { id: 'holy-symbol', name: '圣符', kind: 'omen' },
    ]);
    core.currentExplorer.traits.might = 4;
    core.currentExplorer.traits.speed = 4;
    core.currentExplorerInventory = [...core.currentExplorer.inventory];
    core.currentExplorerTraits = { ...core.currentExplorer.traits };

    core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, '0', { roomId: 'hallway' });
    setNextEventSymbolRoomForTarget(core, 'ground-north');
    core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.EXPLORE_ROOM, '0', { roomId: 'ground-north' });
    core = applyBetrayalCommand(
        core,
        BETRAYAL_COMMANDS.RESOLVE_EVENT_CHOICE,
        '0',
        { accept: true },
        100,
        createBetrayalScriptedRandom(3, 3, 3),
    );
    return acknowledgePendingCardResolutions(core);
}

export function discoverBloodFromStoneOutOfSightTestRooms(core: BetrayalCore): void {
    setDiscoveredTestRoom(core, 'ground-north', {
        name: '北侧房间',
        hint: '顽石之血 setup 测试用视线外房间。',
        tags: ['测试', '一层'],
        discoveryReward: null,
        visualId: 'study',
    });
    setDiscoveredTestRoom(core, 'ground-south', {
        name: '南侧房间',
        hint: '顽石之血 setup 测试用视线外房间。',
        tags: ['测试', '一层'],
        discoveryReward: null,
        visualId: 'gallery',
    });
}

export function seedBloodFromStoneTrigger(core: BetrayalCore): void {
    core.proposedScenarioCardId = 'blood-from-a-stone';
    core.drawOrder = ['omen'];
    setNextDiscoverySymbolRoomsForAllFloors(core, 'omen');
    core.possessionOrderByKind.omen = [
        { id: 'mask', name: 'Mask', kind: 'omen' },
    ];
    core.currentExplorer.inventory = [
        { id: 'omen-book', name: '书本', kind: 'omen' },
        { id: 'dog', name: '狗', kind: 'omen' },
        { id: 'skull', name: '头骨', kind: 'omen' },
        { id: 'ring', name: '指环', kind: 'omen' },
    ];
    core.currentExplorerInventory = [...core.currentExplorer.inventory];
    core.currentExplorerTraits = { ...core.currentExplorer.traits };
}

export function createBloodFromStoneTriggeredWithAutoPlacementCore(): BetrayalCore {
    let core = createStartedFirstScenarioCore(['0', '1', '2']);
    discoverBloodFromStoneOutOfSightTestRooms(core);
    seedBloodFromStoneTrigger(core);

    core = applyBetrayalCommand(
        core,
        BETRAYAL_COMMANDS.EXPLORE_ROOM,
        '0',
        { roomId: 'ground-east' },
        100,
        createBetrayalScriptedRandom(3, 3, 3, 3, 3),
    );

    return acknowledgePendingCardResolutions(core);
}

export function createBloodFromStoneManualPlacementGapCore(): BetrayalCore {
    const core = createStartedFirstScenarioCore(['0', '1', '2']);
    seedBloodFromStoneTrigger(core);
    core.rooms = core.rooms.map((room) => (
        room.id === 'upper-west'
            ? {
                ...room,
                state: 'unexplored',
                name: '未探索',
            }
            : room
    ));
    core.phase = 'haunt';
    core.scenarioRuntime.hauntTriggered = true;
    core.scenarioRuntime.hauntCardNumber = 5;
    core.scenarioRuntime.hauntRevealerPlayerId = '0';
    core.scenarioRuntime.traitorPlayerId = null;
    core.scenarioRuntime.hauntTraitorResolution = {
        hauntCardNumber: 5,
        policy: 'no-traitor',
        traitorPlayerId: null,
        teamModel: 'no-traitor',
        reasonLabel: '无叛徒',
        candidatePlayerIds: [],
        excludedPlayerIds: [],
        tieBreak: 'none',
        representativeOnly: false,
    };
    core.scenarioRuntime.hauntFirstPlayerResolution = {
        hauntCardNumber: 5,
        policy: 'left-of-revealer',
        anchorPlayerId: '0',
        nextPlayerId: '1',
        reasonLabel: '作祟揭秘者左侧玩家先行动',
        representativeOnly: false,
    };
    core.scenarioRuntime.nextHauntPlayerId = '1';
    core.scenarioRuntime.hauntSetupQueue = [];
    core.scenarioRuntime.hauntResolutionRepresentativeOnly = false;
    return core;
}

export function createBloodFromStoneMultiGapManualPlacementCore(): BetrayalCore {
    const core = createBloodFromStoneManualPlacementGapCore();
    core.rooms = core.rooms.map((room) => (
        room.id === 'basement-landing'
            ? {
                ...room,
                state: 'unexplored',
                name: '未探索',
            }
            : room
    ));
    return core;
}

export function createHelpingHandsExplorerAttackCore(): BetrayalCore {
    const core = createHelpingHandsHauntCore();
    activateTestExplorer(core, '0');
    const sharedRoomId = core.currentExplorer.roomId;
    const defender = findTestExplorer(core, '1');
    defender.roomId = sharedRoomId;
    defender.inventory = [
        { id: 'first-aid-kit', name: '急救包', kind: 'item' },
        { id: 'omen-skull', name: '头骨', kind: 'omen' },
    ];
    setTestTraitTrack(core, '0', 'might', [1, 2, 3], 1, 1);
    setTestTraitTrack(core, '0', 'sanity', [1, 2, 3], 1, 1);
    for (const trait of ['might', 'speed', 'knowledge', 'sanity'] as BetrayalTraitKey[]) {
        setTestTraitTrack(core, '1', trait, [1, 2, 2, 2, 2, 2], 4, 4);
    }
    core.activeRoomId = sharedRoomId;
    core.currentExplorerTraits = { ...core.currentExplorer.traits };
    core.currentExplorerInventory = core.currentExplorer.inventory.map((card) => ({ ...card }));
    core.turnStartInventoryCardIds = core.currentExplorer.inventory.map((card) => card.id);
    return core;
}

export function startHelpingHandsMonsterTurn(
    core: BetrayalCore,
    random = createBetrayalScriptedRandom(1, 2, 3),
): BetrayalCore {
    activateTestExplorer(core, '0');
    return applyBetrayalCommand(
        core,
        BETRAYAL_COMMANDS.END_TURN,
        '0',
        {},
        100,
        random,
    );
}
export function placeCurrentExplorerInDustResearchRoom(
    core: BetrayalCore,
    discoveryReward: BetrayalCore['rooms'][number]['discoveryReward'] = 'omen',
): BetrayalCore {
    const roomId = 'ground-north';
    core.currentExplorer.roomId = roomId;
    core.activeRoomId = roomId;
    core.rooms = core.rooms.map((room) => (
        room.id === roomId
            ? {
                ...room,
                state: 'discovered',
                name: '实验室',
                hint: '灰尘剧本测试研究板块',
                tags: ['研究'],
                discoveryReward,
                visualId: 'laboratory',
            }
            : room
    ));
    return core;
}

export function seedDustFailedActionExchangeTokens(core: BetrayalCore): void {
    if (!core.scenarioRuntime.dust) {
        throw new Error('灰尘失败行动交换测试缺少 dust 运行态');
    }
    core.scenarioRuntime.dust.sicknessTokensByPlayerId = {
        '0': [
            { id: 'sickness-0-a', value: 7 },
            { id: 'sickness-0-b', value: 8 },
            { id: 'sickness-0-c', value: 9 },
        ],
        '1': [
            { id: 'sickness-1-a', value: 4 },
            { id: 'sickness-1-b', value: 5 },
            { id: 'sickness-1-c', value: 6 },
        ],
        '2': [
            { id: 'sickness-2-a', value: 12 },
            { id: 'sickness-2-b', value: 13 },
            { id: 'sickness-2-c', value: 14 },
        ],
        '3': [
            { id: 'sickness-3-a', value: 1 },
            { id: 'sickness-3-b', value: 10 },
            { id: 'sickness-3-c', value: 11 },
        ],
    };
    core.scenarioRuntime.dust.permanentTraitorPlayerIds = ['3'];
    core.scenarioRuntime.dust.exchangedSicknessThisTurnPlayerIds = [];
    core.scenarioRuntime.dust.pendingSicknessExchange = undefined;
    core.scenarioRuntime.deadExplorerPlayerIds = ['2'];
    core.currentExplorer.roomId = 'ground-north';
    core.activeRoomId = 'ground-north';
    core.otherExplorers = core.otherExplorers.map((explorer) => {
        if (explorer.playerId === '0') {
            return { ...explorer, roomId: 'entrance-hall' };
        }
        if (explorer.playerId === '2') {
            return { ...explorer, roomId: 'hallway' };
        }
        if (explorer.playerId === '3') {
            return { ...explorer, roomId: 'upper-landing' };
        }
        return explorer;
    });
}

export function seedDustControlImpulsesTokens(core: BetrayalCore): void {
    if (!core.scenarioRuntime.dust) {
        throw new Error('灰尘控制冲动测试缺少 dust 运行态');
    }
    activateTestExplorer(core, '1');
    core.currentExplorer.roomId = 'hallway';
    core.activeRoomId = 'hallway';
    core.otherExplorers = core.otherExplorers.map((explorer) => {
        if (explorer.playerId === '0') {
            return { ...explorer, roomId: 'hallway' };
        }
        return { ...explorer, roomId: 'entrance-hall' };
    });
    core.scenarioRuntime.dust.sicknessTokensByPlayerId = {
        '0': [
            { id: 'sickness-0-a', value: 1 },
            { id: 'sickness-0-b', value: 7 },
            { id: 'sickness-0-c', value: 8 },
        ],
        '1': [
            { id: 'sickness-1-a', value: 4 },
            { id: 'sickness-1-b', value: 5 },
            { id: 'sickness-1-c', value: 6 },
        ],
        '2': [
            { id: 'sickness-2-a', value: 9 },
            { id: 'sickness-2-b', value: 10 },
            { id: 'sickness-2-c', value: 11 },
        ],
    };
    core.scenarioRuntime.dust.permanentTraitorPlayerIds = ['0'];
    core.scenarioRuntime.dust.exchangedSicknessThisTurnPlayerIds = [];
    core.scenarioRuntime.dust.pendingSicknessExchange = undefined;
    core.scenarioRuntime.deadExplorerPlayerIds = [];
}
