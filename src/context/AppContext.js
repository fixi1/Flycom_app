/**
 * AppContext — Global Application State
 *
 * Manages user identity, location, BLE scanning, cloud sync,
 * messages, embassies, and admin state. Provides everything
 * screens need through a single React context.
 */

import {
  createContext, useCallback, useContext,
  useEffect, useMemo, useRef, useState,
} from 'react';
import { Alert, AppState } from 'react-native';
import * as Location from 'expo-location';
import NetInfo from '@react-native-community/netinfo';

import { loadOrCreateUser, updateUsername as persistUsername } from '../services/userService';
import {
  startBLEScan, stopBLEScan, destroyManager,
  startBLEServer, stopBLEServer,
  startListeningForMessages, stopListeningForMessages,
  onMessageReceived, sendBleMessage, broadcastBleMessage,
} from '../services/nearbyService';
import {
  isAdmin as checkAdmin, setAdmin as persistAdmin,
  loadOfficials, loadEmbassies, saveKnownUser,
  addSOSAlert, addMessage, loadMessages, loadSOSAlerts,
} from '../storage';
import { initCrypto, getMyPublicKey, storePeerPublicKey } from '../services/cryptoService';
import { startSync, stopSync, setPublishData, sendCloudMessage } from '../services/cloudSyncService';

// ─── Constants ────────────────────────────────────────────────────
const NEARBY_DISTANCE_KM = 200;
const BLE_SCAN_INTERVAL_MS = 30000;
const DEDUP_MAX_SIZE = 500;

// ─── Helpers ──────────────────────────────────────────────────────

function getDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function mapCloudPeerToUser(peer) {
  return {
    id: peer.userId,
    name: peer.username || peer.userId,
    latitude: peer.latitude,
    longitude: peer.longitude,
    status: (Date.now() - (peer.lastSeen || 0)) < 30000 ? 'available' : 'away',
    source: 'internet',
    lastSeen: peer.lastSeen,
    embassies: peer.embassies || [],
  };
}

// ─── Context ──────────────────────────────────────────────────────

const AppContext = createContext(null);

export function AppProvider({ children }) {

  // ── User & Auth ──
  const [user, setUser] = useState(null);
  const [isLoadingUser, setIsLoadingUser] = useState(true);
  const [admin, setAdminState] = useState(false);

  // ── Location ──
  const [currentLocation, setCurrentLocation] = useState(null);

  // ── BLE Discovery ──
  const [bleUsers, setBleUsers] = useState([]);
  const [isLoadingNearby, setIsLoadingNearby] = useState(false);
  const [nearbyError, setNearbyError] = useState('');

  // ── Cloud Sync ──
  const [cloudPeers, setCloudPeers] = useState([]);
  const [messages, setMessages] = useState([]);
  const [sosAlerts, setSosAlerts] = useState([]);

  // ── Data ──
  const [officials, setOfficials] = useState([]);
  const [embassies, setEmbassies] = useState([]);

  // ── Network ──
  const [hasInternet, setHasInternet] = useState(false);
  const [connectionType, setConnectionType] = useState('Offline');

  // ── Refs (mutable values the sync callback needs) ──
  const hasInternetRef = useRef(false);
  const scanIntervalRef = useRef(null);
  const isScanningRef = useRef(false);
  const userRef = useRef(null);
  const locationRef = useRef(null);
  const embassiesRef = useRef([]);
  const processedMessages = useRef(new Set());

  // ─── Keep refs in sync with state ───────────────────────────────

  useEffect(() => { locationRef.current = currentLocation; }, [currentLocation]);
  useEffect(() => { embassiesRef.current = embassies; }, [embassies]);
  useEffect(() => { if (user) userRef.current = user; }, [user]);

  // ─── Load persisted data ────────────────────────────────────────

  useEffect(() => {
    loadMessages().then(setMessages);
    loadSOSAlerts().then(setSosAlerts);
  }, []);

  // ─── Network monitoring ─────────────────────────────────────────

  useEffect(() => {
    NetInfo.fetch().then(state => {
      const connected = !!(state.isConnected && state.isInternetReachable !== false);
      hasInternetRef.current = connected;
      setHasInternet(connected);
      if (connected) setConnectionType('Internet');
    });

    const unsubscribe = NetInfo.addEventListener(state => {
      const connected = !!(state.isConnected && state.isInternetReachable !== false);
      hasInternetRef.current = connected;
      setHasInternet(connected);
      setConnectionType(prev => connected ? 'Internet' : (prev === 'Internet' ? 'Offline' : prev));
    });

    return () => unsubscribe();
  }, []);

  // ─── Handle incoming BLE message ────────────────────────────────

  function handleIncomingMessage(data, transport, myId) {
    const key = `${data.senderId}-${data.timestamp}-${data.type}`;
    if (processedMessages.current.has(key)) return;
    processedMessages.current.add(key);

    // Prevent the dedup set from growing forever
    if (processedMessages.current.size > DEDUP_MAX_SIZE) {
      const entries = Array.from(processedMessages.current);
      processedMessages.current = new Set(entries.slice(-200));
    }

    if (data.type === 'SOS') {
      addSOSAlert({
        userId: data.senderId,
        username: data.senderName || data.senderId,
        latitude: data.latitude,
        longitude: data.longitude,
        message: `SOS RECEIVED (${transport})`,
      });
      loadSOSAlerts().then(setSosAlerts);
      Alert.alert(
        'SOS ALERT RECEIVED',
        `${data.senderName || data.senderId} needs immediate assistance!\n` +
        `Lat: ${data.latitude?.toFixed(4)}, Lng: ${data.longitude?.toFixed(4)}`,
        [{ text: 'OK' }],
      );
    } else if (data.type === 'CHAT' || data.type === 'BROADCAST') {
      addMessage({
        text: data.text,
        encryptedText: '',
        isEncrypted: false,
        senderId: data.senderId,
        senderName: data.senderName || data.senderId,
        recipientId: data.recipientId || (data.type === 'BROADCAST' ? 'broadcast' : myId),
        channel: data.senderId,
        channelType: 'chat',
        isOfficial: false,
        transport,
      }).then(() => loadMessages().then(setMessages));
      saveKnownUser({ id: data.senderId, username: data.senderName || '' });
    }
  }

  // ─── App initialization ─────────────────────────────────────────

  useEffect(() => {
    let isMounted = true;

    const initialize = async () => {
      try {
        // 1. Load or create the user
        const loadedUser = await loadOrCreateUser();
        if (isMounted) setUser(loadedUser);
        userRef.current = loadedUser;

        // 2. Initialize encryption
        try {
          await initCrypto();
          const pubKey = await getMyPublicKey();
          if (isMounted) setUser(prev => prev ? { ...prev, publicKey: pubKey } : null);
        } catch (err) {
          console.warn('Crypto init failed:', err?.message);
        }

        // 3. Load admin status, officials, embassies
        const [adminStatus, loadedOfficials, loadedEmbassies] = await Promise.all([
          checkAdmin(),
          loadOfficials(),
          loadEmbassies(),
        ]);
        if (isMounted) {
          setAdminState(adminStatus);
          setOfficials(loadedOfficials);
          setEmbassies(loadedEmbassies);
        }

        if (!isMounted || !loadedUser) return;

        // 4. Start BLE server & message listener
        try {
          await startBLEServer(loadedUser.id || 'FLY-UNKNOWN');
          startListeningForMessages();
          onMessageReceived(({ message }) => {
            try {
              const data = JSON.parse(message);
              handleIncomingMessage(data, 'BLE', loadedUser.id);
            } catch {}
          });
        } catch (err) {
          console.warn('BLE server start failed:', err?.message);
        }

        // 5. Configure cloud sync — what we publish each tick
        setPublishData(() => {
          const u = userRef.current;
          const loc = locationRef.current;
          if (!u) return null;
          return {
            userId: u.id,
            username: u.username || u.id,
            latitude: loc?.latitude || null,
            longitude: loc?.longitude || null,
            embassies: embassiesRef.current,
            lastSeen: Date.now(),
          };
        });

        // 6. Start cloud sync — process incoming peers & messages
        startSync(loadedUser.id, async ({ peers, messages: cloudMsgs }) => {
          // Update cloud peers (always, even if empty — clears stale users)
          setCloudPeers(peers.map(mapCloudPeerToUser));

          // Process new messages
          if (cloudMsgs && cloudMsgs.length > 0) {
            for (const msg of cloudMsgs) {
              handleIncomingMessage(msg, 'Internet', loadedUser.id);
            }
          }
        });

      } catch (err) {
        console.error('App init error:', err?.message);
      } finally {
        if (isMounted) setIsLoadingUser(false);
      }
    };

    initialize();
    return () => { isMounted = false; };
  }, []);

  // ─── Merge BLE + Cloud users ────────────────────────────────────

  const allNearbyUsers = useMemo(() => {
    const merged = new Map();

    bleUsers.forEach(u => merged.set(u.id, { ...u, source: u.source || 'ble' }));

    cloudPeers.forEach(p => {
      if (merged.has(p.id)) {
        const existing = merged.get(p.id);
        merged.set(p.id, {
          ...existing,
          ...p,
          source: 'both',
          latitude: p.latitude || existing.latitude,
          longitude: p.longitude || existing.longitude,
        });
      } else {
        merged.set(p.id, p);
      }
    });

    return Array.from(merged.values());
  }, [bleUsers, cloudPeers]);

  // ─── BLE Scanning ──────────────────────────────────────────────

  const runBleScan = useCallback(async () => {
    if (isScanningRef.current) return;
    isScanningRef.current = true;

    try {
      const now = Date.now();

      const devices = await startBLEScan((device) => {
        setBleUsers(prev => {
          const idx = prev.findIndex(d => d.deviceId === device.deviceId);
          if (idx >= 0) {
            const updated = [...prev];
            updated[idx] = { ...updated[idx], ...device, lastSeen: now };
            return updated;
          }
          saveKnownUser({ id: device.id || device.deviceId, username: device.name || '' });
          if (device.publicKey) storePeerPublicKey(device.id, device.publicKey);
          return [...prev, { ...device, lastSeen: now }];
        });
      });

      // Merge scan results and remove stale entries
      setBleUsers(prev => {
        let list = [...prev];
        for (const d of devices) {
          const idx = list.findIndex(m => m.deviceId === d.deviceId);
          if (idx >= 0) {
            list[idx] = { ...list[idx], ...d, lastSeen: now };
          } else {
            list.push({ ...d, lastSeen: now });
            saveKnownUser({ id: d.id || d.deviceId, username: d.name || '' });
          }
        }
        const staleThreshold = now - (BLE_SCAN_INTERVAL_MS * 3);
        return list.filter(u => (u.lastSeen || 0) > staleThreshold);
      });

      // Update connection type indicator
      if (!hasInternetRef.current && devices.length > 0) {
        setConnectionType('BLE Mesh');
      }
    } catch (err) {
      console.warn('BLE scan error:', err?.message);
    } finally {
      isScanningRef.current = false;
    }
  }, []);

  // ─── Location + Initial Scan ────────────────────────────────────

  const loadNearbyUsers = useCallback(async () => {
    setIsLoadingNearby(true);
    setNearbyError('');

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setNearbyError('Location permission denied.');
        setBleUsers([]);
        setIsLoadingNearby(false);
        return;
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const coords = location.coords;
      setCurrentLocation(coords);
      setUser(prev => prev ? { ...prev, latitude: coords.latitude, longitude: coords.longitude } : null);

      if (hasInternetRef.current) setConnectionType('Internet');

      await runBleScan();
    } catch {
      setNearbyError('Could not fetch location.');
      setBleUsers([]);
      setConnectionType('Offline');
    } finally {
      setIsLoadingNearby(false);
    }
  }, [runBleScan]);

  // ─── Periodic BLE scan & cleanup ───────────────────────────────

  useEffect(() => {
    loadNearbyUsers();

    scanIntervalRef.current = setInterval(() => {
      if (AppState.currentState === 'active') runBleScan();
    }, BLE_SCAN_INTERVAL_MS);

    return () => {
      if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
    };
  }, [loadNearbyUsers, runBleScan]);

  // Separate cleanup for sync & BLE server — runs only on unmount
  useEffect(() => {
    return () => {
      stopSync();
      stopBLEServer();
      stopListeningForMessages();
      destroyManager();
    };
  }, []);

  // ─── User Actions ──────────────────────────────────────────────

  const setUsername = useCallback(async (name) => {
    const updated = await persistUsername(name);
    setUser(updated);
    return updated;
  }, []);

  const setAdmin = useCallback(async (value) => {
    await persistAdmin(value);
    setAdminState(value);
  }, []);

  const refreshOfficials = useCallback(async () => setOfficials(await loadOfficials()), []);
  const refreshEmbassies = useCallback(async () => setEmbassies(await loadEmbassies()), []);
  const refreshMessages = useCallback(async () => setMessages(await loadMessages()), []);

  // ─── Nearby Embassies (local + synced from peers) ──────────────

  const nearbyEmbassies = useMemo(() => {
    const all = [...embassies];

    // Merge embassies shared by cloud peers
    for (const peer of cloudPeers) {
      if (!Array.isArray(peer.embassies)) continue;
      for (const emb of peer.embassies) {
        const exists = all.some(e =>
          e.id === emb.id || (e.name === emb.name && e.latitude === emb.latitude),
        );
        if (!exists) all.push({ ...emb, fromPeer: peer.id });
      }
    }

    // Filter by distance if we have location
    if (!currentLocation) return all;
    return all.filter(e => {
      if (!e.latitude || !e.longitude) return true;
      return getDistanceKm(
        currentLocation.latitude, currentLocation.longitude,
        e.latitude, e.longitude,
      ) <= NEARBY_DISTANCE_KM;
    });
  }, [embassies, currentLocation, cloudPeers]);

  // ─── Context Value ─────────────────────────────────────────────

  const value = useMemo(() => ({
    user,
    isLoadingUser,
    setUsername,
    currentLocation,
    nearbyUsers: allNearbyUsers,
    isLoadingNearby,
    nearbyError,
    loadNearbyUsers,
    isOnline: hasInternet,
    hasInternet,
    connectionType,
    admin,
    setAdmin,
    officials,
    refreshOfficials,
    embassies,
    refreshEmbassies,
    nearbyEmbassies,
    messages,
    refreshMessages,
    sendBleMessage,
    broadcastBleMessage,
    sendCloudMessage,
    sosAlerts,
  }), [
    user, isLoadingUser, setUsername, currentLocation, allNearbyUsers,
    isLoadingNearby, nearbyError, loadNearbyUsers, hasInternet,
    connectionType, admin, setAdmin, officials, refreshOfficials,
    embassies, refreshEmbassies, nearbyEmbassies, messages,
    refreshMessages, sosAlerts,
  ]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppContext() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppContext must be used within AppProvider');
  return ctx;
}
