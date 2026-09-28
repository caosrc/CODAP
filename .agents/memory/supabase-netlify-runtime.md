---
name: Supabase em funções Netlify
description: Configuração de variáveis e fallback para funções Netlify que usam o Supabase.
---

Quando uma função Netlify informar que o Supabase não está configurado, não presuma que as variáveis usadas no build do Vite estejam disponíveis no runtime da função. Para tabelas públicas com RLS correto, o frontend pode ler e gravar diretamente com a chave anon, enquanto as variáveis de runtime devem ser configuradas separadamente para manter as funções independentes.

**Why:** A configuração de build do frontend e o ambiente de execução de funções serverless podem ter disponibilidades diferentes; um fluxo que funciona no navegador pode falhar apenas na função.

**How to apply:** Mantenha `VITE_USE_SUPABASE`, `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` coerentes no build. Configure também `SUPABASE_URL` e `SUPABASE_ANON_KEY` no runtime da hospedagem de funções, sem usar service-role no navegador.