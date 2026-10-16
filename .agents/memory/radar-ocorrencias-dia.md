---
name: Ocorrências no mapa do Radar DC
description: Requisito para exibir ocorrências do dia atual no mapa do Radar.
---

Ao abrir o Radar DC, mostre no mapa as ocorrências georreferenciadas cuja data de ocorrência corresponde ao dia local atual, usando o símbolo e a cor já associados à natureza. Atualize os marcadores quando as ocorrências forem alteradas. Não invente posição para registros sem coordenadas.

**Why:** O usuário pediu que as ocorrências do dia atual apareçam no mapa do Radar DC com o símbolo do tipo da ocorrência.

**How to apply:** Consulte `data_ocorrencia` para o dia local corrente, exiba somente registros com latitude e longitude válidas e reutilize `NATUREZA_ICONE`/`NATUREZA_COR` para manter a mesma legenda visual do mapa principal.
