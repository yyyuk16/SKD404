<?php
/**
 * メモ一覧・保存 API（オプション）
 * 本アプリでは記録はフロントから Firebase Realtime Database の memos/{uid} に直接保存。
 * サーバー側で集計・エクスポートなどを行う場合に拡張用。
 */
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'GET' && $_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method Not Allowed']);
    exit;
}

$uid = isset($_GET['uid']) ? trim($_GET['uid']) : '';
if ($uid === '') {
    http_response_code(400);
    echo json_encode(['error' => 'uid is required']);
    exit;
}

// 現状はフロントで Firebase を利用するため、補助メッセージのみ
echo json_encode([
    'message' => 'Memos are stored in Firebase Realtime Database (memos/' . $uid . ') from frontend.',
    'uid' => $uid
]);
