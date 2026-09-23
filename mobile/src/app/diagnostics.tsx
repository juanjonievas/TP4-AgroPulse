import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Reading } from '../types';

interface DiagnosticReading {
  id: string;
  station_id: string;
  stationName: string;
  plotName: string;
  moisture_pct: number;
  temp_c: number;
  rain_mm: number | null;
  measured_at: string;
}

export default function DiagnosticsScreen() {
  const { user, role } = useAuth();
  const [loading, setLoading] = useState(true);
  const [orgName, setOrgName] = useState<string>('Cargando...');
  const [orgId, setOrgId] = useState<string>('');
  const [latestReading, setLatestReading] = useState<DiagnosticReading | null>(null);
  const [lagSeconds, setLagSeconds] = useState<number | null>(null);
  const [supabaseStatus, setSupabaseStatus] = useState<'Conectado' | 'Error de conexión'>('Conectado');
  const [realtimeStatus, setRealtimeStatus] = useState<string>('CONECTANDO');
  const [totalTicksReceived, setTotalTicksReceived] = useState<number>(0);

  const lastTickTimeRef = useRef<number | null>(null);
  const stationIdsRef = useRef<string[]>([]);
  const stationMapRef = useRef<Map<string, { stationName: string; plotName: string }>>(new Map());

  useEffect(() => {
    let mounted = true;
    let lagInterval: ReturnType<typeof setInterval> | null = null;
    let channel: any = null;

    async function loadInitialData() {
      if (!user) return;
      try {
        setLoading(true);

        // 1. Obtener la organización real asignada al usuario
        const { data: memberData, error: memberErr } = await supabase
          .from('memberships')
          .select('organization_id, organizations(id, name, region)')
          .eq('user_id', user.id)
          .maybeSingle();

        if (memberErr) {
          console.error('[Diagnostics] Error consultando organización:', memberErr);
        }

        const org = memberData?.organizations as any;
        if (mounted) {
          setOrgName(org?.name || 'Organización no asignada');
          setOrgId(memberData?.organization_id || '');
        }

        // 2. Obtener lotes y estaciones pertenecientes a la organización del usuario
        const { data: plotsData, error: plotsErr } = await supabase
          .from('plots')
          .select('id, name, stations(id, name)');

        if (plotsErr) {
          console.error('[Diagnostics] Error consultando estaciones del usuario:', plotsErr);
        }

        const stationMap = new Map<string, { stationName: string; plotName: string }>();
        const stationIds: string[] = [];

        plotsData?.forEach((p: any) => {
          p.stations?.forEach((s: any) => {
            stationIds.push(s.id);
            stationMap.set(s.id, { stationName: s.name, plotName: p.name });
          });
        });

        stationIdsRef.current = stationIds;
        stationMapRef.current = stationMap;

        // 3. Consulta inicial de la última lectura existente para las estaciones de la organización
        if (stationIds.length > 0) {
          const { data: readingData, error: readingErr } = await supabase
            .from('readings')
            .select('id, station_id, moisture_pct, temp_c, rain_mm, measured_at')
            .in('station_id', stationIds)
            .order('measured_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (readingErr) {
            console.error('[Diagnostics] Error consultando última lectura:', readingErr);
          } else if (readingData && mounted) {
            const info = stationMap.get(readingData.station_id);
            const measuredMs = new Date(readingData.measured_at).getTime();
            lastTickTimeRef.current = measuredMs;

            setLatestReading({
              id: readingData.id,
              station_id: readingData.station_id,
              stationName: info?.stationName || 'Estación',
              plotName: info?.plotName || '',
              moisture_pct: readingData.moisture_pct,
              temp_c: readingData.temp_c,
              rain_mm: readingData.rain_mm,
              measured_at: readingData.measured_at,
            });

            const initialLag = Math.max(0, Math.floor((Date.now() - measuredMs) / 1000));
            setLagSeconds(initialLag);
          }
        }

        if (mounted) {
          setSupabaseStatus('Conectado');
        }
      } catch (err) {
        console.error('[Diagnostics] Error en carga inicial:', err);
        if (mounted) {
          setSupabaseStatus('Error de conexión');
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    loadInitialData();

    // 4. Timer activo para recalcular el lag aparente cada segundo
    lagInterval = setInterval(() => {
      if (lastTickTimeRef.current) {
        const now = Date.now();
        const diff = Math.max(0, Math.floor((now - lastTickTimeRef.current) / 1000));
        if (mounted) {
          setLagSeconds(diff);
        }
      }
    }, 1000);

    // 5. Suscripción a Realtime para recibir nuevas lecturas en vivo (canal único)
    channel = supabase.channel(`diagnostics_readings_${Math.random().toString(36).substring(2, 9)}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'readings' },
        (payload) => {
          const newReading = payload.new as Reading;
          if (!newReading) return;

          // Filtrar para que solo procese lecturas de estaciones de la organización del usuario
          if (stationIdsRef.current.includes(newReading.station_id)) {
            const info = stationMapRef.current.get(newReading.station_id);
            const measuredMs = new Date(newReading.measured_at).getTime();
            lastTickTimeRef.current = measuredMs;

            if (mounted) {
              setLatestReading({
                id: newReading.id,
                station_id: newReading.station_id,
                stationName: info?.stationName || 'Estación',
                plotName: info?.plotName || '',
                moisture_pct: newReading.moisture_pct,
                temp_c: newReading.temp_c,
                rain_mm: newReading.rain_mm,
                measured_at: newReading.measured_at,
              });

              setLagSeconds(Math.max(0, Math.floor((Date.now() - measuredMs) / 1000)));
              setTotalTicksReceived((prev) => prev + 1);
            }
          }
        }
      )
      .subscribe((status) => {
        if (mounted) {
          if (status === 'SUBSCRIBED') {
            setRealtimeStatus('SUBSCRIBED');
          } else if (status === 'CLOSED') {
            setRealtimeStatus('DESCONECTADO');
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            setRealtimeStatus('ERROR');
          } else {
            setRealtimeStatus(status);
          }
        }
      });

    // 6. Cleanup al desmontar: cancelar timer y remover canal
    return () => {
      mounted = false;
      if (lagInterval) clearInterval(lagInterval);
      if (channel) supabase.removeChannel(channel);
    };
  }, [user]);

  const formatLag = (seconds: number | null): string => {
    if (seconds === null) return 'Calculando...';
    if (seconds < 60) return `${seconds} s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSecs = seconds % 60;
    return `${minutes} min ${remainingSecs} s`;
  };

  const formatDateTime = (iso: string | null): string => {
    if (!iso) return 'Sin datos';
    const d = new Date(iso);
    return `${d.toLocaleDateString()} ${d.toLocaleTimeString()}`;
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#10B981" />
          <Text style={styles.loadingText}>Cargando diagnóstico técnico...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <MaterialIcons name="insights" size={28} color="#10B981" />
          <Text style={styles.title}>Diagnóstico Técnico</Text>
        </View>
        <Text style={styles.headerSubtitle}>
          Monitoreo de estado de conexión, telemetría y perimetría del sistema.
        </Text>

        {/* Sección: Estado de Servicios BaaS */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Conectividad y Streaming</Text>
          
          <View style={styles.row}>
            <Text style={styles.label}>Supabase Client:</Text>
            <View style={[styles.badge, supabaseStatus === 'Conectado' ? styles.badgeSuccess : styles.badgeError]}>
              <Text style={styles.badgeText}>{supabaseStatus}</Text>
            </View>
          </View>

          <View style={styles.row}>
            <Text style={styles.label}>Realtime Channel:</Text>
            <View style={[styles.badge, realtimeStatus === 'SUBSCRIBED' ? styles.badgeSuccess : styles.badgeWarning]}>
              <Text style={styles.badgeText}>{realtimeStatus}</Text>
            </View>
          </View>

          <View style={styles.row}>
            <Text style={styles.label}>Ticks en esta sesión:</Text>
            <Text style={styles.valueHighlight}>{totalTicksReceived}</Text>
          </View>
        </View>

        {/* Sección: Perímetro y Autenticación */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Autenticación y Perímetro</Text>

          <Text style={styles.label}>Usuario ID:</Text>
          <Text style={styles.monospaceValue}>{user?.id || 'No disponible'}</Text>

          <Text style={styles.label}>Correo de Sesión:</Text>
          <Text style={styles.value}>{user?.email || 'No disponible'}</Text>

          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Rol de Acceso:</Text>
              <Text style={styles.valueCapitalized}>{role || 'No asignado'}</Text>
            </View>
          </View>

          <Text style={styles.label}>Establecimiento / Organización:</Text>
          <Text style={styles.valueBold}>{orgName}</Text>
          {orgId ? <Text style={styles.subtext}>ID: {orgId}</Text> : null}
        </View>

        {/* Sección: Telemetría en Vivo */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Última Lectura de Telemetría</Text>

          {latestReading ? (
            <>
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Estación:</Text>
                  <Text style={styles.valueBold}>{latestReading.stationName}</Text>
                  {latestReading.plotName ? (
                    <Text style={styles.subtext}>Lote: {latestReading.plotName}</Text>
                  ) : null}
                </View>
                <View style={{ flex: 1, alignItems: 'flex-end' }}>
                  <Text style={styles.label}>Humedad:</Text>
                  <Text style={styles.valueMetric}>{latestReading.moisture_pct}%</Text>
                </View>
              </View>

              <View style={styles.divider} />

              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Temperatura:</Text>
                  <Text style={styles.value}>{latestReading.temp_c} °C</Text>
                </View>
                <View style={{ flex: 1, alignItems: 'flex-end' }}>
                  <Text style={styles.label}>Precipitación:</Text>
                  <Text style={styles.value}>{latestReading.rain_mm ?? 0} mm</Text>
                </View>
              </View>

              <View style={styles.divider} />

              <Text style={styles.label}>Timestamp del Tick (measured_at):</Text>
              <Text style={styles.value}>{formatDateTime(latestReading.measured_at)}</Text>
              <Text style={styles.subtext}>{latestReading.measured_at}</Text>

              <View style={[styles.lagBox, (lagSeconds ?? 0) > 15 ? styles.lagBoxWarning : styles.lagBoxSuccess]}>
                <View style={styles.row}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <MaterialIcons 
                      name={(lagSeconds ?? 0) > 15 ? 'timer' : 'check-circle'} 
                      size={20} 
                      color={(lagSeconds ?? 0) > 15 ? '#b45309' : '#047857'} 
                    />
                    <Text style={[styles.lagTitle, { marginLeft: 6 }]}>Lag Aparente:</Text>
                  </View>
                  <Text style={styles.lagValue}>{formatLag(lagSeconds)}</Text>
                </View>
                <Text style={styles.lagHelper}>
                  Diferencia calculada en tiempo real: now - measured_at
                </Text>
              </View>
            </>
          ) : (
            <Text style={styles.emptyText}>
              No se registran lecturas para las estaciones de esta organización.
            </Text>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f3f4f6',
  },
  container: {
    padding: 16,
    paddingBottom: 32,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 15,
    color: '#6b7280',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#111827',
    marginLeft: 8,
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 16,
  },
  card: {
    backgroundColor: '#ffffff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1f2937',
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 4,
  },
  label: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 6,
    marginBottom: 2,
  },
  value: {
    fontSize: 15,
    color: '#111827',
  },
  valueBold: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  valueCapitalized: {
    fontSize: 15,
    fontWeight: '600',
    color: '#2563eb',
    textTransform: 'capitalize',
  },
  valueHighlight: {
    fontSize: 16,
    fontWeight: '700',
    color: '#10B981',
  },
  valueMetric: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#10B981',
  },
  monospaceValue: {
    fontFamily: 'monospace',
    fontSize: 12,
    color: '#374151',
    backgroundColor: '#f3f4f6',
    padding: 6,
    borderRadius: 6,
    marginVertical: 2,
  },
  subtext: {
    fontSize: 12,
    color: '#9ca3af',
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeSuccess: {
    backgroundColor: '#d1fae5',
  },
  badgeWarning: {
    backgroundColor: '#fef3c7',
  },
  badgeError: {
    backgroundColor: '#fee2e2',
  },
  badgeText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#065f46',
  },
  divider: {
    height: 1,
    backgroundColor: '#f3f4f6',
    marginVertical: 8,
  },
  lagBox: {
    marginTop: 14,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  lagBoxSuccess: {
    backgroundColor: '#ecfdf5',
    borderColor: '#a7f3d0',
  },
  lagBoxWarning: {
    backgroundColor: '#fffbeb',
    borderColor: '#fde68a',
  },
  lagTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1f2937',
  },
  lagValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#111827',
  },
  lagHelper: {
    fontSize: 11,
    color: '#6b7280',
    marginTop: 4,
  },
  emptyText: {
    fontSize: 14,
    color: '#9ca3af',
    fontStyle: 'italic',
    paddingVertical: 8,
  },
});
