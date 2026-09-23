const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

async function resetUsers() {
  const usersToReset = [
    { email: 'productor@agropulse.test', role: 'producer' },
    { email: 'operador@agropulse.test', role: 'operator' },
    { email: 'asesor@agropulse.test', role: 'advisor' }
  ];

  for (const u of usersToReset) {
    console.log(`Buscando usuario ${u.email}...`);
    // Obtener el ID del usuario
    const { data: usersData, error: listError } = await supabase.auth.admin.listUsers();
    
    let userId;
    const existingUser = usersData?.users?.find(user => user.email === u.email);

    if (existingUser) {
      console.log(`El usuario ya existe. Actualizando contraseña a AgroPulse2026! y confirmando email...`);
      userId = existingUser.id;
      const { error: updateError } = await supabase.auth.admin.updateUserById(userId, {
        password: 'AgroPulse2026!',
        email_confirm: true
      });
      if (updateError) console.error("Error al actualizar:", updateError);
    } else {
      console.log(`El usuario NO existe. Creándolo...`);
      const { data: adminUser, error: createError } = await supabase.auth.admin.createUser({
        email: u.email,
        password: 'AgroPulse2026!',
        email_confirm: true
      });
      if (createError) {
        console.error("Error al crear:", createError);
        continue;
      }
      userId = adminUser.user.id;
    }

    console.log(`Usuario ${u.email} listo. ID: ${userId}`);

    // Ahora, asegurar que tenga la membresía
    // 1. Obtener una organizacion
    const { data: orgs } = await supabase.from('organizations').select('id').limit(1);
    let orgId;
    if (!orgs || orgs.length === 0) {
      const { data: newOrg } = await supabase.from('organizations').insert([{ name: 'Estancia Didáctica Concordia' }]).select().single();
      orgId = newOrg.id;
    } else {
      orgId = orgs[0].id;
    }

    // 2. Insertar membresia
    const { error: memError } = await supabase.from('memberships').upsert({
      user_id: userId,
      organization_id: orgId,
      role: u.role
    }, { onConflict: 'user_id,organization_id' });

    if (memError) {
      console.error(`Error insertando membresia para ${u.email}:`, memError);
    } else {
      console.log(`Membresia de ${u.role} asignada a ${u.email} exitosamente.\n`);
    }
  }
}

resetUsers();
