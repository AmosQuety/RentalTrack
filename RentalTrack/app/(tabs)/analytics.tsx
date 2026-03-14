// app/(tabs)/analytics.tsx - WITH AUTO-REFRESH
import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useDatabase } from '../../hooks/use-db';
import { useAuth } from '../../context/AuthContext';
import { Database } from '../../db/database';
import { ReportGenerator } from '../../services/ReportGenerator';
import { EmptyState } from '../../components/EmptyState';
import { useTheme } from '../../theme/ThemeContext';
import { Card } from '../../components/ui/Card';

export default function Analytics() {
  const { isInitialized, getPaymentStats, getMonthlyTrend, recalculatePaymentStats, getLedgerSummary } = useDatabase();
  const { user } = useAuth();
  const { colors, typography, isDark } = useTheme();
  const [stats, setStats] = useState({
    totalCollected: 0,
    thisMonth: 0,
    lastMonth: 0,
    overdueAmount: 0,
  });
  const [monthlyTrend, setMonthlyTrend] = useState<{ month: string; amount: number }[]>([]);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  const loadStats = useCallback(async () => {
    if (!isInitialized || !user) return;
    
    try {
      console.log('🔄 Analytics: Loading data...');
      await recalculatePaymentStats();
      
      const [paymentStats, trend] = await Promise.all([
        getPaymentStats(user.user_id),
        getMonthlyTrend(user.user_id)
      ]);

      setStats(paymentStats);
      setMonthlyTrend(trend);
      setLastUpdated(new Date());
      console.log('✅ Analytics: Data loaded');
    } catch (error) {
      console.error('Failed to load stats:', error);
    }
  }, [isInitialized, getPaymentStats, getMonthlyTrend, recalculatePaymentStats]);

  const [isRefreshing, setIsRefreshing] = useState(false);
  const refresh = async () => {
    setIsRefreshing(true);
    await loadStats();
    setIsRefreshing(false);
  };

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

  // Add periodic refresh (every 30 seconds when in focus)
  useEffect(() => {
    const interval = setInterval(() => {
      loadStats();
    }, 30000);

    return () => clearInterval(interval);
  }, [loadStats]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-UG', {
      minimumFractionDigits: 0,
    }).format(amount);
  }

  
  const maxAmount = Math.max(...monthlyTrend.map((m) => m.amount), 1);
  const monthGrowth =
    stats.lastMonth > 0
      ? Number(((stats.thisMonth - stats.lastMonth) / stats.lastMonth * 100).toFixed(1))
      : 0;

  const handleGenerateTaxReport = async () => {
    if (!user) return;
    try {
      setIsGeneratingPdf(true);
      const today = new Date();
      // YTD: January 1st to today
      const fromDate = `${today.getFullYear()}-01-01`;
      const toDate = today.toISOString().split('T')[0];
      
      const summaryData = await getLedgerSummary(user.user_id, fromDate, toDate);
      await ReportGenerator.generateTaxSummary(summaryData, fromDate, toDate, 'UGX');
    } catch (error) {
      Alert.alert('Error', 'Failed to generate Tax Summary PDF.');
      console.error(error);
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  if (!isInitialized) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (stats.totalCollected === 0 && monthlyTrend.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <EmptyState
          icon="bar-chart-outline"
          title="No Data Yet"
          subtitle="Record your first rent payment to see analytics, trends, and generate tax reports."
        />
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={refresh}
          colors={[colors.primary]}
          tintColor={colors.primary}
        />
      }
    >
       <Text style={[styles.pullText, { color: colors.textSecondary }]}>Pull down to refresh • Last updated: {lastUpdated.toLocaleTimeString()}</Text>

      {/* Stats Cards */}
      <View style={styles.statsGrid}>
        <Card style={[styles.statCard, { backgroundColor: isDark ? colors.card : '#DBEAFE' }]}>
          <Text style={[styles.statLabel, { color: isDark ? colors.textSecondary : '#6B7280' }]}>Total Collected</Text>
          <Text style={[styles.statValue, { color: isDark ? colors.text : '#111827' }]}>{formatCurrency(stats.totalCollected)} UGX</Text>
        </Card>

        <Card style={[styles.statCard, { backgroundColor: isDark ? colors.card : '#D1FAE5' }]}>
          <Text style={[styles.statLabel, { color: isDark ? colors.textSecondary : '#6B7280' }]}>This Month</Text>
          <Text style={[styles.statValue, { color: isDark ? colors.text : '#111827' }]}>{formatCurrency(stats.thisMonth)} UGX</Text>
          {monthGrowth !== 0 && (
            <Text
              style={[
                styles.growth,
                { color: monthGrowth > 0 ? colors.success : colors.danger },
              ]}
            >
              {monthGrowth > 0 ? '↑' : '↓'} {Math.abs(Number(monthGrowth))}%
            </Text>
          )}
        </Card>

        <Card style={[styles.statCard, { backgroundColor: isDark ? colors.card : '#E0E7FF' }]}>
          <Text style={[styles.statLabel, { color: isDark ? colors.textSecondary : '#6B7280' }]}>Last Month</Text>
          <Text style={[styles.statValue, { color: isDark ? colors.text : '#111827' }]}>{formatCurrency(stats.lastMonth)} UGX</Text>
        </Card>

        <Card style={[styles.statCard, { backgroundColor: isDark ? colors.card : '#FEE2E2' }]}>
          <Text style={[styles.statLabel, { color: isDark ? colors.textSecondary : '#6B7280' }]}>Overdue</Text>
          <Text style={[styles.statValue, { color: isDark ? colors.danger : '#111827' }]}>{formatCurrency(stats.overdueAmount)} UGX</Text>
        </Card>
      </View>

      {/* Chart */}
      <View style={styles.chartContainer}>
        <Text style={[styles.chartTitle, { color: colors.text }]}>6-Month Payment Trend</Text>

        <View style={styles.chart}>
          {monthlyTrend.map((item, index) => {
            const barHeight = (item.amount / maxAmount) * 150;
            return (
              <View key={index} style={styles.barContainer}>
                <View style={styles.barWrapper}>
                  <Text style={[styles.barValue, { color: colors.textSecondary }]}>
                    {item.amount > 0 ? (item.amount / 1000).toFixed(0) + 'k' : ''}
                  </Text>
                  <View
                    style={[
                      styles.bar,
                      {
                        height: Math.max(barHeight, 5),
                        backgroundColor: item.amount > 0 ? colors.primary : colors.border,
                      },
                    ]}
                  />
                </View>
                <Text style={[styles.barLabel, { color: colors.textSecondary }]}>{item.month}</Text>
              </View>
            );
          })}
        </View>
      </View>

      {/* Summary */}
      <Card style={styles.summaryContainer}>
        <Text style={[styles.summaryTitle, { color: colors.text }]}>Quick Summary</Text>
        <View style={styles.summaryRow}>
          <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Average Monthly</Text>
          <Text style={[styles.summaryValue, { color: colors.text }]}>
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
          <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Best Month</Text>
          <Text style={[styles.summaryValue, { color: colors.text }]}>
            {monthlyTrend.length > 0
              ? monthlyTrend.reduce(
                  (max, m) => (m.amount > max.amount ? m : max),
                  monthlyTrend[0]
                ).month
              : 'N/A'}
          </Text>
        </View>

        <View style={styles.summaryRow}>
          <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Last Updated</Text>
          <Text style={[styles.summaryValue, { color: colors.text }]}>
            {new Date().toLocaleTimeString()}
          </Text>
        </View>

        <TouchableOpacity 
          style={[styles.taxButton, { backgroundColor: colors.success }]}
          onPress={handleGenerateTaxReport}
          disabled={isGeneratingPdf}
        >
          {isGeneratingPdf ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <Text style={styles.taxButtonText}>Export Tax Summary (YTD)</Text>
          )}
        </TouchableOpacity>
      </Card>
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
  taxButton: {
    backgroundColor: '#059669',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 16,
  },
  taxButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
});
