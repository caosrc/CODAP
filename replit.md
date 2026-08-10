# Defesa Civil Ouro Branco — App de Gerenciamento de Ocorrências

## Run & Operate
- **Development + Production**: `npm install && npm run build && node server/index.js`
- The Express server builds the Vite frontend and serves everything on **port 5000**
- `npm run dev` — Vite dev server (port 5000) with proxy to Express on port 3001 (dev only)
- `npm run build` — build frontend for production only

Required env vars (all set in Replit shared env / secrets):
- `DATABASE_URL` — Replit PostgreSQL (auto-provisioned; do not set manually)
- `VAPID_PUBLIC_KEY` — VAPID public key (shared env var, already set)
- `VAPID_PRIVATE_KEY` — VAPID private key (**secret** — needed for push notifications)
- `VAPID_SUBJECT` — mailto: contact for VAPID (already set)
- `PORT` — Express server port (set to 5000)
- `VITE_USE_SUPABASE` — set to `false` (disables Supabase; Express+PostgreSQL is the primary backend)
- `NODE_ENV` — set to `production`
- `EARTH_ENGINE_SERVICE_ACCOUNT_JSON` — Secret containing the complete Google Cloud service-account JSON key
- `EARTH_ENGINE_PROJECT` — optional Earth Engine/Google Cloud project ID; when omitted, uses the `project_id` from the JSON key

## Stack
- **Frontend**: React 19 + TypeScript + Vite
- **Backend**: Express 5 + Node.js 20 + native WebSocket (`ws`) — port 5000
- **Database**: Replit PostgreSQL — schema auto-created by `initDb()` on server startup
- **Push Notifications**: Web Push (VAPID) via `web-push` on Express server
- **Maps**: Leaflet + react-leaflet (tiles proxied via `/api/tiles`)
- **Incêndios ativos**: NASA FIRMS + Google Earth Engine (MODIS Terra, MODIS Aqua e VIIRS), exibidos como focos no mapa

## Where things live
- `server/index.js` — Express API + WebSocket server + DB init (`initDb`)
- `src/api.ts` — CRUD for ocorrências (Express primary, Supabase disabled)
- `src/matApi.ts` — CRUD for materiais/emprestimos/campo (Express primary)
- `src/supabaseClient.ts` — Supabase client; `supabaseDisponivel=false` on Replit (VITE_USE_SUPABASE=false)
- `src/wsClient.ts` — WebSocket client (connects to /ws)
- `src/pushNotifications.ts` — Web Push subscription via Express `/api/push-subscriptions`
- `src/components/` — React components per feature
- `src/offline.ts` — IndexedDB offline queue + cache
- `public/sw.js` — Service Worker (PWA, map tile cache)
- `attached_assets/` — report template (.docx)

## Architecture on Replit
- **Express + Replit PostgreSQL** is the unified data store (`VITE_USE_SUPABASE=false`)
- Supabase code is present for Netlify fallback but completely inactive on Replit
- DB tables auto-created on server startup — no separate migration step needed
- In production, Express serves the built `/dist` frontend directly on port 5000
- Vite dev server (port 5000) proxies `/api` and `/ws` to Express (port 3001) in dev mode only

## Product
- Register and manage civil defense incidents with photos and GPS
- Real-time team tracking via WebSocket
- SOS alert system with Web Push notifications
- Agent schedule and hour bank management (escala)
- Vehicle checklist
- Materials, loans, and field equipment tracking (patrimônio)
- Inspection report generation (DOCX)
- KMZ/KML and Excel export
- Offline mode with sync queue (IndexedDB)

## User preferences
- App is mobile-first PWA for field teams
- Portuguese (pt-BR) UI

## Gotchas
- `VITE_USE_SUPABASE=false` must remain set — this disables Supabase and routes all data through Express
- DB tables auto-created on server startup — no separate migration step needed on Replit
- Production: `npm run build && node server/index.js` — Express serves built `/dist`
- Push notifications require `VAPID_PRIVATE_KEY` secret to be set in Replit secrets
- Earth Engine requires the service account to have Earth Engine access and the `Service Usage Consumer` role on the Google Cloud project
- O monitoramento do Earth Engine usa apenas `FireMask >= 7` nos últimos 3 dias; não interpreta chuva, radar, vegetação ou cicatriz de queimada como incêndio ativo

## Pointers
- DB schema: `server/index.js` → `initDb()` function
- matApi methods: `src/matApi.ts`
- Push flow: `src/pushNotifications.ts` → Express `/api/push-subscriptions` → `/api/send-sos-push`
- WS events: `server/index.js` → `wss.on('connection')` handler
