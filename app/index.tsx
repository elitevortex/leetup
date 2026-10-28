import { View } from 'react-native';
import { Colors } from '../constants/theme';

// The AuthGate in the root layout redirects from here once the account state is known
export default function Index() {
  return <View style={{ flex: 1, backgroundColor: Colors.bg }} />;
}
