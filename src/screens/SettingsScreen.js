import { Text, TouchableOpacity, View, Switch, Alert, ScrollView, TextInput, StyleSheet } from 'react-native';
import { useState, useEffect } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useAppContext } from '../context/AppContext';
import {
  loadSettings, updateSetting,
  saveMessages, saveReferencePoints, saveSOSAlerts, saveKnownUsers,
  addOfficial, removeOfficial as removeOfficialStorage,
  addEmbassy, removeEmbassy as removeEmbassyStorage
} from '../storage';
import { getSyncServer, setSyncServer, getSyncRoom, setSyncRoom, testConnection, restartSync } from '../services/cloudSyncService';
import BottomNav from '../components/BottomNav';

const ADMIN_PASSWORD = 'flycom2026';

export default function SettingsScreen({ navigation }) {
  const { user, setUsername, admin, setAdmin, officials, refreshOfficials, embassies, refreshEmbassies, currentLocation, isOnline, hasInternet, connectionType, nearbyUsers, nearbyError } = useAppContext();
  const { styles, colors, isDark, toggleTheme } = useTheme();
  const [settings, setSettings] = useState({
    notificationsEnabled: true,
    locationSharing: true,
    darkMode: true,
    accessibilityMode: 'Standard',
    announcements: 'All',
  });

  const [adminPasswordInput, setAdminPasswordInput] = useState('');
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [usernameInput, setUsernameInput] = useState('');
  const [isEditingUsername, setIsEditingUsername] = useState(false);
  const [newOfficialId, setNewOfficialId] = useState('');
  const [newOfficialRole, setNewOfficialRole] = useState('embassy');
  const [newOfficialLocation, setNewOfficialLocation] = useState('');
  const [newEmbassyName, setNewEmbassyName] = useState('');
  const [newEmbassyType, setNewEmbassyType] = useState('embassy');
  const [newEmbassyAddress, setNewEmbassyAddress] = useState('');
  const [showAddEmbassy, setShowAddEmbassy] = useState(false);
  const [showAddOfficial, setShowAddOfficial] = useState(false);
  const [syncServerInput, setSyncServerInput] = useState('');
  const [syncRoomInput, setSyncRoomInput] = useState('');
  const [syncStatus, setSyncStatus] = useState('');

  const accessibilityOptions = ['Standard', 'Large Text', 'High Contrast'];
  const announcementOptions = ['All', 'Critical Only', 'None'];

  useEffect(() => {
    loadSettings().then(setSettings);
    getSyncServer().then(setSyncServerInput);
    getSyncRoom().then(setSyncRoomInput);
  }, []);

  useEffect(() => {
    if (user?.username) setUsernameInput(user.username);
  }, [user]);

  const toggleSetting = async (key) => {
    const newValue = !settings[key];
    const updated = await updateSetting(key, newValue);
    setSettings(updated);
    if (key === 'locationSharing') {
      Alert.alert(newValue ? 'Location Sharing Enabled' : 'Location Sharing Disabled', newValue ? 'Your location will be visible to other mesh users.' : 'Your location is now hidden from other users.');
    }
    if (key === 'notificationsEnabled') {
      Alert.alert(newValue ? 'Notifications Enabled' : 'Notifications Disabled', newValue ? 'You will receive message alerts.' : 'You will not receive notifications.');
    }
    if (key === 'darkMode') {
      toggleTheme();
    }
  };

  const cycleAccessibility = async () => {
    const currentIndex = accessibilityOptions.indexOf(settings.accessibilityMode);
    const nextIndex = (currentIndex + 1) % accessibilityOptions.length;
    const updated = await updateSetting('accessibilityMode', accessibilityOptions[nextIndex]);
    setSettings(updated);
  };

  const cycleAnnouncements = async () => {
    const currentIndex = announcementOptions.indexOf(settings.announcements);
    const nextIndex = (currentIndex + 1) % announcementOptions.length;
    const updated = await updateSetting('announcements', announcementOptions[nextIndex]);
    setSettings(updated);
  };

  const handleSaveUsername = async () => {
    if (!usernameInput.trim()) {
      Alert.alert('Error', 'Username cannot be empty.');
      return;
    }
    await setUsername(usernameInput.trim());
    setIsEditingUsername(false);
    Alert.alert('Username Updated', `Your username is now "${usernameInput.trim()}"`);
  };

  const handleClearData = () => {
    Alert.alert('Clear All Data?', 'This will delete all messages, reference points, SOS alerts, and known users. Your user ID will be kept.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'CLEAR ALL',
        style: 'destructive',
        onPress: async () => {
          try {
            await saveMessages([]);
            await saveReferencePoints([]);
            await saveSOSAlerts([]);
            await saveKnownUsers([]);
            Alert.alert('Data Cleared', 'All messages, reference points, SOS alerts, and known users have been deleted.');
          } catch (e) {
            Alert.alert('Error', 'Failed to clear some data.');
          }
        },
      },
    ]);
  };

  const handleAdminLogin = () => {
    if (adminPasswordInput === ADMIN_PASSWORD) {
      setAdmin(true);
      setShowAdminLogin(false);
      setAdminPasswordInput('');
      Alert.alert('Admin Access', 'You now have admin privileges.');
    } else {
      Alert.alert('Access Denied', 'Incorrect password.');
    }
  };

  const handleAddOfficial = async () => {
    if (!newOfficialId.trim()) { Alert.alert('Error', 'Please enter a user ID.'); return; }
    await addOfficial({ userId: newOfficialId.trim(), role: newOfficialRole, locationName: newOfficialLocation.trim() || 'Unassigned' });
    await refreshOfficials();
    Alert.alert('Official Added', `${newOfficialId} is now assigned to ${newOfficialRole}.`);
    setNewOfficialId('');
    setNewOfficialLocation('');
    setShowAddOfficial(false);
  };

  const handleRemoveOfficial = async (userId) => {
    Alert.alert('Remove Official?', `Remove ${userId}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => { await removeOfficialStorage(userId); await refreshOfficials(); } },
    ]);
  };

  const handleAddEmbassy = async () => {
    if (!newEmbassyName.trim()) { Alert.alert('Error', 'Please enter a name.'); return; }
    if (!currentLocation) { Alert.alert('Error', 'Location is needed. Please enable location services.'); return; }
    await addEmbassy({ name: newEmbassyName.trim(), type: newEmbassyType, address: newEmbassyAddress.trim(), latitude: currentLocation.latitude, longitude: currentLocation.longitude });
    await refreshEmbassies();
    Alert.alert('Added', `${newEmbassyName} has been added as a ${newEmbassyType} at your current location.`);
    setNewEmbassyName('');
    setNewEmbassyAddress('');
    setShowAddEmbassy(false);
  };

  const handleRemoveEmbassy = async (id) => {
    Alert.alert('Remove Location?', 'This embassy/consulate will be deleted.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => { await removeEmbassyStorage(id); await refreshEmbassies(); } },
    ]);
  };

  const renderToggle = (icon, title, subtitle, value, onToggle) => (
    <View style={styles.listItem}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
          <Ionicons name={icon} size={20} color={colors.primaryBlueLight} />
          <View style={{ marginLeft: 12, flex: 1 }}>
            <Text style={styles.listItemTitle}>{title}</Text>
            <Text style={styles.listItemSub}>{subtitle}</Text>
          </View>
        </View>
        <Switch value={value} onValueChange={onToggle} trackColor={{ false: colors.surfaceLight, true: colors.primaryBlue }} thumbColor={colors.white} />
      </View>
    </View>
  );

  const renderDropdown = (icon, title, value, onPress) => (
    <TouchableOpacity style={styles.listItem} onPress={onPress} activeOpacity={0.7}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
          <Ionicons name={icon} size={20} color={colors.primaryBlueLight} />
          <View style={{ marginLeft: 12, flex: 1 }}>
            <Text style={styles.listItemTitle}>{title}</Text>
            <Text style={styles.listItemSub}>{value}</Text>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.gray} />
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.topBar}>
        <View>
          <Text style={styles.topBarTitle}>Settings</Text>
          <Text style={styles.topBarSubtitle}>Configuration</Text>
        </View>
        {admin && (
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Ionicons name="shield-checkmark" size={16} color={colors.green} />
            <Text style={[styles.topBarSubtitle, { color: colors.green, marginLeft: 4 }]}>Admin</Text>
          </View>
        )}
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
        {/* Identity */}
        <Text style={styles.sectionHeader}>Identity</Text>
        <View style={styles.listItem}>
          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
            <Ionicons name="person-circle" size={20} color={colors.primaryBlueLight} />
            <View style={{ marginLeft: 12, flex: 1 }}>
              {isEditingUsername ? (
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <TextInput
                    style={[styles.input, { flex: 1, marginVertical: 0 }]}
                    placeholder="Enter username"
                    placeholderTextColor={colors.grayDark}
                    value={usernameInput}
                    onChangeText={setUsernameInput}
                    maxLength={30}
                    autoFocus
                    returnKeyType="done"
                    onSubmitEditing={handleSaveUsername}
                  />
                  <TouchableOpacity onPress={handleSaveUsername} style={{ marginLeft: 8 }}>
                    <Ionicons name="checkmark-circle" size={24} color={colors.green} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => { setIsEditingUsername(false); setUsernameInput(user?.username || ''); }} style={{ marginLeft: 4 }}>
                    <Ionicons name="close-circle" size={24} color={colors.red} />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity onPress={() => setIsEditingUsername(true)} activeOpacity={0.7}>
                  <Text style={styles.listItemTitle}>{user?.username || 'Tap to set username'}</Text>
                </TouchableOpacity>
              )}
              <Text style={styles.listItemSub}>{user?.id || 'Loading...'}</Text>
            </View>
          </View>
        </View>

        {/* Admin */}
        <Text style={styles.sectionHeader}>Admin</Text>
        {admin ? (
          <>
            <View style={[styles.listItem, { borderLeftWidth: 3, borderLeftColor: colors.green }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                <Ionicons name="shield-checkmark" size={20} color={colors.green} />
                <View style={{ marginLeft: 12, flex: 1 }}>
                  <Text style={styles.listItemTitle}>Admin Mode Active</Text>
                  <Text style={styles.listItemSub}>Manage officials & embassies</Text>
                </View>
                <TouchableOpacity onPress={() => setAdmin(false)} activeOpacity={0.7}>
                  <Text style={{ color: colors.red, fontSize: 13, fontWeight: '600' }}>Logout</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Officials */}
            <Text style={styles.sectionHeader}>Officials</Text>
            <TouchableOpacity style={styles.button} onPress={() => setShowAddOfficial(!showAddOfficial)} activeOpacity={0.7}>
              <Ionicons name="person-add" size={16} color={colors.white} />
              <Text style={[styles.buttonText, { marginLeft: 6 }]}>Add Official</Text>
            </TouchableOpacity>
            {showAddOfficial && (
              <View style={localStyles.adminForm}>
                <TextInput style={styles.input} placeholder="User ID (e.g. FLY-8A3F)" placeholderTextColor={colors.grayDark} value={newOfficialId} onChangeText={setNewOfficialId} />
                <View style={{ flexDirection: 'row', marginVertical: 8 }}>
                  <TouchableOpacity style={[localStyles.roleButton, newOfficialRole === 'embassy' && localStyles.roleButtonActive]} onPress={() => setNewOfficialRole('embassy')}>
                    <Text style={newOfficialRole === 'embassy' ? localStyles.roleButtonTextActive : localStyles.roleButtonText}>Embassy</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[localStyles.roleButton, newOfficialRole === 'consulate' && localStyles.roleButtonActive]} onPress={() => setNewOfficialRole('consulate')}>
                    <Text style={newOfficialRole === 'consulate' ? localStyles.roleButtonTextActive : localStyles.roleButtonText}>Consulate</Text>
                  </TouchableOpacity>
                </View>
                <TextInput style={styles.input} placeholder="Location name" placeholderTextColor={colors.grayDark} value={newOfficialLocation} onChangeText={setNewOfficialLocation} />
                <TouchableOpacity style={styles.button} onPress={handleAddOfficial} activeOpacity={0.7}>
                  <Text style={styles.buttonText}>Confirm</Text>
                </TouchableOpacity>
              </View>
            )}
            {officials.map((official) => (
              <View key={official.userId} style={styles.listItem}>
                <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                  <Ionicons name="person" size={18} color={colors.primaryBlueLight} />
                  <View style={{ marginLeft: 10, flex: 1 }}>
                    <Text style={styles.listItemTitle}>{official.userId}</Text>
                    <Text style={styles.listItemSub}>{official.role} - {official.locationName}</Text>
                  </View>
                  <TouchableOpacity onPress={() => handleRemoveOfficial(official.userId)} activeOpacity={0.7}>
                    <Ionicons name="trash-outline" size={18} color={colors.red} />
                  </TouchableOpacity>
                </View>
              </View>
            ))}

            {/* Embassies & Consulates */}
            <Text style={styles.sectionHeader}>Embassies & Consulates</Text>
            <TouchableOpacity style={styles.button} onPress={() => setShowAddEmbassy(!showAddEmbassy)} activeOpacity={0.7}>
              <Ionicons name="add" size={16} color={colors.white} />
              <Text style={[styles.buttonText, { marginLeft: 6 }]}>Add Location</Text>
            </TouchableOpacity>
            {showAddEmbassy && (
              <View style={localStyles.adminForm}>
                <TextInput style={styles.input} placeholder="Name (e.g. US Embassy)" placeholderTextColor={colors.grayDark} value={newEmbassyName} onChangeText={setNewEmbassyName} />
                <View style={{ flexDirection: 'row', marginVertical: 8 }}>
                  <TouchableOpacity style={[localStyles.roleButton, newEmbassyType === 'embassy' && localStyles.roleButtonActive]} onPress={() => setNewEmbassyType('embassy')}>
                    <Text style={newEmbassyType === 'embassy' ? localStyles.roleButtonTextActive : localStyles.roleButtonText}>Embassy</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[localStyles.roleButton, newEmbassyType === 'consulate' && localStyles.roleButtonActive]} onPress={() => setNewEmbassyType('consulate')}>
                    <Text style={newEmbassyType === 'consulate' ? localStyles.roleButtonTextActive : localStyles.roleButtonText}>Consulate</Text>
                  </TouchableOpacity>
                </View>
                <TextInput style={styles.input} placeholder="Address" placeholderTextColor={colors.grayDark} value={newEmbassyAddress} onChangeText={setNewEmbassyAddress} />
                <TouchableOpacity style={styles.button} onPress={handleAddEmbassy} activeOpacity={0.7}>
                  <Text style={styles.buttonText}>Confirm</Text>
                </TouchableOpacity>
              </View>
            )}
            {embassies.map((embassy) => (
              <View key={embassy.id} style={styles.listItem}>
                <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                  <Ionicons name={embassy.type === 'embassy' ? 'flag' : 'business'} size={18} color={colors.primaryBlueLight} />
                  <View style={{ marginLeft: 10, flex: 1 }}>
                    <Text style={styles.listItemTitle}>{embassy.name}</Text>
                    <Text style={styles.listItemSub}>{embassy.type} - {embassy.address || 'No address'}</Text>
                  </View>
                  <TouchableOpacity onPress={() => handleRemoveEmbassy(embassy.id)} activeOpacity={0.7}>
                    <Ionicons name="trash-outline" size={18} color={colors.red} />
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </>
        ) : (
          <>
            <TouchableOpacity style={styles.listItem} onPress={() => setShowAdminLogin(true)} activeOpacity={0.7}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons name="lock-closed" size={20} color={colors.gray} />
                <View style={{ marginLeft: 12 }}>
                  <Text style={styles.listItemTitle}>Login as Admin</Text>
                  <Text style={styles.listItemSub}>Manage officials and embassies</Text>
                </View>
              </View>
            </TouchableOpacity>
            {showAdminLogin && (
              <View style={localStyles.adminForm}>
                <TextInput style={styles.input} placeholder="Admin password" placeholderTextColor={colors.grayDark} secureTextEntry value={adminPasswordInput} onChangeText={setAdminPasswordInput} />
                <TouchableOpacity style={styles.button} onPress={handleAdminLogin} activeOpacity={0.7}>
                  <Text style={styles.buttonText}>Login</Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        )}

        {/* Preferences */}
        <Text style={styles.sectionHeader}>Preferences</Text>
        {renderToggle('notifications', 'Notifications', 'Enable push notifications', settings.notificationsEnabled, () => toggleSetting('notificationsEnabled'))}
        {renderToggle('location', 'Location Sharing', 'Share your location with others', settings.locationSharing, () => toggleSetting('locationSharing'))}
        {renderToggle('moon', 'Dark Mode', isDark ? 'Dark theme active' : 'Light theme active', isDark, () => toggleSetting('darkMode'))}
        {renderDropdown('eye', 'Accessibility', settings.accessibilityMode, cycleAccessibility)}
        {renderDropdown('megaphone', 'Announcements', settings.announcements, cycleAnnouncements)}

        {/* Network */}
        <Text style={styles.sectionHeader}>Network</Text>
        <View style={styles.infoCard}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
            <Ionicons name={hasInternet ? 'wifi' : 'bluetooth'} size={20} color={colors.white} />
            <Text style={[styles.infoCardTitle, { marginLeft: 8, marginBottom: 0 }]}>{hasInternet ? 'Internet + BLE' : 'BLE Mesh Network'}</Text>
          </View>
          <View style={styles.infoCardRow}>
            <Text style={styles.infoCardLabel}>Connection</Text>
            <Text style={styles.infoCardValue}>{connectionType}</Text>
          </View>
          <View style={styles.infoCardRow}>
            <Text style={styles.infoCardLabel}>Internet</Text>
            <Text style={[styles.infoCardValue, { color: hasInternet ? colors.green : colors.red }]}>{hasInternet ? 'Connected' : 'Offline'}</Text>
          </View>
          <View style={styles.infoCardRow}>
            <Text style={styles.infoCardLabel}>BLE Scan</Text>
            <Text style={styles.infoCardValue}>{nearbyError ? 'Error' : nearbyUsers.length > 0 ? `${nearbyUsers.length} device(s)` : 'No devices'}</Text>
          </View>
          <View style={styles.infoCardRow}>
            <Text style={styles.infoCardLabel}>BLE Range</Text>
            <Text style={styles.infoCardValue}>~50m</Text>
          </View>
          <View style={styles.infoCardRow}>
            <Text style={styles.infoCardLabel}>Discovery Range</Text>
            <Text style={styles.infoCardValue}>{hasInternet ? '100km (Internet)' : '50m (BLE only)'}</Text>
          </View>
        </View>

        {/* Network Sync */}
        <Text style={styles.sectionHeader}>Network Sync</Text>
        <View style={localStyles.adminForm}>
          <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '600', marginBottom: 4 }}>Sync Server URL</Text>
          <TextInput
            style={styles.input}
            placeholder="http://192.168.1.100:3000"
            placeholderTextColor={colors.grayDark}
            value={syncServerInput}
            onChangeText={setSyncServerInput}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '600', marginBottom: 4, marginTop: 8 }}>Room Code (same on both phones)</Text>
          <TextInput
            style={styles.input}
            placeholder="flycom-demo"
            placeholderTextColor={colors.grayDark}
            value={syncRoomInput}
            onChangeText={setSyncRoomInput}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TouchableOpacity
            style={styles.button}
            onPress={async () => {
              await setSyncServer(syncServerInput.trim());
              await setSyncRoom(syncRoomInput.trim());
              setSyncStatus('Saved! Testing...');
              const ok = await testConnection();
              setSyncStatus(ok ? 'Connected!' : 'Cannot reach server');
              if (ok) {
                restartSync();
                Alert.alert('Sync Connected', 'Sync restarted! Both phones can now find each other.');
              } else {
                Alert.alert('Sync Failed', 'Cannot reach server. Check the IP address and make sure the server is running.\n\nRun: node sync-server/index.js');
              }
            }}
            activeOpacity={0.7}
          >
            <Ionicons name="cloud-upload" size={16} color={colors.white} />
            <Text style={[styles.buttonText, { marginLeft: 6 }]}>Save & Test Connection</Text>
          </TouchableOpacity>
          {!!syncStatus && <Text style={{ color: syncStatus.includes('Connected') ? colors.green : colors.orange, fontSize: 12, marginTop: 6, textAlign: 'center' }}>{syncStatus}</Text>}
          <Text style={{ color: colors.gray, fontSize: 11, marginTop: 8 }}>
            Both phones must use the same Room Code and Server URL. Run the sync server on your laptop: node sync-server/index.js
          </Text>
        </View>

        {/* Danger Zone */}
        <Text style={styles.sectionHeader}>Danger Zone</Text>
        <TouchableOpacity style={styles.buttonDanger} onPress={handleClearData} activeOpacity={0.7}>
          <Ionicons name="trash-outline" size={18} color={colors.white} />
          <Text style={[styles.buttonDangerText, { marginLeft: 8 }]}>Clear All Data</Text>
        </TouchableOpacity>
      </ScrollView>

      <BottomNav navigation={navigation} activeScreen="Settings" />
    </SafeAreaView>
  );
}

const localStyles = StyleSheet.create({
  adminForm: {
    backgroundColor: '#3A3A3A',
    borderRadius: 10,
    padding: 12,
    marginVertical: 8,
    gap: 8,
  },
  roleButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 6,
    backgroundColor: '#4A4A4A',
    marginHorizontal: 4,
  },
  roleButtonActive: {
    backgroundColor: '#2626A2',
  },
  roleButtonText: {
    color: '#9CA3AF',
    fontSize: 13,
    fontWeight: '600',
  },
  roleButtonTextActive: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
});
