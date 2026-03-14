<?php
/**
 * 開発サーバー用ルーター
 * /api/* → api/*.php、それ以外 → public/ 内の静的ファイル
 * 使い方: php -S localhost:8000 router.php
 */
$uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$uri = rtrim($uri, '/') ?: '/';

// API 要求
if (preg_match('#^/api/([a-z0-9_-]+)(\.php)?$#', $uri, $m)) {
    $script = __DIR__ . '/api/' . $m[1] . '.php';
    if (is_file($script)) {
        require $script;
        return true;
    }
}

// 静的ファイル（public 配下）
$base = __DIR__ . '/public';
$path = $base . $uri;
if ($uri === '/') {
    $path = $base . '/login.html';
}
if (is_file($path) && strpos(realpath($path), realpath($base)) === 0) {
    $ext = pathinfo($path, PATHINFO_EXTENSION);
    $types = [
        'html' => 'text/html',
        'css' => 'text/css',
        'js' => 'application/javascript',
        'json' => 'application/json',
        'png' => 'image/png',
        'jpg' => 'image/jpeg',
        'jpeg' => 'image/jpeg',
        'gif' => 'image/gif',
        'ico' => 'image/x-icon',
        'svg' => 'image/svg+xml'
    ];
    if (isset($types[$ext])) {
        header('Content-Type: ' . $types[$ext] . '; charset=utf-8');
    }
    readfile($path);
    return true;
}

http_response_code(404);
header('Content-Type: text/plain; charset=utf-8');
echo '404 Not Found';
return true;
