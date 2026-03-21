<?php
/**
 * Gemini API プロキシ: Imagen 4 画像生成
 *
 * - 記念おにぎりモード: userId 指定時 — Firebase からコンテキスト取得、固定＋動的プロンプト
 *   - GEMINI_API_KEY: Imagen はテキストのみ（公式 REST）。I2I＋参照画像は Vertex（ADC）時のみ。
 * - シンプルモード: prompt のみ — 従来どおりテキストのみで生成（互換）
 *
 * .env:
 * - ローカル等: GEMINI_API_KEY（Google AI Studio）
 * - Cloud Run / Vertex: GOOGLE_CLOUD_PROJECT（または VERTEX_AI_PROJECT）+ VERTEX_AI_LOCATION（既定 us-central1）
 *   + 実行サービスアカウントに roles/aiplatform.user。USE_VERTEX_AI=1 で API キーより Vertex を優先。
 * - GEMINI_VERTEX_MODEL（任意）, IMAGEN_MODEL（任意）, FIREBASE_PROJECT_ID + SA（Firestore REST）
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
$imagenModel = envValue('IMAGEN_MODEL', $env, 'imagen-4.0-generate-001');
$geminiVertexModel = envValue('GEMINI_VERTEX_MODEL', $env, 'gemini-2.5-flash');

$auth = resolveGeminiAuth($env);
if ($auth === null) {
    http_response_code(500);
    echo json_encode([
        'error' => 'Gemini auth not configured',
        'hint' => 'Set GEMINI_API_KEY, or Vertex: GOOGLE_CLOUD_PROJECT + VERTEX_AI_LOCATION and ADC (Cloud Run SA or gcloud auth application-default login)'
    ]);
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
        $translated = translateToEnglish($manualPrompt, $auth, $geminiVertexModel);
        if ($translated !== '') {
            $promptForImagen = $translated;
        }
    }

    $result = imagenPredictTextOnly($promptForImagen, $auth, $imagenModel);
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

// 記念日: anniversaries.json の「今日」に該当する日だけ反映（該当なしの日は記念日ブロックなし）
applyAnniversaryFromJson($context);

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
// today_event は anniversaries.json 由来のみ使用（クライアント・Firestoreからの上書きは受け付けない）

if ($manualPrompt !== '') {
    $manualPromptEn = preg_match('/[\x{3040}-\x{30FF}\x{4E00}-\x{9FFF}]/u', $manualPrompt)
        ? translateToEnglish($manualPrompt, $auth, $geminiVertexModel)
        : $manualPrompt;
    if ($manualPromptEn !== '') {
        $context['extra_prompt'] = $manualPromptEn;
    }
}

$finalPrompt = $useSkd404Style
    ? buildDynamicPrompt($context, $fixedStylePrompt)
    : buildDynamicPrompt($context, '');

/**
 * Google AI Studio の API キー（generativelanguage）では、公式 REST はテキスト prompt のみ。
 * I2I＋参照画像は Vertex 向けのため、API キー時はテキスト生成のみ（失敗と二重呼び出しを避ける）
 */
if ($auth['type'] === 'api_key') {
    $result = imagenPredictTextOnly($finalPrompt, $auth, $imagenModel);
} else {
    $result = generateSpecialOnigiriImage($finalPrompt, $auth, $imagenModel);
    // API が I2I を拒否した場合はテキストのみで再試行
    if (!$result['success'] && !empty($result['fallback_ok'])) {
        $result = imagenPredictTextOnly($finalPrompt, $auth, $imagenModel);
    }
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
    'anniversary' => !empty($context['anniversary_mmdd']) ? [
        'date' => $context['anniversary_mmdd'],
        'name' => $context['anniversary_name'] ?? '',
        'keyword' => $context['anniversary_keyword'] ?? ''
    ] : null,
    'mode' => 'commemorative_onigiri'
]);

// ---------------------------------------------------------------------------
// 0) Gemini API キー / Vertex AI（ADC）
// ---------------------------------------------------------------------------

function resolveGeminiAuth($env)
{
    $flag = trim((string) envValue('USE_VERTEX_AI', $env, ''));
    $forceVertex = ($flag === '1' || strcasecmp($flag, 'true') === 0 || strcasecmp($flag, 'yes') === 0);
    $apiKey = envValue('GEMINI_API_KEY', $env);
    $project = envValue('GOOGLE_CLOUD_PROJECT', $env) ?: envValue('VERTEX_AI_PROJECT', $env);
    $location = envValue('VERTEX_AI_LOCATION', $env, 'us-central1');

    if ($forceVertex) {
        return $project !== '' ? ['type' => 'vertex', 'project' => $project, 'location' => $location] : null;
    }
    if ($apiKey !== '') {
        return ['type' => 'api_key', 'apiKey' => $apiKey];
    }
    if ($project !== '') {
        return ['type' => 'vertex', 'project' => $project, 'location' => $location];
    }
    return null;
}

function vertexAiHost($location)
{
    return rawurlencode($location) . '-aiplatform.googleapis.com';
}

function vertexImagenPredictUrl($project, $location, $modelId)
{
    return sprintf(
        'https://%s/v1/projects/%s/locations/%s/publishers/google/models/%s:predict',
        vertexAiHost($location),
        rawurlencode($project),
        rawurlencode($location),
        rawurlencode($modelId)
    );
}

function vertexGeminiGenerateUrl($project, $location, $modelId)
{
    return sprintf(
        'https://%s/v1/projects/%s/locations/%s/publishers/google/models/%s:generateContent',
        vertexAiHost($location),
        rawurlencode($project),
        rawurlencode($location),
        rawurlencode($modelId)
    );
}

function ensureComposerAutoload()
{
    static $done = false;
    if ($done) {
        return true;
    }
    $path = dirname(__DIR__) . '/vendor/autoload.php';
    if (!is_file($path)) {
        return false;
    }
    require_once $path;
    $done = true;
    return true;
}

function getVertexAccessToken()
{
    static $cached = '';
    static $expiresAt = 0;
    $now = time();
    if ($cached !== '' && $now < $expiresAt - 120) {
        return $cached;
    }
    if (!ensureComposerAutoload()) {
        return '';
    }
    try {
        $scopes = ['https://www.googleapis.com/auth/cloud-platform'];
        $creds = \Google\Auth\ApplicationDefaultCredentials::getCredentials($scopes);
        $token = $creds->fetchAuthToken();
    } catch (\Throwable $e) {
        return '';
    }
    $access = (string) ($token['access_token'] ?? '');
    if ($access === '') {
        return '';
    }
    $cached = $access;
    $expiresAt = $now + (int) ($token['expires_in'] ?? 3600);
    return $cached;
}

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
    // today_event は anniversaries.json でのみ設定（Firestore は参照しない）

    return $ctx;
}

/**
 * SKD404 ルートの anniversaries.json を読み、日本時間の「今日」が該当する場合だけ記念日情報を context に入れる。
 */
function applyAnniversaryFromJson(&$context)
{
    $context['today_event'] = '';
    $context['anniversary_mmdd'] = '';
    $context['anniversary_name'] = '';
    $context['anniversary_keyword'] = '';
    $context['anniversary_props'] = '';

    $ann = getAnniversaryForToday();
    if ($ann === null) {
        return;
    }

    $context['today_event'] = $ann['keyword'] !== '' ? $ann['keyword'] : $ann['name'];
    $context['anniversary_mmdd'] = $ann['mmdd'];
    $context['anniversary_name'] = $ann['name'];
    $context['anniversary_keyword'] = $ann['keyword'];
    $context['anniversary_props'] = $ann['props'];
}

/**
 * @return array{mmdd:string,name:string,keyword:string,props:string}|null
 */
function getAnniversaryForToday()
{
    $path = dirname(__DIR__) . '/anniversaries.json';
    if (!is_file($path)) {
        return null;
    }
    $raw = file_get_contents($path);
    if ($raw === false) {
        return null;
    }
    $data = json_decode($raw, true);
    if (!is_array($data)) {
        return null;
    }

    try {
        $tz = new DateTimeZone('Asia/Tokyo');
        $now = new DateTime('now', $tz);
        $mmdd = $now->format('m-d');
    } catch (\Throwable $e) {
        $mmdd = date('m-d');
    }

    if (!isset($data[$mmdd]) || !is_array($data[$mmdd])) {
        return null;
    }

    $row = $data[$mmdd];
    $props = isset($row['props']) && is_string($row['props']) ? trim($row['props']) : '';
    if ($props === '') {
        return null;
    }

    return [
        'mmdd' => $mmdd,
        'name' => isset($row['name']) && is_string($row['name']) ? trim($row['name']) : '',
        'keyword' => isset($row['keyword']) && is_string($row['keyword']) ? trim($row['keyword']) : '',
        'props' => $props
    ];
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
    $extraPrompt = trim((string) ($context['extra_prompt'] ?? ''));
    $annProps = trim((string) ($context['anniversary_props'] ?? ''));

    $dynamicParts = [];
    $dynamicParts[] = "Create a special commemorative onigiri for today's user status.";
    $dynamicParts[] = "Current level badge should be visible as 'Lv. {$currentLevel}'.";

    if ($isLevelUp) {
        $dynamicParts[] = "Celebrating level up with a miniature graduation cap, golden aura, and confetti. Holds a flag saying 'Lv. {$currentLevel}'.";
    }

    $dynamicParts[] = buildThemePropPrompt($learningTheme);

    // 記念日: anniversaries.json に今日の日付がある場合のみ（name / keyword / props の概要を反映）
    if ($annProps !== '') {
        $dynamicParts[] = buildAnniversaryPrompt($context);
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

/**
 * anniversaries.json の行を英語プロンプトに落とす（背景は White のまま、山などは「シルエット/小アイコン」に留める）
 */
function buildAnniversaryPrompt($context)
{
    $name = trim((string) ($context['anniversary_name'] ?? ''));
    $keyword = trim((string) ($context['anniversary_keyword'] ?? ''));
    $props = trim((string) ($context['anniversary_props'] ?? ''));
    $label = $keyword !== '' ? $keyword : $name;
    $line = "Commemorative day (Japan): {$label}";
    if ($name !== '' && $keyword !== '' && $name !== $keyword) {
        $line .= " — {$name}";
    }
    $line .= ". Scene accents (from official list): {$props}. ";
    $line .= "Adapt to this flat mascot: use as held props, side props, or small floating icons only; keep pure white background (no scenic photo background). ";
    $line .= "Do not replace the onigiri rice-ball shape.";
    return $line;
}

// ---------------------------------------------------------------------------
// 4) Imagen: I2I + 参照画像 / テキストのみ
// ---------------------------------------------------------------------------

/**
 * Imagen は入力プロンプトが最大 480 トークン（公式）。長すぎると 400 で失敗するため切り詰める。
 */
function truncateForImagenPrompt($text, $maxChars = 1500)
{
    $text = (string) $text;
    if ($text === '') {
        return $text;
    }
    if (function_exists('mb_strlen') && function_exists('mb_substr')) {
        if (mb_strlen($text, 'UTF-8') > $maxChars) {
            return mb_substr($text, 0, $maxChars, 'UTF-8');
        }
        return $text;
    }
    if (strlen($text) > $maxChars) {
        return substr($text, 0, $maxChars);
    }
    return $text;
}

function generateSpecialOnigiriImage($finalPrompt, $auth, $imagenModel)
{
    $finalPrompt = truncateForImagenPrompt($finalPrompt);
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

    if ($auth['type'] === 'api_key') {
        $url = 'https://generativelanguage.googleapis.com/v1beta/models/' . rawurlencode($imagenModel) . ':predict';
        $res = postJsonWithGoogleApiKey($url, $payload, $auth['apiKey'], 90);
    } else {
        $token = getVertexAccessToken();
        if ($token === '') {
            return [
                'success' => false,
                'error' => 'Vertex AI access token unavailable',
                'detail' => 'Run composer install; on Cloud Run grant the service account roles/aiplatform.user',
                'fallback_ok' => true
            ];
        }
        $url = vertexImagenPredictUrl($auth['project'], $auth['location'], $imagenModel);
        $res = postJsonBearer($url, $payload, 90, $token);
    }
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
            'message' => parseGoogleApiErrorMessage($res['body']),
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

function imagenPredictTextOnly($promptForImagen, $auth, $imagenModel)
{
    $promptForImagen = truncateForImagenPrompt($promptForImagen);
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

    if ($auth['type'] === 'api_key') {
        $url = 'https://generativelanguage.googleapis.com/v1beta/models/' . rawurlencode($imagenModel) . ':predict';
        $res = postJsonWithGoogleApiKey($url, $payload, $auth['apiKey'], 90);
    } else {
        $token = getVertexAccessToken();
        if ($token === '') {
            return ['success' => false, 'error' => 'Vertex AI access token unavailable', 'detail' => 'ADC / IAM'];
        }
        $url = vertexImagenPredictUrl($auth['project'], $auth['location'], $imagenModel);
        $res = postJsonBearer($url, $payload, 90, $token);
    }
    if (!$res['ok']) {
        return ['success' => false, 'error' => 'Upstream request failed', 'detail' => $res['error']];
    }
    if ($res['status'] !== 200) {
        return [
            'success' => false,
            'error' => 'Imagen API error',
            'status' => $res['status'],
            'body' => $res['body'],
            'message' => parseGoogleApiErrorMessage($res['body'])
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
    $projectId = envValue('FIREBASE_PROJECT_ID', $env, 'skd-404');
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

function translateToEnglish($text, $auth, $geminiModelName = 'gemini-2.5-flash')
{
    $payload = [
        'contents' => [[
            'parts' => [[
                'text' => 'Translate the following to English in one short sentence, suitable as an image generation prompt. Output only the English text, no explanation. ' . $text
            ]]
        ]],
        'generationConfig' => ['maxOutputTokens' => 200]
    ];
    if ($auth['type'] === 'api_key') {
        $url = 'https://generativelanguage.googleapis.com/v1beta/models/' . rawurlencode($geminiModelName) . ':generateContent?key=' . urlencode($auth['apiKey']);
        $res = postJson($url, $payload, 15);
    } else {
        $token = getVertexAccessToken();
        if ($token === '') {
            return '';
        }
        $url = vertexGeminiGenerateUrl($auth['project'], $auth['location'], $geminiModelName);
        $res = postJsonBearer($url, $payload, 15, $token);
    }
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

/**
 * Gemini / Generative Language API の推奨: Imagen 等は x-goog-api-key ヘッダー（公式 REST 例と同じ）
 */
function postJsonWithGoogleApiKey($url, $payload, $apiKey, $timeoutSec = 30)
{
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => json_encode($payload),
        CURLOPT_HTTPHEADER => [
            'Content-Type: application/json',
            'x-goog-api-key: ' . $apiKey
        ],
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

/**
 * @param string $jsonBody
 * @return string
 */
function parseGoogleApiErrorMessage($jsonBody)
{
    $data = json_decode((string) $jsonBody, true);
    if (!is_array($data)) {
        return '';
    }
    if (!empty($data['error']['message'])) {
        return (string) $data['error']['message'];
    }
    if (!empty($data['error']['status'])) {
        return (string) $data['error']['status'];
    }
    return '';
}

function postJsonBearer($url, $payload, $timeoutSec, $bearerToken)
{
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => json_encode($payload),
        CURLOPT_HTTPHEADER => [
            'Content-Type: application/json',
            'Authorization: Bearer ' . $bearerToken
        ],
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
