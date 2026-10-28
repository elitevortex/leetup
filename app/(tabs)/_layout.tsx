import { Tabs } from 'expo-router';
import { Colors } from '../../constants/theme';
import { TabBar } from '../../components/TabBar';

export default function TabsLayout() {
  return (
    <Tabs tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: Colors.bg } }}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="ranks" />
      {/* Placeholder slot: the raised centre button opens the full-screen timer instead */}
      <Tabs.Screen name="start" />
      <Tabs.Screen name="groups" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}
