import React from 'react';
import { View, TouchableOpacity, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { commonStyles } from '../styles/commonStyles';
import { COLORS } from '../styles/colors';

const NAV_ITEMS = [
  { screen: 'Chat', icon: 'chatbubbles', label: 'Messages' },
  { screen: 'Home', icon: 'home', label: 'Home' },
  { screen: 'Settings', icon: 'settings', label: 'Settings' },
];

export default function BottomNav({ navigation, activeScreen }) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[commonStyles.bottomNav, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      {NAV_ITEMS.map(({ screen, icon, label }) => {
        const isActive = activeScreen === screen;
        return (
          <TouchableOpacity
            key={screen}
            style={[commonStyles.navButton, isActive && commonStyles.navButtonActive]}
            onPress={() => navigation.navigate(screen)}
            activeOpacity={0.7}
          >
            <Ionicons
              name={icon}
              size={22}
              color={isActive ? COLORS.white : COLORS.whiteAlpha50}
            />
            <Text style={isActive ? commonStyles.navButtonTextActive : commonStyles.navButtonText}>
              {label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
