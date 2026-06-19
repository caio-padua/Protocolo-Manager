# Spec — Redesign da Tela DETALHE DO PROTOCOLO (mobile/médico-cliente)

Data: 19/06/2026 · Autor: Dr. Replit Paxter · Loop: Paxter (Especificar → Construir → Revisar)
Arquivo alvo: `artifacts/padcom/src/pages/protocols/detail.tsx`
Origem: 5 prints do CEO (protocolo ANTI-AGING DOMICILIAR, cliente Ricardo Almeida Ferreira).

## Objetivo (1 frase)
Tornar a tela de detalhe do protocolo imediatamente legível: identidade do protocolo (ATUAL x PASSADO) inconfundível, substâncias organizadas em APLICADAS x A APLICAR com cartões estilo kanban (quadradinho de cor + nome), menos poluição de cor (TDAH), e botões superiores alinhados.

## Fatos apurados (não-negociáveis do dado)
1. `useGetProtocol(id)` retorna UM protocolo; todas as `sessions` e `substanceApplications` são escopadas a esse `protocolId` (verificado em `api-server/src/routes/protocols.ts` linhas 36/53). Logo, TODA substância da página pertence a este protocolo — a confusão é falta de identidade persistente, não mistura de dados. NÃO há necessidade (nem permissão) de mexer na API.
2. Campos disponíveis por substância (`protocol.items[]`): `substanceColor`, `substanceName`, `dose`, `completedSessions`, `totalSessions`, `unitPrice`, `lineTotal`, `intervalDays`, `frequency`.
3. Campos por aplicação (`protocol.sessions[].substanceApplications[]`): `substanceName`, `substanceColor`, `sessionNumber`, `totalSessions`, `availability` ("disp" | "prox"), `status` ("applied" | outro).
4. Status do protocolo: ATUAL = `suggested|validated|active`; PASSADO = `completed|cancelled|expired`.

## Requisitos exatos (numerados)
R1. BOTÕES SUPERIORES ALINHADOS — a barra superior vira uma toolbar única, alinhada: "Voltar" à esquerda; ações à direita (Validar/Baixar ICS/RAS FAP/Protocolo PDF) com `flex-wrap`, mesma altura, `gap-2`, sem quebrar desalinhado no celular. Todos os onClick/handlers/condições atuais preservados IDÊNTICOS.

R2. IDENTIDADE DO PROTOCOLO (ATUAL x PASSADO) — painel-herói (`panel-3d`) no topo com:
   - Título do protocolo em destaque + cliente/CPF.
   - SELO de fase inconfundível: ATUAL = ciano com LED pulsante (`paxter-led paxter-led-on`) e texto "PROTOCOLO ATUAL · EM ANDAMENTO"; PASSADO = cinza/estampado, sem brilho, texto "PROTOCOLO ENCERRADO" (+ rótulo do status real ex. "Concluído"/"Cancelado").
   - Mini-progresso "N / total sessões" embutido.
   - O badge de status atual (formatStatus/getStatusColor) pode permanecer, mas a leitura ATUAL/PASSADO é a principal.

R3. BARRA DE IDENTIDADE PERSISTENTE — uma faixa compacta `sticky top-0` (z baixo, fundo do app) que enquanto rola mostra sempre: título do protocolo + selo ATUAL/PASSADO + "N/total". Resolve "qual protocolo estou lendo".

R4. SUBSTÂNCIAS — APLICADAS x A APLICAR (centro do redesign): painel com DUAS colunas (empilha no celular, lado a lado em `lg`):
   - Coluna A "APLICADAS": cada aplicação `disp` com `status==="applied"` e `sessionNumber>0` (agregada de todas as sessões) como CARTÃO KANBAN.
   - Coluna B "A APLICAR / PRÓXIMAS": aplicações `disp` ainda NÃO aplicadas com `sessionNumber>0`, agregadas de todas as sessões.
   - NOTA (correção de spec, 19/06/2026, fundamentada nos dados): os marcadores `prox` (placeholder gerado por semana NÃO agendada, `sessionNumber===0` — ver server linhas 579-591) NÃO entram neste agregado. Eles se repetem a cada semana em que a substância não foi agendada; somá-los duplicaria/triplicaria a mesma substância e inflaria a contagem, contrariando o objetivo de clareza (R6). Os `prox` aparecem apenas na linha do tempo por sessão (R10) como dica "Próxima".
   - Cada coluna tem cabeçalho com contador (ex.: "APLICADAS · 7").

R5. CARTÃO KANBAN DE SUBSTÂNCIA (padrão reutilizável) — quadradinho de cor à ESQUERDA (cor da substância, cantos quadrados `rounded-[3px]`), corpo do retângulo neutro 3D (`panel-3d-sub`/`concave-3d`), nome da substância na MESMA cor (tom controlado), contador "N / total" em `concave-3d`. APLICADA recebe check verde (CheckCircle2 verde). Nada de pílula inteira colorida.

R6. REDUÇÃO DE COR (TDAH) — as únicas cores saturadas na tela: (a) o quadradinho da substância, (b) verde do check de aplicada, (c) ciano da identidade ATUAL. Pílulas de sessão deixam de ser preenchidas com cor cheia; passam a corpo neutro + quadradinho + check.

R7. CHECK VERDE para aplicadas em TODA ocorrência (coluna APLICADAS e timeline de sessões).

R8. SUBSTÂNCIAS DO PROTOCOLO (catálogo) — mantém a lista por substância (progresso/preço), re-peles como cartão kanban (quadradinho + nome no tom + barra de progresso + contador); marca check verde "CONCLUÍDA" quando `completedSessions===totalSessions`.

R9. CLICAR PARA EXPANDIR — as seções longas (linha do tempo das Sessões e tabela de Orçamento) viram COLAPSÁVEIS via `useState` LOCAL (estado de UI apenas), com botão claro ("Ver linha do tempo · N sessões" / "Ver orçamento"). Reduz sobrecarga inicial.

R10. TIMELINE DE SESSÕES (quando expandida) — re-pele com o mesmo cartão kanban e cores reduzidas (R5/R6/R7); mantém data/hora/status/profissional.

## Casos extremos
- Protocolo sem sessões (`sessions.length===0`): mostrar identidade + KPIs + catálogo de substâncias; ocultar colunas APLICADAS/A APLICAR e timeline (sem dados). Botão "Validar e Gerar Sessões" continua aparecendo conforme regra atual.
- Substância sem preço (`unitPrice===0`): não quebrar a linha de preço (já condicional).
- Aplicação com `sessionNumber===0` (placeholder "prox"): é dica por-semana; exibida SÓ na timeline (R10) como "Próxima"; NUNCA conta como aplicada e NÃO entra no agregado APLICADAS/A APLICAR (R4) — evita contagem duplicada.
- Cor da substância ausente/indefinida: usar fallback neutro (ex.: `#94a3b8`) só no quadradinho.
- Nomes longos: truncar com reticências, sem estourar o cartão.
- Dark mode: respeitar variantes `.dark` das classes 3D.

## Definição de PRONTO (conferível)
P1. Botões superiores alinhados no celular (largura ~402px) e desktop — screenshot prova.
P2. Selo ATUAL (ciano+LED) aparece em protocolo ativo; trocando para status passado, selo vira ENCERRADO cinza — conferível por screenshot/inspeção condicional.
P3. Barra de identidade persiste ao rolar (sticky).
P4. Colunas APLICADAS x A APLICAR renderizam com contagem correta a partir das aplicações reais.
P5. Todo cartão de substância tem quadradinho de cor à esquerda + nome no tom; aplicada tem check verde.
P6. Contagem visível de cores saturadas simultâneas ≤ 3 famílias (square/verde/ciano) fora os quadradinhos por substância.
P7. Sessões e Orçamento colapsam/expandem por clique sem erro de runtime.
P8. Nenhuma chamada de API/hook/mutation/handler/type alterada (diff só em JSX/className + `useState` de UI + helpers de apresentação).
P9. App roda sem erro no console; Vite conectado; screenshots das duas larguras anexadas.
P10. Architect aprova requisito-por-requisito sem pendência.

## Linhas vermelhas
- NÃO alterar `/api/budgets/calculate` nem qualquer motor de cálculo/payload.
- NÃO alterar hooks de dados (`useGetProtocol/useValidateProtocol/useGenerateProtocolICS`), assinaturas, types, rotas ou os handlers de download (RAS FAP / Protocolo PDF / ICS) — só reposicionar/repele.
- NÃO inventar dados de "outros protocolos" (a API só dá um); identidade ATUAL/PASSADO é o status DESTE protocolo.
- Manter essência 3D Paxter (cantos quadrados 6–8px, panel/sub, bevel, concave, screen); só apresentação muda.
