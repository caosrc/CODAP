---
name: Google Earth Engine
description: Requisitos para o monitoramento MODIS territorial de incêndios.
---

O monitoramento MODIS via Google Earth Engine depende de autenticação local da conta no ambiente que executa o servidor; a biblioteca instalada sozinha não autoriza o projeto.

**Why:** Sem uma sessão autenticada, a consulta ao catálogo e ao polígono municipal falha antes de retornar focos.

**How to apply:** Antes de investigar falhas de dados do Earth Engine, validar a autenticação e o projeto configurado. Manter o FIRMS como fonte complementar para o app continuar funcionando sem Earth Engine.

No Replit, a autenticação por conta de serviço usa o Secret `EARTH_ENGINE_SERVICE_ACCOUNT_JSON` e a biblioteca Python instalada no ambiente `.pythonlibs`. A conta também precisa da permissão `serviceusage.services.use` (papel `Service Usage Consumer`) no projeto do Google Cloud, além do acesso ao Earth Engine.

**Why:** A chave pode estar válida e ainda assim a API retornar “Caller does not have required permission to use project” antes de consultar o catálogo.

**How to apply:** Se a biblioteca e o Secret estiverem funcionando, conferir IAM do projeto e habilitação/acesso do Earth Engine no Google Cloud antes de alterar o código.