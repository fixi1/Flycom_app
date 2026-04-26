import { Pressable, Text } from 'react-native';
import { commonStyles } from '../styles/commonStyles';

export default function NavButton({ label, onPress }) {
  return (
    <Pressable style={commonStyles.button} onPress={onPress}>
      <Text style={commonStyles.buttonText}>{label}</Text>
    </Pressable>
  );
}
