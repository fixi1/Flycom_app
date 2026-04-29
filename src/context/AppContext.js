import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AppState } from 'react-native';
import * as Location from 'expo-location';
import NetInfo from '@react-native-community/netinfo';
import { loadOrCreateUser, updateUsername as persistUsername } from '../services/userService';
import { startBLEScan, stopBLEScan, destroyManager, startBLEServer, stopBLEServer, startListeningForMessages, stopListeningForMessages, onMessageReceived, sendBleMessage, broadcastBleMessage } from '../services/nearbyService';
import { isAdmin as checkAdmin, setAdmin as persistAdmin, loadOfficials, loadEmbassies, saveKnownUser, addSOSAlert, addMessage, loadMessages, loadSOSAlerts } from '../storage';
import { initCrypto, getMyPublicKey, storePeerPublicKey } from '../services/cryptoService';
import { startSync, stopSync, setPublishData, sendCloudMessage } from '../services/cloudSyncService';

const NEARBY_DISTANCE_KM = 200;
const BLE_SCAN_INTERVAL_MS = 30000;

function getDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoadingUser, setIsLoadingUser] = useState(true);
  const [currentLocation, setCurrentLocation] = useState(null);
  const [nearbyUsers, setNearbyUsers] = useState([]);
  const [isLoadingNearby, setIsLoadingNearby] = useState(false);
  const [nearbyError, setNearbyError] = useState('');
  const [hasInternet, setHasInternet] = useState(false);
  const [connectionType, setConnectionType] = useState('Offline');
  const [admin, setAdminState] = useState(false);
  const [officials, setOfficials] = useState([]);
  const [embassies, setEmbassies] = useState([]);
  const [messages, setMessages] = useState([]);
  const [cloudPeers, setCloudPeers] = useState([]);
  const [sosAlerts, setSosAlerts] = useState([]);
  const hasInternetRef = useRef(false);
  const scanIntervalRef = useRef(null);
  const isScanningRef = useRef(false);
  const userRef = useRef(null);
  const locationRef = useRef(null);
  const embassiesRef = useRef([]);

  useEffect(() => {
    loadMessages().then(setMessages);
  }, []);

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
      if (connected) {
        setConnectionType('Internet');
      } else {
        setConnectionType(prev => prev === 'Internet' ? 'Offline' : prev);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    let isMounted = true;

    const initialize = async () => {
      try {
        const loadedUser = await loadOrCreateUser();
        if (isMounted) setUser(loadedUser);

        try {
          await initCrypto();
          const pubKey = await getMyPublicKey();
          if (isMounted) setUser(prev => prev ? { ...prev, publicKey: pubKey } : null);
        } catch (cryptoErr) {
          console.warn('Crypto init failed:', cryptoErr?.message);
        }

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

        if (isMounted && loadedUser) {
          userRef.current = loadedUser;

          try {
            await startBLEServer(loadedUser.id || 'FLY-UNKNOWN');
            startListeningForMessages();
            onMessageReceived(({ peerId, message }) => {
              try {
                const data = JSON.parse(message);
                if (data.type === 'SOS') {
                  addSOSAlert({
                    userId: data.senderId,
                    username: data.senderName || data.senderId,
                    latitude: data.latitude,
                    longitude: data.longitude,
                    message: 'SOS RECEIVED',
                  });
                  loadSOSAlerts().then(setSosAlerts);
                  Alert.alert(
                    'SOS ALERT RECEIVED',
                    `${data.senderName || data.senderId} needs immediate assistance!\nLat: ${data.latitude?.toFixed(4)}, Lng: ${data.longitude?.toFixed(4)}`,
                    [{ text: 'OK' }]
                  );
                } else if (data.type === 'CHAT' || data.type === 'BROADCAST') {
                  const incomingMsg = {
                    text: data.text,
                    encryptedText: '',
                    isEncrypted: false,
                    senderId: data.senderId,
                    senderName: data.senderName || data.senderId,
                    recipientId: data.type === 'BROADCAST' ? 'broadcast' : loadedUser.id,
                    channel: data.senderId,
                    channelType: 'chat',
                    isOfficial: false,
                    transport: 'mesh',
                  };
                  addMessage(incomingMsg).then(() => {
                    loadMessages().then(setMessages);
                  });
                  saveKnownUser({ id: data.senderId, username: data.senderName || '' });
                }
              } catch (e) {}
            });
          } catch (e) {
            console.warn('BLE server start failed:', e?.message);
          }

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

          const processedMsgKeys = new Set();

          startSync(loadedUser.id, async ({ peers, messages: cloudMsgs }) => {
            if (peers) {
              setCloudPeers(peers.map(p => ({
                id: p.userId,
                name: p.username || p.userId,
                latitude: p.latitude,
                longitude: p.longitude,
                status: (Date.now() - (p.lastSeen || 0)) < 30000 ? 'available' : 'away',
                source: 'internet',
                lastSeen: p.lastSeen,
                embassies: p.embassies || [],
              })));
            }
            if (cloudMsgs && cloudMsgs.length > 0) {
              let hasNew = false;
              for (const cm of cloudMsgs) {
                const msgKey = `${cm.senderId}-${cm.timestamp}-${cm.type}`;
                if (processedMsgKeys.has(msgKey)) continue;
                processedMsgKeys.add(msgKey);

                if (cm.type === 'SOS') {
                  await addSOSAlert({
                    userId: cm.senderId,
                    username: cm.senderName || cm.senderId,
                    latitude: cm.latitude,
                    longitude: cm.longitude,
                    message: 'SOS RECEIVED (Internet)',
                  });
                  loadSOSAlerts().then(setSosAlerts);
                  Alert.alert(
                    'SOS ALERT RECEIVED',
                    `${cm.senderName || cm.senderId} needs immediate assistance!\nLat: ${cm.latitude?.toFixed(4)}, Lng: ${cm.longitude?.toFixed(4)}`,
                    [{ text: 'OK' }]
                  );
                } else if (cm.type === 'CHAT' || cm.type === 'BROADCAST') {
                  await addMessage({
                    text: cm.text,
                    encryptedText: '',
                    isEncrypted: false,
                    senderId: cm.senderId,
                    senderName: cm.senderName || cm.senderId,
                    recipientId: cm.recipientId || 'broadcast',
                    channel: cm.senderId,
                    channelType: 'chat',
                    isOfficial: false,
                    transport: 'internet',
                  });
                  hasNew = true;
                  saveKnownUser({ id: cm.senderId, username: cm.senderName || '' });
                }
              }
              if (hasNew) {
                const updated = await loadMessages();
                setMessages(updated);
              }
            }
          });
        }
      } catch (err) {
        console.error('App init error:', err?.message);
      } finally {
        if (isMounted) setIsLoadingUser(false);
      }
    };

    initialize();
    return () => { isMounted = false; };
  }, []);

  useEffect(() => { locationRef.current = currentLocation; }, [currentLocation]);
  useEffect(() => { embassiesRef.current = embassies; }, [embassies]);
  useEffect(() => { if (user) userRef.current = user; }, [user]);
  useEffect(() => { loadSOSAlerts().then(setSosAlerts); }, []);

  const allNearbyUsers = useMemo(() => {
    const merged = new Map();
    nearbyUsers.forEach(u => merged.set(u.id, { ...u, source: u.source || 'ble' }));
    cloudPeers.forEach(p => {
      if (merged.has(p.id)) {
        const existing = merged.get(p.id);
        merged.set(p.id, { ...existing, ...p, source: 'both', latitude: p.latitude || existing.latitude, longitude: p.longitude || existing.longitude });
      } else {
        merged.set(p.id, p);
      }
    });
    return Array.from(merged.values());
  }, [nearbyUsers, cloudPeers]);

  const runBleScan = useCallback(async () => {
    if (isScanningRef.current) return;
    isScanningRef.current = true;

    try {
      const now = Date.now();
      const freshDeviceIds = new Set();

      const devices = await startBLEScan((device) => {
        freshDeviceIds.add(device.deviceId);
        setNearbyUsers(prev => {
          const existing = prev.findIndex(d => d.deviceId === device.deviceId);
          if (existing >= 0) {
            const updated = [...prev];
            updated[existing] = { ...updated[existing], ...device, lastSeen: now };
            return updated;
          }
          saveKnownUser({ id: device.id || device.deviceId, username: device.name || '' });
          if (device.publicKey) {
            storePeerPublicKey(device.id, device.publicKey);
          }
          return [...prev, { ...device, lastSeen: now }];
        });
      });

      for (const d of devices) {
        freshDeviceIds.add(d.deviceId);
      }

      setNearbyUsers(prev => {
        let merged = [...prev];
        for (const d of devices) {
          const existing = merged.findIndex(m => m.deviceId === d.deviceId);
          if (existing >= 0) {
            merged[existing] = { ...merged[existing], ...d, lastSeen: now };
          } else {
            merged.push({ ...d, lastSeen: now });
            saveKnownUser({ id: d.id || d.deviceId, username: d.name || '' });
          }
        }
        const staleThreshold = now - (BLE_SCAN_INTERVAL_MS * 3);
        merged = merged.filter(u => (u.lastSeen || 0) > staleThreshold);
        return merged;
      });

      if (!hasInternetRef.current && devices.length > 0) {
        setConnectionType('BLE Mesh');
      } else if (!hasInternetRef.current) {
        setConnectionType(prev => prev === 'Internet' ? 'Offline' : prev);
      }
    } catch (bleErr) {
      console.warn('BLE scan error:', bleErr?.message);
    } finally {
      isScanningRef.current = false;
    }
  }, []);

  const loadNearbyUsers = useCallback(async () => {
    setIsLoadingNearby(true);
    setNearbyError('');

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setNearbyError('Location permission denied.');
        setNearbyUsers([]);
        setIsLoadingNearby(false);
        return;
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const coords = location.coords;
      setCurrentLocation(coords);
      setUser(prev => prev ? { ...prev, latitude: coords.latitude, longitude: coords.longitude } : null);

      if (hasInternetRef.current) {
        setConnectionType('Internet');
      }

      await runBleScan();
    } catch (locErr) {
      setNearbyError('Could not fetch location.');
      setNearbyUsers([]);
      setConnectionType('Offline');
    } finally {
      setIsLoadingNearby(false);
    }
  }, [runBleScan]);

  useEffect(() => {
    loadNearbyUsers();

    scanIntervalRef.current = setInterval(() => {
      if (AppState.currentState === 'active') {
        runBleScan();
      }
    }, BLE_SCAN_INTERVAL_MS);

    return () => {
      if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
      stopSync();
      stopBLEServer();
      stopListeningForMessages();
      destroyManager();
    };
  }, [loadNearbyUsers, runBleScan]);

  const setUsername = useCallback(async (nextUsername) => {
    const updatedUser = await persistUsername(nextUsername);
    setUser(updatedUser);
    return updatedUser;
  }, []);

  const setAdmin = useCallback(async (value) => {
    await persistAdmin(value);
    setAdminState(value);
  }, []);

  const refreshOfficials = useCallback(async () => {
    setOfficials(await loadOfficials());
  }, []);

  const refreshEmbassies = useCallback(async () => {
    setEmbassies(await loadEmbassies());
  }, []);

  const refreshMessages = useCallback(async () => {
    setMessages(await loadMessages());
  }, []);

  const nearbyEmbassies = useMemo(() => {
    const allEmb = [...embassies];
    cloudPeers.forEach(p => {
      if (p.embassies && Array.isArray(p.embassies)) {
        p.embassies.forEach(e => {
          if (!allEmb.find(existing => existing.id === e.id || (existing.name === e.name && existing.latitude === e.latitude))) {
            allEmb.push({ ...e, fromPeer: p.id });
          }
        });
      }
    });
    if (!currentLocation) return allEmb;
    return allEmb.filter(e => {
      if (!e.latitude || !e.longitude) return true;
      const dist = getDistanceKm(currentLocation.latitude, currentLocation.longitude, e.latitude, e.longitude);
      return dist <= NEARBY_DISTANCE_KM;
    });
  }, [embassies, currentLocation, cloudPeers]);

  const isOnline = hasInternet;

  const value = useMemo(
    () => ({
      user,
      isLoadingUser,
      setUsername,
      currentLocation,
      nearbyUsers: allNearbyUsers,
      isLoadingNearby,
      nearbyError,
      loadNearbyUsers,
      isOnline,
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
    }),
    [user, isLoadingUser, setUsername, currentLocation, allNearbyUsers, isLoadingNearby, nearbyError, loadNearbyUsers, isOnline, hasInternet, connectionType, admin, setAdmin, officials, refreshOfficials, embassies, refreshEmbassies, nearbyEmbassies, messages, refreshMessages, sosAlerts]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppContext() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppContext must be used within AppProvider');
  }
  return context;
}
