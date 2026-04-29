package com.teiu23.Flycom.ble

import android.bluetooth.*
import android.bluetooth.le.*
import android.content.Context
import android.os.ParcelUuid
import android.util.Log
import java.util.UUID

object FlycomBleConstants {
    val SERVICE_UUID: UUID = UUID.fromString("a1b2c3d4-e5f6-7890-abcd-ef1234567890")
    val CHAR_USER_ID_UUID: UUID = UUID.fromString("b1b2c3d4-e5f6-7890-abcd-ef1234567890")
    val CHAR_MESSAGE_UUID: UUID = UUID.fromString("c1b2c3d4-e5f6-7890-abcd-ef1234567890")
    val DESC_CONFIG_UUID: UUID = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb")
}

class FlycomGattServer(private val context: Context) {

    private var bluetoothManager: BluetoothManager? = null
    private var bluetoothAdapter: BluetoothAdapter? = null
    private var gattServer: BluetoothGattServer? = null
    private var bleAdvertiser: BluetoothLeAdvertiser? = null
    private var isAdvertising = false
    private var isServerRunning = false
    private var userId: String = ""
    private val connectedDevices = mutableMapOf<String, BluetoothDevice>()
    private var onMessageReceived: ((senderAddress: String, message: String) -> Unit)? = null

    fun setOnMessageReceived(callback: (senderAddress: String, message: String) -> Unit) {
        onMessageReceived = callback
    }

    fun start(userId: String): Boolean {
        this.userId = userId
        bluetoothManager = context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
        bluetoothAdapter = bluetoothManager?.adapter

        if (bluetoothAdapter == null || !bluetoothAdapter!!.isEnabled) {
            Log.e("FlycomGattServer", "Bluetooth not available or disabled")
            return false
        }

        if (!startGattServer()) {
            return false
        }

        startAdvertising()
        return true
    }

    private fun startGattServer(): Boolean {
        try {
            val serverCallback = object : BluetoothGattServerCallback() {
                override fun onConnectionStateChange(device: BluetoothDevice, status: Int, newState: Int) {
                    if (newState == BluetoothProfile.STATE_CONNECTED) {
                        connectedDevices[device.address] = device
                        Log.d("FlycomGattServer", "Device connected: ${device.address}")
                    } else {
                        connectedDevices.remove(device.address)
                        Log.d("FlycomGattServer", "Device disconnected: ${device.address}")
                    }
                }

                override fun onCharacteristicReadRequest(
                    device: BluetoothDevice,
                    requestId: Int,
                    offset: Int,
                    characteristic: BluetoothGattCharacteristic
                ) {
                    if (characteristic.uuid == FlycomBleConstants.CHAR_USER_ID_UUID) {
                        gattServer?.sendResponse(
                            device,
                            requestId,
                            BluetoothGatt.GATT_SUCCESS,
                            0,
                            userId.toByteArray(Charsets.UTF_8)
                        )
                    } else {
                        gattServer?.sendResponse(
                            device,
                            requestId,
                            BluetoothGatt.GATT_REQUEST_NOT_SUPPORTED,
                            0,
                            null
                        )
                    }
                }

                override fun onCharacteristicWriteRequest(
                    device: BluetoothDevice,
                    requestId: Int,
                    characteristic: BluetoothGattCharacteristic,
                    preparedWrite: Boolean,
                    responseNeeded: Boolean,
                    offset: Int,
                    value: ByteArray
                ) {
                    if (characteristic.uuid == FlycomBleConstants.CHAR_MESSAGE_UUID) {
                        val message = String(value, Charsets.UTF_8)
                        Log.d("FlycomGattServer", "Message from ${device.address}: $message")
                        onMessageReceived?.invoke(device.address, message)
                    }

                    if (responseNeeded) {
                        gattServer?.sendResponse(
                            device,
                            requestId,
                            BluetoothGatt.GATT_SUCCESS,
                            0,
                            null
                        )
                    }
                }

                override fun onDescriptorWriteRequest(
                    device: BluetoothDevice,
                    requestId: Int,
                    descriptor: BluetoothGattDescriptor,
                    preparedWrite: Boolean,
                    responseNeeded: Boolean,
                    offset: Int,
                    value: ByteArray
                ) {
                    if (responseNeeded) {
                        gattServer?.sendResponse(
                            device,
                            requestId,
                            BluetoothGatt.GATT_SUCCESS,
                            0,
                            null
                        )
                    }
                }
            }

            gattServer = bluetoothManager?.openGattServer(context, serverCallback)

            val userIdChar = BluetoothGattCharacteristic(
                FlycomBleConstants.CHAR_USER_ID_UUID,
                BluetoothGattCharacteristic.PROPERTY_READ,
                BluetoothGattCharacteristic.PERMISSION_READ
            )

            val messageChar = BluetoothGattCharacteristic(
                FlycomBleConstants.CHAR_MESSAGE_UUID,
                BluetoothGattCharacteristic.PROPERTY_WRITE or BluetoothGattCharacteristic.PROPERTY_NOTIFY,
                BluetoothGattCharacteristic.PERMISSION_WRITE
            )

            val configDescriptor = BluetoothGattDescriptor(
                FlycomBleConstants.DESC_CONFIG_UUID,
                BluetoothGattDescriptor.PERMISSION_WRITE or BluetoothGattDescriptor.PERMISSION_READ
            )
            messageChar.addDescriptor(configDescriptor)

            val service = BluetoothGattService(
                FlycomBleConstants.SERVICE_UUID,
                BluetoothGattService.SERVICE_TYPE_PRIMARY
            )
            service.addCharacteristic(userIdChar)
            service.addCharacteristic(messageChar)

            gattServer?.addService(service)
            isServerRunning = true
            Log.d("FlycomGattServer", "GATT server started with service")
            return true
        } catch (e: Exception) {
            Log.e("FlycomGattServer", "Failed to start GATT server", e)
            return false
        }
    }

    private fun startAdvertising() {
        try {
            bleAdvertiser = bluetoothAdapter?.bluetoothLeAdvertiser
            if (bleAdvertiser == null) {
                Log.e("FlycomGattServer", "BLE advertiser not available")
                return
            }

            val settings = AdvertiseSettings.Builder()
                .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY)
                .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_HIGH)
                .setConnectable(true)
                .setTimeout(0)
                .build()

            val advertiseData = AdvertiseData.Builder()
                .setIncludeDeviceName(true)
                .addServiceUuid(ParcelUuid(FlycomBleConstants.SERVICE_UUID))
                .build()

            val scanResponseData = AdvertiseData.Builder()
                .setIncludeDeviceName(false)
                .addServiceData(
                    ParcelUuid(FlycomBleConstants.SERVICE_UUID),
                    userId.toByteArray(Charsets.UTF_8).take(20).toByteArray()
                )
                .build()

            bleAdvertiser?.startAdvertising(settings, advertiseData, scanResponseData, advertiseCallback)
            isAdvertising = true
            Log.d("FlycomGattServer", "Advertising started for user: $userId")
        } catch (e: Exception) {
            Log.e("FlycomGattServer", "Failed to start advertising", e)
        }
    }

    private val advertiseCallback = object : AdvertiseCallback() {
        override fun onStartSuccess(settingsInEffect: AdvertiseSettings) {
            Log.d("FlycomGattServer", "Advertising started successfully")
        }

        override fun onStartFailure(errorCode: Int) {
            Log.e("FlycomGattServer", "Advertising failed: $errorCode")
            isAdvertising = false
        }
    }

    fun sendMessageToDevice(deviceAddress: String, message: String): Boolean {
        val device = connectedDevices[deviceAddress] ?: return false
        val service = gattServer?.getService(FlycomBleConstants.SERVICE_UUID) ?: return false
        val characteristic = service.getCharacteristic(FlycomBleConstants.CHAR_MESSAGE_UUID) ?: return false

        try {
            characteristic.value = message.toByteArray(Charsets.UTF_8)
            val result = gattServer?.notifyCharacteristicChanged(device, characteristic, false)
            Log.d("FlycomGattServer", "Sent notification to $deviceAddress, result=$result")
            return result ?: false
        } catch (e: Exception) {
            Log.e("FlycomGattServer", "Failed to send message", e)
            return false
        }
    }

    fun broadcastMessage(message: String) {
        for ((address, device) in connectedDevices) {
            sendMessageToDevice(address, message)
        }
    }

    fun stop() {
        stopAdvertising()
        stopGattServer()
    }

    private fun stopAdvertising() {
        if (isAdvertising) {
            try {
                bleAdvertiser?.stopAdvertising(advertiseCallback)
            } catch (e: Exception) {
                Log.e("FlycomGattServer", "Error stopping advertising", e)
            }
            isAdvertising = false
        }
    }

    private fun stopGattServer() {
        if (gattServer != null) {
            try {
                for ((_, device) in connectedDevices) {
                    gattServer?.cancelConnection(device)
                }
                gattServer?.close()
            } catch (e: Exception) {
                Log.e("FlycomGattServer", "Error closing GATT server", e)
            }
            gattServer = null
            isServerRunning = false
        }
        connectedDevices.clear()
    }

    fun isRunning(): Boolean = isServerRunning && isAdvertising

    fun getConnectedDeviceCount(): Int = connectedDevices.size
}
