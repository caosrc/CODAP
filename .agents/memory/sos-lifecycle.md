---
name: Ciclo de vida do SOS
description: Regras duráveis para persistência, propagação e confirmação de cancelamentos de SOS.
---

Alertas SOS não expiram por tempo nem podem ser dispensados apenas no dispositivo. O agente que acionou ou qualquer agente que recebeu o alerta pode cancelá-lo; o cancelamento remove o alerta para todos.

**Why:** Agentes que entram depois, inclusive em outro telefone, precisam continuar vendo um SOS não cancelado. Uma remoção local ou TTL pode ocultar um alerta ainda necessário.

**How to apply:** Persistir a criação antes de difundir; não remover da interface nem do banco até o cancelamento global ser confirmado; tratar falha de persistência sem anunciar sucesso. Em WebSocket, confirmar o cancelamento ao iniciador por um evento separado do broadcast, pois a deduplicação pode descartar o eco do mesmo tipo de mensagem.