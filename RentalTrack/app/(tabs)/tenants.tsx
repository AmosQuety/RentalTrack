// app/(tabs)/tenants.tsx - WITH AUTO-REFRESH & CSV IMPORT/EXPORT
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Modal, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, ActivityIndicator } from 'react-native';
import { useDatabase } from '../../hooks/use-db';
import { useAuth } from '../../context/AuthContext';
import { Tenant } from '../../libs/types';
import { EmptyState } from '../../components/EmptyState';
import { ImportModal } from '../../components/ImportModal';
import { CSVService } from '../../services/CSVService';
import { Logger } from '../../services/logger/index';
import { useTheme } from '../../theme/ThemeContext';
import { Card } from '../../components/ui/Card';

export default function TenantsScreen() {
  const router = useRouter();
  const { isInitialized, getAllTenants } = useDatabase();
  const { user } = useAuth();
  const { colors, typography, isDark } = useTheme();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [filteredTenants, setFilteredTenants] = useState<Tenant[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [sortBy, setSortBy] = useState<string>('name');
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const loadTenants = useCallback(async () => {
    if (!isInitialized || !user) return;
    
    try {
      console.log('🔄 Tenants: Loading data...');
      const allTenants = await getAllTenants(user.user_id);
      setTenants(allTenants);
      console.log('✅ Tenants: Data loaded');
    } catch (error) {
      Logger.error('Failed to load tenants', { actionType: "TENANTS_LOAD_ERROR", error });
    }
  }, [isInitialized, getAllTenants]);

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

  const handleExport = async () => {
    try {
      setIsExporting(true);
      await CSVService.exportTenantsCSV(tenants);
      setShowFilterModal(false);
    } catch (err) {
      Alert.alert('Export Failed', 'Could not save the CSV file.');
    } finally {
      setIsExporting(false);
    }
  };

  const [isRefreshing, setIsRefreshing] = useState(false);
  const refresh = async () => {
    setIsRefreshing(true);
    await loadTenants();
    setIsRefreshing(false);
  };

  if (!isInitialized) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={{ color: colors.textSecondary, marginTop: 12 }}>Loading...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.text }]}>All Tenants</Text>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <TouchableOpacity 
            style={[styles.headerIconButton, { backgroundColor: isDark ? colors.inputBackground : '#EFF6FF' }]}
            onPress={() => setShowImportModal(true)}
          >
            <Ionicons name="cloud-upload-outline" size={24} color={colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.addButton, { backgroundColor: colors.primary }]}
            onPress={() => router.push('/add-tenant')}
          >
            <Ionicons name="add" size={24} color={colors.primaryContrast} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Search Bar */}
      <View style={[styles.searchContainer, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <View style={[styles.searchInputContainer, { backgroundColor: isDark ? colors.inputBackground : '#F9FAFB', borderColor: isDark ? colors.border : '#E5E7EB' }]}>
          <Ionicons name="search" size={20} color={colors.textSecondary} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder="Search tenants by name, room, or phone..."
            placeholderTextColor={colors.textSecondary}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery ? (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          ) : null}
        </View>
        
        <TouchableOpacity 
          style={[styles.filterButton, { backgroundColor: isDark ? colors.inputBackground : '#F9FAFB', borderColor: isDark ? colors.border : '#E5E7EB' }]}
          onPress={() => setShowFilterModal(true)}
        >
          <Ionicons name="filter" size={20} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Filter Summary */}
      {(searchQuery || statusFilter !== 'All' || sortBy !== 'name') && (
        <View style={[styles.filterSummary, { backgroundColor: isDark ? colors.warningBackground : '#EFF6FF', borderBottomColor: isDark ? colors.warning : '#DBEAFE' }]}>
          <Text style={[styles.filterSummaryText, { color: isDark ? colors.warning : '#1E40AF' }]}>
            Showing {filteredTenants.length} of {tenants.length} tenants
            {searchQuery && ` • Search: "${searchQuery}"`}
            {statusFilter !== 'All' && ` • Status: ${statusFilter}`}
            {sortBy !== 'name' && ` • Sorted by: ${sortBy}`}
          </Text>
          <TouchableOpacity onPress={clearFilters}>
            <Text style={[styles.clearFiltersText, { color: colors.primary }]}>Clear</Text>
          </TouchableOpacity>
        </View>
      )}

      <ScrollView 
        style={styles.scrollView}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={refresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
      >
        <Text style={[styles.pullText, { color: colors.textSecondary }]}>Pull down to refresh</Text>
        
        {filteredTenants.map(tenant => (
          <TouchableOpacity 
            key={tenant.tenant_id}
            onPress={() => router.push(`/tenant-details?tenantId=${tenant.tenant_id}`)}
            style={[styles.tenantCard, { backgroundColor: colors.card, borderColor: isDark ? colors.border : '#E5E7EB' }]}
          >
            <View style={styles.tenantInfo}>
              <View style={styles.tenantMain}>
                <Text style={[styles.tenantName, { color: colors.text }]}>{tenant.name}</Text>
                <Text style={[styles.tenantRoom, { color: colors.textSecondary }]}>Room {tenant.room_number}</Text>
                {tenant.phone ? (
                  <Text style={[styles.tenantPhone, { color: colors.textSecondary }]}>{tenant.phone}</Text>
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
            <Text style={[styles.rentText, { color: colors.text }]}>
              Rent: {tenant.monthly_rent.toLocaleString()} UGX
            </Text>
          </TouchableOpacity>
        ))}

        {filteredTenants.length === 0 && (
          <View style={{ marginTop: 20 }}>
            <EmptyState
              icon="people-outline"
              title={tenants.length === 0 ? "No Tenants Yet" : "No Matches"}
              subtitle={
                tenants.length === 0
                  ? "Add your first tenant or import from a spreadsheet."
                  : "No tenants match your search criteria. Try adjusting your filters."
              }
              actionLabel={tenants.length === 0 ? "+ Add Tenant" : undefined}
              onAction={tenants.length === 0 ? () => router.push('/add-tenant') : undefined}
              secondaryLabel={tenants.length === 0 ? "Import from Spreasheet" : undefined}
              onSecondaryAction={tenants.length === 0 ? () => setShowImportModal(true) : undefined}
            />
          </View>
        )}
      </ScrollView>

      {/* Import Modal */}
      <ImportModal
        visible={showImportModal}
        onClose={() => setShowImportModal(false)}
        onImportComplete={loadTenants}
      />

      {/* Filter Modal - Same as before */}
      <Modal
        visible={showFilterModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowFilterModal(false)}
      >
        <View style={[styles.modalContainer, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Filter & Sort</Text>
            <TouchableOpacity 
              onPress={() => setShowFilterModal(false)}
              style={[styles.closeButton, { backgroundColor: isDark ? colors.inputBackground : '#F3F4F6' }]}
            >
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalContent}>
            <View style={styles.filterSection}>
              <Text style={[styles.filterSectionTitle, { color: colors.text }]}>Status</Text>
              <View style={styles.filterOptions}>
                {['All', 'Paid', 'Due Soon', 'Overdue'].map(status => (
                  <TouchableOpacity
                    key={status}
                    onPress={() => setStatusFilter(status)}
                    style={[
                      styles.filterOption,
                      { backgroundColor: isDark ? colors.inputBackground : '#F3F4F6', borderColor: isDark ? colors.border : '#E5E7EB' },
                      statusFilter === status && { backgroundColor: colors.primary, borderColor: colors.primary }
                    ]}
                  >
                    <Text style={[
                      styles.filterOptionText,
                      { color: isDark ? colors.text : '#374151' },
                      statusFilter === status && { color: colors.primaryContrast }
                    ]}>
                      {status}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.filterSection}>
              <Text style={[styles.filterSectionTitle, { color: colors.text }]}>Sort By</Text>
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
                      { backgroundColor: isDark ? colors.inputBackground : '#F3F4F6', borderColor: isDark ? colors.border : '#E5E7EB' },
                      sortBy === option.value && { backgroundColor: colors.primary, borderColor: colors.primary }
                    ]}
                  >
                    <Text style={[
                      styles.filterOptionText,
                      { color: isDark ? colors.text : '#374151' },
                      sortBy === option.value && { color: colors.primaryContrast }
                    ]}>
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </ScrollView>

          <View style={[styles.modalFooter, { borderTopColor: colors.border }]}>
            <TouchableOpacity 
              onPress={handleExport}
              style={[styles.exportButton, { backgroundColor: isDark ? colors.inputBackground : '#F3F4F6', borderColor: isDark ? colors.border : '#E5E7EB' }]}
              disabled={isExporting}
            >
              <Ionicons name="download-outline" size={20} color={colors.textSecondary} style={{ marginRight: 6 }} />
              <Text style={[styles.exportButtonText, { color: colors.text }]}>{isExporting ? 'Exporting...' : 'Export CSV'}</Text>
            </TouchableOpacity>

            <View style={{ flex: 1, flexDirection: 'row', gap: 12 }}>
              <TouchableOpacity onPress={clearFilters} style={[styles.clearAllButton, { backgroundColor: isDark ? colors.inputBackground : '#F3F4F6' }]}>
                <Text style={[styles.clearAllButtonText, { color: colors.text }]}>Clear</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setShowFilterModal(false)} style={[styles.applyButton, { backgroundColor: colors.primary }]}>
                <Text style={[styles.applyButtonText, { color: colors.primaryContrast }]}>Apply</Text>
              </TouchableOpacity>
            </View>
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
  headerIconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#EFF6FF',
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
    flexDirection: 'column',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    gap: 12,
  },
  exportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  exportButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#374151',
  },
  clearAllButton: {
    flex: 1,
    padding: 14,
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

