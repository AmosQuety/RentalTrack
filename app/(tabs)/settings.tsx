// app/(tabs)/settings.tsx
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useDatabase } from '../../hooks/use-db';
import { Settings } from '../../libs/types';
import { BackupService } from '../../services/backup';

export default function SettingsScreen() {
  const { isInitialized, getSettings, updateSettings } = useDatabase();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const loadSettings = async () => {
    if (!isInitialized) return;
    
    try {
      const settingsData = await getSettings();
      setSettings(settingsData);
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  };

  useEffect(() => {
    loadSettings();
  }, [isInitialized]);

  const updateSetting = async (key: keyof Settings, value: any) => {
    if (!settings) return;

    setIsLoading(true);
    try {
      await updateSettings({ [key]: value });
      setSettings(prev => prev ? { ...prev, [key]: value } : null);
      await loadSettings();
    } catch (error) {
      console.error('Failed to update setting:', error);
      Alert.alert('Error', 'Failed to update setting');
    } finally {
      setIsLoading(false);
    }
  };

  const handleExportData = async () => {
    try {
      await BackupService.exportData();
    } catch (error) {
      Alert.alert('Error', 'Failed to export data');
    }
  };

  const handleImportData = async () => {
    try {
      await BackupService.importData();
    } catch (error) {
      Alert.alert('Error', 'Failed to import data');
    }
  };

  if (!isInitialized || !settings) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading settings...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Settings</Text>
      </View>

      {/* Notification Settings */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Notifications</Text>
        
        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Enable Notifications</Text>
            <Text style={styles.settingDescription}>
              Receive rent due reminders
            </Text>
          </View>
          <Switch
            value={settings.notification_enabled}
            onValueChange={(value) => updateSetting('notification_enabled', value ? 1 : 0)}
            disabled={isLoading}
          />
        </View>

        <View style={styles.settingGroup}>
          <Text style={styles.settingLabel}>Reminder Days Before Due</Text>
          <View style={styles.optionsContainer}>
            {[1, 2, 3, 5, 7].map(days => (
              <TouchableOpacity
                key={days}
                onPress={() => updateSetting('reminder_days_before_due', days)}
                style={[
                  styles.optionButton,
                  settings.reminder_days_before_due === days && styles.optionButtonSelected
                ]}
              >
                <Text style={[
                  styles.optionText,
                  settings.reminder_days_before_due === days && styles.optionTextSelected
                ]}>
                  {days} day{days > 1 ? 's' : ''}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.settingGroup}>
          <Text style={styles.settingLabel}>Reminder Time</Text>
          <View style={styles.optionsContainer}>
            {['06:00', '09:00', '12:00', '15:00', '18:00'].map(time => (
              <TouchableOpacity
                key={time}
                onPress={() => updateSetting('reminder_time', time)}
                style={[
                  styles.optionButton,
                  settings.reminder_time === time && styles.optionButtonSelected
                ]}
              >
                <Text style={[
                  styles.optionText,
                  settings.reminder_time === time && styles.optionTextSelected
                ]}>
                  {time}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>

      {/* General Settings */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>General</Text>
        
        <View style={styles.settingGroup}>
          <Text style={styles.settingLabel}>Currency</Text>
          <View style={styles.optionsContainer}>
            {['UGX', 'USD', 'EUR', 'KES', 'TZS'].map(currency => (
              <TouchableOpacity
                key={currency}
                onPress={() => updateSetting('currency', currency)}
                style={[
                  styles.optionButton,
                  settings.currency === currency && styles.optionButtonSelected
                ]}
              >
                <Text style={[
                  styles.optionText,
                  settings.currency === currency && styles.optionTextSelected
                ]}>
                  {currency}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.settingGroup}>
          <Text style={styles.settingLabel}>Theme</Text>
          <View style={styles.optionsContainer}>
            {['Light', 'Dark', 'Auto'].map(theme => (
              <TouchableOpacity
                key={theme}
                onPress={() => updateSetting('theme', theme)}
                style={[
                  styles.optionButton,
                  settings.theme === theme && styles.optionButtonSelected
                ]}
              >
                <Text style={[
                  styles.optionText,
                  settings.theme === theme && styles.optionTextSelected
                ]}>
                  {theme}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>

      {/* Data Management */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Data Management</Text>
        
        <TouchableOpacity
          onPress={handleExportData}
          style={[styles.dataButton, styles.exportButton]}
        >
          <Text style={styles.exportButtonText}>Export Data</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleImportData}
          style={[styles.dataButton, styles.importButton]}
        >
          <Text style={styles.importButtonText}>Import Data</Text>
        </TouchableOpacity>
      </View>

      {/* App Info */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>App Information</Text>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Version</Text>
          <Text style={styles.infoValue}>1.0.0</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Build Date</Text>
          <Text style={styles.infoValue}>
            {new Date().toLocaleDateString()}
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 8,
    color: '#6B7280',
  },
  header: {
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  section: {
    backgroundColor: '#FFFFFF',
    margin: 16,
    padding: 16,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 16,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  settingInfo: {
    flex: 1,
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 4,
  },
  settingDescription: {
    fontSize: 14,
    color: '#6B7280',
  },
  settingGroup: {
    marginBottom: 16,
  },
  optionsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
  },
  optionButton: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8,
    marginBottom: 8,
    backgroundColor: '#FFFFFF',
  },
  optionButtonSelected: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  optionText: {
    fontSize: 14,
    color: '#374151',
  },
  optionTextSelected: {
    color: '#FFFFFF',
  },
  dataButton: {
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    alignItems: 'center',
  },
  exportButton: {
    backgroundColor: '#DBEAFE',
    borderWidth: 1,
    borderColor: '#3B82F6',
  },
  importButton: {
    backgroundColor: '#D1FAE5',
    borderWidth: 1,
    borderColor: '#10B981',
  },
  exportButtonText: {
    color: '#1E40AF',
    fontSize: 16,
    fontWeight: '600',
  },
  importButtonText: {
    color: '#065F46',
    fontSize: 16,
    fontWeight: '600',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  infoLabel: {
    fontSize: 14,
    color: '#6B7280',
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
  },
});