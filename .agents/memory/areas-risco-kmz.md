---
name: Importação de polígonos KMZ
description: Fluxo de revisão e confirmação antes de salvar contornos importados para áreas de risco.
---

Importar KMZ ou KML carrega um contorno no formulário como rascunho; o agente revisa os dados e confirma o cadastro para persistir a área. Arquivos com vários polígonos permitem selecionar o contorno individualmente.

Para novos cadastros importados, manter o limite de precipitação em 30 mm como valor inicial editável (Interdições ficam em 0), mesmo que o arquivo traga outro valor.

**Why:** Um arquivo geográfico não deve criar registros ou alterar dados persistidos sem a revisão e a confirmação explícita do agente. O usuário pediu 30 mm como padrão de cadastro, para poder ajustar depois.

**How to apply:** Preserve a etapa de revisão no formulário em mudanças ao fluxo de importação, mantenha 30 mm como padrão de precipitação para novos riscos, e permita exportar áreas cadastradas sem gravar rascunhos automaticamente.

## Cadastro manual
O usuário confirmou que o cadastro manual de áreas de risco está funcionando e pediu para mantê-lo assim ao trabalhar no fluxo de importação KMZ.

**Why:** porque o usuário pediu.

**How to apply:** Preserve o fluxo manual de marcar localização, desenhar perímetro e salvar enquanto altera importação ou persistência de KMZ.
