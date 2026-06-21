# Anamnese V2 — 08 · Lista de Tarefas, Ondas e Teste

> Construir em ONDAS. Cada onda fecha com revisao do architect e teste como paciente E como medico.
> Definicao de pronto: 0 erros, 0 pendencias, testado nos dois papeis.

## 1. Ondas (ordem de construcao)
> Reordenacao apos parecer do architect (21/06/2026): adicionada a O0-hardening; "ordem livre/mapa"
> sobe para a O2 (e base da navegacao); "recusar" fica na O6; modos divididos em O7a/O7b.

| Onda | Entrega | Depende de |
|---|---|---|
| O0 — Hardening e compatibilidade | contrato `valor` jsonb, FK questionRowId, seguranca de token, idempotencia transacional, flag/coexistencia com legado (ver 09) | — |
| O1 — Fundacao de dados | tabelas novas + OpenAPI + endpoints de sessao/answer/refuse/complete + codegen | O0 |
| O2 — Casca + cabecalho + mapa | top bar, 4 medidores, titulo/subtitulo/microtexto, rodape sticky, MAPA de grupos + ordem livre (navegacao base) | O1 |
| O3 — Motor de paginas + ramificacao | 1 grupo=1 pagina que vira, porteiras (real+sintetica), colapso, alarmes sempre visiveis | O2, spec 03 |
| O4 — Controles ricos | sim/nao cartao, multipla tappable, dial de intensidade direcional, stepper, queixa livre | O3 |
| O4b — Aceleradores + Surpresas | A1,A2,A3,A4,A6,A7 (auto-avanco, pre-preench. com whitelist, teclado, foco, tempo vivo, selo salvo) + S1,S3,S4,S6 (voz, boneco do corpo, Rajada, marcos) — ver 10 | O4 |
| O5 — Explicacao + video | HelpModal por pergunta, video nas dificeis, config por perguntaId; + S2 (leitura em voz alta) e S7 (Modo Conversa) | O4 |
| O6 — Liberdade (pular/recusar) | pular e voltar, recusar bloco (registro + selo no mapa); + A5 (Salto inteligente) | O2 |
| O7a — Modo paciente (link) | gerar/abrir link, retoma, perfis de pre-preenchimento | O1, O6 |
| O7b — Cockpit enfermeira/medico | enfermeira(conduzir + observacao por grupo), medico(atalho rapido) | O7a |
| O8 — Diagnosticado/Suspeito + findings | adapter pos-motor grava findings ao concluir, tela do medico separando os dois; Gemeo de Saude ao vivo (S5, visual) | O1, O3 |
| O9 — Matriz de medicacao | linha remedio x manha/tarde/noite x doenca (Kaizen 07) | O4 |
| O10 — Relatorios | RAS de relatorio (PDF+Drive) + relatorio juridico + motor de sugestoes | O8, O9 |
| O11 — Pack | exportar skills/specs para paxter-pack | todas |

## 2. Criterio de aceite por onda (resumo)
- O1: criar sessao via curl, salvar resposta, retomar por token, registrar recusa, concluir.
- O2/O3: virar paginas sem rolar; porteira fechada nao conta no "N de N"; alarme sempre a mostra.
- O4: cada controle salva o valor certo (data binding) e a direcao da barra concorda.
- O5: modal abre, video sem autoplay com legenda.
- O6: recusa aparece no mapa, no banco e (depois) no relatorio.
- O7: link abre e retoma; atalho do medico preenche rapido; perfil de teste popula.
- O8: concluir gera findings diag/susp corretos para um perfil conhecido.
- O9: matriz salva dose/quantidade por periodo + doenca ligada.
- O10: PDF gera, sobe ao Drive, e o juridico lista recusas/consentimento.

## 3. Plano de teste (dois papeis)
- COMO PACIENTE (empresario apressado): abrir link, responder rapido, pular um bloco, recusar
  outro, fechar e reabrir (retoma), concluir; conferir que e leve e claro.
- COMO MEDICO: gerar link, usar atalho de pre-preenchimento, ver findings diag/susp, gerar RAS
  de relatorio e juridico, conferir recusas.
- Validar por runtime/curl + screenshots (typecheck global do PADCOM e pre-quebrado; usar
  `pnpm --filter @workspace/padcom run typecheck` e `--filter @workspace/api-server run typecheck`).

## 4. Autocritica antes de entregar (checklist)
- [ ] Virou pagina, nao rolou? [ ] Direcao da barra obvia? [ ] Toda pergunta explicada?
- [ ] Recusa registrada e visivel? [ ] Retoma funcionou? [ ] Link abriu? [ ] Findings certos?
- [ ] Design Paxter 3D + Grade Imaginaria? [ ] Motor intocado? [ ] 0 erro de typecheck por pacote?

RESUMO EM 1 LINHA: 11 ondas com aceite objetivo, teste como paciente e como medico, e revisao do
architect a cada onda — so entrego com 0 erro e 0 pendencia.
