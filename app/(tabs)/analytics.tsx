// app/(tabs)/analytics.tsx - WITH AUTO-REFRESH
import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAutoRefresh, useDatabase } from '../../hooks/use-db';

export default function Analytics() {
  const { isInitialized, getPaymentStats, getMonthlyTrend } = useDatabase();
  const [stats, setStats] = useState({
    totalCollected: 0,
    thisMonth: 0,
    lastMonth: 0,
    overdueAmount: 0,
  });
  const [monthlyTrend, setMonthlyTrend] = useState([]);

  const loadStats = useCallback(async () => {
    if (!isInitialized) return;

    try {
      console.log('🔄 Analytics: Loading data...');
      const paymentStats = await getPaymentStats();
      const trend = await getMonthlyTrend();
      setStats(paymentStats);
      setMonthlyTrend(trend);
      console.log('✅ Analytics: Data loaded');
    } catch (error) {
      console.error('Failed to load stats:', error);
    }
  }, [isInitialized, getPaymentStats, getMonthlyTrend]);

  // Auto-refresh on database changes
  const { isRefreshing, refresh } = useAutoRefresh(loadStats, [
    'payment_recorded',
    'tenant_added',
    'tenant_deleted'
  ]);

  // Initial load
  useEffect(() => {
    loadStats();
  }, [loadStats]);

  // Refresh when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      console.log('🎯 Analytics: Screen focused, refreshing...');
      loadStats();
    }, [loadStats])
  );

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-UG', {
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const maxAmount = Math.max(...monthlyTrend.map((m) => m.amount), 1);
  const monthGrowth =
    stats.lastMonth > 0
      ? ((stats.thisMonth - stats.lastMonth) / stats.lastMonth * 100).toFixed(1)
      : 0;

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
      <Text style={styles.pullText}>Pull down to refresh</Text>

      {/* Stats Cards */}
      <View style={styles.statsGrid}>
        <View style={[styles.statCard, { backgroundColor: '#DBEAFE' }]}>
          <Text style={styles.statLabel}>Total Collected</Text>
          <Text style={styles.statValue}>{formatCurrency(stats.totalCollected)} UGX</Text>
        </View>

        <View style={[styles.statCard, { backgroundColor: '#D1FAE5' }]}>
          <Text style={styles.statLabel}>This Month</Text>
          <Text style={styles.statValue}>{formatCurrency(stats.thisMonth)} UGX</Text>
          {monthGrowth !== 0 && (
            <Text
              style={[
                styles.growth,
                { color: monthGrowth > 0 ? '#10B981' : '#EF4444' },
              ]}
            >
              {monthGrowth > 0 ? '↑' : '↓'} {Math.abs(Number(monthGrowth))}%
            </Text>
          )}
        </View>

        <View style={[styles.statCard, { backgroundColor: '#E0E7FF' }]}>
          <Text style={styles.statLabel}>Last Month</Text>
          <Text style={styles.statValue}>{formatCurrency(stats.lastMonth)} UGX</Text>
        </View>

        <View style={[styles.statCard, { backgroundColor: '#FEE2E2' }]}>
          <Text style={styles.statLabel}>Overdue</Text>
          <Text style={styles.statValue}>{formatCurrency(stats.overdueAmount)} UGX</Text>
        </View>
      </View>

      {/* Chart */}
      <View style={styles.chartContainer}>
        <Text style={styles.chartTitle}>6-Month Payment Trend</Text>

        <View style={styles.chart}>
          {monthlyTrend.map((item, index) => {
            const barHeight = (item.amount / maxAmount) * 150;
            return (
              <View key={index} style={styles.barContainer}>
                <View style={styles.barWrapper}>
                  <Text style={styles.barValue}>
                    {item.amount > 0 ? (item.amount / 1000).toFixed(0) + 'k' : ''}
                  </Text>
                  <View
                    style={[
                      styles.bar,
                      {
                        height: Math.max(barHeight, 5),
                        backgroundColor: item.amount > 0 ? '#3B82F6' : '#E5E7EB',
                      },
                    ]}
                  />
                </View>
                <Text style={styles.barLabel}>{item.month}</Text>
              </View>
            );
          })}
        </View>
      </View>

      {/* Summary */}
      <View style={styles.summaryContainer}>
        <Text style={styles.summaryTitle}>Quick Summary</Text>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Average Monthly</Text>
          <Text style={styles.summaryValue}>
            {formatCurrency(
              monthlyTrend.length > 0
                ? monthlyTrend.reduce((sum, m) => sum + m.amount, 0) /
                  monthlyTrend.length
                : 0
            )}{' '}
            UGX
          </Text>
        </View>

        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Best Month</Text>
          <Text style={styles.summaryValue}>
            {monthlyTrend.length > 0
              ? monthlyTrend.reduce(
                  (max, m) => (m.amount > max.amount ? m : max),
                  monthlyTrend[0]
                ).month
              : 'N/A'}
          </Text>
        </View>

        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Last Updated</Text>
          <Text style={styles.summaryValue}>
            {new Date().toLocaleTimeString()}
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
    padding: 16,
  },
  pullText: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 8,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  statCard: {
    width: '48%',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  statLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 4,
    fontWeight: '500',
  },
  statValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111827',
  },
  growth: {
    fontSize: 12,
    marginTop: 4,
    fontWeight: '600',
  },
  chartContainer: {
    marginBottom: 24,
  },
  chartTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
    color: '#111827',
  },
  chart: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    height: 180,
    paddingVertical: 8,
  },
  barContainer: {
    alignItems: 'center',
    flex: 1,
  },
  barWrapper: {
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  bar: {
    width: 20,
    borderRadius: 6,
  },
  barValue: {
    fontSize: 10,
    color: '#374151',
    marginBottom: 2,
  },
  barLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
  },
  summaryContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
    color: '#111827',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  summaryLabel: {
    fontSize: 14,
    color: '#6B7280',
  },
  summaryValue: {
    fontSize: 14,
    color: '#111827',
    fontWeight: '500',
  },
});
