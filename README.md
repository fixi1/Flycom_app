# Flycom

<p align="center">
  <img src="assets/icon.png" alt="Flycom Logo" width="120" />
</p>

**Offline-first, peer-to-peer emergency communication app** built with React Native. Stay connected when it matters most — even without internet.

---

## Overview

Flycom is a mobile application designed for travelers, humanitarian workers, and citizens in emergency scenarios who need to communicate when traditional networks fail. It combines **internet-based cloud sync** with **Bluetooth Low Energy (BLE) mesh networking**, ensuring you can always reach nearby users regardless of connectivity.

### Key Features

- **Dual-Mode Communication** — Internet sync via relay server + BLE mesh when offline
- **Real-Time User Discovery** — See nearby Flycom users on a live map with BLE, Internet, or both
- **Cloud Sync Server** — Lightweight Node.js relay server for instant cross-device synchronization
- **End-to-End Encryption** — NaCl Curve25519 + XSalsa20-Poly1305 authenticated encryption
- **Interactive Map** — Offline-capable Leaflet map showing users, embassies, and reference points
- **Embassy & Consulate Channels** — Location-based channels within 200km, managed by officials
- **SOS Emergency Alerts** — One-tap broadcast with GPS coordinates via BLE and Internet
- **Drone Delivery Request** — Future feature for emergency essentials delivery (coming soon)
- **Dark Theme** — Full dark mode UI with dynamic theming
- **User Search** — Find and message users by unique ID or name
- **BLE GATT Server** — Native Android Kotlin BLE advertising and message exchange

---

## Architecture

```
Flycom/
├── App.js                              # Entry point & navigation
├── sync-server/                        # Cloud sync relay server
│   ├── index.js                        # Zero-dependency Node.js server
│   └── package.json
├── src/
│   ├── components/
│   │   ├── BottomNav.js                # Navigation bar
│   │   └── LeafletMap.js               # Offline-capable WebView Leaflet map
│   ├── context/
│   │   ├── AppContext.js               # Global state (user, BLE, cloud sync, location)
│   │   └── ThemeContext.js             # Dark/light theme management
│   ├── screens/
│   │   ├── HomeScreen.js               # Dashboard: map, SOS, drone, nearby users
│   │   ├── MapScreen.js                # Full-screen map with markers
│   │   ├── NearbyScreen.js             # Nearby users & embassies list
│   │   ├── ChatScreen.js               # Messaging, search, embassy channels
│   │   └── SettingsScreen.js           # User config, admin panel, sync settings
│   ├── services/
│   │   ├── nearbyService.js            # BLE scanning & permissions
│   │   ├── cloudSyncService.js         # Cloud relay sync (publish/subscribe)
│   │   ├── userService.js              # User ID generation & persistence
│   │   ├── cryptoService.js            # E2E encryption (NaCl)
│   │   └── bleService.js               # BLE connection layer
│   └── storage/
│       └── index.js                    # AsyncStorage persistence layer
├── android/
│   └── app/src/main/java/com/teiu23/flycom/ble/
│       ├── FlycomGattServer.kt         # Native BLE GATT server (advertising + messaging)
│       ├── FlycomBleModule.kt          # React Native bridge for BLE
│       └── FlycomBlePackage.kt         # Native module registration
```

---

## Getting Started

### Prerequisites

- Node.js 18+
- Android Studio / Android SDK
- Two physical Android devices (BLE does not work on emulator)
- Bluetooth and Location enabled on both devices

### Installation

```bash
git clone https://github.com/YOUR_USERNAME/Flycom.git
cd Flycom
npm install
```

### Build APK

```bash
cd android
./gradlew assembleRelease
```

APK output: `android/app/build/outputs/apk/release/app-release.apk`

### Run Sync Server

The sync server is a zero-dependency Node.js server that relays data between phones:

```bash
cd sync-server
node index.js
```

It prints all available network interfaces:
```
Flycom sync server running on port 3000
  -> http://192.168.1.100:3000  (Wi-Fi)
```

---

## Testing with Two Phones

### Setup

1. **Start the sync server** on your computer: `cd sync-server && node index.js`
2. **Note your computer's local IP** (printed by the server, e.g. `192.168.x.x`)
3. **Install the APK** on both Android phones
4. **Connect all devices** (computer + both phones) to the **same WiFi network**

### Configure Sync (on each phone)

1. Open Flycom → **Settings** (bottom nav)
2. Scroll to **Network Sync**
3. Set **Server URL** to `http://<your-computer-ip>:3000`
4. Set **Room Code** to the same value on both phones (e.g. `flycom-demo`)
5. Tap **Save & Test Connection** → should show "Connected!"

### Test Features

| Feature | How to test |
|---------|------------|
| **User Discovery** | Wait 5 seconds → check Home or Nearby screen for the other phone |
| **Chat** | Nearby → tap "Message" → type and send → check other phone's Chat |
| **SOS Alert** | Home → tap red SOS → confirm → other phone gets alert popup |
| **Embassy Sync** | Settings → Admin login (`flycom2026`) → add embassy → appears on other phone |
| **Map** | Home or Map → see your dot + other user's dot + embassies |
| **Drone Request** | Home → tap blue DRONE button → shows "Coming soon" |

### Permissions Required

| Permission | Purpose |
|-----------|---------|
| `ACCESS_FINE_LOCATION` | GPS positioning and BLE scanning |
| `ACCESS_COARSE_LOCATION` | Approximate location fallback |
| `BLUETOOTH_SCAN` | Discover nearby BLE devices (Android 12+) |
| `BLUETOOTH_CONNECT` | Connect to BLE devices (Android 12+) |
| `BLUETOOTH_ADVERTISE` | BLE GATT server advertising (Android 12+) |
| `BLUETOOTH` / `BLUETOOTH_ADMIN` | Legacy Bluetooth access |
| `INTERNET` | Cloud sync server communication |

---

## Communication Modes

### Internet Mode (via Sync Server)
- Discover users across any distance on the same sync room
- Real-time message delivery (~4 second polling)
- SOS alerts broadcast instantly
- Embassy and user data synchronized
- Map tiles from OpenStreetMap

### BLE Mesh Mode (automatic, always active)
- Discovers nearby Flycom devices via Bluetooth (~50m range)
- Native Android GATT server for advertising and message exchange
- Works without WiFi or mobile data
- Direct device-to-device communication

Users discovered via both methods show a combined **"BLE + Internet"** label.

---

## Encryption

All private messages use end-to-end asymmetric encryption:

- **Key Exchange:** Curve25519 — each user generates a key pair on first launch
- **Encryption:** XSalsa20 stream cipher
- **Authentication:** Poly1305 MAC
- **Nonce:** Random 24-byte nonce per message

Encrypted messages display a lock icon. In the current version, public keys are derived from user IDs for demo purposes.

---

## Tech Stack

| Technology | Purpose |
|-----------|---------|
| React Native + Expo | Cross-platform mobile framework |
| Kotlin | Native Android BLE GATT server |
| react-native-ble-plx | BLE scanning and communication |
| expo-location | GPS positioning |
| react-native-webview + Leaflet | Offline-capable map rendering |
| @react-native-community/netinfo | Connectivity monitoring |
| tweetnacl | NaCl cryptographic primitives |
| AsyncStorage | Local data persistence |
| React Navigation | Screen navigation |
| Node.js (sync-server) | Zero-dependency cloud relay |

---

## Admin Panel

Access from **Settings → Login as Admin** (password: `flycom2026`).

- **Officials** — Assign users to embassy/consulate roles
- **Embassies & Consulates** — Create location-based channels with GPS coordinates
- Officials can post in embassy/consulate channels; regular users can read
- Embassies sync across devices via the cloud relay

---

## Sync Server

The sync server (`sync-server/index.js`) is a minimal HTTP relay with zero dependencies:

- **`POST /publish`** — Device publishes its state (user, location, embassies)
- **`GET /peers`** — Fetch all active peers in a room
- **`POST /message`** — Send a message (chat, SOS, broadcast)
- **`GET /messages`** — Fetch messages since a timestamp
- **`GET /health`** — Server health check

Peers expire after 2 minutes of inactivity. Messages are capped at 200 per room.

Can be deployed to any Node.js host (Glitch, Render, Railway, etc.) or run locally.

---

## Known Limitations

- **Sync server required for internet mode** — Without it, only BLE works
- **Key exchange is simulated** — Production needs a proper key server
- **BLE mesh relay not implemented** — Messages don't forward through intermediate nodes yet
- **Map tiles require internet** — First load needs connectivity for OpenStreetMap tiles
- **Android only** — iOS BLE background mode requires additional configuration
- **Drone delivery** — Placeholder feature, not yet functional

---

## License

This project is open source.

---

**Flycom** — Stay connected, even when the world goes offline.
