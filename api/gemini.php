<?php
/**
 * Gemini API プロキシ: キャラクター画像生成用
 * プロンプトを受け取り、Gemini で画像生成し URL または base64 を返す。
 * 環境変数 GEMINI_API_KEY または .env で API キーを設定すること。
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method Not Allowed']);
    exit;
}

$raw = file_get_contents('php://input');
$body = json_decode($raw, true);
$prompt = isset($body['prompt']) ? trim((string) $body['prompt']) : '';

if ($prompt === '') {
    http_response_code(400);
    echo json_encode(['error' => 'prompt is required']);
    exit;
}

$apiKey = getenv('GEMINI_API_KEY');
if ($apiKey === false || $apiKey === '') {
    $envPath = dirname(__DIR__) . '/.env';
    if (is_file($envPath)) {
        $lines = file($envPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        foreach ($lines as $line) {
            if (strpos($line, 'GEMINI_API_KEY=') === 0) {
                $apiKey = trim(substr($line, strlen('GEMINI_API_KEY=')), " \t\"'");
                break;
            }
        }
    }
}

if ($apiKey === false || $apiKey === '') {
    http_response_code(500);
    echo json_encode(['error' => 'GEMINI_API_KEY not configured']);
    exit;
}

// Gemini 1.5 Flash など画像生成対応モデルで画像生成リクエスト
// 注: 実際の Gemini 画像生成 API はモデル・エンドポイントが異なる場合があります。要確認。
$url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=' . urlencode($apiKey);

$payload = [
    'contents' => [
        [
            'parts' => [
                ['text' => 'Generate an image: ' . $prompt]
            ]
        ]
    ],
    'generationConfig' => [
        'responseModalities' => ['TEXT', 'IMAGE'],
        'responseMimeType' => 'image/png'
    ]
];

$ch = curl_init($url);
curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => json_encode($payload),
    CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT => 60
]);

$response = curl_exec($ch);
$status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$err = curl_error($ch);
curl_close($ch);

if ($err) {
    http_response_code(502);
    echo json_encode(['error' => 'Upstream request failed', 'detail' => $err]);
    exit;
}

$data = json_decode($response, true);

if ($status !== 200 || !is_array($data)) {
    http_response_code(502);
    echo json_encode([
        'error' => 'Gemini API error',
        'status' => $status,
        'body' => $response
    ]);
    exit;
}

// レスポンスから画像データを取得（実際の API 仕様に合わせてパース）
$imageData = null;
if (!empty($data['candidates'][0]['content']['parts'])) {
    foreach ($data['candidates'][0]['content']['parts'] as $part) {
        if (isset($part['inlineData']['data'])) {
            $imageData = $part['inlineData']['data'];
            break;
        }
    }
}

if ($imageData === null) {
    echo json_encode([
        'success' => false,
        'message' => 'No image in response',
        'raw' => $data
    ]);
    exit;
}

echo json_encode([
    'success' => true,
    'imageBase64' => $imageData,
    'mimeType' => 'image/png'
]);
