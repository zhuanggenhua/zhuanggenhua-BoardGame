import { describe, expect, it } from 'vitest';
import {
  buildSmashUpConfigReviewTable,
  getSmashUpConfigReviewCellValue,
  isSmashUpConfigReviewFieldApplicable,
  SMASHUP_CONFIG_REVIEW_COLUMN_KEYS,
  SMASHUP_CONFIG_REVIEW_FIELD_DEFINITIONS,
  SMASHUP_CONFIG_REVIEW_TABLE_ID,
  SMASHUP_CONFIG_REVIEW_VERSION,
} from '../config/configReviewAdapter';
import { getAllBaseDefs, getAllCardDefs } from '../data/cards';
import { SMASHUP_FACTION_IDS } from '../domain/ids';
import { FACTION_METADATA } from '../ui/factionMeta';

describe('SmashUp configReviewAdapter', () => {
  it('从现有大杀四方 TS 配置产出同源审查表格行', () => {
    const table = buildSmashUpConfigReviewTable();

    expect(table.tableId).toBe(SMASHUP_CONFIG_REVIEW_TABLE_ID);
    expect(table.gameId).toBe('smashup');
    expect(table.configVersion).toBe(SMASHUP_CONFIG_REVIEW_VERSION);
    expect(table.rows).toHaveLength(
      FACTION_METADATA.length + getAllCardDefs().length + getAllBaseDefs().length,
    );
    expect(table.rows.some((row) => row.objectType === 'faction')).toBe(true);
    expect(table.rows.some((row) => row.objectType === 'base')).toBe(true);
    expect(table.rows.some((row) => row.objectType === 'minion')).toBe(true);
    expect(table.rows.some((row) => row.objectType === 'action')).toBe(true);
  });

  it('保留派系元数据、实施状态和字段级反馈路径', () => {
    const table = buildSmashUpConfigReviewTable();
    const frozen = table.rows.find((row) => row.objectType === 'faction' && row.objectId === SMASHUP_FACTION_IDS.FROZEN);
    const aladdin = table.rows.find((row) => row.objectType === 'faction' && row.objectId === SMASHUP_FACTION_IDS.ALADDIN);
    const dwarves = table.rows.find((row) => row.objectType === 'faction' && row.objectId === SMASHUP_FACTION_IDS.MUNCHKIN_DWARVES);
    const elves = table.rows.find((row) => row.objectType === 'faction' && row.objectId === SMASHUP_FACTION_IDS.MUNCHKIN_ELVES);
    const clerics = table.rows.find((row) => row.objectType === 'faction' && row.objectId === SMASHUP_FACTION_IDS.MUNCHKIN_CLERICS);

    expect(frozen).toMatchObject({
      nameKey: 'factions.frozen.name',
      descriptionKey: 'factions.frozen.description',
      implementationStatus: 'configured',
    });
    expect(aladdin).toMatchObject({
      nameKey: 'factions.aladdin.name',
      descriptionKey: 'factions.aladdin.description',
      implementationStatus: 'configured',
    });
    expect(dwarves).toMatchObject({
      nameKey: 'factions.munchkin_dwarves.name',
      descriptionKey: 'factions.munchkin_dwarves.description',
      implementationStatus: 'configured',
    });
    expect(elves).toMatchObject({
      nameKey: 'factions.munchkin_elves.name',
      descriptionKey: 'factions.munchkin_elves.description',
      implementationStatus: 'configured',
    });
    expect(clerics).toMatchObject({
      nameKey: 'factions.munchkin_clerics.name',
      descriptionKey: 'factions.munchkin_clerics.description',
      implementationStatus: 'configured',
    });
    expect(aladdin?.fieldPaths.color).toBe('legacy.smashup.factionMetadata.aladdin.color');
  });

  it('卡牌行暴露运行时消费字段、素材预览引用和配置路径', () => {
    const table = buildSmashUpConfigReviewTable();
    const snowgie = table.rows.find((row) => row.objectId === 'frozen_snowgie');
    const aladdin = table.rows.find((row) => row.objectId === 'aladdin_aladdin');
    const titan = table.rows.find((row) => row.objectType === 'titan');

    expect(snowgie).toMatchObject({
      objectType: 'minion',
      cardType: 'minion',
      factionId: SMASHUP_FACTION_IDS.FROZEN,
      quantity: 4,
      power: 2,
      abilityTags: ['onPlay'],
      materialStatus: 'ready',
    });
    expect(snowgie?.previewRef).toMatchObject({ type: 'atlas' });
    expect(snowgie?.fieldPaths.quantity).toBe('legacy.smashup.cardRegistry.frozen_snowgie.count');
    expect(snowgie?.fieldPaths.previewRef).toBe('legacy.smashup.cardRegistry.frozen_snowgie.previewRef');

    expect(aladdin?.activationWindows).toContain('talent:board:playCards');
    expect(aladdin?.playRequirements).toEqual([]);
    expect(getSmashUpConfigReviewCellValue(aladdin!, 'abilityTags')).toEqual(['onPlay', 'talent']);
    expect(titan?.quantity).toBe(1);
  });

  it('基地行暴露临界点、VP 奖励、特殊设置和图集状态', () => {
    const table = buildSmashUpConfigReviewTable();
    const icePalace = table.rows.find((row) => row.objectId === 'base_ice_palace');
    const munchkinBase = table.rows.find((row) => row.objectType === 'base' && row.playRequirements.some((entry) => entry.startsWith('monsterCount:')));

    expect(icePalace).toMatchObject({
      objectType: 'base',
      factionId: SMASHUP_FACTION_IDS.FROZEN,
      breakpoint: 22,
      vpAwards: ['4', '2', '1'],
      materialStatus: 'ready',
    });
    expect(icePalace?.previewRef).toMatchObject({ type: 'atlas' });
    expect(icePalace?.fieldPaths.breakpoint).toBe('legacy.smashup.baseRegistry.base_ice_palace.breakpoint');
    expect(icePalace?.fieldPaths.previewStatus).toBe('legacy.smashup.baseRegistry.base_ice_palace.previewRef');

    expect(munchkinBase?.playRequirements.some((entry) => entry.startsWith('monsterCount:'))).toBe(true);
  });

  it('主表只显示可审查字段，不把图集编号和源码上下文当成主列', () => {
    const requiredFields = SMASHUP_CONFIG_REVIEW_FIELD_DEFINITIONS.filter((definition) => definition.requiredForAudit);
    const requiredKeys = requiredFields.map((definition) => definition.key);
    const visibleColumns = new Set(SMASHUP_CONFIG_REVIEW_COLUMN_KEYS);

    expect(requiredKeys).toEqual(expect.arrayContaining([
      'name',
      'faction',
      'implementationStatus',
      'cardType',
      'quantity',
      'power',
      'abilityTags',
      'activationWindows',
      'playRequirements',
      'breakpoint',
      'vpAwards',
      'baseRestrictions',
      'previewStatus',
    ]));
    expect(requiredFields.filter((definition) => definition.evidence.length === 0)).toEqual([]);

    for (const fieldKey of requiredKeys) {
      expect(visibleColumns.has(fieldKey)).toBe(true);
    }

    expect(SMASHUP_CONFIG_REVIEW_COLUMN_KEYS).not.toEqual(expect.arrayContaining([
      'id',
      'rowType',
      'sourceContexts',
      'previewRef',
      'previewImage',
      'previewAtlas',
      'previewIndex',
      'fieldPaths',
    ]));
  });

  it('字段定义同时驱动值读取、适用对象和稳定修改路径', () => {
    const table = buildSmashUpConfigReviewTable();
    const faction = table.rows.find((row) => row.objectType === 'faction' && row.objectId === SMASHUP_FACTION_IDS.ALADDIN);
    const card = table.rows.find((row) => row.objectId === 'aladdin_carpet');
    const base = table.rows.find((row) => row.objectId === 'base_agrabah_bazaar');

    expect(faction).toBeDefined();
    expect(card).toBeDefined();
    expect(base).toBeDefined();
    if (!faction || !card || !base) return;

    expect(getSmashUpConfigReviewCellValue(faction, 'nameKey')).toBe('factions.aladdin.name');
    expect(getSmashUpConfigReviewCellValue(card, 'quantity')).toBe(1);
    expect(getSmashUpConfigReviewCellValue(base, 'vpAwards')).toEqual(['4', '2', '1']);

    expect(isSmashUpConfigReviewFieldApplicable(faction, 'color')).toBe(true);
    expect(isSmashUpConfigReviewFieldApplicable(faction, 'cardType')).toBe(false);
    expect(isSmashUpConfigReviewFieldApplicable(card, 'power')).toBe(true);
    expect(isSmashUpConfigReviewFieldApplicable(card, 'breakpoint')).toBe(false);
    expect(isSmashUpConfigReviewFieldApplicable(base, 'breakpoint')).toBe(true);

    for (const columnKey of SMASHUP_CONFIG_REVIEW_COLUMN_KEYS) {
      if (columnKey === 'image') continue;
      expect(card.fieldPaths[columnKey]).toEqual(expect.any(String));
    }
  });
});
