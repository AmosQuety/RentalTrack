// app/(tabs)/index.tsx - WITH AUTO-REFRESH
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAutoRefresh, useDatabase } from '../../hooks/use-db';
import { Tenant } from '../../libs/types';

export default function Dashboard() {
  const router = useRouter();
  const { isInitialized, getAllTenants, getPaymentStats } = useDatabase();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [stats, setStats] = useState({
    total: 0,
    paid: 0,
    dueSoon: 0,
    overdue: 0
  });
  const [paymentStats, setPaymentStats] = useState({
    totalCollected: 0,
    thisMonth: 0,
    lastMonth: 0,
    overdueAmount: 0,
  });

  const loadData = useCallback(async () => {
    if (!isInitialized) return;
    
    try {
      console.log('🔄 Dashboard: Loading data...');
      const allTenants = await getAllTenants();
      setTenants(allTenants);
      
      setStats({
        total: allTenants.length,
        paid: allTenants.filter(t => t.status === 'Paid').length,
        dueSoon: allTenants.filter(t => t.status === 'Due Soon').length,
        overdue: allTenants.filter(t => t.status === 'Overdue').length
      });

      const stats = await getPaymentStats();
      setPaymentStats(stats);
      console.log('✅ Dashboard: Data loaded');
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    }
  }, [isInitialized, getAllTenants, getPaymentStats]);

  // Auto-refresh on database changes
  const { isRefreshing, refresh } = useAutoRefresh(loadData, [
    'tenant_added',
    'tenant_updated',
    'tenant_deleted',
    'payment_recorded'
  ]);

  // Initial load
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Refresh when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      console.log('🎯 Dashboard: Screen focused, refreshing...');
      loadData();
    }, [loadData])
  );

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-UG', {
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Paid': return '#10B981';
      case 'Due Soon': return '#F59E0B';
      case 'Overdue': return '#EF4444';
      default: return '#6B7280';
    }
  };

  if (!isInitialized) {
    return (
      <View style={styles.centerContainer}>
        <Text>Loading database...</Text>
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
      <View style={styles.header}>
        <Text style={styles.title}>Rental Dashboard</Text>
        <Text style={styles.subtitle}>Pull down to refresh</Text>
      </View>
      
      {/* Stats Cards */}
      <View style={styles.statsContainer}>
        <View style={[styles.statCard, { backgroundColor: '#DBEAFE' }]}>
          <Text style={styles.statLabel}>Total Tenants</Text>
          <Text style={styles.statValue}>{stats.total}</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: '#D1FAE5' }]}>
          <Text style={styles.statLabel}>Paid</Text>
          <Text style={styles.statValue}>{stats.paid}</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: '#DBEAFE' }]}>
          <Text style={styles.statLabel}>Total Collected</Text>
          <Text style={styles.statValue}>{formatCurrency(paymentStats.totalCollected)} UGX</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: '#D1FAE5' }]}>
          <Text style={styles.statLabel}>This Month</Text>
          <Text style={styles.statValue}>{formatCurrency(paymentStats.thisMonth)} UGX</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: '#FEF3C7' }]}>
          <Text style={styles.statLabel}>Last Month</Text>
          <Text style={styles.statValue}>{formatCurrency(paymentStats.lastMonth)} UGX</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: '#FEE2E2' }]}>
          <Text style={styles.statLabel}>Overdue</Text>
          <Text style={styles.statValue}>{formatCurrency(paymentStats.overdueAmount)} UGX</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: '#FEF3C7' }]}>
          <Text style={styles.statLabel}>Due Soon</Text>
          <Text style={styles.statValue}>{stats.dueSoon}</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: '#FEE2E2' }]}>
          <Text style={styles.statLabel}>Overdue</Text>
          <Text style={styles.statValue}>{stats.overdue}</Text>
        </View>
      </View>

      {/* Quick Actions */}
      <View style={styles.actionsContainer}>
        <TouchableOpacity 
          style={styles.actionButton}
          onPress={() => router.push('/add-tenant')}
        >
          <Text style={styles.actionButtonText}>Add Tenant</Text>
        </TouchableOpacity>
      </View>

      {/* Recent Tenants */}
      <Text style={styles.sectionTitle}>Recent Tenants</Text>
      {tenants.slice(0, 5).map(tenant => (
        <TouchableOpacity 
          key={tenant.tenant_id}
          style={styles.tenantCard}
          onPress={() => router.push(`/tenant-details?tenantId=${tenant.tenant_id}`)}
        >
          <View style={styles.tenantHeader}>
            <View>
              <Text style={styles.tenantName}>{tenant.name}</Text>
              <Text style={styles.tenantRoom}>Room {tenant.room_number}</Text>
            </View>
            <View 
              style={[
                styles.statusBadge,
                { backgroundColor: getStatusColor(tenant.status) + '20' }
              ]}
            >
              <Text style={[styles.statusText, { color: getStatusColor(tenant.status) }]}>
                {tenant.status}
              </Text>
            </View>
          </View>
          <Text style={styles.rentText}>
            Rent: {tenant.monthly_rent} UGX
          </Text>
        </TouchableOpacity>
      ))}

      {tenants.length === 0 && (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateText}>
            No tenants yet.{'\n'}Add your first tenant to get started!
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#F9FAFB',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  subtitle: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
  },
  statsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  statCard: {
    padding: 16,
    borderRadius: 8,
    width: '48%',
    marginBottom: 12,
  },
  statLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 4,
  },
  statValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  actionsContainer: {
    marginBottom: 24,
  },
  actionButton: {
    backgroundColor: '#007AFF',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 12,
    color: '#1F2937',
  },
  tenantCard: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
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
    marginBottom: 8,
  },
  tenantName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
  },
  tenantRoom: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '500',
  },
  rentText: {
    fontSize: 14,
    color: '#6B7280',
  },
  emptyState: {
    backgroundColor: '#F3F4F6',
    padding: 32,
    borderRadius: 8,
    alignItems: 'center',
  },
  emptyStateText: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 24,
  },
});

// app/(tabs)/index.tsx (Dashboard)
// Logic:
// The loadData function correctly fetches tenants and payment stats.
// calculateTenantStatus is missing from this file, but you have getStatusColor which uses tenant.status. This status needs to be consistently maintained in the database.
// formatCurrency is good, but hardcoded to 'en-UG' and 'UGX'. This should ideally come from user settings.
// The stats cards are well-structured.
// Improvements for Production:
// Data Consistency: The tenant.status is determined in database.ts. Ensure this status is updated reliably when payments are recorded or due dates pass. You've correctly added auto-refresh on payment_recorded, tenant_updated, etc., which is good.
// Currency: Retrieve currency from settings, not hardcode UGX.
// Dashboard Widgets: For a real dashboard, users might want to customize widgets, add charts (e.g., react-native-chart-kit), or see more detailed breakdowns (e.g., rent collection rate, average occupancy).
// Empty States: Good empty state for "No tenants yet".
// useFocusEffect: It's good you're reloading data on focus, but be mindful of performance for very frequent navigation if loadData is expensive.
// Code Duplication: getStatusColor is duplicated in other files. It should be extracted into a utility file (e.g., utils/styles.ts or utils/helpers.ts).