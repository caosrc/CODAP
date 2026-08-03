---
name: Stack e arquitetura
description: Stack técnica, configuração do ambiente Replit, e decisões de backend/frontend.
---

## Stack
- Frontend: React 19 + TypeScript + Vite
- Backend: Express 5 + Node.js 20 + WebSocket (`ws`) — porta 5000
- Banco primário: Replit PostgreSQL (auto-provisionado)
- Supabase: usado como fonte de dados real (VITE_USE_SUPABASE=true em shared env)

## VITE_USE_SUPABASE — IMPORTANTE
**Deve ser `true`**. O banco PostgreSQL local (Replit) está vazio — todos os dados reais (ocorrências, fotos, etc.) estão no Supabase. Alterar para `false` quebra o app.

**Why:** O projeto foi importado do GitHub com dados já em Supabase. O replit.md diz `false`, mas isso está desatualizado — o usuário usa Supabase como fonte de dados.

**How to apply:** Sempre manter `VITE_USE_SUPABASE=true` em shared env. Nunca mudar para `false`.

## npm install
- `npm install` falha com "Invalid Version" por entradas `@esbuild` com versão vazia no `package-lock.json`.
- Workaround obrigatório: `npm install --no-package-lock --silent`.

## Export Excel — Fotos
- Fotos das ocorrências são base64 no Supabase (`data:image/jpeg;base64,...`).
- Buscar fotos pelo browser direto do Supabase pode falhar por CORS.
- Solução implementada: endpoint `/api/ocorrencias/fotos-supabase-lote?ids=...` no servidor busca do Supabase REST API server-side e retorna base64 pronto.
- `buscarFotosOcorrencias` em `src/api.ts` tenta esse endpoint primeiro (sem CORS), com fallback para Supabase direto e depois PostgreSQL local.
- Proxy de imagens também disponível em `/api/proxy-imagem?url=...` para URLs do Supabase Storage.
