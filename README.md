# Flycom

<p align="center">
  <img src="assets/icon.png" alt="Flycom Logo" width="120" />
</p>

**Offline-first emergency communication app** for Android — built with React Native, a custom Kotlin BLE GATT server, and a lightweight Node.js sync relay.

---

## What is Flycom?

Flycom is designed for situations where normal networks fail — natural disasters, conflicts, remote areas, blackouts. The idea is simple: as long as two phones both have Flycom installed, they should be able to find each other and communicate.

The app was built to demonstrate two connectivity approaches:

1. **Cloud Sync (working)** — A Node.js relay server on the local network relays user presence, chat messages, SOS alerts, and embassy data between phones on the same Wi-Fi.
2. **BLE (partially working)** — A native Android GATT server advertises each device and can receive written messages from nearby Flycom devices. Discovery works on some devices; full two-way chat over BLE is still unreliable (see the BLE section below).

---

## The BLE Story — What We Built and Where It Got Hard

We spent significant time building a native BLE stack from scratch. Here's the honest account of what works and what doesn't:

### What we built

- A native Kotlin **GATT server** (`FlycomGattServer.kt`) that:
  - Advertises a custom 128-bit service UUID (`a1b2c3d4-e5f6-7890-abcd-ef1234567890`)
  - Embeds the user's ID in the advertisement's service data payload (scan response)
  - Runs a writable GATT characteristic for receiving messages
  - Runs a readable GATT characteristic exposing the user's ID
- A **React Native bridge** (`FlycomBleModule.kt`) that:
  - Exposes `startServer`, `connectAndWrite`, `broadcastMessage` to JavaScript
  - Emits `onBleMessage` and `onPeerUserId` events back to JS
- **BLE scanning** via `react-native-ble-plx` that:
  - Scans for devices advertising the Flycom service UUID
  - Decodes user ID from service data in the scan response
  - Shows discovered devices in the Nearby screen

### Why it's unreliable in practice

Android BLE is fragmented across manufacturers and API levels. The specific issues we ran into:

- **Advertising failures on some devices** — Cheaper Android phones (especially MediaTek-based) sometimes return `ADVERTISE_FAILED_INTERNAL_ERROR` without a clear cause. The `bleAdvertiser` is null on some devices even when Bluetooth is on.
- **Service data in scan response** — We embed the user ID in the scan response's service data (20 bytes max). Not all phones include this in passive scan results, especially in Android 12+ where scan results can be cached and deduplicated by the OS.
- **GATT connection race conditions** — `connectGatt()` sometimes never calls `onConnectionStateChange` on certain phone combinations. We added a 15-second timeout but on some pairs the connection simply never fires.
- **Android 12+ background restrictions** — When the app is backgrounded, BLE scanning is throttled or stopped by the OS entirely. This makes background discovery impossible without a foreground service.
- **Not enough time to debug per-device** — Each phone model has its own quirks. With only two test devices (an Oppo Reno 7 Lite and a Samsung A13), we couldn't isolate all combinations.

### What works reliably

- The GATT server starts and advertises on both test devices.
- Scan discovery (`react-native-ble-plx`) finds nearby Flycom devices when both phones are advertising.
- Direct GATT `connectAndWrite` delivers a message when the connection succeeds (works intermittently, not reliably enough for a demo).

### What we would do with more time

- Add a foreground service with a persistent notification so BLE keeps running in the background.
- Use `ScanFilter` with explicit service UUID to make scan results more reliable.
- Implement proper MTU negotiation for messages larger than 20 bytes.
- Test on 5+ device models to find the common failure modes.
- Switch from `react-native-ble-plx` scanning + native GATT server (hybrid) to a pure native module that handles both sides.

---

## How the App Actually Works (Cloud Sync Mode)

Since BLE is unreliable, the primary working mode uses a local Wi-Fi relay server:

```
Phone A                   Server (laptop)              Phone B
  │                           │                            │
  ├── POST /publish ──────────►│                            │
  │   { userId, name,          │◄─── POST /publish ─────────┤
  │     lat, lng, embassies }  │       { userId, name... }  │
  │                           │                            │
  ├── GET /peers ─────────────►│                            │
  │◄── [{ Phone B data }] ─────┤                            │
  │                           │◄─── GET /peers ────────────┤
  │                           ├──── [{ Phone A data }] ────►│
  │                           │                            │
  ├── POST /message ──────────►│                            │
  │   { type: CHAT, text, ... }│◄─── GET /messages ─────────┤
  │                           ├──── [{ message }] ─────────►│
```

- Each phone publishes its state every **4 seconds**
- Peers expire after **5 minutes** of inactivity
- Messages are fetched using a `since` timestamp that uses the **server's clock** (not the phone's) to avoid clock skew
- The same server handles SOS alerts, embassy data, and chat messages
- BLE scanning runs in parallel and merges with cloud peers — if a user appears via both, they show "BLE + Internet"

---

## Architecture

```
Flycom/
├── App.js                                  # Entry point & React Navigation setup
├── sync-server/
│   ├── index.js                            # Zero-dependency Node.js HTTP relay server
│   └── package.json
├── src/
│   ├── context/
│   │   ├── AppContext.js                   # All global state: user, BLE, sync, location
│   │   └── ThemeContext.js                 # Dark/light theme
│   ├── screens/
│   │   ├── HomeScreen.js                   # Dashboard: mini-map, SOS, drone button, nearby users
│   │   ├── MapScreen.js                    # Full Leaflet map with all markers
│   │   ├── NearbyScreen.js                 # List of nearby users (BLE + internet) & embassies
│   │   ├── ChatScreen.js                   # Chat UI, channel switching, user search
│   │   └── SettingsScreen.js               # Profile, admin panel, sync server config
│   ├── components/
│   │   ├── BottomNav.js                    # Tab navigation bar
│   │   └── LeafletMap.js                   # WebView wrapping a Leaflet HTML map
│   ├── services/
│   │   ├── nearbyService.js                # BLE permissions, scanning (ble-plx), GATT bridge
│   │   ├── cloudSyncService.js             # HTTP polling sync: publish, peers, messages
│   │   ├── cryptoService.js                # NaCl key generation and E2E encryption
│   │   └── userService.js                  # Persistent user ID and username
│   └── storage/
│       └── index.js                        # AsyncStorage wrappers for all persisted data
├── android/app/src/main/java/com/teiu23/flycom/ble/
│   ├── FlycomGattServer.kt                 # Native GATT server: advertising + characteristic handling
│   ├── FlycomBleModule.kt                  # React Native bridge (startServer, connectAndWrite, events)
│   └── FlycomBlePackage.kt                 # Registers the native module with React Native
└── android/app/src/main/
    ├── AndroidManifest.xml                 # All permissions + cleartext HTTP config
    └── res/xml/network_security_config.xml # Allows HTTP to local sync server
```

---

## Getting Started

### Prerequisites

- Node.js 18+
- Android Studio (for building)
- Two physical Android phones (BLE won't work in emulators)
- All devices on the same Wi-Fi network for cloud sync

### Install & Build

```bash
git clone https://github.com/YOUR_USERNAME/Flycom.git
cd Flycom
npm install

cd android
.\gradlew.bat assembleRelease        # Windows
# or
./gradlew assembleRelease            # Mac/Linux
```

APK: `android/app/build/outputs/apk/release/app-release.apk`

### Run the Sync Server

```bash
cd sync-server
node index.js
```

Output:
```
Flycom sync server running on port 3000
  -> http://192.168.1.100:3000  (Wi-Fi)
```

Use the printed IP — **not** `localhost` — in the app settings.

---

## Testing with Two Phones (Step by Step)

### Prerequisites

- Laptop and both phones on the **same Wi-Fi**
- Sync server running on the laptop
- APK installed on both phones

> **Note for Windows:** If phones can't reach the server, add a firewall rule:
> ```
> netsh advfirewall firewall add rule name="Flycom Sync" protocol=TCP dir=in localport=3000 action=allow
> ```

### On each phone

1. Open Flycom → **Settings** tab
2. Scroll to **Network Sync**
3. Set **Server URL** to `http://<laptop-ip>:3000`
4. Set **Room Code** to the same value (e.g. `flycom-demo`)
5. Tap **Save & Test Connection** — should say "Connected!"

### Feature tests

| Feature | Steps | Expected result |
|---------|-------|-----------------|
| **Discovery** | Wait 5–10s after connecting | Other phone appears in Home and Nearby screens |
| **Chat** | Nearby → tap user → Message → type → Send | Message appears on other phone's Chat screen within 5s |
| **SOS** | Home → red SOS button → confirm | Other phone shows an alert popup with coordinates |
| **Embassy** | Settings → Admin (`flycom2026`) → add embassy | Embassy appears on other phone's map within 5s |
| **Map** | Open Map screen | Both users' dots, embassies, and reference points shown |
| **BLE** | Turn off Wi-Fi on both phones | May still show other user if BLE advertising is working |

---

## Sync Server API

All endpoints are plain HTTP JSON — no authentication, designed for local network use.

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/publish` | Publish device state `{ room, userId, data }` |
| `GET` | `/peers?room=` | Get all active peers in room |
| `POST` | `/message` | Post a message `{ room, message }` |
| `GET` | `/messages?room=&since=` | Get messages after server timestamp |
| `GET` | `/health` | Health check — returns `{ status: "ok" }` |

Messages use a `serverTimestamp` (server's `Date.now()`) to avoid phone clock skew. Peers expire after 5 minutes. Messages are capped at 200 per room (FIFO).

---

## Encryption

Private messages are end-to-end encrypted using the **TweetNaCl** library:

- **Key type:** Curve25519 asymmetric key pair, generated once on first launch
- **Encryption:** `nacl.box` (XSalsa20-Poly1305)
- **Nonce:** Random 24-byte nonce per message
- **Storage:** Private key in AsyncStorage; public key shared via BLE scan response

> **Demo limitation:** In the current build, public keys are derived from the user ID for demo purposes. Production would require a key exchange handshake or a key server.

---

## Tech Stack

| Technology | Version | Purpose |
|-----------|---------|---------|
| React Native | 0.76 | Mobile app framework |
| Expo | 52 | Build toolchain & managed APIs |
| Kotlin | JVM | Native Android BLE GATT server |
| `react-native-ble-plx` | 3.x | BLE scanning (JS side) |
| `expo-location` | — | GPS with permission handling |
| `react-native-webview` | — | Hosts the Leaflet map HTML |
| Leaflet.js | 1.9 | Interactive map rendering |
| `@react-native-community/netinfo` | — | Live internet connectivity detection |
| `tweetnacl` | 1.x | NaCl crypto (Curve25519 + XSalsa20) |
| `@react-native-async-storage/async-storage` | — | Local persistence |
| React Navigation | 6.x | Tab and stack navigation |
| Node.js (sync-server) | 18+ | Zero-dependency HTTP relay |

---

## Admin Panel

Access from **Settings → Login as Admin**.
Default password: `flycom2026`

- **Add/remove officials** — grant users permission to post in embassy channels
- **Add embassies & consulates** — create named channels with GPS coordinates; these sync to all peers
- Regular users can read embassy channels; only officials can post

---

## Known Limitations & Honest Status

| Feature | Status | Notes |
|---------|--------|-------|
| Cloud sync discovery | ✅ Working | Requires all devices on same Wi-Fi + sync server running |
| Cloud sync chat | ✅ Working | ~4s delivery latency |
| Cloud SOS alerts | ✅ Working | Alert popup on receiving device |
| Embassy sync | ✅ Working | Appears on map and Nearby screen |
| BLE advertising | ⚠️ Partial | Works on most devices; fails silently on some |
| BLE discovery | ⚠️ Partial | Scan finds devices when advertising works |
| BLE chat (GATT write) | ❌ Unreliable | Connection succeeds intermittently; not demo-safe |
| BLE in background | ❌ Not working | Requires a foreground service; not yet implemented |
| E2E encryption | ⚠️ Demo mode | Keys derived from user ID, not exchanged properly |
| iOS support | ❌ Not supported | BLE peripheral mode on iOS needs different setup |
| Drone delivery | 🔮 Placeholder | UI exists; no backend |

---

## Documentation & References

These are the resources that directly shaped how Flycom was built:

**Android BLE**
- [Android BLE Guide — developer.android.com](https://developer.android.com/develop/connectivity/bluetooth/ble/ble-overview)
- [BluetoothGattServer — Android API reference](https://developer.android.com/reference/android/bluetooth/BluetoothGattServer)
- [BLE Advertising — AdvertiseSettings](https://developer.android.com/reference/android/bluetooth/le/AdvertiseSettings)
- [Android 12 Bluetooth permissions](https://developer.android.com/develop/connectivity/bluetooth/bt-permissions)

**react-native-ble-plx**
- [GitHub — Polidea/react-native-ble-plx](https://github.com/dotintent/react-native-ble-plx)
- [BleManager API docs](https://dotintent.github.io/react-native-ble-plx/)

**React Native Native Modules**
- [Native Modules (Android) — React Native docs](https://reactnative.dev/docs/native-modules-android)
- [NativeEventEmitter — React Native docs](https://reactnative.dev/docs/native-modules-android#sending-events-to-javascript)

**Encryption**
- [TweetNaCl-js — GitHub](https://github.com/dchest/tweetnacl-js)
- [NaCl documentation — nacl.cr.yp.to](https://nacl.cr.yp.to/)

**Mapping**
- [Leaflet.js — leafletjs.com](https://leafletjs.com/)
- [OpenStreetMap tile servers](https://wiki.openstreetmap.org/wiki/Tile_servers)
- [react-native-webview — GitHub](https://github.com/react-native-webview/react-native-webview)

**React Native & Expo**
- [React Native docs](https://reactnative.dev/docs/getting-started)
- [Expo docs](https://docs.expo.dev/)
- [expo-location API](https://docs.expo.dev/versions/latest/sdk/location/)
- [@react-native-community/netinfo](https://github.com/react-native-community/react-native-netinfo)
- [React Navigation v6](https://reactnavigation.org/docs/getting-started)
- [@react-native-async-storage/async-storage](https://react-native-async-storage.github.io/async-storage/)

---

## License

This project is open source.

---

**Flycom** — Stay connected, even when the world goes offline.
