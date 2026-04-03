/**
 * GET /api/farms/:farmId/suggestions/today — 今日のAI提案を取得
 * プランごとの回数制限: free=1日1回, light=1日3回, pro=無制限
 */

import { requireAuth } from '../../../../lib/auth-helper.js';
import { getForecast } from '../../../../lib/weather-helper.js';
import { calculateStage } from '../../../../lib/crop-helper.js';
import { generateUlid, jsonResponse, errorResponse } from '../../../../lib/utils.js';

/** プランごとの1日あたりAI提案上限（0 = 無制限） */
const PLAN_SUGGESTION_LIMITS = {
  free: 1,
  light: 3,
  pro: 0,
};

export async function onRequestGet(context) {
  const { request, env, params } = context;
  const farmId = params.farmId;

  const auth = await requireAuth(request, env);
  if (auth.error) return auth.error;
  const { userId } = auth;

  // 畑の所有権チェック
  const farm = await env.DB.prepare(
    'SELECT id, name, latitude, longitude, address FROM farms WHERE id = ? AND user_id = ?'
  ).bind(farmId, userId).first();
  if (!farm) return errorResponse('畑が見つかりません', 404);

  const today = new Date().toISOString().split('T')[0];

  // --- 修正2対応: DBからプランを都度取得（JWT内のplanは使わない） ---
  const userRow = await env.DB.prepare(
    'SELECT plan FROM users WHERE id = ?'
  ).bind(userId).first();
  const plan = userRow ? userRow.plan : 'free';

  // 当日の提案数をカウント（全畑合計）
  const countRow = await env.DB.prepare(
    'SELECT COUNT(*) as cnt FROM suggestions WHERE user_id = ? AND date = ?'
  ).bind(userId, today).first();
  const todayCount = countRow ? countRow.cnt : 0;

  // プラン上限チェック
  const limit = PLAN_SUGGESTION_LIMITS[plan] ?? 1;
  if (limit > 0 && todayCount >= limit) {
    return errorResponse(
      `本日のAI提案回数上限（${limit}回）に達しました。プランをアップグレードすると回数が増えます。`,
      429
    );
  }

  // この畑の当日キャッシュチェック（同一畑で同日に再取得した場合はキャッシュ返却）
  const cached = await env.DB.prepare(
    'SELECT items, weather_summary FROM suggestions WHERE user_id = ? AND farm_id = ? AND date = ? ORDER BY created_at DESC LIMIT 1'
  ).bind(userId, farmId, today).first();

  // キャッシュヒット時: 同一畑の同日再取得なので追加カウントしない（意図的）
  // 理由: 同じ畑の同じ日のデータを再表示するだけなので、API呼び出しは発生しない
  // 異なる畑へのリクエストはキャッシュミスとなり、通常通りカウントされる
  if (cached) {
    return jsonResponse({
      date: today,
      items: JSON.parse(cached.items),
      weatherSummary: cached.weather_summary,
      cached: true,
      remaining: limit > 0 ? limit - todayCount : null,
    });
  }

  try {
    // 天気データ取得
    const weather = await getForecast(farm, env);

    // 作物一覧+ステージ情報取得
    const { results: crops } = await env.DB.prepare(
      `SELECT c.id, c.name, c.planted_at, c.status, c.notes,
              m.name as master_name, m.stages as master_stages, m.frost_sensitive, m.water_needs
       FROM crops c
       LEFT JOIN crop_master m ON c.crop_type = m.id
       WHERE c.farm_id = ? AND c.user_id = ? AND c.status != 'done'`
    ).bind(farmId, userId).all();

    // 作物情報を整形
    const cropsInfo = (crops || []).map(c => {
      const stages = c.master_stages ? JSON.parse(c.master_stages) : [];
      const stage = calculateStage(c, stages);
      return {
        name: c.name || c.master_name,
        stage: stage.name,
        daysSincePlanting: stage.daysSincePlanting,
        progress: stage.progress,
        frostSensitive: !!c.frost_sensitive,
        waterNeeds: c.water_needs,
        notes: c.notes,
      };
    });

    // AI提案を生成（またはモック）
    let items;
    if (!env.GEMINI_API_KEY) {
      items = getMockSuggestions();
    } else {
      items = await generateWithGemini(weather, cropsInfo, env);
    }

    // 天気サマリー
    const weatherSummary = `${weather.current.weather} ${weather.current.temp}℃（${weather.current.temp_min}〜${weather.current.temp_max}℃）`;

    // D1に保存
    const id = generateUlid();
    await env.DB.prepare(
      `INSERT INTO suggestions (id, user_id, farm_id, date, items, weather_summary, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(id, userId, farmId, today, JSON.stringify(items), weatherSummary, new Date().toISOString()).run();

    const newCount = todayCount + 1;
    return jsonResponse({
      date: today,
      items,
      weatherSummary,
      cached: false,
      remaining: limit > 0 ? limit - newCount : null,
    });
  } catch (err) {
    console.error('提案生成エラー:', err);
    return jsonResponse({
      date: today,
      items: getMockSuggestions(),
      weatherSummary: 'データ取得中にエラーが発生しました',
      cached: false,
      fallback: true,
    });
  }
}

/** Gemini 2.0 Flash API 呼び出し */
async function generateWithGemini(weather, cropsInfo, env) {
  const weatherText = `現在: ${weather.current.weather} ${weather.current.temp}℃, 湿度${weather.current.humidity}%, 風速${weather.current.wind_speed}m/s\n` +
    weather.forecast.map(f => `${f.date}: ${f.weather} ${f.temp_min}〜${f.temp_max}℃ 降水${f.precipitation}%`).join('\n') +
    (weather.alerts.length > 0 ? '\nアラート: ' + weather.alerts.map(a => a.message).join(', ') : '');

  const cropsText = cropsInfo.length > 0
    ? cropsInfo.map(c => `- ${c.name}（${c.stage}、植え付け${c.daysSincePlanting ?? '未定'}日目、進捗${c.progress}%、水やり需要: ${c.waterNeeds || '普通'}）`).join('\n')
    : '栽培中の作物はありません';

  const prompt = `あなたは家庭菜園の専門家です。以下の条件から、今日やるべき作業を3〜5つ提案してください。

## 天気情報
${weatherText}

## 栽培中の作物
${cropsText}

## 出力形式（JSON配列のみ出力、他のテキストは不要）
[
  {"priority": "high/medium/low", "icon": "💧/🌱/✂️/🛡️/📝", "title": "作業タイトル", "description": "具体的な作業内容と理由", "crop": "対象作物名 or null"}
]

注意: 天気に基づいた具体的なアドバイスを。「水やりは朝のうちに」のように時間帯も指定。`;

  // APIキーはURLパラメータではなくヘッダーで送信（セキュリティ向上）
  const apiUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

  const res = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': env.GEMINI_API_KEY,
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 1024,
        responseMimeType: 'application/json',
      },
    }),
  });

  if (!res.ok) {
    console.error('Gemini API error:', res.status);
    return getMockSuggestions();
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '[]';

  try {
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return JSON.parse(text);
  } catch {
    console.error('Gemini response parse error:', text);
    return getMockSuggestions();
  }
}

/** モックデータ（Gemini APIキー未設定時） */
function getMockSuggestions() {
  return [
    { priority: 'high', icon: '💧', title: 'トマトの水やり', description: '今日は晴れで気温24℃予想。朝のうちに根元にたっぷり水やりしましょう。', crop: 'トマト' },
    { priority: 'medium', icon: '🌱', title: 'キュウリの支柱チェック', description: '風速3m/sの予報。つるが支柱にしっかり絡んでいるか確認しましょう。', crop: 'キュウリ' },
    { priority: 'medium', icon: '✂️', title: 'レタスの間引き', description: '種まきから14日目。本葉2〜3枚になったら間引きの時期です。', crop: 'レタス' },
    { priority: 'low', icon: '📝', title: '明後日の雨対策準備', description: '降水確率70%の雨予報。トマトのビニール被せの準備をしておきましょう。', crop: null },
  ];
}
