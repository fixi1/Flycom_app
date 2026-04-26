import { BleManager } from 'react-native-ble-plx';
import { PermissionsAndroid, Platform } from 'react-native';

let bleManager = null;
let isScanning = false;

function getManager() {
  if (!bleManager) {
    bleManager = new BleManager();
  }
  return bleManager;
}

export async function requestBLEPermissions() {
  if (Platform.OS !== 'android') return true;

  const sdkVersion = Platform.Version;

  if (sdkVersion >= 31) {
    const granted = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
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

export async function startBLEScan(onDeviceFound) {
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
    if (e.message.includes('not authorized')) {
      throw new Error('BLE not authorized. Grant Bluetooth permissions in device Settings.');
    }
    throw e;
  }

  return new Promise((resolve) => {
    const foundDevices = new Map();
    isScanning = true;

    manager.startDeviceScan(
      null,
      { allowDuplicates: false },
      (error, device) => {
        if (error) {
          isScanning = false;
          manager.stopDeviceScan();
          resolve(Array.from(foundDevices.values()));
          return;
        }

        if (!device) return;

        const isFlycom = (device.name && device.name.startsWith('FLY')) ||
          (device.localName && device.localName.startsWith('FLY'));

        if (isFlycom && !foundDevices.has(device.id)) {
          const user = {
            id: device.name || device.id.substring(0, 8),
            name: device.localName || device.name || '',
            deviceId: device.id,
            rssi: device.rssi,
            status: 'available',
          };
          foundDevices.set(device.id, user);
          if (onDeviceFound) onDeviceFound(user);
        }
      }
    );

    setTimeout(() => {
      if (isScanning) {
        stopBLEScan();
      }
      resolve(Array.from(foundDevices.values()));
    }, 10000);
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

export async function connectToDevice(deviceId) {
  const manager = getManager();
  try {
    const device = await manager.connectToDevice(deviceId);
    await device.discoverAllServicesAndCharacteristics();
    return device;
  } catch (err) {
    throw new Error('Failed to connect: ' + err.message);
  }
}

export async function disconnectDevice(deviceId) {
  const manager = getManager();
  try {
    await manager.cancelDeviceConnection(deviceId);
  } catch (err) {
  }
}

export function destroyManager() {
  stopBLEScan();
  if (bleManager) {
    try {
      bleManager.destroy();
    } catch (e) {
    }
    bleManager = null;
  }
}
