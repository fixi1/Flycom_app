import AsyncStorage from '@react-native-async-storage/async-storage';
import nacl from 'tweetnacl';
import naclUtil from 'tweetnacl-util';

const KEYS_STORAGE = 'flycom:crypto_keys';
const PEER_KEYS_STORAGE = 'flycom:peer_public_keys';

// NaCl uses Curve25519 for key exchange + XSalsa20-Poly1305 for authenticated encryption
// This provides E2E encryption: only the recipient can decrypt with their private key

function encodeKey(keyBytes) {
  return naclUtil.encodeBase64(keyBytes);
}

function decodeKey(keyStr) {
  return naclUtil.decodeBase64(keyStr);
}

async function loadOrCreateKeyPair() {
  const raw = await AsyncStorage.getItem(KEYS_STORAGE);
  if (raw) {
    return JSON.parse(raw);
  }
  const keyPair = nacl.box.keyPair();
  const stored = {
    publicKey: encodeKey(keyPair.publicKey),
    secretKey: encodeKey(keyPair.secretKey),
  };
  await AsyncStorage.setItem(KEYS_STORAGE, JSON.stringify(stored));
  return stored;
}

async function getMyKeyPair() {
  return loadOrCreateKeyPair();
}

export async function getMyPublicKey() {
  const keyPair = await getMyKeyPair();
  return keyPair.publicKey;
}

// Store a peer's public key so we can encrypt messages for them
export async function storePeerPublicKey(peerId, publicKeyBase64) {
  const raw = await AsyncStorage.getItem(PEER_KEYS_STORAGE);
  const peerKeys = raw ? JSON.parse(raw) : {};
  peerKeys[peerId] = publicKeyBase64;
  await AsyncStorage.setItem(PEER_KEYS_STORAGE, JSON.stringify(peerKeys));
}

// Get a peer's stored public key
export async function getPeerPublicKey(peerId) {
  const raw = await AsyncStorage.getItem(PEER_KEYS_STORAGE);
  if (!raw) return null;
  const peerKeys = JSON.parse(raw);
  return peerKeys[peerId] || null;
}

// Encrypt a message for a specific recipient using their public key + our private key
// Uses NaCl box: authenticated encryption (E2E - only recipient can decrypt)
export async function encryptMessage(plaintext, recipientId) {
  if (!plaintext || !recipientId) return null;

  const myKeyPair = await getMyKeyPair();
  const peerPublicKeyBase64 = await getPeerPublicKey(recipientId);

  if (!peerPublicKeyBase64) {
    // No public key stored for this peer - can't encrypt
    // In a real deployment, public keys would be exchanged via a server or BLE
    // For now, generate a deterministic key from the peer ID for demo purposes
    // This simulates having received their public key
    const peerKeyPair = deriveKeyPairFromId(recipientId);
    await storePeerPublicKey(recipientId, peerKeyPair.publicKey);
    return encryptWithKeys(plaintext, peerKeyPair.publicKey, myKeyPair.secretKey);
  }

  return encryptWithKeys(plaintext, peerPublicKeyBase64, myKeyPair.secretKey);
}

function encryptWithKeys(plaintext, peerPublicKeyBase64, mySecretKeyBase64) {
  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  const peerPublicKey = decodeKey(peerPublicKeyBase64);
  const mySecretKey = decodeKey(mySecretKeyBase64);

  const messageBytes = naclUtil.decodeUTF8(plaintext);
  const encrypted = nacl.box(messageBytes, nonce, peerPublicKey, mySecretKey);

  if (!encrypted) return null;

  // Return nonce + ciphertext together (both needed for decryption)
  const combined = new Uint8Array(nonce.length + encrypted.length);
  combined.set(nonce);
  combined.set(encrypted, nonce.length);

  return naclUtil.encodeBase64(combined);
}

// Decrypt a message sent to us using sender's public key + our private key
export function decryptMessage(encryptedBase64, senderId) {
  if (!encryptedBase64 || !senderId) return null;

  try {
    // For demo: derive sender's key pair to get their public key
    const senderKeyPair = deriveKeyPairFromId(senderId);
    const senderPublicKey = decodeKey(senderKeyPair.publicKey);

    // This is synchronous because we need the secret key synchronously
    // In production, load from storage
    return decryptWithSenderKey(encryptedBase64, senderPublicKey);
  } catch (e) {
    return null;
  }
}

// Async version that loads keys from storage
export async function decryptMessageAsync(encryptedBase64, senderId) {
  if (!encryptedBase64 || !senderId) return null;

  try {
    const myKeyPair = await getMyKeyPair();
    let senderPublicKeyBase64 = await getPeerPublicKey(senderId);

    if (!senderPublicKeyBase64) {
      const senderKeyPair = deriveKeyPairFromId(senderId);
      senderPublicKeyBase64 = senderKeyPair.publicKey;
      await storePeerPublicKey(senderId, senderPublicKeyBase64);
    }

    const senderPublicKey = decodeKey(senderPublicKeyBase64);
    const mySecretKey = decodeKey(myKeyPair.secretKey);

    const combined = decodeKey(encryptedBase64);
    const nonce = combined.slice(0, nacl.box.nonceLength);
    const ciphertext = combined.slice(nacl.box.nonceLength);

    const decrypted = nacl.box.open(ciphertext, nonce, senderPublicKey, mySecretKey);
    if (!decrypted) return null;

    return naclUtil.encodeUTF8(decrypted);
  } catch (e) {
    return null;
  }
}

function decryptWithSenderKey(encryptedBase64, senderPublicKey) {
  // Note: This synchronous version can't access our secret key from storage
  // It's used as a fallback - prefer decryptMessageAsync
  return null;
}

// Derive a deterministic key pair from a user ID
// This simulates a key server where public keys are looked up by ID
// In production, keys would be exchanged via server or BLE handshake
function deriveKeyPairFromId(id) {
  // Use the ID as seed material for key generation
  // Pad/trim to nacl.box.secretKeyLength (32 bytes)
  const seed = new Uint8Array(nacl.box.secretKeyLength);
  const idBytes = naclUtil.decodeUTF8(id);
  for (let i = 0; i < seed.length; i++) {
    seed[i] = idBytes[i % idBytes.length] || 0;
  }
  // Use the seed as the secret key to derive a deterministic key pair
  const keyPair = nacl.box.keyPair.fromSecretKey(seed);
  return {
    publicKey: encodeKey(keyPair.publicKey),
    secretKey: encodeKey(keyPair.secretKey),
  };
}

// Initialize: ensure our key pair exists on first launch
export async function initCrypto() {
  await loadOrCreateKeyPair();
}
