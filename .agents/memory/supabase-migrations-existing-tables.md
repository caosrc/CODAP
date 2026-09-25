---
name: Migrações Supabase idempotentes
description: Como manter tabelas Supabase antigas compatíveis com funções REST que fazem upsert.
---

Quando uma migração usa `CREATE TABLE IF NOT EXISTS`, ela também precisa conter `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, índices/chaves e permissões para corrigir tabelas que já existiam.

**Why:** `CREATE TABLE IF NOT EXISTS` não atualiza a estrutura de uma tabela existente; funções REST podem continuar falhando por coluna, chave única ou RLS ausentes mesmo quando a tabela aparece nas consultas.

**How to apply:** Em cada migração Supabase usada por Netlify, trate criação, compatibilidade de colunas, conflito do upsert, RLS e `GRANT` como etapas separadas e repetíveis.