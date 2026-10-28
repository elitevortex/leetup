import { router } from 'expo-router';
import { SlidersHorizontal } from 'lucide-react-native';
import { Colors } from '../../constants/theme';
import { useAuth } from '../../lib/auth-context';
import { IconButton, Loading, Screen, TabHeader } from '../../components/ui';
import { ProfileView } from '../../components/ProfileView';

export default function ProfileTab() {
  const { profile } = useAuth();
  return (
    <Screen>
      <TabHeader
        title="Profile"
        right={
          <IconButton label="Settings" onPress={() => router.push('/settings')}>
            <SlidersHorizontal size={20} color={Colors.text} />
          </IconButton>
        }
      />
      {profile ? <ProfileView username={profile.username} /> : <Loading />}
    </Screen>
  );
}
