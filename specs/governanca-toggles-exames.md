# SPEC canônica — Governança dos interruptores de exames e visibilidade na Área do Cliente

Estado: fatia 1 concluída (baseline + causa-raiz). Fatias 2 a 5 pendentes (ver backlog).
Tela única: Cadastros → Configuração de Exames (`/cadastros/config-exames`). Proibido criar interruptor duplicado em outra tela.
Gravação: rota `PUT /api/settings/exames`, somente proprietário da plataforma, clínica vinda da sessão (nunca do corpo).

## 1. Baseline (17/11/2026)

| Item | Valor |
|---|---|
| Ramo | `homologacao/paxmed-modelo-2b` |
| HEAD no início da fatia | `2c542379` |
| Commits relevantes | `5b6255e1` (interruptor preliminar), `2c542379` (verificação retroativa) |
| Ambiente | prévia de desenvolvimento, clínica 5 (Instituto Padua) |

## 2. Matriz dos interruptores

| Nome na tela | Chave no banco | Padrão | Escopo hoje | Efeito | Fora do efeito |
|---|---|---|---|---|---|
| Exigir validação humana | `exames.exigirValidacaoHumana` | ligado | global (sem clínica) | evolução do profissional autenticado | Área do Cliente (sempre só C2 sem o interruptor preliminar) |
| Exibir resultados preliminares na Área do Cliente | `exames.exibirResultadosPreliminaresAreaCliente.empresa.<id>` | desligado | clínica | portal do próprio cliente vê `recebido`/`conferido_1` com identidade confirmada, rotulado PRELIMINAR | PDF, exportação, prescrição, análise clínica, C1/C2, identidade |
| Triagem ativa | `exames.triagemAtiva` | conforme tela | global | fila de triagem de analitos | visibilidade |
| Criar descoberto automaticamente | `exames.autoCriarDescoberto` | conforme tela | global | catálogo | visibilidade, identidade |
| Absorver apelido de alta confiança | `exames.autoAbsorverApelidoAltaConfianca` | conforme tela | global | catálogo | identidade |
| IA Gemini / Claude / OpenAI ativas | `exames.llmGeminiAtivo`, `exames.llmClaudeAtivo`, `exames.llmOpenaiAtivo` | conforme tela | global | quais leitores rodam (extração independente, sem hierarquia implementada) | identidade, visibilidade |

Pendência de governança: os interruptores globais não são por clínica. Isso é aceitável só enquanto houver uma clínica produtiva; a fatia 4 define a migração para escopo por clínica.

## 3. Invariantes (nenhum interruptor pode violá-los)

1. Identidade não confirmada (`quarentena`, `contradicao`, `revisao`, ausente) nunca vai à evolução do cliente.
2. Clínica e cliente do documento, do resultado e da sessão precisam coincidir.
3. Interruptor desligado = comportamento anterior (somente `conferido`/C2).
4. Preliminar nunca é tratado como C2 e nunca alimenta PDF, prescrição ou conduta.
5. Configuração ausente, ilegível ou de outra clínica vale desligado.
6. Cada gravação registra autor, valor anterior, valor novo, clínica e horário em `collaborator_audit`.

## 4. Cadeia ponta a ponta e causa-raiz do caso Dayana

```
Tela config-exames --PUT /settings/exames--> app_settings[chave por clínica] (auditoria 265)
Portal /area --GET /area-paciente/exames/evolucao--> ownClient(clínica do cliente)
  -> lerVisibilidadePreliminarExames(clínica) -> handleEvolucao(permitirPreliminaresPortal)
  -> filtro: status em (recebido, conferido_1, conferido) E cliente E clínica
             E (conferido OU identidade confirmada em exam_identity_checks)
```

Verificado: tela, rota, banco e portal usam a mesma chave e a mesma clínica (5). Sem cache de consulta no portal (fetch direto a cada 4 segundos).
Causa-raiz: os documentos 682 e 683 foram extraídos antes de existir o porteiro de identidade. Tinham resultados, mas nenhuma linha `verificacao` em `exam_identity_checks`. O filtro exige essa linha, então eles ficavam ocultos, e o portal não explicava o motivo. O documento 685 ficou preso em `processando` (recuperação automática bloqueada de propósito).
Correção da fatia 1: script `verificar-identidade-retroativa.ts` (sem IA). Resultado: 683 confirmado; 682 contradição (CPF e nascimento divergentes), retido.

## 5. Backlog por fatia (PAXTERLOOP)

| Fatia | Conteúdo | Critério de aceite |
|---|---|---|
| 2 | Política única de visibilidade no servidor; motivo visível quando documento é retido ("identidade não conferida", "em quarentena"); aplicar a download e exportação | testes de tabela verdade OFF/ON por clínica; PDF segue C2 |
| 3 | Serviço único de identidade com decisões `MATCH_CONFIRMED`, `MATCH_WITH_VARIATION`, `NEEDS_REVIEW`, `MISMATCH_QUARANTINE` e códigos de motivo; tela de quarentena com nome (meio abreviado), 4 primeiros dígitos do CPF e data completa; documentos legados verificados no upload e na leitura | casos sintéticos: Caio na sessão Dayana, Dayana x Daiana com CPF igual, CPF divergente, nascimento divergente, partículas, ausências |
| 4 | Isolamento A/B de clínicas e pacientes em cada consulta; interruptores globais por clínica | mesma pessoa em duas clínicas não vaza |
| 5 | Playwright em computador e celular; propriedades; relatório de aceite | tudo verde com fixtures sintéticas |
