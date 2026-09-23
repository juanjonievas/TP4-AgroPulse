import React from 'react';
import { View, Text, StyleSheet, ScrollView, Dimensions, ActivityIndicator } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { LineChart } from 'react-native-chart-kit';
import ValveStatus from '../../components/ValveStatus';
import StatusBadge from '../../components/StatusBadge';
import { getPlotStatus, getStatusColor, getStatusConfig } from '../../utils/status';
import { useAuth } from '../../contexts/AuthContext';
import { usePlotDetail } from '../../hooks/usePlotDetail';
import IrrigationControls from '../../components/IrrigationControls';
import ThresholdControls from '../../components/ThresholdControls';

export default function PlotDetailScreen() {
  const { id } = useLocalSearchParams();
  const { role } = useAuth();
  const { data, loading, error, refresh } = usePlotDetail(id as string);

  if (loading && !data) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#059669" />
        <Text style={styles.loadingText}>Cargando telemetría del lote...</Text>
      </View>
    );
  }

  if (error || !data) {
    return (
      <View style={styles.center}>
        <MaterialIcons name="error-outline" size={48} color="#dc2626" />
        <Text style={styles.errorText}>Error al cargar el detalle del lote.</Text>
      </View>
    );
  }

  const { plot, reading, valve, alerts, pendingCommand, history } = data;

  let status = getPlotStatus(
    reading?.moisture_pct ?? null,
    plot.threshold_min,
    plot.threshold_max,
    reading?.measured_at ?? null
  );

  // Forza el estado ignorando el tiempo de expiración (para evitar que se bloqueen los botones
  // si el simulador no está enviando datos nuevos al backend, pero sí hay datos de semilla).
  if (reading?.moisture_pct !== null && reading?.moisture_pct !== undefined) {
    if (reading.moisture_pct < plot.threshold_min) status = 'dry';
    else if (reading.moisture_pct > plot.threshold_max) status = 'wet';
    else status = 'optimal';
  } else {
    status = 'stale';
  }

  const statusConfig = getStatusConfig(status);
  const canExecuteCommands = (role === 'producer' || role === 'operator') && status !== 'stale';

  // Rango objetivo porcentual para pintar la barra visual
  const moistureVal = reading?.moisture_pct ?? null;
  const clampedMoisture = moistureVal !== null ? Math.min(100, Math.max(0, moistureVal)) : null;
  const minPercent = Math.min(100, Math.max(0, plot.threshold_min));
  const maxPercent = Math.min(100, Math.max(0, plot.threshold_max));
  const optimalZoneWidth = Math.max(0, maxPercent - minPercent);

  // Helper para el Gráfico Histórico
  const renderChart = () => {
    if (!history || history.length === 0) {
      return (
        <View style={styles.noChartBox}>
          <MaterialIcons name="show-chart" size={32} color="#94a3b8" />
          <Text style={styles.noChartText}>No hay datos históricos disponibles en las últimas 6 horas.</Text>
        </View>
      );
    }

    let points = [...history];

    // Downsampling si hay más de 50 puntos
    if (points.length > 50) {
      const factor = Math.ceil(points.length / 50);
      points = points.filter((_, i) => i % factor === 0 || i === points.length - 1);
    }

    // Manejo de 1 solo punto (duplicar para renderizar línea)
    if (points.length === 1) {
      points = [points[0], points[0]];
    }

    const labels = points.map((p, i) => {
      if (i === 0 || i === points.length - 1 || i === Math.floor(points.length / 2)) {
        const d = new Date(p.measured_at);
        return `${d.getHours()}:${d.getMinutes().toString().padStart(2, '0')}`;
      }
      return '';
    });

    const chartData = points.map((p) => p.moisture_pct);
    const screenWidth = Dimensions.get('window').width - 32;

    return (
      <View style={styles.chartWrapper}>
        <View style={styles.chartHeader}>
          <Text style={styles.chartTitle}>Histórico de Humedad del Suelo</Text>
          <Text style={styles.chartSubtitle}>Evolución en las últimas 6 horas (telemetría)</Text>
        </View>
        <LineChart
          data={{
            labels,
            datasets: [{ data: chartData }],
          }}
          width={screenWidth}
          height={210}
          yAxisSuffix="%"
          chartConfig={{
            backgroundColor: '#ffffff',
            backgroundGradientFrom: '#ffffff',
            backgroundGradientTo: '#ffffff',
            decimalPlaces: 0,
            color: (opacity = 1) => getStatusColor(status),
            labelColor: (opacity = 1) => `rgba(100, 116, 139, ${opacity})`,
            style: { borderRadius: 12 },
            propsForDots: { r: '3', strokeWidth: '1', stroke: getStatusColor(status) },
            propsForBackgroundLines: { strokeDasharray: '', stroke: '#f1f5f9' },
          }}
          fromZero
          yAxisInterval={1}
          segments={4}
          yLabelsOffset={10}
          style={{ marginVertical: 8, borderRadius: 12, paddingRight: 40 }}
        />
      </View>
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* 1. Encabezado Principal */}
      <View style={styles.headerCard}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.plotName}>{plot.name}</Text>
            <View style={styles.cropBadge}>
              <Text style={styles.cropEmoji}>🌱</Text>
              <Text style={styles.cropText}>Cultivo: {plot.crop}</Text>
            </View>
          </View>
          <StatusBadge status={status} size="lg" />
        </View>
      </View>

      {/* 2. KPI Principal y 3. Grid 2x2 de Condiciones */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Condiciones Actuales del Suelo</Text>

        <View style={styles.kpiGrid}>
          {/* Tarjeta 1: Humedad */}
          <View style={[styles.kpiCard, { borderColor: statusConfig.borderColor }]}>
            <View style={styles.kpiHeaderRow}>
              <MaterialIcons name="water-drop" size={20} color={statusConfig.color} />
              <Text style={styles.kpiLabel}>Humedad</Text>
            </View>
            <Text style={[styles.kpiValue, { color: statusConfig.color }]}>
              {moistureVal !== null ? `${moistureVal}%` : 'S/D'}
            </Text>
            <Text style={styles.kpiSub}>Objetivo: {plot.threshold_min}%–{plot.threshold_max}%</Text>
          </View>

          {/* Tarjeta 2: Temperatura */}
          <View style={styles.kpiCard}>
            <View style={styles.kpiHeaderRow}>
              <MaterialIcons name="thermostat" size={20} color="#f59e0b" />
              <Text style={styles.kpiLabel}>Temperatura</Text>
            </View>
            <Text style={styles.kpiValue}>
              {reading?.temp_c != null ? `${reading.temp_c} °C` : '--'}
            </Text>
            <Text style={styles.kpiSub}>Sensor ambiente</Text>
          </View>

          {/* Tarjeta 3: Precipitación */}
          <View style={styles.kpiCard}>
            <View style={styles.kpiHeaderRow}>
              <MaterialIcons name="cloud" size={20} color="#2563eb" />
              <Text style={styles.kpiLabel}>Lluvia</Text>
            </View>
            <Text style={styles.kpiValue}>
              {reading?.rain_mm != null ? `${reading.rain_mm} mm` : '0 mm'}
            </Text>
            <Text style={styles.kpiSub}>Precipitación acumulada</Text>
          </View>

          {/* Tarjeta 4: Última Transmisión */}
          <View style={styles.kpiCard}>
            <View style={styles.kpiHeaderRow}>
              <MaterialIcons name="schedule" size={20} color="#64748b" />
              <Text style={styles.kpiLabel}>Última lectura</Text>
            </View>
            <Text style={[styles.kpiValue, { fontSize: 16 }]}>
              {reading?.measured_at ? new Date(reading.measured_at).toLocaleTimeString() : 'Sin señal'}
            </Text>
            <Text style={styles.kpiSub}>
              {reading?.measured_at ? new Date(reading.measured_at).toLocaleDateString() : 'Desconectado'}
            </Text>
          </View>
        </View>

        {/* 4. Semáforo Agronómico y Barra de Rango de Humedad */}
        <View style={styles.barSection}>
          <Text style={styles.barTitle}>Rango objetivo de humedad</Text>
          <View style={styles.barTrack}>
            <View
              style={[
                styles.optimalZone,
                {
                  left: `${minPercent}%`,
                  width: `${optimalZoneWidth}%`,
                },
              ]}
            />
            {clampedMoisture !== null && (
              <View
                style={[
                  styles.moistureIndicator,
                  {
                    left: `${clampedMoisture}%`,
                    backgroundColor: statusConfig.color,
                  },
                ]}
              />
            )}
          </View>
          <View style={styles.barLabelsRow}>
            <Text style={styles.barBoundText}>0% (Seco)</Text>
            <Text style={styles.barThresholdText}>Min {plot.threshold_min}%</Text>
            <Text style={styles.barThresholdText}>Max {plot.threshold_max}%</Text>
            <Text style={styles.barBoundText}>100% (Saturado)</Text>
          </View>
        </View>

        {/* 6. Umbrales */}
        <ThresholdControls
          plotId={plot.id}
          thresholdMin={plot.threshold_min}
          thresholdMax={plot.threshold_max}
          canEdit={canExecuteCommands}
        />
      </View>

      {/* 5. Gráfico Histórico de Humedad */}
      <View style={styles.sectionCard}>
        {renderChart()}
      </View>

      {/* 7 y 8. Estado de Válvula y Controles de Riego */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Control y Operación de Riego</Text>
        {valve ? (
          <>
            <ValveStatus valve={valve} />
            <IrrigationControls
              valveId={valve.id}
              pendingCommand={pendingCommand}
              canExecuteCommands={canExecuteCommands}
              role={role}
              status={status}
              onCommandUpdated={refresh}
            />

            {/* Historial de Riego */}
            <View style={styles.historyContainer}>
              <View style={styles.historyHeader}>
                <MaterialIcons name="history" size={16} color="#475569" />
                <Text style={styles.historyTitle}>Historial de Riego</Text>
              </View>

              {pendingCommand && (
                <View style={[styles.historyItem, styles.pendingHistoryItem]}>
                  <View style={styles.historyItemLeft}>
                    <Text style={styles.historyActionText}>
                      {pendingCommand.action === 'open' ? 'Abrir riego continuo' : pendingCommand.action === 'close' ? 'Cierre de válvula' : `Riego temporizado (${pendingCommand.duration_min} min)`}
                    </Text>
                    <Text style={styles.historyDateText}>Procesando...</Text>
                  </View>
                  <View style={[styles.historyBadge, styles.badgePending]}>
                    <Text style={[styles.historyBadgeText, styles.textPending]}>PENDING</Text>
                  </View>
                  <ActivityIndicator size="small" color="#b45309" style={{ marginLeft: 8 }} />
                </View>
              )}

              {data.commandHistory && data.commandHistory.length > 0 ? (
                data.commandHistory.map((cmd) => {
                  const isPending = cmd.status === 'pending';
                  const isApplied = cmd.status === 'applied';
                  const isCancelled = cmd.status === 'cancelled';

                  let actionName = 'Acción de riego';
                  if (cmd.action === 'open') actionName = 'Abrir riego continuo';
                  else if (cmd.action === 'close') actionName = 'Cierre de válvula';
                  else if (cmd.action === 'open_n_min') actionName = `Riego temporizado (${cmd.duration_min} min)`;

                  const cmdTime = new Date(cmd.created_at).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  });

                  return (
                    <View key={cmd.id} style={styles.historyItem}>
                      <View style={styles.historyItemLeft}>
                        <Text style={styles.historyActionText}>{actionName}</Text>
                        <Text style={styles.historyDateText}>{cmdTime}</Text>
                      </View>
                      <View
                        style={[
                          styles.historyBadge,
                          isApplied && styles.badgeApplied,
                          isPending && styles.badgePending,
                          isCancelled && styles.badgeCancelled,
                        ]}
                      >
                        <Text
                          style={[
                            styles.historyBadgeText,
                            isApplied && styles.textApplied,
                            isPending && styles.textPending,
                            isCancelled && styles.textCancelled,
                          ]}
                        >
                          {isApplied ? 'APPLIED' : isPending ? 'PENDING' : 'CANCELLED'}
                        </Text>
                      </View>
                    </View>
                  );
                })
              ) : (
                !pendingCommand && <Text style={styles.emptyHistoryText}>No se registran órdenes previas en esta válvula.</Text>
              )}
            </View>
          </>
        ) : (
          <Text style={styles.noValveText}>No hay válvula de riego asignada a este lote.</Text>
        )}


      </View>

      {/* 10. Alertas Activas */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Alertas Activas del Lote</Text>
        {alerts && alerts.filter((a) => a.payload?.status === 'active').length > 0 ? (
          alerts
            .filter((a) => a.payload?.status === 'active')
            .map((alert) => (
              <View key={alert.id} style={styles.alertCard}>
                <View style={styles.alertHeader}>
                  <MaterialIcons name="warning" size={18} color="#dc2626" />
                  <Text style={styles.alertTitle}>
                    {alert.type === 'moisture_low'
                      ? 'Humedad Crítica Baja'
                      : alert.type === 'moisture_high'
                      ? 'Exceso de Humedad'
                      : 'Estación Fuera de Línea'}
                  </Text>
                </View>
                <Text style={styles.alertDate}>
                  Detectada: {new Date(alert.created_at).toLocaleString()}
                </Text>
              </View>
            ))
        ) : (
          <View style={styles.noAlertsBox}>
            <MaterialIcons name="check-circle" size={24} color="#059669" />
            <Text style={styles.noAlertsText}>No hay alertas activas en este lote. Todo en orden.</Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 32,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#f8fafc',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#64748b',
  },
  errorText: {
    fontSize: 16,
    color: '#dc2626',
    fontWeight: '700',
    marginTop: 12,
  },
  headerCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  plotName: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0f172a',
  },
  cropBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginTop: 6,
  },
  cropEmoji: {
    fontSize: 12,
    marginRight: 4,
  },
  cropText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  sectionCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 14,
  },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 14,
  },
  kpiCard: {
    width: '48%',
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  kpiHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  kpiLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
  },
  kpiValue: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0f172a',
    marginVertical: 2,
  },
  kpiSub: {
    fontSize: 10,
    color: '#94a3b8',
    fontWeight: '500',
  },
  barSection: {
    marginTop: 8,
    marginBottom: 12,
  },
  barTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 6,
  },
  barTrack: {
    height: 10,
    backgroundColor: '#e2e8f0',
    borderRadius: 5,
    position: 'relative',
    justifyContent: 'center',
  },
  optimalZone: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    backgroundColor: '#a7f3d0',
    borderRadius: 5,
  },
  moistureIndicator: {
    position: 'absolute',
    width: 16,
    height: 16,
    borderRadius: 8,
    top: -3,
    marginLeft: -8,
    borderWidth: 2,
    borderColor: '#ffffff',
    elevation: 3,
  },
  barLabelsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  barBoundText: {
    fontSize: 10,
    color: '#94a3b8',
    fontWeight: '500',
  },
  barThresholdText: {
    fontSize: 10,
    color: '#475569',
    fontWeight: '600',
  },
  chartWrapper: {
    alignItems: 'center',
  },
  chartHeader: {
    width: '100%',
    marginBottom: 6,
  },
  chartTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
  },
  chartSubtitle: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  noChartBox: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  noChartText: {
    fontSize: 13,
    color: '#94a3b8',
    marginTop: 8,
    textAlign: 'center',
  },
  noValveText: {
    fontSize: 13,
    color: '#94a3b8',
    fontStyle: 'italic',
  },
  roleNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#fef2f2',
    padding: 10,
    borderRadius: 8,
    marginTop: 10,
  },
  roleNoticeText: {
    fontSize: 12,
    color: '#b91c1c',
    flex: 1,
    fontWeight: '500',
  },
  alertCard: {
    backgroundColor: '#fef2f2',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#dc2626',
  },
  alertHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  alertTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#991b1b',
  },
  alertDate: {
    fontSize: 11,
    color: '#b91c1c',
  },
  noAlertsBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#ecfdf5',
    padding: 12,
    borderRadius: 8,
  },
  noAlertsText: {
    fontSize: 13,
    color: '#065f46',
    fontWeight: '600',
  },
  historyContainer: {
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  historyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  historyTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  historyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f8fafc',
  },
  pendingHistoryItem: {
    backgroundColor: '#fffbeb',
    borderRadius: 8,
    paddingHorizontal: 8,
    borderBottomWidth: 0,
    marginBottom: 8,
  },
  historyItemLeft: {
    flex: 1,
    marginRight: 8,
  },
  historyActionText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1e293b',
  },
  historyDateText: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 2,
  },
  historyBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  historyBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  badgeApplied: {
    backgroundColor: '#ecfdf5',
    borderWidth: 1,
    borderColor: '#a7f3d0',
  },
  badgePending: {
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fde68a',
  },
  badgeCancelled: {
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  textApplied: {
    color: '#059669',
  },
  textPending: {
    color: '#b45309',
  },
  textCancelled: {
    color: '#64748b',
  },
  emptyHistoryText: {
    fontSize: 12,
    color: '#94a3b8',
    fontStyle: 'italic',
    paddingVertical: 6,
  },
});
