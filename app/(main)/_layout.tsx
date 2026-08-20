import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import React from 'react';
import { StyleSheet, View } from 'react-native';

const C = {
  bg: '#0A0F1E',
  tabBg: '#0D1221',
  border: '#1E2D45',
  active: '#00D4FF',
  inactive: '#3A4A5C',
  activeBg: '#00D4FF18', // subtle glow bg when focused
};

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

const ICONS: Record<string, { on: IoniconsName; off: IoniconsName }> = {
  Home: { on: 'flash', off: 'flash-outline' },
  Requests: { on: 'swap-horizontal', off: 'swap-horizontal-outline' },
  Pricing: { on: 'pricetag', off: 'pricetag-outline' },
  Wallet: { on: 'wallet', off: 'wallet-outline' },
  History: { on: 'time', off: 'time-outline' },
  System: { on: 'hardware-chip', off: 'hardware-chip-outline' },
};

const TabIcon = ({
  label,
  focused,
}: {
  label: string;
  focused: boolean;
}) => {
  const icon = ICONS[label];
  return (
    <View style={[styles.iconWrap, focused && styles.iconWrapActive]}>
      <Ionicons
        name={focused ? icon.on : icon.off}
        size={20}
        color={focused ? C.active : C.inactive}
      />
      {focused && <View style={styles.activeDot} />}
    </View>
  );
};

export default function MainLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: C.tabBg,
          borderTopColor: C.border,
          borderTopWidth: StyleSheet.hairlineWidth,
          height: 72,
          paddingBottom: 10,
          paddingTop: 6,
          elevation: 0,
        },
        tabBarActiveTintColor: C.active,
        tabBarInactiveTintColor: C.inactive,
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '600',
          letterSpacing: 0.4,
          marginTop: 2,
        },
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'Home',
          tabBarIcon: ({ focused }) => (
            <TabIcon label="Home" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="requests"
        options={{
          title: 'Requests',
          tabBarIcon: ({ focused }) => (
            <TabIcon label="Requests" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="pricing"
        options={{
          title: 'Pricing',
          tabBarIcon: ({ focused }) => (
            <TabIcon label="Pricing" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="wallet"
        options={{
          title: 'Wallet',
          tabBarIcon: ({ focused }) => (
            <TabIcon label="Wallet" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: 'History',
          tabBarIcon: ({ focused }) => (
            <TabIcon label="History" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="system"
        options={{
          title: 'System',
          tabBarIcon: ({ focused }) => (
            <TabIcon label="System" focused={focused} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  iconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 44,
    height: 30,
    borderRadius: 10,
  },
  iconWrapActive: {
    backgroundColor: '#00D4FF18',
  },
  activeDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: C.active,
    marginTop: 4,
  },
});