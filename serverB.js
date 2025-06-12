// server.js — Servidor WebSocket do HEX Multiplayer
const WebSocket = require('ws');

const wss = new WebSocket.Server({ port: 8080 });
console.log('🟢 HEX WebSocket Server rodando na porta 8080');

const matches = new Map(); // Código da partida → { state, clients }
const clients = new Map(); // WebSocket → código da partida

// Utilitário: calcula setor do hexágono com base no ângulo
function getHexSector(angle) {
  if (angle < 60) return 'laranja';
  if (angle < 120) return 'amarelo';
  if (angle < 180) return 'verde';
  if (angle < 240) return 'azul';
  if (angle < 300) return 'roxo';
  return 'vermelho';
}

// Evento de nova conexão
wss.on('connection', (ws) => {
  console.log('🔗 Novo cliente conectado');

  ws.on('message', (data) => {
    let msg;

    try {
      msg = JSON.parse(data);
    } catch (e) {
      console.warn('❌ Mensagem inválida:', e);
      return;
    }

    const code = msg.code?.toUpperCase();
    if (!code) return;

    // Preparar match/sala se ainda não existir
    if (!matches.has(code)) {
      matches.set(code, {
        state: {
          players: [],
          ready: [],
          nicknames: {},
          status: 'waiting',
          maxPlayers: msg.maxPlayers || 2
        },
        clients: []
      });
    }

    const room = matches.get(code);

    // Join de jogador
    if (msg.type === 'join') {
      const playerId = parseInt(msg.playerId);
      const nickname = msg.nickname || `Jogador ${playerId}`;

      if (room.state.players.includes(playerId)) {
        ws.send(JSON.stringify({
          type: 'error',
          message: `❗ O jogador ${playerId} já está conectado nessa partida.`
        }));
        return;
      }

      room.state.players.push(playerId);
      room.state.nicknames[playerId] = nickname;
      room.state.scores = room.state.players.map(() => 0);
      clients.set(ws, code);
      room.clients.push(ws);

      // Envia estado do lobby para todos
      room.clients.forEach(c => {
        if (c.readyState === WebSocket.OPEN) {
          c.send(JSON.stringify({
            type: 'lobby',
            players: room.state.players,
            ready: room.state.ready,
            nicknames: room.state.nicknames,
            maxPlayers: room.state.maxPlayers
          }));
        }
      });
    }

    // Jogador clicou "pronto"
    if (msg.type === 'ready') {
      const playerId = parseInt(msg.playerId);
      if (!room.state.ready.includes(playerId)) {
        room.state.ready.push(playerId);
      }

      // Envia atualização de prontos
      room.clients.forEach(c => {
        if (c.readyState === WebSocket.OPEN) {
          c.send(JSON.stringify({
            type: 'ready_update',
            ready: room.state.ready,
            players: room.state.players,
            nicknames: room.state.nicknames
          }));
        }
      });

      // Inicia o jogo se todos estiverem prontos
      if (
        room.state.ready.length === room.state.players.length &&
        room.state.players.length === room.state.maxPlayers
      ) {
        console.log(`🚀 Partida ${code} iniciada`);
        startMatch(room);
      }
    }

    // Receber atualização do estado do jogo
    if (msg.type === 'update') {
      room.state = msg.state;
      // Broadcast do novo estado
      room.clients.forEach(c => {
        if (c !== ws && c.readyState === WebSocket.OPEN) {
          c.send(JSON.stringify({
            type: 'state',
            state: room.state
          }));
        }
      });
    }

    // Chat
    if (msg.type === 'chat') {
      room.clients.forEach(c => {
        if (c.readyState === WebSocket.OPEN) {
          c.send(JSON.stringify({
            type: 'chat',
            from: msg.playerId,
            text: msg.text
          }));
        }
      });
    }
  });

  // Conexão encerrada
  ws.on('close', () => {
    const code = clients.get(ws);
    const room = matches.get(code);
    if (!room) return;

    room.clients = room.clients.filter(c => c !== ws);
    if (room.clients.length === 0) {
      matches.delete(code);
      console.log(`🗑️ Partida ${code} encerrada por inatividade`);
    }

    clients.delete(ws);
  });
});

// Função que gera o tabuleiro e inicia a partida
function startMatch(room) {
  const radius = 4;
  const tiles = [];
  const baseCandidates = [];

  // Gera todos os hexágonos do tabuleiro
  for (let q = -radius; q <= radius; q++) {
    for (let r = Math.max(-radius, -q - radius); r <= Math.min(radius, -q + radius); r++) {
      const s = -q - r;
      let type = 'neutro';

      if (q === 0 && r === 0) type = 'center';
      else if (Math.abs(q) === radius || Math.abs(r) === radius || Math.abs(s) === radius) {
        type = 'base';
        baseCandidates.push({ q, r });
      } else {
        const angle = (Math.atan2(r, q) * 180 / Math.PI + 360) % 360;
        type = getHexSector(angle);
      }

      tiles.push({ q, r, type });
    }
  }

  // Distribuir bases entre os jogadores
  const numPlayers = room.state.players.length;
  const bases = [];
  const basesPerPlayer = numPlayers === 2 ? 3 : numPlayers === 3 ? 2 : 1;
  const spacing = Math.floor(baseCandidates.length / (numPlayers * basesPerPlayer));
  let index = 0;

  for (let p = 0; p < numPlayers; p++) {
    for (let i = 0; i < basesPerPlayer; i++) {
      const pos = baseCandidates[(index + i * spacing) % baseCandidates.length];
      bases.push({ ...pos, owner: p });
    }
    index += spacing;
  }

  // Atualiza gameState
  room.state.tiles = tiles;
  room.state.bases = bases;
  room.state.pawns = [];
  room.state.turn = 0;
  room.state.status = 'playing';

  // Envia estado inicial da partida
  room.clients.forEach(c => {
    if (c.readyState === WebSocket.OPEN) {
      c.send(JSON.stringify({
        type: 'start',
        state: room.state
      }));
    }
  });
}
