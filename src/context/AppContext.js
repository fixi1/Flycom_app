import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as Location from 'expo-location';
import NetInfo from '@react-native-community/netinfo';
import { loadOrCreateUser, updateUsername as persistUsername } from '../services/userService';
import { startBLEScan, stopBLEScan, destroyManager } from '../services/nearbyService';
import { isAdmin as checkAdmin, setAdmin as persistAdmin, loadOfficials, loadEmbassies, saveKnownUser } from '../storage';
import { initCrypto, getMyPublicKey, storePeerPublicKey } from '../services/cryptoService';

const NEARBY_DISTANCE_KM = 200;
const INTERNET_DISCOVERY_KM = 100;

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
  const [isOnline, setIsOnline] = useState(false);
  const [hasInternet, setHasInternet] = useState(false);
  const [connectionType, setConnectionType] = useState('BLE');
  const [admin, setAdminState] = useState(false);
  const [officials, setOfficials] = useState([]);
  const [embassies, setEmbassies] = useState([]);

  // Monitor internet connectivity
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      const connected = state.isConnected && state.isInternetReachable;
      setHasInternet(!!connected);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    let isMounted = true;

    const initialize = async () => {
      try {
        // Load user first — this must always succeed
        const loadedUser = await loadOrCreateUser();
        if (isMounted) setUser(loadedUser);

        // Initialize crypto separately — failure shouldn't block user loading
        try {
          await initCrypto();
          const pubKey = await getMyPublicKey();
          if (isMounted) setUser(prev => prev ? { ...prev, publicKey: pubKey } : null);
        } catch (cryptoErr) {
          console.warn('Crypto init failed:', cryptoErr?.message);
        }

        const adminStatus = await checkAdmin();
        if (isMounted) setAdminState(adminStatus);

        const loadedOfficials = await loadOfficials();
        if (isMounted) setOfficials(loadedOfficials);

        const loadedEmbassies = await loadEmbassies();
        if (isMounted) setEmbassies(loadedEmbassies);
      } catch (err) {
        console.error('App init error:', err?.message);
      } finally {
        if (isMounted) setIsLoadingUser(false);
      }
    };

    initialize();
    return () => { isMounted = false; };
  }, []);

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
    const loaded = await loadOfficials();
    setOfficials(loaded);
  }, []);

  const refreshEmbassies = useCallback(async () => {
    const loaded = await loadEmbassies();
    setEmbassies(loaded);
  }, []);

  const nearbyEmbassies = useMemo(() => {
    if (!currentLocation) return [];
    return embassies.filter(e => {
      const dist = getDistanceKm(currentLocation.latitude, currentLocation.longitude, e.latitude, e.longitude);
      return dist <= NEARBY_DISTANCE_KM;
    });
  }, [embassies, currentLocation]);

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

      // Location works - app is functional
      setIsOnline(true);

      if (hasInternet) {
        // INTERNET MODE: Normal messaging app behavior
        // In production, this would query a server for users within INTERNET_DISCOVERY_KM
        // For now, set connection type and proceed with BLE scan as supplement
        setConnectionType('Internet');
      } else {
        setConnectionType('Location');
      }

      try {
        // BLE MESH: Always try BLE scan (works offline, mesh networking)
        const devices = await startBLEScan((device) => {
          setNearbyUsers(prev => {
            if (prev.find(d => d.deviceId === device.deviceId)) return prev;
            // Save discovered user for future search
            saveKnownUser({ id: device.id || device.deviceId, username: device.name || '' });
            // Store their public key if available
            if (device.publicKey) {
              storePeerPublicKey(device.id, device.publicKey);
            }
            return [...prev, device];
          });
        });

        setNearbyUsers(prev => {
          const merged = [...prev];
          for (const d of devices) {
            if (!merged.find(m => m.deviceId === d.deviceId)) {
              merged.push(d);
              saveKnownUser({ id: d.id || d.deviceId, username: d.name || '' });
            }
          }
          return merged;
        });

        // If no internet but BLE works, switch to mesh mode
        if (!hasInternet && devices.length > 0) {
          setConnectionType('BLE Mesh');
        } else if (hasInternet) {
          setConnectionType('Internet');
        } else if (devices.length > 0) {
          setConnectionType('BLE');
        }
      } catch (bleErr) {
        // BLE failed but location still works
        setNearbyError(bleErr.message);
        setNearbyUsers([]);
        if (!hasInternet) {
          setConnectionType('BLE Unavailable');
        }
      }
    } catch (locErr) {
      setNearbyError('Could not fetch location.');
      setNearbyUsers([]);
      setIsOnline(false);
      setConnectionType('Offline');
    } finally {
      setIsLoadingNearby(false);
    }
  }, [hasInternet]);

  useEffect(() => {
    loadNearbyUsers();
    return () => { destroyManager(); };
  }, [loadNearbyUsers]);

  const value = useMemo(
    () => ({
      user,
      isLoadingUser,
      setUsername,
      currentLocation,
      nearbyUsers,
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
    }),
    [user, isLoadingUser, setUsername, currentLocation, nearbyUsers, isLoadingNearby, nearbyError, loadNearbyUsers, isOnline, hasInternet, connectionType, admin, setAdmin, officials, refreshOfficials, embassies, refreshEmbassies, nearbyEmbassies]
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
