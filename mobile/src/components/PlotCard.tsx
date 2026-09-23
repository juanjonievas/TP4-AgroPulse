import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Plot, Reading, Valve } from '../types';
import { getPlotStatus, getStatusConfig } from '../utils/status';
import StatusBadge from './StatusBadge';

interface Props {
  plot: Plot;
  reading: Reading | null;
  valve?: Valve | null;
  onPress: () => void;
}

export default function PlotCard({ plot, reading, valve, onPress }: Props) {
  const status = getPlotStatus(
    reading?.moisture_pct ?? null,
    plot.threshold_min,
    plot.threshold_max,
    reading?.measured_at ?? null
  );

  const statusConfig = getStatusConfig(status);

  const moistureVal = reading?.moisture_pct ?? null;
  const clampedMoisture = moistureVal !== null ? Math.min(100, Math.max(0, moistureVal)) : null;

  const minPercent = Math.min(100, Math.max(0, plot.threshold_min));
  const maxPercent = Math.min(100, Math.max(0, plot.threshold_max));
  const optimalZoneWidth = Math.max(0, maxPercent - minPercent);

  const getCropEmoji = (crop: string) => {
    const c = crop.toLowerCase();
    if (c.includes('citrus') || c.includes('citrico')) return '🍊';
    if (c.includes('soja') || c.includes('soya')) return '🌱';
    if (c.includes('maíz') || c.includes('maiz')) return '🌽';
    if (c.includes('trigo')) return '🌾';
    return '🌿';
  };

  return (
    <TouchableOpacity
      style={[styles.card, { borderLeftColor: statusConfig.color }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      {/* Encabezado: Nombre, Cultivo y Estado */}
      <View style={styles.header}>
        <View style={styles.titleArea}>
          <Text style={styles.title}>{plot.name}</Text>
          <View style={styles.cropBadge}>
            <Text style={styles.cropEmoji}>{getCropEmoji(plot.crop)}</Text>
            <Text style={styles.cropText}>{plot.crop}</Text>
          </View>
        </View>
        <StatusBadge status={status} size="sm" />
      </View>

      {/* Humedad y Rango */}
      <View style={styles.moistureRow}>
        <View style={styles.moistureLeft}>
          <MaterialIcons name="water-drop" size={22} color={statusConfig.color} />
          <Text style={[styles.moistureText, { color: statusConfig.color }]}>
            {moistureVal !== null ? `${moistureVal}%` : 'S/D'}
          </Text>
        </View>
        <Text style={styles.rangeText}>
          Rango ideal: {plot.threshold_min}% – {plot.threshold_max}%
        </Text>
      </View>

      {/* Barra de humedad simple y limpia */}
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
              styles.indicatorDot,
              {
                left: `${clampedMoisture}%`,
                backgroundColor: statusConfig.color,
              },
            ]}
          />
        )}
      </View>

      {/* Pie con métricas simples */}
      <View style={styles.footerRow}>
        <View style={styles.metaLeft}>
          <Text style={styles.metaItem}>
            🌡️ {reading?.temp_c != null ? `${reading.temp_c}°C` : '--'}
          </Text>
          <Text style={styles.metaSeparator}>•</Text>
          <Text style={styles.metaItem}>
            🌧️ {reading?.rain_mm != null ? `${reading.rain_mm} mm` : '0 mm'}
          </Text>
          {valve && (
            <>
              <Text style={styles.metaSeparator}>•</Text>
              <Text
                style={[
                  styles.metaItem,
                  { color: valve.status === 'open' ? '#059669' : '#64748b', fontWeight: '600' },
                ]}
              >
                {valve.status === 'open' ? '💧 Riego activo' : '⚪ Válvula cerrada'}
              </Text>
            </>
          )}
        </View>
        <MaterialIcons name="chevron-right" size={20} color="#94a3b8" />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderLeftWidth: 4,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  titleArea: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0f172a',
  },
  cropBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  cropEmoji: {
    fontSize: 11,
    marginRight: 3,
  },
  cropText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  moistureRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  moistureLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  moistureText: {
    fontSize: 22,
    fontWeight: '800',
  },
  rangeText: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '500',
  },
  barTrack: {
    height: 6,
    backgroundColor: '#e2e8f0',
    borderRadius: 3,
    position: 'relative',
    justifyContent: 'center',
    marginBottom: 10,
  },
  optimalZone: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    backgroundColor: '#a7f3d0',
    borderRadius: 3,
  },
  indicatorDot: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    top: -3,
    marginLeft: -6,
    borderWidth: 2,
    borderColor: '#ffffff',
    elevation: 2,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#f8fafc',
  },
  metaLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaItem: {
    fontSize: 12,
    color: '#64748b',
  },
  metaSeparator: {
    fontSize: 12,
    color: '#cbd5e1',
  },
});
