# Cloud Run デプロイ（Vertex AI / Gemini）

## 概要

- コンテナは **Apache + PHP 8.2**。`router.php` で `/api/*` と `public/` 静的ファイルを振り分けます（ローカルの `php -S ... router.php` と同じ URL 構造）。
- **Vertex AI** を使う場合は **API キー不要**。Cloud Run の実行サービスアカウントに **Vertex AI User**（`roles/aiplatform.user`）を付与し、**Vertex AI API** を有効にします。
- ローカルでは従来どおり **`GEMINI_API_KEY`** でも動作します。

## 環境変数（Vertex）

| 変数 | 説明 |
|------|------|
| `GOOGLE_CLOUD_PROJECT` | GCP プロジェクト ID（Cloud Run では自動設定されることが多い） |
| `VERTEX_AI_LOCATION` | リージョン（既定: `us-central1`）。モデルが利用可能なリージョンに合わせる |
| `USE_VERTEX_AI` | `1` または `true` で **API キーがあっても Vertex を優先** |
| `GEMINI_VERTEX_MODEL` | 任意（既定: `gemini-2.5-flash`） |
| `IMAGEN_MODEL` | 任意（既定: `imagen-4.0-generate-001`） |

API キー方式に戻す場合は `GEMINI_API_KEY` を設定し、`USE_VERTEX_AI` を付けない（かつプロジェクト ID を渡さない）構成にします。

## Vertex に切り替える前に（GCP コンソール）

1. **課金**が有効な GCP プロジェクトを用意する（Firebase と同じプロジェクト ID でも可）。
2. **API を有効化**: 「Vertex AI API」（必要なら「Generative Language API」は Studio 用）。
3. **IAM**: 実行に使うプリンシパルに **Vertex AI User**（`roles/aiplatform.user`）を付与  
   - Cloud Run: 実行サービスアカウント  
   - ローカル ADC: ログインした Google アカウントに、プロジェクトで上記ロール（またはそれ以上）
4. **クォータ**: [IAM と管理 → 割り当て（Quotas）](https://console.cloud.google.com/iam-admin/quotas) で `Vertex AI` / `Imagen` 関連の **1 日あたり・分あたり** を確認。足りなければ **増枠申請**。

> Studio（`GEMINI_API_KEY`）の `predict_requests_per_model_per_day` と、Vertex の枠は **別**です。Vertex 側にも上限があるため、「必ず多い」わけではなく、コンソールで確認してください。

## ローカル `.env`（このリポジトリ）

プロジェクト直下の `.env` に例:

```env
USE_VERTEX_AI=1
GOOGLE_CLOUD_PROJECT=あなたのGCPプロジェクトID
VERTEX_AI_LOCATION=us-central1
```

テンプレートは `.env.example` を参照。

### Windows（PowerShell）で ADC

```powershell
gcloud auth application-default login
gcloud config set project あなたのGCPプロジェクトID
cd C:\path\to\SKD404
composer install
php -S localhost:8000 router.php
```

`401` / `access token unavailable` のときは、上記 `application-default login` と `composer install`（`vendor/google/auth`）を確認。

## ビルドとデプロイ例

```bash
# Artifact Registry にプッシュしてから
gcloud run deploy skd404 \
  --source . \
  --region asia-northeast1 \
  --allow-unauthenticated \
  --set-env-vars "VERTEX_AI_LOCATION=us-central1" \
  --service-account YOUR_RUN_SA@YOUR_PROJECT.iam.gserviceaccount.com
```

実行 SA に `roles/aiplatform.user` を付与してください。

## ローカルで Vertex を試す

```bash
gcloud auth application-default login
export GOOGLE_CLOUD_PROJECT=your-project
export VERTEX_AI_LOCATION=us-central1
# GEMINI_API_KEY は未設定のまま
composer install
php -S localhost:8000 router.php
```

`vendor/` が必要です（`composer install`）。

## トラブルシュート

- **401 / access token unavailable**: ADC が効いていない、または SA に Vertex 権限がない。
- **404 / model**: `VERTEX_AI_LOCATION` がそのモデル未対応のリージョンの可能性。リージョンを変更。
- **composer**: イメージ内で `composer install` 済み。ローカルでも `composer install` が必要。
