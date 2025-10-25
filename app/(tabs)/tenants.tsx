// app/(tabs)/tenants.tsx
import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useDatabase } from '../../hooks/use-db';
import { Tenant } from '../../libs/types';

export default function TenantsScreen() {
  const router = useRouter();
  const { isInitialized, getAllTenants } = useDatabase();
  const [tenants, setTenants] = useState<Tenant[]>([]);

  const loadTenants = async () => {
    if (!isInitialized) return;
    
    try {
      const allTenants = await getAllTenants();
      setTenants(allTenants);
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
        <Text>Loading...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>All Tenants</Text>
        <TouchableOpacity 
          style={styles.addButton}
          onPress={() => router.push('/add-tenant')}
        >
          <Ionicons name="add" size={24} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
      
      <ScrollView style={styles.scrollView}>
        {tenants.map(tenant => (
          <TouchableOpacity 
            key={tenant.tenant_id}
            onPress={() => router.push(`/tenant-details?tenantId=${tenant.tenant_id}`)}
            style={styles.tenantCard}
          >
            <View style={styles.tenantInfo}>
              <View style={styles.tenantMain}>
                <Text style={styles.tenantName}>{tenant.name}</Text>
                <Text style={styles.tenantRoom}>Room {tenant.room_number}</Text>
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
    </View>
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  addButton: {
    backgroundColor: '#007AFF',
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
    padding: 16,
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
  tenantInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  tenantMain: {
    flex: 1,
  },
  tenantName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 4,
  },
  tenantRoom: {
    fontSize: 14,
    color: '#6B7280',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
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
    marginTop: 20,
  },
  emptyStateText: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 24,
  },
});