import { View } from 'react-native';
import { ChevronLeft } from 'lucide-react-native';
import { Colors } from '../constants/theme';
import { IconButton, T } from './ui';

export function StepHeader({ step, total = 2, onBack }: { step: number; total?: number; onBack?: () => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingRight: 20, paddingTop: 8, paddingBottom: 8 }}>
      {onBack ? (
        <IconButton label="Back" onPress={onBack}>
          <ChevronLeft size={20} color={Colors.text} />
        </IconButton>
      ) : null}
      <View style={{ flex: 1, gap: 6 }} accessibilityLabel={`Step ${step} of ${total}`}>
        <T variant="label" style={{ fontSize: 11 }}>{`Step ${step} of ${total}`}</T>
        <View style={{ flexDirection: 'row', gap: 4 }}>
          {Array.from({ length: total }).map((_, i) => (
            <View key={i} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i < step ? Colors.accent : Colors.surface2 }} />
          ))}
        </View>
      </View>
    </View>
  );
}
