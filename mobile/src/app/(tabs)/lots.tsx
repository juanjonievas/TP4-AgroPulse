import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import PlotCard from '../../components/PlotCard';
import { useAuth } from '../../contexts/AuthContext';
import { useDashboardData } from '../../hooks/useDashboardData';
import { getPlotStatus } from '../../utils/status';

export default function LotsScreen() {
  const router = useRouter();
  const { role, user } = useAuth();
  const { plots, loading, error, refresh } = useDashboardData();

  const stats = useMemo(() => {
    let optimal = 0;
    let dry = 0;
    let wet = 0;
    let stale = 0;

    plots.forEach((p) => {
      const st = getPlotStatus(
        p.reading?.moisture_pct ?? null,
        p.threshold_min,
        p.threshold_max,
        p.reading?.measured_at ?? null
      );
      if (st === 'optimal') optimal++;
      else if (st === 'dry') dry++;
      else if (st === 'wet') wet++;
      else if (st === 'stale') stale++;
    });

    return {
      total: plots.length,
      optimal,
      dry,
      wet,
      stale,
    };
  }, [plots]);

  const renderHeader = () => (
    <View style={styles.headerArea}>
      <View style={styles.statusBar}>
        <View style={styles.statusDotRow}>
          <View style={[styles.miniDot, { backgroundColor: '#059669' }]} />
          <Text style={styles.statusText}>{stats.optimal} óptimo{stats.optimal !== 1 ? 's' : ''}</Text>
        </View>
        <View style={styles.statusDotRow}>
          <View style={[styles.miniDot, { backgroundColor: '#dc2626' }]} />
          <Text style={styles.statusText}>{stats.dry} seco{stats.dry !== 1 ? 's' : ''}</Text>
        </View>
        {stats.wet > 0 && (
          <View style={styles.statusDotRow}>
            <View style={[styles.miniDot, { backgroundColor: '#2563eb' }]} />
            <Text style={styles.statusText}>{stats.wet} exceso</Text>
          </View>
        )}
        {stats.stale > 0 && (
          <View style={styles.statusDotRow}>
            <View style={[styles.miniDot, { backgroundColor: '#64748b' }]} />
            <Text style={styles.statusText}>{stats.stale} sin señal</Text>
          </View>
        )}
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.topBar}>
        <View>
          <Text style={styles.brandTitle}>AgroPulse</Text>
          <Text style={styles.brandSubtitle}>Monitoreo de Lotes</Text>
        </View>
        {user && (
          <View style={styles.userBadge}>
            <Text style={styles.userRoleText}>{role || 'usuario'}</Text>
          </View>
        )}
      </View>

      {loading && plots.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#059669" />
          <Text style={styles.loadingText}>Cargando lotes...</Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <MaterialIcons name="error-outline" size={40} color="#dc2626" />
          <Text style={styles.errorTitle}>Error al sincronizar</Text>
          <Text style={styles.errorSubtext}>{error.message || 'No se pudo conectar al servidor.'}</Text>
          <TouchableOpacity onPress={refresh} style={styles.retryBtn}>
            <Text style={styles.retryText}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      ) : plots.length === 0 ? (
        <View style={styles.center}>
          <MaterialIcons name="grass" size={40} color="#94a3b8" />
          <Text style={styles.emptyTitle}>Sin lotes asignados</Text>
        </View>
      ) : (
        <FlatList
          data={plots}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={renderHeader}
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={refresh}
              colors={['#059669']}
              tintColor="#059669"
            />
          }
          renderItem={({ item }) => (
            <PlotCard
              plot={item}
              reading={item.reading}
              valve={item.valve}
              onPress={() => router.push({ pathname: '/plot/[id]', params: { id: item.id } } as never)}
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  brandTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0f172a',
  },
  brandSubtitle: {
    fontSize: 12,
    color: '#64748b',
  },
  userBadge: {
    backgroundColor: '#ecfdf5',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  userRoleText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#059669',
    textTransform: 'capitalize',
  },
  headerArea: {
    paddingVertical: 10,
  },
  statusBar: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  statusDotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  miniDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '500',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 14,
    color: '#64748b',
  },
  errorTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#dc2626',
    marginTop: 8,
  },
  errorSubtext: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 4,
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#64748b',
    marginTop: 8,
  },
  retryBtn: {
    backgroundColor: '#059669',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  retryText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 13,
  },
});
