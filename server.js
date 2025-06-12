// server.js — HEX Multiplayer WebSocket Server
const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 8080 });

console.log('🟢 Servidor HEX WebSocket rodando na porta 8080');

const matches = new Map(); // código => { state, clients }
const clients = new Map(); // ws => código

wss.on('connection', (ws) => {
  console.log('🔗 Novo jogador conectado.');

  ws.on('message', (data) => {
    let msg;
    try {
      msg = JSON.parse(data);
    } catch (err) {
      console.error('❌ JSON inválido:', err);
      return;
    }

    const code = msg.code?.toUpperCase();
    if (!code) return;

    // Cria sala se ainda não existir
    if (!matches.has(code)) {
      matches.set(code, {
        state: {
          status: 'waiting',
          maxPlayers: msg.maxPlayers || 2,
          players: [],
          ready: [],
          nicknames: {},
          tiles: [],
          bases: [],
          pawns: [],
          scores: [],
          turn: 0
        },
        clients: []
      });
    }

    const room = matches.get(code);

    if (msg.type === 'join') {
      const playerId = parseInt(msg.playerId);
      const nickname = msg.nickname || `Jogador ${playerId}`;

      // Impede duplicação de ID
      if (room.state.players.includes(playerId)) {
        ws.send(JSON.stringify({
          type: 'error',
          message: `O jogador ${playerId} já está conectado.`
        }));
        return;
      }

      room.state.players.push(playerId);
      room.state.nicknames[playerId] = nickname;
      room.state.scores[playerId] = 0;
      room.clients.push(ws);
      clients.set(ws, code);

      // Envia status do lobby para todos
      room.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({
            type: 'lobby',
            players: room.state.players,
            ready: room.state.ready,
            nicknames: room.state.nicknames,
            maxPlayers: room.state.maxPlayers
          }));
        }
      });
    }

    // Jogador ficou pronto
    if (msg.type === 'ready') {
      const playerId = parseInt(msg.playerId);
      if (!room.state.ready.includes(playerId)) {
        room.state.ready.push(playerId);
      }

      room.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({
            type: 'ready_update',
            ready: room.state.ready,
            players: room.state.players,
            nicknames: room.state.nicknames
          }));
        }
      });

      // Iniciar se todos estiverem prontos
      if (
        room.state.ready.length === room.state.players.length &&
        room.state.players.length === room.state.maxPlayers
      ) {
        console.log(`🚀 Iniciando partida ${code}`);
        startMatch(room);
      }
    }

    // Atualização do estado do jogo
    if (msg.type === 'update') {
      room.state = msg.state;
      room.clients.forEach(client => {
        if (client !== ws && client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({
            type: 'state',
            state: room.state
          }));
        }
      });
    }

    // Chat
    if (msg.type === 'chat') {
      room.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({
            type: 'chat',
            from: msg.playerId,
            text: msg.text
          }));
        }
      });
    }
  });

  ws.on('close', () => {
    const code = clients.get(ws);
    const room = matches.get(code);
    if (!room) return;

    room.clients = room.clients.filter(c => c !== ws);
    if (room.clients.length === 0) {
      matches.delete(code);
      console.log(`🗑️ Sala ${code} encerrada`);
    }

    clients.delete(ws);
  });
});

// Função que inicia a partida quando todos estão prontos
function startMatch(room) {
  const radius = 4;
  const tiles = [];
  const baseCandidates = [];

  // Geração do tabuleiro hexagonal
  for (let q = -radius; q <= radius; q++) {
    for (let r = Math.max(-radius, -q - radius); r <= Math.min(radius, -q + radius); r++) {
      const s = -q - r;
      let type = 'neutro';

      if (q === 0 && r === 0) {
        type = 'center';
      } else if (Math.abs(q) === radius || Math.abs(r) === radius || Math.abs(s) === radius) {
        type = 'base';
        baseCandidates.push({ q, r });
      } else {
        const angle = (Math.atan2(r, q) * 180 / Math.PI + 360) % 360;
        type = getHexSector(angle);
      }

      tiles.push({ q, r, type });
    }
  }

  // Distribuir as bases
  const numPlayers = room.state.players.length;
  const basesPerPlayer = numPlayers === 2 ? 3 : numPlayers === 3 ? 2 : 1;
  const spacing = Math.floor(baseCandidates.length / (numPlayers * basesPerPlayer));
  const bases = [];
  let index = 0;

  for (let p = 0; p < numPlayers; p++) {
    for (let i = 0; i < basesPerPlayer; i++) {
      const pos = baseCandidates[(index + i * spacing) % baseCandidates.length];
      bases.push({ ...pos, owner: p });
    }
    index += spacing;
  }

  // Finalizar gameState
  room.state.tiles = tiles;
  room.state.bases = bases;
  room.state.pawns = [];
  room.state.turn = 0;
  room.state.status = 'playing';

  // Enviar o estado inicial para todos
  room.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({
        type: 'start',
        state: room.state
      }));
    }
  });
}

// Utilitário para classificar os hexágonos por setor de cor
function getHexSector(angle) {
  if (angle < 60) return 'laranja';
  if (angle < 120) return 'amarelo';
  if (angle < 180) return 'verde';
  if (angle < 240) return 'azul';
  if (angle < 300) return 'roxo';
  return 'vermelho';
}
