/**
 * functions/lib/crop-helper.js のテスト
 * 生育ステージ判定・収穫予測
 */

import { describe, it, expect } from 'vitest';
import { calculateStage, estimateHarvest } from '../functions/lib/crop-helper.js';

describe('calculateStage', () => {
  const stages = [
    { name: '発芽期', start_day: 0, end_day: 7 },
    { name: '成長期', start_day: 8, end_day: 30 },
    { name: '開花期', start_day: 31, end_day: 50 },
    { name: '結実期', start_day: 51, end_day: 90 },
  ];

  it('planted_atがnullの場合は未設定を返す', () => {
    const crop = { planted_at: null };
    const result = calculateStage(crop, stages);
    expect(result.name).toBe('未設定');
    expect(result.daysSincePlanting).toBeNull();
    expect(result.progress).toBe(0);
  });

  it('stagesが空の場合は未設定を返す', () => {
    const crop = { planted_at: '2025-01-01' };
    const result = calculateStage(crop, []);
    expect(result.name).toBe('未設定');
  });

  it('植え付け直後は発芽期', () => {
    const today = new Date();
    const planted = new Date(today);
    planted.setDate(planted.getDate() - 3); // 3日前
    const crop = { planted_at: planted.toISOString() };
    const result = calculateStage(crop, stages);
    expect(result.name).toBe('発芽期');
    expect(result.daysSincePlanting).toBe(3);
  });

  it('進捗率が100を超えない', () => {
    const planted = new Date();
    planted.setDate(planted.getDate() - 200); // 200日前（90日以上）
    const crop = { planted_at: planted.toISOString() };
    const result = calculateStage(crop, stages);
    expect(result.progress).toBeLessThanOrEqual(100);
  });

  it('startDay/endDay形式のステージにも対応', () => {
    const altStages = [
      { name: '播種期', startDay: 0, endDay: 5 },
      { name: '育苗期', startDay: 6, endDay: 20 },
    ];
    const planted = new Date();
    planted.setDate(planted.getDate() - 3);
    const crop = { planted_at: planted.toISOString() };
    const result = calculateStage(crop, altStages);
    expect(result.name).toBe('播種期');
  });
});

describe('estimateHarvest', () => {
  it('planted_atがnullの場合はnullを返す', () => {
    const result = estimateHarvest({ planted_at: null }, 90);
    expect(result).toBeNull();
  });

  it('growingDaysがnullの場合はnullを返す', () => {
    const result = estimateHarvest({ planted_at: '2025-01-01' }, null);
    expect(result).toBeNull();
  });

  it('収穫予測日と残り日数を返す', () => {
    const future = new Date();
    future.setDate(future.getDate() + 30);
    // 60日後に収穫予定 = 30日前に植えたとして
    const planted = new Date();
    planted.setDate(planted.getDate() - 30);
    const result = estimateHarvest({ planted_at: planted.toISOString() }, 60);

    expect(result).toBeTruthy();
    expect(result.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(result.daysRemaining).toBeGreaterThanOrEqual(29);
    expect(result.daysRemaining).toBeLessThanOrEqual(31);
  });

  it('収穫予定日を過ぎた場合はdaysRemaining=0', () => {
    const planted = new Date();
    planted.setDate(planted.getDate() - 100);
    const result = estimateHarvest({ planted_at: planted.toISOString() }, 30);
    expect(result.daysRemaining).toBe(0);
  });
});
