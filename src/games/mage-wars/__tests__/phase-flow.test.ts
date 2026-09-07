import { describe, expect, it } from 'vitest';
import { FLOW_COMMANDS } from '../../../engine/systems/FlowSystem';
import type { MatchState } from '../../../engine/types';
import { MAGE_WARS_COMMANDS } from '../domain';
import { getFormalArenaZonesFromConfig } from '../data/configPackage';
import { MAGE_WARS_EVENTS } from '../domain/events';
import { ARENA_ZONE_IDS } from '../domain/ids';
import type { MageWarsCore } from '../domain/types';
import {
    actionLogKinds,
    beastmasterSpellIds,
    makeArenaObject,
    planCommand,
    PLAYER_ONE_START_ZONE,
    PLAYER_ZERO_START_ZONE,
    runCommand,
    setupState,
    validateCommand,
    withArenaObject,
} from './helpers/domainFlowHarness';

describe('mage-wars setup and phase flow', () => {
    it('sets up mages in config-backed formal 4x3 diagonal starting zones', () => {
        const state = setupState();

        expect(PLAYER_ZERO_START_ZONE).toBe(ARENA_ZONE_IDS.A3);
        expect(PLAYER_ONE_START_ZONE).toBe(ARENA_ZONE_IDS.D1);
        expect(state.core.players['0'].mageZoneId).toBe(PLAYER_ZERO_START_ZONE);
        expect(state.core.players['1'].mageZoneId).toBe(PLAYER_ONE_START_ZONE);
        expect(state.core.arena.find((zone) => zone.id === PLAYER_ZERO_START_ZONE)?.occupantIds).toEqual(['0']);
        expect(state.core.arena.find((zone) => zone.id === PLAYER_ONE_START_ZONE)?.occupantIds).toEqual(['1']);
        expect(state.core.arena.filter((zone) => zone.occupantIds.length > 0)).toHaveLength(2);
        expect(state.core.arena.map(({ id, row, col }) => ({ id, row, col }))).toEqual(
            getFormalArenaZonesFromConfig().map(({ zoneId, rowIndex, colIndex }) => ({
                id: zoneId,
                row: rowIndex,
                col: colIndex,
            })),
        );
    });

    it('plans at most two spellbook cards for the current mage', () => {
        const state = setupState('planning');
        const spellIds = beastmasterSpellIds();

        const planned = runCommand(state, planCommand(spellIds.slice(0, 2)));

        expect(planned.success).toBe(true);
        expect(planned.state.core.players['0'].preparedSpellCardIds).toEqual(spellIds.slice(0, 2));
        expect(planned.state.core.players['0'].preparedSpellSlots).toBe(2);
        expect(planned.events.map((event) => event.type)).toContain(MAGE_WARS_EVENTS.SPELLS_PLANNED);
        expect(planned.state.sys.undo.snapshots).toHaveLength(1);
        expect(actionLogKinds(planned.state)).toContain(MAGE_WARS_EVENTS.SPELLS_PLANNED);
        expect(planned.state.sys.actionLog.entries[0]?.segments).toEqual(expect.arrayContaining([
            expect.objectContaining({ type: 'card', cardId: String(spellIds[0]) }),
            expect.objectContaining({ type: 'card', cardId: String(spellIds[1]) }),
        ]));

        const duplicateWall = runCommand(state, planCommand([25700, 25700]));
        expect(duplicateWall.success).toBe(true);
        expect(duplicateWall.state.core.players['0'].preparedSpellCardIds).toEqual([25700, 25700]);

        expect(validateCommand(state, planCommand(spellIds.slice(0, 3)))).toBe('tooManyPreparedSpells');
        expect(validateCommand(state, planCommand([3725, 3725]))).toBe('tooManyPreparedSpellCopies');
        expect(validateCommand(state, planCommand([999999]))).toBe('spellNotInPresetSpellbook');
        expect(validateCommand(state, {
            type: MAGE_WARS_COMMANDS.PLAN_SPELLS,
            playerId: '1',
            payload: { spellCardIds: [25700] },
        })).toBe('spellNotInPresetSpellbook');
    });

    it('channels mana on channel phase entry and advances turn after final quickcast', () => {
        const baseState = setupState();
        const playerZeroChannelSource = makeArenaObject('flow-channel-source-0', '0', PLAYER_ZERO_START_ZONE, {
            kind: 'conjuration',
            mana: 1,
            spellcastingSource: {
                abilityId: 'test-channel-source-0',
                channeling: 2,
            },
        });
        const playerOneChannelSource = makeArenaObject('flow-channel-source-1', '1', PLAYER_ONE_START_ZONE, {
            kind: 'conjuration',
            mana: 3,
            spellcastingSource: {
                abilityId: 'test-channel-source-1',
                channeling: 4,
            },
        });
        const resetState: MatchState<MageWarsCore> = {
            ...baseState,
            core: withArenaObject(
                withArenaObject(baseState.core, playerZeroChannelSource),
                playerOneChannelSource,
            ),
        };
        const manaBeforeZero = resetState.core.players['0'].mana;
        const manaBeforeOne = resetState.core.players['1'].mana;
        const channelingZero = resetState.core.players['0'].channeling;
        const channelingOne = resetState.core.players['1'].channeling;

        const channelResult = runCommand(resetState, {
            type: FLOW_COMMANDS.ADVANCE_PHASE,
            playerId: '0',
            payload: {},
        });

        expect(channelResult.success).toBe(true);
        // reset、channel 和无交互 upkeep 由正式流程自动推进，玩家首次决策点是 planning。
        expect(channelResult.state.sys.phase).toBe('planning');
        expect(channelResult.state.core.players['0'].mana).toBe(manaBeforeZero + channelingZero);
        expect(channelResult.state.core.players['1'].mana).toBe(manaBeforeOne + channelingOne);
        expect(channelResult.state.core.objects[playerZeroChannelSource.id].mana).toBe(3);
        expect(channelResult.state.core.objects[playerOneChannelSource.id].mana).toBe(7);
        expect(channelResult.events).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.MANA_CHANNELED,
                payload: expect.objectContaining({ playerId: '0', amount: channelingZero }),
            }),
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.MANA_CHANNELED,
                payload: expect.objectContaining({ playerId: '1', amount: channelingOne }),
            }),
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.OBJECT_MANA_CHANNELED,
                payload: expect.objectContaining({ ownerId: '0', objectId: playerZeroChannelSource.id, amount: 2 }),
            }),
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.OBJECT_MANA_CHANNELED,
                payload: expect.objectContaining({ ownerId: '1', objectId: playerOneChannelSource.id, amount: 4 }),
            }),
        ]));
        expect(channelResult.events.map((event) => event.type)).toEqual(expect.arrayContaining([
            'SYS_PHASE_CHANGED',
            MAGE_WARS_EVENTS.MANA_CHANNELED,
            MAGE_WARS_EVENTS.OBJECT_MANA_CHANNELED,
        ]));
        expect(actionLogKinds(channelResult.state)).toEqual(expect.arrayContaining([
            'SYS_PHASE_CHANGED',
            MAGE_WARS_EVENTS.MANA_CHANNELED,
        ]));

        const finalQuickcastState: MatchState<MageWarsCore> = {
            core: {
                ...channelResult.state.core,
                players: {
                    ...channelResult.state.core.players,
                    '1': {
                        ...channelResult.state.core.players['1'],
                        actionReady: false,
                        quickcastReady: false,
                        guarding: true,
                    },
                },
            },
            sys: { ...channelResult.state.sys, phase: 'finalQuickcast' },
        };

        const nextTurn = runCommand(finalQuickcastState, {
            type: FLOW_COMMANDS.ADVANCE_PHASE,
            playerId: '0',
            payload: {},
        });

        expect(nextTurn.success).toBe(true);
        expect(nextTurn.state.sys.phase).toBe('planning');
        expect(nextTurn.state.core.currentPlayerId).toBe('1');
        expect(nextTurn.state.core.phaseActorId).toBe('1');
        expect(nextTurn.state.core.turnNumber).toBe(1);
        expect(nextTurn.state.core.players['1']).toMatchObject({
            actionReady: true,
            quickcastReady: true,
            guarding: false,
        });
        expect(nextTurn.events.map((event) => event.type)).toEqual(expect.arrayContaining([
            MAGE_WARS_EVENTS.TURN_ADVANCED,
            MAGE_WARS_EVENTS.ACTION_READINESS_RESET,
        ]));
        expect(actionLogKinds(nextTurn.state)).toEqual(expect.arrayContaining([
            MAGE_WARS_EVENTS.TURN_ADVANCED,
            MAGE_WARS_EVENTS.ACTION_READINESS_RESET,
        ]));
    });

    it('emits a visible phase-window completion event when a player passes deployment or quickcast', () => {
        const deploymentBase = setupState('deployment');
        const deploymentState: MatchState<MageWarsCore> = {
            core: {
                ...deploymentBase.core,
                phaseReadyPlayerIds: [],
                phaseActorId: '0',
            },
            sys: deploymentBase.sys,
        };

        const passedDeployment = runCommand(deploymentState, {
            type: FLOW_COMMANDS.ADVANCE_PHASE,
            playerId: '0',
            payload: {},
        });

        expect(passedDeployment.success).toBe(true);
        expect(passedDeployment.state.sys.phase).toBe('deployment');
        expect(passedDeployment.state.core.phaseActorId).toBe('1');
        expect(passedDeployment.events).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.PHASE_WINDOW_COMPLETED,
                payload: expect.objectContaining({
                    playerId: '0',
                    phase: 'deployment',
                    nextActorId: '1',
                    readyPlayerIds: ['0'],
                }),
            }),
        ]));

        const quickcastBase = setupState('initiativeQuickcast');
        const quickcastState: MatchState<MageWarsCore> = {
            core: {
                ...quickcastBase.core,
                phaseReadyPlayerIds: [],
                phaseActorId: '0',
            },
            sys: quickcastBase.sys,
        };

        const passedQuickcast = runCommand(quickcastState, {
            type: FLOW_COMMANDS.ADVANCE_PHASE,
            playerId: '0',
            payload: {},
        });

        expect(passedQuickcast.success).toBe(true);
        expect(passedQuickcast.state.sys.phase).toBe('initiativeQuickcast');
        expect(passedQuickcast.state.core.phaseActorId).toBe('1');
        expect(passedQuickcast.events).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.PHASE_WINDOW_COMPLETED,
                payload: expect.objectContaining({
                    playerId: '0',
                    phase: 'initiativeQuickcast',
                    nextActorId: '1',
                    readyPlayerIds: ['0'],
                }),
            }),
        ]));
    });
});
