/**
 * Cloud Sync Service
 *
 * Handles communication with the Flycom sync relay server.
 * Publishes local user state and fetches remote peers/messages on a timer.
 * Designed to survive brief network hiccups and app backgrounding.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';

// ─── Storage Keys & Defaults ──────────────────────────────────────
const STORAGE_KEYS = {
  SERVER: 'flycom:sync_server',
  ROOM: 'flycom:sync_room',
};
const DEFAULT_SERVER = 'http://192.168.1.100:3000';
const POLL_INTERVAL_MS = 4000;
const REQUEST_TIMEOUT_MS = 10000;

// ─── Module State ─────────────────────────────────────────────────
let syncTimer = null;
let userId = null;
let syncCallback = null;
let getPublishPayload = null;
let lastMessageTimestamp = 0;
let appStateListener = null;
let consecutiveErrors = 0;

// ─── Settings Helpers ─────────────────────────────────────────────

export async function getSyncServer() {
  const saved = await AsyncStorage.getItem(STORAGE_KEYS.SERVER);
  return saved || DEFAULT_SERVER;
}

export async function setSyncServer(url) {
  const cleaned = url.trim().replace(/\/+$/, '');
  await AsyncStorage.setItem(STORAGE_KEYS.SERVER, cleaned);
}

export async function getSyncRoom() {
  let room = await AsyncStorage.getItem(STORAGE_KEYS.ROOM);
  if (!room) {
    room = 'flycom-' + Math.random().toString(36).substring(2, 8);
    await AsyncStorage.setItem(STORAGE_KEYS.ROOM, room);
  }
  return room;
}

export async function setSyncRoom(room) {
  await AsyncStorage.setItem(STORAGE_KEYS.ROOM, room.trim());
}

// ─── Low-Level HTTP ───────────────────────────────────────────────

async function request(path, options = {}) {
  const server = await getSyncServer();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${server}${path}`, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!response.ok) return null;
    return await response.json();
  } catch {
    clearTimeout(timer);
    return null;
  }
}

// ─── API Methods ──────────────────────────────────────────────────

async function publishState(data) {
  const room = await getSyncRoom();
  return request('/publish', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ room, userId: data.userId, data }),
  });
}

async function fetchPeers() {
  const room = await getSyncRoom();
  const result = await request(`/peers?room=${encodeURIComponent(room)}`);
  // Use server's clock for "since" to avoid phone clock skew
  if (result?.serverTime) lastMessageTimestamp = result.serverTime;
  return result?.peers || [];
}

async function fetchMessages(since) {
  const room = await getSyncRoom();
  const result = await request(`/messages?room=${encodeURIComponent(room)}&since=${since}`);
  // Update to server's clock so the next fetch uses the right cutoff
  if (result?.serverTime) lastMessageTimestamp = result.serverTime;
  return result?.messages || [];
}

export async function sendCloudMessage(message) {
  const room = await getSyncRoom();
  return request('/message', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ room, message }),
  });
}

export async function testConnection() {
  const result = await request('/health');
  return result?.status === 'ok';
}

// ─── Sync Loop ────────────────────────────────────────────────────

async function tick() {
  if (!syncCallback || !userId) return;

  try {
    // Publish our own state
    if (getPublishPayload) {
      const payload = getPublishPayload();
      if (payload) {
        const ok = await publishState(payload);
        if (!ok) {
          consecutiveErrors++;
          return; // Server unreachable — skip fetch too
        }
      }
    }

    // Fetch peers and messages in parallel
    // Note: lastMessageTimestamp is updated inside fetchMessages/fetchPeers
    // using the server's clock, avoiding phone↔server clock skew
    const savedSince = lastMessageTimestamp;
    const [allPeers, recentMessages] = await Promise.all([
      fetchPeers(),
      fetchMessages(savedSince),
    ]);

    consecutiveErrors = 0;

    // Filter out our own data
    const remotePeers = allPeers.filter(p => p.userId !== userId);
    const remoteMessages = recentMessages.filter(m => m.senderId !== userId);

    // Always call back — even with empty arrays — so the UI can clear stale data
    syncCallback({ peers: remotePeers, messages: remoteMessages });
  } catch (err) {
    consecutiveErrors++;
    console.warn('[Sync] error:', err?.message);
  }
}

// ─── Lifecycle ────────────────────────────────────────────────────

export function setPublishData(fn) {
  getPublishPayload = fn;
}

export function startSync(id, callback) {
  userId = id;
  syncCallback = callback;
  lastMessageTimestamp = 0; // Start from zero; server will set the real value
  consecutiveErrors = 0;

  // Clear any existing timer
  if (syncTimer) clearInterval(syncTimer);
  syncTimer = setInterval(tick, POLL_INTERVAL_MS);
  tick(); // Run immediately

  // Pause/resume when app goes to background/foreground
  if (appStateListener) appStateListener.remove();
  appStateListener = AppState.addEventListener('change', (state) => {
    if (state === 'active' && !syncTimer) {
      syncTimer = setInterval(tick, POLL_INTERVAL_MS);
      tick();
    } else if (state === 'background' && syncTimer) {
      clearInterval(syncTimer);
      syncTimer = null;
    }
  });
}

export function stopSync() {
  if (syncTimer) {
    clearInterval(syncTimer);
    syncTimer = null;
  }
  if (appStateListener) {
    appStateListener.remove();
    appStateListener = null;
  }
  syncCallback = null;
  userId = null;
}

export function restartSync() {
  if (userId && syncCallback) {
    if (syncTimer) clearInterval(syncTimer);
    lastMessageTimestamp = 0;
    consecutiveErrors = 0;
    syncTimer = setInterval(tick, POLL_INTERVAL_MS);
    tick();
  }
}
