import { View } from 'react-native';
import { Lock } from 'lucide-react-native';
import { Colors } from '../constants/theme';
import { T } from './ui';

export function TrustLine() {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 }}>
      <Lock size={13} color={Colors.text3} />
      <T variant="monoSm" style={{ fontSize: 11 }}>read-only · public data · never your password</T>
    </View>
  );
}
