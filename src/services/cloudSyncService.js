import AsyncStorage from '@react-native-async-storage/async-storage';

const SYNC_ROOM_KEY = 'flycom:sync_room';
const SYNC_SERVER_KEY = 'flycom:sync_server';
const DEFAULT_SERVER = 'http://192.168.1.100:3000';
const SYNC_INTERVAL = 4000;

let syncTimer = null;
let myUserId = null;
let onSyncData = null;
let lastMessageFetch = 0;
let publishData = null;

export async function getSyncServer() {
  const saved = await AsyncStorage.getItem(SYNC_SERVER_KEY);
  return saved || DEFAULT_SERVER;
}

export async function setSyncServer(url) {
  const cleaned = url.trim().replace(/\/+$/, '');
  await AsyncStorage.setItem(SYNC_SERVER_KEY, cleaned);
}

export async function getSyncRoom() {
  let room = await AsyncStorage.getItem(SYNC_ROOM_KEY);
  if (!room) {
    room = 'flycom-' + Math.random().toString(36).substring(2, 8);
    await AsyncStorage.setItem(SYNC_ROOM_KEY, room);
  }
  return room;
}

export async function setSyncRoom(room) {
  await AsyncStorage.setItem(SYNC_ROOM_KEY, room.trim());
}

async function apiCall(path, options = {}) {
  const server = await getSyncServer();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(`${server}${path}`, { ...options, signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    clearTimeout(timeout);
    return null;
  }
}

export async function publishMyState(userData) {
  const room = await getSyncRoom();
  return apiCall('/publish', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ room, userId: userData.userId, data: userData }),
  });
}

export async function fetchPeers() {
  const room = await getSyncRoom();
  const data = await apiCall(`/peers?room=${encodeURIComponent(room)}`);
  return data?.peers || [];
}

export async function sendCloudMessage(message) {
  const room = await getSyncRoom();
  return apiCall('/message', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ room, message }),
  });
}

export async function fetchNewMessages(since = 0) {
  const room = await getSyncRoom();
  const data = await apiCall(`/messages?room=${encodeURIComponent(room)}&since=${since}`);
  return data?.messages || [];
}

export function setPublishData(dataFn) {
  publishData = dataFn;
}

export function startSync(userId, dataCallback) {
  myUserId = userId;
  onSyncData = dataCallback;
  lastMessageFetch = Date.now() - 60000;
  if (syncTimer) clearInterval(syncTimer);
  syncTimer = setInterval(doSync, SYNC_INTERVAL);
  doSync();
}

export function stopSync() {
  if (syncTimer) { clearInterval(syncTimer); syncTimer = null; }
  onSyncData = null;
}

async function doSync() {
  if (!onSyncData || !myUserId) return;
  try {
    if (publishData) {
      const data = publishData();
      if (data) {
        const pubResult = await publishMyState(data);
        if (!pubResult) console.warn('[CloudSync] publish failed');
      }
    }
    const [peers, messages] = await Promise.all([
      fetchPeers(),
      fetchNewMessages(lastMessageFetch),
    ]);
    lastMessageFetch = Date.now();
    const otherPeers = peers.filter(p => p.userId !== myUserId);
    const otherMessages = messages.filter(m => m.senderId !== myUserId);
    if (otherPeers.length > 0 || otherMessages.length > 0) {
      onSyncData({ peers: otherPeers, messages: otherMessages });
    }
  } catch (e) {
    console.warn('[CloudSync] sync error:', e?.message);
  }
}

export function restartSync() {
  if (myUserId && onSyncData) {
    console.log('[CloudSync] restarting sync...');
    if (syncTimer) clearInterval(syncTimer);
    lastMessageFetch = Date.now() - 60000;
    syncTimer = setInterval(doSync, SYNC_INTERVAL);
    doSync();
  }
}

export async function testConnection() {
  const data = await apiCall('/health');
  return data?.status === 'ok';
}
