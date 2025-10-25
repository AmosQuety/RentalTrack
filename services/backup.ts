// services/backup.ts
import * as FileSystem from 'expo-file-system';
import { Database } from '../db/database';
import { Alert, Platform } from 'react-native';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';

export class BackupService {
  static async exportData() {
    try {
      const tenants = await Database.getAllTenants();
      const settings = await Database.getSettings();
      
      const payments = [];
      for (const tenant of tenants) {
        const tenantPayments = await Database.getPaymentHistory(tenant.tenant_id);
        payments.push(...tenantPayments);
      }
      
      const reminders = await Database.getUpcomingReminders(365); // Next year

      const exportData = {
        tenants,
        payments,
        reminders,
        settings,
        exportDate: new Date().toISOString(),
        version: '1.0.0'
      };

      const jsonString = JSON.stringify(exportData, null, 2);
      const fileUri = FileSystem.documentDirectory + `rent_reminder_backup_${Date.now()}.json`;
      
      await FileSystem.writeAsStringAsync(fileUri, jsonString, {
        encoding: FileSystem.EncodingType.UTF8
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'application/json',
          dialogTitle: 'Export Rent Reminder Data'
        });
      } else {
        Alert.alert('Export Complete', `File saved to: ${fileUri}`);
      }

      return fileUri;
    } catch (error) {
      console.error('Export failed:', error);
      Alert.alert('Export Failed', 'Could not export data');
      throw error;
    }
  }

  static async importData() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/json',
        copyToCacheDirectory: true
      });

      if (result.canceled) return;

      const fileUri = result.assets[0].uri;
      const fileContent = await FileSystem.readAsStringAsync(fileUri);
      const importData = JSON.parse(fileContent);

      if (!importData.tenants || !importData.payments) {
        throw new Error('Invalid backup file format');
      }

      Alert.alert(
        'Import Data',
        'This will replace your current data. Continue?',
        [
          { text: 'Cancel', style: 'cancel' },
          { 
            text: 'Import', 
            style: 'destructive',
            onPress: async () => {
              console.log('Importing data:', importData);
              // Implement import logic here
              Alert.alert('Info', 'Import functionality to be implemented');
            }
          }
        ]
      );

    } catch (error) {
      console.error('Import failed:', error);
      Alert.alert('Import Failed', 'Could not import data');
    }
  }
}