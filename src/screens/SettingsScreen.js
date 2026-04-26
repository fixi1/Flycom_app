import { Text, TouchableOpacity, View, Switch, Alert, ScrollView, TextInput, StyleSheet } from 'react-native';
import { useState, useEffect } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { commonStyles } from '../styles/commonStyles';
import { COLORS } from '../styles/colors';
import { useAppContext } from '../context/AppContext';
import {
  loadSettings, updateSetting,
  saveMessages, saveReferencePoints, saveSOSAlerts, saveKnownUsers,
  addOfficial, removeOfficial as removeOfficialStorage,
  addEmbassy, removeEmbassy as removeEmbassyStorage
} from '../storage';
import BottomNav from '../components/BottomNav';

const ADMIN_PASSWORD = 'flycom2024';

export default function SettingsScreen({ navigation }) {
  const { user, setUsername, admin, setAdmin, officials, refreshOfficials, embassies, refreshEmbassies, currentLocation, isOnline, hasInternet, connectionType, nearbyUsers, nearbyError } = useAppContext();
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

  const accessibilityOptions = ['Standard', 'Large Text', 'High Contrast'];
  const announcementOptions = ['All', 'Critical Only', 'None'];

  useEffect(() => {
    loadSettings().then(setSettings);
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
      Alert.alert('Theme', 'Dark mode is the default theme in this version.');
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
    <View style={commonStyles.listItem}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
          <Ionicons name={icon} size={20} color={COLORS.primaryBlueLight} />
          <View style={{ marginLeft: 12, flex: 1 }}>
            <Text style={commonStyles.listItemTitle}>{title}</Text>
            <Text style={commonStyles.listItemSub}>{subtitle}</Text>
          </View>
        </View>
        <Switch value={value} onValueChange={onToggle} trackColor={{ false: COLORS.surfaceLight, true: COLORS.primaryBlue }} thumbColor={COLORS.white} />
      </View>
    </View>
  );

  const renderDropdown = (icon, title, value, onPress) => (
    <TouchableOpacity style={commonStyles.listItem} onPress={onPress} activeOpacity={0.7}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
          <Ionicons name={icon} size={20} color={COLORS.primaryBlueLight} />
          <View style={{ marginLeft: 12, flex: 1 }}>
            <Text style={commonStyles.listItemTitle}>{title}</Text>
            <Text style={commonStyles.listItemSub}>{value}</Text>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={18} color={COLORS.gray} />
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={commonStyles.screen} edges={['top']}>
      <View style={commonStyles.topBar}>
        <View>
          <Text style={commonStyles.topBarTitle}>Settings</Text>
          <Text style={commonStyles.topBarSubtitle}>Configuration</Text>
        </View>
        {admin && (
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Ionicons name="shield-checkmark" size={16} color={COLORS.green} />
            <Text style={[commonStyles.topBarSubtitle, { color: COLORS.green, marginLeft: 4 }]}>Admin</Text>
          </View>
        )}
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
        {/* Identity */}
        <Text style={commonStyles.sectionHeader}>Identity</Text>
        <View style={commonStyles.listItem}>
          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
            <Ionicons name="person-circle" size={20} color={COLORS.primaryBlueLight} />
            <View style={{ marginLeft: 12, flex: 1 }}>
              {isEditingUsername ? (
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <TextInput
                    style={[commonStyles.input, { flex: 1, marginVertical: 0 }]}
                    placeholder="Enter username"
                    placeholderTextColor={COLORS.grayDark}
                    value={usernameInput}
                    onChangeText={setUsernameInput}
                    maxLength={30}
                    autoFocus
                    returnKeyType="done"
                    onSubmitEditing={handleSaveUsername}
                  />
                  <TouchableOpacity onPress={handleSaveUsername} style={{ marginLeft: 8 }}>
                    <Ionicons name="checkmark-circle" size={24} color={COLORS.green} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => { setIsEditingUsername(false); setUsernameInput(user?.username || ''); }} style={{ marginLeft: 4 }}>
                    <Ionicons name="close-circle" size={24} color={COLORS.red} />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity onPress={() => setIsEditingUsername(true)} activeOpacity={0.7}>
                  <Text style={commonStyles.listItemTitle}>{user?.username || 'Tap to set username'}</Text>
                </TouchableOpacity>
              )}
              <Text style={commonStyles.listItemSub}>{user?.id || 'Loading...'}</Text>
            </View>
          </View>
        </View>

        {/* Admin */}
        <Text style={commonStyles.sectionHeader}>Admin</Text>
        {admin ? (
          <>
            <View style={[commonStyles.listItem, { borderLeftWidth: 3, borderLeftColor: COLORS.green }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                <Ionicons name="shield-checkmark" size={20} color={COLORS.green} />
                <View style={{ marginLeft: 12, flex: 1 }}>
                  <Text style={commonStyles.listItemTitle}>Admin Mode Active</Text>
                  <Text style={commonStyles.listItemSub}>Manage officials & embassies</Text>
                </View>
                <TouchableOpacity onPress={() => setAdmin(false)} activeOpacity={0.7}>
                  <Text style={{ color: COLORS.red, fontSize: 13, fontWeight: '600' }}>Logout</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Officials */}
            <Text style={commonStyles.sectionHeader}>Officials</Text>
            <TouchableOpacity style={commonStyles.button} onPress={() => setShowAddOfficial(!showAddOfficial)} activeOpacity={0.7}>
              <Ionicons name="person-add" size={16} color={COLORS.white} />
              <Text style={[commonStyles.buttonText, { marginLeft: 6 }]}>Add Official</Text>
            </TouchableOpacity>
            {showAddOfficial && (
              <View style={styles.adminForm}>
                <TextInput style={commonStyles.input} placeholder="User ID (e.g. FLY-8A3F)" placeholderTextColor={COLORS.grayDark} value={newOfficialId} onChangeText={setNewOfficialId} />
                <View style={{ flexDirection: 'row', marginVertical: 8 }}>
                  <TouchableOpacity style={[styles.roleButton, newOfficialRole === 'embassy' && styles.roleButtonActive]} onPress={() => setNewOfficialRole('embassy')}>
                    <Text style={newOfficialRole === 'embassy' ? styles.roleButtonTextActive : styles.roleButtonText}>Embassy</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.roleButton, newOfficialRole === 'consulate' && styles.roleButtonActive]} onPress={() => setNewOfficialRole('consulate')}>
                    <Text style={newOfficialRole === 'consulate' ? styles.roleButtonTextActive : styles.roleButtonText}>Consulate</Text>
                  </TouchableOpacity>
                </View>
                <TextInput style={commonStyles.input} placeholder="Location name" placeholderTextColor={COLORS.grayDark} value={newOfficialLocation} onChangeText={setNewOfficialLocation} />
                <TouchableOpacity style={commonStyles.button} onPress={handleAddOfficial} activeOpacity={0.7}>
                  <Text style={commonStyles.buttonText}>Confirm</Text>
                </TouchableOpacity>
              </View>
            )}
            {officials.map((official) => (
              <View key={official.userId} style={commonStyles.listItem}>
                <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                  <Ionicons name="person" size={18} color={COLORS.primaryBlueLight} />
                  <View style={{ marginLeft: 10, flex: 1 }}>
                    <Text style={commonStyles.listItemTitle}>{official.userId}</Text>
                    <Text style={commonStyles.listItemSub}>{official.role} - {official.locationName}</Text>
                  </View>
                  <TouchableOpacity onPress={() => handleRemoveOfficial(official.userId)} activeOpacity={0.7}>
                    <Ionicons name="trash-outline" size={18} color={COLORS.red} />
                  </TouchableOpacity>
                </View>
              </View>
            ))}

            {/* Embassies & Consulates */}
            <Text style={commonStyles.sectionHeader}>Embassies & Consulates</Text>
            <TouchableOpacity style={commonStyles.button} onPress={() => setShowAddEmbassy(!showAddEmbassy)} activeOpacity={0.7}>
              <Ionicons name="add" size={16} color={COLORS.white} />
              <Text style={[commonStyles.buttonText, { marginLeft: 6 }]}>Add Location</Text>
            </TouchableOpacity>
            {showAddEmbassy && (
              <View style={styles.adminForm}>
                <TextInput style={commonStyles.input} placeholder="Name (e.g. US Embassy)" placeholderTextColor={COLORS.grayDark} value={newEmbassyName} onChangeText={setNewEmbassyName} />
                <View style={{ flexDirection: 'row', marginVertical: 8 }}>
                  <TouchableOpacity style={[styles.roleButton, newEmbassyType === 'embassy' && styles.roleButtonActive]} onPress={() => setNewEmbassyType('embassy')}>
                    <Text style={newEmbassyType === 'embassy' ? styles.roleButtonTextActive : styles.roleButtonText}>Embassy</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.roleButton, newEmbassyType === 'consulate' && styles.roleButtonActive]} onPress={() => setNewEmbassyType('consulate')}>
                    <Text style={newEmbassyType === 'consulate' ? styles.roleButtonTextActive : styles.roleButtonText}>Consulate</Text>
                  </TouchableOpacity>
                </View>
                <TextInput style={commonStyles.input} placeholder="Address" placeholderTextColor={COLORS.grayDark} value={newEmbassyAddress} onChangeText={setNewEmbassyAddress} />
                <TouchableOpacity style={commonStyles.button} onPress={handleAddEmbassy} activeOpacity={0.7}>
                  <Text style={commonStyles.buttonText}>Confirm</Text>
                </TouchableOpacity>
              </View>
            )}
            {embassies.map((embassy) => (
              <View key={embassy.id} style={commonStyles.listItem}>
                <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                  <Ionicons name={embassy.type === 'embassy' ? 'flag' : 'business'} size={18} color={COLORS.primaryBlueLight} />
                  <View style={{ marginLeft: 10, flex: 1 }}>
                    <Text style={commonStyles.listItemTitle}>{embassy.name}</Text>
                    <Text style={commonStyles.listItemSub}>{embassy.type} - {embassy.address || 'No address'}</Text>
                  </View>
                  <TouchableOpacity onPress={() => handleRemoveEmbassy(embassy.id)} activeOpacity={0.7}>
                    <Ionicons name="trash-outline" size={18} color={COLORS.red} />
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </>
        ) : (
          <>
            <TouchableOpacity style={commonStyles.listItem} onPress={() => setShowAdminLogin(true)} activeOpacity={0.7}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons name="lock-closed" size={20} color={COLORS.gray} />
                <View style={{ marginLeft: 12 }}>
                  <Text style={commonStyles.listItemTitle}>Login as Admin</Text>
                  <Text style={commonStyles.listItemSub}>Manage officials and embassies</Text>
                </View>
              </View>
            </TouchableOpacity>
            {showAdminLogin && (
              <View style={styles.adminForm}>
                <TextInput style={commonStyles.input} placeholder="Admin password" placeholderTextColor={COLORS.grayDark} secureTextEntry value={adminPasswordInput} onChangeText={setAdminPasswordInput} />
                <TouchableOpacity style={commonStyles.button} onPress={handleAdminLogin} activeOpacity={0.7}>
                  <Text style={commonStyles.buttonText}>Login</Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        )}

        {/* Preferences */}
        <Text style={commonStyles.sectionHeader}>Preferences</Text>
        {renderToggle('notifications', 'Notifications', 'Enable push notifications', settings.notificationsEnabled, () => toggleSetting('notificationsEnabled'))}
        {renderToggle('location', 'Location Sharing', 'Share your location with others', settings.locationSharing, () => toggleSetting('locationSharing'))}
        {renderToggle('moon', 'Dark Mode', 'Use dark theme', settings.darkMode, () => toggleSetting('darkMode'))}
        {renderDropdown('eye', 'Accessibility', settings.accessibilityMode, cycleAccessibility)}
        {renderDropdown('megaphone', 'Announcements', settings.announcements, cycleAnnouncements)}

        {/* Network */}
        <Text style={commonStyles.sectionHeader}>Network</Text>
        <View style={commonStyles.infoCard}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
            <Ionicons name={hasInternet ? 'wifi' : 'bluetooth'} size={20} color={COLORS.white} />
            <Text style={[commonStyles.infoCardTitle, { marginLeft: 8, marginBottom: 0 }]}>{hasInternet ? 'Internet + BLE' : 'BLE Mesh Network'}</Text>
          </View>
          <View style={commonStyles.infoCardRow}>
            <Text style={commonStyles.infoCardLabel}>Connection</Text>
            <Text style={commonStyles.infoCardValue}>{connectionType}</Text>
          </View>
          <View style={commonStyles.infoCardRow}>
            <Text style={commonStyles.infoCardLabel}>Internet</Text>
            <Text style={[commonStyles.infoCardValue, { color: hasInternet ? COLORS.green : COLORS.red }]}>{hasInternet ? 'Connected' : 'Offline'}</Text>
          </View>
          <View style={commonStyles.infoCardRow}>
            <Text style={commonStyles.infoCardLabel}>BLE Scan</Text>
            <Text style={commonStyles.infoCardValue}>{nearbyError ? 'Error' : nearbyUsers.length > 0 ? `${nearbyUsers.length} device(s)` : 'No devices'}</Text>
          </View>
          <View style={commonStyles.infoCardRow}>
            <Text style={commonStyles.infoCardLabel}>BLE Range</Text>
            <Text style={commonStyles.infoCardValue}>~50m</Text>
          </View>
          <View style={commonStyles.infoCardRow}>
            <Text style={commonStyles.infoCardLabel}>Discovery Range</Text>
            <Text style={commonStyles.infoCardValue}>{hasInternet ? '100km (Internet)' : '50m (BLE only)'}</Text>
          </View>
        </View>

        {/* Danger Zone */}
        <Text style={commonStyles.sectionHeader}>Danger Zone</Text>
        <TouchableOpacity style={commonStyles.buttonDanger} onPress={handleClearData} activeOpacity={0.7}>
          <Ionicons name="trash-outline" size={18} color={COLORS.white} />
          <Text style={[commonStyles.buttonDangerText, { marginLeft: 8 }]}>Clear All Data</Text>
        </TouchableOpacity>
      </ScrollView>

      <BottomNav navigation={navigation} activeScreen="Settings" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  adminForm: {
    backgroundColor: COLORS.surface,
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
    backgroundColor: COLORS.surfaceLight,
    marginHorizontal: 4,
  },
  roleButtonActive: {
    backgroundColor: COLORS.primaryBlue,
  },
  roleButtonText: {
    color: COLORS.gray,
    fontSize: 13,
    fontWeight: '600',
  },
  roleButtonTextActive: {
    color: COLORS.white,
    fontSize: 13,
    fontWeight: '600',
  },
});
