---
name: Bootstrap do sandbox
description: Inicialização e isolamento de previews Vite em artefatos
---

O workflow de um artefato isolado não deve depender das dependências instaladas pelo aplicativo principal; a própria inicialização do serviço precisa preparar o `node_modules` do artefato.

**Why:** O workflow do sandbox pode iniciar sem executar o `npm install` do projeto raiz, fazendo comandos locais como `vite` falharem mesmo quando o pacote está declarado corretamente no `package.json`.

**How to apply:** Ao configurar ou recuperar um preview de artefato, mantenha o bootstrap de dependências no comando do serviço e use `--no-package-lock` quando essa for a convenção do workspace.

Ao extrair componentes que usam React Leaflet para uma prévia isolada, não importe a biblioteca do `node_modules` raiz se o sandbox usa outra cópia do React. Quando o mapa real não fizer parte da revisão visual, use stubs locais apenas na prévia; para testar interações de mapa, alinhe as dependências para compartilhar a mesma instância de React.

**Why:** A mistura de cópias de React causou `Invalid hook call` dentro do preview, embora a aplicação principal continuasse correta.

**How to apply:** Isole os stubs no diretório do mockup e mantenha intactos os imports do componente principal.