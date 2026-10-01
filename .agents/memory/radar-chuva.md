---
name: Radar de chuva
description: Decisão e limitações das fontes de precipitação usadas no mapa.
---

O mapa usa RainViewer para os quadros observados de radar meteorológico, com atribuição visível e cache de metadados no servidor. A API pode não ter SLA e deve ser tratada como fonte complementar.

**Why:** RainViewer é uma fonte pública sem chave que entrega tiles compatíveis com Leaflet; o produto GOES-16 RRQPE é NetCDF e não pode ser tratado como um tile pronto no navegador.

**How to apply:** Se for adicionada uma camada de nuvens GOES-16 ou RRQPE, criar um pequeno serviço de processamento geoespacial separado, gerar raster/tiles recortados para a área de interesse e manter RainViewer como comparação/contingência.

## Cadência e horário dos quadros RainViewer
- A API pública `weather-maps.json` publica quadros `radar.past` em passos de 10 minutos. O `time` representa a geração do quadro, não o instante exato da observação de chuva.

**Why:** A frequência de consulta do aplicativo não pode remover a latência/cadência da fonte, e exibir o timestamp do quadro como início exato da chuva cria uma impressão de precisão que os metadados não oferecem.

**How to apply:** Diferencie no mapa o horário de geração do quadro e a frequência de consulta do app. Para reduzir o atraso de origem abaixo de 10 minutos, avalie uma fonte de radar regional com atualização mais frequente.

Para a camada visual de nuvens no mapa, o app pode usar o serviço público NOAA/NNVL de imagens infravermelhas diárias do GOES como fonte XYZ padrão; isso é separado do produto RRQPE.

**Why:** O serviço NOAA já entrega tiles HTTPS compatíveis com Leaflet, enquanto o RRQPE continua sendo um produto NetCDF que exige processamento próprio.

**How to apply:** Manter a URL NOAA como padrão funcional e permitir substituição por variável de ambiente quando a equipe precisar de outra fonte ou de um serviço próprio.