<?php
$db = new PDO('mysql:host=localhost;dbname=hexgame;charset=utf8', 'root', '');
$code = $_GET['code'];

$stmt = $db->prepare("SELECT * FROM matches WHERE code = ?");
$stmt->execute([$code]);

if ($match = $stmt->fetch(PDO::FETCH_ASSOC)) {
  echo json_encode(['success' => true, 'match' => $match]);
} else {
  echo json_encode(['success' => false, 'message' => 'Partida não encontrada.']);
}
?>