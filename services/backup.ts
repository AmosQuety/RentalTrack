// services/backup.ts
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Alert } from 'react-native';
import Database from '../db/database';

export class BackupService {
   static async exportData(): Promise<void> {
    try {
      Alert.alert('Export Data', 'Preparing your data for export...');

      const tenants = await Database.getAllTenants();
      const settings = await Database.getSettings();
      const reminders = await Database.getUpcomingReminders(365);
      
      const payments = [];
      for (const tenant of tenants) {
        const tenantPayments = await Database.getPaymentHistory(tenant.tenant_id);
        payments.push(...tenantPayments);
      }

      const exportData = {
        tenants,
        payments,
        reminders,
        settings,
        exportDate: new Date().toISOString(),
        version: '1.0.0',
        appName: 'RentalTrack'
      };

      const jsonString = JSON.stringify(exportData, null, 2);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
      const fileName = `RentalTrack_Backup_${timestamp}.json`;
      const fileUri = FileSystem.documentDirectory + fileName;
      
      // FIX: Use the correct encoding syntax
      await FileSystem.writeAsStringAsync(fileUri, jsonString, {
        encoding: FileSystem.EncodingType.UTF8
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'application/json',
          dialogTitle: 'Export RentalTrack Data',
          UTI: 'public.json'
        });
        
        Alert.alert(
          '✅ Export Successful', 
          `Exported:\n• ${tenants.length} tenants\n• ${payments.length} payments\n• ${reminders.length} reminders`
        );
      } else {
        Alert.alert('Export Complete', `File saved to: ${fileUri}`);
      }
    } catch (error) {
      console.error('Export failed:', error);
      Alert.alert('❌ Export Failed', 'Could not export data. Please try again.');
    }
  }

  


  static async importData(): Promise<void> {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/json',
        copyToCacheDirectory: true
      });

      if (result.canceled) return;

      const fileUri = result.assets[0].uri;
      const fileContent = await FileSystem.readAsStringAsync(fileUri);
      const importData = JSON.parse(fileContent);

      // Validate backup file
      if (!importData.tenants || !importData.version || importData.appName !== 'RentalTrack') {
        Alert.alert('❌ Invalid File', 'This is not a valid RentalTrack backup file.');
        return;
      }

      // Show confirmation with data preview
      Alert.alert(
        'Import Data',
        `This backup contains:\n• ${importData.tenants?.length || 0} tenants\n• ${importData.payments?.length || 0} payments\n• ${importData.reminders?.length || 0} reminders\n\n⚠️ This will REPLACE all your current data!`,
        [
          { text: 'Cancel', style: 'cancel' },
          { 
            text: 'Import', 
            style: 'destructive',
            onPress: async () => {
              try {
                await this.performImport(importData);
                Alert.alert('✅ Import Successful', 'Your data has been restored!');
              } catch (error) {
                console.error('Import error:', error);
                Alert.alert('❌ Import Failed', 'Could not import data. Your existing data is safe.');
              }
            }
          }
        ]
      );
    } catch (error) {
      console.error('Import failed:', error);
      Alert.alert('❌ Import Failed', 'Could not read the backup file.');
    }
  }

  private static async performImport(data: any): Promise<void> {
    const db = Database.getDb();

    try {
      // Start transaction
      await db.execAsync('BEGIN TRANSACTION;');

      // Clear existing data
      await db.runAsync('DELETE FROM reminders;');
      await db.runAsync('DELETE FROM payments;');
      await db.runAsync('DELETE FROM tenants;');

      // Import tenants
      for (const tenant of data.tenants || []) {
        await db.runAsync(
          `INSERT INTO tenants (tenant_id, name, phone, room_number, start_date, monthly_rent, status, notes, created_at, updated_at) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            tenant.tenant_id,
            tenant.name,
            tenant.phone,
            tenant.room_number,
            tenant.start_date,
            tenant.monthly_rent,
            tenant.status,
            tenant.notes,
            tenant.created_at,
            tenant.updated_at
          ]
        );
      }

      // Import payments
      for (const payment of data.payments || []) {
        await db.runAsync(
          `INSERT INTO payments (payment_id, tenant_id, amount_paid, months_paid_for, payment_date, next_due_date, payment_method, notes, created_at) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            payment.payment_id,
            payment.tenant_id,
            payment.amount_paid,
            payment.months_paid_for,
            payment.payment_date,
            payment.next_due_date,
            payment.payment_method,
            payment.notes,
            payment.created_at
          ]
        );
      }

      // Import reminders (skip if in the past)
      const now = new Date().toISOString();
      for (const reminder of data.reminders || []) {
        if (reminder.reminder_date > now) {
          await db.runAsync(
            `INSERT INTO reminders (reminder_id, tenant_id, due_date, reminder_date, status, message, created_at) 
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              reminder.reminder_id,
              reminder.tenant_id,
              reminder.due_date,
              reminder.reminder_date,
              reminder.status,
              reminder.message,
              reminder.created_at
            ]
          );
        }
      }

      // Update settings if provided
      if (data.settings) {
        await Database.updateSettings(data.settings);
      }

      // Commit transaction
      await db.execAsync('COMMIT;');
      
      console.log('✅ Import completed successfully');
    } catch (error) {
      // Rollback on error
      await db.execAsync('ROLLBACK;');
      throw error;
    }
  }
}