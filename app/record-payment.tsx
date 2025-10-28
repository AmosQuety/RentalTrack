// app/record-payment.tsx
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
  const { tenantId, prefillAmount } = useLocalSearchParams(); // FIXED: Get prefillAmount here
  const router = useRouter();
  const { isInitialized, getTenant, recordPayment } = useDatabase();
  
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [formData, setFormData] = useState({
    amount: '',
    paymentDate: new Date().toISOString().split('T')[0],
    paymentMethod: 'Cash',
    notes: ''
  });
  const [isLoading, setIsLoading] = useState(false);

  const [paymentSummary, setPaymentSummary] = useState({
    fullMonths: 0,
    remainingAmount: 0,
    nextDueDate: ''
  });

  const loadTenant = async () => {
    if (!tenantId || !isInitialized) return;
    
    try {
      const tenantData = await getTenant(parseInt(tenantId as string));
      setTenant(tenantData);
    } catch (error) {
      console.error('Failed to load tenant:', error);
      Alert.alert('Error', 'Failed to load tenant details');
    }
  };

  // FIXED: Handle prefill amount in a separate useEffect
  useEffect(() => {
    if (prefillAmount && !formData.amount) {
      setFormData(prev => ({ ...prev, amount: prefillAmount.toString() }));
    }
  }, [prefillAmount]); // Only depend on prefillAmount

  // FIXED: Calculate payment summary
  useEffect(() => {
    if (formData.amount && tenant) {
      const amount = parseFloat(formData.amount);
      const monthlyRent = tenant.monthly_rent;
      
      if (!isNaN(amount) && monthlyRent > 0) {
        const fullMonths = Math.floor(amount / monthlyRent);
        const remaining = amount % monthlyRent;
        
        // Calculate next due date
        const lastPaymentDate = new Date();
        const nextDue = new Date(lastPaymentDate);
        nextDue.setMonth(nextDue.getMonth() + fullMonths);
        
        setPaymentSummary({
          fullMonths,
          remainingAmount: remaining,
          nextDueDate: nextDue.toISOString().split('T')[0]
        });
      }
    }
  }, [formData.amount, tenant]);

  // FIXED: Load tenant data
  useEffect(() => {
    loadTenant();
  }, [tenantId, isInitialized]); // loadTenant is stable, no need to include

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
    
    if (amount < tenant.monthly_rent) {
      Alert.alert(
        'Partial Payment', 
        `This payment (${amount.toLocaleString()} UGX) is less than one month's rent (${tenant.monthly_rent.toLocaleString()} UGX). It will be recorded as credit toward the next payment.`,
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
            <Text style={styles.infoValue}>{tenant.monthly_rent} UGX</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Current Status:</Text>
            <Text style={styles.infoValue}>{tenant.status}</Text>
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
                <Text style={styles.summaryLabel}>Full Months Covered:</Text>
                <Text style={styles.summaryValue}>{paymentSummary.fullMonths} months</Text>
              </View>
              {paymentSummary.remainingAmount > 0 && (
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Remaining Credit:</Text>
                  <Text style={styles.summaryValue}>
                    {paymentSummary.remainingAmount.toLocaleString()} UGX
                  </Text>
                </View>
              )}
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Next Due Date:</Text>
                <Text style={styles.summaryValue}>
                  {new Date(paymentSummary.nextDueDate).toLocaleDateString()}
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
    marginBottom: 8,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  summaryLabel: {
    fontSize: 14,
    color: '#6B7280',
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
  },
});