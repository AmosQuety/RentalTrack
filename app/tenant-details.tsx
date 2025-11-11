// app/tenant-details.tsx - FINAL CORRECTED VERSION
import { useFocusEffect } from '@react-navigation/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAutoRefresh, useDatabase } from '../hooks/use-db';
import { Payment, Tenant } from '../libs/types';

export default function TenantDetails() {
  const { tenantId } = useLocalSearchParams();
  const router = useRouter();
  const { isInitialized, getTenant, getPaymentHistory, deleteTenant } = useDatabase();
  
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);

  const loadTenantData = useCallback(async () => {
    if (!tenantId || !isInitialized) return;
    
    try {
      console.log('🔄 Tenant Details: Loading data...');
      // Set loading to true only if it's the initial load
      if (!tenant) setLoading(true);
      const tenantData = await getTenant(parseInt(tenantId as string));
      setTenant(tenantData);

      if (tenantData) {
        const paymentData = await getPaymentHistory(tenantData.tenant_id);
        setPayments(paymentData);
      }
      console.log('✅ Tenant Details: Data loaded');
    } catch (error) {
      console.error('Failed to load tenant data:', error);
      Alert.alert('Error', 'Failed to load tenant details');
    } finally {
      setLoading(false);
    }
  }, [tenantId, isInitialized, getTenant, getPaymentHistory, tenant]);

  // Auto-refresh on database changes
  const { isRefreshing, refresh } = useAutoRefresh(loadTenantData, [
    'tenant_updated',
    'payment_recorded'
  ]);

  // Initial load
  useEffect(() => {
    loadTenantData();
  }, [loadTenantData]);

  // Refresh when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      console.log('🎯 Tenant Details: Screen focused, refreshing...');
      loadTenantData();
    }, [loadTenantData])
  );

  const formatDisplayDate = (isoDate: string): string => {
      const date = new Date(isoDate);
      const day = date.getDate().toString().padStart(2, '0');
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const year = date.getFullYear();
      return `${day}/${month}/${year}`;
  };


  const handleDeleteTenant = () => {
    Alert.alert(
      'Delete Tenant',
      `Are you sure you want to delete ${tenant?.name}? This will delete all payment records and reminders.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteTenant(tenant!.tenant_id);
              Alert.alert('Success', 'Tenant deleted successfully', [
                { text: 'OK', onPress: () => router.back() }
              ]);
            } catch (error) {
              console.error('Failed to delete tenant:', error);
              Alert.alert('Error', 'Failed to delete tenant');
            }
          }
        }
      ]
    );
  };

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

  // --- CORRECTED PAYMENT FOOTER LOGIC ---

  // A smart helper function to render the correct footer based on the tenant's financial status.
  const renderPaymentFooter = (payment: Payment) => {
    // Ensure we have tenant data before proceeding
    if (!tenant) return null;

    // SCENARIO 1: Tenant has a deficit (Balance Due)
    // This is the most important check. If the status is not 'Paid', any "credit" is actually a partial payment.
    if (tenant.status === 'Due Soon' || tenant.status === 'Overdue') {
      const balanceDue = tenant.monthly_rent - tenant.credit_balance;
      if (balanceDue > 0) {
        return (
          <View style={styles.paymentFooter}>
            <Text style={styles.nextDue}>
              Next due: <Text style={styles.nextDueDate}>
                {formatDisplayDate(payment.next_due_date)}
              </Text>
            </Text>
            <Text style={styles.balanceDueNote}>
              🔴 Balance Due: {balanceDue.toLocaleString()} UGX
            </Text>
          </View>
        );
      }
    }

    // SCENARIO 2: Tenant has a true surplus (Credit)
    // This only shows if the tenant's status is 'Paid', meaning they have a real credit balance.
    if (tenant.credit_balance > 0) {
      return (
        <View style={styles.paymentFooter}>
          <Text style={styles.nextDue}>
            Next due: <Text style={styles.nextDueDate}>
              {new Date(payment.next_due_date).toLocaleDateString()}
            </Text>
          </Text>
          <Text style={styles.creditNote}>
            💰 {tenant.credit_balance.toLocaleString()} UGX credit for next payment
          </Text>
        </View>
      );
    }

    // SCENARIO 3: Default case (No credit, no balance due)
    // This shows when the tenant is paid up perfectly to the due date.
    return (
      <View style={styles.paymentFooter}>
        <Text style={styles.nextDue}>
          Next due: <Text style={styles.nextDueDate}>
            {formatDisplayDate(payment.next_due_date)}
          </Text>
        </Text>
      </View>
    );
  };

  // --- END OF CORRECTIONS ---

  if (loading && !tenant) {
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
    <ScrollView 
      style={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={refresh}
          colors={['#007AFF']}
          tintColor="#007AFF"
        />
      }
    >
      <Text style={styles.pullText}>Pull down to refresh</Text>
      
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
          <Text style={styles.detailValue}>{tenant.monthly_rent.toLocaleString()} UGX</Text>
        </View>
        
<View style={styles.detailRow}>
  <Text style={styles.detailLabel}>Rent Cycle:</Text>
  <Text style={styles.detailValue}>
    {tenant.rent_cycle ? tenant.rent_cycle.charAt(0).toUpperCase() + tenant.rent_cycle.slice(1) : 'Monthly'}
  </Text>
</View>

{tenant.contract_end_date && (
  <View style={styles.detailRow}>
    <Text style={styles.detailLabel}>Contract End:</Text>
    <Text style={styles.detailValue}>
      {formatDisplayDate(tenant.contract_end_date)}
    </Text>
  </View>
)}
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Move-in Date:</Text>
          <Text style={styles.detailValue}>
            {formatDisplayDate(tenant.start_date)}
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

        <TouchableOpacity
          onPress={() => router.push(`/edit-tenant?tenantId=${tenantId}`)}
          style={styles.secondaryButton}
        >
          <Text style={styles.secondaryButtonText}>Edit Tenant</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleDeleteTenant}
          style={styles.deleteButton}
        >
          <Text style={styles.deleteButtonText}>Delete Tenant</Text>
        </TouchableOpacity>
      </View>

      {/* Payment History */}
      <View style={styles.paymentSection}>
        <Text style={styles.sectionTitle}>Payment History</Text>
        {payments.length === 0 ? (
          <Text style={styles.emptyText}>No payment records yet</Text>
        ) : (
          payments.map((payment, index) => {
            const coveredAmount = payment.months_paid_for * tenant.monthly_rent;
            
            return (
              <View key={payment.payment_id} style={styles.paymentItem}>
                <View style={styles.paymentHeader}>
                  <View>
                    <Text style={styles.paymentAmount}>
                      {payment.amount_paid.toLocaleString()} UGX
                    </Text>
                    <Text style={styles.paymentMethod}>
                      {payment.payment_method} • {formatDisplayDate(payment.payment_date)}
                    </Text>
                  </View>
                  <View style={[
                    styles.monthsBadge,
                    { backgroundColor: payment.months_paid_for > 0 ? '#10B98120' : '#F59E0B20' }
                  ]}>
                    <Text style={[
                      styles.monthsBadgeText,
                      { color: payment.months_paid_for > 0 ? '#10B981' : '#F59E0B' }
                    ]}>
                      {payment.months_paid_for} {payment.months_paid_for === 1 ? 'month' : 'months'}
                    </Text>
                  </View>
                </View>
                
                {/* Coverage Breakdown */}
                <View style={styles.coverageBreakdown}>
                  <View style={styles.breakdownRow}>
                    <Text style={styles.breakdownLabel}>Coverage:</Text>
                    <Text style={styles.breakdownValue}>
                      {payment.months_paid_for} month{payment.months_paid_for !== 1 ? 's' : ''} × {tenant.monthly_rent.toLocaleString()} UGX
                    </Text>
                    <Text style={styles.breakdownAmount}>
                      {coveredAmount.toLocaleString()} UGX
                    </Text>
                  </View>
                  
                  <View style={[styles.breakdownRow, styles.totalRow]}>
                    <Text style={styles.breakdownLabel}>Total Paid:</Text>
                    <Text style={styles.breakdownValue}></Text>
                    <Text style={[styles.breakdownAmount, styles.totalAmount]}>
                      {payment.amount_paid.toLocaleString()} UGX
                    </Text>
                  </View>
                </View>
                
                {/* We only want to show the footer for the MOST RECENT payment (the first one in the list) */}
                {index === 0 && renderPaymentFooter(payment)}
                
                {payment.notes ? (
                  <Text style={styles.paymentNotes}>📝 {payment.notes}</Text>
                ) : null}
              </View>
            );
          })
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
  pullText: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
    paddingVertical: 8,
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
    marginBottom: 12,
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
  deleteButton: {
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#EF4444',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
  },
  deleteButtonText: {
    color: '#DC2626',
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
  paymentMethod: {
    fontSize: 14,
    color: '#6B7280',
  },
  monthsBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  monthsBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  coverageBreakdown: {
    backgroundColor: '#F8FAFC',
    padding: 12,
    borderRadius: 8,
    marginVertical: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  totalRow: {
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    paddingTop: 6,
    marginTop: 2,
    marginBottom: 8,
  },
  breakdownLabel: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '500',
    width: '25%',
  },
  breakdownValue: {
    fontSize: 13,
    color: '#374151',
    flex: 1,
    marginLeft: 8,
  },
  breakdownAmount: {
    fontSize: 13,
    color: '#1F2937',
    fontWeight: '600',
    width: '35%',
    textAlign: 'right',
  },
  totalAmount: {
    color: '#1F2937',
    fontSize: 14,
  },
  paymentFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  nextDue: {
    fontSize: 14,
    color: '#6B7280',
  },
  nextDueDate: {
    fontWeight: '600',
    color: '#1F2937',
  },
  creditNote: {
    fontSize: 12,
    color: '#10B981',
    fontWeight: '500',
    backgroundColor: '#10B98120',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  balanceDueNote: {
    fontSize: 12,
    color: '#DC2626',
    fontWeight: 'bold',
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  paymentNotes: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 8,
    fontStyle: 'italic',
  },
});