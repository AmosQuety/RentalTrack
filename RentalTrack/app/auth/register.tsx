import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, Alert, ActivityIndicator, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../theme/ThemeContext';

export default function RegisterScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { signIn } = useAuth();
  const router = useRouter();
  const { colors, typography, isDark } = useTheme();

  const handleRegister = async () => {
    if (!email || !password || !confirmPassword) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }

    if (password.length < 8) {
      Alert.alert('Error', 'Password must be at least 8 characters');
      return;
    }

    setLoading(true);
    const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
    try {
      const response = await fetch(`${apiUrl}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      });

      const data = await response.json();

      if (response.ok) {
        await signIn(data.token);
        Alert.alert('Success', 'Account created successfully');
        // Navigation is handled by the guard in _layout.tsx
      } else {
        Alert.alert('Registration Failed', data.error || 'Could not create account');
      }
    } catch (error) {
      Logger.error('Register: Error', error);
      
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
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.text, fontFamily: typography.fonts.bold, fontSize: typography.sizes.hero }]}>Create Account</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary, fontFamily: typography.fonts.regular, fontSize: typography.sizes.md }]}>Start managing your properties today</Text>
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
            placeholder="Minimum 8 characters"
            placeholderTextColor={isDark ? '#9CA3AF' : '#6B7280'}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          <Text style={[styles.label, { color: colors.text, fontFamily: typography.fonts.semibold, fontSize: typography.sizes.sm }]}>Confirm Password</Text>
          <TextInput
            style={[styles.input, { 
              backgroundColor: colors.inputBackground,
              color: colors.text,
              borderColor: colors.border,
              fontFamily: typography.fonts.regular,
              fontSize: typography.sizes.md
            }]}
            placeholder="Confirm your password"
            placeholderTextColor={isDark ? '#9CA3AF' : '#6B7280'}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
          />

          <TouchableOpacity 
            style={[styles.button, { backgroundColor: colors.primary }]} 
            onPress={handleRegister}
            disabled={loading}
          >
            {loading ? <ActivityIndicator color={colors.primaryContrast} /> : <Text style={[styles.buttonText, { color: colors.primaryContrast, fontFamily: typography.fonts.bold, fontSize: typography.sizes.lg }]}>Register</Text>}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.push('/auth/login' as any)} style={styles.link}>
            <Text style={[styles.linkText, { color: colors.textSecondary, fontFamily: typography.fonts.regular, fontSize: typography.sizes.sm }]}>
              Already have an account? <Text style={{ color: colors.primary, fontFamily: typography.fonts.bold }}>Sign In</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// Added for compilation
const Logger = { error: (...args: any[]) => console.error('[Register]', ...args) };

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 24,
    flexGrow: 1,
    justifyContent: 'center',
  },
  header: {
    marginBottom: 32,
    alignItems: 'center',
  },
  title: {
    letterSpacing: -1,
  },
  subtitle: {
    marginTop: 8,
    textAlign: 'center',
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
