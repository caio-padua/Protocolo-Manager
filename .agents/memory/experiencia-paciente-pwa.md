---
name: Experiência do Paciente — glow de estado, PWA e anamnese humanizada
description: Lições da onda PWA do PADCOM — linguagem de estado (glow), service worker só em produção, filtro condicional de sexo, modo teste.
---

# Onda Experiência do Paciente (PADCOM / Padcon Conect)

## Glow = linguagem de estado, não decoração
- Regra durável (Art. 62 do Código Paxter, seção da skill `skill-layout-paxter`): brilho só acende em
  ESTADO REAL (atenção=âmbar, atraso/crítico=vermelho, sucesso=verde, info/foco=ciano) ou hover desktop.
- **Por quê:** o CEO reclamou de "luzes muito expandidas" — glow global vira ruído e mata o relevo 3D.
- **Como aplicar:** no celular nunca depender de hover (guarda `@media (hover:none)`); calibrar só a LUZ
  (blur/alcance/opacidade), nunca o bevel; reusar classes existentes antes de criar nova.

## Service worker (PWA) só em produção-like
- Registrar o SW apenas sob `import.meta.env.PROD`; em `vite dev` NÃO registrar.
- **Por quê:** em dev o SW cacheia o app shell e atrapalha o hot-reload (R16 da spec). Em dev o registro
  não roda, então não dá para "ver" o SW ativo no preview — isso é esperado, valida-se servindo `/sw.js`
  e `/manifest.webmanifest` (200) e no build de produção.

## Filtro condicional de sexo não pode esconder antes da âncora responder
- Pergunta com `aplicavelEm.sexo` só some quando o sexo (resposta de A04) é CONHECIDO e diverge.
- **Por quê:** antes de A04 ser respondida o sexo é `undefined`; esconder nesse momento trava/esvazia o
  fluxo. Guardar com `if (ap?.sexo && sexo && sexo !== ap.sexo) return false;` (o `&& sexo` é o conserto).
- Mesma lógica vale para qualquer skip-logic por âncora ainda não respondida: ausência ≠ negação.

## Modo teste / demonstração visível
- `VITE_OPEN_ACCESS="1"` (default off) liga acesso aberto + faixa âmbar "MODO TESTE"; sessão de
  demonstração (sem `portalToken`) mostra faixa "MODO DEMONSTRAÇÃO". Sinal visível evita PII de teste
  ser confundida com cliente real.

## Verificação desta onda
- Typecheck global do repo é pré-quebrado: validar por restart + caminhada e2e (subagente Playwright),
  não por `tsc`. e2e cobre: entrada demo, caixa de ajuda (observação), escala com rótulos de texto,
  multiseleção exclusiva ("nunca/nenhum"), scroll-to-top, troca de sexo em A04 sem quebrar.
