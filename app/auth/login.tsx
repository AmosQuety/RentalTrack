import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, Alert, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../theme/ThemeContext';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { signIn } = useAuth();
  const router = useRouter();
  const { colors, typography, isDark } = useTheme();

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please enter email and password');
      return;
    }

    setLoading(true);
    const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
    try {
      const response = await fetch(`${apiUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      });

      const data = await response.json();

      if (response.ok) {
        await signIn(data.token);
        // Navigation is handled by the guard in _layout.tsx
      } else {
        Alert.alert('Login Failed', data.error || 'Invalid credentials');
      }
    } catch (error) {
      Logger.error('Login: Error', error);
      
      let message = 'Could not connect to server. Please check your connection.';
      if (apiUrl.includes('localhost') && Platform.OS !== 'web') {
        message = 'Connection failed: "localhost" is not accessible from a physical device. Please update EXPO_PUBLIC_API_URL in your .env to your machine\'s local IP.';
      }
      
      Alert.alert('Network Error', message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text, fontFamily: typography.fonts.bold, fontSize: typography.sizes.hero }]}>RentalTrack</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary, fontFamily: typography.fonts.regular, fontSize: typography.sizes.md }]}>Manage your properties with ease</Text>
      </View>

      <View style={styles.form}>
        <Text style={[styles.label, { color: colors.text, fontFamily: typography.fonts.semibold, fontSize: typography.sizes.sm }]}>Email Address</Text>
        <TextInput
          style={[styles.input, { 
            backgroundColor: colors.inputBackground,
            color: colors.text,
            borderColor: colors.border,
            fontFamily: typography.fonts.regular,
            fontSize: typography.sizes.md
          }]}
          placeholder="Enter your email"
          placeholderTextColor={isDark ? '#9CA3AF' : '#6B7280'}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />

        <Text style={[styles.label, { color: colors.text, fontFamily: typography.fonts.semibold, fontSize: typography.sizes.sm }]}>Password</Text>
        <TextInput
          style={[styles.input, { 
            backgroundColor: colors.inputBackground,
            color: colors.text,
            borderColor: colors.border,
            fontFamily: typography.fonts.regular,
            fontSize: typography.sizes.md
          }]}
          placeholder="Enter your password"
          placeholderTextColor={isDark ? '#9CA3AF' : '#6B7280'}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        <TouchableOpacity 
          style={[styles.button, { backgroundColor: colors.primary }]} 
          onPress={handleLogin}
          disabled={loading}
        >
          {loading ? <ActivityIndicator color={colors.primaryContrast} /> : <Text style={[styles.buttonText, { color: colors.primaryContrast, fontFamily: typography.fonts.bold, fontSize: typography.sizes.lg }]}>Sign In</Text>}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.push('/auth/register' as any)} style={styles.link}>
          <Text style={[styles.linkText, { color: colors.textSecondary, fontFamily: typography.fonts.regular, fontSize: typography.sizes.sm }]}>
            Don't have an account? <Text style={{ color: colors.primary, fontFamily: typography.fonts.bold }}>Register</Text>
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

// Added for compilation
const Logger = { error: (...args: any[]) => console.error('[Login]', ...args) };

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
  form: {
    width: '100%',
  },
  label: {
    marginBottom: 8,
  },
  input: {
    height: 52,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
    marginBottom: 20,
  },
  button: {
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  buttonText: {
  },
  link: {
    marginTop: 24,
    alignItems: 'center',
  },
  linkText: {
  },
});
