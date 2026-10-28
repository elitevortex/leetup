import { View } from 'react-native';
import { Colors } from '../constants/theme';

// OAuth redirects land here (leetup://auth-callback); the session exchange already ran in the
// sign-in flow, and the AuthGate moves the person on.
export default function AuthCallback() {
  return <View style={{ flex: 1, backgroundColor: Colors.bg }} />;
}
