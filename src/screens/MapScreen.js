import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useAppContext } from '../context/AppContext';
import { loadReferencePoints, addSOSAlert } from '../storage';
import BottomNav from '../components/BottomNav';
import LeafletMap from '../components/LeafletMap';

export default function MapScreen({ navigation }) {
  const { currentLocation, nearbyUsers, isLoadingNearby, nearbyError, loadNearbyUsers, user, nearbyEmbassies, broadcastBleMessage, sendCloudMessage, hasInternet } = useAppContext();
  const { styles, colors } = useTheme();
  const [referencePoints, setReferencePoints] = useState([]);

  useEffect(() => {
    loadReferencePoints().then(setReferencePoints);
  }, []);

  useEffect(() => {
    if (!currentLocation && !isLoadingNearby) {
      loadNearbyUsers();
    }
  }, [currentLocation, isLoadingNearby, loadNearbyUsers]);

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
  }, [currentLocation, referencePoints, nearbyUsers, nearbyEmbassies, colors]);

  const handleSOS = async () => {
    if (!currentLocation) return;
    Alert.alert('SEND SOS?', 'Broadcast your location to nearby devices.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'SEND SOS',
        style: 'destructive',
        onPress: async () => {
          await addSOSAlert({
            userId: user?.id,
            username: user?.username || user?.id,
            latitude: currentLocation.latitude,
            longitude: currentLocation.longitude,
            message: 'USER NEEDS IMMEDIATE ASSISTANCE',
          });
          const sosPayload = {
            type: 'SOS',
            senderId: user?.id,
            senderName: user?.username || user?.id,
            latitude: currentLocation.latitude,
            longitude: currentLocation.longitude,
            timestamp: Date.now(),
          };
          try { await broadcastBleMessage(JSON.stringify(sosPayload)); } catch (e) {}
          if (sendCloudMessage) {
            try { await sendCloudMessage(sosPayload); } catch (e) {}
          }
          Alert.alert('SOS SENT', 'Your location has been broadcast via BLE and Internet.', [{ text: 'OK' }]);
        },
      },
    ]);
  };

  if (isLoadingNearby) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <View style={styles.topBar}>
          <Text style={styles.topBarTitle}>Map</Text>
          <Text style={styles.topBarSubtitle}>Locating...</Text>
        </View>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={colors.primaryBlue} />
          <Text style={[styles.infoText, { marginTop: 12 }]}>Getting your location...</Text>
        </View>
        <BottomNav navigation={navigation} activeScreen="Map" />
      </SafeAreaView>
    );
  }

  if (nearbyError || !currentLocation) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <View style={styles.topBar}>
          <Text style={styles.topBarTitle}>Map</Text>
          <Text style={styles.topBarSubtitle}>Unavailable</Text>
        </View>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 }}>
          <Ionicons name="location-outline" size={48} color={colors.grayDark} />
          <Text style={[styles.infoText, { textAlign: 'center', marginTop: 12 }]}>
            {nearbyError || 'Location unavailable.'}
          </Text>
          <TouchableOpacity style={[styles.button, { marginTop: 16 }]} onPress={loadNearbyUsers}>
            <Text style={styles.buttonText}>Retry</Text>
          </TouchableOpacity>
        </View>
        <BottomNav navigation={navigation} activeScreen="Map" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.topBar}>
        <View>
          <Text style={styles.topBarTitle}>Map</Text>
          <Text style={styles.topBarSubtitle}>Your area</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Ionicons name="people" size={14} color={colors.white} />
          <Text style={[styles.topBarSubtitle, { color: colors.white, marginLeft: 4 }]}>
            {nearbyUsers.length} nearby
          </Text>
        </View>
      </View>

      <View style={{ flex: 1, marginHorizontal: 12, marginVertical: 8, borderRadius: 12, overflow: 'hidden', backgroundColor: colors.surface }}>
        <LeafletMap
          userLocation={currentLocation}
          markers={mapMarkers}
          style={{ flex: 1 }}
        />
      </View>

      <View style={styles.floatingButtons}>
        <TouchableOpacity style={styles.callDroneButton} onPress={() => {}} activeOpacity={0.7}>
          <Ionicons name="airplane" size={16} color={colors.white} />
          <Text style={[styles.callDroneButtonText, { marginLeft: 4 }]}>Drone</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.sosButton, { width: 56, height: 56, borderRadius: 28 }]} onPress={handleSOS} activeOpacity={0.7}>
          <Ionicons name="radio" size={22} color={colors.white} />
        </TouchableOpacity>
      </View>

      <BottomNav navigation={navigation} activeScreen="Map" />
    </SafeAreaView>
  );
}
