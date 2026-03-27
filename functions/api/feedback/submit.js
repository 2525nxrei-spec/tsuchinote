/**
 * POST /api/feedback/submit — フィードバック・リクエスト送信
 * 認証不要（誰でも送信可能）
 */

import { generateUlid, jsonResponse, errorResponse } from '../../lib/utils.js';

const VALID_CATEGORIES = ['feature', 'bug', 'other'];
const MAX_CONTENT_LENGTH = 2000;

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    let body;
    try {
      body = await request.json();
    } catch {
      return errorResponse('リクエストボディが不正です');
    }

    const { name, email, category, content } = body;

    // 必須チェック: 内容
    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return errorResponse('内容を入力してください');
    }

    if (content.length > MAX_CONTENT_LENGTH) {
      return errorResponse(`内容は${MAX_CONTENT_LENGTH}文字以内で入力してください`);
    }

    // カテゴリ検証
    const cat = VALID_CATEGORIES.includes(category) ? category : 'other';

    // メールアドレス簡易検証（任意項目なので空ならスキップ）
    if (email && typeof email === 'string' && email.trim().length > 0) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
        return errorResponse('メールアドレスの形式が正しくありません');
      }
    }

    const id = generateUlid();
    const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';

    await env.DB.prepare(`
      INSERT INTO feedback_requests (id, name, email, category, content, ip_address)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      name ? String(name).trim().substring(0, 100) : null,
      email ? String(email).trim().substring(0, 254) : null,
      cat,
      content.trim(),
      clientIP
    ).run();

    return jsonResponse({ id, message: 'ご意見ありがとうございます。' });
  } catch (err) {
    console.error('フィードバック送信エラー:', err.message);
    return errorResponse('送信に失敗しました。しばらくしてからもう一度お試しください。', 500);
  }
}
