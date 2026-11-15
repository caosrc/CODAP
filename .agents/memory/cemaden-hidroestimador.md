---
name: Estimativa de chuva CEMADEN
description: Uso e limitações do Hidroestimador GOES publicado no GeoServer do CEMADEN.
---

O GeoServer público do CEMADEN expõe a camada `goes_hidroestimador_0` como imagem WMS de precipitação estimada por satélite. Ela é distinta das leituras observadas dos pluviômetros e da imagem infravermelha de nuvens. O GetCapabilities consultado não publicou um horário da cena para essa camada.

**Why:** Uma estimativa de chuva baseada em satélite ajuda a contextualizar áreas sem pluviômetro próximo, mas sem carimbo da cena não se pode afirmar que a imagem representa chuva ocorrendo neste instante.

**How to apply:** Identifique a camada como estimativa, mantenha as leituras CEMADEN pontuais visíveis e não apresente a frequência de atualização do app como frequência garantida da fonte. Confirme a cadência e o horário do produto com o CEMADEN antes de anunciar tempo real.
