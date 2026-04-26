import { Text, TouchableOpacity, View, Alert, ScrollView } from 'react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { commonStyles } from '../styles/commonStyles';
import { useAppContext } from '../context/AppContext';
import { COLORS } from '../styles/colors';
import { addReferencePoint, loadReferencePoints, removeReferencePoint, addSOSAlert } from '../storage';
import BottomNav from '../components/BottomNav';
import LeafletMap from '../components/LeafletMap';

export default function HomeScreen({ navigation }) {
  const { user, isLoadingUser, isOnline, connectionType, currentLocation, nearbyUsers, nearbyEmbassies } = useAppContext();
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
        color: COLORS.primaryBlue,
      });
    }
    referencePoints.forEach((point) => {
      const color = point.safetyLevel === 'high' ? COLORS.green : point.safetyLevel === 'medium' ? COLORS.orange : COLORS.red;
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
        color: COLORS.primaryBlueLight,
      });
    });
    nearbyEmbassies.forEach((embassy) => {
      markers.push({
        id: embassy.id,
        lat: embassy.latitude,
        lng: embassy.longitude,
        title: embassy.name,
        popup: `<b>${embassy.name}</b><br/>${embassy.type}`,
        color: embassy.type === 'embassy' ? COLORS.orange : COLORS.greenDark,
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
            Alert.alert('SOS SENT!', 'Your location has been broadcast to nearby devices.', [{ text: 'OK' }]);
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={commonStyles.screen} edges={['top']}>
      {/* Top Info Bar */}
      <View style={commonStyles.topBar}>
        <View>
          <Text style={commonStyles.topBarTitle}>{displayName}</Text>
          <Text style={commonStyles.topBarSubtitle}>
            {isOnline ? 'Connected' : 'Offline'} • {connectionType}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={[commonStyles.statusDot, { backgroundColor: isOnline ? COLORS.green : COLORS.orange }]} />
          <Text style={[commonStyles.topBarSubtitle, { color: COLORS.white }]}>
            {isOnline ? 'Online' : 'Offline'}
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
        <View style={commonStyles.mapSection}>
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
                backgroundColor: COLORS.surface,
                justifyContent: 'center',
                alignItems: 'center',
              }}>
                <Ionicons name="location-outline" size={40} color={COLORS.grayDark} />
                <Text style={[commonStyles.infoText, { marginTop: 8 }]}>Getting location...</Text>
              </View>
            )}

            {/* Add Point FAB */}
            <TouchableOpacity 
              style={[commonStyles.fab, { position: 'absolute', right: 12, top: 12 }]}
              onPress={() => setShowAddPointMenu(!showAddPointMenu)}
              activeOpacity={0.7}
            >
              <Ionicons name={showAddPointMenu ? 'close' : 'add'} size={24} color={COLORS.white} />
            </TouchableOpacity>

            {/* Add Point Menu */}
            {showAddPointMenu && (
              <View style={commonStyles.popupMenu}>
                <Text style={commonStyles.popupMenuTitle}>Add Reference Point</Text>
                <TouchableOpacity 
                  style={commonStyles.popupMenuOption}
                  onPress={() => handleAddReferencePoint('Shelter', 'high')}
                  activeOpacity={0.7}
                >
                  <Ionicons name="home" size={18} color={COLORS.green} />
                  <Text style={commonStyles.popupMenuOptionText}>Shelter (High Safety)</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={commonStyles.popupMenuOption}
                  onPress={() => handleAddReferencePoint('Safe Zone', 'medium')}
                  activeOpacity={0.7}
                >
                  <Ionicons name="shield-checkmark" size={18} color={COLORS.orange} />
                  <Text style={commonStyles.popupMenuOptionText}>Safe Zone (Medium)</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={commonStyles.popupMenuOption}
                  onPress={() => handleAddReferencePoint('Danger Zone', 'low')}
                  activeOpacity={0.7}
                >
                  <Ionicons name="warning" size={18} color={COLORS.red} />
                  <Text style={commonStyles.popupMenuOptionText}>Danger Zone (Low)</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>

        {/* SOS Section */}
        <View style={{ alignItems: 'center', paddingVertical: 20 }}>
          <TouchableOpacity 
            style={commonStyles.sosButton} 
            onPress={handleSOS}
            activeOpacity={0.7}
          >
            <Ionicons name="radio" size={32} color={COLORS.white} />
            <Text style={commonStyles.sosButtonText}>SOS</Text>
          </TouchableOpacity>
          <Text style={[commonStyles.caption, { marginTop: 8 }]}>
            Broadcast emergency alert
          </Text>
        </View>

        {/* Reference Points */}
        {referencePoints.length > 0 && (
          <View style={{ paddingHorizontal: 16 }}>
            <Text style={commonStyles.sectionHeader}>Reference Points</Text>
            {referencePoints.map((point) => (
              <View key={point.id} style={commonStyles.listItem}>
                <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                  <Ionicons
                    name={point.type === 'Shelter' ? 'home' : point.type === 'Safe Zone' ? 'shield-checkmark' : 'warning'}
                    size={18}
                    color={point.safetyLevel === 'high' ? COLORS.green : point.safetyLevel === 'medium' ? COLORS.orange : COLORS.red}
                  />
                  <View style={{ marginLeft: 10, flex: 1 }}>
                    <Text style={commonStyles.listItemTitle}>{point.type}</Text>
                    <Text style={commonStyles.listItemSub}>Safety: {point.safetyLevel}</Text>
                  </View>
                  <TouchableOpacity onPress={() => handleDeletePoint(point.id)} activeOpacity={0.7}>
                    <Ionicons name="trash-outline" size={18} color={COLORS.red} />
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Nearby Users */}
        <View style={{ paddingHorizontal: 16, marginTop: referencePoints.length > 0 ? 0 : 8 }}>
          <Text style={commonStyles.sectionHeader}>Nearby Users</Text>
          {nearbyUsers.length === 0 ? (
            <View style={commonStyles.listItem}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons name="person-outline" size={18} color={COLORS.gray} />
                <Text style={[commonStyles.listItemSub, { marginLeft: 8 }]}>
                  No BLE users detected nearby
                </Text>
              </View>
            </View>
          ) : (
            nearbyUsers.map((nUser) => (
              <TouchableOpacity
                key={nUser.deviceId || nUser.id}
                style={commonStyles.listItem}
                onPress={() => navigation.navigate('Chat', { user: nUser })}
                activeOpacity={0.7}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                  <View style={[commonStyles.statusDot, { backgroundColor: nUser.status === 'available' ? COLORS.green : COLORS.gray }]} />
                  <View style={{ marginLeft: 10, flex: 1 }}>
                    <Text style={commonStyles.listItemTitle}>{nUser.name || nUser.id}</Text>
                    <Text style={commonStyles.listItemSub}>{nUser.id}</Text>
                  </View>
                  <Ionicons name="chatbubble-outline" size={18} color={COLORS.primaryBlueLight} />
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
