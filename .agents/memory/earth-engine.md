---
name: Google Earth Engine
description: Requisitos para o monitoramento MODIS territorial de incêndios.
---

O monitoramento MODIS via Google Earth Engine depende de autenticação local da conta no ambiente que executa o servidor; a biblioteca instalada sozinha não autoriza o projeto.

**Why:** Sem uma sessão autenticada, a consulta ao catálogo e ao polígono municipal falha antes de retornar focos.

**How to apply:** Antes de investigar falhas de dados do Earth Engine, validar a autenticação e o projeto configurado. Manter o FIRMS como fonte complementar para o app continuar funcionando sem Earth Engine.