// src/screens/Settings.tsx
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Database } from '../../db/database';
import { Settings as SettingsType } from '../../libs/types';



const Settings = () => {
  const [settings, setSettings] = useState<SettingsType | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showDeveloperOptions, setShowDeveloperOptions] = useState(false);
  const [tapCount, setTapCount] = useState(0);

  const loadSettings = async () => {
    try {
      const settingsData = await Database.getSettings();
      setSettings(settingsData);
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const updateSetting = async (key: keyof SettingsType, value: any) => {
    if (!settings) return;

    setIsLoading(true);
    try {
      await Database.updateSettings({ [key]: value });
      setSettings(prev => prev ? { ...prev, [key]: value } : null);
      await loadSettings(); // Reload to ensure consistency
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
      // Reload settings after import in case they were updated
      await loadSettings();
    } catch (error) {
      Alert.alert('Error', 'Failed to import data');
    }
  };

  const formatDisplayDate = (isoDate: string): string => {
      const date = new Date(isoDate);
      const day = date.getDate().toString().padStart(2, '0');
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const year = date.getFullYear();
      return `${day}/${month}/${year}`;
  };



  // Secret tap handler to reveal developer options
  const handleVersionTap = () => {
    const newCount = tapCount + 1;
    setTapCount(newCount);
    
    if (newCount >= 5) {
      setShowDeveloperOptions(true);
      setTapCount(0);
      Alert.alert('👨‍💻 Developer Mode', 'Developer options unlocked!');
    }
  };

  

  if (!settings) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading settings...</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
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
          <Text style={styles.settingLabel}>Auto-Suspend After (Days)</Text>
          <View style={styles.optionsContainer}>
            {[15, 30, 45, 60].map(days => (
              <TouchableOpacity
                key={days}
                onPress={() => updateSetting('auto_suspend_days', days)}
                style={[
                  styles.optionButton,
                  settings.auto_suspend_days === days && styles.optionButtonSelected
                ]}
              >
                <Text style={[
                  styles.optionText,
                  settings.auto_suspend_days === days && styles.optionTextSelected
                ]}>
                  {days} days
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.settingGroup}>
          <Text style={styles.settingLabel}>Contract Reminder (Days Before)</Text>
          <View style={styles.optionsContainer}>
            {[30, 60, 90].map(days => (
              <TouchableOpacity
                key={days}
                onPress={() => updateSetting('contract_reminder_days', days)}
                style={[
                  styles.optionButton,
                  settings.contract_reminder_days === days && styles.optionButtonSelected
                ]}
              >
                <Text style={[
                  styles.optionText,
                  settings.contract_reminder_days === days && styles.optionTextSelected
                ]}>
                  {days} days
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>

      

      {/* Developer Options (Hidden) */}
      {showDeveloperOptions && (
        <View style={[styles.section, styles.developerSection]}>
          <Text style={styles.sectionTitle}>🧪 Developer Tests</Text>
          
          {/* Test buttons commented out since test imports are removed */}
          <Text style={styles.developerNote}>
            Test functionality is currently disabled. Enable by uncommenting test imports and functions.
          </Text>
          
          

          <Text style={styles.developerNote}>
            Check console logs for detailed test results
          </Text>
        </View>
      )}

      {/* App Info */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>App Information</Text>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Version</Text>
          <TouchableOpacity onPress={handleVersionTap}>
            <Text style={styles.infoValue}>1.0.0</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.infoRow}>

          <Text style={styles.infoLabel}>Build Date</Text>
          <Text style={styles.infoValue}>
               17/10/2025
          </Text>
        </View>
        
        {/* Hidden hint */}
        {!showDeveloperOptions && tapCount > 0 && (
          <Text style={styles.hintText}>
            Tap version {5 - tapCount} more times for developer options
          </Text>
        )}
      </View>
    </ScrollView>
  );
};

export default Settings;

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: '#F9FAFB',
    padding: 20,
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
    borderRadius: 12,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  section: {
    backgroundColor: '#FFFFFF',
    marginBottom: 16,
    padding: 20,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  developerSection: {
    borderColor: '#F59E0B',
    borderWidth: 2,
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
  
  
  
  developerNote: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 8,
    fontStyle: 'italic',
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
  hintText: {
    fontSize: 12,
    color: '#F59E0B',
    textAlign: 'center',
    marginTop: 8,
    fontStyle: 'italic',
  },
});