# AgroPulse — Monitoreo Agrícola y Riego de Precisión

AgroPulse es un prototipo demostrativo y formativo de agricultura de precisión desarrollado con React Native (Expo) y una arquitectura orientada a eventos (Event-Driven) con Supabase y Redpanda (Kafka).

El sistema permite a productores, operadores y asesores visualizar lotes y estaciones en un mapa interactivo con semaforización de humedad en tiempo real, configurar umbrales agronómicos y emitir comandos de riego con acuse de recepción idempotente.

---

## 1. Arquitectura General del Sistema

La solución separa con claridad la frontera entre el dispositivo móvil, el bus de mensajería backend y la capa de base de datos / BaaS:

```
[ Simulador IoT ] ──(topics telemetría)──> [ Redpanda (Kafka) ]
                                                   │
                                                   ▼
                                            [ Worker Backend ]
                                                   │
                                            (Service Role)
                                                   │
                                                   ▼
                                          [ Supabase Postgres ]
                                            │               │
                                       (Auth / RLS)    (Realtime WS)
                                            │               │
                                            ▼               ▼
                                      [ Aplicación Móvil Expo ]
```

### Justificación: ¿Por qué la app móvil no se acopla directamente a Kafka? (OA-7 / §11)
El cliente móvil **nunca** se conecta directamente al broker Redpanda/Kafka debido a razones críticas de arquitectura:
1. **Inestabilidad de redes móviles:** Las conexiones celulares sufren desconexiones frecuentes y fluctuaciones de latencia que degradan los protocolos basados en TCP persistente de Kafka.
2. **Consumo de batería y ancho de banda:** Mantener conexiones abiertas de streaming continuo y procesar particiones/offsets agota rápidamente la batería del dispositivo.
3. **Seguridad y Perímetro:** Exponer un broker Kafka directamente a internet requeriría credenciales complejas o proxies adicionales. En cambio, Supabase gestiona la autenticación mediante tokens JWT y aplica Row Level Security (RLS) a nivel de fila en la base de datos.
4. **Backpressure y Esquema:** La app delega el buffering, la correlación de telemetría y la transformación de datos al Worker backend, consumiendo únicamente el estado consolidado mediante suscripciones WebSockets de Supabase Realtime.

---

## 2. Tópicos de Kafka / Redpanda

| Tópico | Productor | Consumidor | Propósito |
| :--- | :--- | :--- | :--- |
| `soil.moisture` | Simulador | Worker | Envío de humedad de suelo (`moisture_pct`), temperatura (`temp_c`) y timestamp. |
| `weather.tick` | Simulador | Worker | Envío de condiciones meteorológicas (`rain_mm`) y timestamp. |
| `txn.commands` | Worker | Simulador | Comandos de riego pendientes derivados desde Supabase hacia los actuadores. |
| `txn.events` | Simulador | Worker | Confirmación de cambio de estado de válvula (`open` / `closed`) para marcar comando como `applied`. |
| `txn.dlq` | Simulador | Worker | Cola de mensajes muertos ante fallos físicos simulados (ej. `valve_timeout`) para marcar comando como `failed`. |

---

## 3. Prerrequisitos de Instalación

* **Node.js:** Versión 18.x o 20.x LTS instalada.
* **Docker y Docker Compose:** Para ejecutar el cluster de Redpanda, Worker y Simulador.
* **Cuenta o Instancia local de Supabase:** Para base de datos PostgreSQL, autenticación y Realtime.
* **Expo Go / Emulador:** Dispositivo físico con Expo Go instalado o emulador Android / simulador iOS configurado.

---

## 4. Puesta en Marcha Paso a Paso

### 4.1 Configuración de Supabase (Base de Datos y Auth)

1. Crear un proyecto en Supabase (o utilizar una instancia local con Supabase CLI).
2. Ir al **SQL Editor** de Supabase y ejecutar la migración inicial:
   * Contenido del archivo: `supabase/migrations/20260921000000_initial_schema.sql`
   * Esta migración crea las tablas (`organizations`, `memberships`, `plots`, `stations`, `readings`, `valves`, `irrigation_commands`, `alerts`), habilita la extensión PostGIS, configura las políticas RLS y publica las tablas en `supabase_realtime`.
3. Dar de alta a los 3 usuarios de prueba desde el panel de Supabase (**Authentication -> Users -> Add user**):
   * `productor@agropulse.test` (Contraseña a elección, ej. `<TU_PASSWORD>`)
   * `operador@agropulse.test` (Contraseña a elección, ej. `<TU_PASSWORD>`)
   * `asesor@agropulse.test` (Contraseña a elección, ej. `<TU_PASSWORD>`)
   *(Asegurarse de marcar "Auto Confirm User" si está disponible).*
4. En el **SQL Editor**, ejecutar los datos semilla:
   * Contenido del archivo: `supabase/seed.sql`
   * Este script vincula los UUIDs de los usuarios recién creados con la organización `Estancia Didáctica Concordia` y crea los lotes Costa 1, Costa 2 y Monte A con sus estaciones y válvulas.

---

### 4.2 Configuración de Variables de Entorno

> **IMPORTANTE:** Nunca comitear archivos `.env` con credenciales reales al repositorio.

1. **Configurar el Backend (`infra/.env`):**
   Copiar la plantilla de ejemplo:
   ```bash
   cp infra/.env.example infra/.env
   ```
   Completar con las credenciales de tu proyecto de Supabase:
   ```env
   SUPABASE_URL=https://tu-proyecto.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=tu-service-role-key-secreta
   KAFKA_BROKERS=redpanda:29092
   ```

2. **Configurar la App Móvil (`mobile/.env`):**
   Copiar la plantilla de ejemplo:
   ```bash
   cp mobile/.env.example mobile/.env
   ```
   Completar con la URL y la Anon Key pública:
   ```env
   EXPO_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=tu-anon-key-publica
   ```
   *(Nota: La app móvil solo utiliza `EXPO_PUBLIC_SUPABASE_ANON_KEY` y nunca debe incluir la Service Role Key).*

---

### 4.3 Despliegue de Infraestructura y Microservicios (Docker)

1. Posicionarse en la carpeta `infra`:
   ```bash
   cd infra
   ```
2. Iniciar los contenedores de Redpanda, Worker y Simulador:
   ```bash
   docker compose up -d --build
   ```
3. Verificar el estado de los servicios:
   ```bash
   docker compose ps
   ```
4. Visualizar los logs del Worker y del Simulador:
   ```bash
   docker compose logs -f worker
   docker compose logs -f simulator
   ```
   En los logs se observarán los ticks periódicos emitidos cada 5 segundos y su persistencia en Supabase.

---

### 4.4 Ejecución de la Aplicación Móvil (Expo)

1. Posicionarse en la carpeta `mobile`:
   ```bash
   cd mobile
   ```
2. Instalar dependencias si no se ha hecho previamente:
   ```bash
   npm install
   ```
3. Iniciar el servidor de desarrollo de Expo:
   ```bash
   npx expo start
   ```
4. Opciones de ejecución:
   * Escanear el código QR con la app **Expo Go** desde tu celular (misma red Wi-Fi).
   * Presionar `a` para abrir en el emulador de Android.
   * Presionar `i` para abrir en el simulador de iOS.
   * Presionar `w` para abrir en el navegador web.

---

## 5. Usuarios y Roles de Prueba

| Usuario | Rol Asignado | Permisos y Alcance |
| :--- | :--- | :--- |
| `productor@agropulse.test` | `producer` | Acceso completo: ver mapa, modificar umbrales agronómicos y emitir comandos de riego. |
| `operador@agropulse.test` | `operator` | Operación de campo: ver mapa, modificar umbrales y emitir/cancelar comandos de riego. |
| `asesor@agropulse.test` | `advisor` | Solo lectura: consultar mapas, telemetría e histórico; comandos de riego deshabilitados. |

*Para iniciar sesión en la aplicación, utilizar cualquiera de estos correos junto con la contraseña configurada en Supabase Auth (`<TU_PASSWORD>`).*

---

## 6. Flujos Principales del Sistema

### Flujo de Telemetría (Ingesta y Realtime)
1. El **Simulador** produce mediciones cada 5 segundos a los tópicos `soil.moisture` y `weather.tick`.
2. El **Worker** correlaciona las mediciones mediante un UUID determinístico (v5) con ventana de tolerancia.
3. El **Worker** persiste la lectura en la tabla `readings` mediante la clave `service_role`.
4. **Supabase Realtime** difunde el evento `INSERT` a los clientes móviles conectados.
5. La **App Móvil** actualiza reactivamente el color del semáforo en el mapa, los valores en la lista de lotes y la pantalla de detalle en menos de 3 segundos (RNF-04).

### Flujo de Comandos de Riego (Idempotencia y Acuse)
1. El usuario presiona `ABRIR`, `CERRAR` o `PROGRAMAR` (1-120 min) en el detalle del lote.
2. La app genera un `client_request_id` (UUID v4) e inserta una fila en `irrigation_commands` con estado `pending`.
3. La base de datos valida mediante un índice único que no exista otro comando pendiente para la misma válvula (RF-16).
4. El Worker detecta la orden vía Realtime (o polling de seguridad) y la publica en `txn.commands`.
5. El Simulador consume el comando, simula el tiempo de respuesta físico (1 a 4 s) y publica el nuevo estado en `txn.events` (o `txn.dlq` si simula un fallo).
6. El Worker actualiza la tabla `valves` y pasa el comando a `applied` (o `failed`).
7. La UI móvil refleja el cambio inmediatamente por Realtime sin necesidad de recargar la pantalla.

---

## 7. Pantalla de Diagnóstico Técnico

Accesible desde la pestaña **Cuenta -> Diagnóstico Técnico**:
* Muestra el ID único de usuario y rol.
* Muestra el nombre real de la organización asignada.
* Informa el estado de conexión con Supabase y el estado del canal Realtime (`SUBSCRIBED`).
* Realiza una consulta inicial inmediata filtrada por las estaciones de la organización para no depender de esperar un nuevo tick.
* Calcula en tiempo real el **lag aparente** (`now - measured_at`), recalculado segundo a segundo mediante un timer activo.
* Respeta estrictamente la privacidad y seguridad: **no expone credenciales, tokens ni variables de entorno**.

