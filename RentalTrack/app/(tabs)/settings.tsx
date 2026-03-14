// app/(tabs)/settings.tsx — Phase 6 + Smart Notifications: added Broadcast card
import React, { useState } from 'react';
import { useEffect } from 'react';
import { useDatabase } from '../../hooks/use-db';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Database } from '../../db/database';
import { useAuth } from '../../context/AuthContext';
import { Settings as SettingsType, Tenant } from '../../libs/types';
import { SmartScheduler } from '../../services/notifications/SmartScheduler';
import { Logger } from '../../services/logger/index';
import { captureException } from '../../services/logger/monitoring';
import { useTheme } from '../../theme/ThemeContext';
import { Card } from '../../components/ui/Card';

const Settings = () => {
  const { colors, typography, isDark } = useTheme();
  const { user } = useAuth();
  const [settings, setSettings] = useState<SettingsType | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showDeveloperOptions, setShowDeveloperOptions] = useState(false);
  const [tapCount, setTapCount] = useState(0);
  const { isInitialized } = useDatabase();

  // Broadcast state
  const [broadcastTitle, setBroadcastTitle] = useState('');
  const [broadcastBody, setBroadcastBody] = useState('');
  const [isSendingBroadcast, setIsSendingBroadcast] = useState(false);

  const loadSettings = async () => {
    if (!user) return;
    try {
      const settingsData = await Database.getSettings(user.user_id);
      setSettings(settingsData);
    } catch (error) {
      captureException(error instanceof Error ? error : new Error(String(error)), {
        actionType: 'SETTINGS_LOAD_FAILED',
      });
    }
  };

  useEffect(() => {
    if (isInitialized && user) {
      loadSettings();
    }
  }, [isInitialized, user]);

  const updateSetting = async (key: keyof SettingsType, value: unknown) => {
    if (!settings || !user) return;
    setIsLoading(true);
    try {
      await Database.updateSettings(user.user_id, { [key]: value });
      setSettings(prev => prev ? { ...prev, [key]: value } : null);
      await loadSettings();
    } catch (error) {
      Alert.alert('Error', 'Failed to update setting');
    } finally {
      setIsLoading(false);
    }
  };

  const formatDisplayDate = (isoDate: string): string => {
    const date = new Date(isoDate);
    return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
  };

  const handleVersionTap = () => {
    const newCount = tapCount + 1;
    setTapCount(newCount);
    if (newCount >= 5) {
      setShowDeveloperOptions(true);
      setTapCount(0);
      Alert.alert('👨‍💻 Developer Mode', 'Developer options unlocked!');
    }
  };

  // ── Broadcast handler ──────────────────────────────────────────────────────
  const handleSendBroadcast = async () => {
    if (!broadcastTitle.trim() || !broadcastBody.trim()) {
      Alert.alert('Missing Fields', 'Please enter both a title and a message.');
      return;
    }

    Alert.alert(
      '📢 Send Announcement?',
      `"${broadcastTitle.trim()}"\n\n${broadcastBody.trim()}\n\nThis will appear as a push notification on this device immediately.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send',
          style: 'default',
          onPress: async () => {
            setIsSendingBroadcast(true);
            try {
              await SmartScheduler.broadcastNotification(
                broadcastTitle.trim(),
                broadcastBody.trim()
              );
              Logger.info('Broadcast sent from settings', {
                actionType: 'BROADCAST_UI',
                title: broadcastTitle.trim(),
              });
              setBroadcastTitle('');
              setBroadcastBody('');
              Alert.alert('✅ Sent', 'Announcement will appear momentarily.');
            } catch (err) {
              captureException(err instanceof Error ? err : new Error(String(err)), {
                actionType: 'BROADCAST_UI_FAILED',
              });
              Alert.alert('❌ Failed', 'Could not send the announcement. Please try again.');
            } finally {
              setIsSendingBroadcast(false);
            }
          },
        },
      ]
    );
  };

  if (!settings) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading settings...</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.card, shadowColor: colors.text }]}>
        <Text style={[styles.title, { color: colors.text }]}>Settings</Text>
      </View>

      {/* ── Notification Settings ─────────────────────────────────────── */}
      <Card style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>🔔 Notifications</Text>

        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <Text style={[styles.settingLabel, { color: colors.text }]}>Enable Notifications</Text>
            <Text style={[styles.settingDescription, { color: colors.textSecondary }]}>
              Receive rent due, overdue, and contract reminders
            </Text>
          </View>
          <Switch
            value={settings.notification_enabled === 1}
            onValueChange={(v) => updateSetting('notification_enabled', v ? 1 : 0)}
            disabled={isLoading}
          />
        </View>

        <View style={styles.settingGroup}>
          <Text style={[styles.settingLabel, { color: colors.text }]}>Reminder Days Before Due</Text>
          <View style={styles.optionsContainer}>
            {[1, 2, 3, 5, 7].map(days => (
              <TouchableOpacity
                key={days}
                onPress={() => updateSetting('reminder_days_before_due', days)}
                style={[
                  styles.optionButton,
                  { backgroundColor: isDark ? colors.inputBackground : '#FFFFFF', borderColor: isDark ? colors.border : '#D1D5DB' },
                  settings.reminder_days_before_due === days && { backgroundColor: colors.primary, borderColor: colors.primary },
                ]}
              >
                <Text style={[
                  styles.optionText,
                  { color: isDark ? colors.text : '#374151' },
                  settings.reminder_days_before_due === days && styles.optionTextSelected,
                ]}>
                  {days}d
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.settingGroup}>
          <Text style={[styles.settingLabel, { color: colors.text }]}>Reminder Time</Text>
          <View style={styles.optionsContainer}>
            {['06:00', '09:00', '12:00', '15:00', '18:00'].map(time => (
              <TouchableOpacity
                key={time}
                onPress={() => updateSetting('reminder_time', time)}
                style={[
                  styles.optionButton,
                  { backgroundColor: isDark ? colors.inputBackground : '#FFFFFF', borderColor: isDark ? colors.border : '#D1D5DB' },
                  settings.reminder_time === time && { backgroundColor: colors.primary, borderColor: colors.primary },
                ]}
              >
                <Text style={[
                  styles.optionText,
                  { color: isDark ? colors.text : '#374151' },
                  settings.reminder_time === time && styles.optionTextSelected,
                ]}>
                  {time}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Card>

      {/* ── Broadcast Announcement ───────────────────────────────────────── */}
      <Card style={[styles.section, styles.broadcastSection]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>📢 Send Announcement</Text>
        <Text style={[styles.settingDescription, { color: colors.textSecondary }]}>
          Push a custom message to this device immediately — useful for maintenance notices,
          collection reminders, or any urgent update.
        </Text>

        <TextInput
          style={[styles.broadcastInput, { backgroundColor: isDark ? colors.inputBackground : '#F9FAFB', color: colors.text, borderColor: isDark ? colors.border : '#D1D5DB' }]}
          placeholder="Title (e.g. Water pump maintenance)"
          placeholderTextColor={colors.textSecondary}
          value={broadcastTitle}
          onChangeText={setBroadcastTitle}
          maxLength={60}
        />
        <TextInput
          style={[styles.broadcastInput, styles.broadcastBody, { backgroundColor: isDark ? colors.inputBackground : '#F9FAFB', color: colors.text, borderColor: isDark ? colors.border : '#D1D5DB' }]}
          placeholder="Message (e.g. Tomorrow 8am–12pm, no water supply)"
          placeholderTextColor={colors.textSecondary}
          value={broadcastBody}
          onChangeText={setBroadcastBody}
          multiline
          numberOfLines={3}
          maxLength={200}
          textAlignVertical="top"
        />

        <TouchableOpacity
          style={[styles.broadcastButton, isSendingBroadcast && styles.broadcastButtonDisabled]}
          onPress={handleSendBroadcast}
          disabled={isSendingBroadcast}
        >
          {isSendingBroadcast ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.broadcastButtonText}>Send Now</Text>
          )}
        </TouchableOpacity>
      </Card>

      {/* ── General Settings ─────────────────────────────────────────────── */}
      <Card style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>⚙️ General</Text>

        <View style={styles.settingGroup}>
          <Text style={[styles.settingLabel, { color: colors.text }]}>Auto-Suspend After (Days)</Text>
          <View style={styles.optionsContainer}>
            {[15, 30, 45, 60].map(days => (
              <TouchableOpacity
                key={days}
                onPress={() => updateSetting('auto_suspend_days', days)}
                style={[
                  styles.optionButton,
                  { backgroundColor: isDark ? colors.inputBackground : '#FFFFFF', borderColor: isDark ? colors.border : '#D1D5DB' },
                  settings.auto_suspend_days === days && { backgroundColor: colors.primary, borderColor: colors.primary },
                ]}
              >
                <Text style={[
                  styles.optionText,
                  { color: isDark ? colors.text : '#374151' },
                  settings.auto_suspend_days === days && styles.optionTextSelected,
                ]}>
                  {days}d
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.settingGroup}>
          <Text style={[styles.settingLabel, { color: colors.text }]}>Contract Reminder (Days Before)</Text>
          <View style={styles.optionsContainer}>
            {[30, 60, 90].map(days => (
              <TouchableOpacity
                key={days}
                onPress={() => updateSetting('contract_reminder_days', days)}
                style={[
                  styles.optionButton,
                  { backgroundColor: isDark ? colors.inputBackground : '#FFFFFF', borderColor: isDark ? colors.border : '#D1D5DB' },
                  settings.contract_reminder_days === days && { backgroundColor: colors.primary, borderColor: colors.primary },
                ]}
              >
                <Text style={[
                  styles.optionText,
                  { color: isDark ? colors.text : '#374151' },
                  settings.contract_reminder_days === days && styles.optionTextSelected,
                ]}>
                  {days}d
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Card>

      {/* ── Developer Options (Hidden) ──────────────────────────────────── */}
      {showDeveloperOptions && (
        <Card style={[styles.section, styles.developerSection]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>🧪 Developer Tests</Text>

          <TouchableOpacity
            style={[styles.optionButton, { width: '100%', alignItems: 'center', marginBottom: 8, backgroundColor: isDark ? colors.inputBackground : '#FFFFFF', borderColor: isDark ? colors.border : '#D1D5DB' }]}
            onPress={async () => {
              try {
                // Fire all 6 tiers immediately for the first active tenant
                const db = await import('../../db/shared-db').then(m =>
                  m.getSharedDb()
                );
                const tenant = await db.getFirstAsync<Tenant>(
                  `SELECT * FROM tenants WHERE status != 'Suspended' LIMIT 1`
                );
                if (tenant) {
                  await SmartScheduler.__devFireAllTiersNow(tenant);
                  Alert.alert('✅ Dev', 'All 6 notification tiers fired! Check tray in ~60 sec.');
                } else {
                  Alert.alert('⚠️ No tenants', 'Add a tenant first.');
                }
              } catch (e: unknown) {
                Alert.alert('❌ Error', e instanceof Error ? e.message : String(e));
              }
            }}
          >
            <Text style={[styles.optionText, { color: colors.text }]}>Fire All Notification Tiers</Text>
          </TouchableOpacity>

          <Text style={styles.developerNote}>Check console logs for detailed results</Text>
        </Card>
      )}

      {/* ── App Info ─────────────────────────────────────────────────────── */}
      <Card style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>App Information</Text>
        <View style={[styles.infoRow, { borderBottomColor: colors.border }]}>
          <Text style={styles.infoLabel}>Version</Text>
          <TouchableOpacity onPress={handleVersionTap}>
            <Text style={[styles.infoValue, { color: colors.text }]}>1.2.0</Text>
          </TouchableOpacity>
        </View>
        <View style={[styles.infoRow, { borderBottomColor: colors.border }]}>
          <Text style={styles.infoLabel}>Build Date</Text>
          <Text style={[styles.infoValue, { color: colors.text }]}>25/02/2026</Text>
        </View>
        {!showDeveloperOptions && tapCount > 0 && (
          <Text style={styles.hintText}>
            Tap version {5 - tapCount} more time{5 - tapCount === 1 ? '' : 's'} for dev options
          </Text>
        )}
      </Card>
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
  loadingText: { marginTop: 8, color: '#6B7280' },
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
  title: { fontSize: 24, fontWeight: 'bold', color: '#1F2937' },
  section: {
    marginBottom: 16,
  },
  broadcastSection: {
    borderLeftWidth: 4,
    borderLeftColor: '#0EA5E9',
  },
  developerSection: { borderColor: '#F59E0B', borderWidth: 2 },
  sectionTitle: { fontSize: 18, fontWeight: '600', color: '#1F2937', marginBottom: 16 },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  settingInfo: { flex: 1 },
  settingLabel: { fontSize: 16, fontWeight: '500', color: '#374151', marginBottom: 4 },
  settingDescription: { fontSize: 13, color: '#6B7280', marginBottom: 12 },
  settingGroup: { marginBottom: 16 },
  optionsContainer: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 },
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
  optionButtonSelected: { backgroundColor: '#007AFF', borderColor: '#007AFF' },
  optionText: { fontSize: 14, color: '#374151' },
  optionTextSelected: { color: '#FFFFFF' },
  broadcastInput: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: '#1F2937',
    backgroundColor: '#F9FAFB',
    marginBottom: 10,
  },
  broadcastBody: { minHeight: 72 },
  broadcastButton: {
    backgroundColor: '#0EA5E9',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  broadcastButtonDisabled: { opacity: 0.6 },
  broadcastButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  developerNote: {
    fontSize: 12, color: '#6B7280', textAlign: 'center', marginTop: 8, fontStyle: 'italic',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  infoLabel: { fontSize: 14, color: '#6B7280' },
  infoValue: { fontSize: 14, fontWeight: '500', color: '#374151' },
  hintText: {
    fontSize: 12, color: '#F59E0B', textAlign: 'center', marginTop: 8, fontStyle: 'italic',
  },
});