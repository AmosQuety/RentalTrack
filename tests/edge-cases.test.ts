import Database from '@/db/database';
import { Alert } from 'react-native';

// tests/edge-cases.test.ts
export const testEdgeCases = async () => {
  console.log('🧪 TESTING EDGE CASES...');
  
  const testResults = {
    noPayments: false,
    partialPayments: false,
    multipleMonths: false,
    backdating: false,
    deletionCascade: false
  };

  try {
    // Test 1: Tenant with no payments
    console.log('1. Testing tenant with no payments...');
    const noPaymentTenantId = await Database.addTenant({
      name: 'No Payment Test',
      phone: '+256722222222',
      roomNumber: `NO-PAY-${Date.now()}`, // FIXED: Unique room number
      startDate: '2024-01-01',
      monthlyRent: 400000,
      notes: 'Never paid'
    });

    // Force status update
    await Database.updateAllTenantStatuses();
    const noPaymentTenant = await Database.getTenant(noPaymentTenantId);
    
    // Should be "Due Soon" or "Overdue" depending on dates
    if (noPaymentTenant?.status === 'Due Soon' || noPaymentTenant?.status === 'Overdue') {
      testResults.noPayments = true;
      console.log('✅ No-payment tenant status correct:', noPaymentTenant.status);
    }

    // Test 2: Partial payments
    console.log('2. Testing partial payments...');
    const partialTenantId = await Database.addTenant({
      name: 'Partial Payment Test',
      phone: '+256733333333',
      roomNumber: `PARTIAL-${Date.now()}`, // FIXED: Unique room number
      startDate: '2024-01-01',
      monthlyRent: 500000,
      notes: 'Pays partial amounts'
    });

    // Record partial payment (less than monthly rent)
    await Database.recordPayment({
      tenantId: partialTenantId,
      amountPaid: 250000, // Half the rent
      paymentDate: '2024-01-15',
      paymentMethod: 'Cash',
      notes: 'Partial payment test'
    });

    const partialPayments = await Database.getPaymentHistory(partialTenantId);
    const partialPayment = partialPayments[0];
    
    if (partialPayment.months_paid_for === 0 && partialPayment.amount_paid === 250000) {
      testResults.partialPayments = true;
      console.log('✅ Partial payment handled correctly - 0 months covered, credit recorded');
    }

    // Test 3: Payments covering multiple months
    console.log('3. Testing multiple months coverage...');
    const multiMonthTenantId = await Database.addTenant({
      name: 'Multi-Month Test',
      phone: '+256744444444',
      roomNumber: `MULTI-${Date.now()}`, // FIXED: Unique room number
      startDate: '2024-01-01',
      monthlyRent: 300000,
      notes: 'Pays multiple months'
    });

    // Pay for 3 months
    await Database.recordPayment({
      tenantId: multiMonthTenantId,
      amountPaid: 900000, // 3 months
      paymentDate: '2024-01-15',
      paymentMethod: 'Cash',
      notes: '3 months advance'
    });

    const multiMonthPayments = await Database.getPaymentHistory(multiMonthTenantId);
    const multiMonthPayment = multiMonthPayments[0];
    
    if (multiMonthPayment.months_paid_for === 3) {
      testResults.multipleMonths = true;
      console.log('✅ Multiple months payment handled correctly');
    }

    // Test 4: Backdating payments - FIXED: Actually check the result
    console.log('4. Testing backdated payments...');
    const backdateTenantId = await Database.addTenant({
      name: 'Backdate Test',
      phone: '+256755555555',
      roomNumber: `BACKDATE-${Date.now()}`, // FIXED: Unique room number
      startDate: '2024-01-01',
      monthlyRent: 350000,
      notes: 'Backdated payments'
    });

    // Record payment with past date
    await Database.recordPayment({
      tenantId: backdateTenantId,
      amountPaid: 350000,
      paymentDate: '2024-01-10', // Past date
      paymentMethod: 'Cash',
      notes: 'Backdated payment'
    });

    const backdateTenant = await Database.getTenant(backdateTenantId);
    if (backdateTenant?.status === 'Paid') {
      testResults.backdating = true; // FIXED: This was missing!
      console.log('✅ Backdated payment handled correctly - status:', backdateTenant.status);
    } else {
      console.log('❌ Backdated payment failed - status:', backdateTenant?.status);
    }

    // Test 5: Tenant deletion with existing payments
    console.log('5. Testing tenant deletion cascade...');
    const deleteTenantId = await Database.addTenant({
      name: 'Delete Cascade Test',
      phone: '+256766666666',
      roomNumber: `DELETE-${Date.now()}`, // FIXED: Unique room number
      startDate: '2024-01-01',
      monthlyRent: 400000,
      notes: 'Will be deleted'
    });

    // Add some payments
    await Database.recordPayment({
      tenantId: deleteTenantId,
      amountPaid: 400000,
      paymentDate: '2024-01-15',
      paymentMethod: 'Cash',
      notes: 'Payment before deletion'
    });

    // Add a reminder
    const { NotificationService } = await import('../services/notifications');
    await NotificationService.createReminder(deleteTenantId, '2024-02-01');

    // Count records before deletion
    const paymentsBefore = await Database.getPaymentHistory(deleteTenantId);
    const remindersBefore = await Database.getUpcomingReminders(365);
    const tenantRemindersBefore = remindersBefore.filter(r => r.tenant_id === deleteTenantId);

    // Delete tenant
    await Database.deleteTenant(deleteTenantId);

    // Verify cascade deletion
    const paymentsAfter = await Database.getPaymentHistory(deleteTenantId);
    const remindersAfter = await Database.getUpcomingReminders(365);
    const tenantRemindersAfter = remindersAfter.filter(r => r.tenant_id === deleteTenantId);

    if (paymentsAfter.length === 0 && tenantRemindersAfter.length === 0) {
      testResults.deletionCascade = true;
      console.log('✅ Tenant deletion cascade working correctly');
    }

    // Final results
    const allPassed = Object.values(testResults).every(result => result);
    
    if (allPassed) {
      Alert.alert('✅ All Edge Cases Passed', 'All edge case tests completed successfully!');
    } else {
      const failedTests = Object.entries(testResults)
        .filter(([_, passed]) => !passed)
        .map(([test]) => test)
        .join(', ');
      
      Alert.alert('⚠️ Some Tests Failed', `Failed tests: ${failedTests}`);
    }

    console.log('📊 Edge Case Test Results:', testResults);

  } catch (error) {
    console.error('❌ Edge cases test failed:', error);
    Alert.alert('❌ Test Failed', `Edge cases test failed: ${error.message}`);
  } finally {
    // Cleanup any remaining test tenants (in case of failures)
    try {
      const allTenants = await Database.getAllTenants();
      const testTenants = allTenants.filter(t => 
        t.name.includes('Test') || 
        t.room_number.includes('NO-PAY') ||
        t.room_number.includes('PARTIAL') ||
        t.room_number.includes('MULTI') ||
        t.room_number.includes('BACKDATE') ||
        t.room_number.includes('DELETE')
      );
      
      for (const tenant of testTenants) {
        await Database.deleteTenant(tenant.tenant_id);
      }
    } catch (cleanupError) {
      console.log('Cleanup error:', cleanupError);
    }
  }
};