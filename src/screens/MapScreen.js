import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { commonStyles } from '../styles/commonStyles';
import { COLORS } from '../styles/colors';
import { useAppContext } from '../context/AppContext';
import { loadReferencePoints, addSOSAlert } from '../storage';
import BottomNav from '../components/BottomNav';
import LeafletMap from '../components/LeafletMap';

export default function MapScreen({ navigation }) {
  const { currentLocation, nearbyUsers, isLoadingNearby, nearbyError, loadNearbyUsers, user, nearbyEmbassies } = useAppContext();
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
          Alert.alert('SOS SENT', 'Your location has been broadcast.', [{ text: 'OK' }]);
        },
      },
    ]);
  };

  if (isLoadingNearby) {
    return (
      <SafeAreaView style={commonStyles.screen} edges={['top']}>
        <View style={commonStyles.topBar}>
          <Text style={commonStyles.topBarTitle}>Map</Text>
          <Text style={commonStyles.topBarSubtitle}>Locating...</Text>
        </View>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={COLORS.primaryBlue} />
          <Text style={[commonStyles.infoText, { marginTop: 12 }]}>Getting your location...</Text>
        </View>
        <BottomNav navigation={navigation} activeScreen="Map" />
      </SafeAreaView>
    );
  }

  if (nearbyError || !currentLocation) {
    return (
      <SafeAreaView style={commonStyles.screen} edges={['top']}>
        <View style={commonStyles.topBar}>
          <Text style={commonStyles.topBarTitle}>Map</Text>
          <Text style={commonStyles.topBarSubtitle}>Unavailable</Text>
        </View>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 }}>
          <Ionicons name="location-outline" size={48} color={COLORS.grayDark} />
          <Text style={[commonStyles.infoText, { textAlign: 'center', marginTop: 12 }]}>
            {nearbyError || 'Location unavailable.'}
          </Text>
          <TouchableOpacity style={[commonStyles.button, { marginTop: 16 }]} onPress={loadNearbyUsers}>
            <Text style={commonStyles.buttonText}>Retry</Text>
          </TouchableOpacity>
        </View>
        <BottomNav navigation={navigation} activeScreen="Map" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={commonStyles.screen} edges={['top']}>
      {/* Top Info Bar */}
      <View style={commonStyles.topBar}>
        <View>
          <Text style={commonStyles.topBarTitle}>Map</Text>
          <Text style={commonStyles.topBarSubtitle}>Your area</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Ionicons name="people" size={14} color={COLORS.white} />
          <Text style={[commonStyles.topBarSubtitle, { color: COLORS.white, marginLeft: 4 }]}>
            {nearbyUsers.length} nearby
          </Text>
        </View>
      </View>

      {/* Map */}
      <View style={styles.container}>
        <LeafletMap
          userLocation={currentLocation}
          markers={mapMarkers}
          style={{ flex: 1 }}
        />
      </View>

      {/* Floating Buttons */}
      <View style={commonStyles.floatingButtons}>
        <TouchableOpacity style={commonStyles.callDroneButton} onPress={() => {}} activeOpacity={0.7}>
          <Ionicons name="airplane" size={16} color={COLORS.white} />
          <Text style={[commonStyles.callDroneButtonText, { marginLeft: 4 }]}>Drone</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[commonStyles.sosButton, { width: 56, height: 56, borderRadius: 28 }]} onPress={handleSOS} activeOpacity={0.7}>
          <Ionicons name="radio" size={22} color={COLORS.white} />
        </TouchableOpacity>
      </View>

      {/* Bottom Navigation */}
      <BottomNav navigation={navigation} activeScreen="Map" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    marginHorizontal: 12,
    marginVertical: 8,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: COLORS.surface,
  },
});
