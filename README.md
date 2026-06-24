# miruha アート診断 - セットアップ手順

## フォルダ構成
```
miruha-netlify/
├── netlify.toml              # Netlify設定
├── netlify/functions/
│   └── diagnose.js           # Gemini APIを呼ぶサーバー関数
└── public/
    └── index.html            # 診断ページ本体
```

---

## デプロイ手順

### 1. GitHubにアップロード

1. GitHub (https://github.com) を開く
2. 右上「+」→「New repository」
3. Repository name: `miruha-art-diagnosis`
4. 「Create repository」をクリック
5. 「uploading an existing file」リンクをクリック
6. このフォルダの中身を全部ドラッグ&ドロップ
   ※ フォルダごとドラッグする（netlify/とpublic/フォルダを維持すること）
7. 「Commit changes」をクリック

### 2. Netlifyと接続

1. Netlify (https://netlify.com) を開く
2. 「Add new site」→「Import an existing project」
3. 「GitHub」を選択 → 先ほどのリポジトリを選ぶ
4. Build settings はそのままでOK（netlify.tomlが自動認識される）
5. 「Deploy site」をクリック

### 3. 環境変数を設定（重要）

Netlify管理画面 →「Site configuration」→「Environment variables」→「Add a variable」

| 変数名 | 値 | 説明 |
|---|---|---|
| `GEMINI_API_KEY` | AIza...（取得したキー） | Gemini APIキー |
| `LINE_TOKEN` | 好きな文字列（例: miruha2024） | LINE登録者に配るトークン |
| `DAILY_LIMIT` | 10 | 1IPあたり1日の上限回数 |

設定後「Save」→「Deploys」→「Trigger deploy」→「Deploy site」

### 4. LINE登録者へのURL配布

診断ページのURLは：
```
https://あなたのサイト名.netlify.app/?t=miruha2024
```
（LINE_TOKENに設定した値をtパラメータに付ける）

このURLをLINEのリッチメニューやメッセージに貼るだけでOK。

---

## 料金の目安

| 月の診断回数 | Gemini API料金 | Netlify料金 |
|---|---|---|
| 〜1,000回 | 無料枠内（0円） | 無料 |
| 〜10,000回 | 約100〜200円 | 無料 |
| 〜100,000回 | 約1,000〜2,000円 | 無料 |

---

## トークンの変更方法

LINE_TOKEN環境変数を変更してRedeploy するだけ。
古いURLは使えなくなり、新しいURLをLINEで配り直す。
