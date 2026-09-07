import type { RandomFn } from '../../engine/types';
import { createBetrayalEventSymbolSkipChoice } from './eventChoiceResolutionModel';
import { resolveEvent } from './eventDeckModel';
import { resolveEventDamageDeathPrevention } from './eventEffectResolutionModel';
import {
    materializeEventEffect,
    resolveEventBranch,
    rollEventFixedDice,
} from './eventRollModel';
import { cloneExplorerSummary } from './explorerReadModel';
import {
    formatHauntRollDiscoveryDetail,
    resolveHauntRoll,
} from './hauntProgress';
import { isUponReflectionHaunt } from './hauntScenarioReadModel';
import { resolveHauntRevealResolutionForTrigger } from './hauntSetupModel';
import { resolveMummyForcedOmenDraw } from './mummyHauntRules';
import {
    canUseHolySymbolForDiscovery,
    canUseIdolToSkipEvent,
} from './possessionActionReadModel';
import {
    cloneInventoryCard,
    createDrawnCard,
} from './possessionDeckModel';
import {
    BETRAYAL_TRAIT_LABEL as TRAIT_LABEL,
    eventEffectNeedsPendingEventChoice,
    formatEffectLabel,
    isWarningEventEffect,
    resolveUseEffect,
} from './possessionEffects';
import {
    cloneRoomDrawResolution,
    createBetrayalRoomExploredRoomPayload,
    createRoomDiscoveryCardResolutionSteps,
    createRoomDiscoveryEffectResolutionSteps,
    formatRoomDiscoveryRewardDetailParts,
    getRoomDiscoveryRewardNames,
    hasAvailableDiscoveryDeckCard,
    orientDoorwaysForPlacement,
    resolveExplorableRoomSlots,
    resolveRoomDiscoveryCards,
    resolveRoomDraw,
    resolveRoomPlacementContext,
    resolveRoomPlacementOrientationOptions,
    resolveRoomTemplateDiscoveryDeckKind,
    applyRoomDiscoveryEffect,
} from './roomDiscoveryModel';
import { canUseBetrayalTraitorPowers } from './traitorPowerRules';
import { rollEventTraitCheckWithDice } from './traitRollModel';
import type {
    BetrayalCore,
    BetrayalDiscoveryResolutionStep,
} from './game';
import type { BetrayalCommandMap } from './commandTypes';
import type { BetrayalEvent } from './events';

type BetrayalRoomExploredPayload = Extract<BetrayalEvent, { type: 'ROOM_EXPLORED' }>['payload'];
type BetrayalExploreRoomPayload = BetrayalCommandMap['EXPLORE_ROOM'];

const DECK_KIND_LABEL = {
    event: '事件',
    item: '物品',
    omen: '预兆',
} as const;

function cloneCoreForRoomDiscoveryText(core: BetrayalCore): BetrayalCore {
    const currentExplorer = cloneExplorerSummary(core.currentExplorer);
    return {
        ...core,
        currentExplorer,
        currentExplorerTraits: { ...currentExplorer.traits },
        currentExplorerInventory: currentExplorer.inventory.map(cloneInventoryCard),
        otherExplorers: core.otherExplorers.map(cloneExplorerSummary),
    };
}

function resolveCoreAfterRoomDiscoveryText(
    core: BetrayalCore,
    effect: BetrayalRoomExploredPayload['room']['discoveryEffect'],
): BetrayalCore {
    const preview = cloneCoreForRoomDiscoveryText(core);
    applyRoomDiscoveryEffect(preview, effect);
    return cloneCoreForRoomDiscoveryText(preview);
}

export function resolveBetrayalRoomExploredPayload(
    core: BetrayalCore,
    command: {
        playerId: string;
        payload: BetrayalExploreRoomPayload;
    },
    random: RandomFn,
    timestamp: number,
): BetrayalRoomExploredPayload | null {
    const explorableSlots = resolveExplorableRoomSlots(core);
    const nextSlot = command.payload.roomId
        ? explorableSlots.find((room) => room.id === command.payload.roomId) ?? explorableSlots[0]!
        : explorableSlots[0]!;
    const placement = resolveRoomPlacementContext(core, nextSlot);
    const roomDraw = resolveRoomDraw(core, nextSlot.floor, {
        useHolySymbol: command.payload.useHolySymbol && canUseHolySymbolForDiscovery(core),
        placement,
    });
    const skippedRoomTemplate = roomDraw.skippedRoomTemplate;
    const roomTemplate = roomDraw.roomTemplate;
    const roomTileAdjustment = roomDraw.resolution.requiresTileAdjustment
        ? command.payload.roomTileAdjustment
        : undefined;
    if (!roomTemplate || (roomDraw.resolution.requiresTileAdjustment && !roomTileAdjustment)) {
        return null;
    }
    const deckKind = resolveRoomTemplateDiscoveryDeckKind(roomTemplate);
    const roomTextResolvedCore = resolveCoreAfterRoomDiscoveryText(core, roomTemplate.discoveryEffect);
    const roomDiscoveryCards = resolveRoomDiscoveryCards(roomTextResolvedCore, roomTemplate.discoveryEffect);
    const roomDiscoveryEffectResolutionSteps = createRoomDiscoveryEffectResolutionSteps(
        roomTemplate.name,
        roomTemplate.discoveryEffect,
    );
    const orientationOptions = resolveRoomPlacementOrientationOptions(
        core,
        roomTemplate,
        placement,
        roomDraw.selectedRoomRequiresOpenFrontier,
    );
    const selectedOrientation = orientationOptions.find((option) => option.orientationTurns === command.payload.orientationTurns)
        ?? orientationOptions[0]
        ?? orientDoorwaysForPlacement(roomTemplate.doorways, placement.entryEdge, command.payload.orientationTurns);
    const roomExploredRoomPayload = createBetrayalRoomExploredRoomPayload({
        roomTemplate,
        roomSlot: nextSlot,
        discoveryReward: deckKind,
        selectedOrientation,
    });
    const holySymbolLogPrefix = skippedRoomTemplate
        ? `${core.currentExplorer.displayName}用圣符埋葬${skippedRoomTemplate.name}，继续发现${roomTemplate.name}；`
        : '';
    const tileAdjustmentLogPrefix = roomTileAdjustment
        ? `${core.currentExplorer.displayName}先调整房间板块后继续探索；`
        : '';
    const roomDiscoveryRewardDetailParts = formatRoomDiscoveryRewardDetailParts(roomTemplate.name, roomDiscoveryCards);
    const roomDiscoveryCardResolutionSteps = createRoomDiscoveryCardResolutionSteps(roomTemplate.name, roomDiscoveryCards);

    if (deckKind === null) {
        const noSymbolDetailParts = [
            ...roomDiscoveryRewardDetailParts,
            '没有事件、物品或预兆发现牌',
        ];
        return {
            playerId: command.playerId,
            roomId: nextSlot.id,
            room: roomExploredRoomPayload,
            deckKind,
            ...roomDiscoveryCards,
            skippedRoomWithHolySymbol: skippedRoomTemplate
                ? { name: skippedRoomTemplate.name }
                : undefined,
            roomDrawResolution: cloneRoomDrawResolution(roomDraw.resolution),
            roomTileAdjustment,
            discovery: {
                kind: 'none',
                title: roomTemplate.name,
                summary: roomDiscoveryEffectResolutionSteps.length > 0 || roomDiscoveryCardResolutionSteps.length > 0
                    ? '房间文字已结算'
                    : '无发现符号',
                detail: noSymbolDetailParts.join('；'),
                tone: roomDiscoveryEffectResolutionSteps.length > 0 || roomDiscoveryCardResolutionSteps.length > 0
                    ? 'accent'
                    : 'neutral',
                resolutionSteps: [
                    ...roomDiscoveryEffectResolutionSteps,
                    ...roomDiscoveryCardResolutionSteps,
                ],
            },
            logText: `${holySymbolLogPrefix}${tileAdjustmentLogPrefix}${core.currentExplorer.displayName}探索到${roomTemplate.name}，房间没有发现符号`,
            hauntTriggered: false,
        };
    }

    if (!hasAvailableDiscoveryDeckCard(core, deckKind)) {
        const emptyDeckDetailParts = [
            ...roomDiscoveryRewardDetailParts,
            `${DECK_KIND_LABEL[deckKind]}牌堆已空，没有抽取发现牌`,
        ];
        return {
            playerId: command.playerId,
            roomId: nextSlot.id,
            room: roomExploredRoomPayload,
            deckKind,
            ...roomDiscoveryCards,
            skippedRoomWithHolySymbol: skippedRoomTemplate
                ? { name: skippedRoomTemplate.name }
                : undefined,
            roomDrawResolution: cloneRoomDrawResolution(roomDraw.resolution),
            roomTileAdjustment,
            discovery: {
                kind: deckKind,
                title: `${DECK_KIND_LABEL[deckKind]}符号`,
                summary: '牌堆已空',
                detail: emptyDeckDetailParts.join('；'),
                tone: 'neutral',
                resolutionSteps: [
                    ...roomDiscoveryEffectResolutionSteps,
                    ...roomDiscoveryCardResolutionSteps,
                ],
            },
            logText: `${holySymbolLogPrefix}${tileAdjustmentLogPrefix}${core.currentExplorer.displayName}探索到${roomTemplate.name}，${DECK_KIND_LABEL[deckKind]}牌堆已空`,
            hauntTriggered: false,
        };
    }

    if (deckKind === 'event') {
        if (isUponReflectionHaunt(core)) {
            return {
                playerId: command.playerId,
                roomId: nextSlot.id,
                room: roomExploredRoomPayload,
                deckKind,
                ...roomDiscoveryCards,
                skippedEventWithUponReflection: true,
                skippedRoomWithHolySymbol: skippedRoomTemplate
                    ? { name: skippedRoomTemplate.name }
                    : undefined,
                roomDrawResolution: cloneRoomDrawResolution(roomDraw.resolution),
                roomTileAdjustment,
                discovery: {
                    kind: deckKind,
                    title: '事件符号',
                    summary: '镜中沉默',
                    detail: '7 号作祟中不抽取或结算事件卡，且探索事件符号房间不会结束回合',
                    tone: 'accent',
                },
                logText: `${holySymbolLogPrefix}${tileAdjustmentLogPrefix}${core.currentExplorer.displayName}探索到${roomTemplate.name}，镜中沉默使事件符号无事发生`,
                hauntTriggered: false,
            };
        }
        if (command.payload.ignoreEventSymbolWithTraitorPower && canUseBetrayalTraitorPowers(core, command.playerId)) {
            return {
                playerId: command.playerId,
                roomId: nextSlot.id,
                room: roomExploredRoomPayload,
                deckKind,
                ...roomDiscoveryCards,
                skippedEventWithTraitorPower: true,
                skippedRoomWithHolySymbol: skippedRoomTemplate
                    ? { name: skippedRoomTemplate.name }
                    : undefined,
                roomDrawResolution: cloneRoomDrawResolution(roomDraw.resolution),
                roomTileAdjustment,
                discovery: {
                    kind: deckKind,
                    title: '跳过事件',
                    summary: '跳过事件',
                    detail: '没有抽取或结算事件卡',
                    tone: 'accent',
                },
                logText: `${holySymbolLogPrefix}${tileAdjustmentLogPrefix}${core.currentExplorer.displayName}探索到${roomTemplate.name}，叛徒跳过了事件`,
                hauntTriggered: false,
            };
        }
        const eventCard = resolveEvent(core);
        if (command.payload.useIdol && canUseIdolToSkipEvent(core)) {
            return {
                playerId: command.playerId,
                roomId: nextSlot.id,
                room: roomExploredRoomPayload,
                deckKind,
                ...roomDiscoveryCards,
                skippedEventWithIdol: { name: eventCard.name },
                skippedRoomWithHolySymbol: skippedRoomTemplate
                    ? { name: skippedRoomTemplate.name }
                    : undefined,
                roomDrawResolution: cloneRoomDrawResolution(roomDraw.resolution),
                roomTileAdjustment,
                discovery: {
                    kind: deckKind,
                    title: eventCard.name,
                    summary: '已用雕像跳过',
                    detail: '没有抽取或结算事件卡',
                    tone: 'accent',
                },
                logText: `${holySymbolLogPrefix}${tileAdjustmentLogPrefix}${core.currentExplorer.displayName}探索到${roomTemplate.name}，使用雕像跳过了事件：${eventCard.name}`,
                hauntTriggered: false,
            };
        }
        const eventSymbolSkipChoice = createBetrayalEventSymbolSkipChoice(
            core,
            command.playerId,
            nextSlot.id,
            roomTemplate.name,
            timestamp,
        );
        if (eventSymbolSkipChoice) {
            return {
                playerId: command.playerId,
                roomId: nextSlot.id,
                room: roomExploredRoomPayload,
                deckKind,
                ...roomDiscoveryCards,
                skippedRoomWithHolySymbol: skippedRoomTemplate
                    ? { name: skippedRoomTemplate.name }
                    : undefined,
                roomDrawResolution: cloneRoomDrawResolution(roomDraw.resolution),
                roomTileAdjustment,
                discovery: {
                    kind: deckKind,
                    title: '事件符号',
                    summary: '等待选择是否跳过事件',
                    detail: `${roomTemplate.name}带有事件符号；可选择跳过事件或继续抽取事件牌`,
                    tone: 'accent',
                    resolutionSteps: [
                        ...roomDiscoveryEffectResolutionSteps,
                        ...roomDiscoveryCardResolutionSteps,
                    ],
                },
                nextPendingEventChoice: eventSymbolSkipChoice,
                logText: `${holySymbolLogPrefix}${tileAdjustmentLogPrefix}${core.currentExplorer.displayName}探索到${roomTemplate.name}，发现事件符号，等待选择是否跳过事件`,
                hauntTriggered: false,
            };
        }
        if (eventCard.roll) {
            return {
                playerId: command.playerId,
                roomId: nextSlot.id,
                room: roomExploredRoomPayload,
                deckKind,
                eventDescription: eventCard.description,
                eventRollPending: {
                    kind: eventCard.roll.kind,
                    trait: eventCard.roll.kind === 'dice' ? undefined : eventCard.roll.trait,
                    dice: eventCard.roll.kind === 'dice' ? eventCard.roll.dice : undefined,
                    label: eventCard.roll.kind === 'dice' ? eventCard.roll.label : undefined,
                },
                roomDiscoveryCards: roomDiscoveryCards.roomDiscoveryCards,
                buriedRoomDiscoveryCards: roomDiscoveryCards.buriedRoomDiscoveryCards,
                skippedRoomWithHolySymbol: skippedRoomTemplate
                    ? { name: skippedRoomTemplate.name }
                    : undefined,
                roomDrawResolution: cloneRoomDrawResolution(roomDraw.resolution),
                roomTileAdjustment,
                discovery: {
                    kind: deckKind,
                    title: eventCard.name,
                    summary: '事件牌已公开，等待投掷',
                    detail: eventCard.description ?? '请按事件牌要求投掷。',
                    tone: 'accent',
                    resolutionSteps: [
                        ...roomDiscoveryEffectResolutionSteps,
                    ],
                },
                logText: `${holySymbolLogPrefix}${tileAdjustmentLogPrefix}${core.currentExplorer.displayName}探索到${roomTemplate.name}，公开事件：${eventCard.name}，等待投掷`,
                hauntTriggered: false,
            };
        }
        const eventRollKind = eventCard.roll?.kind ?? 'trait';
        const eventRollResult = eventCard.roll
            ? eventRollKind === 'dice'
                ? rollEventFixedDice(random, eventCard.roll.dice)
                : rollEventTraitCheckWithDice(random, roomTextResolvedCore.currentExplorer, eventCard.roll.trait, roomTextResolvedCore)
            : null;
        const eventRollTotal = eventRollResult?.total ?? null;
        const eventBranch = eventCard.roll && eventRollTotal !== null
            ? resolveEventBranch(eventCard.roll.branches, eventRollTotal)
            : null;
        const eventEffect = eventBranch?.effect ?? eventCard.effect;
        if (!eventEffect) {
            throw new Error(`event ${eventCard.name} has no resolvable effect`);
        }
        const deferEventRollEffectRandomResults = Boolean(eventCard.roll && eventRollTotal !== null && eventBranch);
        const materializedEventEffect = materializeEventEffect(
            eventEffect,
            random,
            roomTextResolvedCore.currentExplorer,
            roomTextResolvedCore,
            { materializeRandomResults: !deferEventRollEffectRandomResults },
        );
        const deathPrevention = deferEventRollEffectRandomResults
            ? undefined
            : resolveEventDamageDeathPrevention(roomTextResolvedCore, materializedEventEffect, random);
        const effectLabel = formatEffectLabel(materializedEventEffect);
        const eventRollLabel = eventCard.roll
            ? eventRollKind === 'dice'
                ? eventCard.roll.label
                : `${TRAIT_LABEL[eventCard.roll.trait]}检定`
            : undefined;
        const rollLabel = eventCard.roll && eventRollTotal !== null && eventBranch
            ? `${eventRollLabel} ${eventRollTotal}：${eventBranch.label}`
            : undefined;
        const eventEffectResolutionText = rollLabel ? `${rollLabel}；${effectLabel}` : effectLabel;
        const eventEffectResolutionSteps: BetrayalDiscoveryResolutionStep[] = eventEffectNeedsPendingEventChoice(materializedEventEffect)
            ? []
            : [{
                id: `event-effect-${eventCard.name}`,
                kind: 'event-effect',
                text: `事件效果：${eventEffectResolutionText}`,
                deckKind: 'event',
            }];
        const discoveryResolutionSteps = [
            ...roomDiscoveryEffectResolutionSteps,
            ...eventEffectResolutionSteps,
        ];
        return {
            playerId: command.playerId,
            roomId: nextSlot.id,
            room: roomExploredRoomPayload,
            deckKind,
            ...roomDiscoveryCards,
            eventEffect: materializedEventEffect,
            eventDescription: eventCard.description,
            deathPrevention,
            eventRoll: eventCard.roll && eventRollTotal !== null && eventBranch
                ? {
                    kind: eventRollKind,
                    trait: eventRollKind === 'dice' ? undefined : eventCard.roll.trait,
                    total: eventRollTotal,
                    label: eventBranch.label,
                    eventDescription: eventCard.description,
                    rollLabel: eventRollLabel,
                    dice: eventRollResult?.dice,
                    passiveBonus: eventRollResult?.passiveBonus,
                    branchThresholds: eventCard.roll.branches.map((branch) => ({
                        min: branch.min,
                        label: branch.label,
                        effect: { ...branch.effect },
                    })),
                }
                : undefined,
            skippedRoomWithHolySymbol: skippedRoomTemplate
                ? { name: skippedRoomTemplate.name }
                : undefined,
            roomDrawResolution: cloneRoomDrawResolution(roomDraw.resolution),
            roomTileAdjustment,
            discovery: {
                kind: deckKind,
                title: eventCard.name,
                summary: '即时生效',
                detail: eventEffectResolutionText,
                tone: isWarningEventEffect(eventEffect) ? 'warning' : 'accent',
                resolutionSteps: discoveryResolutionSteps,
            },
            logText: `${holySymbolLogPrefix}${tileAdjustmentLogPrefix}${core.currentExplorer.displayName}探索到${roomTemplate.name}，事件：${eventCard.name}（${rollLabel ? `${rollLabel}，` : ''}${effectLabel}）`,
            hauntTriggered: false,
        };
    }

    if (core.pendingEventRollStart) {
        throw new Error('event roll must be started by ROLL_EVENT');
    }

    const roomDiscoveryItemDrawCount = (roomDiscoveryCards.roomDiscoveryCards?.length ?? 0)
        + (roomDiscoveryCards.buriedRoomDiscoveryCards?.length ?? 0);
    const fallbackDrawnCard = createDrawnCard(core, deckKind, {
        additionalDrawnCount: deckKind === 'item' ? roomDiscoveryItemDrawCount : 0,
    });
    const mummyForcedOmenDraw = deckKind === 'omen'
        ? resolveMummyForcedOmenDraw(roomTextResolvedCore, roomTextResolvedCore.currentExplorer, fallbackDrawnCard, random)
        : { drawnCard: fallbackDrawnCard };
    const drawnCard = mummyForcedOmenDraw.drawnCard;
    const drawnCardEffect = resolveUseEffect(drawnCard);
    const hauntRoll = resolveHauntRoll(roomTextResolvedCore, deckKind, random);
    const hauntRevealResolution = hauntRoll?.triggered
        ? resolveHauntRevealResolutionForTrigger(core, drawnCard)
        : undefined;
    const roomDiscoveryRewardNames = getRoomDiscoveryRewardNames(roomDiscoveryCards);
    const drawnCardBaseDetail = drawnCardEffect ? formatEffectLabel(drawnCardEffect) : '按卡面规则持有';
    const mummyForcedOmenDetail = mummyForcedOmenDraw.forcedOmenSearch
        ? mummyForcedOmenDraw.forcedOmenSearch.role === 'hero-book'
            ? '木乃伊横行：英雄首次需要预兆时，从预兆堆找出书本并洗牌'
            : '木乃伊横行：叛徒首次需要预兆时，从预兆堆找出圣符或指环并洗牌'
        : null;
    const drawnCardDetailParts = [
        ...roomDiscoveryRewardDetailParts,
        mummyForcedOmenDetail,
        drawnCardBaseDetail,
        hauntRoll ? formatHauntRollDiscoveryDetail(hauntRoll) : null,
    ].filter((part): part is string => Boolean(part));
    const drawnCardDetail = drawnCardDetailParts.join('；');
    const discoveryResolutionSteps: BetrayalDiscoveryResolutionStep[] = [
        ...roomDiscoveryEffectResolutionSteps,
        ...roomDiscoveryCardResolutionSteps,
        {
            id: `drawn-card-${drawnCard.id}`,
            kind: 'drawn-card',
            text: `已加入持有区：${drawnCard.name}${drawnCardBaseDetail ? `（${drawnCardBaseDetail}）` : ''}`,
            deckKind,
            cardId: drawnCard.id,
        },
        ...(hauntRoll
            ? [{
                id: `haunt-roll-${drawnCard.id}`,
                kind: 'haunt-roll' as const,
                text: formatHauntRollDiscoveryDetail(hauntRoll),
                deckKind,
                cardId: drawnCard.id,
            }]
            : []),
    ];
    const gainedCardNames = [...roomDiscoveryRewardNames.gained, drawnCard.name];
    return {
        playerId: command.playerId,
        roomId: nextSlot.id,
        room: roomExploredRoomPayload,
        deckKind,
        ...roomDiscoveryCards,
        drawnCard,
        skippedRoomWithHolySymbol: skippedRoomTemplate
            ? { name: skippedRoomTemplate.name }
            : undefined,
        roomDrawResolution: cloneRoomDrawResolution(roomDraw.resolution),
        roomTileAdjustment,
        discovery: {
            kind: deckKind,
            title: drawnCard.name,
            summary: '已加入持有区',
            detail: drawnCardDetail,
            tone: 'accent',
            resolutionSteps: discoveryResolutionSteps,
        },
        logText: `${holySymbolLogPrefix}${tileAdjustmentLogPrefix}${core.currentExplorer.displayName}探索到${roomTemplate.name}，拿到了${gainedCardNames.join('、')}`,
        mummyForcedOmenSearch: mummyForcedOmenDraw.forcedOmenSearch,
        hauntRoll: hauntRoll ?? undefined,
        hauntTriggered: hauntRoll?.triggered ?? false,
        hauntRevealResolution,
    };
}
