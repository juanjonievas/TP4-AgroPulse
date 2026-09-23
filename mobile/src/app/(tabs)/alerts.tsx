import React, { useEffect, useState, useCallback } from 'react';
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
import { MaterialIcons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface AlertItem {
  id: string;
  plot_id: string;
  type: 'moisture_low' | 'moisture_high' | 'stale';
  payload: {
    status: 'active' | 'resolved';
    resolved_at?: string;
  };
  created_at: string;
  plots?: {
    name: string;
  } | null;
}

export default function AlertsScreen() {
  const { user } = useAuth();
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'active' | 'resolved'>('all');

  const loadAlerts = useCallback(async () => {
    if (!user) return;
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('alerts')
        .select(`
          id,
          plot_id,
          type,
          payload,
          created_at,
          plots ( name )
        `)
        .order('created_at', { ascending: false });

      if (!error && data) {
        setAlerts(data as any[]);
      }
    } catch (err) {
      console.error('Error cargando alertas:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadAlerts();
  }, [loadAlerts]);

  const filteredAlerts = alerts.filter((a) => {
    const status = a.payload?.status || 'active';
    if (filter === 'active') return status === 'active';
    if (filter === 'resolved') return status === 'resolved';
    return true;
  });

  const getAlertInfo = (type: string) => {
    switch (type) {
      case 'moisture_low':
        return {
          title: 'Suelo Seco / Humedad Baja',
          desc: 'La humedad cayó por debajo del umbral mínimo configurado.',
          icon: 'warning' as const,
          color: '#dc2626',
          bg: '#fef2f2',
          border: '#fecaca',
        };
      case 'moisture_high':
        return {
          title: 'Exceso Hídrico',
          desc: 'La humedad superó el umbral máximo de saturación.',
          icon: 'water-drop' as const,
          color: '#2563eb',
          bg: '#eff6ff',
          border: '#bfdbfe',
        };
      case 'stale':
        return {
          title: 'Estación Sin Señal (Stale)',
          desc: 'No se reciben telemetrías hace más de 15 minutos.',
          icon: 'cloud-off' as const,
          color: '#64748b',
          bg: '#f1f5f9',
          border: '#e2e8f0',
        };
      default:
        return {
          title: 'Alerta del Sistema',
          desc: 'Evento agronómico detectado en el lote.',
          icon: 'info' as const,
          color: '#64748b',
          bg: '#f1f5f9',
          border: '#e2e8f0',
        };
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.topBar}>
        <Text style={styles.brandTitle}>Alertas Agronómicas</Text>
        <Text style={styles.brandSubtitle}>Monitoreo de anomalías de humedad y conectividad</Text>

        {/* Barra de Filtros */}
        <View style={styles.filterRow}>
          <TouchableOpacity
            style={[styles.filterChip, filter === 'all' && styles.filterChipActive]}
            onPress={() => setFilter('all')}
          >
            <Text style={[styles.filterText, filter === 'all' && styles.filterTextActive]}>
              Todas ({alerts.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.filterChip, filter === 'active' && styles.filterChipActive]}
            onPress={() => setFilter('active')}
          >
            <Text style={[styles.filterText, filter === 'active' && styles.filterTextActive]}>
              Activas ({alerts.filter((a) => a.payload?.status === 'active').length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.filterChip, filter === 'resolved' && styles.filterChipActive]}
            onPress={() => setFilter('resolved')}
          >
            <Text style={[styles.filterText, filter === 'resolved' && styles.filterTextActive]}>
              Resueltas ({alerts.filter((a) => a.payload?.status === 'resolved').length})
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {loading && alerts.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#059669" />
          <Text style={styles.loadingText}>Cargando historial de alertas...</Text>
        </View>
      ) : filteredAlerts.length === 0 ? (
        <View style={styles.center}>
          <View style={styles.emptyIconCircle}>
            <MaterialIcons name="check-circle" size={48} color="#059669" />
          </View>
          <Text style={styles.emptyTitle}>Todo en orden</Text>
          <Text style={styles.emptySubtext}>
            {filter === 'active'
              ? 'Actualmente no hay alertas activas en los lotes monitoreados.'
              : 'No se encontraron registros de alertas para este filtro.'}
          </Text>
          <TouchableOpacity style={styles.refreshBtn} onPress={loadAlerts}>
            <MaterialIcons name="refresh" size={16} color="#ffffff" />
            <Text style={styles.refreshBtnText}>Actualizar</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={filteredAlerts}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={loadAlerts}
              colors={['#059669']}
              tintColor="#059669"
            />
          }
          renderItem={({ item }) => {
            const info = getAlertInfo(item.type);
            const isActive = (item.payload?.status || 'active') === 'active';

            return (
              <View style={[styles.alertCard, { borderColor: info.border, borderLeftColor: info.color }]}>
                <View style={styles.cardHeader}>
                  <View style={styles.titleWithIcon}>
                    <MaterialIcons name={info.icon} size={20} color={info.color} />
                    <Text style={[styles.cardTitle, { color: info.color }]}>{info.title}</Text>
                  </View>
                  <View
                    style={[
                      styles.statusPill,
                      { backgroundColor: isActive ? '#fef2f2' : '#ecfdf5' },
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusPillText,
                        { color: isActive ? '#dc2626' : '#059669' },
                      ]}
                    >
                      {isActive ? 'ACTIVA' : 'RESUELTA'}
                    </Text>
                  </View>
                </View>

                <Text style={styles.cardDesc}>{info.desc}</Text>

                <View style={styles.metaRow}>
                  <View style={styles.metaItem}>
                    <MaterialIcons name="grid-view" size={14} color="#64748b" />
                    <Text style={styles.metaText}>
                      Lote: {item.plots?.name || 'Lote sin asignar'}
                    </Text>
                  </View>

                  <View style={styles.metaItem}>
                    <MaterialIcons name="access-time" size={14} color="#64748b" />
                    <Text style={styles.metaText}>
                      {new Date(item.created_at).toLocaleString()}
                    </Text>
                  </View>
                </View>
              </View>
            );
          }}
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
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  brandTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0f172a',
  },
  brandSubtitle: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
    marginBottom: 10,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  filterChipActive: {
    backgroundColor: '#059669',
    borderColor: '#059669',
  },
  filterText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  filterTextActive: {
    color: '#ffffff',
  },
  listContent: {
    padding: 16,
    paddingBottom: 24,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#64748b',
  },
  emptyIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#ecfdf5',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
  },
  emptySubtext: {
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 16,
    maxWidth: 280,
  },
  refreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#059669',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  refreshBtnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 13,
  },
  alertCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderLeftWidth: 5,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  titleWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: '800',
  },
  cardDesc: {
    fontSize: 12,
    color: '#475569',
    lineHeight: 16,
    marginBottom: 10,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '500',
  },
});
