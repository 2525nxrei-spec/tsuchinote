/**
 * ツチノート — 作物共通ヘルパー
 * 生育ステージ判定・収穫予測
 */

/**
 * 生育ステージ判定
 * planted_at からの経過日数で stages 配列から現在のステージを特定
 */
export function calculateStage(crop, stages) {
  if (!crop.planted_at || !stages || stages.length === 0) {
    return { name: '未設定', daysSincePlanting: null, progress: 0 };
  }

  const planted = new Date(crop.planted_at);
  const now = new Date();
  const daysSince = Math.floor((now - planted) / (1000 * 60 * 60 * 24));

  // stages = [{ name: "発芽期", start_day: 0, end_day: 7 }, ...]
  let currentStage = stages[stages.length - 1];
  for (const s of stages) {
    const startDay = s.start_day ?? s.startDay ?? 0;
    const endDay = s.end_day ?? s.endDay ?? 0;
    if (daysSince >= startDay && daysSince <= endDay) {
      currentStage = s;
      break;
    }
  }

  const lastStage = stages[stages.length - 1];
  const totalDays = lastStage?.end_day ?? lastStage?.endDay ?? 1;
  const progress = Math.min(100, Math.round((daysSince / totalDays) * 100));

  return {
    name: currentStage.name,
    daysSincePlanting: daysSince,
    progress,
  };
}

/**
 * 収穫予測日を計算
 */
export function estimateHarvest(crop, growingDays) {
  if (!crop.planted_at || !growingDays) return null;

  const planted = new Date(crop.planted_at);
  const harvest = new Date(planted);
  harvest.setDate(harvest.getDate() + growingDays);

  const now = new Date();
  const daysRemaining = Math.ceil((harvest - now) / (1000 * 60 * 60 * 24));

  return {
    date: harvest.toISOString().split('T')[0],
    daysRemaining: Math.max(0, daysRemaining),
  };
}
