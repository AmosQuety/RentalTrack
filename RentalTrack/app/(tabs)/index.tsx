// app/(tabs)/index.tsx - PREMIUM REDESIGN
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useDatabase } from '../../hooks/use-db';
import { useAuth } from '../../context/AuthContext';
import { Tenant } from '../../libs/types';
import { useTheme } from '../../theme/ThemeContext';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';

export default function Dashboard() {
  const { isInitialized, getAllTenants, getDashboardStats, heartbeatResults } = useDatabase();
  const { user } = useAuth();
  const router = useRouter();
  const { colors, typography, isDark } = useTheme();
  
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [dashboardStats, setDashboardStats] = useState({
    totalTenants: 0,
    overdueTenants: 0,
    dueSoonTenants: 0,
    paidTenants: 0,
    totalMonthlyRent: 0,
    totalCreditBalance: 0,
    collectionRate: 0,
  });

  const loadData = useCallback(async () => {
    if (!isInitialized || !user) return;
    
    try {
      console.log('🔄 Dashboard: Loading data...');
      const [allTenants, stats] = await Promise.all([
        getAllTenants(user.user_id),
        getDashboardStats(user.user_id)
      ]);
      
      setTenants(allTenants);
      setDashboardStats(stats);
      console.log('✅ Dashboard: Data loaded');
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    }
  }, [isInitialized, user, getAllTenants, getDashboardStats]);

  const [isRefreshing, setIsRefreshing] = useState(false);
  const refresh = async () => {
    setIsRefreshing(true);
    await loadData();
    setIsRefreshing(false);
  };

  useEffect(() => {
    loadData();
  }, [loadData]);

  useFocusEffect(
    useCallback(() => {
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
      case 'Paid': return colors.success;
      case 'Due Soon': return colors.warning;
      case 'Overdue': return colors.danger;
      default: return colors.textSecondary;
    }
  };

  const getStatusBackground = (status: string) => {
    switch (status) {
      case 'Paid': return colors.successBackground;
      case 'Due Soon': return colors.warningBackground;
      case 'Overdue': return colors.dangerBackground;
      default: return isDark ? colors.border : '#F3F4F6';
    }
  };

  if (!isInitialized) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.text }}>Loading database...</Text>
      </View>
    );
  }

  // Use real collection rate from DB
  const healthScore = dashboardStats.collectionRate;

  return (
    <ScrollView 
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.contentContainer}
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={refresh}
          colors={[colors.primary]}
          tintColor={colors.primary}
        />
      }
    >
      <View style={styles.header}>
        <Text style={[styles.greeting, { color: colors.textSecondary, fontFamily: typography.fonts.medium }]}>
          {user ? `Hello, ${user.email.split('@')[0]}` : 'Good Morning,'}
        </Text>
        <Text style={[styles.title, { color: colors.text, fontFamily: typography.fonts.bold }]}>
          Portfolio Overview
        </Text>
      </View>
      
      {/* 1. Hero Card: Primary Metrics */}
      <Card style={[styles.heroCard, { backgroundColor: colors.primary }]}>
        <View style={styles.heroRow}>
          <View>
            <Text style={[styles.heroLabel, { color: 'rgba(255,255,255,0.8)' }]}>Expected Monthly Rent</Text>
            <Text style={[styles.heroAmount, { fontFamily: typography.fonts.bold }]}>
              {formatCurrency(dashboardStats.totalMonthlyRent)} UGX
            </Text>
          </View>
          <View style={styles.healthBadge}>
            <Ionicons name="pulse" size={14} color="#10B981" />
            <Text style={styles.healthText}>{healthScore}% Collection</Text>
          </View>
        </View>
        
        <View style={styles.heroDivider} />
        
        <View style={styles.heroMetrics}>
          <View style={styles.heroMetricItem}>
            <Text style={styles.heroMetricValue}>{dashboardStats.totalTenants}</Text>
            <Text style={styles.heroMetricLabel}>Total Tenants</Text>
          </View>
          <View style={styles.heroMetricItem}>
            <Text style={styles.heroMetricValue}>{dashboardStats.paidTenants}</Text>
            <Text style={styles.heroMetricLabel}>Paid</Text>
          </View>
          <View style={styles.heroMetricItem}>
            <Text style={[styles.heroMetricValue, { color: '#EF4444' }]}>
              {dashboardStats.overdueTenants}
            </Text>
            <Text style={styles.heroMetricLabel}>Overdue</Text>
          </View>
        </View>
      </Card>

      {/* 2. Secondary Metrics (Two columns) */}
      <View style={styles.secondaryMetricsRow}>
        <Card style={styles.smallMetricCard}>
          <Ionicons name="wallet-outline" size={24} color={colors.primary} style={styles.metricIcon} />
          <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>Total Outstanding</Text>
          <Text style={[styles.metricValue, { color: colors.text, fontFamily: typography.fonts.semibold }]}>
            {formatCurrency(Math.abs(dashboardStats.totalCreditBalance))}
          </Text>
        </Card>
        <Card style={styles.smallMetricCard}>
          <Ionicons name="alert-circle-outline" size={24} color={colors.danger} style={styles.metricIcon} />
          <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>Due Soon</Text>
          <Text style={[styles.metricValue, { color: colors.warning, fontFamily: typography.fonts.semibold }]}>
            {dashboardStats.dueSoonTenants} Tenants
          </Text>
        </Card>
      </View>

      {/* Show heartbeat alerts if any */}
      {heartbeatResults && (heartbeatResults.suspensionAlerts.length > 0 || heartbeatResults.contractAlerts.length > 0) && (
        <Card style={[styles.alertContainer, { backgroundColor: colors.warningBackground, borderColor: colors.warning }]}>
          <Text style={[styles.alertTitle, { color: colors.warning }]}>System Alerts</Text>
          
          {heartbeatResults.suspensionAlerts.map((alert, index) => (
            <View key={index} style={styles.alertItem}>
              <Text style={[styles.alertText, { color: colors.text }]}>🚨 {alert}</Text>
            </View>
          ))}
          
          {heartbeatResults.contractAlerts.map((alert, index) => (
            <View key={index} style={styles.alertItem}>
              <Text style={[styles.alertText, { color: colors.text }]}>📝 {alert}</Text>
            </View>
          ))}
        </Card>
      )}

      {/* 3. Quick Actions */}
      <View style={styles.actionsContainer}>
        <Button 
          title="Add New Tenant" 
          onPress={() => router.push('/add-tenant')}
          leftIcon={<Ionicons name="add-circle" size={20} color={colors.primaryContrast} />}
          size="lg"
        />
      </View>

      {/* 4. Recent Tenants List */}
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: colors.text, fontFamily: typography.fonts.semibold }]}>
          Recent Tenants
        </Text>
        <TouchableOpacity onPress={() => router.push('/tenants')}>
          <Text style={[styles.seeAllText, { color: colors.primary, fontFamily: typography.fonts.medium }]}>
            See All
          </Text>
        </TouchableOpacity>
      </View>

      {tenants.slice(0, 5).map(tenant => (
        <TouchableOpacity 
          key={tenant.tenant_id}
          activeOpacity={0.7}
          onPress={() => router.push(`/tenant-details?tenantId=${tenant.tenant_id}`)}
        >
          <Card style={styles.tenantCard} noPadding>
            <View style={styles.tenantCardPadding}>
              <View style={styles.tenantAvatarContainer}>
                <View style={[styles.tenantAvatar, { backgroundColor: colors.inputBackground }]}>
                  <Text style={[styles.avatarText, { color: colors.primary, fontFamily: typography.fonts.bold }]}>
                    {tenant.name.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.tenantInfo}>
                  <Text style={[styles.tenantName, { color: colors.text, fontFamily: typography.fonts.semibold }]} numberOfLines={1}>
                    {tenant.name}
                  </Text>
                  <Text style={[styles.tenantRoom, { color: colors.textSecondary }]}>
                    Room {tenant.room_number} • {formatCurrency(tenant.monthly_rent)} UGX
                  </Text>
                </View>
              </View>
              <View 
                style={[
                  styles.statusBadge,
                  { backgroundColor: getStatusBackground(tenant.status) }
                ]}
              >
                <Text style={[styles.statusText, { color: getStatusColor(tenant.status), fontFamily: typography.fonts.medium }]}>
                  {tenant.status}
                </Text>
              </View>
            </View>
          </Card>
        </TouchableOpacity>
      ))}

      {tenants.length === 0 && (
        <View style={styles.emptyState}>
          <Ionicons name="home-outline" size={48} color={colors.border} />
          <Text style={[styles.emptyStateTitle, { color: colors.text, fontFamily: typography.fonts.semibold }]}>
            No Tenants Yet
          </Text>
          <Text style={[styles.emptyStateText, { color: colors.textSecondary }]}>
            Add your first tenant to start tracking rent payments and managing your portfolio.
          </Text>
          <Button 
            title="Add Tenant" 
            onPress={() => router.push('/add-tenant')}
            style={{ marginTop: 16 }}
            variant="secondary"
          />
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
    paddingBottom: 100, // Make room for floating tab bar
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    marginBottom: 20,
  },
  greeting: {
    fontSize: 14,
    marginBottom: 4,
  },
  title: {
    fontSize: 28,
  },
  
  // Hero Card
  heroCard: {
    padding: 24,
    marginBottom: 20,
    borderWidth: 0, // Removes border from theme for Hero specifically if any
  },
  heroRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  heroLabel: {
    fontSize: 14,
    marginBottom: 8,
  },
  heroAmount: {
    fontSize: 32,
    color: '#FFFFFF',
  },
  healthBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  healthText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 6,
  },
  heroDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    marginVertical: 20,
  },
  heroMetrics: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  heroMetricItem: {
    alignItems: 'center',
  },
  heroMetricValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  heroMetricLabel: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.8)',
  },

  // Secondary Metrics
  secondaryMetricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  smallMetricCard: {
    width: '48%',
    padding: 16,
  },
  metricIcon: {
    marginBottom: 12,
  },
  metricLabel: {
    fontSize: 12,
    marginBottom: 4,
  },
  metricValue: {
    fontSize: 18,
  },

  actionsContainer: {
    marginBottom: 32,
  },

  // List Items
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
  },
  seeAllText: {
    fontSize: 14,
  },
  tenantCard: {
    marginBottom: 12,
  },
  tenantCardPadding: {
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tenantAvatarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  tenantAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    fontSize: 18,
  },
  tenantInfo: {
    flex: 1,
    marginRight: 12,
  },
  tenantName: {
    fontSize: 16,
    marginBottom: 4,
  },
  tenantRoom: {
    fontSize: 13,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 12,
  },

  // Alerts
  alertContainer: {
    padding: 16,
    marginBottom: 24,
    borderLeftWidth: 4,
  },
  alertTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  alertItem: {
    marginBottom: 4,
  },
  alertText: {
    fontSize: 13,
  },

  // Empty State
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyStateTitle: {
    fontSize: 18,
    marginTop: 16,
    marginBottom: 8,
  },
  emptyStateText: {
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 20,
    lineHeight: 20,
  },
});
