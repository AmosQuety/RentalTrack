import React from 'react';
import { StyleSheet, Text, View, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../theme/ThemeContext';

export const SyncBadge: React.FC = () => {
  const { dirtyCount } = useAuth();
  const { colors, typography } = useTheme();
  
  // Fade in/out animation
  const opacity = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    Animated.timing(opacity, {
      toValue: dirtyCount > 0 ? 1 : 0,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [dirtyCount]);

  if (dirtyCount === 0) return null;

  return (
    <Animated.View style={[styles.container, { opacity }]}>
      <View style={[styles.badge, { backgroundColor: colors.warning }]}>
        <Ionicons name="cloud-upload" size={12} color="#FFFFFF" />
        <Text style={[styles.count, { fontFamily: typography.fonts.bold }]}>
          {dirtyCount}
        </Text>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginRight: 15,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1.41,
  },
  count: {
    color: '#FFFFFF',
    fontSize: 10,
    marginLeft: 4,
  },
});
