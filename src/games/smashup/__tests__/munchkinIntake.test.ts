import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

import { smashUpCriticalImageResolver } from '../criticalImageResolver';
import { getBaseDef, getBaseDefIdsForFactions, getFactionCards } from '../data/cards';
import {
    getMunchkinSpecialCardDescriptor,
    MUNCHKIN_MONSTER_CARDS,
    MUNCHKIN_MONSTER_DECK_DEF_IDS,
    MUNCHKIN_MONSTER_DECK_PREVIEW_DEF_ID,
    MUNCHKIN_MONSTER_DECK_SIZE,
    MUNCHKIN_TREASURE_CARDS,
    MUNCHKIN_TREASURE_DECK_DEF_IDS,
    MUNCHKIN_TREASURE_DECK_PREVIEW_DEF_ID,
    MUNCHKIN_TREASURE_DECK_SIZE,
} from '../data/factions/munchkin';
import { getSmashUpAtlasImageById, SMASHUP_ATLAS_DEFINITIONS } from '../domain/atlasCatalog';
import { hasMunchkinExpansionFaction } from '../domain/abilityHelpers';
import { SMASHUP_ATLAS_IDS, SMASHUP_FACTION_IDS } from '../domain/ids';
import { reduce } from '../domain/reducer';
import { SU_EVENTS } from '../domain/types';
import type { ActionCardDef, PlayerState, SmashUpCore } from '../domain/types';
import { getVisibleFactionMetadata, isFactionImplementationInProgress } from '../ui/factionMeta';

type MunchkinFixture = {
    factionId: string;
    cardAtlasId: string;
    cardAtlasImage: string;
    baseAtlasId: string;
    baseAtlasImage: string;
    expectedCardIndexes: Record<string, number>;
    expectedBases: Record<string, { index: number; breakpoint: number; vpAwards: [number, number, number] }>;
};

const MUNCHKIN_FIXTURES: MunchkinFixture[] = [
    {
        factionId: SMASHUP_FACTION_IDS.MUNCHKIN_DWARVES,
        cardAtlasId: SMASHUP_ATLAS_IDS.MUNCHKIN_DWARVES_CARDS,
        cardAtlasImage: 'smashup/cards/munchkin_dwarves',
        baseAtlasId: SMASHUP_ATLAS_IDS.MUNCHKIN_DWARVES_BASES,
        baseAtlasImage: 'smashup/base/munchkin_dwarves_bases',
        expectedCardIndexes: { munchkin_dwarves_dwarf_king: 0, munchkin_dwarves_salvage: 19 },
        expectedBases: {
            base_the_mines: { index: 0, breakpoint: 18, vpAwards: [4, 2, 1] },
            base_treasure_bath: { index: 1, breakpoint: 12, vpAwards: [2, 0, 0] },
        },
    },
    {
        factionId: SMASHUP_FACTION_IDS.MUNCHKIN_HALFLINGS,
        cardAtlasId: SMASHUP_ATLAS_IDS.MUNCHKIN_HALFLINGS_CARDS,
        cardAtlasImage: 'smashup/cards/munchkin_halflings',
        baseAtlasId: SMASHUP_ATLAS_IDS.MUNCHKIN_HALFLINGS_BASES,
        baseAtlasImage: 'smashup/base/munchkin_halflings_bases',
        expectedCardIndexes: { munchkin_halflings_shire_marshal: 0, munchkin_halflings_unexpected_party: 18 },
        expectedBases: {
            base_birthday_party: { index: 0, breakpoint: 20, vpAwards: [4, 2, 1] },
            base_subterranean_lair: { index: 1, breakpoint: 23, vpAwards: [5, 3, 2] },
        },
    },
    {
        factionId: SMASHUP_FACTION_IDS.MUNCHKIN_THIEVES,
        cardAtlasId: SMASHUP_ATLAS_IDS.MUNCHKIN_THIEVES_CARDS,
        cardAtlasImage: 'smashup/cards/munchkin_thieves',
        baseAtlasId: SMASHUP_ATLAS_IDS.MUNCHKIN_THIEVES_BASES,
        baseAtlasImage: 'smashup/base/munchkin_thieves_bases',
        expectedCardIndexes: { munchkin_thieves_master_thief: 0, munchkin_thieves_swipe: 18 },
        expectedBases: {
            base_the_coffers: { index: 0, breakpoint: 18, vpAwards: [4, 2, 1] },
            base_thieves_guild: { index: 1, breakpoint: 19, vpAwards: [4, 3, 2] },
        },
    },
    {
        factionId: SMASHUP_FACTION_IDS.MUNCHKIN_MAGES,
        cardAtlasId: SMASHUP_ATLAS_IDS.MUNCHKIN_MAGES_CARDS,
        cardAtlasImage: 'smashup/cards/munchkin_mages',
        baseAtlasId: SMASHUP_ATLAS_IDS.MUNCHKIN_MAGES_BASES,
        baseAtlasImage: 'smashup/base/munchkin_mages_bases',
        expectedCardIndexes: { munchkin_mages_blaster_master: 0, munchkin_mages_zzzzzap: 18 },
        expectedBases: {
            base_dimension_doors: { index: 0, breakpoint: 20, vpAwards: [4, 2, 1] },
            base_mages_tower: { index: 1, breakpoint: 18, vpAwards: [4, 3, 2] },
        },
    },
    {
        factionId: SMASHUP_FACTION_IDS.MUNCHKIN_ELVES,
        cardAtlasId: SMASHUP_ATLAS_IDS.MUNCHKIN_ELVES_CARDS,
        cardAtlasImage: 'smashup/cards/munchkin_elves',
        baseAtlasId: SMASHUP_ATLAS_IDS.MUNCHKIN_ELVES_BASES,
        baseAtlasImage: 'smashup/base/munchkin_elves_bases',
        expectedCardIndexes: { munchkin_elves_fae_fighter: 0, munchkin_elves_traveling_elf: 19 },
        expectedBases: {
            base_helpers_hollow: { index: 0, breakpoint: 17, vpAwards: [3, 2, 1] },
            base_treehouse: { index: 1, breakpoint: 15, vpAwards: [4, 2, 1] },
        },
    },
    {
        factionId: SMASHUP_FACTION_IDS.MUNCHKIN_CLERICS,
        cardAtlasId: SMASHUP_ATLAS_IDS.MUNCHKIN_CLERICS_CARDS,
        cardAtlasImage: 'smashup/cards/munchkin_clerics',
        baseAtlasId: SMASHUP_ATLAS_IDS.MUNCHKIN_CLERICS_BASES,
        baseAtlasImage: 'smashup/base/munchkin_clerics_bases',
        expectedCardIndexes: { munchkin_clerics_cardinal: 0, munchkin_clerics_word_of_recall: 19 },
        expectedBases: {
            base_hotel_of_holiness: { index: 0, breakpoint: 15, vpAwards: [4, 3, 2] },
            base_whack_a_ghoul: { index: 1, breakpoint: 12, vpAwards: [3, 2, 1] },
        },
    },
    {
        factionId: SMASHUP_FACTION_IDS.MUNCHKIN_ORCS,
        cardAtlasId: SMASHUP_ATLAS_IDS.MUNCHKIN_ORCS_CARDS,
        cardAtlasImage: 'smashup/cards/munchkin_orcs',
        baseAtlasId: SMASHUP_ATLAS_IDS.MUNCHKIN_ORCS_BASES,
        baseAtlasImage: 'smashup/base/munchkin_orcs_bases',
        expectedCardIndexes: { munchkin_orcs_sword_lord: 0, munchkin_orcs_too_tough: 19 },
        expectedBases: {
            base_garrison: { index: 0, breakpoint: 12, vpAwards: [3, 2, 1] },
            base_the_pits: { index: 1, breakpoint: 16, vpAwards: [4, 2, 1] },
        },
    },
    {
        factionId: SMASHUP_FACTION_IDS.MUNCHKIN_WARRIORS,
        cardAtlasId: SMASHUP_ATLAS_IDS.MUNCHKIN_WARRIORS_CARDS,
        cardAtlasImage: 'smashup/cards/munchkin_warriors',
        baseAtlasId: SMASHUP_ATLAS_IDS.MUNCHKIN_WARRIORS_BASES,
        baseAtlasImage: 'smashup/base/munchkin_warriors_bases',
        expectedCardIndexes: { munchkin_warriors_big_hero: 0, munchkin_warriors_war_cry: 19 },
        expectedBases: {
            base_bastion: { index: 0, breakpoint: 11, vpAwards: [3, 2, 2] },
            base_the_gauntlet: { index: 1, breakpoint: 14, vpAwards: [5, 3, 2] },
        },
    },
];

function loadLocale(locale: 'zh-CN' | 'en') {
    return JSON.parse(
        readFileSync(resolve(__dirname, '../../../../public/locales/' + locale + '/game-smashup.json'), 'utf8'),
    ) as {
        factions: Record<string, { name?: string; description?: string }>;
        cards: Record<string, { name?: string; abilityText?: string; effectText?: string }>;
    };
}

function makePlayingState(factions: Record<string, [string, string]>) {
    return {
        sys: { phase: 'playCards' },
        core: {
            players: Object.fromEntries(
                Object.entries(factions).map(([pid, picked]) => [pid, { factions: picked }]),
            ),
        },
    };
}

function makePlayer(
    id: string,
    factions: [string, string] = [SMASHUP_FACTION_IDS.ALIENS, SMASHUP_FACTION_IDS.DINOSAURS],
): PlayerState {
    return {
        id,
        vp: 0,
        hand: [],
        deck: [],
        discard: [],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        factions,
    };
}

function makeFactionSelectedCore(playerSelections: Record<string, [string, string]>): SmashUpCore {
    const players = Object.fromEntries(
        Object.entries(playerSelections).map(([playerId, factions]) => [playerId, makePlayer(playerId, factions)]),
    ) as SmashUpCore['players'];

    return {
        players,
        turnOrder: Object.keys(players),
        currentPlayerIndex: 0,
        bases: [{ defId: 'base_the_jungle', minions: [], ongoingActions: [] }],
        baseDeck: [],
        turnNumber: 1,
        nextUid: 100,
        factionSelection: {
            takenFactions: Object.values(playerSelections).flat(),
            playerSelections,
            completedPlayers: Object.keys(playerSelections),
        },
    };
}

function allFactionsSelectedEvent() {
    return {
        type: SU_EVENTS.ALL_FACTIONS_SELECTED,
        payload: {
            readiedPlayers: {
                '0': { deck: [], hand: [] },
                '1': { deck: [], hand: [] },
            },
            nextUid: 200,
        },
        timestamp: 1000,
    };
}

describe('SmashUp Munchkin intake 静态合同', () => {
    it('8 个派系手牌和基地 atlas 均已注册，宝藏/怪物只注册为特殊图集', () => {
        for (const fixture of MUNCHKIN_FIXTURES) {
            expect(getSmashUpAtlasImageById(fixture.cardAtlasId)).toBe(fixture.cardAtlasImage);
            expect(getSmashUpAtlasImageById(fixture.baseAtlasId)).toBe(fixture.baseAtlasImage);
        }

        expect(getSmashUpAtlasImageById(SMASHUP_ATLAS_IDS.MUNCHKIN_TREASURES_CARDS)).toBe('smashup/cards/munchkin_treasures');
        expect(getSmashUpAtlasImageById(SMASHUP_ATLAS_IDS.MUNCHKIN_MONSTERS_CARDS)).toBe('smashup/cards/munchkin_monsters');
        expect(SMASHUP_ATLAS_DEFINITIONS).toEqual(expect.arrayContaining([
            { id: SMASHUP_ATLAS_IDS.MUNCHKIN_TREASURES_CARDS, kind: 'card', image: 'smashup/cards/munchkin_treasures', grid: { rows: 5, cols: 5 } },
            { id: SMASHUP_ATLAS_IDS.MUNCHKIN_MONSTERS_CARDS, kind: 'card', image: 'smashup/cards/munchkin_monsters', grid: { rows: 4, cols: 5 } },
        ]));
    });

    it.each(MUNCHKIN_FIXTURES)('$factionId 注册 12 个唯一卡面与 20 张实体', (fixture) => {
        const cards = getFactionCards(fixture.factionId);

        expect(cards).toHaveLength(12);
        expect(cards.reduce((sum, card) => sum + card.count, 0)).toBe(20);

        for (const [defId, index] of Object.entries(fixture.expectedCardIndexes)) {
            expect(cards.find(card => card.id === defId)?.previewRef).toEqual({
                type: 'atlas',
                atlasId: fixture.cardAtlasId,
                index,
            });
        }
    });

    it.each(MUNCHKIN_FIXTURES)('$factionId 只返回本派系两张基地', (fixture) => {
        expect(getBaseDefIdsForFactions([fixture.factionId]).sort()).toEqual(
            Object.keys(fixture.expectedBases).sort(),
        );

        for (const [baseId, expected] of Object.entries(fixture.expectedBases)) {
            expect(getBaseDef(baseId)).toMatchObject({
                faction: fixture.factionId,
                breakpoint: expected.breakpoint,
                vpAwards: expected.vpAwards,
                previewRef: { type: 'atlas', atlasId: fixture.baseAtlasId, index: expected.index },
            });
        }
    });

    it('8 个派系在选择页可见，已收口派系不再保持实施中状态', () => {
        const visible = new Set(getVisibleFactionMetadata('zh-CN', ['titans']).map(meta => meta.id));

        for (const fixture of MUNCHKIN_FIXTURES) {
            expect(visible.has(fixture.factionId)).toBe(true);
        }
        const configuredFactions = new Set([
            SMASHUP_FACTION_IDS.MUNCHKIN_DWARVES,
            SMASHUP_FACTION_IDS.MUNCHKIN_ELVES,
            SMASHUP_FACTION_IDS.MUNCHKIN_CLERICS,
        ]);
        for (const factionId of configuredFactions) {
            expect(isFactionImplementationInProgress(factionId)).toBe(false);
        }

        for (const fixture of MUNCHKIN_FIXTURES.filter(fixture =>
            !configuredFactions.has(fixture.factionId)
        )) {
            expect(isFactionImplementationInProgress(fixture.factionId)).toBe(true);
        }
    });

    it('关键图片预加载命中所选 Munchkin 派系卡图与基地图集', () => {
        const resolved = smashUpCriticalImageResolver(
            makePlayingState({
                '0': [SMASHUP_FACTION_IDS.MUNCHKIN_DWARVES, SMASHUP_FACTION_IDS.MUNCHKIN_WARRIORS],
                '1': [SMASHUP_FACTION_IDS.MUNCHKIN_MAGES, SMASHUP_FACTION_IDS.MUNCHKIN_CLERICS],
            }),
            undefined,
            '0',
        );

        expect(resolved.critical).toContain('smashup/cards/munchkin_dwarves');
        expect(resolved.critical).toContain('smashup/base/munchkin_dwarves_bases');
        expect(resolved.critical).toContain('smashup/cards/munchkin_warriors');
        expect(resolved.critical).toContain('smashup/base/munchkin_warriors_bases');
    });

    it('宝藏和怪物公共牌堆按图集合同展开为 22 张宝藏、20 张怪物', () => {
        expect(MUNCHKIN_TREASURE_CARDS).toHaveLength(22);
        expect(MUNCHKIN_TREASURE_DECK_SIZE).toBe(22);
        expect(MUNCHKIN_TREASURE_DECK_DEF_IDS).toHaveLength(22);
        expect(new Set(MUNCHKIN_TREASURE_DECK_DEF_IDS).size).toBe(22);
        expect(getMunchkinSpecialCardDescriptor(MUNCHKIN_TREASURE_DECK_PREVIEW_DEF_ID)?.previewRef).toEqual({
            type: 'atlas',
            atlasId: SMASHUP_ATLAS_IDS.MUNCHKIN_TREASURES_CARDS,
            index: 0,
        });

        expect(MUNCHKIN_MONSTER_CARDS).toHaveLength(8);
        expect(MUNCHKIN_MONSTER_DECK_SIZE).toBe(20);
        expect(MUNCHKIN_MONSTER_DECK_DEF_IDS).toHaveLength(20);
        expect(getMunchkinSpecialCardDescriptor(MUNCHKIN_MONSTER_DECK_PREVIEW_DEF_ID)?.previewRef).toEqual({
            type: 'atlas',
            atlasId: SMASHUP_ATLAS_IDS.MUNCHKIN_MONSTERS_CARDS,
            index: 0,
        });
        expect(MUNCHKIN_MONSTER_DECK_DEF_IDS.filter(id => id === 'munchkin_monster_bigfoot')).toHaveLength(2);
        expect(MUNCHKIN_MONSTER_DECK_DEF_IDS.filter(id => id === 'munchkin_monster_fowl_fiend')).toHaveLength(4);
    });

    it('8 张唯一怪物逐对象保留力量、宝藏奖励和实体牌数量合同', () => {
        expect(MUNCHKIN_MONSTER_CARDS).toHaveLength(8);

        for (const monster of MUNCHKIN_MONSTER_CARDS) {
            expect(monster.id).toMatch(/^munchkin_monster_/);
            expect(monster.kind).toBe('monster');
            expect(monster.power).toEqual(expect.any(Number));
            expect(monster.treasureReward).toEqual(expect.any(Number));
            expect(monster.previewRef).toEqual({
                type: 'atlas',
                atlasId: SMASHUP_ATLAS_IDS.MUNCHKIN_MONSTERS_CARDS,
                index: monster.previewRef.index,
            });
            expect(MUNCHKIN_MONSTER_DECK_DEF_IDS.filter(id => id === monster.id)).toHaveLength(monster.count);
        }
    });

    it('选到 Munchkin 派系后初始化怪物和宝藏公共牌堆，未选时保持不显示', () => {
        expect(hasMunchkinExpansionFaction({
            '0': { factions: [SMASHUP_FACTION_IDS.MUNCHKIN_DWARVES, SMASHUP_FACTION_IDS.ALIENS] },
            '1': { factions: [SMASHUP_FACTION_IDS.PIRATES, SMASHUP_FACTION_IDS.NINJAS] },
        })).toBe(true);

        const withMunchkin = reduce(makeFactionSelectedCore({
            '0': [SMASHUP_FACTION_IDS.MUNCHKIN_DWARVES, SMASHUP_FACTION_IDS.ALIENS],
            '1': [SMASHUP_FACTION_IDS.PIRATES, SMASHUP_FACTION_IDS.NINJAS],
        }), allFactionsSelectedEvent() as any);
        expect(withMunchkin.monsterDeck).toEqual(MUNCHKIN_MONSTER_DECK_DEF_IDS);
        expect(withMunchkin.treasureDeck).toEqual(MUNCHKIN_TREASURE_DECK_DEF_IDS);

        const withoutMunchkin = reduce(makeFactionSelectedCore({
            '0': [SMASHUP_FACTION_IDS.ALIENS, SMASHUP_FACTION_IDS.DINOSAURS],
            '1': [SMASHUP_FACTION_IDS.PIRATES, SMASHUP_FACTION_IDS.NINJAS],
        }), allFactionsSelectedEvent() as any);
        expect(withoutMunchkin.monsterDeck).toBeUndefined();
        expect(withoutMunchkin.treasureDeck).toBeUndefined();
    });

    it('中英文 locale 覆盖派系、卡牌名称和行动规则文本', () => {
        const zhCN = loadLocale('zh-CN');
        const en = loadLocale('en');

        for (const fixture of MUNCHKIN_FIXTURES) {
            expect(zhCN.factions[fixture.factionId]?.name).toBeTruthy();
            expect(en.factions[fixture.factionId]?.name).toBeTruthy();

            for (const card of getFactionCards(fixture.factionId)) {
                expect(zhCN.cards[card.id]?.name, 'zh-CN cards.' + card.id + '.name').toBeTruthy();
                expect(en.cards[card.id]?.name, 'en cards.' + card.id + '.name').toBeTruthy();
                if (card.type === 'action') {
                    const zhEffectText = zhCN.cards[(card as ActionCardDef).id]?.effectText;
                    const enEffectText = en.cards[(card as ActionCardDef).id]?.effectText;
                    expect(zhEffectText, 'zh-CN cards.' + card.id + '.effectText').toBeTruthy();
                    expect(enEffectText, 'en cards.' + card.id + '.effectText').toBeTruthy();
                    expect(
                        zhEffectText,
                        'zh-CN cards.' + card.id + '.effectText',
                    ).not.toContain('当前仅完成静态接入');
                }
            }
        }
    });
});
