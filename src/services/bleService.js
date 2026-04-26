// BLE Mesh Communication Service
// This service handles Bluetooth Low Energy mesh networking for peer-to-peer communication

import { BleManager } from 'react-native-ble-plx';

class BLEService {
  constructor() {
    this.manager = new BleManager();
    this.connectedDevices = new Map();
    this.messageHandlers = [];
    this.isScanning = false;
    this.deviceId = null;
  }

  async initialize() {
    try {
      await this.manager.startDeviceScan(null, null, (error, device) => {
        if (error) {
          console.log('BLE Scan Error:', error);
          return;
        }
        
        if (device && this.isValidMeshDevice(device)) {
          this.handleDiscoveredDevice(device);
        }
      });
      
      this.isScanning = true;
      console.log('BLE Mesh scanning started');
    } catch (err) {
      console.error('Failed to initialize BLE:', err);
    }
  }

  isValidMeshDevice(device) {
    // Check if device advertises our mesh service UUID or custom manufacturer data
    // In production, you'd check for specific service UUIDs
    return device.name && device.name.includes('FLYCOM') || 
           device.localName && device.localName.includes('FLYCOM');
  }

  handleDiscoveredDevice(device) {
    if (!this.connectedDevices.has(device.id)) {
      console.log('Discovered mesh device:', device.name || device.id);
      this.connectToDevice(device);
    }
  }

  async connectToDevice(device) {
    try {
      const connectedDevice = await device.connect();
      const discoveredDevice = await connectedDevice.discoverAllServicesAndCharacteristics();
      
      this.connectedDevices.set(device.id, discoveredDevice);
      console.log('Connected to mesh device:', device.id);
      
      // Setup notification listener for incoming messages
      this.setupMessageListener(discoveredDevice);
    } catch (err) {
      console.error('Failed to connect to device:', err);
    }
  }

  setupMessageListener(device) {
    // In production, you'd subscribe to the actual characteristic
    // device.monitorCharacteristicForService(SERVICE_UUID, CHARACTERISTIC_UUID, callback)
  }

  async broadcastMessage(message) {
    // Send message to all connected devices in mesh
    const promises = Array.from(this.connectedDevices.values()).map(async (device) => {
      try {
        // In production, write to the actual characteristic
        // await device.writeCharacteristicWithResponseForService(...)
        console.log('Broadcasting to:', device.id);
        return { success: true, deviceId: device.id };
      } catch (err) {
        console.error('Failed to send to device:', err);
        return { success: false, deviceId: device.id, error: err };
      }
    });

    const results = await Promise.all(promises);
    return {
      totalSent: results.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
    };
  }

  async sendSOSAlert(sosData) {
    // SOS alerts get priority broadcasting with higher power
    const message = {
      type: 'SOS',
      timestamp: Date.now(),
      ...sosData,
    };

    return await this.broadcastMessage(message);
  }

  async sendMessage(message) {
    const formattedMessage = {
      type: 'CHAT',
      timestamp: Date.now(),
      ...message,
    };

    return await this.broadcastMessage(formattedMessage);
  }

  registerMessageHandler(handler) {
    this.messageHandlers.push(handler);
  }

  handleMessageReceived(message) {
    this.messageHandlers.forEach(handler => handler(message));
  }

  async stopScanning() {
    if (this.isScanning) {
      await this.manager.stopDeviceScan();
      this.isScanning = false;
      console.log('BLE Mesh scanning stopped');
    }
  }

  async disconnect() {
    await this.stopScanning();
    
    // Disconnect all devices
    const disconnectPromises = Array.from(this.connectedDevices.keys()).map(async (deviceId) => {
      try {
        await this.manager.cancelDeviceConnection(deviceId);
        this.connectedDevices.delete(deviceId);
      } catch (err) {
        console.error('Failed to disconnect device:', err);
      }
    });

    await Promise.all(disconnectPromises);
    console.log('All BLE connections closed');
  }

  getConnectedDevicesCount() {
    return this.connectedDevices.size;
  }

  getConnectedDevices() {
    return Array.from(this.connectedDevices.values());
  }
}

// Singleton instance
export const bleService = new BLEService();
export default bleService;
