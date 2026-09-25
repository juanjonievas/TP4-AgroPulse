import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { Plot, Reading, Valve } from '../types';



export interface DashboardPlot extends Plot {
  station_id: string | null;
  reading: Reading | null;
  valve: Valve | null;
  geom: any;
}

export function useDashboardData() {
  const [plots, setPlots] = useState<DashboardPlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const plotsRef = useRef<DashboardPlot[]>([]);

  plotsRef.current = plots;

  const fetchPlotsData = useCallback(async (isInitial = false) => {
    try {
      if (isInitial) setLoading(true);

      const { data: plotsData, error: plotsError } = await supabase
        .from('plots')
        .select(`
          id, name, crop, threshold_min, threshold_max,
          stations ( id, name ),
          valves ( id, plot_id, name, status )
        `);

      if (plotsError) throw plotsError;

      if (!plotsData || plotsData.length === 0) {
        setPlots([]);
        return;
      }

      const stationIds = plotsData.flatMap((p: any) => p.stations.map((s: any) => s.id));
      let readingsMap: Record<string, Reading> = {};

      if (stationIds.length > 0) {
        const readingsPromises = stationIds.map((stationId: string) =>
          supabase
            .from('readings')
            .select('id, station_id, moisture_pct, temp_c, rain_mm, measured_at')
            .eq('station_id', stationId)
            .order('measured_at', { ascending: false })
            .limit(1)
        );

        const results = await Promise.all(readingsPromises);
        results.forEach(({ data, error }) => {
          if (!error && data && data.length > 0) {
            const reading = data[0] as Reading;
            readingsMap[reading.station_id] = reading;
          }
        });
      }

      const fallbackGeoms: Record<string, any> = {
        'Costa 1': {
          type: 'Polygon',
          coordinates: [[[-58.060, -30.980], [-58.040, -30.980], [-58.040, -30.990], [-58.060, -30.990], [-58.060, -30.980]]]
        },
        'Costa 2': {
          type: 'Polygon',
          coordinates: [[[-58.045, -31.000], [-58.025, -31.000], [-58.025, -31.010], [-58.045, -31.010], [-58.045, -31.000]]]
        },
        'Monte A': {
          type: 'Polygon',
          coordinates: [[[-58.030, -31.020], [-58.010, -31.020], [-58.010, -31.030], [-58.030, -31.030], [-58.030, -31.020]]]
        }
      };

      const mappedPlots: DashboardPlot[] = plotsData.map((p: any) => {
        const stationId = p.stations?.[0]?.id || null;
        
        return {
          id: p.id,
          name: p.name,
          crop: p.crop,
          threshold_min: p.threshold_min,
          threshold_max: p.threshold_max,
          station_id: stationId,
          reading: stationId ? readingsMap[stationId] || null : null,
          valve: p.valves?.[0] || null,
          geom: p.geom || fallbackGeoms[p.name],
        };
      });

      setPlots(mappedPlots);
    } catch (err: any) {
      if (isInitial) setError(err);
    } finally {
      if (isInitial) setLoading(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    // 1. Carga inicial
    fetchPlotsData(true);

    // 2. Polling de respaldo (acelerado a 1.5 seg para mayor respuesta)
    const pollTimer = setInterval(() => {
      if (mounted) {
        fetchPlotsData(false);
      }
    }, 1500);

    // 3. Realtime Subscription (canal único por instancia)
    const channelName = `dashboard_sync_${Math.random().toString(36).substring(2, 9)}`;
    const channel = supabase.channel(channelName)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'readings' }, (payload) => {
        const newReading = payload.new as Reading;
        if (mounted && newReading) {
          setPlots((currentPlots) =>
            currentPlots.map((plot) => {
              if (plot.station_id === newReading.station_id) {
                const isNewer = !plot.reading || new Date(newReading.measured_at) >= new Date(plot.reading.measured_at);
                if (isNewer) return { ...plot, reading: newReading };
              }
              return plot;
            })
          );
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'valves' }, (payload) => {
        const updatedValve = payload.new as Valve;
        if (mounted && updatedValve) {
          setPlots((currentPlots) =>
            currentPlots.map((plot) => {
              if (plot.valve?.id === updatedValve.id) {
                return { ...plot, valve: updatedValve };
              }
              return plot;
            })
          );
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'plots' }, (payload) => {
        const updatedPlot = payload.new as Plot;
        if (mounted && updatedPlot) {
          setPlots((currentPlots) =>
            currentPlots.map((plot) => {
              if (plot.id === updatedPlot.id) {
                return { ...plot, threshold_min: updatedPlot.threshold_min, threshold_max: updatedPlot.threshold_max };
              }
              return plot;
            })
          );
        }
      })
      .subscribe();

    return () => {
      mounted = false;
      clearInterval(pollTimer);
      supabase.removeChannel(channel);
    };
  }, [fetchPlotsData]);

  const refresh = () => {
    fetchPlotsData(true);
  };

  return { plots, loading, error, refresh };
}
