-- IMPORTANTE: Los usuarios de prueba deben ser creados previamente desde 
-- el dashboard de Supabase (Authentication -> Add user):
-- productor@agropulse.test
-- operador@agropulse.test
-- asesor@agropulse.test

-- 1. Organización (Establecimiento)
INSERT INTO public.organizations (id, name, region) VALUES 
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Estancia Didáctica Concordia', 'Entre Ríos')
ON CONFLICT (id) DO NOTHING;

-- 2. Membresías
-- Asignamos los usuarios a la organización mapeando por su email en auth.users
INSERT INTO public.memberships (id, user_id, organization_id, role)
SELECT gen_random_uuid(), id, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'producer'
FROM auth.users WHERE email = 'productor@agropulse.test'
ON CONFLICT DO NOTHING;

INSERT INTO public.memberships (id, user_id, organization_id, role)
SELECT gen_random_uuid(), id, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'operator'
FROM auth.users WHERE email = 'operador@agropulse.test'
ON CONFLICT DO NOTHING;

INSERT INTO public.memberships (id, user_id, organization_id, role)
SELECT gen_random_uuid(), id, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'advisor'
FROM auth.users WHERE email = 'asesor@agropulse.test'
ON CONFLICT DO NOTHING;

-- 3. Lotes (plots)
-- Se usan los nombres y cultivos del PRD (§14)
INSERT INTO public.plots (id, organization_id, name, crop, threshold_min, threshold_max, geom) VALUES 
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Costa 1', 'Citrus', 25, 45, ST_GeomFromText('POLYGON((-58.000 -31.000, -58.010 -31.000, -58.010 -31.010, -58.000 -31.010, -58.000 -31.000))', 4326)),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Costa 2', 'Citrus', 25, 45, ST_GeomFromText('POLYGON((-58.020 -31.000, -58.030 -31.000, -58.030 -31.010, -58.020 -31.010, -58.020 -31.000))', 4326)),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Monte A', 'Soja', 25, 45, ST_GeomFromText('POLYGON((-58.040 -31.000, -58.050 -31.000, -58.050 -31.010, -58.040 -31.010, -58.040 -31.000))', 4326))
ON CONFLICT (id) DO NOTHING;

-- 4. Estaciones
INSERT INTO public.stations (id, plot_id, name, lat, lng) VALUES 
('cccccccc-cccc-cccc-cccc-ccccccccccc1', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', 'Estación C1', -31.005, -58.005),
('cccccccc-cccc-cccc-cccc-ccccccccccc2', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2', 'Estación C2', -31.005, -58.025),
('cccccccc-cccc-cccc-cccc-ccccccccccc3', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3', 'Estación MA', -31.005, -58.045)
ON CONFLICT (id) DO NOTHING;

-- 5. Válvulas
INSERT INTO public.valves (id, plot_id, name, status) VALUES 
('dddddddd-dddd-dddd-dddd-ddddddddddd1', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', 'Válvula 1', 'closed'),
('dddddddd-dddd-dddd-dddd-ddddddddddd2', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2', 'Válvula 2', 'closed'),
('dddddddd-dddd-dddd-dddd-ddddddddddd3', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3', 'Válvula A', 'closed')
ON CONFLICT (id) DO NOTHING;

-- 6. Lecturas iniciales (Para que haya datos visibles apenas inicia el sistema)
-- Costa 1 (C1): Humedad óptima (35%) -> Verde
-- Costa 2 (C2): Humedad baja (18%) -> Rojo (necesita riego, historia de usuario H1)
INSERT INTO public.readings (id, station_id, measured_at, moisture_pct, temp_c, rain_mm, source) VALUES 
(gen_random_uuid(), 'cccccccc-cccc-cccc-cccc-ccccccccccc1', now(), 35, 25.0, 0, 'sensor'),
(gen_random_uuid(), 'cccccccc-cccc-cccc-cccc-ccccccccccc2', now(), 18, 26.5, 0, 'sensor')
ON CONFLICT DO NOTHING;
