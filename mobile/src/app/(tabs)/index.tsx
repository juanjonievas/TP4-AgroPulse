import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Platform, TouchableOpacity, ActivityIndicator } from 'react-native';
import MapView, { Polygon } from 'react-native-maps';
import * as Location from 'expo-location';
import { isPointInPolygon } from 'geolib';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useDashboardData } from '../../hooks/useDashboardData';
import { getPlotStatus } from '../../utils/status';

export default function MapScreen() {
  const { plots, loading } = useDashboardData();
  const router = useRouter();
  const [locationError, setLocationError] = useState<string | null>(null);
  const [currentLocation, setCurrentLocation] = useState<Location.LocationObject | null>(null);
  const [insidePlot, setInsidePlot] = useState<string | null>(null);

  useEffect(() => {
    let locationSubscription: Location.LocationSubscription | null = null;
    let mounted = true;

    async function startLocationTracking() {
      try {
        const servicesEnabled = await Location.hasServicesEnabledAsync();
        if (!servicesEnabled) {
          if (mounted) setLocationError('Ubicación no disponible');
          return;
        }

        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          if (mounted) setLocationError('Permiso de GPS no otorgado');
          return;
        }

        locationSubscription = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.Balanced, timeInterval: 5000, distanceInterval: 5 },
          (loc) => {
            if (mounted) setCurrentLocation(loc);
          }
        );
      } catch (err) {
        console.warn('GPS Error', err);
        if (mounted) setLocationError('Ubicación no disponible');
      }
    }

    startLocationTracking();

    return () => {
      mounted = false;
      if (locationSubscription) {
        locationSubscription.remove();
      }
    };
  }, []);

  useEffect(() => {
    if (currentLocation && plots.length > 0) {
      let foundPlot = null;
      for (const plot of plots) {
        if (plot.geom && plot.geom.coordinates && plot.geom.coordinates.length > 0) {
          const polygonCoords = plot.geom.coordinates[0].map((coord: number[]) => ({
            longitude: coord[0],
            latitude: coord[1],
          }));

          const isInside = isPointInPolygon(
            { latitude: currentLocation.coords.latitude, longitude: currentLocation.coords.longitude },
            polygonCoords
          );

          if (isInside) {
            foundPlot = plot.name;
            break;
          }
        }
      }
      setInsidePlot(foundPlot);
    }
  }, [currentLocation, plots]);

  const getFillColor = (plot: any) => {
    const status = getPlotStatus(
      plot.reading?.moisture_pct ?? null,
      plot.threshold_min,
      plot.threshold_max,
      plot.reading?.measured_at ?? null
    );
    switch (status) {
      case 'optimal': return 'rgba(5, 150, 105, 0.4)';
      case 'dry': return 'rgba(220, 38, 38, 0.4)';
      case 'wet': return 'rgba(37, 99, 235, 0.4)';
      case 'stale': return 'rgba(100, 116, 139, 0.4)';
      default: return 'rgba(100, 116, 139, 0.4)';
    }
  };

  const getStrokeColor = (plot: any) => {
    const status = getPlotStatus(
      plot.reading?.moisture_pct ?? null,
      plot.threshold_min,
      plot.threshold_max,
      plot.reading?.measured_at ?? null
    );
    switch (status) {
      case 'optimal': return '#059669';
      case 'dry': return '#dc2626';
      case 'wet': return '#2563eb';
      case 'stale': return '#64748b';
      default: return '#64748b';
    }
  };

  if (loading && plots.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#059669" />
        <Text style={styles.loadingText}>Cargando mapa...</Text>
      </View>
    );
  }

  if (Platform.OS === 'web') {
    return (
      <View style={styles.webFallbackContainer}>
        <View style={styles.webHeader}>
          <Text style={styles.webTitle}>AgroPulse</Text>
          <Text style={styles.webSub}>Monitoreo de Lotes</Text>
        </View>
        <View style={styles.webPlotsGrid}>
          {plots.map((plot) => {
            const isStale = getPlotStatus(
              plot.reading?.moisture_pct ?? null,
              plot.threshold_min,
              plot.threshold_max,
              plot.reading?.measured_at ?? null
            ) === 'stale';

            return (
              <TouchableOpacity
                key={plot.id}
                style={[styles.webPlotCard, { borderLeftColor: getStrokeColor(plot) }]}
                onPress={() => router.push({ pathname: '/plot/[id]', params: { id: plot.id } } as never)}
              >
                <View style={styles.webPlotInfo}>
                  <Text style={styles.webPlotTitle}>{plot.name}</Text>
                  <Text style={styles.webPlotCrop}>{plot.crop}</Text>
                </View>
                <View style={[styles.webStatusBadge, { backgroundColor: getFillColor(plot) }]}>
                  <Text style={[styles.webStatusText, { color: getStrokeColor(plot) }]}>
                    {isStale ? 'Sin señal' : `${plot.reading?.moisture_pct}%`}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <MapView
        style={StyleSheet.absoluteFill}
        initialRegion={{
          latitude: -31.005,
          longitude: -58.025,
          latitudeDelta: 0.04,
          longitudeDelta: 0.07,
        }}
        showsUserLocation={!locationError}
        showsMyLocationButton={true}
        mapType="standard"
      >
        {plots.map((plot) => {
          if (!plot.geom || !plot.geom.coordinates || plot.geom.coordinates.length === 0) return null;

          const coords = plot.geom.coordinates[0].map((c: number[]) => ({
            latitude: c[1],
            longitude: c[0],
          }));

          return (
            <Polygon
              key={plot.id}
              coordinates={coords}
              fillColor={getFillColor(plot)}
              strokeColor={getStrokeColor(plot)}
              strokeWidth={3}
              zIndex={10}
              tappable
              onPress={() => router.push({ pathname: '/plot/[id]', params: { id: plot.id } } as never)}
            />
          );
        })}
      </MapView>

      <View style={styles.topOverlay} pointerEvents="box-none">
        {locationError ? (
          <View style={[styles.gpsBanner, styles.bannerError]}>
            <MaterialIcons name="location-off" size={16} color="#ffffff" />
            <Text style={styles.bannerText}>{locationError}</Text>
          </View>
        ) : insidePlot ? (
          <View style={[styles.gpsBanner, styles.bannerInside]}>
            <MaterialIcons name="my-location" size={16} color="#ffffff" />
            <Text style={styles.bannerText}>📍 Dentro de {insidePlot}</Text>
          </View>
        ) : currentLocation ? (
          <View style={[styles.gpsBanner, styles.bannerOutside]}>
            <MaterialIcons name="near-me" size={16} color="#ffffff" />
            <Text style={styles.bannerText}>📍 Fuera de los lotes</Text>
          </View>
        ) : (
          <View style={[styles.gpsBanner, styles.bannerLoading]}>
            <ActivityIndicator size="small" color="#ffffff" />
            <Text style={styles.bannerText}>Buscando GPS...</Text>
          </View>
        )}
      </View>

      <View style={styles.bottomOverlay} pointerEvents="box-none">
        <View style={styles.floatingLegend}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#059669' }]} />
            <Text style={styles.legendText}>Óptimo</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#dc2626' }]} />
            <Text style={styles.legendText}>Seco</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#2563eb' }]} />
            <Text style={styles.legendText}>Exceso</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#64748b' }]} />
            <Text style={styles.legendText}>Sin señal</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8fafc' },
  loadingText: { marginTop: 10, fontSize: 14, color: '#64748b' },
  topOverlay: { position: 'absolute', top: 50, left: 20, right: 20, alignItems: 'center' },
  bottomOverlay: { position: 'absolute', bottom: 24, left: 20, right: 20, alignItems: 'center' },
  gpsBanner: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 3, elevation: 3 },
  bannerInside: { backgroundColor: '#059669' },
  bannerOutside: { backgroundColor: '#d97706' },
  bannerError: { backgroundColor: '#dc2626' },
  bannerLoading: { backgroundColor: '#475569' },
  bannerText: { color: '#ffffff', fontWeight: '700', fontSize: 12 },
  floatingLegend: { flexDirection: 'row', backgroundColor: 'rgba(255, 255, 255, 0.95)', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, gap: 12, borderWidth: 1, borderColor: '#e2e8f0', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 11, fontWeight: '600', color: '#334155' },
  webFallbackContainer: { flex: 1, backgroundColor: '#f8fafc', padding: 24 },
  webHeader: { marginBottom: 24, alignItems: 'center' },
  webTitle: { fontSize: 24, fontWeight: '800', color: '#0f172a', letterSpacing: -0.5 },
  webSub: { fontSize: 14, color: '#64748b', marginTop: 4 },
  webPlotsGrid: { gap: 16, maxWidth: 600, width: '100%', alignSelf: 'center' },
  webPlotCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#ffffff', padding: 16, borderRadius: 12, borderLeftWidth: 6, shadowColor: '#0f172a', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  webPlotInfo: { flex: 1 },
  webPlotTitle: { fontSize: 18, fontWeight: '700', color: '#0f172a' },
  webPlotCrop: { fontSize: 13, color: '#64748b', marginTop: 2 },
  webStatusBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)' },
  webStatusText: { fontSize: 14, fontWeight: '800' }
});
