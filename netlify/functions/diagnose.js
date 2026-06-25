const LINE_TOKEN    = process.env.LINE_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const DAILY_LIMIT   = parseInt(process.env.DAILY_LIMIT || '100');

const ipStore = {};
function checkRateLimit(ip) {
  const key = `${ip}_${new Date().toISOString().slice(0,10)}`;
  const n = (ipStore[key] || 0) + 1;
  ipStore[key] = n;
  return n <= DAILY_LIMIT;
}

const PROMPT = (painting, words) =>
`# あなたの役割
あなたは、Instagramで大人気のアートナビゲーターです。ユーザーから提示された「絵画のタイトル」と「3つの単語」をもとに、その人が【この作品に向き合う上で、どのセンサー（見方の個性）が真っ先に反応したのか】を12タイプから1つ選び、中学生にもわかる言葉でキャッチーに言い当ててください。

今回の絵画：「${painting}」
ユーザーが選んだ言葉：「${words.join('」「')}」

# アートセンサー12タイプ（この中から最も当てはまるものを1つ選ぶ）
0. 『大人のヒミツを見逃さない名探偵』：視線、持ち物、人間関係に反応
1. 『次の展開を妄想するストーリーテラー』：時間、物語、前後の流れに反応
2. 『歴史の裏側を覗くタイムトラベラー』：時代背景、文化、当時の暮らしに反応
3. 『色のパワーを浴びる色彩の魔術師』：色、鮮やかさ、色彩の組み合わせに反応
4. 『光と影を追いかけるサンシャイン』：光、影、眩しさ、暗さに反応
5. 『その場の空気を吸い込む透明人間』：温度、匂い、風の音、五感に反応
6. 『隠れた線を引く建築家』：全体のバランス、構図、配置に反応
7. 『画家の筆あとをたどる職人ハンター』：絵の具の質感、筆のタッチ、技法に反応
8. 『デフォルメを楽しむインスピレーション』：形、おもしろいデフォルメに反応
9. 『感情をシンクロさせる共感アーティスト』：エモさ、悲しみ、喜び、感情に反応
10. 『自分を映し出す鏡の観測者』：自分の思い出、今の気分との重ね合わせに反応
11. 『誰もいない静けさを愛するソロキャンパー』：余白、しんとした静けさに反応

# 絶対のルール
- 「今プライベートで悩んでいる」などの、占い的な当てずっぽうの心理・生活推測は絶対に書かないこと。
- 「認知」「バイアス」「システム」などの冷たい専門用語や、「〜の証拠です」などの硬い言葉は使わないこと。
- sec1（なぜその言葉を選んじゃったの？）は、毎回固定の文章にせず、選ばれた単語と、その絵の具体的な要素（画家の仕掛け）をその都度リアルに分析して、完全にオリジナルの文章で書くこと。

# トーン
- 中学生でもわかる言葉を使うこと。
- 「大スキャンダル」「野蛮すぎる」「批判された」「バグ」「魔法」などのありきたりな言葉は使わないこと。
- 「だね。」「なんだ。」など、話しかけるようなトーンにすること。

# 出力フォーマット
以下のJSON形式のみで返してください。マークダウン・コードブロック・説明文は不要です。

sec1：【その言葉を選んだということは...】（200字程度）
選ばれた言葉「${words.join('」「')}」と絵の具体的な要素を結びつけ、なぜそこに目が向いたのかを解説する。この絵の〇〇という部分に、あなたの〇〇というセンサーが反応しているよ、と伝える形で。毎回完全にオリジナルの文章で書くこと。

sec2：【今のあなたは...】（200字程度）
その人が今、その作品をどう味わっているのか、今回の鑑賞スタイルを全肯定しながら言い当てる。「今回はお勉強ではなく、〇〇を楽しんでいるね！」というトーンで。

sec3：【次の一手は...】（100字以内）
「次は、ここを意識してみて！そうすると〜」と、具体的なヒントと期待できるその変化を1つだけ提案する。

{"typeIndex":0〜11の数字,"sec1":"テキスト","sec2":"テキスト","sec3":"テキスト"}`;

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, X-Line-Token',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST')   return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  // 1. トークン認証
  const token = (event.headers['x-line-token'] || '').trim();
  if (LINE_TOKEN && token !== LINE_TOKEN) {
    return { statusCode: 403, headers, body: JSON.stringify({ error: 'このページはLINE登録者限定です。' }) };
  }

  // 2. レート制限
  const ip = (event.headers['x-forwarded-for'] || 'unknown').split(',')[0].trim();
  if (!checkRateLimit(ip)) {
    return { statusCode: 429, headers, body: JSON.stringify({ error: `1日${DAILY_LIMIT}回まで使えるよ。また明日ね！` }) };
  }

  // 3. リクエスト解析
  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid request' }) }; }

  const words   = (body.words || []).filter(w => w && w.trim());
  const painting = body.painting || 'ゴッホ「星月夜」';
  if (words.length === 0) return { statusCode: 400, headers, body: JSON.stringify({ error: '言葉を入力してね。' }) };

  if (!GEMINI_API_KEY) {
    console.error('GEMINI_API_KEY is not set');
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'APIキーが設定されていません。' }) };
  }

  // 4. Gemini API
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

  let raw = '';
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: PROMPT(painting, words) }] }],
        generationConfig: {
          temperature: 0.85,
          maxOutputTokens: 800,
          responseMimeType: 'application/json',  // JSON強制
        },
      }),
    });

    const json = await res.json();
    console.log('Gemini status:', res.status);

    if (!res.ok) {
      console.error('Gemini error:', JSON.stringify(json));
      return { statusCode: 502, headers, body: JSON.stringify({ error: `Gemini API error: ${res.status}` }) };
    }

    // Gemini 2.5はthinkingブロックがparts[0]に入る場合があるため
    // text typeのpartを全部探す
    const parts = json?.candidates?.[0]?.content?.parts || [];
    console.log('parts count:', parts.length);
    console.log('parts types:', parts.map(p => p.thought ? 'thinking' : 'text'));
    console.log('full response keys:', Object.keys(json || {}));

    // textプロパティを持つpartを全て結合（thinkingブロックを除く）
    raw = parts
      .filter(p => !p.thought && typeof p.text === 'string')
      .map(p => p.text)
      .join('');

    if (!raw) {
      // fallback: parts[0].text をそのまま試す
      raw = json?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    }

    console.log('Gemini raw FULL:', raw);
    if (!raw) {
      console.error('Empty raw. Full json:', JSON.stringify(json).slice(0, 1000));
    }

  } catch (e) {
    console.error('fetch error:', e.message);
    return { statusCode: 502, headers, body: JSON.stringify({ error: '通信エラー: ' + e.message }) };
  }

  // 5. JSON解析（複数パターンで試みる）
  let result;
  try {
    // パターン1: そのままパース
    result = JSON.parse(raw);
  } catch {
    try {
      // パターン2: コードブロック除去
      const cleaned = raw
        .replace(/```json\s*/gi, '')
        .replace(/```\s*/gi, '')
        .trim();
      result = JSON.parse(cleaned);
    } catch {
      try {
        // パターン3: {...} の部分だけ抽出
        const match = raw.match(/\{[\s\S]*\}/);
        if (match) result = JSON.parse(match[0]);
      } catch {
        console.error('JSON parse fail. raw was:', raw);
        return { statusCode: 500, headers, body: JSON.stringify({ error: '診断結果の解析に失敗しました。もう一度試してね。' }) };
      }
    }
  }

  if (!result) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: '診断結果が空でした。もう一度試してね。' }) };
  }

  console.log('parsed typeIndex:', result.typeIndex);
  console.log('parsed sec1 length:', (result.sec1 || '').length);
  console.log('parsed sec2 length:', (result.sec2 || '').length);
  console.log('parsed sec3 length:', (result.sec3 || '').length);

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      typeIndex: Math.max(0, Math.min(11, parseInt(result.typeIndex) || 0)),
      sec1: result.sec1 || '',
      sec2: result.sec2 || '',
      sec3: result.sec3 || '',
    }),
  };
};
