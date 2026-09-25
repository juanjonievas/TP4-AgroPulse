import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { Plot, Reading, Valve, Alert, IrrigationCommand } from '../types';

export interface PlotDetailData {
  plot: Plot;
  stationIds: string[];
  reading: Reading | null;
  history: Reading[];
  valve: Valve | null;
  alerts: Alert[];
  pendingCommand: IrrigationCommand | null;
  commandHistory: IrrigationCommand[];
}

export function usePlotDetail(plotId: string) {
  const [data, setData] = useState<PlotDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const loadDetail = useCallback(async (isInitial = false) => {
    if (!plotId) return;
    try {
      // Solo mostrar spinner en la carga inicial cuando no hay datos
      if (isInitial && !data) {
        setLoading(true);
      }

      const { data: plotData, error: plotError } = await supabase
        .from('plots')
        .select(`
          id, name, crop, threshold_min, threshold_max,
          stations ( id, name ),
          valves ( id, plot_id, name, status ),
          alerts ( id, plot_id, type, payload, created_at )
        `)
        .eq('id', plotId)
        .eq('alerts.payload->>status', 'active')
        .single();

      if (plotError) throw plotError;

      const stationIds = plotData.stations?.map((s: any) => s.id) || [];
      let latestReading: Reading | null = null;
      let historyData: Reading[] = [];

      if (stationIds.length > 0) {
        // Obtenemos los últimos 100 puntos para armar el gráfico y sacar el más reciente
        const { data: readingsData, error: readingsError } = await supabase
          .from('readings')
          .select('id, station_id, moisture_pct, temp_c, rain_mm, measured_at')
          .in('station_id', stationIds)
          .order('measured_at', { ascending: false })
          .limit(100);

        if (!readingsError && readingsData && readingsData.length > 0) {
          // Revertimos para que queden en orden cronológico en el gráfico
          historyData = (readingsData as Reading[]).reverse();
          latestReading = historyData[historyData.length - 1];
        }
      }

      const valveData = plotData.valves?.[0] || null;
      let commandHistory: IrrigationCommand[] = [];
      let pendingCommand: IrrigationCommand | null = null;

      // Consultar historial de órdenes de la válvula (últimas 5)
      if (valveData) {
        const { data: cmdData } = await supabase
          .from('irrigation_commands')
          .select('id, valve_id, action, duration_min, status, created_at, client_request_id')
          .eq('valve_id', valveData.id)
          .order('created_at', { ascending: false })
          .limit(5);

        if (cmdData) {
          commandHistory = cmdData as IrrigationCommand[];
          pendingCommand = commandHistory.find((c) => c.status === 'pending') || null;
        }
      }

      setData({
        plot: {
          id: plotData.id,
          name: plotData.name,
          crop: plotData.crop,
          threshold_min: plotData.threshold_min,
          threshold_max: plotData.threshold_max,
        },
        stationIds,
        reading: latestReading,
        history: historyData,
        valve: valveData,
        alerts: (plotData.alerts || []) as Alert[],
        pendingCommand,
        commandHistory,
      });
    } catch (err: any) {
      if (isInitial && !data) setError(err);
    } finally {
      if (isInitial) setLoading(false);
    }
  }, [plotId, data]);

  useEffect(() => {
    if (!plotId) return;
    let mounted = true;

    // 1. Carga inicial
    loadDetail(true);

    // 2. Polling de respaldo acelerado a 1.5 segundos
    const pollInterval = setInterval(() => {
      if (mounted) {
        loadDetail(false);
      }
    }, 1500);

    // 3. Realtime Subscription (canal único)
    const channelName = `plot_detail_${plotId}_${Math.random().toString(36).substring(2, 9)}`;
    const channel = supabase.channel(channelName);

    channel
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'readings' }, (payload) => {
        const newReading = payload.new as Reading;
        if (mounted && newReading) {
          setData((prev) => {
            if (!prev || !prev.stationIds.includes(newReading.station_id)) return prev;
            const isNew = prev.history.every((r) => r.id !== newReading.id);
            if (!isNew) return prev;

            const updatedHistory = [...prev.history, newReading].sort(
              (a, b) => new Date(a.measured_at).getTime() - new Date(b.measured_at).getTime()
            );
            const cutoff = Date.now() - 6 * 60 * 60 * 1000;
            const filteredHistory = updatedHistory.filter((r) => new Date(r.measured_at).getTime() >= cutoff);

            return { ...prev, reading: newReading, history: filteredHistory };
          });
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'valves' }, (payload) => {
        const updatedValve = payload.new as Valve;
        if (mounted && updatedValve) {
          setData((prev) => {
            if (!prev || prev.valve?.id !== updatedValve.id) return prev;
            return { ...prev, valve: updatedValve };
          });
        }
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'alerts' }, (payload) => {
        const newAlert = payload.new as Alert;
        if (mounted && newAlert) {
          setData((prev) => {
            if (!prev || newAlert.plot_id !== plotId) return prev;
            if (prev.alerts.some((a) => a.id === newAlert.id)) return prev;
            return { ...prev, alerts: [newAlert, ...prev.alerts] };
          });
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'plots' }, (payload) => {
        const updatedPlot = payload.new as Plot;
        if (mounted && updatedPlot) {
          setData((prev) => {
            if (!prev || prev.plot.id !== updatedPlot.id) return prev;
            return {
              ...prev,
              plot: { ...prev.plot, threshold_min: updatedPlot.threshold_min, threshold_max: updatedPlot.threshold_max },
            };
          });
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'alerts' }, (payload) => {
        const updatedAlert = payload.new as Alert;
        if (mounted && updatedAlert) {
          setData((prev) => {
            if (!prev || updatedAlert.plot_id !== plotId) return prev;

            if (updatedAlert.payload?.status === 'resolved') {
              return {
                ...prev,
                alerts: prev.alerts.filter((a) => a.id !== updatedAlert.id),
              };
            }

            const exists = prev.alerts.some((a) => a.id === updatedAlert.id);
            return {
              ...prev,
              alerts: exists
                ? prev.alerts.map((a) => (a.id === updatedAlert.id ? updatedAlert : a))
                : [updatedAlert, ...prev.alerts],
            };
          });
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'irrigation_commands' }, () => {
        if (mounted) {
          loadDetail(false);
        }
      })
      .subscribe();

    return () => {
      mounted = false;
      clearInterval(pollInterval);
      supabase.removeChannel(channel);
    };
  }, [plotId, loadDetail]);

  return { data, loading, error, refresh: () => loadDetail(false) };
}
