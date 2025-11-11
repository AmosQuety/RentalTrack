// app/(tabs)/tenants.tsx - WITH AUTO-REFRESH
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { Modal, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useAutoRefresh, useDatabase } from '../../hooks/use-db';
import { Tenant } from '../../libs/types';

export default function TenantsScreen() {
  const router = useRouter();
  const { isInitialized, getAllTenants } = useDatabase();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [filteredTenants, setFilteredTenants] = useState<Tenant[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [sortBy, setSortBy] = useState<string>('name');
  const [showFilterModal, setShowFilterModal] = useState(false);

  const loadTenants = useCallback(async () => {
    if (!isInitialized) return;
    
    try {
      console.log('🔄 Tenants: Loading data...');
      const allTenants = await getAllTenants();
      setTenants(allTenants);
      console.log('✅ Tenants: Data loaded');
    } catch (error) {
      console.error('Failed to load tenants:', error);
    }
  }, [isInitialized, getAllTenants]);

  // Auto-refresh on database changes
  const { isRefreshing, refresh } = useAutoRefresh(loadTenants, [
    'tenant_added',
    'tenant_updated',
    'tenant_deleted',
    'payment_recorded'
  ]);

  // Initial load
  useEffect(() => {
    loadTenants();
  }, [loadTenants]);

  // Refresh when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      console.log('🎯 Tenants: Screen focused, refreshing...');
      loadTenants();
    }, [loadTenants])
  );

  useEffect(() => {
    filterAndSortTenants();
  }, [tenants, searchQuery, statusFilter, sortBy]);

  const filterAndSortTenants = () => {
    let filtered = [...tenants];

    // Apply search filter
    if (searchQuery) {
      filtered = filtered.filter(tenant =>
        tenant.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        tenant.room_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (tenant.phone && tenant.phone.includes(searchQuery))
      );
    }

    // Apply status filter
    if (statusFilter !== 'All') {
      filtered = filtered.filter(tenant => tenant.status === statusFilter);
    }

    // Apply sorting
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'room':
          return a.room_number.localeCompare(b.room_number);
        case 'status':
          return a.status.localeCompare(b.status);
        case 'rent':
          return b.monthly_rent - a.monthly_rent;
        default:
          return 0;
      }
    });

    setFilteredTenants(filtered);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Paid': return '#10B981';
      case 'Due Soon': return '#F59E0B';
      case 'Overdue': return '#EF4444';
      default: return '#6B7280';
    }
  };

  const clearFilters = () => {
    setSearchQuery('');
    setStatusFilter('All');
    setSortBy('name');
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

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <View style={styles.searchInputContainer}>
          <Ionicons name="search" size={20} color="#6B7280" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search tenants by name, room, or phone..."
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery ? (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={20} color="#6B7280" />
            </TouchableOpacity>
          ) : null}
        </View>
        
        <TouchableOpacity 
          style={styles.filterButton}
          onPress={() => setShowFilterModal(true)}
        >
          <Ionicons name="filter" size={20} color="#374151" />
        </TouchableOpacity>
      </View>

      {/* Filter Summary */}
      {(searchQuery || statusFilter !== 'All' || sortBy !== 'name') && (
        <View style={styles.filterSummary}>
          <Text style={styles.filterSummaryText}>
            Showing {filteredTenants.length} of {tenants.length} tenants
            {searchQuery && ` • Search: "${searchQuery}"`}
            {statusFilter !== 'All' && ` • Status: ${statusFilter}`}
            {sortBy !== 'name' && ` • Sorted by: ${sortBy}`}
          </Text>
          <TouchableOpacity onPress={clearFilters}>
            <Text style={styles.clearFiltersText}>Clear</Text>
          </TouchableOpacity>
        </View>
      )}

      <ScrollView 
        style={styles.scrollView}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={refresh}
            colors={['#007AFF']}
            tintColor="#007AFF"
          />
        }
      >
        <Text style={styles.pullText}>Pull down to refresh</Text>
        
        {filteredTenants.map(tenant => (
          <TouchableOpacity 
            key={tenant.tenant_id}
            onPress={() => router.push(`/tenant-details?tenantId=${tenant.tenant_id}`)}
            style={styles.tenantCard}
          >
            <View style={styles.tenantInfo}>
              <View style={styles.tenantMain}>
                <Text style={styles.tenantName}>{tenant.name}</Text>
                <Text style={styles.tenantRoom}>Room {tenant.room_number}</Text>
                {tenant.phone ? (
                  <Text style={styles.tenantPhone}>{tenant.phone}</Text>
                ) : null}
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
              Rent: {tenant.monthly_rent.toLocaleString()} UGX
            </Text>
          </TouchableOpacity>
        ))}

        {filteredTenants.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>
              {tenants.length === 0 
                ? "No tenants yet.\nAdd your first tenant to get started!"
                : "No tenants match your search criteria.\nTry adjusting your filters."
              }
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Filter Modal - Same as before */}
      <Modal
        visible={showFilterModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowFilterModal(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Filter & Sort</Text>
            <TouchableOpacity 
              onPress={() => setShowFilterModal(false)}
              style={styles.closeButton}
            >
              <Ionicons name="close" size={24} color="#374151" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalContent}>
            <View style={styles.filterSection}>
              <Text style={styles.filterSectionTitle}>Status</Text>
              <View style={styles.filterOptions}>
                {['All', 'Paid', 'Due Soon', 'Overdue'].map(status => (
                  <TouchableOpacity
                    key={status}
                    onPress={() => setStatusFilter(status)}
                    style={[
                      styles.filterOption,
                      statusFilter === status && styles.filterOptionSelected
                    ]}
                  >
                    <Text style={[
                      styles.filterOptionText,
                      statusFilter === status && styles.filterOptionTextSelected
                    ]}>
                      {status}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.filterSection}>
              <Text style={styles.filterSectionTitle}>Sort By</Text>
              <View style={styles.filterOptions}>
                {[
                  { value: 'name', label: 'Name' },
                  { value: 'room', label: 'Room Number' },
                  { value: 'status', label: 'Status' },
                  { value: 'rent', label: 'Rent Amount' }
                ].map(option => (
                  <TouchableOpacity
                    key={option.value}
                    onPress={() => setSortBy(option.value)}
                    style={[
                      styles.filterOption,
                      sortBy === option.value && styles.filterOptionSelected
                    ]}
                  >
                    <Text style={[
                      styles.filterOptionText,
                      sortBy === option.value && styles.filterOptionTextSelected
                    ]}>
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </ScrollView>

          <View style={styles.modalFooter}>
            <TouchableOpacity 
              onPress={clearFilters}
              style={styles.clearAllButton}
            >
              <Text style={styles.clearAllButtonText}>Clear All</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              onPress={() => setShowFilterModal(false)}
              style={styles.applyButton}
            >
              <Text style={styles.applyButtonText}>Apply Filters</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
  searchContainer: {
    flexDirection: 'row',
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    gap: 12,
  },
  searchInputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  searchInput: {
    flex: 1,
    padding: 12,
    fontSize: 16,
  },
  filterButton: {
    width: 44,
    height: 44,
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  filterSummary: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#EFF6FF',
    borderBottomWidth: 1,
    borderBottomColor: '#DBEAFE',
  },
  filterSummaryText: {
    fontSize: 12,
    color: '#1E40AF',
    flex: 1,
  },
  clearFiltersText: {
    fontSize: 12,
    color: '#EF4444',
    fontWeight: '500',
  },
  scrollView: {
    flex: 1,
    padding: 16,
  },
  pullText: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 8,
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
    marginBottom: 2,
  },
  tenantPhone: {
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
    fontWeight: '500',
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
  modalContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
  },
  closeButton: {
    padding: 4,
  },
  modalContent: {
    flex: 1,
    padding: 16,
  },
  filterSection: {
    marginBottom: 24,
  },
  filterSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 12,
  },
  filterOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterOption: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  filterOptionSelected: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  filterOptionText: {
    fontSize: 14,
    color: '#374151',
    fontWeight: '500',
  },
  filterOptionTextSelected: {
    color: '#FFFFFF',
  },
  modalFooter: {
    flexDirection: 'row',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    gap: 12,
  },
  clearAllButton: {
    flex: 1,
    padding: 16,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
  },
  clearAllButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
  },
  applyButton: {
    flex: 1,
    padding: 16,
    borderRadius: 8,
    backgroundColor: '#007AFF',
    alignItems: 'center',
  },
  applyButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});

