---
name: Anamnese — acesso do paciente e revisão do colaborador
description: Como amarrar sessão pública ao cliente sem IDOR e por que GETs de PII clínica precisam de requireCollaborator explícito.
---

# Amarração segura de fluxo público ao cliente (anti-IDOR)

Regra: em qualquer fluxo PÚBLICO do paciente (anamnese v2, portal), o `client_id` da entidade
criada vem SOMENTE de um token verificado no servidor (portal token HMAC de `POST /api/client-portal/identify`,
verificado por `verifyPortalToken`), NUNCA de um número cru no corpo da requisição.

**Why:** aceitar `clientId` cru do corpo num endpoint público é IDOR (Insecure Direct Object Reference):
qualquer um amarraria a sessão a outro cliente. Validado por curl: com `clientId` cru no corpo e sem
token, o `client_id` gravado é `null`.

**How to apply:** ao criar endpoint público que toca uma entidade do cliente, ignore `clientId`/ids do corpo;
derive a identidade do token verificado. Token inválido/expirado → 401. O portal token (TTL ~30min) é o
mecanismo canônico de identificação do cliente para fluxos públicos neste repo.

# GET de PII clínica exige requireCollaborator explícito

Regra: o guard global de colaborador (`collaboratorGuard`) só intercepta ESCRITAS. Endpoints GET que
expõem PII clínica (achados/diagnósticos/recusas da anamnese) precisam carregar `requireCollaborator`
EXPLÍCITO por rota, senão ficam abertos.

**Why:** o app é single-tenant e os routers admin não têm authz por design (ver `admin-api-sem-auth.md`),
mas dados clínicos sensíveis de revisão são exceção e devem ser fechados por colaborador autenticado.

**How to apply:** ao adicionar GET que retorna PII clínica, anexe `requireCollaborator` na rota. Token de
colaborador é HMAC com `SESSION_SECRET`, escopo `collab`, payload `collab:{id}:{role}:{exp}`, TTL 12h —
dá para mintar um token válido em teste com a mesma assinatura para validar a query (não só o 401).

# Cuidado ao editar linha de import compartilhada

Ao reescrever um `import { ... } from "drizzle-orm"` para adicionar símbolos, não derrube um símbolo
ainda usado em outro handler do mesmo arquivo (ex.: `isNotNull` no `bootstrap-status`) — some sem erro de
typecheck visível no fluxo e estoura 500 em runtime numa rota não relacionada.
