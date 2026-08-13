# Spec — Módulo Pago "Órgão Dieta" (tipos de dieta, receitas, lista de compras)

Data: 13/08/2026 · Pedido do CEO Dr. Caio (voz, resposta à pergunta "ritmo de monetização") · Status: PRONTA PARA A TAREFA #234

## 1. Decisão do CEO (registrada literalmente)

Pergunta feita: "Quando desenhar a cobrança por módulo de dieta?"

Resposta: **Agora** — já com plano de monetização junto das 3 tarefas do Órgão Dieta (task #233, #234, #235).

Comentário do CEO (literal, por voz): "já utilize os motores e telas de monetização, utilize o que pode ser utilizado e acrescente ela como módulo. Eu tenho certeza que esta tela já existe, se não existir ela está oculta, não brinque em serviço. Faça o que tiver que ser feito e não economize, você tem 100% de autonomia. Crie o que for preciso."

Conclusão da verificação: **o CEO está certo**. A tela existe. Está oculta (não aparece em nenhum menu). Detalhes na seção 2.

## 2. O que já existe hoje (verificado no código-fonte, não em memória)

| Peça | Arquivo | O que faz |
|---|---|---|
| Guarda de módulo por empresa | `artifacts/api-server/src/middleware/moduleGuard.ts` | Bloqueia uma rota inteira (403) se a empresa não tiver aquele módulo ativo |
| Coluna de módulos ativos | `lib/db/src/schema/empresas.ts` → `empresas.modulos_ativos` | JSONB `{ [moduloId]: boolean }`; vazio/nulo = acesso total (clínica legada) |
| Vitrine comercial (a tela que o CEO lembrou) | `artifacts/padcom/src/pages/licenciado/index.tsx`, rota `/licenciado` | Catálogo `MODULOS` com nome, ícone, "o que faz", benefício, valor de adesão 48h, adesão cheia, mensalidade — cada módulo com cadeado; ao clicar abre modal de desejo |
| Doc que descreve a vitrine | `specs/entrada-licenciado-visao-desejo.md` (27/07/2026) | Confirma: cobrança automática (Asaas) foi propositalmente deixada de fora; ativação hoje é manual, feita pela equipe |
| Padrão de "módulo com medidor de uso" (mais sofisticado, específico do Avatar) | `lib/db/src/schema/avatar-uso-log.ts` → tabela `avatar_modulos_contratados` | `empresa_id`, `nivel` (voz/vídeo), `tipo_cobranca` (por uso / módulo fechado), `ativo`, `limite_mensal`, `contrato_id` — é o único precedente de "contrato de módulo" com campos além de um simples true/false |

**Confirmado que NÃO existe hoje:**

| Item | Situação |
|---|---|
| Tabela genérica de "planos"/"assinaturas"/"tiers" | Não existe — cada motor (avatar, licenciado) resolve do seu jeito |
| Cobrança automática (pagamento → liberação do módulo) | Não existe em nenhum motor hoje, nem no de domínios comerciais, nem no de avatar. `provisionamento.ts` documenta isso como ausente inclusive para os módulos já cobrados |
| "Dieta" ou "treino" na lista de módulos reconhecidos | Não existe — a lista fechada hoje é: `agenda, financeiro, estoque, ras, protocolos, exames_lab, comunicacao, arsenal, anamnese, cockpit` |
| A tela `/licenciado` no menu | Não existe entrada de menu para ela nem para o painel comercial de domínios — ambas são rotas "órfãs", acessíveis só digitando o endereço |

## 3. Arquitetura recomendada (para a Tarefa #234 aplicar)

Não é para reinventar: é para **estender os dois motores que já existem**, cada um no seu papel.

| Decisão | Opção recomendada (default) | Alternativa |
|---|---|---|
| Onde marcar "esta clínica pagou o módulo de dieta" | Adicionar `"dieta"` à lista fechada de `ModuloId` em `moduleGuard.ts` e usar `empresas.modulos_ativos.dieta` (mesmo padrão dos outros 10 módulos) | Criar tabela dedicada `dieta_modulos_contratados` no padrão do Avatar (mais trabalho, só compensa se o CEO quiser medir uso/limite mensal, não só ligar/desligar) |
| Onde a clínica/licenciado VÊ o preço e "deseja" o módulo | Acrescentar os itens de dieta (ex.: "Tipos de Dieta e Receitas", "Lista de Compras Inteligente") ao catálogo `MODULOS` de `licenciado/index.tsx`, com preços placeholder como os demais | — |
| A tela `/licenciado` continua oculta do menu? | Não — colocar uma entrada de menu (visível ao papel comercial/CEO) apontando para `/licenciado`, já que hoje ela está órfã mesmo para os 10 módulos existentes | Manter oculta e só CEO acessar digitando o endereço, como hoje |
| Cobrança automática (Asaas) já nesta onda? | Não — manter ativação manual pela equipe, exatamente como os outros módulos funcionam hoje. Construir o webhook automático é trabalho novo que nenhum módulo tem ainda | Construir o webhook Asaas → liberação automática (esforço maior, nenhum precedente pronto para copiar) |
| As rotas de dieta ganham o guard imediatamente? | Sim — aplicar `router.use(moduleGuard("dieta"))` em `dieta.ts`, `dieta-pdf.ts` e `treino.ts` dentro da própria Tarefa #234, já que o módulo "Dieta e Treino" está sendo construído agora | — |

## 4. Fora de escopo desta spec (decidir durante a execução da #234)

- Se "treino" é módulo separado de "dieta" ou vem junto (a lista de módulos do moduleGuard trata cada um como on/off independente — juntar ou separar é decisão de produto, não técnica).
- Granularidade fina (ex.: "receitas" e "lista de compras" como sub-módulos pagos à parte, dentro do módulo "dieta") — a Tarefa #234 já vai desenhar tipos de dieta/receitas/lista de compras; a monetização pode nascer no nível do módulo inteiro e ser refinada depois.
- Construção do webhook de cobrança automática (Asaas → ativação) — nenhum módulo do sistema tem isso hoje; se o CEO quiser começar por "Dieta", é um precedente novo, não uma cópia de algo pronto.

## 5. Por que isto não virou uma tarefa própria

Esta spec não gera uma tarefa nova no board — ela **atualiza o briefing da Tarefa #234** ("Motor de Tipos de Dieta, Receitas e Lista de Compras", hoje PROPOSED), que é onde este trabalho pertence. Quem começar a Tarefa #234 (o CEO ou um agente de tarefa) deve ler este documento primeiro.

## RESUMO EM 1 LINHA

A tela de monetização que o CEO lembrou existe de verdade (`/licenciado`, oculta do menu) e o guarda de módulo (`moduleGuard`) também; a Tarefa #234 deve estender os dois — não criar nada do zero — para vender "Dieta" como módulo pago, mantendo a ativação manual como já funciona para os outros 10 módulos.
