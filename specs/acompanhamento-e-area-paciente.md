# Spec — Área do Paciente (unificada) + Ferramenta "Acompanhamento"

Status: ESPECIFICAR (Paxter Loop). Escrita em 25/06/2026. Decisões do CEO Dr. Caio marcadas como [MARTELO CEO].
Esta spec NÃO autoriza build de código; autoriza mockups descartáveis (sandbox) e organograma no Canvas.

---

## 1. Telas do paciente — mapa verificado (fonte: App.tsx, manifest.webmanifest)

| O que o paciente faz | Rota hoje | Como entra | Situação |
|---|---|---|---|
| Porta do app instalável (PWA) | /entrada | Abre o app instalado | Existe (start_url do manifest) |
| Área do Paciente — ver dados/documentos | /area | CPF + data de nascimento | Existe — CEO: "está ótimo" |
| Enviar exames/documentos | /portal ("Portal do Cliente") | Link (WhatsApp) ou site; CPF + nascimento | Existe — "está ótimo" |
| Responder Anamnese | /anamnese e /anamnese/v2 | Link ou site (versão clara e escura) | Existe (entrada externa) |
| Marcar consulta (+ cadastro se novo) | /agendar | Link (WhatsApp/e-mail) ou site | Em construção |

Observação: a equipe da clínica NÃO usa essas portas; ela vê os documentos enviados POR DENTRO do
sistema, na ficha do cliente em "Clientes". São os dois lados da mesma coisa.

---

## 2. [MARTELO CEO 25/06/2026] Unificação — Opção A

"Área do Paciente" e "Portal do Cliente" são a MESMA coisa. Decisão: **uma porta só**.

| Item | Definição |
|---|---|
| Nome da porta única | "Área do Paciente" |
| Rota que fica | /area (porta única) |
| /portal | Deixa de ser porta separada; vira a seção "Enviar Exames" dentro da Área |
| Seções dentro da Área | Meus Documentos · Enviar Exames · Minha Anamnese · Marcar Consulta |
| Entrada (regra de ouro) | O paciente entra em UM lugar (link/site ou app instalável) e faz tudo |

Pendência técnica (não bloqueia spec): redirecionar /portal → /area#enviar-exames para não quebrar
links já enviados por WhatsApp.

---

## 3. Ferramenta "Acompanhamento" (evolução clínica) — a dor do CEO

Metáfora oficial do CEO: **"T de encanamento"** — a aba puxa a anamnese passada (linha de base da 1ª
consulta) para o presente, para o médico ver a evolução TABELADA no tempo e bater o olho.

### 3.1 Onde fica (regra de ouro: toda ferramenta tem entrada no menu)
- Aba "Acompanhamento" DENTRO da ficha do cliente (rota /clients/:id), ao lado das abas existentes.

### 3.2 O que a tela mostra — cockpit longitudinal
Tabela onde as LINHAS são indicadores clínicos e as COLUNAS são as consultas no tempo.

| Indicador | Linha de base (1ª consulta) | Consulta N | ... | Tendência |
|---|---|---|---|---|
| Hipertensão | 160/100 | 130/85 | ... | seta verde (melhorou) |
| Dor (0 a 10) | 8 | 3 | ... | seta verde |
| Peso | 92 kg | 88 kg | ... | seta verde |
| Sono | ruim | ruim | ... | âmbar (igual) |
| Colesterol | alto | alto | ... | vermelha (piorou) |
| Nº de remédios | 3 | 2 | ... | verde (reduziu) |

- Cores de tendência reaproveitam o sistema de alerta existente: verde=melhorou, âmbar=igual,
  vermelho=piorou.
- Cada retorno (consulta) cria uma COLUNA nova.

### 3.3 Fluxo (o "T de encanamento")
Anamnese da 1ª consulta (LINHA DE BASE)
  -> abre aba "Acompanhamento" na ficha do cliente
  -> consulta de retorno puxa o passado para cima (vê anamnese antiga + colunas anteriores)
  -> médico INSERE os dados de hoje e MARCA por item: melhorou / igual / piorou
  -> cockpit atualizado: bate o olho na evolução tabelada no tempo

### 3.4 Dados (proposta — definir no build, não criar agora)
- Linha de base: vem da anamnese já existente (não duplicar; referenciar).
- Evolução por consulta: nova coleção (proposta de nome `acompanhamento_evolucoes`) com, por item:
  client_id, data_da_consulta, indicador, valor_base, valor_atual, tendencia (melhorou/igual/piorou),
  alert_color, observacao, profissional.
- Quais indicadores entram no cockpit: derivar dos campos da anamnese + lista fixa editável
  (hipertensão, dor, peso, medicação, sono, energia, colesterol...). A definir com o CEO.

### 3.5 Pendências para o CEO decidir no build
1. Lista oficial dos indicadores do cockpit (quais aparecem por padrão).
2. Quem preenche a coluna nova: só médico, ou também enfermeira?
3. A tendência é marcada à mão pelo médico, calculada pelo sistema, ou os dois?

---

## 4. [MARTELO CEO 25/06/2026] Reenquadramento — "Acompanhamento" é PARTE do "Cockpit"

Correção do CEO sobre os nomes:

| Nome | O que é |
|---|---|
| Acompanhamento | A evolução clínica tabelada (indicador × consulta, com setas melhorou/igual/piorou). É UMA seção. |
| Cockpit | A tela-comando do médico, onde na MESMA tela ele faz TUDO sobre o cliente. O Acompanhamento mora dentro dele. |

### 4.1 O que o Cockpit reúne numa só tela
| Seção | O que o médico faz ali |
|---|---|
| Prescrição | Prescrever fórmulas manipuladas; indicar injetáveis: endovenoso (na veia), intramuscular (no músculo), subcutâneo (sob a pele), implantes; indicar tratamentos |
| Exames | Solicitar todo tipo de exame E ver a EVOLUÇÃO dos resultados (ver seção 5) |
| Anamnese | Ver/registrar a anamnese (entrevista clínica) do cliente |
| Acompanhamento | A tabela de evolução clínica (indicador × consulta) — já mockada (ENTREGA 31) |
| Diário | Acesso ao diário do cliente (registros do próprio cliente ao longo do tempo) |

---

## 5. [MARTELO CEO 25/06/2026] Evolução de EXAMES com "terços/zonas" (o coração do pedido)

O CEO quer, para exames (principalmente de sangue): uma coluna que compara o resultado PASSADO com o
ATUAL, com gráfico de melhora, e o julgamento por "terços" — entre o mínimo e o máximo há faixas, com
uma faixa IDEAL. Exemplo do CEO: ferro 30 ng/dL (20/04/2026) → 70 (20/05/2026) → hoje (25/06/2026):
ver se melhorou ou piorou.

### 5.1 O que o IHE (origem) já traz para cá — PESQUISADO no código (não é memória)
Fonte verificada: `lib/db/src/schema/motor.ts` (tabela `catalogo_analitos`) e
`artifacts/api-server/src/lib/transmutacao-motor.ts`.

| Campo (origem IHE, já transmutado) | O que guarda |
|---|---|
| `unidade_padrao_integrativa` | Unidade do exame (ex.: ng/dL) |
| `terco_excelente` | Qual o "terço" (faixa) considerado EXCELENTE/ideal |
| `zonas` (JSON) | Cinco faixas nomeadas: excelente · aceitável · atenção · alerta · ruim |
| `direcao_favoravel` (tabela `direcao_favoravel_exame`) | Se "quanto maior melhor" ou "quanto menor melhor" |

Conclusão importante (sinceridade): o IHE NÃO usa só "normal × alterado". Ele pinta FAIXAS
FUNCIONAIS dentro do intervalo. Um ferro de 30 pode estar na zona "alerta/ruim" e 70 na zona
"excelente", mesmo que os dois caibam no "normal" largo do laboratório. Esse é o sistema de "terços".

### 5.2 O que FALTA construir aqui (não existe ainda neste repositório)
| Lacuna | Por quê |
|---|---|
| Tabela de RESULTADOS de exame por cliente e por data | Hoje só existe o CATÁLOGO (a régua), não os valores do cliente no tempo |
| Classificador valor → zona | A régua (zonas) veio pronta do IHE, mas falta o código que pega o valor e diz em que faixa caiu |
| Gráfico de evolução do analito | Linha do tempo do valor com as faixas coloridas ao fundo (verde=ideal, âmbar=atenção, vermelho=ruim) |
| Diário do cliente (armazenamento + leitura no Cockpit) | Não existe tabela de diário hoje |

Observação: o sistema IHE em si NÃO está neste repositório; pesquisei os DADOS dele já trazidos
para o Manager. Para detalhes finos do cálculo de terços, pode ser preciso uma carta ao Dr. Replit
Pawards (IHE).

---

## 6. Mockups/organograma já no Canvas
- ENTREGA 30: organograma do "T de encanamento" (fluxo) + cockpit-exemplo.
- ENTREGA 31: tela (mockup) da seção "Acompanhamento — Evolução Clínica" (indicador × consulta).

---

## 7. Decisões pendentes do CEO antes do build
1. Lista oficial dos indicadores do Acompanhamento (quais aparecem por padrão).
2. Quem preenche a coluna nova: só médico, ou também enfermeira.
3. A tendência é marcada à mão, calculada pelo sistema, ou os dois.
4. Quais "terços/zonas" usar na tela: as 5 zonas do IHE (excelente/aceitável/atenção/alerta/ruim)
   ou simplificar para 3 (abaixo do ideal / ideal / acima do ideal).
5. O diário do cliente é texto livre, ou perguntas guiadas (humor, sono, sintomas)?

---

## 8. [MARTELO CEO 25/06/2026] Acompanhamento é um MÓDULO que o Cockpit "puxa" (igual aos outros)

Confirmação sincera ao CEO: SIM, está certo. Cada capacidade clínica é um MÓDULO independente (tem
vida própria, dados próprios e canais de entrada próprios); o Cockpit COMPÕE (puxa) esses módulos
numa tela só, do mesmo jeito que puxa a prescrição de exame ou a indicação de injetáveis.

### 8.1 Os módulos que o Cockpit compõe
| Módulo | O que faz |
|---|---|
| Prescrição de fórmula manipulada | Receita das fórmulas |
| Indicação de exames | Pedir todo tipo de exame |
| Indicação de injetáveis/protocolos | Endovenoso, intramuscular, subcutâneo, implante + protocolos |
| Indicação de tratamentos | Condutas/tratamentos |
| Anamnese / Acompanhamento | A "anamnese viva" do cliente (este módulo) |
| Diário do cliente | Registros do próprio cliente no tempo |

### 8.2 Canais de ENTRADA do módulo Acompanhamento (de onde os dados chegam)
| Canal | O que entra |
|---|---|
| WhatsApp (quando ativado) | Estado geral, disposição, energia, pressão da manhã, glicemia → cai na anamnese ligada ao cliente |
| App / Área do Paciente (ligado ao app do celular) | Cliente lança a pressão, vai à aba Acompanhamento, relata uma queixa |
| Médico (dentro do Cockpit) | Preenche/edita à mão |

### 8.3 Queixa + plano VIP (SLA = "Service Level Agreement" = prazo de resposta combinado)
| Situação | Resposta |
|---|---|
| Plano VIP | Queixa (ex.: relacionada a uma fórmula) → resposta dentro do prazo combinado (SLA) |
| Sem VIP | Aguarda a próxima consulta |

### 8.4 Acesso FORA do Cockpit (visão global do médico)
Uma CAIXA DE ENTRADA única: quem mandou relatório diário, exame ou queixa — sem precisar abrir o
cockpit de cada cliente. Dentro do Cockpit, o médico vê só a FATIA daquele cliente.

### 8.5 Correção sincera de vocabulário (Art. 50)
A palavra "sessão" JÁ significa AGENDAMENTO/APLICAÇÃO neste sistema (tabela `sessions`). Para não
colidir, vou chamar essas peças componíveis de MÓDULO, nunca "sessão".

### 8.6 Blueprint
```
[WhatsApp]            ─┐
[App / Área Paciente] ─┼─> MÓDULO ACOMPANHAMENTO ──> CAIXA DE ENTRADA (médico vê de todos)
[Médico no Cockpit]   ─┘   (anamnese viva)          └─> COCKPIT puxa a FATIA do cliente
```

RESUMO EM 1 LINHA: SIM, o Acompanhamento é um MÓDULO componível (com canais WhatsApp/App/médico, queixa
com prazo VIP e caixa de entrada global) que o Cockpit puxa igual aos outros — e "sessão" fica reservada
para agendamento, então as peças se chamam MÓDULO.

---

## 9. Menu do Cliente — botão SOLICITAÇÕES + classificação Hermès (CEO 26/06/2026)

[MARTELO CEO 26/06/2026] A Área do Cliente ganha um 3º botão principal: **SOLICITAÇÕES** (ao lado de
Remarcar Consulta e Meu Protocolo). O acesso/gratuidade de cada solicitação depende da CATEGORIA do
cliente. Mockup vivo: `area-cliente/AreaCliente.tsx` (ENTREGA 38 no Canvas).

### 9.1 Classificação dos clientes (4 categorias, nomes escolhidos pelo agente)

| Categoria | Faixa | Regra de solicitações |
|---|---|---|
| NOIR | 1ª — Topo | Solicitações à vontade, sem custo (concierge ilimitado) |
| PLATINA | 2ª | Cortesias mensais incluídas + excedente pago |
| OURO | 3ª | Todas as solicitações pagas (com desconto) |
| BRONZE | 4ª — Base | Todas as solicitações pagas (preço cheio) |

Regra do CEO: a categoria TOP (NOIR) é gratuita à vontade; as duas inferiores (OURO e BRONZE) são
tudo pago. PLATINA é o meio-termo (algumas cortesias, excedente pago). Nomes são fáceis de renomear.

### 9.2 Subtítulos do botão SOLICITAÇÕES (o que o cliente pode pedir)

| Solicitação | O que é | Construído hoje? |
|---|---|---|
| Solicitar Exames | Novos exames para o acompanhamento | SIM (exam-requests existe) |
| Encaminhamento | Indicação a outro especialista | SIM (documento existe) |
| Laudo Médico | Documento do estado de saúde | SIM (documento existe) |
| Atestado | Comparecimento ou afastamento | SIM (documento existe) |
| Fórmula à Parte | Manipulado para uma queixa específica | SIM (receita existe) |
| Abrir Queixa / Pedir Contato | A equipe entra em contato | PENDENTE (sem fluxo próprio) |
| Renovar Receita | Continuidade do tratamento | PENDENTE |
| 2ª Via de Documento | Reemitir documento já gerado | PENDENTE |

Os itens PENDENTE aparecem no mockup com selo âmbar "PENDENTE" para não se perder (pedido do CEO).

### 9.3 Provedor de pagamento (recomendação para as categorias pagas)

| Opção | Por que | Recomendação |
|---|---|---|
| Asaas | Brasileiro, nasceu para clínicas/profissionais; PIX/boleto/cartão; link de pagamento pronto (leigo só clica); API simples; SPLIT nativo (essencial para repasse ao médico assistente); taxas competitivas | DEFAULT |
| Mercado Pago | Mais reconhecido pelo paciente; checkout fácil; PIX | Alternativa (split/taxas menos ideais) |
| Pagar.me (Stone) | Robusto, split, boa API | Alternativa (mais "empresarial") |

O dinheiro cai na conta do CEO (Bradesco/Santander) por transferência/PIX do provedor. Integração real
só após o CEO criar a conta e fornecer a credencial (secret) — não construir cobrança antes disso.

---

## 10. Motor de DESEJO na Área do Cliente (CEO 26/06/2026)

[MARTELO CEO 26/06/2026] A Área do Cliente é UMA só (porta única; fonte única de
verdade, um login). A categoria é um ATRIBUTO do cliente dentro dessa porta, nunca
uma área separada por plano.

### 10.1 Requisitos do desejo — DESEJO IMPLÍCITO (correção CEO 26/06/2026)
[MARTELO CEO 26/06/2026] O desejo é IMPLÍCITO, NUNCA explícito. Proibido bloco
"COMPARE OS PLANOS", caixa de upgrade visível e upsell com preço/economia na home.
O cliente DESCOBRE clicando.
| Requisito | Regra |
|---|---|
| Categoria visível | A categoria do cliente aparece, mas SEM comparativo aberto |
| Benefícios visíveis | O cliente vê tudo que pode solicitar (lista de benefícios) |
| Planos = ÍCONE | Os planos viram um ÍCONE-COROA discreto (sem texto, sem preço); ao tocar, revela os planos. Descoberta, não vitrine |
| Cadeado discreto | Itens premium (fora do plano atual) mostram um cadeado dourado discreto — desperta a curiosidade, sem dizer preço |
| Upgrade na hora | Só DEPOIS da descoberta (ao tocar a coroa): gera contrato (documento) + link de pagamento Asaas |
| Saudação | Sempre com tratamento: "Bem-vindo, senhor Ricardo" / "senhora [Nome]" |
| Faixas separadas | 3 retângulos nítidos: (1) PAXTER (sistema, R oficial) · (2) nome + CPF · (3) Bem-vindo. Nome NUNCA embaixo do PAXTER |
| Retângulos harmônicos | Progresso em segmentos retangulares; proibida barra arredondada/pill |
| Protocolos em paralelo | Vários protocolos ativos ao mesmo tempo (não "1") |
| Textura | Alfaiataria navy (terno escuro) nas faixas do sistema |

### 10.2 Viável hoje x pendente
| Parte | Estado |
|---|---|
| Home implícita + ícone-coroa + gaveta de descoberta (Círculos PAXTER) | PRONTO (mockup ENTREGA 38) |
| Geração de contrato do upgrade (após descoberta) | VIÁVEL (já geramos PDF/documento) |
| Link de pagamento real — Asaas (confirmado pelo CEO) | PENDENTE credencial/conta do CEO |
| Campo de categoria no banco (clientsTable) | A CRIAR (não existe hoje) |
| União com upload de exames (aba ENVIAR) | JÁ EXISTE — Solicitar Exames reaproveita |

### 10.3 Acesso de quem NÃO é cliente (prospect) — DECISÃO PENDENTE
Recomendação do agente: NÃO deixar prospect entrar na área real (dados clínicos/PII;
dilui exclusividade). Em vez disso, uma VITRINE/DEMO separada (só leitura, dados
fictícios) depois. Aguardando o CEO escolher (A/B/C).
