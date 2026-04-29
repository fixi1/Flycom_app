# Flycom

<p align="center">
  <img src="assets/icon.png" alt="Flycom Logo" width="120" />
</p>

**Emergency communication app for Android.** Find nearby users, chat, send SOS — even without internet.

---

## Features

| | |
|--|--|
| 📡 **Peer Discovery** | See nearby Flycom users on a live map |
| 💬 **Chat** | Direct messages + embassy channels |
| 🆘 **SOS Alerts** | One-tap broadcast with GPS coordinates |
| 🗺️ **Offline Map** | Leaflet map with user dots, embassies, reference points |
| 🏛️ **Embassies** | Location-based channels managed by officials |
| 🔒 **Encryption** | NaCl Curve25519 end-to-end encrypted messages |
| 📶 **Dual Mode** | Works over Wi-Fi sync or Bluetooth |

---

## Quick Start

### 1. Build the APK

```bash
git clone https://github.com/YOUR_USERNAME/Flycom.git
cd Flycom && npm install
cd android && .\gradlew.bat assembleRelease
```

APK → `android/app/build/outputs/apk/release/app-release.apk`

### 2. Start the sync server

```bash
cd sync-server && node index.js
# Flycom sync server running on port 3000
# -> http://192.168.1.100:3000
```

### 3. Connect both phones

Settings → **Network Sync** → set the server URL + same room code on both phones → **Save & Test**

> **Windows firewall?** Run: `netsh advfirewall firewall add rule name="Flycom" protocol=TCP dir=in localport=3000 action=allow`

---

## Testing

| Feature | How |
|---------|-----|
| **Discovery** | Wait 5–10s → other phone appears in Home & Nearby |
| **Chat** | Nearby → tap user → Message → send |
| **SOS** | Home → red SOS button → confirm |
| **Embassy** | Settings → Admin (`flycom2026`) → add embassy |
| **BLE only** | Turn off Wi-Fi — may still detect nearby devices |

---

## How It Works

### Cloud Sync (primary, works reliably)

Each phone polls the relay server every **4 seconds** — publishing its state and fetching peers + messages. The server's clock drives the `since` timestamp to avoid phone clock skew causing missed messages.

```
Phone A ──POST /publish──► Server ◄──POST /publish── Phone B
Phone A ──GET  /peers───► Server ──[peers]─────────► Phone B
Phone A ──POST /message──► Server ◄──GET /messages── Phone B
```

### BLE (secondary, partial)

We built a full native Kotlin GATT server from scratch — because `react-native-ble-plx` can only act as a scanner (central), not an advertiser (peripheral). Both roles are needed for true peer-to-peer.

**What works:** advertising, scan discovery, occasional GATT writes
**What doesn't:** reliable GATT connections on all device pairs, background operation (needs a foreground service)

The BLE layer runs on every launch and merges with cloud peers — users found via both show **"BLE + Internet"**.

---

## Architecture

```
Flycom/
├── sync-server/index.js          # Zero-dependency Node.js relay
├── src/
│   ├── context/AppContext.js     # Global state: user, BLE, sync, location
│   ├── screens/                  # HomeScreen, MapScreen, NearbyScreen, ChatScreen, SettingsScreen
│   ├── services/
│   │   ├── nearbyService.js      # BLE scanning + GATT bridge
│   │   ├── cloudSyncService.js   # HTTP polling sync
│   │   └── cryptoService.js      # NaCl encryption
│   └── storage/index.js          # AsyncStorage persistence
└── android/.../ble/
    ├── FlycomGattServer.kt       # Native GATT server (advertise + receive)
    └── FlycomBleModule.kt        # React Native bridge
```

---

## Status

| Feature | Status |
|---------|--------|
| Cloud discovery & chat | ✅ Working |
| SOS alerts | ✅ Working |
| Embassy sync | ✅ Working |
| BLE advertising & scan | ⚠️ Partial |
| BLE chat | ❌ Unreliable |
| BLE background | ❌ Needs foreground service |
| iOS | ❌ Not supported |
| Drone delivery | 🔮 Placeholder |

---

## Tech Stack

| | |
|--|--|
| React Native + Expo | App framework |
| Kotlin | Native BLE GATT server |
| react-native-ble-plx | BLE scanning |
| Leaflet.js + WebView | Map rendering |
| TweetNaCl | End-to-end encryption |
| Node.js | Sync relay server |
| expo-location | GPS |
| AsyncStorage | Local persistence |

---

## References

- [Android BLE Guide](https://developer.android.com/develop/connectivity/bluetooth/ble/ble-overview)
- [BluetoothGattServer API](https://developer.android.com/reference/android/bluetooth/BluetoothGattServer)
- [react-native-ble-plx](https://github.com/dotintent/react-native-ble-plx)
- [React Native Native Modules](https://reactnative.dev/docs/native-modules-android)
- [TweetNaCl-js](https://github.com/dchest/tweetnacl-js)
- [Leaflet.js](https://leafletjs.com/)
- [Expo docs](https://docs.expo.dev/)
- [React Navigation](https://reactnavigation.org/)

---

## Team

- **Alexa Teodor** — Development
- **Lozneanu Andi-Fineas** — Design & UI/UX

---

**Flycom** — Stay connected, even when the world goes offline.
