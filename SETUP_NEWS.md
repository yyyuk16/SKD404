# ニュース API のセットアップ（API キーが無効と言われる場合）

ニュース機能（`/api/news-latest`, `/api/news-personalized`）は **Gemini API** を使います。  
「API key not valid」が出る場合は、次の手順を順に確認してください。

---

## 1. プロジェクトで Generative Language API を有効にする

API キーは「有効」でも、**そのキーが紐づく GCP プロジェクトで API が有効でない**とエラーになります。

1. ブラウザで [Google Cloud Console](https://console.cloud.google.com/) を開く。
2. 上部のプロジェクト選択で **skd-404**（またはこのアプリ用のプロジェクト）を選ぶ。
3. 左メニュー **「API とサービス」** → **「ライブラリ」** を開く。
4. 検索で **「Generative Language API」** と入力し、一覧から選ぶ。
5. **「有効にする」** をクリックする。

直リンク:  
[https://console.cloud.google.com/apis/library/generativelanguage.googleapis.com](https://console.cloud.google.com/apis/library/generativelanguage.googleapis.com)  
（開いたあと、プロジェクトを skd-404 に切り替えてから「有効にする」）

---

## 2. Google AI Studio で API キーを作り直す

1. [Google AI Studio](https://aistudio.google.com/) を開く。
2. 左メニュー **「API keys」** を開く。
3. **「Create API key」** で、プロジェクト **skd-404** を選んで新規キーを作成。
4. 表示されたキーを **そのままコピー**（先頭・末尾のスペースを入れない）。

---

## 3. .env にキーを書く

プロジェクトのルート（`SKD404` フォルダ）にある `.env` を開き、次の 1 行だけにします。

```env
GEMINI_API_KEY=ここにコピーしたキーを貼り付け
```

- `=` の前後にスペースを入れない。
- 行末に余計なスペースや改行を入れない。
- キーは `AIza` で始まる長い文字列です。

---

## 4. サーバーを再起動する

`.env` を変更したら、PHP の開発サーバーを必ずやり直します。

1. 動いている `php -S localhost:8000 router.php` を **Ctrl + C** で止める。
2. もう一度 `php -S localhost:8000 router.php` を実行する。

---

## 5. キーが読めているか確認する

サーバーを起動した状態で、ブラウザで次を開きます。

**http://localhost:8000/api/news-debug**

表示例:

- `envFound: true` … .env からキーを読めている。
- `keyLength: 39` 前後 … キー長は問題なし。
- `keyPrefix: "AIzaS"` … 形式は Google API キーとして妥当。

ここまで問題ないのに `/api/news-latest` でまだ「API key not valid」が出る場合は、**手順 1（Generative Language API の有効化）** を再度確認してください。

---

## まとめ

| 確認項目 | やること |
|----------|----------|
| GCP | プロジェクトで **Generative Language API** を有効にする |
| キー | **AI Studio** で新規キーを作成し、コピー |
| .env | `GEMINI_API_KEY=キー` の 1 行で保存（スペース・改行なし） |
| サーバー | `.env` 変更後は PHP サーバーを再起動 |
| 確認 | `/api/news-debug` でキーが読めているか確認 |

これで `/api/news-latest` と `/api/news-personalized` が正常に動くようになります。
