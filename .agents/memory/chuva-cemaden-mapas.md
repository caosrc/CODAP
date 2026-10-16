---
name: Chuva CEMADEN nos mapas
description: Requisito de produto para exibição das estações meteorológicas nos mapas operacionais.
---

As camadas “Chuva” de Mapa e Radar DC mostram pontos CEMADEN de Conselheiro Lafaiete, com apenas o valor da precipitação sobre cada ponto — sem caixas persistentes com nomes. Leituras atrasadas ou ausentes aparecem como “—”, nunca como zero.

**Why:** O usuário pediu que as duas visualizações mostrem somente as bolinhas e os valores de precipitação, sem os quadrinhos brancos com nomes.

**How to apply:** Ao alterar as camadas, mantenha os marcadores e etiquetas numéricas sem fundo; reserve nomes e detalhes para os popups abertos ao clicar. Dado ausente ou antigo não deve parecer uma medição atual.
