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

### Why React Native?

The goal was to ship a working Android app fast. React Native lets you write the UI and business logic once in JavaScript while still being able to drop into native Kotlin code when JavaScript isn't powerful enough — which is exactly what happened with BLE. The Expo toolchain on top of that makes building and signing APKs straightforward without needing to know Gradle inside-out. If this were a production product we'd probably go fully native Android, but for a prototype React Native was the right call.

---

## The BLE Story — What We Built and Where It Got Hard

The original plan was for Flycom to work entirely over Bluetooth — no internet required. Two phones near each other should just find each other and start talking. That's still the right goal for an emergency app. We spent significant time building a native BLE stack from scratch to make it happen.

### Why we went native Kotlin for BLE instead of a JS library

We first tried to do everything in JavaScript using `react-native-ble-plx`. The problem is that `react-native-ble-plx` is a **central-only** library — it can scan and connect to peripherals, but it cannot make a phone act as a peripheral (a server that advertises and accepts connections). For peer-to-peer communication, both phones need to be able to advertise themselves. The only way to do that on Android is through the native `BluetoothLeAdvertiser` and `BluetoothGattServer` APIs. So we wrote `FlycomGattServer.kt` in Kotlin and bridged it into React Native via `FlycomBleModule.kt`. The result is a hybrid: native Kotlin handles the server side (advertising + receiving), and `react-native-ble-plx` handles the client side (scanning + connecting to others).

### Why a custom UUID?

We chose a fixed custom 128-bit service UUID (`a1b2c3d4-e5f6-7890-abcd-ef1234567890`) so that scan results can be filtered to only show Flycom devices. Without this, the scanner would return every BLE device in range — headphones, fitness trackers, everything. The UUID acts as the app's Bluetooth fingerprint.

### Why embed the user ID in the advertisement?

When Phone A scans and finds Phone B's advertisement, we need to know *who* Phone B is before making a GATT connection. GATT connections are slow (hundreds of milliseconds) and don't always succeed. By embedding the user ID in the scan response's service data field (up to 20 bytes), Phone A can display Phone B's name immediately on the Nearby screen without needing to connect first. This was inspired by how AirDrop works — name visible before you tap.

### Here's the honest account of what works and what doesn't:

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

- Add a **foreground service** with a persistent notification so BLE advertising and scanning keep running in the background — Android 12+ kills background BLE without this.
- Use **`ScanFilter`** with the explicit service UUID on the scanner side to get more consistent scan results and reduce OS-level deduplication.
- Implement proper **MTU negotiation** — right now messages are capped at 20 bytes in the scan response. For chat messages we need at least 512 bytes, which requires negotiating a larger ATT MTU after connecting.
- **Retry logic on GATT connect** — `connectGatt()` is notoriously unreliable on first attempt. Real BLE apps retry 2-3 times with exponential backoff.
- Test on **5+ device models** to find the common failure modes per manufacturer.
- Eventually **rewrite the BLE layer as a pure native module** so both scanning and the GATT server are in the same Kotlin class, removing the dependency on `react-native-ble-plx` entirely.

---

## How the App Actually Works (Cloud Sync Mode)

### Why we switched to a relay server

After hitting the BLE reliability wall — GATT connections failing on some device pairs, advertising not working on some phones, background restrictions killing everything — we needed something that would actually work for a demo. The relay server approach was the pragmatic pivot: keep all the BLE code running (it still helps when it works), but add a Wi-Fi sync path that's guaranteed to deliver messages.

### Why a custom server instead of Firebase/Supabase?

We wanted zero dependencies and full control. Firebase would have required an account, API keys, SDK setup, and a build-time config file. A raw Node.js HTTP server needs nothing — `node index.js` and it's running. It's also trivially deployable anywhere: Glitch, Render, a Raspberry Pi, or a phone running Termux. For an emergency tool, the fewer external dependencies the better.

### Why polling instead of WebSockets?

WebSockets would give true real-time push — the server could notify clients instantly when a message arrives. But WebSockets require keeping a persistent connection open, which Android aggressively kills in the background. HTTP polling every 4 seconds is less elegant but more reliable on mobile: each request is independent, so a dropped connection just means the next poll picks up where it left off. 4 seconds is fast enough to feel responsive in a demo.

### Why use the server's clock for message timestamps?

This was a bug we actually shipped and then fixed. The original implementation used `Date.now()` on the phone to set the `since` parameter when fetching messages. If Phone B's clock was even 2 seconds ahead of the server's clock, it would ask for messages newer than `serverTime + 2000` — and the server would return nothing because the message was stored at `serverTime`. The fix: the server returns its own `Date.now()` in every response, and the client uses that as the next `since` value. Phone clocks become irrelevant.

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

### Why NaCl / TweetNaCl?

We needed asymmetric encryption so messages can be encrypted for a specific recipient without ever sharing a password. NaCl (Networking and Cryptography library) by Daniel J. Bernstein is the gold standard for this — it uses Curve25519 for key exchange and XSalsa20-Poly1305 for authenticated encryption. TweetNaCl is a pure JavaScript port that works in React Native without any native compilation. It's small, audited, and the API is hard to misuse (unlike raw AES or RSA).

### How it works

- **Key type:** Curve25519 asymmetric key pair, generated once on first launch
- **Encryption:** `nacl.box` (XSalsa20-Poly1305) — combines Diffie-Hellman key exchange with authenticated stream encryption in one call
- **Nonce:** Random 24-byte nonce per message — never reused
- **Storage:** Private key in AsyncStorage; public key shared via BLE scan response or key server (future)

> **Demo limitation:** In the current build, public keys are derived deterministically from the user ID so two phones can encrypt for each other without a handshake. This is not secure for production — it means anyone who knows your user ID can compute your "public key". A real deployment needs a key exchange step (either over BLE on first connection, or via a central key server).

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

## About

Flycom is a project by the **Flycom team**:

- **Alexa Teodor** — Development (React Native, Kotlin BLE, cloud sync, architecture)
- **Lozneanu Andi-Fineas** — Design & UI/UX

The project started as an exploration of peer-to-peer emergency communication — could two phones find each other and exchange messages with no internet, no infrastructure, nothing but Bluetooth? That question drove the BLE work. When time constraints made fully reliable BLE impractical for a demo, the cloud sync layer was added as a bridge — not as a replacement for the vision, but as proof that the rest of the app (discovery, chat, SOS, map, embassies) works correctly end-to-end.

The BLE foundation is still there, still running on every launch, and still the long-term goal.

---

**Flycom** — Stay connected, even when the world goes offline.
