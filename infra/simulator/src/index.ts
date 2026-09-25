import { Kafka } from 'kafkajs';

const KAFKA_BROKERS = process.env.KAFKA_BROKERS || 'localhost:9092';

const kafka = new Kafka({
  clientId: 'agropulse-simulator',
  brokers: [KAFKA_BROKERS]
});

const producer = kafka.producer();
const consumer = kafka.consumer({ groupId: 'simulator-group' });

// Caché de comandos procesados para garantizar idempotencia
const processedCommands = new Set<string>();

const STATIONS = [
  { id: 'cccccccc-cccc-cccc-cccc-ccccccccccc1', name: 'Costa 1', baseMoisture: 35, valveId: 'dddddddd-dddd-dddd-dddd-ddddddddddd1', valveOpen: false },
  { id: 'cccccccc-cccc-cccc-cccc-ccccccccccc2', name: 'Costa 2', baseMoisture: 18, valveId: 'dddddddd-dddd-dddd-dddd-ddddddddddd2', valveOpen: false }
];

async function run() {
  await producer.connect();
  await consumer.connect();

  console.log('[Simulador] Conectado a Kafka. Iniciando generación de telemetría dinámica...');

  // Telemetría (cada 3s para un avance fluido pero moderado)
  setInterval(async () => {
    const ts = new Date().toISOString();
    
    for (const station of STATIONS) {
      // Dinámica de humedad coherente con el riego:
      // Si la válvula está abierta, sube moderadamente
      if (station.valveOpen) {
        station.baseMoisture = Math.min(100, station.baseMoisture + 2);
      } else {
        // Si está cerrada, desciende lentamente
        if (station.name === 'Costa 2' && station.baseMoisture > 18) {
          station.baseMoisture = Math.max(18, station.baseMoisture - 0.5);
        } else if (station.name === 'Costa 1' && station.baseMoisture > 35) {
          station.baseMoisture = Math.max(35, station.baseMoisture - 0.5);
        }
      }

      const moisture = Math.round(station.baseMoisture + (Math.random() * 2 - 1));
      const temp = +(25 + (Math.random() * 4 - 2)).toFixed(1);
      
      await producer.send({
        topic: 'soil.moisture',
        messages: [{ value: JSON.stringify({ station_id: station.id, moisture_pct: moisture, temp_c: temp, ts }) }]
      });

      const isRaining = Math.random() > 0.85;
      const rain = isRaining ? +(Math.random() * 3).toFixed(1) : 0;
      
      await producer.send({
        topic: 'weather.tick',
        messages: [{ value: JSON.stringify({ station_id: station.id, rain_mm: rain, ts }) }]
      });

      console.log(`[Simulador] Telemetría -> ${station.name} | Hum: ${moisture}% | Válvula: ${station.valveOpen ? 'ABIERTA' : 'CERRADA'}`);
    }
  }, 3000);

  // Escuchar comandos (txn.commands)
  await consumer.subscribe({ topic: 'txn.commands', fromBeginning: false });
  
  await consumer.run({
    eachMessage: async ({ message }) => {
      if (!message.value) return;
      const cmd = JSON.parse(message.value.toString());
      
      // Idempotencia: No procesar el mismo comando dos veces
      if (processedCommands.has(cmd.command_id)) {
        return;
      }
      processedCommands.add(cmd.command_id);
      
      console.log(`[Simulador] Procesando comando de riego para válvula ${cmd.valve_id} | Acción: ${cmd.action}`);
      
      // Simular tiempo de acción física (reducido a 1 segundo para agilidad)
      const delay = 1000;
      await new Promise(res => setTimeout(res, delay));

      const st = STATIONS.find(s => s.valveId === cmd.valve_id);

      if (cmd.action === 'open_n_min') {
        console.log(`[Simulador] ✅ Comando ${cmd.command_id} -> OPEN por ${cmd.duration_min} minutos.`);
        if (st) st.valveOpen = true;
        
        // Emitir apertura inicial
        await producer.send({
          topic: 'txn.events',
          messages: [{ value: JSON.stringify({ command_id: cmd.command_id, valve_id: cmd.valve_id, status: 'open', ts: new Date().toISOString() }) }]
        });

        // Programar cierre usando duration_min
        const durationMs = (cmd.duration_min || 1) * 60000;
        setTimeout(async () => {
          console.log(`[Simulador] ⏰ Tiempo cumplido para comando ${cmd.command_id}. CLOSING válvula ${cmd.valve_id}.`);
          if (st) st.valveOpen = false;

          await producer.send({
            topic: 'txn.events',
            messages: [{ value: JSON.stringify({ command_id: cmd.command_id, valve_id: cmd.valve_id, status: 'closed', ts: new Date().toISOString() }) }]
          });
        }, durationMs);

      } else {
        const newStatus = cmd.action === 'close' ? 'closed' : 'open';
        if (st) st.valveOpen = newStatus === 'open';

        console.log(`[Simulador] ✅ Comando ${cmd.command_id} -> Estado fijo a ${newStatus.toUpperCase()}`);
        
        await producer.send({
          topic: 'txn.events',
          messages: [{ value: JSON.stringify({ command_id: cmd.command_id, valve_id: cmd.valve_id, status: newStatus, ts: new Date().toISOString() }) }]
        });
      }
    }
  });
}

run().catch(console.error);
