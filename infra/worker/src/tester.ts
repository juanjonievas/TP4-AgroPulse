import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const VALVE_1 = 'dddddddd-dddd-dddd-dddd-ddddddddddd1';
const VALVE_2 = 'dddddddd-dddd-dddd-dddd-ddddddddddd2';
const VALVE_A = 'dddddddd-dddd-dddd-dddd-ddddddddddd3';

async function wait(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

async function getRequestedBy() {
  const { data, error } = await supabase.from('memberships').select('user_id').limit(1).single();
  if (error || !data) throw new Error('No user found');
  return data.user_id;
}

async function runTests() {
  console.log('--- INICIANDO PRUEBAS DE RIEGO (ETAPA 3) ---');
  
  const userId = await getRequestedBy();
  
  // PRUEBA 1: OPEN (pending -> applied)
  console.log('\nPrueba 1: OPEN');
  let cid1 = uuidv4();
  const { data: d1, error: e1 } = await supabase.from('irrigation_commands').insert({
    valve_id: VALVE_1,
    requested_by: userId,
    action: 'open',
    client_request_id: cid1
  }).select().single();
  
  if (e1) console.error('Error insertando OPEN:', e1);
  else console.log('Insertado OPEN (pending)... esperando applied');
  
  while (true) {
    const { data } = await supabase.from('irrigation_commands').select('status').eq('id', d1.id).single();
    if (data && data.status !== 'pending') {
      console.log('-> Resultado OPEN:', data.status);
      break;
    }
    await wait(1000);
  }

  // PRUEBA 2: CLOSE (pending -> applied)
  console.log('\nPrueba 2: CLOSE');
  let cid2 = uuidv4();
  const { data: d2 } = await supabase.from('irrigation_commands').insert({
    valve_id: VALVE_1,
    requested_by: userId,
    action: 'close',
    client_request_id: cid2
  }).select().single();
  
  while (true) {
    const { data } = await supabase.from('irrigation_commands').select('status').eq('id', d2.id).single();
    if (data && data.status !== 'pending') {
      console.log('-> Resultado CLOSE:', data.status);
      break;
    }
    await wait(1000);
  }

  // PRUEBA 3: OPEN_N_MIN
  console.log('\nPrueba 3: OPEN_N_MIN (1 min)');
  let cid3 = uuidv4();
  const { data: d3 } = await supabase.from('irrigation_commands').insert({
    valve_id: VALVE_1,
    requested_by: userId,
    action: 'open_n_min',
    duration_min: 1,
    client_request_id: cid3
  }).select().single();
  
  console.log('Comando open_n_min en pending. Esperando a que el simulator envíe open (debe quedar pending) y luego closed (applied)...');
  let wasOpen = false;
  while (true) {
    const { data: cmd } = await supabase.from('irrigation_commands').select('status').eq('id', d3.id).single();
    const { data: vlv } = await supabase.from('valves').select('status').eq('id', VALVE_1).single();
    
    if (cmd!.status === 'pending' && vlv!.status === 'open' && !wasOpen) {
      console.log('-> Válvula abrió, pero el comando SIGUE pending. ¡Comportamiento correcto!');
      wasOpen = true;
    }
    if (cmd!.status !== 'pending') {
      console.log('-> Resultado OPEN_N_MIN:', cmd!.status, 'Válvula status:', vlv!.status);
      break;
    }
    await wait(1000);
  }

  // PRUEBA 4: IDEMPOTENCIA
  console.log('\nPrueba 4: IDEMPOTENCIA (mismo client_request_id)');
  let cid4 = uuidv4();
  await supabase.from('irrigation_commands').insert({
    valve_id: VALVE_1, requested_by: userId, action: 'open', client_request_id: cid4
  });
  const { error: e4 } = await supabase.from('irrigation_commands').insert({
    valve_id: VALVE_2, requested_by: userId, action: 'open', client_request_id: cid4
  });
  console.log('-> Error de duplicado:', e4 ? e4.message : 'FALLÓ, se insertó!');
  
  // Cleanup para poder seguir
  await wait(5000); // esperar que termine el comando anterior

  // PRUEBA 5: DOS PENDING MISMA VÁLVULA
  console.log('\nPrueba 5: DOS PENDING MISMA VÁLVULA');
  await supabase.from('irrigation_commands').insert({
    valve_id: VALVE_2, requested_by: userId, action: 'open', client_request_id: uuidv4()
  });
  const { error: e5 } = await supabase.from('irrigation_commands').insert({
    valve_id: VALVE_2, requested_by: userId, action: 'close', client_request_id: uuidv4()
  });
  console.log('-> Error de dos pending:', e5 ? e5.message : 'FALLÓ, se insertó!');

  // PRUEBA 6: CANCELACIÓN
  console.log('\nPrueba 6: CANCELACIÓN');
  // Cancel pending
  const { data: dp } = await supabase.from('irrigation_commands').insert({
    valve_id: VALVE_A, requested_by: userId, action: 'open', client_request_id: uuidv4()
  }).select().single();
  const { error: ep } = await supabase.from('irrigation_commands').update({ status: 'cancelled' }).eq('id', dp.id);
  console.log('-> Cancelar pending:', ep ? ep.message : 'ÉXITO');

  // Intentar cancelar un applied (usamos el d1)
  const { data: updatedApplied } = await supabase.from('irrigation_commands').update({ status: 'cancelled' }).eq('id', d1.id).select();
  console.log('-> Cancelar applied (debe fallar RLS o ser 0 filas modificadas porque status solo se puede cancelar si pending, pero como usamos service_role va a forzar la escritura! Así que la probamos omitiendo RLS? No, la app usa RLS)');
  // Ojo: con service_role bypassea RLS. Si uso service_role, no puedo probar RLS correctamente.

}

runTests().catch(console.error);
