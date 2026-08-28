---
name: Radar de chuva
description: Decisão e limitações das fontes de precipitação usadas no mapa.
---

O mapa usa RainViewer para os quadros observados de radar meteorológico, com atribuição visível e cache de metadados no servidor. A API pode não ter SLA e deve ser tratada como fonte complementar.

**Why:** RainViewer é uma fonte pública sem chave que entrega tiles compatíveis com Leaflet; o produto GOES-16 RRQPE é NetCDF e não pode ser tratado como um tile pronto no navegador.

**How to apply:** Se for adicionada uma camada de nuvens GOES-16 ou RRQPE, criar um pequeno serviço de processamento geoespacial separado, gerar raster/tiles recortados para Ouro Branco e manter RainViewer como comparação/contingência.