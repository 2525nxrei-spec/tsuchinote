/**
 * ツチノート — 天気共通ヘルパー
 * OpenWeatherMap API + キャッシュ + モックモード
 */

import { generateUlid } from './utils.js';

// 天気を日本語に変換するマッピング
const WEATHER_JA = {
  'Clear': '晴れ',
  'Clouds': '曇り',
  'Rain': '雨',
  'Drizzle': '小雨',
  'Thunderstorm': '雷雨',
  'Snow': '雪',
  'Mist': '霧',
  'Fog': '霧',
  'Haze': 'もや',
};

// アイコンマッピング
const ICON_MAP = {
  'Clear': 'sunny',
  'Clouds': 'cloudy',
  'Rain': 'rainy',
  'Drizzle': 'rainy',
  'Thunderstorm': 'stormy',
  'Snow': 'snowy',
  'Mist': 'foggy',
  'Fog': 'foggy',
  'Haze': 'foggy',
};

/** 天気予報取得（キャッシュ → API → モック） */
export async function getForecast(farm, env) {
  if (!env.OPENWEATHER_API_KEY) {
    return getMockWeather();
  }

  const lat = farm.latitude || 35.6762;
  const lon = farm.longitude || 139.6503;
  const cacheKey = `${lat.toFixed(2)}_${lon.toFixed(2)}`;
  const today = new Date().toISOString().split('T')[0];

  const cached = await env.DB.prepare(
    'SELECT data FROM weather_cache WHERE lat_lon_key = ? AND date = ?'
  ).bind(cacheKey, today).first();

  if (cached) {
    return JSON.parse(cached.data);
  }

  const apiUrl = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${env.OPENWEATHER_API_KEY}&units=metric&lang=ja`;
  const res = await fetch(apiUrl);

  if (!res.ok) {
    console.error('OpenWeatherMap API error:', res.status);
    return getMockWeather();
  }

  const raw = await res.json();
  const weatherData = transformWeatherData(raw, farm);

  const id = generateUlid();
  await env.DB.prepare(
    'INSERT INTO weather_cache (id, lat_lon_key, date, data, fetched_at) VALUES (?, ?, ?, ?, ?)'
  ).bind(id, cacheKey, today, JSON.stringify(weatherData), new Date().toISOString()).run();

  return weatherData;
}

/** OpenWeatherMap レスポンスを統一形式に変換 */
function transformWeatherData(raw, farm) {
  const current = raw.list?.[0];
  const mainWeather = current?.weather?.[0]?.main || 'Clear';

  const dailyMap = {};
  for (const entry of raw.list || []) {
    const date = entry.dt_txt?.split(' ')[0];
    if (!date) continue;

    if (!dailyMap[date]) {
      dailyMap[date] = { temps: [], weathers: [], precipitations: [] };
    }
    dailyMap[date].temps.push(entry.main.temp_min, entry.main.temp_max);
    dailyMap[date].weathers.push(entry.weather?.[0]?.main || 'Clear');
    dailyMap[date].precipitations.push(entry.rain?.['3h'] || 0);
  }

  const forecast = Object.entries(dailyMap).slice(0, 5).map(([date, d]) => {
    const tempMin = Math.round(Math.min(...d.temps));
    const tempMax = Math.round(Math.max(...d.temps));
    const dominantWeather = mode(d.weathers);
    const totalPrecip = d.precipitations.reduce((a, b) => a + b, 0);
    const precipitation = Math.round(Math.min(100, totalPrecip * 10));

    return {
      date,
      temp_min: tempMin,
      temp_max: tempMax,
      weather: WEATHER_JA[dominantWeather] || dominantWeather,
      icon: ICON_MAP[dominantWeather] || 'cloudy',
      precipitation,
    };
  });

  const alerts = [];
  for (const f of forecast) {
    if (f.temp_min <= 3) alerts.push({ type: 'frost', date: f.date, message: `${f.date}: 最低気温${f.temp_min}℃、霜注意報` });
    if (f.temp_max >= 35) alerts.push({ type: 'heat', date: f.date, message: `${f.date}: 最高気温${f.temp_max}℃、猛暑日` });
    if (f.precipitation > 50) alerts.push({ type: 'heavy_rain', date: f.date, message: `${f.date}: 降水確率${f.precipitation}%、大雨注意` });
  }

  return {
    location: farm.address || `${farm.latitude}, ${farm.longitude}`,
    current: {
      temp: Math.round(current?.main?.temp || 22),
      temp_min: Math.round(current?.main?.temp_min || 14),
      temp_max: Math.round(current?.main?.temp_max || 24),
      humidity: current?.main?.humidity || 55,
      weather: WEATHER_JA[mainWeather] || mainWeather,
      icon: ICON_MAP[mainWeather] || 'cloudy',
      wind_speed: current?.wind?.speed || 3.0,
    },
    forecast,
    alerts,
  };
}

/** 配列の最頻値を返す */
function mode(arr) {
  const counts = {};
  let maxCount = 0;
  let maxVal = arr[0];
  for (const v of arr) {
    counts[v] = (counts[v] || 0) + 1;
    if (counts[v] > maxCount) {
      maxCount = counts[v];
      maxVal = v;
    }
  }
  return maxVal;
}

/** モックデータ（APIキー未設定時） */
function getMockWeather() {
  const dates = [];
  for (let i = 1; i <= 5; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    dates.push(d.toISOString().split('T')[0]);
  }

  return {
    location: '東京都',
    current: { temp: 22, temp_min: 14, temp_max: 24, humidity: 55, weather: '晴れ', icon: 'sunny', wind_speed: 3.2 },
    forecast: [
      { date: dates[0], temp_min: 13, temp_max: 23, weather: '晴れ', icon: 'sunny', precipitation: 0 },
      { date: dates[1], temp_min: 12, temp_max: 20, weather: '曇り', icon: 'cloudy', precipitation: 10 },
      { date: dates[2], temp_min: 10, temp_max: 18, weather: '雨', icon: 'rainy', precipitation: 70 },
      { date: dates[3], temp_min: 8, temp_max: 16, weather: '曇り', icon: 'cloudy', precipitation: 20 },
      { date: dates[4], temp_min: 11, temp_max: 21, weather: '晴れ', icon: 'sunny', precipitation: 5 },
    ],
    alerts: [],
  };
}
