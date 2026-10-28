import { View } from 'react-native';
import { router } from 'expo-router';
import { Users } from 'lucide-react-native';
import { Colors } from '../../constants/theme';
import { Button, EmptyState, Screen, TabHeader } from '../../components/ui';

export default function Groups() {
  return (
    <Screen>
      <TabHeader title="Groups" />
      <View style={{ flex: 1, justifyContent: 'center', paddingBottom: 60 }}>
        <EmptyState
          icon={<Users size={28} color={Colors.text3} />}
          title="Groups are coming"
          body="Study groups, bootcamp cohorts and uni clubs with their own leaderboards and weekly challenges."
          action={<Button title="Find friends" pill onPress={() => router.push('/friends')} />}
        />
      </View>
    </Screen>
  );
}
