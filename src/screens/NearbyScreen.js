import { useEffect } from 'react';
import { ActivityIndicator, Pressable, Text, TouchableOpacity, View, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { commonStyles } from '../styles/commonStyles';
import { useAppContext } from '../context/AppContext';
import { COLORS } from '../styles/colors';
import BottomNav from '../components/BottomNav';

function getStatusColor(status) {
  switch (status) {
    case 'connected':
      return COLORS.green;
    case 'connecting':
      return COLORS.orange;
    default:
      return COLORS.gray;
  }
}

export default function NearbyScreen({ navigation }) {
  const { nearbyUsers, isLoadingNearby, nearbyError, loadNearbyUsers, nearbyEmbassies } = useAppContext();

  useEffect(() => {
    if (nearbyUsers.length === 0 && !isLoadingNearby && !nearbyError) {
      loadNearbyUsers();
    }
  }, [nearbyUsers, isLoadingNearby, nearbyError, loadNearbyUsers]);

  if (isLoadingNearby) {
    return (
      <SafeAreaView style={commonStyles.screen} edges={['top']}>
        <View style={commonStyles.topBar}>
          <Text style={commonStyles.topBarTitle}>Nearby</Text>
          <Text style={commonStyles.topBarSubtitle}>Scanning...</Text>
        </View>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={COLORS.primaryBlue} />
          <Text style={[commonStyles.infoText, { marginTop: 12 }]}>Scanning for nearby devices...</Text>
        </View>
        <BottomNav navigation={navigation} activeScreen="Nearby" />
      </SafeAreaView>
    );
  }

  if (nearbyError) {
    return (
      <SafeAreaView style={commonStyles.screen} edges={['top']}>
        <View style={commonStyles.topBar}>
          <Text style={commonStyles.topBarTitle}>Nearby</Text>
          <Text style={commonStyles.topBarSubtitle}>Error</Text>
        </View>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 }}>
          <Ionicons name="bluetooth-outline" size={48} color={COLORS.grayDark} />
          <Text style={[commonStyles.infoText, { textAlign: 'center', marginTop: 12 }]}>{nearbyError}</Text>
          <TouchableOpacity style={[commonStyles.button, { marginTop: 16 }]} onPress={loadNearbyUsers}>
            <Text style={commonStyles.buttonText}>Retry</Text>
          </TouchableOpacity>
        </View>
        <BottomNav navigation={navigation} activeScreen="Nearby" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={commonStyles.screen} edges={['top']}>
      {/* Top Info Bar */}
      <View style={commonStyles.topBar}>
        <View>
          <Text style={commonStyles.topBarTitle}>Nearby</Text>
          <Text style={commonStyles.topBarSubtitle}>BLE Discovery</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Ionicons name="bluetooth" size={16} color={COLORS.white} />
          <Text style={[commonStyles.topBarSubtitle, { color: COLORS.white, marginLeft: 4 }]}>
            {nearbyUsers.length} found
          </Text>
        </View>
      </View>

      {/* Main Content Area */}
      <ScrollView 
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Nearby Users Section */}
        <Text style={commonStyles.sectionHeader}>Nearby Devices</Text>
        {nearbyUsers.length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: 32 }}>
            <Ionicons name="radio-outline" size={40} color={COLORS.grayDark} />
            <Text style={[commonStyles.infoText, { textAlign: 'center', marginTop: 8 }]}>
              No nearby devices found. Make sure BLE is enabled.
            </Text>
            <TouchableOpacity style={[commonStyles.button, { marginTop: 12 }]} onPress={loadNearbyUsers}>
              <Text style={commonStyles.buttonText}>Scan Again</Text>
            </TouchableOpacity>
          </View>
        ) : (
          nearbyUsers.map((nearbyUser) => {
            const statusColor = getStatusColor(nearbyUser.status);
            return (
              <Pressable
                key={nearbyUser.id}
                style={commonStyles.listItem}
                onPress={() => navigation.navigate('Chat', { user: nearbyUser })}
                android_ripple={{ color: COLORS.surfaceLight }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={[commonStyles.statusDot, { backgroundColor: statusColor }]} />
                  <View style={{ flex: 1, marginLeft: 4 }}>
                    <Text style={commonStyles.listItemTitle}>{nearbyUser.name || nearbyUser.id}</Text>
                    <Text style={commonStyles.listItemSub}>{nearbyUser.id}</Text>
                  </View>
                  <TouchableOpacity
                    style={commonStyles.buttonSmall}
                    onPress={() => navigation.navigate('Chat', { user: nearbyUser })}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="chatbubble" size={14} color={COLORS.white} />
                    <Text style={[commonStyles.buttonTextSmall, { marginLeft: 4 }]}>Message</Text>
                  </TouchableOpacity>
                </View>
              </Pressable>
            );
          })
        )}

        {/* Nearby Embassies & Consulates */}
        <Text style={commonStyles.sectionHeader}>Nearby Embassies & Consulates</Text>
        {nearbyEmbassies.length === 0 ? (
          <View style={commonStyles.listItem}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Ionicons name="flag-outline" size={18} color={COLORS.gray} />
              <Text style={[commonStyles.listItemSub, { marginLeft: 8 }]}>None found within 200km</Text>
            </View>
          </View>
        ) : (
          nearbyEmbassies.map((embassy) => (
            <Pressable
              key={embassy.id}
              style={commonStyles.listItem}
              onPress={() => navigation.navigate('Chat', { embassy })}
              android_ripple={{ color: COLORS.surfaceLight }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons name={embassy.type === 'embassy' ? 'flag' : 'business'} size={18} color={COLORS.primaryBlueLight} />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={commonStyles.listItemTitle}>{embassy.name}</Text>
                  <Text style={commonStyles.listItemSub}>{embassy.type} - {embassy.address || ''}</Text>
                </View>
                <TouchableOpacity
                  style={commonStyles.buttonSmall}
                  onPress={() => navigation.navigate('Chat')}
                  activeOpacity={0.7}
                >
                  <Ionicons name="chatbubble" size={14} color={COLORS.white} />
                  <Text style={[commonStyles.buttonTextSmall, { marginLeft: 4 }]}>Chat</Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          ))
        )}
      </ScrollView>

      {/* Bottom Navigation */}
      <BottomNav navigation={navigation} activeScreen="Nearby" />
    </SafeAreaView>
  );
}
