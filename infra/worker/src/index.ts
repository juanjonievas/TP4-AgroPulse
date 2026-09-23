import { createClient } from '@supabase/supabase-js';
import { Kafka } from 'kafkajs';
import { v5 as uuidv5 } from 'uuid';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const KAFKA_BROKERS = process.env.KAFKA_BROKERS || 'localhost:9092';
const NAMESPACE = '1b671a64-40d5-491e-99b0-da01ff1f3341';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const kafka = new Kafka({
  clientId: 'agropulse-worker',
  brokers: [KAFKA_BROKERS]
});

const consumer = kafka.consumer({ groupId: 'worker-group' });
const producer = kafka.producer();

// Buffer de correlación para lecturas en memoria
const readingBuffer = new Map<string, {
  station_id: string;
  ts: string;
  moisture_pct?: number;
  temp_c?: number;
  rain_mm?: number;
  timeout: NodeJS.Timeout;
}>();

// --- LÓGICA DE ALERTAS ---

async function ensureActiveAlert(plotId: string, type: string, payload: any) {
  const { data: existing, error: errFetch } = await supabase
    .from('alerts')
    .select('id, payload')
    .eq('plot_id', plotId)
    .eq('type', type);

  if (errFetch) {
    console.error(`[Worker] Error buscando alerta activa para plot ${plotId}:`, errFetch);
    return;
  }
  
  const activeAlert = existing?.find(a => a.payload?.status === 'active');
  if (activeAlert) return; // Ya existe

  const { error: errInsert } = await supabase.from('alerts').insert({
    plot_id: plotId,
    type,
    payload: { status: 'active', ...payload }
  });
  
  if (errInsert) {
    console.error(`[Worker] Error insertando alerta ${type} para plot ${plotId}:`, errInsert);
  } else {
    console.log(`[Worker] Alerta ${type} CREADA para plot ${plotId}`);
  }
}

async function resolveAlert(plotId: string, type: string) {
  const { data: existing, error: errFetch } = await supabase
    .from('alerts')
    .select('id, payload')
    .eq('plot_id', plotId)
    .eq('type', type);

  if (errFetch) {
    console.error(`[Worker] Error consultando alerta para resolver ${type}:`, errFetch);
    return;
  }
  
  const activeAlert = existing?.find(a => a.payload?.status === 'active');
  if (activeAlert) {
     const newPayload = { ...activeAlert.payload, status: 'resolved', resolved_at: new Date().toISOString() };
     const { error: errUpdate } = await supabase.from('alerts')
       .update({ payload: newPayload })
       .eq('id', activeAlert.id);
     
     if (errUpdate) {
        console.error(`[Worker] Error resolviendo alerta ${type}:`, errUpdate);
     } else {
        console.log(`[Worker] Alerta ${type} RESUELTA para plot ${plotId}`);
     }
  }
}

async function handleAlertsForPlot(plotId: string, moisture: number, tMin: number, tMax: number) {
  // Siempre resolvemos stale si llega una lectura
  await resolveAlert(plotId, 'stale');

  if (moisture < tMin) {
    // DRY
    await ensureActiveAlert(plotId, 'moisture_low', { moisture, threshold: tMin });
    await resolveAlert(plotId, 'moisture_high');
  } else if (moisture > tMax) {
    // WET
    await ensureActiveAlert(plotId, 'moisture_high', { moisture, threshold: tMax });
    await resolveAlert(plotId, 'moisture_low');
  } else {
    // OPTIMAL
    await resolveAlert(plotId, 'moisture_low');
    await resolveAlert(plotId, 'moisture_high');
  }
}

async function checkStaleStations() {
  const { data: plots, error: errPlots } = await supabase.from('plots').select('id');
  if (errPlots || !plots) return;

  for (const plot of plots) {
    const { data: stations, error: stErr } = await supabase.from('stations').select('id').eq('plot_id', plot.id);
    if (stErr || !stations) continue;

    for (const st of stations) {
      const { data: readings, error: rdErr } = await supabase.from('readings')
        .select('measured_at')
        .eq('station_id', st.id)
        .order('measured_at', { ascending: false })
        .limit(1);

      if (rdErr) continue;

      let isStale = false;
      if (!readings || readings.length === 0) {
        isStale = true;
      } else {
        const lastMs = new Date(readings[0].measured_at).getTime();
        const nowMs = Date.now();
        if (nowMs - lastMs > 15 * 60 * 1000) { // 15 minutos
          isStale = true;
        }
      }

      if (isStale) {
        await ensureActiveAlert(plot.id, 'stale', { station_id: st.id });
      } else {
        await resolveAlert(plot.id, 'stale');
      }
    }
  }
}

// --- FIN LÓGICA DE ALERTAS ---

async function flushReading(readingId: string) {
  const data = readingBuffer.get(readingId);
  if (!data) return;
  
  readingBuffer.delete(readingId);

  if (data.moisture_pct === undefined) {
    console.error(`[Worker] Error de Correlación: Imposible guardar lectura ${readingId} para estación ${data.station_id}. Falta moisture_pct (requerido).`);
    return;
  }

  const { error } = await supabase.from('readings').upsert({
    id: readingId,
    station_id: data.station_id,
    measured_at: data.ts,
    moisture_pct: data.moisture_pct,
    temp_c: data.temp_c,
    rain_mm: data.rain_mm || null,
    source: 'sensor'
  }, { onConflict: 'id' });

  if (error) {
    console.error(`[Worker] Supabase UPSERT Error en reading ${readingId}:`, error);
  } else {
    console.log(`[Worker] Lectura guardada | Estación: ${data.station_id} | Humedad: ${data.moisture_pct}% | Lluvia: ${data.rain_mm || 0}mm`);
    
    // Alertas (Etapa 4)
    console.log(`[Worker] Evaluando alertas para estación ${data.station_id}...`);
    const { data: stData, error: stErr } = await supabase.from('stations').select('plot_id').eq('id', data.station_id).single();
    if (stErr) {
       console.error(`[Worker] Error fetching station ${data.station_id}:`, stErr);
    } else if (stData) {
      console.log(`[Worker] Plot asociado: ${stData.plot_id}`);
      const { data: plotData, error: pErr } = await supabase.from('plots').select('threshold_min, threshold_max').eq('id', stData.plot_id).single();
      if (pErr) {
         console.error(`[Worker] Error fetching plot ${stData.plot_id}:`, pErr);
      } else if (plotData) {
         console.log(`[Worker] Ejecutando handleAlertsForPlot con ${data.moisture_pct} y thresholds ${plotData.threshold_min}-${plotData.threshold_max}`);
         await handleAlertsForPlot(stData.plot_id, data.moisture_pct, plotData.threshold_min, plotData.threshold_max);
      }
    }
  }
}

// Función de Polling periódico para republicar comandos pending y evitar pérdida por carrera
async function pollPendingCommands() {
  const { data: pendingCmds, error } = await supabase
    .from('irrigation_commands')
    .select('*')
    .eq('status', 'pending');

  if (error) {
    console.error('[Worker] Error consultando comandos pendientes en Polling:', error);
  } else if (pendingCmds && pendingCmds.length > 0) {
    for (const cmd of pendingCmds) {
      await producer.send({
        topic: 'txn.commands',
        messages: [{
          value: JSON.stringify({
            command_id: cmd.id,
            valve_id: cmd.valve_id,
            action: cmd.action,
            duration_min: cmd.duration_min
          })
        }]
      });
    }
    console.log(`[Worker] Polling: Republicados ${pendingCmds.length} comandos pendientes a txn.commands.`);
  }
}

async function run() {
  await producer.connect();
  await consumer.connect();

  console.log('[Worker] Conectado a Kafka.');

  // Iniciar polling periódico cada 15 segundos
  setInterval(pollPendingCommands, 15000);
  pollPendingCommands();

  // Etapa 4: Polling de Stale cada 1 minuto
  setInterval(checkStaleStations, 60000);
  checkStaleStations();

  console.log('[Worker] Suscribiendo a topics de Kafka...');
  await consumer.subscribe({ topic: 'soil.moisture', fromBeginning: false });
  await consumer.subscribe({ topic: 'weather.tick', fromBeginning: false });
  await consumer.subscribe({ topic: 'txn.events', fromBeginning: false });
  await consumer.subscribe({ topic: 'txn.dlq', fromBeginning: false });

  await consumer.run({
    eachMessage: async ({ topic, message }) => {
      if (!message.value) return;
      const data = JSON.parse(message.value.toString());

      // Telemetría (Correlación aumentada a 10s)
      if (topic === 'soil.moisture' || topic === 'weather.tick') {
        const readingId = uuidv5(`${data.station_id}-${data.ts}`, NAMESPACE);
        
        if (!readingBuffer.has(readingId)) {
          readingBuffer.set(readingId, {
            station_id: data.station_id,
            ts: data.ts,
            timeout: setTimeout(() => flushReading(readingId), 10000) // 10 segundos de tolerancia
          });
        }

        const entry = readingBuffer.get(readingId)!;
        if (topic === 'soil.moisture') {
          entry.moisture_pct = data.moisture_pct;
          entry.temp_c = data.temp_c;
        } else if (topic === 'weather.tick') {
          entry.rain_mm = data.rain_mm;
        }
      }

      // Eventos de Válvulas
      if (topic === 'txn.events') {
        console.log(`[Worker] Evento recibido: Comando ${data.command_id} -> Válvula ${data.valve_id} STATUS: ${data.status}`);
        
        // 1. Actualizar siempre el estado de la válvula
        const { error: valveErr } = await supabase.from('valves')
          .update({ status: data.status })
          .eq('id', data.valve_id);
        if (valveErr) {
          console.error(`[Worker] Error actualizando válvula ${data.valve_id}:`, valveErr);
          return;
        }

        // 2. Determinar si el comando debe pasar a "applied"
        const { data: cmdRow, error: fetchCmdErr } = await supabase
          .from('irrigation_commands')
          .select('action, status')
          .eq('id', data.command_id)
          .single();
          
        if (fetchCmdErr || !cmdRow) {
           console.error(`[Worker] Error buscando comando ${data.command_id}:`, fetchCmdErr);
           return;
        }

        // Si ya fue resuelto previamente, ignorar
        if (cmdRow.status !== 'pending') return;

        let shouldApply = false;
        if (cmdRow.action === 'open' && data.status === 'open') shouldApply = true;
        if (cmdRow.action === 'close' && data.status === 'closed') shouldApply = true;
        // Para open_n_min, marcamos applied cuando la válvula abre según lo solicitado (a los 5 seg)
        if (cmdRow.action === 'open_n_min' && data.status === 'open') shouldApply = true;

        if (shouldApply) {
          const { error: cmdErr } = await supabase.from('irrigation_commands')
            .update({ status: 'applied', applied_at: data.ts })
            .eq('id', data.command_id);
          if (cmdErr) {
             console.error(`[Worker] Error marcando comando ${data.command_id} como applied:`, cmdErr);
          } else {
             console.log(`[Worker] Comando ${data.command_id} APPLIED correctamente.`);
          }
        }
      }

      // Fallos (DLQ)
      if (topic === 'txn.dlq') {
        console.log(`[Worker] Evento recibido (DLQ): Comando ${data.command_id} FALLÓ. Razón: ${data.reason}`);
        
        const { error: err } = await supabase.from('irrigation_commands')
          .update({ status: 'failed' })
          .eq('id', data.command_id);
        if (err) console.error(`[Worker] Error marcando comando ${data.command_id} como failed:`, err);
      }
    },
  });

  // Suscripción Realtime para reaccionar inmediatamente (Baja latencia)
  console.log('[Worker] Suscribiendo a Supabase Realtime para nuevos comandos...');
  supabase
    .channel('irrigation_commands_changes')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'irrigation_commands', filter: 'status=eq.pending' },
      async (payload) => {
        const cmd = payload.new;
        console.log(`[Worker] Nuevo comando vía Realtime | ID: ${cmd.id} | Acción: ${cmd.action}`);
        try {
          await producer.send({
            topic: 'txn.commands',
            messages: [{
              value: JSON.stringify({
                command_id: cmd.id,
                valve_id: cmd.valve_id,
                action: cmd.action,
                duration_min: cmd.duration_min
              })
            }]
          });
        } catch (err) {
          console.error(`[Worker] Error publicando comando a Kafka:`, err);
        }
      }
    )
    .subscribe();
}

run().catch(console.error);
