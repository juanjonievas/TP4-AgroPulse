export type Role = 'producer' | 'operator' | 'advisor';
export type PlotStatus = 'stale' | 'dry' | 'optimal' | 'wet';

export interface Plot {
  id: string;
  name: string;
  crop: string;
  threshold_min: number;
  threshold_max: number;
}

export interface Reading {
  id: string;
  station_id: string;
  moisture_pct: number;
  temp_c: number;
  rain_mm: number;
  measured_at: string;
}

export interface Valve {
  id: string;
  plot_id: string;
  name: string;
  status: 'open' | 'closed';
}

export interface Alert {
  id: string;
  plot_id: string;
  type: 'moisture_low' | 'moisture_high' | 'stale';
  payload: {
    status: 'active' | 'resolved';
    resolved_at?: string;
  };
  created_at: string;
}

export interface IrrigationCommand {
  id: string;
  valve_id: string;
  action: 'open' | 'close' | 'open_n_min';
  duration_min: number | null;
  status: 'pending' | 'applied' | 'failed' | 'cancelled';
  client_request_id: string;
  created_at: string;
}
