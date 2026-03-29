# 教育支援キャラクター育成アプリで、学びと日常をもっと楽しく！

「GDGoC-Japan-Hackathon-2026」で作成した小〜高校生が学習・生活・趣味などの情報を記録すると、その内容に合わせた自分専用キャラクターを表示できる Web アプリのリポジトリです。

## プロジェクト概要

学習状況や生活・趣味を継続的に振り返りたい一方で、記録が続かない・自分の様子を客観視しにくい、といった課題から開発が進められています。従来の日記アプリや学習記録ツールに加え、プロフィールや記録に紐づいたキャラクター表示や目標の可視化により、記録の継続と自己理解を促すことを目指しています。キャラクター画像やニュース取得などには Gemini API を利用し、Firebase でプロフィールやメモを保存します。

---

## 目的・対象

| 項目 | 内容 |
|------|------|
| **目的** | 記録の継続と自己理解を促す（プロフィール連動のキャラ表示、学習記録、関連ニュースなど） |
| **対象** | 小学生〜高校生を想定 |

---

## 主な機能

| 領域 | 内容 |
|------|------|
| **認証・初回登録** | **初回**: `login-first.html` … メール/パスワード（任意）＋プロフィール（名前・学年・得意教科・趣味）を Firebase に保存。匿名ログインでプロフィールのみ登録も可。<br>**2回目以降**: `login.html` … メール/パスワードでログイン（自動で `index.html` へ飛ばさない動作に調整済みの場合あり）。 |
| **ホーム** | `index.html` … プロフィールに基づくキャラ説明、Imagen 生成画像の表示（`home.js` → `/api/gemini.php`）。もくひょう・おしらせ・ショップ枠（表示は今後拡張想定）。 |
| **記録** | `record.html` ほか … タイマー・手動・点数、一覧（`records.html` 等）。主に **Firebase Realtime Database**（`memos/`、`timerMemos/` 等）に保存。 |
| **関連ニュース** | `news.html` … `public/js/news.js` から **`/api/news-latest.php`** / **`/api/news-personalized.php`** を呼び出し、サーバ側で **Google ニュース RSS** を取得して表示。 |
| **学習** | `study.html` … プレースホルダ（コンテンツ追加予定）。 |
| **図鑑** | `zukan.html` … 収集要素用画面。 |
| **設定** | `settings.html` … プロフィール表示・ログアウトなど。 |

フッターナビ（`app.js`）: **ホーム / ニュース / 記録 / 学習 / 設定**

---

## 画面・URLの流れ（ざっくり）

1. プロフィール未作成のユーザーがアプリ内ページに入ると、**`login-first.html`** へ誘導される（`ensureProfileThen` 等）。
2. 初回登録完了後 → **`index.html`**（ホーム）。
3. ログアウト後や「ログイン画面から入る」場合 → **`login.html`**。
4. 開発サーバで **`http://localhost:8000/`** を開くと、ルーターにより **`login-first.html`** が返る（`router.php`）。

> **XAMPP 等で `http://localhost/SKD404/public/...` とサブパス配信する場合**は、`news.js` の `API_BASE` や API のパスを環境に合わせて調整する必要があります（詳細は `SETUP.md` / `FRONTEND_NEWS_HANDOVER.md`）。

---

## 技術スタック

| 分類 | 技術 |
|------|------|
| フロント | HTML, CSS, JavaScript, **jQuery 3.7** |
| バックエンド | **PHP**（API プロキシ・RSS 取得） |
| データ・認証 | **Firebase**（Authentication, Realtime Database） |
| 外部 API | **Google Generative Language API**（Imagen / Gemini、`api/gemini.php`）、**Google ニュース RSS**（`api/_news_rss.php`） |
| その他 CDN | Google Fonts, Material Symbols, Chart.js（記録一覧）, Tailwind CDN（一部画面）など |

---

## リポジトリ構成（主要ファイル）

```
SKD404/
├── public/                      # フロント（静的ファイル）
│   ├── index.html               # ホーム
│   ├── login-first.html         # 初回・プロフィール登録
│   ├── login.html               # 2回目以降ログイン（メール/パスワード）
│   ├── news.html
│   ├── record.html              # 記録ハブ
│   ├── record-timer.html, record-manual.html, record-score.html
│   ├── records.html             # 記録一覧・グラフ
│   ├── study.html, settings.html, zukan.html
│   ├── css/
│   └── js/
│       ├── firebase-config.js   # Firebase 設定（要差し替え）
│       ├── app.js               # フッター・ユーザー・プロフィール・認証ヘルパ
│       ├── home.js, index.js, news.js, record*.js, settings.js …
├── api/
│   ├── gemini.php               # キャラ画像生成（Imagen 等）プロキシ
│   ├── news-latest.php          # 最新ニュース JSON
│   ├── news-personalized.php    # パーソナライズニュース JSON
│   ├── _news_rss.php            # RSS 取得共通処理
│   ├── profile.php, memos.php   # 補助用エンドポイント
├── router.php                   # php -S 用（/api → api、/ → login-first.html）
├── firebase.json
├── database.rules.json
├── .env                         # GEMINI_API_KEY 等（Git 管理外推奨）
├── README.md                    # 本ファイル
├── SETUP.md                     # 環境構築・起動の手順
├── SETUP_NEWS.md                # ニュース API まわり
├── BACKEND_HANDOVER.md          # API 仕様・引継ぎ
├── FRONTEND_NEWS_HANDOVER.md    # フロントからのニュース呼び出し
└── CLOUD_RUN.md                 # クラウドデプロイ関連（参照用）
```

---

## 環境構築・起動

1. **PHP**（7.4+、推奨 8.x）と **Firebase** プロジェクトを用意する。  
2. `public/js/firebase-config.js` を自プロジェクトの値に置き換える。  
3. ルートで次を実行（Windows では `php` が PATH に通っていること）:

```bash
php -S localhost:8000 router.php
```

4. ブラウザで `http://localhost:8000/` または `http://localhost:8000/index.html` など。

**手順の詳細・Gemini キー・Firebase ルール**は **`SETUP.md`** を参照してください。

---

## ドキュメント一覧

| ファイル | 内容 |
|----------|------|
| `SETUP.md` | インストール、Firebase、開発サーバ、Gemini `.env` |
| `SETUP_NEWS.md` | ニュース機能まわりの設定 |
| `BACKEND_HANDOVER.md` | PHP API・エンドポイント説明 |
| `FRONTEND_NEWS_HANDOVER.md` | `news.js` と API の URL 設計 |



## ライセンス

本プロジェクトは教育目的で作成されています。
