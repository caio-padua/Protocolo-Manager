---
name: Card de gateway padrão + olho que revela segredo
description: Decisão do Padrão 18 (card de integração) e a regra do "olho" que revela o valor real do cofre. O detalhe técnico vive na skill skill-layout-paxter (Padrão 18).
---

# Card de integração/gateway — Padrão 18

Modelagem de card de ferramenta/integração travada pelo CEO em 28/06/2026 (começou por
Twilio/Gupshup; replicar nas demais telas de ferramenta). O DETALHE (zonas, componentes, classes,
tamanhos de ícone) é derivável do código e está documentado na skill
`skill-layout-paxter/SKILL.md` (Padrão 18) — não duplicar aqui.

## Olho que revela o valor REAL do cofre

**Regra:** o dono logado tem direito de VER o próprio segredo (analogia do CEO: "ver meu próprio
RG"). Cada campo de credencial tem um olho; ao clicar, busca o valor real e preenche o input.

**Why:** o Art. 65 (GET só devolve máscara) protege contra VAZAMENTO sem login / exposição pública —
não impede o dono autenticado de ver o próprio dado. Revelar sob ação explícita + login não fere o
espírito da regra. O valor nunca trafega por padrão; só sob clique, por rota protegida igual à
gravação.

**How to apply:** ao replicar para outra ferramenta, criar a rota de revelação análoga com a MESMA
proteção da gravação (não inventar proteção mais fraca), registrar log de auditoria do evento (ator,
provider, campos — NUNCA o valor) e jamais devolver o valor num GET de status.

## Decisão em aberto (levada ao CEO)

Autorização da revelação é só "logado vs não" (igual ao resto do app, single-tenant). O architect
sugeriu gate por papel (só adm/tech) + auditoria. Auditoria foi feita; o gate por papel ficou como
decisão do CEO porque conflita com a regra "dono vê o próprio segredo" e com o modelo single-tenant
do app inteiro (ver `admin-api-sem-auth.md`).

## Armadilha de validação (token de colaborador)

Telas com `requireCollaborator` não rendem no navegador do `screenshot` (sessão sem token → GET 401
→ card cai em estado de erro). Para validar visualmente, injetar um token de colaborador no
`localStorage` via o testing/Playwright, ou validar a API por curl com o token no header
`Authorization: Bearer`.
