import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { useDatabase } from '../hooks/use-db';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../theme/ThemeContext';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { InputField } from '../components/ui/InputField';
import { Payment } from '../libs/types';

export default function EditPaymentScreen() {
  const { paymentId } = useLocalSearchParams();
  const router = useRouter();
  const { colors, typography } = useTheme();
  const { user } = useAuth();
  const { getPaymentById, recordPayment, cancelPayment, isInitialized } = useDatabase();

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [originalPayment, setOriginalPayment] = useState<Payment | null>(null);
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    async function loadPayment() {
      if (!isInitialized || !paymentId || !user) return;
      try {
        const payment = await getPaymentById(Number(paymentId), user.user_id);
        if (payment) {
          setOriginalPayment(payment);
          setAmount(payment.amount_paid.toString());
          setNotes(payment.notes || '');
        } else {
          Alert.alert('Error', 'Payment not found');
          router.back();
        }
      } catch (error) {
        console.error('Failed to load payment:', error);
        Alert.alert('Error', 'Failed to load payment details');
      } finally {
        setIsLoading(false);
      }
    }
    loadPayment();
  }, [paymentId, isInitialized, user]);

  const handleSave = async () => {
    if (!originalPayment || !user) return;

    const newAmount = parseInt(amount, 10);
    if (isNaN(newAmount) || newAmount <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid amount.');
      return;
    }

    Alert.alert(
      'Confirm Edit',
      'This will cancel the original payment and create a new one for audit purposes. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Update', 
          onPress: async () => {
            setIsSaving(true);
            try {
              // 1. Cancel original payment (creates reversal ledger entry)
              await cancelPayment(
                originalPayment.payment_id, 
                user.user_id, 
                `Correction: Original amount ${originalPayment.amount_paid.toLocaleString()} replaced with ${newAmount.toLocaleString()}`
              );
              
              // 2. Record corrected payment
              await recordPayment(user.user_id, {
                tenantId: originalPayment.tenant_id,
                amountPaid: newAmount,
                paymentDate: originalPayment.payment_date,
                paymentMethod: originalPayment.payment_method,
                notes: notes + ` (Correction for Payment #${originalPayment.payment_id})`
              });

              Alert.alert('Success', 'Payment updated successfully with audit trail.');
              router.back();
            } catch (error) {
              console.error('Failed to update payment:', error);
              Alert.alert('Error', 'Failed to update payment. Please try again.');
            } finally {
              setIsSaving(false);
            }
          }
        }
      ]
    );
  };

  if (isLoading) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text, fontFamily: typography.fonts.bold }]}>
          Edit Payment Record
        </Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Audit correction for Tenant ID: {originalPayment?.tenant_id}
        </Text>
      </View>

      <Card style={styles.card}>
        <View style={styles.originalInfo}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>Original Payment</Text>
          <Text style={[styles.originalValue, { color: colors.text }]}>
            {originalPayment?.amount_paid.toLocaleString()} UGX on {originalPayment && format(new Date(originalPayment.payment_date), 'PPP')}
          </Text>
        </View>

        <InputField
          label="Corrected Amount (UGX)"
          value={amount}
          onChangeText={setAmount}
          keyboardType="numeric"
          placeholder="Enter corrected amount"
        />

        <InputField
          label="Correction Notes"
          value={notes}
          onChangeText={setNotes}
          placeholder="Reason for correction"
          multiline
          numberOfLines={3}
        />

        <View style={styles.buttonContainer}>
          <Button
            title={isSaving ? "Saving audit trail..." : "Save Correction"}
            onPress={handleSave}
            disabled={isSaving}
            loading={isSaving}
            size="lg"
          />
          <Button
            title="Cancel"
            onPress={() => router.back()}
            variant="ghost"
            style={{ marginTop: 8 }}
          />
        </View>
      </Card>

      <View style={styles.auditNote}>
        <Ionicons name="information-circle-outline" size={16} color={colors.textSecondary} />
        <Text style={[styles.auditText, { color: colors.textSecondary }]}>
          RentalTrack uses a reversal ledger system. Saving this edit will create a cancellation record for the original payment and a new record for the corrected amount.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
  },
  card: {
    padding: 20,
  },
  originalInfo: {
    marginBottom: 24,
    padding: 12,
    backgroundColor: 'rgba(0,0,0,0.03)',
    borderRadius: 8,
  },
  label: {
    fontSize: 12,
    marginBottom: 4,
  },
  originalValue: {
    fontSize: 16,
    fontWeight: '600',
  },
  buttonContainer: {
    marginTop: 24,
  },
  auditNote: {
    flexDirection: 'row',
    marginTop: 24,
    paddingHorizontal: 12,
  },
  auditText: {
    fontSize: 12,
    marginLeft: 8,
    flex: 1,
    lineHeight: 18,
  },
});
