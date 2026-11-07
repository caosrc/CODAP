---
name: Coordenadas CEMADEN nos mapas
description: Fonte confiável das coordenadas dos pluviômetros CEMADEN de Lafaiete.
---

As respostas de monitoramento horário do CEMADEN incluem coordenadas e metadados das estações pluviométricas. Prefira esses dados do próprio CEMADEN a um geosserviço externo como dependência obrigatória da consulta.

**Why:** O geosserviço externo de Minas Gerais pode expirar ou ficar indisponível mesmo quando o catálogo e as leituras horárias do CEMADEN respondem normalmente; se a consulta de geografia for obrigatória, todas as estações desaparecem do mapa.

**How to apply:** Ao carregar pluviômetros CEMADEN, obtenha latitude, longitude, código e nome do payload da estação. Trate qualquer fonte geográfica complementar como opcional e mantenha o filtro de município antes de expor os dados.
