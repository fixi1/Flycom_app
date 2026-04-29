import { useEffect } from 'react';
import { ActivityIndicator, Pressable, Text, TouchableOpacity, View, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useAppContext } from '../context/AppContext';
import BottomNav from '../components/BottomNav';

export default function NearbyScreen({ navigation }) {
  const { nearbyUsers, isLoadingNearby, nearbyError, loadNearbyUsers, nearbyEmbassies } = useAppContext();
  const { styles, colors } = useTheme();

  function getStatusColor(status) {
    switch (status) {
      case 'connected': return colors.green;
      case 'connecting': return colors.orange;
      default: return colors.gray;
    }
  }

  useEffect(() => {
    if (nearbyUsers.length === 0 && !isLoadingNearby && !nearbyError) {
      loadNearbyUsers();
    }
  }, [nearbyUsers, isLoadingNearby, nearbyError, loadNearbyUsers]);

  if (isLoadingNearby) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <View style={styles.topBar}>
          <Text style={styles.topBarTitle}>Nearby</Text>
          <Text style={styles.topBarSubtitle}>Scanning...</Text>
        </View>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={colors.primaryBlue} />
          <Text style={[styles.infoText, { marginTop: 12 }]}>Scanning for nearby devices...</Text>
        </View>
        <BottomNav navigation={navigation} activeScreen="Nearby" />
      </SafeAreaView>
    );
  }

  if (nearbyError) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <View style={styles.topBar}>
          <Text style={styles.topBarTitle}>Nearby</Text>
          <Text style={styles.topBarSubtitle}>Error</Text>
        </View>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 }}>
          <Ionicons name="bluetooth-outline" size={48} color={colors.grayDark} />
          <Text style={[styles.infoText, { textAlign: 'center', marginTop: 12 }]}>{nearbyError}</Text>
          <TouchableOpacity style={[styles.button, { marginTop: 16 }]} onPress={loadNearbyUsers}>
            <Text style={styles.buttonText}>Retry</Text>
          </TouchableOpacity>
        </View>
        <BottomNav navigation={navigation} activeScreen="Nearby" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.topBar}>
        <View>
          <Text style={styles.topBarTitle}>Nearby</Text>
          <Text style={styles.topBarSubtitle}>BLE Discovery</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Ionicons name="bluetooth" size={16} color={colors.white} />
          <Text style={[styles.topBarSubtitle, { color: colors.white, marginLeft: 4 }]}>
            {nearbyUsers.length} found
          </Text>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.sectionHeader}>Nearby Devices</Text>
        {nearbyUsers.length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: 32 }}>
            <Ionicons name="radio-outline" size={40} color={colors.grayDark} />
            <Text style={[styles.infoText, { textAlign: 'center', marginTop: 8 }]}>
              No nearby devices found. Make sure BLE is enabled.
            </Text>
            <TouchableOpacity style={[styles.button, { marginTop: 12 }]} onPress={loadNearbyUsers}>
              <Text style={styles.buttonText}>Scan Again</Text>
            </TouchableOpacity>
          </View>
        ) : (
          nearbyUsers.map((nearbyUser) => {
            const statusColor = getStatusColor(nearbyUser.status);
            const sourceLabel = nearbyUser.source === 'both' ? 'BLE + Internet' : nearbyUser.source === 'internet' ? 'Internet' : 'BLE';
            const sourceIcon = nearbyUser.source === 'internet' ? 'wifi' : nearbyUser.source === 'both' ? 'wifi' : 'bluetooth';
            return (
              <Pressable
                key={nearbyUser.id}
                style={styles.listItem}
                onPress={() => navigation.navigate('Chat', { user: nearbyUser })}
                android_ripple={{ color: colors.surfaceLight }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
                  <View style={{ flex: 1, marginLeft: 4 }}>
                    <Text style={styles.listItemTitle}>{nearbyUser.name || nearbyUser.id}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Ionicons name={sourceIcon} size={11} color={colors.gray} />
                      <Text style={[styles.listItemSub, { marginLeft: 3 }]}>{nearbyUser.id} • {sourceLabel}</Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    style={styles.buttonSmall}
                    onPress={() => navigation.navigate('Chat', { user: nearbyUser })}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="chatbubble" size={14} color={colors.white} />
                    <Text style={[styles.buttonTextSmall, { marginLeft: 4 }]}>Message</Text>
                  </TouchableOpacity>
                </View>
              </Pressable>
            );
          })
        )}

        <Text style={styles.sectionHeader}>Nearby Embassies & Consulates</Text>
        {nearbyEmbassies.length === 0 ? (
          <View style={styles.listItem}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Ionicons name="flag-outline" size={18} color={colors.gray} />
              <Text style={[styles.listItemSub, { marginLeft: 8 }]}>None found within 200km</Text>
            </View>
          </View>
        ) : (
          nearbyEmbassies.map((embassy) => (
            <Pressable
              key={embassy.id}
              style={styles.listItem}
              onPress={() => navigation.navigate('Chat', { embassy })}
              android_ripple={{ color: colors.surfaceLight }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons name={embassy.type === 'embassy' ? 'flag' : 'business'} size={18} color={colors.primaryBlueLight} />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={styles.listItemTitle}>{embassy.name}</Text>
                  <Text style={styles.listItemSub}>{embassy.type} - {embassy.address || ''}</Text>
                </View>
                <TouchableOpacity
                  style={styles.buttonSmall}
                  onPress={() => navigation.navigate('Chat')}
                  activeOpacity={0.7}
                >
                  <Ionicons name="chatbubble" size={14} color={colors.white} />
                  <Text style={[styles.buttonTextSmall, { marginLeft: 4 }]}>Chat</Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          ))
        )}
      </ScrollView>

      <BottomNav navigation={navigation} activeScreen="Nearby" />
    </SafeAreaView>
  );
}
