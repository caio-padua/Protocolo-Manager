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

## Refinamentos do CEO (28/06/2026)

- **Selo de campo = PALAVRA, não luz.** Cada campo de credencial mostra um selo bevel "Configurado"
  (verde) / "Vazio" (âmbar) na linha do rótulo, para dizer num relance se tem valor sem clicar no
  olho. **Why:** o CEO recusou "tanta luzinha verde"; palavra é mais TOC-clara que cor a decodificar.
- **Honestidade no selo:** dizer "Configurado" (= guardado no cofre), NUNCA "Autenticado/Certificado"
  — o sistema não testa se a chave funciona. Anti-simulação.
- **Não repetir o nome do canal dentro do campo.** Valor com prefixo técnico (ex.: WhatsApp guardado
  como `whatsapp:+...`) exibe só o número via prop `normalize`; o rótulo já diz o canal e o motor de
  envio recoloca o prefixo (`whatsapp.ts` normaliza `startsWith("whatsapp:")`).
- **Luz de vela do cabeçalho fica à DIREITA do nome** (antes colada ao ícone) — melhor concordância.
- **Luz por linha de descrição some no gateway (`ExplainRow noLed`).** O card já tem UMA luz no
  cabeçalho; repetir luzinha por linha vira poluição. `noLed` é prop OPCIONAL — fora do gateway
  (governança, hierarquia, emails…) `ExplainRow` mantém a luz; **nunca** remover globalmente.
- **Faixa de status do cofre SEMPRE presente (`VaultStatusStrip`).** Substitui a antiga caixa
  condicional de "chaves faltando" (que só aparecia em erro e desalinhava os cards). Verde
  "completas" / âmbar "Faltam N". **Why:** posição fixa nos dois cards alinha os campos por uma linha
  horizontal imaginária. Não lista os nomes que faltam — o selo "Vazio" de cada campo já diz qual.
- **Máscara mostra os ÚLTIMOS 6 (era 4) + valor em DESTAQUE.** `mask` em `secure-settings.ts`: valor
  com ≤6 fica todo mascarado (não vaza quase tudo). Legenda "No cofre:" com valor mono/negrito vs
  rótulo discreto. **Why:** o CEO precisava forçar a vista pra ver que havia algo. **Honestidade:**
  expõe 6 chars finais (aceitável — owner-only, e o olho revela tudo).

## Gupshup exige 3 credenciais (não 2)

A API do Gupshup precisa de `apikey` (header), `src.name` (= appName) **e** `source` (número WhatsApp
Business, DDI **sem** "+"). Sem o número de origem não há envio. `isGupshupConfigured` só é true com os
três no cofre; o campo `sourceNumber` (`gupshup.sourceNumber` → env `GUPSHUP_SOURCE_NUMBER`) normaliza
para só dígitos. **Por que importa:** descoberto por pesquisa; o card antes só tinha 2 campos e teria
dado "configurado" sem poder enviar (falsa prontidão). Twilio também tem 3 → ajuda o alinhamento.

## Armadilha de validação (token de colaborador)

Telas com `requireCollaborator` não rendem no navegador do `screenshot` (sessão sem token → GET 401
→ card cai em estado de erro). Para validar visualmente, injetar um token de colaborador no
`localStorage` via o testing/Playwright, ou validar a API por curl com o token no header
`Authorization: Bearer`.
