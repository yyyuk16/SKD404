<?php
/**
 * Gemini API プロキシ: キャラクター画像生成（Imagen 利用）
 * プロンプトを受け取り、Imagen で画像生成し base64 を返す。
 * 環境変数 GEMINI_API_KEY または .env で API キーを設定すること。
 * 注意: Imagen は英語プロンプト推奨。日本語の場合は簡易的に英訳してから渡すか、フロントで英語を送ること。
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

// Imagen 4 は英語プロンプト推奨。日本語のみの場合は Gemini で英訳してから Imagen を呼ぶ（オプション）
$promptForImagen = $prompt;
if (preg_match('/[\x{3040}-\x{309F}\x{30A0}-\x{30FF}\x{4E00}-\x{9FAF}]/u', $prompt)) {
    $translated = translateToEnglish($prompt, $apiKey);
    if ($translated !== '') {
        $promptForImagen = $translated;
    }
}

// Imagen 4 API（Python SDK の generate_images と同等の REST 呼び出し）
// Python: client.models.generate_images(model='imagen-4.0-generate-001', prompt='...', config=GenerateImagesConfig(number_of_images=4))
// 参考: https://ai.google.dev/gemini-api/docs/imagen
$model = 'imagen-4.0-generate-001';
$url = 'https://generativelanguage.googleapis.com/v1beta/models/' . $model . ':predict?key=' . urlencode($apiKey);

$payload = [
    'instances' => [
        ['prompt' => $promptForImagen]
    ],
    'parameters' => [
        'sampleCount' => 1,   // number_of_images に相当（1〜4）
        'aspectRatio' => '1:1',
        'personGeneration' => 'allow_adult'
    ]
];

$ch = curl_init($url);
curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => json_encode($payload),
    CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT => 90
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
        'error' => 'Imagen API error',
        'status' => $status,
        'body' => $response
    ]);
    exit;
}

// レスポンス形式: predictions[].bytesBase64Encoded または predictions[].image.bytesBase64Encoded 等
$imageBase64 = null;
if (!empty($data['predictions']) && is_array($data['predictions'])) {
    $first = $data['predictions'][0];
    if (isset($first['bytesBase64Encoded'])) {
        $imageBase64 = $first['bytesBase64Encoded'];
    } elseif (isset($first['image']['bytesBase64Encoded'])) {
        $imageBase64 = $first['image']['bytesBase64Encoded'];
    } elseif (isset($first['image']['imageBytes'])) {
        $imageBase64 = $first['image']['imageBytes'];
    }
}

if ($imageBase64 === null) {
    echo json_encode([
        'success' => false,
        'message' => 'No image in response',
        'raw' => $data
    ]);
    exit;
}

echo json_encode([
    'success' => true,
    'imageBase64' => $imageBase64,
    'mimeType' => 'image/png'
]);

/**
 * 日本語プロンプトを簡易的に英訳する（Gemini generateContent 使用）
 */
function translateToEnglish($text, $apiKey) {
    $url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' . urlencode($apiKey);
    $payload = [
        'contents' => [
            [
                'parts' => [
                    ['text' => 'Translate the following to English in one short sentence, suitable as an image generation prompt. Output only the English text, no explanation. ' . $text]
                ]
            ]
        ],
        'generationConfig' => ['maxOutputTokens' => 200]
    ];
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => json_encode($payload),
        CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 15
    ]);
    $res = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($code !== 200) {
        return '';
    }
    $json = json_decode($res, true);
    $out = $json['candidates'][0]['content']['parts'][0]['text'] ?? '';
    return trim(preg_replace('/^["\']|["\']$/u', '', $out));
}
