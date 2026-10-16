---
name: Alertas de áreas de risco
description: Como o Radar DC compara a chuva prevista com o limite individual de cada área de risco.
---

Cada área mantém seu próprio limite em milímetros e é comparada com a soma da precipitação horária prevista para as próximas 24 horas no ponto de referência georreferenciado. O alerta acende quando a previsão é estritamente maior que o limite.

A previsão é estimativa numérica do Open-Meteo para o ponto indicado, não uma observação de chuva nem uma medição precisa em toda a extensão do polígono.

**Why:** A previsão geral do município não distingue riscos em locais diferentes; a consulta por coordenada permite manter limites e alertas independentes, sem confundir previsão com chuva observada.

**How to apply:** Se alterar a janela, a fonte ou a comparação do alerta, mantenha o valor previsto junto da área e deixe explícito na interface que se trata de previsão, não de medição observada.
