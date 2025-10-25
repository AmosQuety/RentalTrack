// app/(tabs)/index.tsx
import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useDatabase } from '../../hooks/use-db';
import { Tenant } from '../../libs/types';

export default function Dashboard() {
  const router = useRouter();
  const { isInitialized, getAllTenants } = useDatabase();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [stats, setStats] = useState({
    total: 0,
    paid: 0,
    dueSoon: 0,
    overdue: 0
  });

  const loadTenants = async () => {
    if (!isInitialized) return;
    
    try {
      const allTenants = await getAllTenants();
      setTenants(allTenants);
      
      setStats({
        total: allTenants.length,
        paid: allTenants.filter(t => t.status === 'Paid').length,
        dueSoon: allTenants.filter(t => t.status === 'Due Soon').length,
        overdue: allTenants.filter(t => t.status === 'Overdue').length
      });
    } catch (error) {
      console.error('Failed to load tenants:', error);
    }
  };

  useEffect(() => {
    loadTenants();
  }, [isInitialized]);

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
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Rental Dashboard</Text>
      
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
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 16,
    color: '#1F2937',
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