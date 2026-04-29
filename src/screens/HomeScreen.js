import { Text, TouchableOpacity, View, Alert, ScrollView } from 'react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useAppContext } from '../context/AppContext';
import { addReferencePoint, loadReferencePoints, removeReferencePoint, addSOSAlert } from '../storage';
import BottomNav from '../components/BottomNav';
import LeafletMap from '../components/LeafletMap';

export default function HomeScreen({ navigation }) {
  const { user, isLoadingUser, isOnline, hasInternet, connectionType, currentLocation, nearbyUsers, nearbyEmbassies, broadcastBleMessage, sendCloudMessage, sosAlerts } = useAppContext();
  const { styles, colors } = useTheme();
  const [usernameInput, setUsernameInput] = useState('');
  const [showAddPointMenu, setShowAddPointMenu] = useState(false);
  const [referencePoints, setReferencePoints] = useState([]);

  useEffect(() => {
    setUsernameInput(user?.username ?? '');
    loadReferencePoints().then(setReferencePoints);
  }, [user]);

  const mapMarkers = useMemo(() => {
    const markers = [];
    if (currentLocation) {
      markers.push({
        id: 'user',
        lat: currentLocation.latitude,
        lng: currentLocation.longitude,
        title: 'You',
        popup: '<b>You</b><br/>Current location',
        color: colors.primaryBlue,
      });
    }
    referencePoints.forEach((point) => {
      const color = point.safetyLevel === 'high' ? colors.green : point.safetyLevel === 'medium' ? colors.orange : colors.red;
      markers.push({
        id: point.id,
        lat: point.latitude,
        lng: point.longitude,
        title: point.type,
        popup: `<b>${point.type}</b><br/>Safety: ${point.safetyLevel}`,
        color,
      });
    });
    nearbyUsers.forEach((nUser) => {
      markers.push({
        id: nUser.deviceId || nUser.id,
        lat: nUser.latitude || (currentLocation?.latitude || 0) + 0.001,
        lng: nUser.longitude || (currentLocation?.longitude || 0) + 0.001,
        title: nUser.name || nUser.id,
        popup: `<b>${nUser.name || nUser.id}</b><br/>${nUser.id}`,
        color: colors.primaryBlueLight,
      });
    });
    nearbyEmbassies.forEach((embassy) => {
      markers.push({
        id: embassy.id,
        lat: embassy.latitude,
        lng: embassy.longitude,
        title: embassy.name,
        popup: `<b>${embassy.name}</b><br/>${embassy.type}`,
        color: embassy.type === 'embassy' ? colors.orange : colors.greenDark,
      });
    });
    return markers;
  }, [currentLocation, referencePoints, nearbyUsers, nearbyEmbassies]);

  const displayName = useMemo(() => {
    if (!user) return '';
    return user.username || user.id;
  }, [user]);

  const handleAddReferencePoint = async (type, safetyLevel) => {
    if (!currentLocation) {
      Alert.alert('No Location', 'Cannot add reference point without location.');
      return;
    }
    const newPoint = {
      type,
      safetyLevel,
      latitude: currentLocation.latitude,
      longitude: currentLocation.longitude,
    };
    await addReferencePoint(newPoint);
    const updated = await loadReferencePoints();
    setReferencePoints(updated);
    setShowAddPointMenu(false);
    Alert.alert('Point Added', `${type} marked with ${safetyLevel} safety level`, [{ text: 'OK' }]);
  };

  const handleDeletePoint = async (pointId) => {
    const updated = await removeReferencePoint(pointId);
    setReferencePoints(updated);
  };

  const handleSOS = async () => {
    if (!currentLocation) {
      Alert.alert('No Location', 'Cannot send SOS without location.');
      return;
    }
    Alert.alert(
      'SEND SOS ALERT?',
      'This will broadcast your location to all nearby BLE devices.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'SEND SOS',
          style: 'destructive',
          onPress: async () => {
            const sosAlert = {
              userId: user?.id,
              username: displayName,
              latitude: currentLocation.latitude,
              longitude: currentLocation.longitude,
              message: 'USER NEEDS IMMEDIATE ASSISTANCE',
            };
            await addSOSAlert(sosAlert);
            const sosPayload = {
              type: 'SOS',
              senderId: user?.id,
              senderName: displayName,
              latitude: currentLocation.latitude,
              longitude: currentLocation.longitude,
              timestamp: Date.now(),
            };
            try {
              await broadcastBleMessage(JSON.stringify(sosPayload));
            } catch (e) {
              console.warn('SOS BLE broadcast failed:', e?.message);
            }
            if (sendCloudMessage) {
              try { await sendCloudMessage(sosPayload); } catch (e) {}
            }
            Alert.alert('SOS SENT!', 'Your location has been broadcast via BLE and Internet.', [{ text: 'OK' }]);
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      {/* Top Info Bar */}
      <View style={styles.topBar}>
        <View>
          <Text style={styles.topBarTitle}>{displayName}</Text>
          <Text style={styles.topBarSubtitle}>
            {hasInternet ? 'Online' : 'Offline'} • {connectionType}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={[styles.statusDot, { backgroundColor: hasInternet ? colors.green : (nearbyUsers.length > 0 ? colors.orange : colors.red) }]} />
          <Text style={[styles.topBarSubtitle, { color: colors.white }]}>
            {hasInternet ? 'Online' : (nearbyUsers.length > 0 ? 'BLE' : 'Offline')}
          </Text>
        </View>
      </View>

      {/* Main Content Area */}
      <ScrollView 
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Map Section */}
        <View style={styles.mapSection}>
          <View style={{ width: '92%', position: 'relative' }}>
            {currentLocation ? (
              <LeafletMap
                userLocation={currentLocation}
                markers={mapMarkers}
                style={{ width: '100%', height: 260 }}
              />
            ) : (
              <View style={{
                width: '100%',
                height: 260,
                borderRadius: 12,
                backgroundColor: colors.surface,
                justifyContent: 'center',
                alignItems: 'center',
              }}>
                <Ionicons name="location-outline" size={40} color={colors.grayDark} />
                <Text style={[styles.infoText, { marginTop: 8 }]}>Getting location...</Text>
              </View>
            )}

            {/* Add Point FAB */}
            <TouchableOpacity 
              style={[styles.fab, { position: 'absolute', right: 12, top: 12 }]}
              onPress={() => setShowAddPointMenu(!showAddPointMenu)}
              activeOpacity={0.7}
            >
              <Ionicons name={showAddPointMenu ? 'close' : 'add'} size={24} color={colors.white} />
            </TouchableOpacity>

            {/* Add Point Menu */}
            {showAddPointMenu && (
              <View style={styles.popupMenu}>
                <Text style={styles.popupMenuTitle}>Add Reference Point</Text>
                <TouchableOpacity 
                  style={styles.popupMenuOption}
                  onPress={() => handleAddReferencePoint('Shelter', 'high')}
                  activeOpacity={0.7}
                >
                  <Ionicons name="home" size={18} color={colors.green} />
                  <Text style={styles.popupMenuOptionText}>Shelter (High Safety)</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={styles.popupMenuOption}
                  onPress={() => handleAddReferencePoint('Safe Zone', 'medium')}
                  activeOpacity={0.7}
                >
                  <Ionicons name="shield-checkmark" size={18} color={colors.orange} />
                  <Text style={styles.popupMenuOptionText}>Safe Zone (Medium)</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={styles.popupMenuOption}
                  onPress={() => handleAddReferencePoint('Danger Zone', 'low')}
                  activeOpacity={0.7}
                >
                  <Ionicons name="warning" size={18} color={colors.red} />
                  <Text style={styles.popupMenuOptionText}>Danger Zone (Low)</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>

        {/* SOS & Drone Section */}
        <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-start', paddingVertical: 20, gap: 24 }}>
          <View style={{ alignItems: 'center' }}>
            <TouchableOpacity 
              style={styles.sosButton} 
              onPress={handleSOS}
              activeOpacity={0.7}
            >
              <Ionicons name="radio" size={32} color={colors.white} />
              <Text style={styles.sosButtonText}>SOS</Text>
            </TouchableOpacity>
            <Text style={[styles.caption, { marginTop: 8 }]}>
              Emergency alert
            </Text>
          </View>
          <View style={{ alignItems: 'center' }}>
            <TouchableOpacity 
              style={[styles.sosButton, { backgroundColor: colors.primaryBlue }]} 
              onPress={() => Alert.alert(
                'Drone Delivery',
                'Request an emergency essentials package (medical supplies, water, food) delivered by drone to your location.\n\nThis feature is coming soon and is not yet available.',
                [{ text: 'OK' }]
              )}
              activeOpacity={0.7}
            >
              <Ionicons name="airplane" size={32} color={colors.white} />
              <Text style={styles.sosButtonText}>DRONE</Text>
            </TouchableOpacity>
            <Text style={[styles.caption, { marginTop: 8 }]}>
              Coming soon
            </Text>
          </View>
        </View>

        {/* Reference Points */}
        {referencePoints.length > 0 && (
          <View style={{ paddingHorizontal: 16 }}>
            <Text style={styles.sectionHeader}>Reference Points</Text>
            {referencePoints.map((point) => (
              <View key={point.id} style={styles.listItem}>
                <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                  <Ionicons
                    name={point.type === 'Shelter' ? 'home' : point.type === 'Safe Zone' ? 'shield-checkmark' : 'warning'}
                    size={18}
                    color={point.safetyLevel === 'high' ? colors.green : point.safetyLevel === 'medium' ? colors.orange : colors.red}
                  />
                  <View style={{ marginLeft: 10, flex: 1 }}>
                    <Text style={styles.listItemTitle}>{point.type}</Text>
                    <Text style={styles.listItemSub}>Safety: {point.safetyLevel}</Text>
                  </View>
                  <TouchableOpacity onPress={() => handleDeletePoint(point.id)} activeOpacity={0.7}>
                    <Ionicons name="trash-outline" size={18} color={colors.red} />
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Nearby Users */}
        <View style={{ paddingHorizontal: 16, marginTop: referencePoints.length > 0 ? 0 : 8 }}>
          <Text style={styles.sectionHeader}>Nearby Users</Text>
          {nearbyUsers.length === 0 ? (
            <View style={styles.listItem}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons name="person-outline" size={18} color={colors.gray} />
                <Text style={[styles.listItemSub, { marginLeft: 8 }]}>
                  No BLE users detected nearby
                </Text>
              </View>
            </View>
          ) : (
            nearbyUsers.map((nUser) => (
              <TouchableOpacity
                key={nUser.deviceId || nUser.id}
                style={styles.listItem}
                onPress={() => navigation.navigate('Chat', { user: nUser })}
                activeOpacity={0.7}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                  <View style={[styles.statusDot, { backgroundColor: nUser.status === 'available' ? colors.green : colors.gray }]} />
                  <View style={{ marginLeft: 10, flex: 1 }}>
                    <Text style={styles.listItemTitle}>{nUser.name || nUser.id}</Text>
                    <Text style={styles.listItemSub}>{nUser.id}</Text>
                  </View>
                  <Ionicons name="chatbubble-outline" size={18} color={colors.primaryBlueLight} />
                </View>
              </TouchableOpacity>
            ))
          )}
        </View>
      </ScrollView>

      {/* Bottom Navigation */}
      <BottomNav navigation={navigation} activeScreen="Home" />
    </SafeAreaView>
  );
}
