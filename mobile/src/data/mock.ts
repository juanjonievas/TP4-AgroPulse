import { Plot, Reading, Valve, Alert, Role } from '../types';


export const MOCK_PLOTS: Plot[] = [
  { id: 'plot-1', name: 'Costa 1', crop: 'Citrus', threshold_min: 25, threshold_max: 45 },
  { id: 'plot-2', name: 'Costa 2', crop: 'Citrus', threshold_min: 25, threshold_max: 45 },
  { id: 'plot-3', name: 'Monte A', crop: 'Soja', threshold_min: 30, threshold_max: 50 },
];

export const MOCK_READINGS: Record<string, Reading> = {
  'plot-1': { id: 'r1', station_id: 'plot-1', moisture_pct: 35, temp_c: 24, rain_mm: 0, measured_at: new Date().toISOString() },
  'plot-2': { id: 'r2', station_id: 'plot-2', moisture_pct: 18, temp_c: 26, rain_mm: 0, measured_at: new Date().toISOString() },
  // plot-3 intencionalmente omitido (stale)
};

export const MOCK_VALVES: Record<string, Valve> = {
  'plot-1': { id: 'v1', plot_id: 'plot-1', name: 'V-1', status: 'closed' },
  'plot-2': { id: 'v2', plot_id: 'plot-2', name: 'V-2', status: 'open' },
  'plot-3': { id: 'v3', plot_id: 'plot-3', name: 'V-3', status: 'closed' },
};

export const MOCK_ALERTS: Alert[] = [
  {
    id: 'alt-1',
    plot_id: 'plot-2',
    type: 'moisture_low',
    payload: { status: 'active' },
    created_at: new Date().toISOString(),
  }
];
