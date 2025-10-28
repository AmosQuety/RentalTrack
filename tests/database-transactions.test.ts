import Database from "@/db/database";
import { Alert } from "react-native";

// tests/database-transactions.test.ts
export const testDatabaseTransactions = async () => {
  console.log('🧪 TESTING DATABASE TRANSACTIONS...');
  
  const testTenantId = await Database.addTenant({
    name: 'Transaction Test User',
    phone: '+256711111111',
    roomNumber: 'TRANS-TEST-001',
    startDate: '2024-01-01',
    monthlyRent: 300000,
    notes: 'Test transaction integrity'
  });

  try {
    // Test 1: Normal payment recording
    console.log('1. Testing normal payment recording...');
    const paymentId = await Database.recordPayment({
      tenantId: testTenantId,
      amountPaid: 300000,
      paymentDate: '2024-01-15',
      paymentMethod: 'Cash',
      notes: 'Normal payment'
    });
    console.log('✅ Normal payment recorded:', paymentId);

    // Test 2: Simulate mid-process failure
    console.log('2. Testing transaction rollback on failure...');
    
    // Create a mock function that fails mid-process
    const failingRecordPayment = async () => {
      try {
        // This would be inside your recordPayment function
        await Database.getDb().execAsync('BEGIN TRANSACTION;');
        
        // Simulate successful payment insert
        await Database.getDb().runAsync(
          'INSERT INTO payments (tenant_id, amount_paid, months_paid_for, payment_date, next_due_date, payment_method, notes) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [testTenantId, 300000, 1, '2024-02-15', '2024-03-01', 'Cash', 'Failed payment test']
        );
        
        // Simulate a failure during status update
        throw new Error('Simulated database failure during status update');
        
        
      } catch (error) {
        await Database.getDb().execAsync('ROLLBACK;');
        throw error;
      }
    };

    try {
      await failingRecordPayment();
    } catch (error) {
      console.log('✅ Transaction correctly rolled back on failure');
    }

    // Verify no orphaned payment was created
    const payments = await Database.getPaymentHistory(testTenantId);
    const orphanedPayments = payments.filter(p => p.notes === 'Failed payment test');
    
    if (orphanedPayments.length === 0) {
      console.log('✅ No orphaned payments found - transaction integrity maintained');
    } else {
      throw new Error('Orphaned payment found - transaction failed!');
    }

    Alert.alert('✅ Transaction Test', 'Database transaction integrity verified!');
    
  } catch (error) {
    console.error('❌ Transaction test failed:', error);
    Alert.alert('❌ Test Failed', `Transaction test failed: ${error.message}`);
  } finally {
    // Cleanup
    await Database.deleteTenant(testTenantId);
  }
};