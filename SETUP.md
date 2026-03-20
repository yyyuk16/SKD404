# 環境構築・起動ガイド

## 必要な環境

- **PHP** 7.4 以上（推奨: 8.x）
- **Firebase** アカウント
- **Gemini API** キー（キャラ画像生成を行う場合）

---

## 1. リポジトリの取得

```bash
# クローンまたは ZIP 解凍後、プロジェクトルートへ移動
cd SKD404
```

---

## 2. Firebase の設定

### 2.1 Firebase プロジェクト作成

1. [Firebase Console](https://console.firebase.google.com/) でプロジェクトを作成する。
2. **Build** → **Realtime Database** で「データベースの作成」。
3. **Build** → **Authentication** で「始める」→ **匿名** を有効にする。
4. **プロジェクトの設定**（歯車）→ **全般** で「アプリを追加」→ **Web** を選び、アプリを登録。表示される `firebaseConfig` を控える。

### 2.2 フロント用設定

`public/js/firebase-config.js` を開き、次のプレースホルダを実際の値に置き換える。

```javascript
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  databaseURL: "https://YOUR_PROJECT_ID-default-rtdb.firebaseio.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};
```

### 2.3 Realtime Database ルール

本番では `database.rules.json` の内容を Firebase Console の **Realtime Database** → **ルール** に反映する。開発時は「テストモード」でも動作確認可能（本番では認証済みユーザーのみに制限すること）。

---

## 3. 開発サーバーの起動（1ポートで静的＋API）

プロジェクトルートで以下を実行する。

```bash
php -S localhost:8000 router.php
```

- **静的ファイル**: `http://localhost:8000/` → `public/index.html`
- **ログイン（2回目以降）**: `http://localhost:8000/login.html`
- **API**: `http://localhost:8000/api/gemini.php` など

ルーター（`router.php`）が次のように振り分ける。

- `/api/*` → `api/*.php` を実行
- それ以外 → `public/` 内のファイルを返す

---

## 4. Gemini API（キャラ画像生成）の設定（任意）

キャラ画像を Gemini で生成する場合のみ行う。

### 4.1 API キー取得

1. [Google AI Studio](https://aistudio.google.com/) または Google Cloud Console で Gemini API を有効化し、API キーを発行する。

### 4.2 環境変数または .env

**方法 A: 環境変数**

```bash
# Windows (PowerShell)
$env:GEMINI_API_KEY = "あなたのAPIキー"

# Windows (コマンドプロンプト)
set GEMINI_API_KEY=あなたのAPIキー

# macOS / Linux
export GEMINI_API_KEY=あなたのAPIキー
```

**方法 B: .env ファイル**

プロジェクトルート（`SKD404/`）に `.env` を作成する。

```
GEMINI_API_KEY=あなたのAPIキー
```

- `.env` は **git にコミットしない** こと（`.gitignore` に追加推奨）。

### 4.3 画像生成の呼び出し

フロントからは `POST /api/gemini.php` に JSON で `{ "prompt": "説明文" }` を送り、返却された `imageBase64` を画像として表示する。  
ホーム画面（`home.js`）では、将来この API を呼び出してキャラ画像を表示する想定。

---

## 5. 動作確認の流れ

1. `php -S localhost:8000 router.php` でサーバー起動。
2. ブラウザで `http://localhost:8000` を開く。
3. 初回はプロフィールが無いため `login-first.html` にリダイレクトされる。
4. 名前・学年・得意教科・趣味を入力して「登録してはじめる」をクリック。
5. Firebase（匿名認証＋Realtime Database）に保存され、`index.html`（ホーム）に遷移する。
6. フッターの **ニュース / 記録 / 学習 / 設定** で各画面を切り替えて確認。

---

## 6. Firebase へのデプロイ（ホスティング）

静的ファイルのみ Firebase Hosting にデプロイする場合。

```bash
# Firebase CLI のインストール（未導入の場合）
npm install -g firebase-tools

# ログイン
firebase login

# プロジェクトを指定
firebase use <your-project-id>

# デプロイ（public をホスティング）
firebase deploy
```

- **注意**: Firebase Hosting では PHP は動作しない。  
  - フロント（HTML/CSS/JS）と Firebase（認証・Realtime Database）はこのまま利用可能。  
  - Gemini 用の PHP API は、別の PHP 対応サーバーや Cloud Functions などにデプロイする必要がある。

---

## 7. トラブルシューティング

| 現象 | 確認すること |
|------|----------------|
| ログイン後もプロフィールが保存されない | Firebase の `databaseURL` と Realtime Database ルールを確認。匿名認証が有効か確認。 |
| 記録が表示されない | ブラウザの開発者ツールでネットワーク・コンソールを確認。`memos/<uid>` にデータが保存されているか Firebase Console で確認。 |
| Gemini API で 500 エラー | `GEMINI_API_KEY` が設定されているか、`.env` のパスが `api/gemini.php` から見て正しいか確認。 |
| 404 Not Found | `router.php` を指定して起動しているか確認（`php -S localhost:8000 router.php`）。 |

---

## 8. チーム開発時の注意

- **フロント**: `public/` 以下を編集。Firebase 設定は `firebase-config.js` のみ共有用にプレースホルダのままにし、各自の環境で差し替えるか、環境別の設定ファイルを検討する。
- **バックエンド**: `api/` と `router.php` を編集。API キーやシークレットは `.env` で管理し、リポジトリに含めない。

以上で環境構築と起動の手順は完了です。
