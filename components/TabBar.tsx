import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { ChartColumn, House, Timer, User, Users } from 'lucide-react-native';
import { Colors, Fonts } from '../constants/theme';
import { T } from './ui';

const TABS: Record<string, { label: string; Icon: typeof House }> = {
  index: { label: 'Home', Icon: House },
  ranks: { label: 'Ranks', Icon: ChartColumn },
  groups: { label: 'Groups', Icon: Users },
  profile: { label: 'Profile', Icon: User },
};

// Home · Ranks · [Timer] · Groups · Profile, with the timer as a raised button that opens full screen
export function TabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
      {state.routes.map((route, index) => {
        if (route.name === 'start') {
          return (
            <View key={route.key} style={styles.slot}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Start a solve"
                onPress={() => router.push('/timer')}
                style={({ pressed }) => [styles.timer, { transform: [{ scale: pressed ? 0.96 : 1 }] }]}
              >
                <Timer size={28} color={Colors.accentInk} strokeWidth={2.25} />
              </Pressable>
              <View style={{ height: 22 }} />
              <T variant="tab" color={Colors.text} style={{ fontFamily: Fonts.sansSemiBold }}>Timer</T>
            </View>
          );
        }
        const tab = TABS[route.name];
        if (!tab) return null;
        const focused = state.index === index;
        const { Icon } = tab;
        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={tab.label}
            onPress={() => {
              const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
              if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
            }}
            style={styles.slot}
          >
            <View style={[styles.indicator, focused && { backgroundColor: Colors.accent }]} />
            <Icon size={22} color={focused ? Colors.accent : Colors.text3} />
            <T variant="tab" color={focused ? Colors.text : Colors.text3} style={focused ? { fontFamily: Fonts.sansSemiBold } : null}>
              {tab.label}
            </T>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', backgroundColor: Colors.bg, borderTopWidth: 1, borderTopColor: Colors.border },
  slot: { flex: 1, alignItems: 'center', gap: 5 },
  indicator: { width: 20, height: 2, borderRadius: 1, marginBottom: 4 },
  timer: {
    position: 'absolute',
    top: -26,
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.accent,
    borderWidth: 5,
    borderColor: Colors.bg,
    shadowColor: Colors.accent,
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
});
