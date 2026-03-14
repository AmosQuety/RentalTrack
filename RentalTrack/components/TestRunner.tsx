// components/TestRunner.tsx
import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { testDatabaseTransactions } from '../tests/database-transactions.test';
import { testEdgeCases } from '../tests/edge-cases.test';
import { testNotificationFlow } from '../tests/notification-flow.test';

export const TestRunner = () => {
  const runAllTests = async () => {
    console.log('🚀 RUNNING ALL TESTS...');
    
    await testNotificationFlow();
    await testDatabaseTransactions(); 
    await testEdgeCases();
    
    console.log('🎉 ALL TESTS COMPLETED');
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Production Readiness Tests</Text>
      
      <TouchableOpacity style={styles.runAllButton} onPress={runAllTests}>
        <Text style={styles.buttonText}>Run All Tests</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.testButton} onPress={testNotificationFlow}>
        <Text style={styles.buttonText}>Test Notification Flow</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.testButton} onPress={testDatabaseTransactions}>
        <Text style={styles.buttonText}>Test Database Transactions</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.testButton} onPress={testEdgeCases}>
        <Text style={styles.buttonText}>Test Edge Cases</Text>
      </TouchableOpacity>

      <Text style={styles.note}>
        Note: Check console logs for detailed test results
      </Text>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#F9FAFB',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
    color: '#1F2937',
  },
  runAllButton: {
    backgroundColor: '#10B981',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 12,
  },
  testButton: {
    backgroundColor: '#3B82F6',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 8,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  note: {
    marginTop: 20,
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
    fontStyle: 'italic',
  },
});