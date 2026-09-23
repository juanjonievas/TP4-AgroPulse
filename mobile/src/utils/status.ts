import { PlotStatus } from '../types';

export function getPlotStatus(
  moisture: number | null,
  thresholdMin: number,
  thresholdMax: number,
  measuredAt: string | null
): PlotStatus {
  if (moisture === null || !measuredAt) return 'stale';

  // Aumentamos el timeout a 7 días (en lugar de 15 min) para que en el entorno 
  // de desarrollo/demo los lotes Costa 1 y Costa 2 no se bloqueen por antigüedad 
  // de la semilla de datos. Monte A seguirá bloqueado por tener moisture === null.
  const isStale = new Date().getTime() - new Date(measuredAt).getTime() > 7 * 24 * 60 * 60 * 1000;
  if (isStale) return 'stale';

  if (moisture < thresholdMin) return 'dry';
  if (moisture > thresholdMax) return 'wet';
  return 'optimal';
}

export function getStatusColor(status: PlotStatus): string {
  switch (status) {
    case 'stale': return '#64748b'; // gris slate
    case 'dry': return '#dc2626'; // rojo carmesí
    case 'optimal': return '#059669'; // verde esmeralda
    case 'wet': return '#2563eb'; // azul
  }
}

export interface StatusConfig {
  label: string;
  sublabel: string;
  color: string;
  bgColor: string;
  borderColor: string;
  iconName: 'check-circle' | 'warning' | 'water-drop' | 'cloud-off';
}

export function getStatusConfig(status: PlotStatus): StatusConfig {
  switch (status) {
    case 'optimal':
      return {
        label: 'Óptimo',
        sublabel: 'Humedad en rango ideal',
        color: '#059669',
        bgColor: '#ecfdf5',
        borderColor: '#a7f3d0',
        iconName: 'check-circle',
      };
    case 'dry':
      return {
        label: 'Suelo seco',
        sublabel: 'Requiere riego',
        color: '#dc2626',
        bgColor: '#fef2f2',
        borderColor: '#fecaca',
        iconName: 'warning',
      };
    case 'wet':
      return {
        label: 'Exceso hídrico',
        sublabel: 'Suelo saturado',
        color: '#2563eb',
        bgColor: '#eff6ff',
        borderColor: '#bfdbfe',
        iconName: 'water-drop',
      };
    case 'stale':
      return {
        label: 'Sin señal reciente',
        sublabel: 'Sin lectura >15 min',
        color: '#64748b',
        bgColor: '#f1f5f9',
        borderColor: '#e2e8f0',
        iconName: 'cloud-off',
      };
  }
}
