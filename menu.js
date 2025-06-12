async function createMatch() {
  const players = document.getElementById('playerCount').value;
  const nickname = document.getElementById('nicknameInput').value.trim();
  const playerIndex = document.getElementById('playerIndexSelect').value;

  if (!nickname) return alert("Digite seu nome!");

  const res = await fetch(`/backend/create_match.php?players=${players}`);
  const data = await res.json();
  if (data.success) {
    localStorage.setItem('matchCode', data.code);
    localStorage.setItem('playerIndex', playerIndex);
    localStorage.setItem('nickname', nickname);
    window.location.href = `game.html?code=${data.code}`;
  }
}

async function joinMatch() {
  const code = document.getElementById('joinCode').value.trim().toUpperCase();
  const playerIndex = document.getElementById('playerIndexSelect').value;
  const nickname = document.getElementById('nicknameInput').value.trim();
  const feedback = document.getElementById('feedback');

  if (!nickname) return alert("Digite seu nome!");
  if (code.length !== 6) return feedback.textContent = "Código inválido.";

  const res = await fetch(`/backend/join_match.php?code=${code}`);
  const data = await res.json();
  if (data.success) {
    localStorage.setItem('matchCode', code);
    localStorage.setItem('playerIndex', playerIndex);
    localStorage.setItem('nickname', nickname);
    feedback.textContent = `Entrando na partida...`;
    setTimeout(() => window.location.href = `game.html?code=${code}`, 1000);
  } else {
    feedback.textContent = 'Partida não encontrada.';
  }
}
