/**
 * ImportModal — Bottom-sheet interface for picking and importing a CSV file.
 */
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Database } from '../db/database';
import { useAuth } from '../context/AuthContext';
import { CSVImportResult, CSVService } from '../services/CSVService';
import { captureException } from '../services/logger/monitoring';

interface ImportModalProps {
  visible: boolean;
  onClose: () => void;
  onImportComplete: () => void;
}

export function ImportModal({ visible, onClose, onImportComplete }: ImportModalProps) {
  const { user } = useAuth();
  const [isProcessing, setIsProcessing] = useState(false);
  const [preview, setPreview] = useState<CSVImportResult | null>(null);

  const handlePickFile = async () => {
    try {
      setPreview(null);
      const res = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'application/vnd.ms-excel', 'text/comma-separated-values', 'text/plain'],
        copyToCacheDirectory: true,
      });

      if (res.canceled || !res.assets || res.assets.length === 0) return;

      setIsProcessing(true);
      const fileUri = res.assets[0].uri;
      const content = await FileSystem.readAsStringAsync(fileUri, {
        encoding: 'utf8',
      });

      const parsed = CSVService.parseTenantsCSV(content);
      setPreview(parsed);
    } catch (err) {
      captureException(err instanceof Error ? err : new Error(String(err)), { actionType: 'CSV_PICK_ERROR' });
      Alert.alert('Error reading file', 'Could not open the selected CSV file. Please make sure it is a valid text file.');
    } finally {
      setIsProcessing(false);
    }
  };

  const executeImport = async () => {
    if (!preview || preview.imported.length === 0) return;
    setIsProcessing(true);
    let successCount = 0;
    let duplicateCount = 0;
    let errorCount = 0;

    try {
      if (!user) {
        Alert.alert('Error', 'You must be logged in to import data.');
        return;
      }

      console.log(`🚀 Starting import of ${preview.imported.length} rows...`);

      for (const row of preview.imported) {
        try {
          await Database.addTenant(user.user_id, {
            name: row.name,
            phone: row.phone,
            roomNumber: row.roomNumber,
            startDate: row.startDate,
            contractEndDate: row.contractEndDate,
            monthlyRent: row.monthlyRent,
            rentCycle: row.rentCycle,
            notes: row.notes,
          });

          // Seed with initial payment if provided
          if (row.totalPaid && row.totalPaid > 0) {
            await Database.recordPayment(user.user_id, {
              tenantId: tenantId,
              amountPaid: row.totalPaid,
              paymentDate: row.lastPaymentDate || row.startDate,
              paymentMethod: 'Import',
              notes: 'Initial balance from import',
            });
          }

          successCount++;
          if (successCount % 10 === 0) {
            console.log(`✅ Progress: ${successCount} imported...`);
          }
        } catch (err) {
          if (err instanceof Error && err.name === 'RoomAlreadyExistsError') {
            duplicateCount++;
          } else {
            console.error(`❌ Row Error (${row.name}):`, err);
            errorCount++;
          }
        }
      }

      let message = `Successfully imported ${successCount} tenants.`;
      if (duplicateCount > 0) message += `\n\nSkipped ${duplicateCount} duplicates (room numbers already exist).`;
      if (errorCount > 0) message += `\n\nFailed to import ${errorCount} rows due to unexpected errors.`;

      Alert.alert('Import Complete', message);
      onClose();
      onImportComplete();
    } catch (err) {
      captureException(err instanceof Error ? err : new Error(String(err)), { actionType: 'CSV_EXECUTE_ERROR' });
      Alert.alert('Import Error', 'A critical error occurred. Some data may not have been imported.');
    } finally {
      setIsProcessing(false);
      setPreview(null);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Import Tenants</Text>
          <TouchableOpacity onPress={onClose} disabled={isProcessing}>
            <Text style={styles.closeBtn}>Close</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.instruction}>
            Import multiple tenants at once using a CSV spreadsheet.
          </Text>

          <View style={styles.formatBox}>
            <Text style={styles.formatTitle}>Required Columns:</Text>
            <Text style={styles.formatText}>name, room_number, start_date (YYYY-MM-DD), monthly_rent</Text>
            
            <Text style={[styles.formatTitle, { marginTop: 12 }]}>Optional Columns:</Text>
            <Text style={styles.formatText}>phone, rent_cycle, contract_end_date, notes, total_paid, last_payment_date</Text>
          </View>

          {!preview && (
            <TouchableOpacity 
              style={[styles.primaryButton, isProcessing && styles.btnDisabled]} 
              onPress={handlePickFile}
              disabled={isProcessing}
            >
              {isProcessing ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.primaryButtonText}>Select CSV File</Text>
              )}
            </TouchableOpacity>
          )}

          {preview && (
            <View style={styles.previewBox}>
              <Text style={styles.previewTitle}>Preview Results</Text>
              
              <View style={styles.statRow}>
                <Text style={styles.statLabel}>Ready to Import:</Text>
                <Text style={[styles.statValue, { color: '#059669' }]}>{preview.imported.length} rows</Text>
              </View>
              
              <View style={styles.statRow}>
                <Text style={styles.statLabel}>Skipped / Empty:</Text>
                <Text style={styles.statValue}>{preview.skipped}</Text>
              </View>

              {preview.errors.length > 0 && (
                <View style={styles.errorBox}>
                  <Text style={styles.errorHeader}>{preview.errors.length} Format Error(s):</Text>
                  {preview.errors.slice(0, 5).map((err, i) => (
                    <Text key={i} style={styles.errorText}>Row {err.row}: {err.reason}</Text>
                  ))}
                  {preview.errors.length > 5 && (
                    <Text style={styles.errorText}>...and {preview.errors.length - 5} more</Text>
                  )}
                </View>
              )}

              <View style={styles.actionRow}>
                <TouchableOpacity 
                  style={[styles.secondaryButton, isProcessing && styles.btnDisabled]} 
                  onPress={() => setPreview(null)}
                  disabled={isProcessing}
                >
                  <Text style={styles.secondaryButtonText}>Try Another File</Text>
                </TouchableOpacity>

                <TouchableOpacity 
                  style={[
                    styles.primaryButton, 
                    styles.executeButton, 
                    (isProcessing || preview.imported.length === 0) && styles.btnDisabled
                  ]} 
                  onPress={executeImport}
                  disabled={isProcessing || preview.imported.length === 0}
                >
                  <Text style={styles.primaryButtonText}>Start Import</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  title: { fontSize: 18, fontWeight: '700', color: '#1F2937' },
  closeBtn: { fontSize: 16, color: '#3B82F6', fontWeight: '500' },
  content: { padding: 20 },
  instruction: { fontSize: 15, color: '#4B5563', marginBottom: 20, lineHeight: 22 },
  formatBox: {
    backgroundColor: '#F3F4F6',
    padding: 16,
    borderRadius: 8,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  formatTitle: { fontSize: 13, fontWeight: '600', color: '#374151', textTransform: 'uppercase', marginBottom: 6 },
  formatText: { fontSize: 14, fontFamily: 'monospace', color: '#1F2937' },
  primaryButton: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  btnDisabled: { opacity: 0.5 },
  previewBox: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 12,
    padding: 16,
  },
  previewTitle: { fontSize: 16, fontWeight: '700', color: '#1F2937', marginBottom: 12 },
  statRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  statLabel: { fontSize: 15, color: '#4B5563' },
  statValue: { fontSize: 15, fontWeight: '600', color: '#1F2937' },
  errorBox: {
    marginTop: 12,
    padding: 12,
    backgroundColor: '#FEF2F2',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  errorHeader: { fontSize: 14, fontWeight: '600', color: '#B91C1C', marginBottom: 4 },
  errorText: { fontSize: 13, color: '#991B1B', marginBottom: 2 },
  actionRow: { flexDirection: 'row', marginTop: 20, gap: 12 },
  secondaryButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  secondaryButtonText: { color: '#374151', fontSize: 15, fontWeight: '600' },
  executeButton: { flex: 1, backgroundColor: '#059669' },
});
