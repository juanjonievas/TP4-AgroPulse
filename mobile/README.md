# AgroPulse — Aplicación Móvil (React Native + Expo)

Este directorio contiene el frontend móvil de **AgroPulse**, desarrollado con Expo SDK, TypeScript y Expo Router.

Para consultar la arquitectura general del sistema, los servicios de backend (Supabase, Worker, Simulador) y la configuración de infraestructura con Redpanda, por favor referirse al [README principal en la raíz del proyecto](../README.md).

---

## 1. Requisitos Previos

* Node.js v18+ o v20+ LTS instalado.
* Dispositivo móvil con la aplicación **Expo Go** instalada, o emulador Android / simulador iOS configurado.
* Proyecto de Supabase activo con las migraciones y seed ejecutados.

---

## 2. Configuración de Variables de Entorno

Copiar la plantilla de variables de entorno:

```bash
cp .env.example .env
```

Configurar las variables con las credenciales públicas de Supabase:

```env
EXPO_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=tu-anon-key-publica
```

> **Aviso de Seguridad:**
> Esta aplicación móvil utiliza exclusivamente la **Anon Key** pública combinada con políticas de seguridad a nivel de fila (Row Level Security - RLS) en PostgreSQL. **Nunca** incluir la `SUPABASE_SERVICE_ROLE_KEY` en esta aplicación.

---

## 3. Instalación y Ejecución

1. Instalar las dependencias del proyecto:
   ```bash
   npm install
   ```

2. Iniciar el servidor de desarrollo de Expo:
   ```bash
   npx expo start
   ```

3. Abrir la aplicación:
   * **En dispositivo físico:** Escanear el código QR que aparece en la terminal utilizando la app **Expo Go** (Android) o la Cámara (iOS), asegurándose de estar conectados a la misma red Wi-Fi.
   * **En emulador Android:** Presionar la tecla `a`.
   * **En simulador iOS:** Presionar la tecla `i`.
   * **En navegador web:** Presionar la tecla `w`.

---

## 4. Estructura de Navegación

La aplicación utiliza **Expo Router** con navegación basada en archivos:

* `src/app/_layout.tsx`: Configuración del `Stack` raíz, proveedor de autenticación (`AuthProvider`) y guardias de navegación.
* `src/app/(tabs)/_layout.tsx`: Barra de 4 pestañas principales:
  * **Mapa (`index.tsx`):** Geometría de lotes, polígonos interactivos con semáforo en tiempo real y detección GPS ("Estoy en el lote").
  * **Lotes (`lots.tsx`):** Listado de parcelas con lecturas de humedad, estado de válvulas y tarjetas interactivas.
  * **Alertas (`alerts.tsx`):** Vista de alertas y notificaciones del sistema.
  * **Cuenta (`profile.tsx`):** Información de usuario, rol, establecimiento activo, disclaimer ético y acceso a Diagnóstico.
* `src/app/plot/[id].tsx`: Detalle de parcela, gráfica de histórico de humedad (últimas 6 horas), configuración de umbrales y control de válvulas de riego.
* `src/app/diagnostics.tsx`: Pantalla de diagnóstico técnico (RF-23) con estado de conectividad BaaS, socket Realtime, perimetría y lag aparente calculado en vivo.

---

## 5. Control de Calidad y Tipado

Para validar la consistencia de tipos TypeScript en el frontend:

```bash
npx tsc --noEmit
```
