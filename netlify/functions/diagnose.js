// netlify/functions/diagnose.js
// Gemini APIを呼び出す診断エンドポイント
// - LINEトークン認証（ゆるめ）
// - IP別・日次回数制限
// - APIキーはサーバー側のみ（HTMLに露出しない）

const LINE_TOKEN = process.env.LINE_TOKEN;       // Netlify環境変数で設定
const GEMINI_API_KEY = process.env.GEMINI_API_KEY; // Netlify環境変数で設定
const DAILY_LIMIT = parseInt(process.env.DAILY_LIMIT || '10'); // 1IP/日の上限

// 簡易インメモリレート制限
// (Netlify Functionは短命なので、大量アクセス対策として十分)
const ipStore = {};

function getRateLimitKey(ip) {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return `${ip}_${today}`;
}

function checkRateLimit(ip) {
  const key = getRateLimitKey(ip);
  const count = ipStore[key] || 0;
  if (count >= DAILY_LIMIT) return false;
  ipStore[key] = count + 1;
  return true;
}

const PROMPT_TEMPLATE = (painting, words) => `
あなたはInstagramで人気のアートナビゲーター「miruha」です。
ユーザーが絵画「${painting}」を見て浮かんだ言葉は「${words.join('」「')}」です。

以下の12タイプから最も当てはまる1つを選び、指定フォーマットで日本語で返してください。

【12タイプ】
0: 大人のヒミツを見逃さない名探偵（視線・持ち物・人間関係に反応）
1: 次の展開を妄想するストーリーテラー（時間・物語・前後の流れに反応）
2: 歴史の裏側を覗くタイムトラベラー（時代背景・文化・当時の暮らしに反応）
3: 色のパワーを浴びる色彩の魔術師（色・鮮やかさ・色彩の組み合わせに反応）
4: 光と影を追いかけるサンシャイン（光・影・眩しさ・暗さに反応）
5: その場の空気を吸い込む透明人間（温度・匂い・風の音・五感に反応）
6: 隠れた線を引く建築家（全体のバランス・構図・配置に反応）
7: 画家の筆あとをたどる職人ハンター（絵の具の質感・筆のタッチ・技法に反応）
8: デフォルメを楽しむインスピレーション（形・おもしろいデフォルメに反応）
9: 感情をシンクロさせる共感アーティスト（エモさ・悲しみ・喜び・感情に反応）
10: 自分を映し出す鏡の観測者（自分の思い出・今の気分との重ね合わせに反応）
11: 誰もいない静けさを愛するソロキャンパー（余白・しんとした静けさに反応）

【絶対のルール】
- 占い的な推測や冷たい専門用語は使わない
- 話しかけるトーン（「だね。」「なんだ。」）で中学生にわかる言葉で書く
- sec1は必ず入力された言葉「${words.join('」「')}」を文中に自然に引用する
- 各セクションは指定文字数を守る

以下のJSONのみ返してください（マークダウン・コードブロック不要）:
{
  "typeIndex": <0〜11の数字>,
  "sec1": "<その言葉を選んだということは...200字程度。入力された言葉と絵の要素を結びつけて>",
  "sec2": "<今のあなたは...200字程度。今の鑑賞スタイルを全肯定するトーンで>",
  "sec3": "<次の一手は...100字以内。具体的なヒントを1つ>"
}
`.trim();

exports.handler = async (event) => {
  // CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, X-Line-Token',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  // ── 1. LINEトークン認証（ゆるめ）──
  const token = event.headers['x-line-token'] || '';
  if (LINE_TOKEN && token !== LINE_TOKEN) {
    return {
      statusCode: 403, headers,
      body: JSON.stringify({ error: 'このページはLINE登録者限定です。' })
    };
  }

  // ── 2. IP別レート制限 ──
  const ip = event.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown';
  if (!checkRateLimit(ip)) {
    return {
      statusCode: 429, headers,
      body: JSON.stringify({ error: `1日${DAILY_LIMIT}回まで利用できます。また明日試してね！` })
    };
  }

  // ── 3. リクエスト解析 ──
  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const { words, painting = 'ゴッホ「星月夜」' } = body;
  if (!words || !Array.isArray(words) || words.filter(w => w).length === 0) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: '言葉を入力してください。' }) };
  }

  const filledWords = words.filter(w => w && w.trim());

  // ── 4. Gemini API呼び出し ──
  const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;

  let geminiRes;
  try {
    geminiRes = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: PROMPT_TEMPLATE(painting, filledWords) }] }],
        generationConfig: {
          temperature: 0.8,
          maxOutputTokens: 1024,
        },
        safetySettings: [
          { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
        ],
      }),
    });
  } catch (e) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'API接続エラーです。しばらく待って試してね。' }) };
  }

  if (!geminiRes.ok) {
    const errText = await geminiRes.text();
    console.error('Gemini error status:', geminiRes.status, errText);
    return { statusCode: 502, headers, body: JSON.stringify({ error: `AI診断に失敗しました（${geminiRes.status}）。もう一度試してね。` }) };
  }

  const geminiData = await geminiRes.json();
  const rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || '';

  // ── 5. JSON解析 ──
  let result;
  try {
    const cleaned = rawText.replace(/```json|```/g, '').trim();
    result = JSON.parse(cleaned);
  } catch {
    console.error('JSON parse error:', rawText);
    return { statusCode: 500, headers, body: JSON.stringify({ error: '診断結果の解析に失敗しました。もう一度試してね。' }) };
  }

  const typeIndex = Math.max(0, Math.min(11, parseInt(result.typeIndex) || 0));

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      typeIndex,
      sec1: result.sec1 || '',
      sec2: result.sec2 || '',
      sec3: result.sec3 || '',
    }),
  };
};
