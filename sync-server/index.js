const http = require('http');
const url = require('url');

const rooms = {};
const MAX_AGE = 300000; // 5 minutes
const MAX_MESSAGES = 200;

function getRoom(name) {
  if (!rooms[name]) rooms[name] = { peers: {}, messages: [] };
  return rooms[name];
}

function cleanRoom(room) {
  const now = Date.now();
  for (const uid of Object.keys(room.peers)) {
    if (now - room.peers[uid].lastSeen > MAX_AGE) delete room.peers[uid];
  }
  if (room.messages.length > MAX_MESSAGES) {
    room.messages = room.messages.slice(-MAX_MESSAGES);
  }
}

function parseBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try { resolve(JSON.parse(body)); } catch { resolve({}); }
    });
  });
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function json(res, data, status = 200) {
  cors(res);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

const server = http.createServer(async (req, res) => {
  cors(res);
  console.log(`${new Date().toLocaleTimeString()} ${req.method} ${req.url} from ${req.socket.remoteAddress}`);
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const parsed = url.parse(req.url, true);
  const path = parsed.pathname;

  if (path === '/publish' && req.method === 'POST') {
    const body = await parseBody(req);
    if (!body.room || !body.userId) return json(res, { error: 'missing room/userId' }, 400);
    const room = getRoom(body.room);
    room.peers[body.userId] = { ...body.data, lastSeen: Date.now() };
    cleanRoom(room);
    return json(res, { ok: true, peerCount: Object.keys(room.peers).length });
  }

  if (path === '/message' && req.method === 'POST') {
    const body = await parseBody(req);
    if (!body.room || !body.message) return json(res, { error: 'missing room/message' }, 400);
    const room = getRoom(body.room);
    const ts = Date.now();
    room.messages.push({ ...body.message, serverTimestamp: ts });
    cleanRoom(room);
    console.log(`  [msg stored] room=${body.room} type=${body.message.type} from=${body.message.senderId} ts=${ts}`);
    return json(res, { ok: true, serverTimestamp: ts });
  }

  if (path === '/messages' && req.method === 'GET') {
    const roomName = parsed.query.room;
    const since = parseInt(parsed.query.since) || 0;
    if (!roomName) return json(res, { messages: [], serverTime: Date.now() });
    const room = getRoom(roomName);
    const filtered = room.messages.filter(m => (m.serverTimestamp || 0) > since);
    return json(res, { messages: filtered, serverTime: Date.now() });
  }

  if (path === '/peers' && req.method === 'GET') {
    const roomName = parsed.query.room;
    if (!roomName) return json(res, { peers: [], serverTime: Date.now() });
    const room = getRoom(roomName);
    cleanRoom(room);
    return json(res, { peers: Object.values(room.peers), serverTime: Date.now() });
  }

  if (path === '/' || path === '/health') {
    return json(res, { status: 'ok', rooms: Object.keys(rooms).length });
  }

  json(res, { error: 'not found' }, 404);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Flycom sync server running on port ${PORT}`);
  const os = require('os');
  const nets = os.networkInterfaces();
  Object.keys(nets).forEach(name => {
    nets[name].forEach(n => {
      if (n.family === 'IPv4' && !n.internal) {
        console.log(`  -> http://${n.address}:${PORT}  (${name})`);
      }
    });
  });
});
