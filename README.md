# Flycom

**Offline-first, peer-to-peer emergency communication app** built with React Native. Stay connected when it matters most -- even without internet.

---

## Overview

Flycom is a mobile application designed for travelers and citizens in emergency scenarios who need to communicate when traditional networks fail. It seamlessly switches between internet-based messaging and Bluetooth Low Energy (BLE) mesh networking, ensuring you can always reach nearby users.

### Key Features

- **Dual-Mode Communication** -- Internet mode (100km discovery) when online, BLE mesh when offline
- **End-to-End Encryption** -- NaCl Curve25519 + XSalsa20-Poly1305 authenticated encryption for all private messages
- **Interactive Map** -- Leaflet-based map showing your location, nearby users, embassies, and reference points
- **Embassy & Consulate Channels** -- Location-based channels visible within 200km, managed by officials
- **SOS Emergency Alerts** -- One-tap broadcast with GPS coordinates
- **User Search** -- Find and message users by their unique ID or name
- **BLE Device Discovery** -- Real-time Bluetooth scanning for nearby Flycom users

---

## Architecture

```
Flycom/
├── App.js                          # Entry point
├── src/
│   ├── components/
│   │   ├── BottomNav.js            # Navigation bar
│   │   └── LeafletMap.js           # WebView Leaflet map
│   ├── context/
│   │   └── AppContext.js           # Global state (user, location, BLE, network)
│   ├── screens/
│   │   ├── HomeScreen.js           # Map, SOS, users, reference points
│   │   ├── MapScreen.js            # Full-screen map
│   │   ├── NearbyScreen.js         # BLE users & embassies list
│   │   ├── ChatScreen.js           # Messaging, search, channels
│   │   └── SettingsScreen.js       # User config, admin panel
│   ├── services/
│   │   ├── nearbyService.js        # BLE scanning & permissions
│   │   ├── userService.js          # User ID generation
│   │   ├── cryptoService.js        # E2E encryption (NaCl)
│   │   └── bleService.js           # BLE connection layer
│   ├── storage/
│   │   └── index.js                # AsyncStorage persistence
│   └── styles/
│       ├── colors.js               # Color palette
│       └── commonStyles.js         # Shared styles
```

---

## Getting Started

### Prerequisites

- Node.js 18+
- Android Studio / Android SDK (for building)
- A physical Android device (BLE does not work on emulator)
- Bluetooth and Location enabled on device

### Installation

```bash
git clone https://github.com/YOUR_USERNAME/Flycom.git
cd Flycom
npm install
npx expo run:android
```

### Permissions Required

| Permission | Purpose |
|-----------|---------|
| `ACCESS_FINE_LOCATION` | GPS positioning and BLE scanning |
| `ACCESS_COARSE_LOCATION` | Approximate location fallback |
| `BLUETOOTH_SCAN` | Discover nearby BLE devices (Android 12+) |
| `BLUETOOTH_CONNECT` | Connect to BLE devices (Android 12+) |
| `BLUETOOTH` | Legacy Bluetooth access |
| `BLUETOOTH_ADMIN` | BLE advertising (legacy) |

---

## Encryption

All private messages use end-to-end asymmetric encryption:

- **Key Exchange:** Curve25519 -- each user generates a key pair on first launch
- **Encryption:** XSalsa20 stream cipher
- **Authentication:** Poly1305 MAC
- **Nonce:** Random 24-byte nonce per message

Messages are encrypted with the recipient's public key and the sender's private key. Only the intended recipient can decrypt. Encrypted messages display a lock indicator.

In the current version, public keys are derived from user IDs for demo purposes. Production deployment requires a key exchange server or BLE handshake.

---

## Communication Modes

### Internet Mode (default when online)
- Discover users within 100km
- Instant message delivery
- Normal messaging app experience
- Map tiles load from OpenStreetMap

### BLE Mesh Mode (automatic when offline)
- Discovers nearby Flycom devices via Bluetooth (~50m range)
- Messages relayed through mesh network
- Works without WiFi or mobile data
- Location services still required for GPS

The app automatically switches between modes based on network connectivity, monitored in real-time via `@react-native-community/netinfo`.

---

## Tech Stack

| Technology | Purpose |
|-----------|---------|
| React Native | Cross-platform mobile framework |
| Expo | Development toolchain |
| react-native-ble-plx | BLE scanning and communication |
| expo-location | GPS positioning |
| react-native-webview + Leaflet | Map rendering |
| @react-native-community/netinfo | Internet connectivity monitoring |
| tweetnacl | NaCl cryptographic primitives |
| @react-native-async-storage/async-storage | Local data persistence |
| React Navigation | Screen navigation |

---

## Admin Panel

Access the admin panel from **Settings > Login as Admin**.

Admins can:
- Add/Remove Officials -- Assign users to embassy or consulate roles
- Add/Remove Embassies and Consulates -- Create location-based channels with real GPS coordinates
- Officials can post in embassy/consulate channels; regular users can read

---

## Testing with Two Phones

1. Install Flycom on both Android phones
2. Enable Bluetooth and Location on both devices
3. Place phones within 5-10 meters
4. Open the app on both -- they should discover each other via BLE
5. Go to **Nearby** screen to see the other device
6. Tap on the user to start an encrypted chat

---

## Known Limitations

- **No backend server** -- Internet mode user discovery is limited to BLE range without a server
- **Key exchange is simulated** -- Production needs a key server or BLE handshake protocol
- **BLE mesh relay not implemented** -- Messages are not yet forwarded through intermediate nodes
- **Map requires internet for tiles** -- OpenStreetMap tiles need initial internet load
- **Android only** -- iOS BLE background mode requires additional configuration

---

## License

This project is open source.

---

Flycom -- Stay connected, even when the world goes offline.
