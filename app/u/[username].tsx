import { useEffect } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../../lib/auth-context';
import { Loading, NavHeader, Screen } from '../../components/ui';
import { ProfileView } from '../../components/ProfileView';

export default function UserProfile() {
  const { username = '' } = useLocalSearchParams<{ username: string }>();
  const { profile } = useAuth();
  const own = !!profile && profile.username.toLowerCase() === username.toLowerCase();

  // Your own profile lives in the Profile tab
  useEffect(() => {
    if (own) router.replace('/(tabs)/profile');
  }, [own]);

  return (
    <Screen>
      <NavHeader title={`@${username}`} />
      {own || !username ? <Loading /> : <ProfileView username={username} />}
    </Screen>
  );
}
