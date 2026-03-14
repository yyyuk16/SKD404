<?php
/**
 * プロフィール取得 API（オプション）
 * GET: uid をクエリで受け取り、Firebase Realtime Database からプロフィールを取得する場合に使用。
 * 本アプリではフロントで Firebase SDK を直接利用しているため、このエンドポイントは補助用。
 */
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
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

// Firebase Admin REST または Realtime Database REST で取得する場合はここで実装
// 現在はフロントの Firebase SDK で直接参照しているため、空の実装
echo json_encode(['message' => 'Use Firebase SDK on frontend to read profile', 'uid' => $uid]);
