---
name: Ocorrências no mapa do Radar DC
description: Requisito para exibir ocorrências do dia atual no mapa do Radar.
---

No Radar DC, mostre no mapa as ocorrências georreferenciadas da data selecionada no calendário, usando o símbolo e a cor já associados à natureza. Ao entrar, a data selecionada é o dia local atual; ao navegar para datas anteriores, os marcadores devem acompanhar a seleção. Atualize os marcadores quando as ocorrências forem alteradas. Não invente posição para registros sem coordenadas.

**Why:** O usuário pediu que o mapa acompanhe a data do calendário do Radar DC, inclusive dias anteriores, e mostre o símbolo da natureza da ocorrência.

**How to apply:** Consulte `data_ocorrencia` usando `dataSelecionada`, exiba somente registros com latitude e longitude válidas e reutilize `NATUREZA_ICONE`/`NATUREZA_COR` para manter a mesma legenda visual do mapa principal.
