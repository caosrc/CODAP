---
name: Previsão de raios
description: Limite entre a previsão numérica de trovoadas e a detecção de descargas no mapa.
---

O painel de Chuva usa os códigos WMO 95/96/99 do Open-Meteo como previsão de trovoadas e compara ECMWF IFS, GFS Global e DWD ICON Global. O Open-Meteo não informa posição nem contagem de descargas elétricas observadas.

**Why:** Apresentar o código de trovoada como “raio em tempo real” seria enganoso; a chuva observada e a previsão numérica são fontes diferentes.

**How to apply:** Se o produto precisar de descargas ao vivo, integrar uma fonte específica de lightning strikes em uma camada separada, com atribuição e estado de indisponibilidade próprios. Não substituir o consenso dos modelos por essa fonte.