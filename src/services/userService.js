import AsyncStorage from '@react-native-async-storage/async-storage';

const USER_STORAGE_KEY = 'flycom:user';
const ID_PREFIX = 'FLY-';
const ID_LENGTH = 8;
const CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

function generateReadableId() {
  let suffix = '';
  for (let i = 0; i < ID_LENGTH; i += 1) {
    const randomIndex = Math.floor(Math.random() * CHARSET.length);
    suffix += CHARSET[randomIndex];
  }
  return `${ID_PREFIX}${suffix}`;
}

function createUser() {
  return {
    id: generateReadableId(),
    username: '',
    createdAt: new Date().toISOString(),
  };
}

export async function loadOrCreateUser() {
  const raw = await AsyncStorage.getItem(USER_STORAGE_KEY);
  if (raw) {
    return JSON.parse(raw);
  }

  const user = createUser();
  await AsyncStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
  return user;
}

export async function updateUsername(username) {
  const currentUser = await loadOrCreateUser();
  const updatedUser = { ...currentUser, username: username.trim() };
  await AsyncStorage.setItem(USER_STORAGE_KEY, JSON.stringify(updatedUser));
  return updatedUser;
}
