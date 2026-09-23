-- Habilitar extensión PostGIS para las geometrías de los lotes
CREATE EXTENSION IF NOT EXISTS postgis;

-- 1. organizations (Establecimientos)
CREATE TABLE public.organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    region TEXT
);

-- 2. memberships (Roles y asignación de usuarios)
CREATE TABLE public.memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('producer', 'operator', 'advisor')),
    UNIQUE (user_id, organization_id)
);

-- 3. plots (Lotes)
CREATE TABLE public.plots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    crop TEXT,
    geom GEOMETRY(Polygon, 4326),
    threshold_min INT DEFAULT 25 CHECK (threshold_min BETWEEN 0 AND 100),
    threshold_max INT DEFAULT 45 CHECK (threshold_max BETWEEN 0 AND 100),
    CHECK (threshold_min <= threshold_max)
);

-- 4. stations (Estaciones simuladas)
CREATE TABLE public.stations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plot_id UUID NOT NULL REFERENCES public.plots(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    lat NUMERIC,
    lng NUMERIC
);

-- 5. readings (Lecturas de humedad/clima)
CREATE TABLE public.readings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    station_id UUID NOT NULL REFERENCES public.stations(id) ON DELETE CASCADE,
    measured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    moisture_pct INT NOT NULL CHECK (moisture_pct BETWEEN 0 AND 100),
    temp_c NUMERIC NOT NULL,
    rain_mm NUMERIC,
    source TEXT NOT NULL CHECK (source IN ('sensor', 'manual'))
);
-- Índice requerido por el PRD
CREATE INDEX readings_station_id_measured_at_idx ON public.readings (station_id, measured_at DESC);

-- 6. valves (Actuadores de riego)
CREATE TABLE public.valves (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plot_id UUID NOT NULL REFERENCES public.plots(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'closed' CHECK (status IN ('open', 'closed'))
);

-- 7. irrigation_commands (Órdenes de riego)
CREATE TABLE public.irrigation_commands (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    valve_id UUID NOT NULL REFERENCES public.valves(id) ON DELETE CASCADE,
    requested_by UUID NOT NULL REFERENCES auth.users(id),
    action TEXT NOT NULL CHECK (action IN ('open', 'close', 'open_n_min')),
    duration_min INT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'applied', 'failed', 'cancelled')),
    client_request_id UUID UNIQUE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    applied_at TIMESTAMPTZ,
    -- RF-14: Si es open_n_min, la duración debe estar entre 1 y 120
    CHECK (action != 'open_n_min' OR (duration_min >= 1 AND duration_min <= 120))
);

-- RF-16 MUST: Evitar más de un comando pending por válvula
CREATE UNIQUE INDEX one_pending_command_per_valve
ON public.irrigation_commands (valve_id)
WHERE status = 'pending';

-- 8. alerts (Alertas y notificaciones)
CREATE TABLE public.alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plot_id UUID NOT NULL REFERENCES public.plots(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    payload JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    read_at TIMESTAMPTZ
);

-- ==============================================================
-- Row Level Security (RLS)
-- ==============================================================

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.readings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.valves ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.irrigation_commands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;

-- organizations
CREATE POLICY "Users can view their organizations" 
ON public.organizations FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.memberships 
    WHERE memberships.organization_id = id AND memberships.user_id = auth.uid()
  )
);

-- memberships
CREATE POLICY "Users can view their memberships" 
ON public.memberships FOR SELECT 
USING (user_id = auth.uid());

-- plots
CREATE POLICY "Users can view plots of their orgs" 
ON public.plots FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.memberships 
    WHERE memberships.organization_id = plots.organization_id AND memberships.user_id = auth.uid()
  )
);

-- RF-05 y Permisos: producer/operator editan umbrales
CREATE POLICY "Producer/Operator can update plots" 
ON public.plots FOR UPDATE 
USING (
  EXISTS (
    SELECT 1 FROM public.memberships 
    WHERE memberships.organization_id = plots.organization_id 
    AND memberships.user_id = auth.uid()
    AND memberships.role IN ('producer', 'operator')
  )
);

-- Restricción a nivel de columnas para RLS de plots: solo umbrales
REVOKE UPDATE ON public.plots FROM authenticated;
REVOKE UPDATE ON public.plots FROM anon;
GRANT UPDATE (threshold_min, threshold_max) ON public.plots TO authenticated;

-- stations
CREATE POLICY "Users can view stations of their plots" 
ON public.stations FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.plots
    JOIN public.memberships ON memberships.organization_id = plots.organization_id
    WHERE plots.id = stations.plot_id AND memberships.user_id = auth.uid()
  )
);

-- readings
CREATE POLICY "Users can view readings of their stations" 
ON public.readings FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.stations
    JOIN public.plots ON plots.id = stations.plot_id
    JOIN public.memberships ON memberships.organization_id = plots.organization_id
    WHERE stations.id = readings.station_id AND memberships.user_id = auth.uid()
  )
);

CREATE POLICY "Users can insert manual readings" 
ON public.readings FOR INSERT 
WITH CHECK (
  source = 'manual' AND
  EXISTS (
    SELECT 1 FROM public.stations
    JOIN public.plots ON plots.id = stations.plot_id
    JOIN public.memberships ON memberships.organization_id = plots.organization_id
    WHERE stations.id = station_id
    AND memberships.user_id = auth.uid()
    AND memberships.role IN ('producer', 'operator')
  )
);

-- valves
CREATE POLICY "Users can view valves of their plots" 
ON public.valves FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.plots
    JOIN public.memberships ON memberships.organization_id = plots.organization_id
    WHERE plots.id = valves.plot_id AND memberships.user_id = auth.uid()
  )
);

-- irrigation_commands
CREATE POLICY "Users can view commands of their valves" 
ON public.irrigation_commands FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.valves
    JOIN public.plots ON plots.id = valves.plot_id
    JOIN public.memberships ON memberships.organization_id = plots.organization_id
    WHERE valves.id = irrigation_commands.valve_id AND memberships.user_id = auth.uid()
  )
);

CREATE POLICY "Producer/Operator can insert commands" 
ON public.irrigation_commands FOR INSERT 
WITH CHECK (
  auth.uid() = requested_by AND
  EXISTS (
    SELECT 1 FROM public.valves
    JOIN public.plots ON plots.id = valves.plot_id
    JOIN public.memberships ON memberships.organization_id = plots.organization_id
    WHERE valves.id = valve_id
    AND memberships.user_id = auth.uid()
    AND memberships.role IN ('producer', 'operator')
  )
);

-- RF-17 Cancelación de comandos
CREATE POLICY "Producer/Operator can cancel pending commands" 
ON public.irrigation_commands FOR UPDATE 
USING (
  status = 'pending' AND
  EXISTS (
    SELECT 1 FROM public.valves
    JOIN public.plots ON plots.id = valves.plot_id
    JOIN public.memberships ON memberships.organization_id = plots.organization_id
    WHERE valves.id = valve_id
    AND memberships.user_id = auth.uid()
    AND memberships.role IN ('producer', 'operator')
  )
)
WITH CHECK (
  status = 'cancelled'
);

-- Restricción a nivel de columnas para RLS de comandos: solo status
REVOKE UPDATE ON public.irrigation_commands FROM authenticated;
REVOKE UPDATE ON public.irrigation_commands FROM anon;
GRANT UPDATE (status) ON public.irrigation_commands TO authenticated;

-- alerts
CREATE POLICY "Users can view alerts of their plots" 
ON public.alerts FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.plots
    JOIN public.memberships ON memberships.organization_id = plots.organization_id
    WHERE plots.id = alerts.plot_id AND memberships.user_id = auth.uid()
  )
);

-- ==============================================================
-- Realtime (Suscripción a cambios)
-- ==============================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END
$$;

ALTER PUBLICATION supabase_realtime ADD TABLE public.readings, public.valves, public.irrigation_commands, public.alerts;
