<?php
$db = new PDO('mysql:host=localhost;dbname=hexgame;charset=utf8', 'root', '');

function generateCode($length = 6) {
  return strtoupper(substr(md5(uniqid(rand(), true)), 0, $length));
}

$maxPlayers = $_GET['players'] ?? 2;
$code = generateCode();

$initialState = json_encode([
  'status' => 'waiting',
  'maxPlayers' => intval($maxPlayers),
  'players' => [],
  'ready' => [],
  'nicknames' => [],
  'tiles' => [],
  'pawns' => [],
  'scores' => [],
  'bases' => [],
  'turn' => 0
]);

$stmt = $db->prepare("INSERT INTO matches (code, state, turn) VALUES (?, ?, 0)");
$stmt->execute([$code, $initialState]);

echo json_encode(['success' => true, 'code' => $code]);
?>