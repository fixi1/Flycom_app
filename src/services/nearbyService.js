import { NativeModules, NativeEventEmitter, Platform, PermissionsAndroid } from 'react-native';
import { BleManager } from 'react-native-ble-plx';

const { FlycomBle } = NativeModules;

const SERVICE_UUID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

let bleManager = null;
let isScanning = false;
let eventListener = null;
let userIdListener = null;
const messageHandlers = [];
const peerUserIds = {};

function getManager() {
  if (!bleManager) {
    bleManager = new BleManager();
  }
  return bleManager;
}

const bleEmitter = FlycomBle ? new NativeEventEmitter(FlycomBle) : null;

export async function requestBLEPermissions() {
  if (Platform.OS !== 'android') return true;

  const sdkVersion = Platform.Version;

  if (sdkVersion >= 31) {
    const granted = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE,
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    ]);
    return (
      granted['android.permission.BLUETOOTH_SCAN'] === PermissionsAndroid.RESULTS.GRANTED &&
      granted['android.permission.BLUETOOTH_CONNECT'] === PermissionsAndroid.RESULTS.GRANTED &&
      granted['android.permission.ACCESS_FINE_LOCATION'] === PermissionsAndroid.RESULTS.GRANTED
    );
  }

  const granted = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
  );
  return granted === PermissionsAndroid.RESULTS.GRANTED;
}

export async function startBLEServer(userId) {
  if (!FlycomBle) {
    console.warn('FlycomBle native module not available');
    return false;
  }

  const hasPermission = await requestBLEPermissions();
  if (!hasPermission) return false;

  try {
    const result = await FlycomBle.startServer(userId);
    return result;
  } catch (e) {
    console.error('Failed to start BLE server:', e);
    return false;
  }
}

export async function stopBLEServer() {
  if (!FlycomBle) return;
  try {
    await FlycomBle.stopServer();
  } catch (e) {}
}

export function startListeningForMessages() {
  if (!bleEmitter) return;

  if (eventListener) eventListener.remove();
  eventListener = bleEmitter.addListener('onBleMessage', (event) => {
    const { senderAddress, message } = event;
    const peerId = peerUserIds[senderAddress] || senderAddress;
    messageHandlers.forEach(handler => {
      try {
        handler({ senderAddress, peerId, message });
      } catch (e) {}
    });
  });

  if (userIdListener) userIdListener.remove();
  userIdListener = bleEmitter.addListener('onPeerUserId', (event) => {
    const { deviceAddress, userId } = event;
    peerUserIds[deviceAddress] = userId;
  });
}

export function stopListeningForMessages() {
  if (eventListener) { eventListener.remove(); eventListener = null; }
  if (userIdListener) { userIdListener.remove(); userIdListener = null; }
}

export function onMessageReceived(handler) {
  messageHandlers.push(handler);
  return () => {
    const idx = messageHandlers.indexOf(handler);
    if (idx >= 0) messageHandlers.splice(idx, 1);
  };
}

function base64Decode(b64) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let result = '';
  let buf = 0, bits = 0;
  for (let i = 0; i < b64.length; i++) {
    const c = b64[i];
    if (c === '=') break;
    const val = chars.indexOf(c);
    if (val === -1) continue;
    buf = (buf << 6) | val;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      result += String.fromCharCode((buf >> bits) & 0xFF);
    }
  }
  return result;
}

function isFlycomDevice(device) {
  const uuids = device.serviceUUIDs;
  if (uuids && Array.isArray(uuids)) {
    for (const u of uuids) {
      if (u && u.toLowerCase() === SERVICE_UUID.toLowerCase()) return true;
    }
  }
  const sd = device.serviceData;
  if (sd) {
    for (const key of Object.keys(sd)) {
      if (key.toLowerCase() === SERVICE_UUID.toLowerCase()) return true;
    }
  }
  return false;
}

export async function startBLEScan(onDeviceFound) {
  if (isScanning) {
    stopBLEScan();
    await new Promise(r => setTimeout(r, 300));
  }

  const hasPermission = await requestBLEPermissions();
  if (!hasPermission) {
    throw new Error('BLE permissions denied. Grant Bluetooth and Location permissions in Settings.');
  }

  const manager = getManager();

  try {
    const state = await manager.state();
    if (state !== 'PoweredOn') {
      throw new Error('Bluetooth is off. Please turn on Bluetooth.');
    }
  } catch (e) {
    if (e.message && e.message.includes('not authorized')) {
      throw new Error('BLE not authorized. Grant Bluetooth permissions in device Settings.');
    }
    throw e;
  }

  return new Promise((resolve) => {
    const foundDevices = new Map();
    let resolved = false;
    isScanning = true;

    const finish = () => {
      if (resolved) return;
      resolved = true;
      if (isScanning) stopBLEScan();
      resolve(Array.from(foundDevices.values()));
    };

    manager.startDeviceScan(
      null,
      { allowDuplicates: false },
      (error, device) => {
        if (error) {
          console.warn('BLE scan error callback:', error.message);
          finish();
          return;
        }

        if (!device) return;
        if (foundDevices.has(device.id)) return;

        if (!isFlycomDevice(device)) return;

        let peerUserId = '';
        const serviceData = device.serviceData;
        if (serviceData) {
          const sdKey = Object.keys(serviceData).find(k => k.toLowerCase() === SERVICE_UUID.toLowerCase());
          if (sdKey && serviceData[sdKey]) {
            try {
              peerUserId = base64Decode(serviceData[sdKey]);
            } catch (e) {}
          }
        }

        const user = {
          id: peerUserId || device.id.substring(0, 8),
          name: device.localName || device.name || peerUserId || '',
          deviceId: device.id,
          deviceAddress: device.id,
          rssi: device.rssi,
          status: 'available',
          lastSeen: Date.now(),
        };
        foundDevices.set(device.id, user);
        if (onDeviceFound) onDeviceFound(user);
      }
    );

    setTimeout(finish, 10000);
  });
}

export function stopBLEScan() {
  isScanning = false;
  if (bleManager) {
    try {
      bleManager.stopDeviceScan();
    } catch (e) {
    }
  }
}

export async function sendBleMessage(deviceAddress, message) {
  if (!FlycomBle) return false;
  try {
    return await FlycomBle.connectAndWrite(deviceAddress, message);
  } catch (e) {
    console.error('Failed to send BLE message:', e);
    return false;
  }
}

export async function broadcastBleMessage(message) {
  if (!FlycomBle) return false;
  try {
    return await FlycomBle.broadcastMessage(message);
  } catch (e) {
    console.error('Failed to broadcast BLE message:', e);
    return false;
  }
}

export function destroyManager() {
  stopBLEScan();
  stopListeningForMessages();
  if (bleManager) {
    try {
      bleManager.destroy();
    } catch (e) {
    }
    bleManager = null;
  }
}
