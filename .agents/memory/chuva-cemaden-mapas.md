---
name: Chuva CEMADEN nos mapas
description: Requisito de produto para exibição das estações meteorológicas nos mapas operacionais.
---

O endpoint e as camadas “Chuva” de Mapa e Radar DC devem incluir somente as estações CEMADEN de Conselheiro Lafaiete, nunca o catálogo estadual completo. Nos mapas, mostre apenas o valor da precipitação sobre cada ponto — sem caixas persistentes com nomes. Leituras atrasadas ou ausentes aparecem como “—”, nunca como zero.

**Why:** O usuário pediu somente as estações de Conselheiro Lafaiete, e que as visualizações mostrem as bolinhas e valores de precipitação sem quadrinhos persistentes com nomes.

**How to apply:** Filtre pelo município na resposta da API antes de expor os dados ao app; mantenha as estações, totais e leituras limitados a Conselheiro Lafaiete. Reserve nomes e detalhes para popups abertos ao clicar. Dado ausente ou antigo não deve parecer uma medição atual.
