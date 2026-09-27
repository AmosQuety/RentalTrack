import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import { useAuthHubLogin } from '../../hooks/use-authhub-login';
import { useTheme } from '../../theme/ThemeContext';
import { Logger } from '../../services/logger';

export default function LoginScreen() {
  const [loading, setLoading] = useState(false);
  const { signIn } = useAuth();
  const { login, isRequestReady } = useAuthHubLogin();
  const router = useRouter();
  const { colors, typography } = useTheme();

  const handleLogin = async () => {
    setLoading(true);
    try {
      const tokens = await login();
      if (tokens) {
        await signIn(tokens);
        // Navigation is handled by the guard in _layout.tsx
      }
    } catch (error) {
      Logger.error('Login: AuthHub sign-in failed', { error: error instanceof Error ? error : new Error(String(error)) });
      Alert.alert('Sign-in Failed', 'Could not complete sign-in with AuthHub. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text, fontFamily: typography.fonts.bold, fontSize: typography.sizes.hero }]}>RentalTrack</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary, fontFamily: typography.fonts.regular, fontSize: typography.sizes.md }]}>Manage your properties with ease</Text>
      </View>

      <TouchableOpacity
        style={[styles.button, { backgroundColor: colors.primary, opacity: isRequestReady ? 1 : 0.6 }]}
        onPress={handleLogin}
        disabled={loading || !isRequestReady}
      >
        {loading ? (
          <ActivityIndicator color={colors.primaryContrast} />
        ) : (
          <Text style={[styles.buttonText, { color: colors.primaryContrast, fontFamily: typography.fonts.bold, fontSize: typography.sizes.lg }]}>
            Sign In with AuthHub
          </Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity onPress={() => router.push('/auth/register' as any)} style={styles.link}>
        <Text style={[styles.hint, { color: colors.textSecondary, fontFamily: typography.fonts.regular, fontSize: typography.sizes.sm }]}>
          Don't have an account? <Text style={{ color: colors.primary, fontFamily: typography.fonts.bold }}>Register</Text>
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
  },
  header: {
    marginBottom: 40,
    alignItems: 'center',
  },
  title: {
    letterSpacing: -1,
  },
  subtitle: {
    marginTop: 8,
  },
  button: {
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  buttonText: {},
  link: {
    marginTop: 24,
    alignItems: 'center',
  },
  hint: {
    textAlign: 'center',
  },
});
