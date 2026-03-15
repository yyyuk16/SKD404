# ニュース画面（news.html）フロントエンド引継ぎ

ニュース画面で「最新ニュース」と「あなた向けニュース」を表示するための、バックエンドの使い方とフロント側のポイントをまとめました。  
**開発が初めての方でも分かるように**、用語の説明から書いています。

---

## 1. この機能でやっていること

- **最新のニュース** … 教育・学習まわりの最新記事を一覧表示する
- **あなた向けのニュース** … ログインしているユーザーの「得意教科」「趣味」に近い話題の記事を表示する

どちらも **バックエンドの API を 1 回呼ぶ**と、ニュースのタイトル・リンク・出典などが JSON で返ってきます。  
フロントでは、その JSON を受け取って `news.html` のリストに表示するだけです。

---

## 2. API とは（用語）

- **API** = こちらのリクエスト（「ニュースをください」）に対して、決まった形式のデータ（ここではニュース一覧）を返してくれる窓口です。
- **エンドポイント** = API の「住所」のようなものです。  
  このプロジェクトでは `http://localhost:8000/api/〇〇` のような URL がエンドポイントです。
- **GET** = データを「取得するだけ」のリクエストの種類。ブラウザのアドレス欄に URL を入れて開くのと同じイメージです。

ニュースでは、**GET** で次の 2 つのエンドポイントを呼びます。

| 種類         | エンドポイント              | 役割                                   |
|--------------|-----------------------------|----------------------------------------|
| 最新ニュース | `GET /api/news-latest`      | 教育・学習の最新ニュースを返す         |
| あなた向け   | `GET /api/news-personalized`| 得意教科・趣味に合わせたニュースを返す |

---

## 3. エンドポイントの仕様（何を送って、何が返るか）

### 3.1 最新ニュース `GET /api/news-latest`

- **送るもの**  
  - なし（クエリパラメータは不要）
- **呼び方の例**  
  - ブラウザ: `http://localhost:8000/api/news-latest`  
  - JavaScript: `fetch('/api/news-latest')`

### 3.2 あなた向けニュース `GET /api/news-personalized`

- **送るもの（クエリパラメータ）**  
  - `subject` … 得意教科（例: 算数、理科）  
  - `hobby` … 趣味（例: サッカー、絵を描く）  
  - どちらも「あれば付ける」でよく、両方なくても動きます（その場合は教育・学習の一般的なニュースになります）。
- **呼び方の例**  
  - `http://localhost:8000/api/news-personalized`  
  - `http://localhost:8000/api/news-personalized?subject=算数&hobby=サッカー`

---

## 4. 返ってくる JSON の形（レスポンス）

2 つの API とも、**同じ形**の JSON を返します。

```json
{
  "success": true,
  "summary": "（ニュースの概要テキスト。任意）",
  "news": [
    {
      "title": "記事のタイトル",
      "url": "https://example.com/article",
      "source": "サイト名や出典"
    }
  ]
}
```

- **success** … `true` なら成功、`false` なら失敗（エラー時は `error` にメッセージが入ります）。
- **summary** … 説明文。表示してもよいし、使わなくてもよいです。
- **news** … 配列。中身が 1 件 1 件のニュースです。
  - **title** … 表示用のタイトル
  - **url** … 記事のリンク（クリックで別タブ開きなどに使う）
  - **source** … 出典名（表示用）

**エラー時**の例:

```json
{
  "success": false,
  "news": [],
  "error": "GEMINI_API_KEY not configured"
}
```

---

## 5. フロントでやること（実装の流れ）

1. **ページを開いたとき**
   - `GET /api/news-latest` を 1 回呼ぶ  
   - 返ってきた `news` を「最新のニュース」のリストに表示する
2. **同じくページを開いたとき**
   - ログイン中のユーザーがいる場合、その人の「得意教科」「趣味」を取得する  
     （既存の `EduChar.getProfile(uid, callback)` でプロフィールが取れます）
   - `GET /api/news-personalized?subject=〇〇&hobby=△△` を 1 回呼ぶ  
   - 返ってきた `news` を「あなた向けのニュース」のリストに表示する
3. **表示**
   - 各ニュースは `title` をリンクテキスト、`url` を `href`、`source` をサブテキストとして表示するとよいです。  
     （既存の `news.js` の `renderList` が同じイメージで動いています。）

**ポイント**

- どちらの API も **GET 1 回で一覧がまとめて返る**ので、同じ画面で 2 回（最新用 1 回・あなた向け 1 回）`fetch` すれば十分です。
- プロフィールが取れない（未ログインなど）場合は、`subject` と `hobby` を付けずに  
  `GET /api/news-personalized` だけ呼ぶと、「教育・学習の一般的なニュース」が返ります。

---

## 6. 現在の HTML と JS の対応（参考）

- **news.html**  
  - 「最新のニュース」用: `#news-list-latest`  
  - 「あなた向けのニュース」用: `#news-list-personalized`  
  - 読み込み中: `#news-latest-loading`, `#news-personalized-loading`  
  - エラー表示: `#news-latest-error`, `#news-personalized-error`
- **news.js**  
  - `loadLatest()` … `GET /api/news-latest` を呼び、結果を `#news-list-latest` に表示  
  - `loadPersonalized(subject, hobby)` … `GET /api/news-personalized` を呼び、結果を `#news-list-personalized` に表示  
  - ページ表示時に `loadLatest()` を実行し、`getUserId` → `getProfile` で subject / hobby を取ってから `loadPersonalized(subject, hobby)` を実行する流れになっています。

ここをベースに、デザインや文言だけ変えても問題ありません。

---

## 7. 開発サーバーで試すとき

- プロジェクトルートで `php -S localhost:8000 router.php` を実行している場合、
  - 最新: `http://localhost:8000/api/news-latest`
  - あなた向け: `http://localhost:8000/api/news-personalized?subject=算数&hobby=サッカー`
- ブラウザでこの URL を開くと、JSON がそのまま表示されるので、返ってくる形の確認に使えます。

---

## 8. まとめ（フロント担当者が押さえるとよいこと）

| 項目           | 内容                                                                 |
|----------------|----------------------------------------------------------------------|
| 呼ぶ API       | `GET /api/news-latest` と `GET /api/news-personalized` の 2 つ       |
| あなた向けの引数 | `subject`（得意教科）と `hobby`（趣味）。プロフィールから渡す        |
| 返ってくる形   | `{ success, summary, news: [ { title, url, source } ] }`           |
| 表示           | `news` をループして、`title`・`url`・`source` をリスト表示すればよい  |

この 2 つのエンドポイントを呼んで、返ってきた `news` をそのまま表示すれば、ニュース画面のバックエンド連携は完了です。

---

## 9. 「API key not valid」と表示されるとき（運用・環境担当向け）

ニュース API は Gemini（Google AI）のキーを使います。エラーが出る場合は次を確認してください。

1. **キーの取得元**  
   [Google AI Studio](https://aistudio.google.com/) → 左メニュー「API keys」→「Create API key」で作成したキーを使う。

2. **GCP で API を有効にする**  
   キーを作ったプロジェクト（例: skd-404）で、**Generative Language API** を有効にする。  
   - [API ライブラリ（Generative Language API）](https://console.cloud.google.com/apis/library/generativelanguage.googleapis.com) を開く  
   - プロジェクトで「skd-404」などを選択 →「有効にする」をクリック  

3. **.env の確認**  
   - プロジェクト直下の `.env` に `GEMINI_API_KEY=ここにキー` の 1 行だけ（余計なスペース・改行なし）で保存する。  
   - キーは「AIza」で始まる長い文字列です。  

4. **キーが読めているか確認**  
   開発サーバー起動中に `http://localhost:8000/api/news-debug` を開く。  
   - `envFound: true`・`keyLength` が 39 前後・`keyPrefix: "AIzaS"` なら .env は読めている。  
   - そのうえでエラーになる場合は、上記 1・2（AI Studio でキー作成・GCP で API 有効化）を再確認する。  

5. **PHP の再起動**  
   `.env` を変更したら、`php -S localhost:8000 router.php` を一度止めてから再度起動する。

API キーが使えない間は、ニュース画面にはサンプル記事が表示され、「（APIキー未設定のためサンプル表示です）」と表示されます。
