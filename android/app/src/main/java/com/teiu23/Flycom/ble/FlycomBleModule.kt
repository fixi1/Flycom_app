package com.teiu23.Flycom.ble

import android.bluetooth.*
import android.content.Context
import android.util.Log
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule

class FlycomBleModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    private var gattServer: FlycomGattServer? = null
    private var scanManager: BluetoothGatt? = null
    private var discoveredCharacteristics: BluetoothGattCharacteristic? = null
    private val pendingWrites = mutableMapOf<String, String>()

    override fun getName(): String = "FlycomBle"

    @ReactMethod
    fun startServer(userId: String, promise: Promise) {
        try {
            if (gattServer != null) {
                gattServer?.stop()
            }
            gattServer = FlycomGattServer(reactApplicationContext)
            gattServer?.setOnMessageReceived { senderAddress, message ->
                sendEvent("onBleMessage", Arguments.createMap().apply {
                    putString("senderAddress", senderAddress)
                    putString("message", message)
                })
            }
            val result = gattServer?.start(userId) ?: false
            if (result) {
                promise.resolve(true)
            } else {
                promise.reject("BLE_ERROR", "Failed to start GATT server")
            }
        } catch (e: Exception) {
            promise.reject("BLE_ERROR", e.message)
        }
    }

    @ReactMethod
    fun stopServer(promise: Promise) {
        try {
            gattServer?.stop()
            gattServer = null
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("BLE_ERROR", e.message)
        }
    }

    @ReactMethod
    fun isServerRunning(promise: Promise) {
        promise.resolve(gattServer?.isRunning() ?: false)
    }

    @ReactMethod
    fun sendMessage(deviceAddress: String, message: String, promise: Promise) {
        try {
            val result = gattServer?.sendMessageToDevice(deviceAddress, message) ?: false
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("BLE_ERROR", e.message)
        }
    }

    @ReactMethod
    fun broadcastMessage(message: String, promise: Promise) {
        try {
            gattServer?.broadcastMessage(message)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("BLE_ERROR", e.message)
        }
    }

    @ReactMethod
    fun getConnectedDeviceCount(promise: Promise) {
        promise.resolve(gattServer?.getConnectedDeviceCount() ?: 0)
    }

    @ReactMethod
    fun addListener(eventName: String) {
    }

    @ReactMethod
    fun removeListeners(count: Int) {
    }

    @ReactMethod
    fun connectAndWrite(deviceAddress: String, message: String, promise: Promise) {
        try {
            val bluetoothManager = reactApplicationContext.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
            val adapter = bluetoothManager?.adapter
            if (adapter == null || !adapter.isEnabled) {
                promise.reject("BLE_ERROR", "Bluetooth not available")
                return
            }

            val device = adapter.getRemoteDevice(deviceAddress)
            var promiseResolved = false

            fun resolveOnce(success: Boolean, error: String? = null) {
                if (promiseResolved) return
                promiseResolved = true
                if (success) promise.resolve(true)
                else promise.reject("BLE_ERROR", error ?: "Write failed")
            }

            val handler = android.os.Handler(android.os.Looper.getMainLooper())
            handler.postDelayed({
                resolveOnce(false, "BLE write timed out")
            }, 15000)

            val gattCallback = object : BluetoothGattCallback() {
                private var pendingMessageWrite = false

                override fun onConnectionStateChange(gatt: BluetoothGatt, status: Int, newState: Int) {
                    if (newState == BluetoothProfile.STATE_CONNECTED) {
                        Log.d("FlycomBle", "Connected to ${device.address}, discovering services")
                        gatt.discoverServices()
                    } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                        gatt.close()
                        if (!promiseResolved) {
                            handler.removeCallbacksAndMessages(null)
                            resolveOnce(false, "Disconnected before write completed")
                        }
                    }
                }

                private fun writeMessage(gatt: BluetoothGatt) {
                    val service = gatt.getService(FlycomBleConstants.SERVICE_UUID)
                    val messageChar = service?.getCharacteristic(FlycomBleConstants.CHAR_MESSAGE_UUID)
                    if (messageChar != null) {
                        messageChar.value = message.toByteArray(Charsets.UTF_8)
                        messageChar.writeType = BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT
                        val written = gatt.writeCharacteristic(messageChar)
                        if (!written) {
                            handler.removeCallbacksAndMessages(null)
                            resolveOnce(false, "writeCharacteristic returned false")
                            gatt.disconnect()
                        }
                    } else {
                        handler.removeCallbacksAndMessages(null)
                        resolveOnce(false, "Message characteristic not found")
                        gatt.disconnect()
                    }
                }

                override fun onServicesDiscovered(gatt: BluetoothGatt, status: Int) {
                    if (status != BluetoothGatt.GATT_SUCCESS) {
                        handler.removeCallbacksAndMessages(null)
                        resolveOnce(false, "Service discovery failed")
                        gatt.disconnect()
                        return
                    }
                    val service = gatt.getService(FlycomBleConstants.SERVICE_UUID)
                    if (service == null) {
                        handler.removeCallbacksAndMessages(null)
                        resolveOnce(false, "Flycom service not found on device")
                        gatt.disconnect()
                        return
                    }
                    val userIdChar = service.getCharacteristic(FlycomBleConstants.CHAR_USER_ID_UUID)
                    if (userIdChar != null) {
                        pendingMessageWrite = true
                        gatt.readCharacteristic(userIdChar)
                    } else {
                        writeMessage(gatt)
                    }
                }

                override fun onCharacteristicRead(gatt: BluetoothGatt, characteristic: BluetoothGattCharacteristic, status: Int) {
                    if (characteristic.uuid == FlycomBleConstants.CHAR_USER_ID_UUID && status == BluetoothGatt.GATT_SUCCESS) {
                        val peerUserId = String(characteristic.value, Charsets.UTF_8)
                        Log.d("FlycomBle", "Peer user ID: $peerUserId")
                        sendEvent("onPeerUserId", Arguments.createMap().apply {
                            putString("deviceAddress", device.address)
                            putString("userId", peerUserId)
                        })
                    }
                    if (pendingMessageWrite) {
                        pendingMessageWrite = false
                        writeMessage(gatt)
                    }
                }

                override fun onCharacteristicWrite(gatt: BluetoothGatt, characteristic: BluetoothGattCharacteristic, status: Int) {
                    handler.removeCallbacksAndMessages(null)
                    if (status == BluetoothGatt.GATT_SUCCESS) {
                        Log.d("FlycomBle", "Write complete to ${device.address}")
                        resolveOnce(true)
                    } else {
                        Log.e("FlycomBle", "Write failed, status=$status")
                        resolveOnce(false, "Write failed with GATT status $status")
                    }
                    gatt.disconnect()
                }
            }

            device.connectGatt(reactApplicationContext, false, gattCallback, BluetoothDevice.TRANSPORT_LE)
        } catch (e: Exception) {
            promise.reject("BLE_ERROR", e.message)
        }
    }

    private fun sendEvent(eventName: String, params: WritableMap?) {
        try {
            reactApplicationContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(eventName, params)
        } catch (e: Exception) {
            Log.e("FlycomBle", "Failed to send event", e)
        }
    }

    override fun onCatalystInstanceDestroy() {
        gattServer?.stop()
        gattServer = null
        super.onCatalystInstanceDestroy()
    }
}
