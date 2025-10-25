// app/tenant-details.tsx
import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useDatabase } from '../hooks/use-db';
import { Tenant, Payment } from '../libs/types';

export default function TenantDetails() {
  const { tenantId } = useLocalSearchParams();
  const router = useRouter();
  const { isInitialized, getTenant, getPaymentHistory } = useDatabase();
  
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);

  const handleCreateReminder = async () => {
    try {
      const { NotificationService } = await import('../services/notifications');
      
      const lastPayment = payments[0];
      const nextDueDate = lastPayment?.next_due_date || 
        new Date(new Date().setMonth(new Date().getMonth() + 1)).toISOString().split('T')[0];
      
      await NotificationService.createReminder(
        parseInt(tenantId as string),
        nextDueDate,
        `Manual reminder for ${tenant?.name}`
      );
      
      Alert.alert('Success', 'Reminder created successfully!');
    } catch (error) {
      console.error('Failed to create reminder:', error);
      Alert.alert('Error', 'Failed to create reminder');
    }
  };

  const loadTenantData = async () => {
    if (!tenantId || !isInitialized) return;
    
    try {
      const tenantData = await getTenant(parseInt(tenantId as string));
      setTenant(tenantData);

      if (tenantData) {
        const paymentData = await getPaymentHistory(tenantData.tenant_id);
        setPayments(paymentData);
      }
    } catch (error) {
      console.error('Failed to load tenant data:', error);
      Alert.alert('Error', 'Failed to load tenant details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTenantData();
  }, [tenantId, isInitialized]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Paid': return '#10B981';
      case 'Due Soon': return '#F59E0B';
      case 'Overdue': return '#EF4444';
      default: return '#6B7280';
    }
  };

  const handleRecordPayment = () => {
    router.push(`/record-payment?tenantId=${tenantId}`);
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <Text>Loading tenant details...</Text>
      </View>
    );
  }

  if (!tenant) {
    return (
      <View style={styles.centerContainer}>
        <Text>Tenant not found</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      {/* Header Card */}
      <View style={styles.headerCard}>
        <View style={styles.tenantHeader}>
          <View style={styles.tenantInfo}>
            <Text style={styles.tenantName}>{tenant.name}</Text>
            <Text style={styles.roomNumber}>Room {tenant.room_number}</Text>
          </View>
          <View 
            style={[
              styles.statusBadge,
              { backgroundColor: getStatusColor(tenant.status) + '20' }
            ]}
          >
            <Text 
              style={[
                styles.statusText,
                { color: getStatusColor(tenant.status) }
              ]}
            >
              {tenant.status}
            </Text>
          </View>
        </View>

        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Phone:</Text>
          <Text style={styles.detailValue}>{tenant.phone || 'Not provided'}</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Monthly Rent:</Text>
          <Text style={styles.detailValue}>{tenant.monthly_rent} UGX</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Move-in Date:</Text>
          <Text style={styles.detailValue}>
            {new Date(tenant.start_date).toLocaleDateString()}
          </Text>
        </View>
        
        {tenant.notes ? (
          <View style={styles.notesContainer}>
            <Text style={styles.detailLabel}>Notes:</Text>
            <Text style={styles.notesText}>{tenant.notes}</Text>
          </View>
        ) : null}
      </View>

      {/* Actions */}
      <View style={styles.actionsContainer}>
        <TouchableOpacity
          onPress={handleRecordPayment}
          style={styles.primaryButton}
        >
          <Text style={styles.primaryButtonText}>Record Payment</Text>
        </TouchableOpacity>
{/* 
        <TouchableOpacity
          onPress={handleCreateReminder}
          style={styles.secondaryButton}
        >
          <Text style={styles.secondaryButtonText}>Create Reminder</Text>
        </TouchableOpacity> */}
      </View>

      {/* Payment History */}
      <View style={styles.paymentSection}>
        <Text style={styles.sectionTitle}>Payment History</Text>
        
        {payments.length === 0 ? (
          <Text style={styles.emptyText}>No payments recorded yet</Text>
        ) : (
          payments.map(payment => (
            <View key={payment.payment_id} style={styles.paymentItem}>
              <View style={styles.paymentHeader}>
                <Text style={styles.paymentAmount}>{payment.amount_paid} UGX</Text>
                <Text style={styles.paymentDate}>
                  {new Date(payment.payment_date).toLocaleDateString()}
                </Text>
              </View>
              <View style={styles.paymentDetails}>
                <Text style={styles.paymentMethod}>
                  {payment.payment_method} • {payment.months_paid_for} months
                </Text>
                <Text style={styles.nextDue}>
                  Next due: {new Date(payment.next_due_date).toLocaleDateString()}
                </Text>
              </View>
              {payment.notes ? (
                <Text style={styles.paymentNotes}>{payment.notes}</Text>
              ) : null}
            </View>
          ))
        )}
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
  headerCard: {
    backgroundColor: '#FFFFFF',
    padding: 24,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  tenantHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  tenantInfo: {
    flex: 1,
  },
  tenantName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 4,
  },
  roomNumber: {
    fontSize: 18,
    color: '#6B7280',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '500',
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  detailLabel: {
    fontSize: 14,
    color: '#6B7280',
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
  },
  notesContainer: {
    marginTop: 12,
  },
  notesText: {
    fontSize: 14,
    color: '#374151',
    marginTop: 4,
    lineHeight: 20,
  },
  actionsContainer: {
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  primaryButton: {
    backgroundColor: '#10B981',
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    alignItems: 'center',
  },
  secondaryButton: {
    backgroundColor: '#3B82F6',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  paymentSection: {
    backgroundColor: '#FFFFFF',
    padding: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 16,
  },
  emptyText: {
    color: '#6B7280',
    textAlign: 'center',
    paddingVertical: 32,
    fontSize: 16,
  },
  paymentItem: {
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    paddingVertical: 16,
  },
  paymentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  paymentAmount: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
  },
  paymentDate: {
    fontSize: 14,
    color: '#6B7280',
  },
  paymentDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  paymentMethod: {
    fontSize: 14,
    color: '#6B7280',
  },
  nextDue: {
    fontSize: 14,
    color: '#6B7280',
  },
  paymentNotes: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 8,
    fontStyle: 'italic',
  },
});

