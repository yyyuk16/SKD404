<?php
/**
 * Gemini API プロキシ: Imagen 4 画像生成
 *
 * - 記念おにぎりモード: userId 指定時 — Firebase からコンテキスト取得、固定＋動的プロンプト、I2I＋参照画像
 * - シンプルモード: prompt のみ — 従来どおりテキストのみで生成（互換）
 *
 * .env: GEMINI_API_KEY, IMAGEN_MODEL（任意）, FIREBASE_PROJECT_ID + サービスアカウント（Firestore REST 用）
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

$env = loadEnv();
$apiKey = envValue('GEMINI_API_KEY', $env);
$imagenModel = envValue('IMAGEN_MODEL', $env, 'imagen-4.0-generate-001');

if ($apiKey === '') {
    http_response_code(500);
    echo json_encode(['error' => 'GEMINI_API_KEY not configured']);
    exit;
}

$raw = file_get_contents('php://input');
$body = json_decode($raw, true);
if (!is_array($body)) {
    $body = [];
}

$userId = trim((string)($body['userId'] ?? ''));
$manualPrompt = isset($body['prompt']) ? trim((string) $body['prompt']) : '';
$useSkd404Style = !array_key_exists('useSkd404Style', $body) ? true : (bool) $body['useSkd404Style'];

// --- シンプルモード（互換）: userId なしで prompt のみ ---
if ($userId === '') {
    if ($manualPrompt === '') {
        http_response_code(400);
        echo json_encode(['error' => 'prompt is required when userId is omitted']);
        exit;
    }

    $promptForImagen = $manualPrompt;
    if (preg_match('/[\x{3040}-\x{309F}\x{30A0}-\x{30FF}\x{4E00}-\x{9FAF}]/u', $manualPrompt)) {
        $translated = translateToEnglish($manualPrompt, $apiKey);
        if ($translated !== '') {
            $promptForImagen = $translated;
        }
    }

    $result = imagenPredictTextOnly($promptForImagen, $apiKey, $imagenModel);
    if (!$result['success']) {
        http_response_code(502);
        echo json_encode($result);
        exit;
    }

    echo json_encode([
        'success' => true,
        'imageBase64' => $result['imageBase64'],
        'mimeType' => $result['mimeType'],
        'prompt' => $promptForImagen,
        'mode' => 'simple'
    ]);
    exit;
}

// --- 記念おにぎりモード ---
$fixedStylePrompt = getFixedStylePrompt();
$context = getOnigiriContext($userId, $env);

// クライアントから任意で上書き（Realtime DB 側の状態と Firestore を同期していない場合など）
if (isset($body['current_level']) && is_numeric($body['current_level'])) {
    $context['current_level'] = max(1, (int) $body['current_level']);
}
if (isset($body['learning_theme']) && is_string($body['learning_theme']) && trim($body['learning_theme']) !== '') {
    $context['learning_theme'] = trim($body['learning_theme']);
}
if (array_key_exists('is_level_up', $body)) {
    $context['is_level_up'] = (bool) $body['is_level_up'];
}
if (isset($body['today_event']) && is_string($body['today_event'])) {
    $context['today_event'] = trim($body['today_event']);
}

if ($manualPrompt !== '') {
    $manualPromptEn = preg_match('/[\x{3040}-\x{30FF}\x{4E00}-\x{9FFF}]/u', $manualPrompt)
        ? translateToEnglish($manualPrompt, $apiKey)
        : $manualPrompt;
    if ($manualPromptEn !== '') {
        $context['extra_prompt'] = $manualPromptEn;
    }
}

$finalPrompt = $useSkd404Style
    ? buildDynamicPrompt($context, $fixedStylePrompt)
    : buildDynamicPrompt($context, '');

$result = generateSpecialOnigiriImage($finalPrompt, $apiKey, $imagenModel);

// API が I2I を拒否した場合はテキストのみで再試行
if (!$result['success'] && !empty($result['fallback_ok'])) {
    $result = imagenPredictTextOnly($finalPrompt, $apiKey, $imagenModel);
}

if (!$result['success']) {
    http_response_code(502);
    echo json_encode($result);
    exit;
}

echo json_encode([
    'success' => true,
    'imageBase64' => $result['imageBase64'],
    'mimeType' => $result['mimeType'],
    'prompt' => $finalPrompt,
    'context' => $context,
    'mode' => 'commemorative_onigiri'
]);

// ---------------------------------------------------------------------------
// 1) Firebase コンテキスト
// ---------------------------------------------------------------------------

function getOnigiriContext($userId, $env = [])
{
    $ctx = [
        'current_level' => 1,
        'learning_theme' => 'General Study',
        'is_level_up' => false,
        'today_event' => '',
        'extra_prompt' => ''
    ];

    if ($userId === '') {
        return $ctx;
    }

    $doc = fetchUserDataWithKreait($userId);
    if ($doc === null) {
        $doc = fetchUserDataWithFirestoreRest($userId, $env);
    }
    if (!is_array($doc)) {
        return $ctx;
    }

    if (isset($doc['current_level']) && is_numeric($doc['current_level'])) {
        $ctx['current_level'] = max(1, (int) $doc['current_level']);
    }
    if (!empty($doc['learning_theme']) && is_string($doc['learning_theme'])) {
        $ctx['learning_theme'] = trim($doc['learning_theme']);
    }
    if (array_key_exists('is_level_up', $doc)) {
        $ctx['is_level_up'] = (bool) $doc['is_level_up'];
    }
    if (!empty($doc['today_event']) && is_string($doc['today_event'])) {
        $ctx['today_event'] = trim($doc['today_event']);
    }

    return $ctx;
}

// ---------------------------------------------------------------------------
// 2) 固定スタイル（public/img ベース群に合わせる）
// ---------------------------------------------------------------------------

function getFixedStylePrompt()
{
    return <<<'EOT'
Google Doodle inspired celebratory mascot artwork. Flat 2D, Bold black outlines, Minimalist cute vector style, White background.
Single centered anthropomorphic Japanese onigiri mascot with rounded triangular silhouette and tiny kawaii face.
Keep composition clean and iconic, with strong readability at small size.
Preserve the onigiri identity: white rice body, simple nori/topping accents, thick consistent contour lines, no interior complexity.
Design language must match SKD404 onigiri reference assets in public/img (base.jpg, nori.jpg, shake.png, tempura.jpg, ume.jpg).
Add decorative elements only as accessories, held props, or floating objects around the onigiri; never replace or deform the core onigiri shape.
Negative constraints: 3D, Realistic, Highly detailed, Shading, Gradients.
EOT;
}

// ---------------------------------------------------------------------------
// 3) 動的プロンプト
// ---------------------------------------------------------------------------

function buildDynamicPrompt($context, $fixedStylePrompt)
{
    $currentLevel = (int) ($context['current_level'] ?? 1);
    $learningTheme = trim((string) ($context['learning_theme'] ?? 'General Study'));
    $isLevelUp = (bool) ($context['is_level_up'] ?? false);
    $todayEvent = trim((string) ($context['today_event'] ?? ''));
    $extraPrompt = trim((string) ($context['extra_prompt'] ?? ''));

    $dynamicParts = [];
    $dynamicParts[] = "Create a special commemorative onigiri for today's user status.";
    $dynamicParts[] = "Current level badge should be visible as 'Lv. {$currentLevel}'.";

    if ($isLevelUp) {
        $dynamicParts[] = "Celebrating level up with a miniature graduation cap, golden aura, and confetti. Holds a flag saying 'Lv. {$currentLevel}'.";
    }

    $dynamicParts[] = buildThemePropPrompt($learningTheme);

    if ($todayEvent !== '') {
        $dynamicParts[] = buildEventPropPrompt($todayEvent);
    }

    if ($extraPrompt !== '') {
        $dynamicParts[] = "Additional user request: {$extraPrompt}";
    }

    $dynamicParts[] = "Important placement rule: all theme/event objects must stay outside the onigiri body (held props, side props, floating background accents only).";
    $dynamicParts[] = "Keep one character only, centered, clean white background.";

    $dynamicPrompt = implode("\n", array_filter($dynamicParts));
    if (trim($fixedStylePrompt) === '') {
        return $dynamicPrompt;
    }
    return trim($fixedStylePrompt) . "\n\nDynamic scene instructions:\n" . $dynamicPrompt;
}

function buildThemePropPrompt($learningTheme)
{
    $key = strtolower($learningTheme);
    if (strpos($key, 'math') !== false || strpos($key, '算数') !== false || strpos($key, '数学') !== false) {
        return "Learning theme is Math: add floating formula symbols (+, -, x, =) and a small notebook as external props.";
    }
    if (strpos($key, 'coding') !== false || strpos($key, 'program') !== false || strpos($key, 'プログラ') !== false) {
        return "Learning theme is Coding: add a cute mini laptop with simple code brackets </> as external props.";
    }
    if (strpos($key, 'science') !== false || strpos($key, '理科') !== false) {
        return "Learning theme is Science: add a tiny beaker and atom icon as external props.";
    }
    if (strpos($key, 'english') !== false || strpos($key, '英語') !== false) {
        return "Learning theme is English: add ABC letter cards and a small dictionary as external props.";
    }
    return "Learning theme is {$learningTheme}: add one small study-related prop outside the onigiri body.";
}

function buildEventPropPrompt($todayEvent)
{
    $key = strtolower($todayEvent);
    if (strpos($key, 'space') !== false) {
        return "Today event is {$todayEvent}: add a tiny rocket, small stars, and a ringed planet around the onigiri (outside only).";
    }
    if (strpos($key, 'cat') !== false) {
        return "Today event is {$todayEvent}: add detachable cat-ear headband and paw-shaped balloons around the onigiri (outside only).";
    }
    if (strpos($key, 'music') !== false) {
        return "Today event is {$todayEvent}: add a mini eighth-note wand and floating music notes (outside only).";
    }
    return "Today event is {$todayEvent}: add 1-2 simple symbolic props related to this event outside the onigiri.";
}

// ---------------------------------------------------------------------------
// 4) Imagen: I2I + 参照画像 / テキストのみ
// ---------------------------------------------------------------------------

function generateSpecialOnigiriImage($finalPrompt, $apiKey, $imagenModel)
{
    $refs = loadOnigiriReferenceImages();
    if (empty($refs)) {
        return [
            'success' => false,
            'error' => 'No reference images found in public/img for I2I',
            'fallback_ok' => true
        ];
    }

    $baseImage = $refs[0];
    $styleRefs = array_slice($refs, 1);

    $url = 'https://generativelanguage.googleapis.com/v1beta/models/' . rawurlencode($imagenModel) . ':predict?key=' . urlencode($apiKey);
    $payload = [
        'instances' => [
            [
                'prompt' => $finalPrompt,
                'image' => [
                    'bytesBase64Encoded' => $baseImage['bytesBase64Encoded'],
                    'mimeType' => $baseImage['mimeType']
                ],
                'referenceImages' => array_map(function ($img) {
                    return [
                        'image' => [
                            'bytesBase64Encoded' => $img['bytesBase64Encoded'],
                            'mimeType' => $img['mimeType']
                        ]
                    ];
                }, $styleRefs)
            ]
        ],
        'parameters' => [
            'sampleCount' => 1,
            'aspectRatio' => '1:1',
            'personGeneration' => 'allow_adult'
        ]
    ];

    $res = postJson($url, $payload, 90);
    if (!$res['ok']) {
        return [
            'success' => false,
            'error' => 'Imagen API request failed',
            'detail' => $res['error'],
            'fallback_ok' => true
        ];
    }
    if ($res['status'] !== 200) {
        return [
            'success' => false,
            'error' => 'Imagen API error (I2I)',
            'status' => $res['status'],
            'body' => $res['body'],
            'fallback_ok' => true
        ];
    }

    $json = json_decode($res['body'], true);
    $imageBase64 = extractImagenBase64($json);
    if ($imageBase64 === null) {
        return [
            'success' => false,
            'error' => 'No image returned from Imagen (I2I)',
            'raw' => $json,
            'fallback_ok' => true
        ];
    }

    return [
        'success' => true,
        'imageBase64' => $imageBase64,
        'mimeType' => 'image/png'
    ];
}

function imagenPredictTextOnly($promptForImagen, $apiKey, $imagenModel)
{
    $url = 'https://generativelanguage.googleapis.com/v1beta/models/' . rawurlencode($imagenModel) . ':predict?key=' . urlencode($apiKey);
    $payload = [
        'instances' => [
            ['prompt' => $promptForImagen]
        ],
        'parameters' => [
            'sampleCount' => 1,
            'aspectRatio' => '1:1',
            'personGeneration' => 'allow_adult'
        ]
    ];

    $res = postJson($url, $payload, 90);
    if (!$res['ok']) {
        return ['success' => false, 'error' => 'Upstream request failed', 'detail' => $res['error']];
    }
    if ($res['status'] !== 200) {
        return [
            'success' => false,
            'error' => 'Imagen API error',
            'status' => $res['status'],
            'body' => $res['body']
        ];
    }

    $data = json_decode($res['body'], true);
    $imageBase64 = extractImagenBase64($data);
    if ($imageBase64 === null) {
        return [
            'success' => false,
            'message' => 'No image in response',
            'raw' => $data
        ];
    }

    return [
        'success' => true,
        'imageBase64' => $imageBase64,
        'mimeType' => 'image/png'
    ];
}

function loadOnigiriReferenceImages()
{
    $imgDir = dirname(__DIR__) . '/public/img';
    $paths = [
        $imgDir . '/base.jpg',
        $imgDir . '/nori.jpg',
        $imgDir . '/shake.png',
        $imgDir . '/tempura.jpg',
        $imgDir . '/ume.jpg'
    ];

    $result = [];
    foreach ($paths as $p) {
        if (!is_file($p)) {
            continue;
        }
        $bin = file_get_contents($p);
        if ($bin === false) {
            continue;
        }
        $mime = function_exists('mime_content_type') ? @mime_content_type($p) : '';
        if (!is_string($mime) || $mime === '') {
            $mime = 'image/jpeg';
        }
        $result[] = [
            'bytesBase64Encoded' => base64_encode($bin),
            'mimeType' => $mime
        ];
    }
    return $result;
}

function extractImagenBase64($data)
{
    if (!is_array($data) || empty($data['predictions']) || !is_array($data['predictions'])) {
        return null;
    }
    $first = $data['predictions'][0] ?? null;
    if (!is_array($first)) {
        return null;
    }
    if (!empty($first['bytesBase64Encoded'])) {
        return $first['bytesBase64Encoded'];
    }
    if (!empty($first['image']['bytesBase64Encoded'])) {
        return $first['image']['bytesBase64Encoded'];
    }
    if (!empty($first['image']['imageBytes'])) {
        return $first['image']['imageBytes'];
    }
    return null;
}

function fetchUserDataWithKreait($userId)
{
    if (!class_exists('\Kreait\Firebase\Factory')) {
        return null;
    }
    try {
        $factory = new \Kreait\Firebase\Factory();
        $firestore = $factory->createFirestore();
        $db = $firestore->database();
        $snapshot = $db->collection('users')->document($userId)->snapshot();
        if (!$snapshot->exists()) {
            return null;
        }
        return $snapshot->data();
    } catch (\Throwable $e) {
        return null;
    }
}

function fetchUserDataWithFirestoreRest($userId, $env = [])
{
    $projectId = envValue('FIREBASE_PROJECT_ID', $env);
    if ($projectId === '') {
        return null;
    }
    $token = getGoogleAccessToken($env);
    if ($token === '') {
        return null;
    }

    $docPath = sprintf(
        'https://firestore.googleapis.com/v1/projects/%s/databases/(default)/documents/users/%s',
        rawurlencode($projectId),
        rawurlencode($userId)
    );

    $res = getJsonWithBearer($docPath, $token, 15);
    if (!$res['ok'] || $res['status'] !== 200) {
        return null;
    }
    $json = json_decode($res['body'], true);
    if (!is_array($json) || empty($json['fields'])) {
        return null;
    }

    return decodeFirestoreFields($json['fields']);
}

function decodeFirestoreFields($fields)
{
    $out = [];
    foreach ((array) $fields as $k => $v) {
        if (!is_array($v)) {
            continue;
        }
        if (isset($v['integerValue'])) {
            $out[$k] = (int) $v['integerValue'];
        } elseif (isset($v['doubleValue'])) {
            $out[$k] = (float) $v['doubleValue'];
        } elseif (isset($v['stringValue'])) {
            $out[$k] = (string) $v['stringValue'];
        } elseif (isset($v['booleanValue'])) {
            $out[$k] = (bool) $v['booleanValue'];
        } elseif (isset($v['nullValue'])) {
            $out[$k] = null;
        } elseif (isset($v['mapValue']['fields'])) {
            $out[$k] = decodeFirestoreFields($v['mapValue']['fields']);
        } elseif (isset($v['arrayValue']['values']) && is_array($v['arrayValue']['values'])) {
            $arr = [];
            foreach ($v['arrayValue']['values'] as $item) {
                $arr[] = decodeFirestoreFields(['x' => $item])['x'] ?? null;
            }
            $out[$k] = $arr;
        }
    }
    return $out;
}

function getGoogleAccessToken($env = [])
{
    $serviceAccountPath = envValue('GOOGLE_APPLICATION_CREDENTIALS', $env);
    $serviceAccountInline = envValue('FIREBASE_SERVICE_ACCOUNT_JSON', $env);
    $json = null;

    if ($serviceAccountPath !== '' && is_file($serviceAccountPath)) {
        $raw = file_get_contents($serviceAccountPath);
        $json = json_decode((string) $raw, true);
    } elseif ($serviceAccountInline !== '') {
        $json = json_decode($serviceAccountInline, true);
    }
    if (!is_array($json) || empty($json['client_email']) || empty($json['private_key'])) {
        return '';
    }

    $now = time();
    $header = base64UrlEncode(json_encode(['alg' => 'RS256', 'typ' => 'JWT']));
    $payload = base64UrlEncode(json_encode([
        'iss' => $json['client_email'],
        'scope' => 'https://www.googleapis.com/auth/datastore',
        'aud' => 'https://oauth2.googleapis.com/token',
        'iat' => $now,
        'exp' => $now + 3600
    ]));
    $unsignedJwt = $header . '.' . $payload;

    $signature = '';
    $ok = openssl_sign($unsignedJwt, $signature, $json['private_key'], OPENSSL_ALGO_SHA256);
    if (!$ok) {
        return '';
    }
    $jwt = $unsignedJwt . '.' . base64UrlEncode($signature);

    $ch = curl_init('https://oauth2.googleapis.com/token');
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 15,
        CURLOPT_HTTPHEADER => ['Content-Type: application/x-www-form-urlencoded'],
        CURLOPT_POSTFIELDS => http_build_query([
            'grant_type' => 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            'assertion' => $jwt
        ])
    ]);
    $res = curl_exec($ch);
    $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err = curl_error($ch);
    curl_close($ch);
    if ($err || $status !== 200) {
        return '';
    }

    $jsonRes = json_decode($res, true);
    return (string) ($jsonRes['access_token'] ?? '');
}

function base64UrlEncode($input)
{
    return rtrim(strtr(base64_encode($input), '+/', '-_'), '=');
}

function translateToEnglish($text, $apiKey)
{
    $url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' . urlencode($apiKey);
    $payload = [
        'contents' => [[
            'parts' => [[
                'text' => 'Translate the following to English in one short sentence, suitable as an image generation prompt. Output only the English text, no explanation. ' . $text
            ]]
        ]],
        'generationConfig' => ['maxOutputTokens' => 200]
    ];
    $res = postJson($url, $payload, 15);
    if (!$res['ok'] || $res['status'] !== 200) {
        return '';
    }
    $json = json_decode($res['body'], true);
    $out = $json['candidates'][0]['content']['parts'][0]['text'] ?? '';
    return trim(preg_replace('/^["\']|["\']$/u', '', (string) $out));
}

function postJson($url, $payload, $timeoutSec = 30)
{
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => json_encode($payload),
        CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => $timeoutSec
    ]);
    $body = curl_exec($ch);
    $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);
    curl_close($ch);

    return [
        'ok' => $error === '',
        'status' => (int) $status,
        'body' => $body === false ? '' : $body,
        'error' => $error
    ];
}

function getJsonWithBearer($url, $token, $timeoutSec = 15)
{
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_HTTPGET => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => $timeoutSec,
        CURLOPT_HTTPHEADER => [
            'Authorization: Bearer ' . $token,
            'Accept: application/json'
        ]
    ]);
    $body = curl_exec($ch);
    $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);
    curl_close($ch);

    return [
        'ok' => $error === '',
        'status' => (int) $status,
        'body' => $body === false ? '' : $body,
        'error' => $error
    ];
}

function loadEnv()
{
    $vars = [];
    $envPath = dirname(__DIR__) . '/.env';
    if (!is_file($envPath)) {
        return $vars;
    }
    $lines = file($envPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($lines as $line) {
        $line = trim($line);
        if ($line === '' || strpos($line, '#') === 0) {
            continue;
        }
        $eqPos = strpos($line, '=');
        if ($eqPos === false) {
            continue;
        }
        $k = trim(substr($line, 0, $eqPos));
        $v = trim(substr($line, $eqPos + 1), " \t\n\r\0\x0B\"'");
        if ($k !== '') {
            $vars[$k] = $v;
        }
    }
    return $vars;
}

function envValue($key, $env = [], $default = '')
{
    $val = getenv($key);
    if (is_string($val) && $val !== '') {
        return $val;
    }
    if (isset($env[$key]) && $env[$key] !== '') {
        return $env[$key];
    }
    return $default;
}
