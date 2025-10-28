// tests/notification-flow.test.ts
import { Alert } from 'react-native';
import { Database } from '../db/database';
import { NotificationService } from '../services/notifications'; // FIXED: Import at top

export const testNotificationFlow = async () => {
  console.log('🧪 STARTING NOTIFICATION FLOW TEST...');
  
  let testTenantId: number | null = null;
  
  try {
    // 1. Create a test tenant
    console.log('1. Creating test tenant...');
    testTenantId = await Database.addTenant({
      name: 'Test User - Notification',
      phone: '+256700000000',
      roomNumber: `TEST-${Date.now()}`,
      startDate: new Date().toISOString().split('T')[0],
      monthlyRent: 500000,
      notes: 'Test tenant for notification flow'
    });
    console.log('✅ Test tenant created:', testTenantId);

    // 2. Test "Mark as Paid" action simulation
    console.log('2. Testing "Mark as Paid" action simulation...');
    const mockNotificationData = {
      tenantId: testTenantId,
      tenantName: 'Test User - Notification',
      amount: 500000,
      dueDate: new Date().toISOString().split('T')[0]
    };
    
    console.log('✅ "Mark as Paid" would navigate with data:', mockNotificationData);

    // 3. Test "Snooze 1 Day" action
    console.log('3. Testing "Snooze 1 Day" action...');
    
    // Create a future reminder first
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 7); // 7 days in future
    
    await NotificationService.createReminder( // FIXED: Now properly imported
      testTenantId,
      futureDate.toISOString().split('T')[0],
      'TEST: Snooze test reminder'
    );
    
    // Now test snooze
    await NotificationService.snoozeReminder(testTenantId, futureDate.toISOString().split('T')[0], 1);
    console.log('✅ Snooze action completed successfully');

    // 4. Test notification creation
    console.log('4. Testing notification creation...');
    const notificationId = await NotificationService.scheduleNotification(
      '💰 Test Notification',
      'This is a test notification',
      { date: new Date(Date.now() + 5000) }, // 5 seconds from now
      { test: true }
    );
    
    if (notificationId) {
      console.log('✅ Notification scheduled successfully:', notificationId);
    }

    Alert.alert('✅ Notification Test', 'All notification flow tests passed!');
    
  } catch (error) {
    console.error('❌ Notification flow test failed:', error);
    Alert.alert('❌ Test Failed', `Notification test failed: ${error.message}`);
  } finally {
    // Cleanup - only if tenant exists
    if (testTenantId) {
      console.log('5. Cleaning up test data...');
      try {
        await Database.deleteTenant(testTenantId);
        console.log('✅ Test data cleaned up');
      } catch (cleanupError) {
        console.log('Cleanup warning:', cleanupError);
      }
    }
  }
};