import { ActivityIndicator, View } from 'react-native';
import { Brand } from '@/constants/theme';

export default function Index() {
  return (
    <View style={{ flex: 1, backgroundColor: Brand.bgTop, justifyContent: 'center', alignItems: 'center' }}>
      <ActivityIndicator color={Brand.accent} size="large" />
    </View>
  );
}
