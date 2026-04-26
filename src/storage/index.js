import AsyncStorage from '@react-native-async-storage/async-storage';

const KEYS = {
  MESSAGES: 'flycom:messages',
  REFERENCE_POINTS: 'flycom:referencePoints',
  SOS_ALERTS: 'flycom:sosAlerts',
  SETTINGS: 'flycom:settings',
  USERS: 'flycom:users',
  ADMIN: 'flycom:admin',
  OFFICIALS: 'flycom:officials',
  EMBASSIES: 'flycom:embassies',
  KNOWN_USERS: 'flycom:knownUsers',
};

export async function saveMessages(messages) {
  await AsyncStorage.setItem(KEYS.MESSAGES, JSON.stringify(messages));
}

export async function loadMessages() {
  const raw = await AsyncStorage.getItem(KEYS.MESSAGES);
  return raw ? JSON.parse(raw) : [];
}

export async function addMessage(message) {
  const messages = await loadMessages();
  messages.push({ ...message, id: Date.now().toString(), timestamp: new Date().toISOString() });
  await saveMessages(messages);
  return message;
}

export async function saveReferencePoints(points) {
  await AsyncStorage.setItem(KEYS.REFERENCE_POINTS, JSON.stringify(points));
}

export async function loadReferencePoints() {
  const raw = await AsyncStorage.getItem(KEYS.REFERENCE_POINTS);
  return raw ? JSON.parse(raw) : [];
}

export async function addReferencePoint(point) {
  const points = await loadReferencePoints();
  points.push({ ...point, id: Date.now().toString(), timestamp: new Date().toISOString() });
  await saveReferencePoints(points);
  return point;
}

export async function removeReferencePoint(pointId) {
  const points = await loadReferencePoints();
  const filtered = points.filter(p => p.id !== pointId);
  await saveReferencePoints(filtered);
  return filtered;
}

export async function saveSOSAlerts(alerts) {
  await AsyncStorage.setItem(KEYS.SOS_ALERTS, JSON.stringify(alerts));
}

export async function loadSOSAlerts() {
  const raw = await AsyncStorage.getItem(KEYS.SOS_ALERTS);
  return raw ? JSON.parse(raw) : [];
}

export async function addSOSAlert(alert) {
  const alerts = await loadSOSAlerts();
  alerts.push({ ...alert, id: Date.now().toString(), timestamp: new Date().toISOString() });
  await saveSOSAlerts(alerts);
  return alert;
}

export async function saveSettings(settings) {
  await AsyncStorage.setItem(KEYS.SETTINGS, JSON.stringify(settings));
}

export async function loadSettings() {
  const raw = await AsyncStorage.getItem(KEYS.SETTINGS);
  return raw ? JSON.parse(raw) : {
    notificationsEnabled: true,
    locationSharing: true,
    darkMode: true,
    accessibilityMode: 'Standard',
    announcements: 'All',
  };
}

export async function updateSetting(key, value) {
  const settings = await loadSettings();
  settings[key] = value;
  await saveSettings(settings);
  return settings;
}

export async function loadUsers() {
  const raw = await AsyncStorage.getItem(KEYS.USERS);
  return raw ? JSON.parse(raw) : [];
}

export async function saveUsers(users) {
  await AsyncStorage.setItem(KEYS.USERS, JSON.stringify(users));
}

// Admin
export async function isAdmin() {
  const raw = await AsyncStorage.getItem(KEYS.ADMIN);
  return raw === 'true';
}

export async function setAdmin(value) {
  await AsyncStorage.setItem(KEYS.ADMIN, value ? 'true' : 'false');
}

// Officials - users assigned to embassies/consulates
export async function loadOfficials() {
  const raw = await AsyncStorage.getItem(KEYS.OFFICIALS);
  return raw ? JSON.parse(raw) : [];
}

export async function saveOfficials(officials) {
  await AsyncStorage.setItem(KEYS.OFFICIALS, JSON.stringify(officials));
}

export async function addOfficial({ userId, role, locationName }) {
  const officials = await loadOfficials();
  const existing = officials.findIndex(o => o.userId === userId);
  if (existing >= 0) {
    officials[existing] = { userId, role, locationName, updatedAt: new Date().toISOString() };
  } else {
    officials.push({ userId, role, locationName, updatedAt: new Date().toISOString() });
  }
  await saveOfficials(officials);
  return officials;
}

export async function removeOfficial(userId) {
  const officials = await loadOfficials();
  const filtered = officials.filter(o => o.userId !== userId);
  await saveOfficials(filtered);
  return filtered;
}

// Embassies & Consulates with real coordinates
export async function loadEmbassies() {
  const raw = await AsyncStorage.getItem(KEYS.EMBASSIES);
  if (raw) return JSON.parse(raw);
  return [];
}

export async function saveEmbassies(embassies) {
  await AsyncStorage.setItem(KEYS.EMBASSIES, JSON.stringify(embassies));
}

export async function addEmbassy(embassy) {
  const embassies = await loadEmbassies();
  embassies.push({ ...embassy, id: Date.now().toString() });
  await saveEmbassies(embassies);
  return embassies;
}

export async function removeEmbassy(id) {
  const embassies = await loadEmbassies();
  const filtered = embassies.filter(e => e.id !== id);
  await saveEmbassies(filtered);
  return filtered;
}

// Known Users - users we've interacted with (for search)
export async function loadKnownUsers() {
  const raw = await AsyncStorage.getItem(KEYS.KNOWN_USERS);
  return raw ? JSON.parse(raw) : [];
}

export async function saveKnownUsers(users) {
  await AsyncStorage.setItem(KEYS.KNOWN_USERS, JSON.stringify(users));
}

export async function saveKnownUser(user) {
  const users = await loadKnownUsers();
  const existing = users.findIndex(u => u.id === user.id);
  if (existing >= 0) {
    users[existing] = { ...users[existing], ...user, updatedAt: new Date().toISOString() };
  } else {
    users.push({ ...user, updatedAt: new Date().toISOString() });
  }
  await saveKnownUsers(users);
  return users;
}
