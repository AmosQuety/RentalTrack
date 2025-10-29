// app/record-payment.tsx - CORRECTED VERSION
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useDatabase } from '../hooks/use-db';
import { Tenant } from '../libs/types';

const InputField = ({ label, value, onChange, placeholder, keyboardType = 'default', required = false, multiline = false }) => (
  <View style={styles.inputContainer}>
    <Text style={styles.inputLabel}>
      {label} {required && <Text style={styles.required}>*</Text>}
    </Text>
    <View style={[styles.inputWrapper, multiline && styles.multilineInput]}>
      <TextInput
        style={[styles.textInput, multiline && styles.multilineText]}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        keyboardType={keyboardType}
        multiline={multiline}
        textAlignVertical={multiline ? 'top' : 'center'}
      />
    </View>
  </View>
);

export default function RecordPayment() {
  const { tenantId, prefillAmount } = useLocalSearchParams();
  const router = useRouter();
  const { isInitialized, getTenant, recordPayment } = useDatabase();
  
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [formData, setFormData] = useState({
    amount: prefillAmount ? String(prefillAmount) : '',
    paymentDate: new Date().toISOString().split('T')[0],
    paymentMethod: 'Cash',
    notes: ''
  });
  const [isLoading, setIsLoading] = useState(false);

  const [paymentSummary, setPaymentSummary] = useState({
    fullMonths: 0,
    remainingAmount: 0,
    nextDueDate: '',
    currentCredit: 0,
    totalAvailable: 0,
    willBeFullyPaid: false,
    balanceDue: 0
  });

  const loadTenant = async () => {
    if (!tenantId || !isInitialized) return;
    
    try {
      const tenantData = await getTenant(parseInt(tenantId as string));
      setTenant(tenantData);
      
      // Update payment summary with current credit
      if (tenantData && formData.amount) {
        calculatePaymentSummary(tenantData, parseFloat(formData.amount));
      }
    } catch (error) {
      console.error('Failed to load tenant:', error);
      Alert.alert('Error', 'Failed to load tenant details');
    }
  };

  const calculatePaymentSummary = (tenantData: Tenant, amount: number) => {
    if (!isNaN(amount) && tenantData.monthly_rent > 0) {
      const currentCredit = tenantData.credit_balance || 0;
      const totalAvailable = amount + currentCredit;
      const fullMonths = Math.floor(totalAvailable / tenantData.monthly_rent);
      const remaining = totalAvailable % tenantData.monthly_rent;
      
      // Calculate next due date
      const lastPaymentDate = new Date();
      const nextDue = new Date(lastPaymentDate);
      nextDue.setMonth(nextDue.getMonth() + fullMonths);
      
      // Calculate if this payment will make the tenant fully paid
      const willBeFullyPaid = remaining === 0 && fullMonths > 0;
      const balanceDue = tenantData.monthly_rent - remaining;
      
      setPaymentSummary({
        fullMonths,
        remainingAmount: remaining,
        nextDueDate: nextDue.toISOString().split('T')[0],
        currentCredit,
        totalAvailable,
        willBeFullyPaid,
        balanceDue: remaining > 0 ? 0 : balanceDue // Only show balance due if not enough for full month
      });
    }
  };

  // Handle prefill amount
  useEffect(() => {
    if (prefillAmount && !formData.amount) {
      setFormData(prev => ({ ...prev, amount: prefillAmount.toString() }));
    }
  }, [prefillAmount]);

  // Calculate payment summary when amount changes
  useEffect(() => {
    if (formData.amount && tenant) {
      const amount = parseFloat(formData.amount);
      calculatePaymentSummary(tenant, amount);
    }
  }, [formData.amount, tenant]);

  // Load tenant data
  useEffect(() => {
    loadTenant();
  }, [tenantId, isInitialized]);

  const handleRecordPayment = async () => {
    if (!formData.amount || !formData.paymentDate) {
      Alert.alert('Error', 'Please fill in all required fields');
      return;
    }

    
    const amount = parseFloat(formData.amount);
    if (isNaN(amount) || amount <= 0) {
      Alert.alert('Error', 'Please enter a valid amount');
      return;
    }
    
    if (!tenant) {
      Alert.alert('Error', 'Tenant information not loaded');
      return;
    }
    
    // Show informative alert for partial payments
    const currentCredit = tenant.credit_balance || 0;
    const totalAvailable = amount + currentCredit;
    
    if (totalAvailable < tenant.monthly_rent) {
      Alert.alert(
        'Partial Payment', 
        `This payment (${amount.toLocaleString()} UGX) plus existing credit (${currentCredit.toLocaleString()} UGX) totals ${totalAvailable.toLocaleString()} UGX, which is less than one month's rent (${tenant.monthly_rent.toLocaleString()} UGX). The tenant will still have a balance due.`,
        [{ text: 'OK' }]
      );
    }

    setIsLoading(true);
    try {
      await recordPayment({
        tenantId: parseInt(tenantId as string),
        amountPaid: amount,
        paymentDate: formData.paymentDate,
        paymentMethod: formData.paymentMethod,
        notes: formData.notes
      });

    


      Alert.alert('Success', 'Payment recorded successfully!', [
        { text: 'OK', onPress: () => router.back() }
      ]);
    } catch (error) {
      console.error('Failed to record payment:', error);
      Alert.alert('Error', 'Failed to record payment. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const paymentMethods = ['Cash', 'Mobile Money', 'Bank Transfer', 'Other'];

  if (!tenant) {
    return (
      <View style={styles.centerContainer}>
        <Text>Loading...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Record Payment</Text>
        <Text style={styles.subtitle}>for {tenant.name} (Room {tenant.room_number})</Text>

        {/* Tenant Info */}
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>Tenant Information</Text>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Monthly Rent:</Text>
            <Text style={styles.infoValue}>{tenant.monthly_rent.toLocaleString()} UGX</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Current Credit:</Text>
            <Text style={[styles.infoValue, { color: tenant.credit_balance > 0 ? '#10B981' : '#6B7280' }]}>
              {tenant.credit_balance.toLocaleString()} UGX
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Current Status:</Text>
            <Text style={[
              styles.infoValue,
              tenant.status === 'Overdue' && { color: '#EF4444' },
              tenant.status === 'Due Soon' && { color: '#F59E0B' },
              tenant.status === 'Paid' && { color: '#10B981' }
            ]}>
              {tenant.status}
            </Text>
          </View>
        </View>

        {/* Payment Form */}
        <View style={styles.formCard}>
          <InputField
            label="Amount Paid (UGX)"
            value={formData.amount}
            onChange={(text) => setFormData(prev => ({ ...prev, amount: text }))}
            placeholder="Enter amount"
            keyboardType="numeric"
            required
          />

          {formData.amount && tenant && (
            <View style={styles.paymentSummary}>
              <Text style={styles.paymentSummaryTitle}>Payment Summary</Text>
              
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Current Credit:</Text>
                <Text style={styles.summaryValue}>
                  {paymentSummary.currentCredit.toLocaleString()} UGX
                </Text>
              </View>
              
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>New Payment:</Text>
                <Text style={styles.summaryValue}>
                  {parseFloat(formData.amount).toLocaleString()} UGX
                </Text>
              </View>
              
              <View style={[styles.summaryRow, styles.totalRow]}>
                <Text style={[styles.summaryLabel, styles.totalLabel]}>Total Available:</Text>
                <Text style={[styles.summaryValue, styles.totalValue]}>
                  {paymentSummary.totalAvailable.toLocaleString()} UGX
                </Text>
              </View>
              
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Full Months Covered:</Text>
                <Text style={styles.summaryValue}>{paymentSummary.fullMonths} months</Text>
              </View>
              
              {paymentSummary.remainingAmount > 0 ? (
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>New Credit Balance:</Text>
                  <Text style={[styles.summaryValue, { color: '#10B981' }]}>
                    {paymentSummary.remainingAmount.toLocaleString()} UGX
                  </Text>
                </View>
              ) : paymentSummary.balanceDue > 0 ? (
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Balance Due:</Text>
                  <Text style={[styles.summaryValue, { color: '#EF4444', fontWeight: 'bold' }]}>
                    {paymentSummary.balanceDue.toLocaleString()} UGX
                  </Text>
                </View>
              ) : null}
              
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Next Due Date:</Text>
                <Text style={styles.summaryValue}>
                  {new Date(paymentSummary.nextDueDate).toLocaleDateString()}
                </Text>
              </View>

              {/* Status Preview */}
              <View style={[
                styles.statusPreview,
                { 
                  backgroundColor: paymentSummary.willBeFullyPaid ? '#10B98120' : 
                                 paymentSummary.remainingAmount > 0 ? '#10B98120' : '#F59E0B20' 
                }
              ]}>
                <Text style={[
                  styles.statusPreviewText,
                  { 
                    color: paymentSummary.willBeFullyPaid ? '#10B981' : 
                           paymentSummary.remainingAmount > 0 ? '#10B981' : '#F59E0B' 
                  }
                ]}>
                  {paymentSummary.willBeFullyPaid ? '✅ Tenant will be fully paid' :
                   paymentSummary.remainingAmount > 0 ? '💰 Tenant will have credit' : 
                   '⚠️ Tenant will still have balance due'}
                </Text>
              </View>
            </View>
          )}

          <InputField
            label="Payment Date"
            value={formData.paymentDate}
            onChange={(text) => setFormData(prev => ({ ...prev, paymentDate: text }))}
            placeholder="YYYY-MM-DD"
          />

          <View style={styles.methodContainer}>
            <Text style={styles.methodLabel}>Payment Method</Text>
            <View style={styles.methodOptions}>
              {paymentMethods.map(method => (
                <TouchableOpacity
                  key={method}
                  onPress={() => setFormData(prev => ({ ...prev, paymentMethod: method }))}
                  style={[
                    styles.methodButton,
                    formData.paymentMethod === method && styles.methodButtonSelected
                  ]}
                >
                  <Text style={[
                    styles.methodText,
                    formData.paymentMethod === method && styles.methodTextSelected
                  ]}>
                    {method}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <InputField
            label="Notes"
            value={formData.notes}
            onChange={(text) => setFormData(prev => ({ ...prev, notes: text }))}
            placeholder="Any notes about this payment"
            multiline
          />

          <TouchableOpacity
            onPress={handleRecordPayment}
            disabled={isLoading}
            style={[styles.primaryButton, isLoading && styles.buttonDisabled]}
          >
            <Text style={styles.primaryButtonText}>
              {isLoading ? 'Recording...' : 'Record Payment'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.secondaryButton}
          >
            <Text style={styles.secondaryButtonText}>Cancel</Text>
          </TouchableOpacity>
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
  content: {
    padding: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: '#6B7280',
    marginBottom: 24,
  },
  infoCard: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 8,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
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
  formCard: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  inputContainer: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 8,
  },
  required: {
    color: '#EF4444',
  },
  inputWrapper: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  multilineInput: {
    minHeight: 80,
  },
  textInput: {
    fontSize: 16,
    color: '#1F2937',
  },
  multilineText: {
    textAlignVertical: 'top',
  },
  methodContainer: {
    marginBottom: 16,
  },
  methodLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 8,
  },
  methodOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  methodButton: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 8,
    marginBottom: 8,
    backgroundColor: '#FFFFFF',
  },
  methodButtonSelected: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  methodText: {
    fontSize: 14,
    color: '#374151',
  },
  methodTextSelected: {
    color: '#FFFFFF',
  },
  primaryButton: {
    backgroundColor: '#10B981',
    borderRadius: 8,
    padding: 16,
    marginTop: 8,
    alignItems: 'center',
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    padding: 16,
    marginTop: 12,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButtonText: {
    color: '#374151',
    fontSize: 16,
    fontWeight: '600',
  },
  paymentSummary: {
    backgroundColor: '#F3F4F6',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  paymentSummaryTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  totalRow: {
    borderTopWidth: 1,
    borderTopColor: '#D1D5DB',
    paddingTop: 8,
    marginTop: 4,
    marginBottom: 8,
  },
  summaryLabel: {
    fontSize: 14,
    color: '#6B7280',
  },
  totalLabel: {
    fontWeight: '600',
    color: '#374151',
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
  },
  totalValue: {
    fontWeight: '600',
    color: '#1F2937',
  },
  statusPreview: {
    padding: 12,
    borderRadius: 8,
    marginTop: 12,
    alignItems: 'center',
  },
  statusPreviewText: {
    fontSize: 14,
    fontWeight: '600',
  },
});