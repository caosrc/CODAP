---
name: Acumulados CEMADEN por catálogo
description: Diferença entre o catálogo de acumulados móveis e a série horária da estação Centro em Conselheiro Lafaiete.
---

O catálogo oficial do CEMADEN (`getJson2.php`) fornece os acumulados móveis da estação Centro (ID 3121), incluindo `acc24hr`. A consulta horária do `MapaInterativoWS` é uma fonte separada e pode falhar mesmo quando o catálogo tem valores válidos. A presença da série horária não deve ser requisito para mostrar os acumulados do catálogo.

**Why:** A função Netlify condicionava a estação à disponibilidade da série horária e escondia 18,31 mm oficiais de 24 h que o catálogo já retornava; o servidor do Replit usava o catálogo corretamente.

**How to apply:** Ao alterar a integração CEMADEN no Netlify ou no servidor Express, mantenha os acumulados do catálogo independentes da série horária. Só use a série horária para gráficos que precisem dos pontos horários.
