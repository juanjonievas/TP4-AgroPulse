import { createClient } from '@supabase/supabase-js';
import { Kafka } from 'kafkajs';
import { v4 as uuidv4 } from 'uuid';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const KAFKA_BROKERS = process.env.KAFKA_BROKERS || 'localhost:9092';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const kafka = new Kafka({
  clientId: 'agropulse-tester',
  brokers: [KAFKA_BROKERS]
});
const producer = kafka.producer();

const STATION_1 = 'cccccccc-cccc-cccc-cccc-ccccccccccc1'; // Costa 1 (plot b...1) 
const PLOT_1 = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1'; // Threshold 25-45

async function wait(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

async function verifyAlerts(plotId: string, expectedType: string | null) {
  const { data } = await supabase.from('alerts').select('*').eq('plot_id', plotId);
  const active = data?.filter(a => a.payload?.status === 'active') || [];
  
  if (expectedType === null) {
    if (active.length === 0) console.log(`✅ Correcto: Ninguna alerta activa para plot ${plotId}`);
    else console.log(`❌ Error: Se esperaba 0 alertas activas pero hay ${active.map(a => a.type).join(', ')}`);
  } else {
    if (active.length === 1 && active[0].type === expectedType) console.log(`✅ Correcto: Alerta activa es ${expectedType}`);
    else console.log(`❌ Error: Se esperaba ${expectedType} activa pero hay ${active.map(a => a.type).join(', ')}`);
  }
}

async function emitTelemetry(stationId: string, moisturePct: number) {
  await producer.send({
    topic: 'soil.moisture',
    messages: [{
      value: JSON.stringify({
        station_id: stationId,
        moisture_pct: moisturePct,
        temp_c: 25.0,
        ts: new Date().toISOString()
      })
    }]
  });
  console.log(`[Tester] Telemetría enviada -> Estación ${stationId} | Humedad: ${moisturePct}%`);
  // Esperar a que el worker procese el buffer (10 seg) + DB
  await wait(15000); 
}

async function runTests() {
  await producer.connect();
  console.log('--- INICIANDO PRUEBAS DE ALERTAS (ETAPA 4) ---');
  
  // Limpiar alertas previas para que la prueba sea limpia
  await supabase.from('alerts').delete().neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all
  
  console.log('\nPrueba 1: Humedad < threshold_min (DRY)');
  await emitTelemetry(STATION_1, 15); // < 25
  await verifyAlerts(PLOT_1, 'moisture_low');

  console.log('\nPrueba 2: Humedad dentro del rango (OPTIMAL)');
  await emitTelemetry(STATION_1, 35); // 25 <= 35 <= 45
  await verifyAlerts(PLOT_1, null);

  console.log('\nPrueba 3: Humedad > threshold_max (WET)');
  await emitTelemetry(STATION_1, 55); // > 45
  await verifyAlerts(PLOT_1, 'moisture_high');

  console.log('\nPrueba 4: Cambio de thresholds');
  // Cambiamos el threshold a 60-80, entonces 55 (lectura actual) pasa a ser DRY
  await supabase.from('plots').update({ threshold_min: 60, threshold_max: 80 }).eq('id', PLOT_1);
  console.log('Thresholds de Costa 1 cambiados a 60-80. Enviando lectura de 55...');
  await emitTelemetry(STATION_1, 55); // < 60
  await verifyAlerts(PLOT_1, 'moisture_low');

  // Restaurar thresholds a 25-45
  await supabase.from('plots').update({ threshold_min: 25, threshold_max: 45 }).eq('id', PLOT_1);
  await emitTelemetry(STATION_1, 35); // Vuelve a OPTIMAL
  
  console.log('\nPrueba 5: Telemetría continua sin duplicados');
  await emitTelemetry(STATION_1, 10);
  await emitTelemetry(STATION_1, 12);
  await emitTelemetry(STATION_1, 14);
  const { data } = await supabase.from('alerts').select('*').eq('plot_id', PLOT_1).eq('type', 'moisture_low');
  const activeCount = data?.filter(a => a.payload?.status === 'active').length || 0;
  if (activeCount === 1) console.log('✅ Correcto: Solo hay 1 alerta activa a pesar de múltiples lecturas dry.');
  else console.log(`❌ Error: Se encontraron ${activeCount} alertas activas.`);

  // La prueba Stale es más larga porque requiere esperar 15 minutos en tiempo real O inyectar directamente a readings
  // con fecha antigua y forzar el polling de stale.
  console.log('\nPrueba 6: STALE (Inyectando una lectura vieja en base de datos para simular el paso del tiempo)');
  
  const oldDate = new Date(Date.now() - 20 * 60 * 1000).toISOString(); // 20 minutos atrás
  const STATION_2 = 'cccccccc-cccc-cccc-cccc-ccccccccccc2';
  const PLOT_2 = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2';
  
  // Borrar lecturas recientes de Costa 2 para que realmente sea stale
  await supabase.from('readings').delete().eq('station_id', STATION_2);

  await supabase.from('readings').insert({
    station_id: STATION_2,
    moisture_pct: 35,
    temp_c: 25,
    source: 'sensor',
    measured_at: oldDate
  });

  // Esperar a que el worker pase su ciclo de 60s
  console.log('Esperando ciclo de 60s del Worker para detección de stale...');
  await wait(65000); 
  await verifyAlerts(PLOT_2, 'stale');

  console.log('\nPrueba 7: Nueva lectura después de stale');
  await emitTelemetry(STATION_2, 35); // Debería volver a optimal y borrar stale
  await verifyAlerts(PLOT_2, null);
  
  await producer.disconnect();
  console.log('--- FIN PRUEBAS DE ALERTAS ---');
}

runTests().catch(console.error);
