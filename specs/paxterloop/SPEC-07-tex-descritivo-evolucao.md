# SPEC 7 — TEX: Descritivo de Evolução de Exames

Estado: EM EXECUÇÃO (fatia 1 de 5 pronta e testada). Não HOMOLOGADO. Data: 16/11/2026.

## Fatias
| Fatia | Conteúdo | Estado |
|---|---|---|
| 1 | Gerador do PDF único (retrato/paisagem, blocos, identidade 2B) a partir da evolução existente | TESTADO (puro/MOCK, 11 testes + 2 PDFs renderizados) |
| 2 | Rota interna `GET /tex/cliente/:clientId/pdf` (equipe, gratuita; clínica da sessão; 404 de outra clínica; 409 se houver resultado não conferido, prévia só com `previa=1`; 422 sem identidade validada; log sem dado clínico) | TESTADO (MOCK, 6 testes) |
| 2b | Rota do portal por token, URL temporária, auditoria persistente, assinatura/QR do médico | PENDENTE (depende das fatias 3 e 4) |
| 3 | Tabela de pedidos TEX + configuração comercial (ativação desligada, preço editável sugerido R$ 79,00, isenção por categoria, histórico de versões, consentimento) — migração aditiva | PENDENTE |
| 4 | Cobrança pelo Asaas existente (somente sandbox/mock), idempotente, liberação pelo webhook existente, novo download sem nova cobrança | PENDENTE |
| 5 | Botão "TEX · PDF de evolução" + alternância "Últimas 5 coletas"/"Histórico completo" no painel compartilhado (Cockpit e Área do Cliente, celular) | PENDENTE |

## Decisões da fatia 1
1. Fonte única: `montarEvolucao(clientId)` extraída de `handleEvolucao` em `routes/exames-lab.ts`. A tela e o PDF leem a mesma função; nenhuma base paralela. A resposta ganhou campos aditivos por célula (`unitRaw`, `refLow`, `refHigh`) e `zonesSource`.
2. Identidade visual: Modelo 2B do receituário (cabeçalho Instituto Pádua, rodapé PAXMED, EB Garamond). O gerador do cabeçalho/rodapé passou a aceitar A4 paisagem, centralizado e sem mudar proporção; retrato inalterado (68 testes de receituário/PAXMED passam).
3. Qual modelo é o vigente em produção: NÃO verificado. O código usa o 2B porque é o padrão decidido ("Modelo clínico PAXMED padrão"). Precisa de confirmação do Dr. Caio.
4. Formato: até 5 datas, retrato. Modo "Últimas 5", sempre retrato. Histórico completo com 6 a 10 datas, paisagem, 1 bloco. Mais de 10, paisagem em blocos de 10, mesmo PDF, nomes/unidades/referências repetidos, ordem cronológica; a data mais recente fica sempre na última coluna à direita do último bloco. Coluna sem data fica antes das demais.
5. Sem julgamento clínico: o PDF mostra valor, unidade, faixa impressa no laudo de cada coleta, laboratório, selo de conferência (C2 / C1 parcial / NÃO CONFERIDO) e unidade original quando houve conversão. Valor não conferido aparece em vermelho com aviso no topo.
6. Fecho: texto curto informativo, sem alegação jurídica.

## Limitações conhecidas da fatia 1
- Faixa institucional (cadastro da clínica) ainda não é impressa em coluna própria; só "Ref. laboratório". Falta decidir qual zona do cadastro representa o mínimo/máximo institucional (decisão do médico).
- Sem assinatura do médico e sem QR: dependem da fatia 2 (revisão/autorização real). Rodapé sem identidade da clínica sai como "Documento de teste"; a emissão real exigirá identidade validada.
- Bloqueio de emissão ao paciente quando há resultado não conferido: o gerador informa `contemNaoConferidos`; a rota (fatia 2) aplicará o bloqueio.
- Aproveitamento de página no modo paisagem é baixo (cabeçalho ocupa 59 mm): 8 exames por página.
- Navegador real, download e Asaas sandbox: não feitos.

## Requisitos legais (documento interno, fatia 3)
LGPD (acesso gratuito aos próprios dados preservado; serviço opcional é a compilação), Código de Ética Médica, CDC (transparência pré-contratual: escopo, preço, consentimento antes da cobrança). Sem citar jurisprudência de conselho.

## Prova
`src/tests/tex-evolucao-pdf.test.ts`: 11 testes (0, 1, 5, 6, 10, 11, 20 datas; últimas 5; não conferido; ordem cronológica). PDFs de evidência sintéticos em `specs/paxterloop/evidencias/tex/`. Regressão: exames 19 testes; receituário/PAXMED 68 testes; `tsc` limpo.
