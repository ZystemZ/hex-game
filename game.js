const matchCode = new URLSearchParams(window.location.search).get('code');
const playerIndex = parseInt(localStorage.getItem('playerIndex'));
const nickname = localStorage.getItem('nickname');

const gameStatus = document.getElementById('gameStatus');
const boardEl = document.getElementById('board');
const rollBtn = document.getElementById('rollBtn');
const newPawnBtn = document.getElementById('newPawnBtn');
const readyBtn = document.getElementById('readyBtn');
const resultText = document.getElementById('resultText');

const chatInput = document.getElementById('chatInput');
const sendChat = document.getElementById('sendChat');
const chatLog = document.getElementById('chatLog');

let gameState = null;
let myTurn = false;
let selectedPawn = null;
let currentRoll = 0;
let nicknames = {};

const socket = new WebSocket("ws://localhost:8080");

socket.addEventListener('open', () => {
  socket.send(JSON.stringify({
    type: 'join',
    code: matchCode,
    playerId: playerIndex,
    nickname: nickname
  }));
});

socket.addEventListener('message', (event) => {
  const msg = JSON.parse(event.data);

  if (msg.type === 'error') {
    alert(msg.message);
    location.href = '/index.html';
    return;
  }

  if (msg.type === 'lobby') {
    nicknames = msg.nicknames || {};
    gameStatus.innerHTML = `Aguardando jogadores (${msg.players.length}/${msg.maxPlayers})`;
    renderLobby(msg.players, msg.ready || []);
  }

  if (msg.type === 'ready_update') {
    renderLobby(msg.players, msg.ready);
  }

  if (msg.type === 'start') {
    gameState = msg.state;
    renderBoard(gameState.tiles);
    updateScores();
    updateTurnInfo(gameState.turn);
  }

  if (msg.type === 'state') {
    gameState = msg.state;
    renderBoard(gameState.tiles);
    updateScores();
    updateTurnInfo(gameState.turn);
  }

  if (msg.type === 'chat') {
    const div = document.createElement('div');
    const name = nicknames[msg.from] || `Jogador ${msg.from}`;
    div.innerHTML = `<strong>${name}:</strong> ${msg.text}`;
    chatLog.appendChild(div);
    chatLog.scrollTop = chatLog.scrollHeight;
  }
});

sendChat.addEventListener('click', () => {
  const text = chatInput.value.trim();
  if (!text) return;
  socket.send(JSON.stringify({
    type: 'chat',
    playerId: playerIndex,
    text
  }));
  chatInput.value = '';
});

readyBtn.addEventListener('click', () => {
  socket.send(JSON.stringify({
    type: 'ready',
    playerId: playerIndex
  }));
  readyBtn.disabled = true;
  readyBtn.textContent = 'Aguardando os outros...';
});

function updateTurnInfo(currentTurn) {
  myTurn = (currentTurn === playerIndex);
  const turnInfo = document.getElementById('turnInfo');
  const name = nicknames?.[currentTurn] || `Jogador ${currentTurn}`;
  turnInfo.textContent = myTurn ? '🎯 É seu turno!' : `⏳ Turno de ${name}`;
  rollBtn.disabled = !myTurn;
  newPawnBtn.disabled = !myTurn || getMyPawns().length >= 6;
}

function renderLobby(players, readyList = []) {
  const listDiv = document.getElementById('playerList');
  listDiv.innerHTML = '';
  players.forEach(p => {
    const name = nicknames[p] || `Jogador ${p}`;
    const div = document.createElement('div');
    div.style.borderLeft = `6px solid ${getPlayerColor(p)}`;
    div.innerHTML = `
      <span><strong>${name}</strong></span>
      <span class="${readyList.includes(p) ? 'player-status-ready' : 'player-status-waiting'}">
        ${readyList.includes(p) ? 'Pronto' : 'Esperando...'}
      </span>
    `;
    listDiv.appendChild(div);
  });
}

function getPlayerColor(index) {
  const colors = ['deepskyblue', 'magenta', 'gold', 'limegreen', 'orange', 'mediumpurple'];
  return colors[index % colors.length];
}

function renderBoard(tiles) {
  boardEl.innerHTML = '';
  tiles.forEach(tile => {
    const div = document.createElement('div');
    div.className = 'hex';
    div.dataset.q = tile.q;
    div.dataset.r = tile.r;
    div.dataset.type = tile.type;

    if (tile.type === 'base') {
      const base = gameState.bases?.find(b => b.q === tile.q && b.r === tile.r);
      if (base) {
        div.style.outline = `3px dashed ${getPlayerColor(base.owner)}`;
        div.title = `Base de ${nicknames[base.owner] || 'Jogador ' + base.owner}`;
      }
    }

    const pawn = gameState.pawns?.find(p => p.q === tile.q && p.r === tile.r);
    if (pawn) {
      const pawnEl = document.createElement('div');
      pawnEl.className = 'pawn';
      pawnEl.style.backgroundColor = getPlayerColor(pawn.player);
      pawnEl.textContent = pawn.value;
      div.appendChild(pawnEl);

      if (pawn.player === playerIndex && myTurn) {
        div.addEventListener('click', () => selectPawn(pawn));
      }
    }

    boardEl.appendChild(div);
  });
}

function getMyPawns() {
  return gameState.pawns?.filter(p => p.player === playerIndex) || [];
}

function selectPawn(pawn) {
  if (!myTurn) return;
  selectedPawn = pawn;
  resultText.textContent = `Peão selecionado (${pawn.value}). Agora clique para rolar.`;
}

rollBtn.addEventListener('click', () => {
  if (!selectedPawn) return alert("Selecione um peão antes de rolar.");

  currentRoll = Math.floor(Math.random() * 6) + 1;
  resultText.textContent = `🎲 Você rolou: ${currentRoll}. Escolha uma casa para mover.`;
  highlightMoveOptions(selectedPawn, currentRoll);
});

function highlightMoveOptions(pawn, distance) {
  const valid = gameState.tiles.filter(t => {
    const dq = Math.abs(t.q - pawn.q);
    const dr = Math.abs(t.r - pawn.r);
    const ds = Math.abs(-t.q - t.r + pawn.q + pawn.r);
    return (dq + dr + ds) / 2 === distance;
  });

  valid.forEach(tile => {
    const el = document.querySelector(`.hex[data-q="${tile.q}"][data-r="${tile.r}"]`);
    if (el) {
      el.classList.add('highlight');
      el.addEventListener('click', () => movePawnTo(tile.q, tile.r), { once: true });
    }
  });
}

function movePawnTo(q, r) {
  const occupying = gameState.pawns.find(p => p.q === q && p.r === r);

  if (occupying) {
    if (occupying.player === playerIndex) return alert("Você não pode comer seu próprio peão.");

    if (currentRoll > occupying.value) {
      gameState.pawns = gameState.pawns.filter(p => p !== occupying);
      gameState.scores[playerIndex] += 1;
    } else if (currentRoll === occupying.value) {
      gameState.pawns = gameState.pawns.filter(p => p !== occupying && p !== selectedPawn);
      gameState.scores[playerIndex] += 1;
      gameState.scores[occupying.player] += 1;
      finalizeTurn();
      return;
    } else {
      alert("Peão inimigo mais forte. Movimento cancelado.");
      return;
    }
  }

  selectedPawn.q = q;
  selectedPawn.r = r;
  selectedPawn.value = currentRoll;

  finalizeTurn();
}

newPawnBtn.addEventListener('click', () => {
  if (getMyPawns().length >= 6) {
    alert("Você já tem 6 peões em campo.");
    return;
  }

  selectedPawn = null;
  currentRoll = Math.floor(Math.random() * 6) + 1;
  resultText.textContent = `Novo peão: rolou ${currentRoll}. Escolha uma base.`;
  highlightEntryOptions();
});

function highlightEntryOptions() {
  const center = gameState.tiles.find(t => t.type === 'center');
  const elCenter = document.querySelector(`.hex[data-q="${center.q}"][data-r="${center.r}"]`);
  if (currentRoll === 4 && elCenter) {
    elCenter.classList.add('highlight');
    elCenter.addEventListener('click', () => placeNewPawn(center.q, center.r), { once: true });
  }

  gameState.bases
    .filter(b => b.owner === playerIndex)
    .forEach(base => {
      const el = document.querySelector(`.hex[data-q="${base.q}"][data-r="${base.r}"]`);
      if (el) {
        el.classList.add('highlight');
        el.addEventListener('click', () => placeNewPawn(base.q, base.r), { once: true });
      }
    });
}

function placeNewPawn(q, r) {
  const occupying = gameState.pawns.find(p => p.q === q && p.r === r);

  if (occupying) {
    if (q === 0 && r === 0 && currentRoll === 4) {
      gameState.pawns = gameState.pawns.filter(p => p !== occupying);
      gameState.scores[playerIndex] += 1;
    } else {
      if (currentRoll > occupying.value) {
        gameState.pawns = gameState.pawns.filter(p => p !== occupying);
        gameState.scores[playerIndex] += 1;
      } else if (currentRoll === occupying.value) {
        gameState.pawns = gameState.pawns.filter(p => p !== occupying);
        gameState.scores[playerIndex] += 1;
        gameState.scores[occupying.player] += 1;
        finalizeTurn();
        return;
      } else {
        alert("O peão inimigo é mais forte.");
        return;
      }
    }
  }

  gameState.pawns.push({
    id: Date.now(),
    player: playerIndex,
    q, r,
    value: currentRoll
  });

  finalizeTurn();
}

function updateScores() {
  const board = document.getElementById('scoreBoard');
  board.innerHTML = gameState.players.map(p =>
    `<span style="color:${getPlayerColor(p)}">${nicknames[p] || 'Jogador ' + p}: ${gameState.scores[p]}</span>`
  ).join(" | ");
}

function finalizeTurn() {
  currentRoll = 0;
  selectedPawn = null;

  const myPawns = gameState.pawns.filter(p => p.player === playerIndex);
  const enemies = gameState.pawns.filter(p => p.player !== playerIndex);

  if (enemies.length === 0) {
    alert("🎉 Você venceu!");
  } else if (myPawns.length === 0) {
    alert("💀 Você perdeu!");
  }

  gameState.turn = (gameState.turn + 1) % gameState.players.length;
  socket.send(JSON.stringify({
    type: 'update',
    state: gameState
  }));
}
