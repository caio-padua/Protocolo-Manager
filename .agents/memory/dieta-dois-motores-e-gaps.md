---
name: Órgão Dieta — dois motores + gaps de integração
description: Existem 2 mecanismos de dieta coexistindo (manual determinístico x IA/Claude); nem Cockpit da Consulta nem Prontuário mostram histórico de Dieta/Treino; não há motor de receitas nem de lista de compras.
---

Confirmado em 13/08/2026, direto na fonte (código + banco), depois de o CEO perguntar
"o sistema usa IA ou não" e "por que o plano da Carlúcia não aparece no prontuário".

## Os dois motores de dieta (não confundir um com o outro)

1. **"Montar cardápio"** (aba original) — determinístico, SEM IA. Calcula kcal/macros
   em TypeScript puro: `kcal = alimento.kcal100g * (quantidadeG / 100)`, a partir da
   tabela `dieta_catalogo_alimentos` (27 alimentos ativos, valores por 100g, fonte dos
   dados não documentada no código — não afirmar TACO/USDA sem checar de novo).
2. **"Emitir Plano Nutricional PDF"** (painel adicionado depois, task #210) — USA IA
   (chamada à Claude) para gerar cardápio semanal, suplementação e tabela de
   acompanhamento em texto livre. Persiste 1 registro em `dieta_prescricao` +
   `dieta_prescricao_item` (usando a opção 1 de cada refeição do plano gerado).

**Por que importa:** ao responder "o sistema tem IA?", a resposta certa depende de
qual dos dois caminhos foi usado — nunca generalizar para o módulo inteiro.

## Gaps de integração confirmados

- Cockpit da Consulta v2 (`cockpit-cliente/CockpitTabs.tsx`, array `ABAS`) tem exatamente
  10 abas: Prescrição, Injetáveis, Implantes, Exames, Evolução, Anamnese Prévia,
  Documentos, Protocolos, Financeiro, Cadastro. NENHUMA é Dieta ou Treino.
- Prontuário (`prontuario/index.tsx`, array `TABS`) tem exatamente 4 abas: Prescrições,
  Protocolos, Exames Solicitados, Exames Recebidos. A aba "Prescrições" lê de
  `receituario_tokens` via `/api/prontuario/:id` — tabela diferente de `dieta_prescricao`.
  Também não mostra treino.
- Os módulos Dieta (`/dieta`, API `/api/dieta/prescricoes`) e Treino (`/treino`, API
  `/api/treino/prescricoes`, tabela `treino_prescricao` — já tem 1 registro real) já
  existem e funcionam sozinhos, mas NENHUM dos dois está conectado ao Cockpit da
  Consulta nem ao Prontuário. É gap de integração, não perda de dado.
- Componente reaproveitável para esse tipo de histórico: `HistoricoDocs` (privado,
  dentro de `cockpit-cliente/panels/DocumentosPanel.tsx`) — hoje só lista atestados e
  encaminhamentos, mas o formato (rótulo/status/data/link PDF) serve de molde.
- Existe um Cockpit antigo/legado (`pages/cockpit/index.tsx`) com accordions "Dieta" e
  "Treino" dentro da coluna "Futuro", mas são só sugestões (`dto.futuro.dieta/.treino`),
  não histórico real nem editável — não confundir com o Cockpit v2 (o que está em uso).

## Infra que NÃO existe (verificado por `to_regclass` no Postgres)

- Nenhuma tabela de receitas culinárias em lugar nenhum do sistema.
- Nenhum motor de lista de compras nem campo de preço médio associado a alimento.
- `dieta_protocolos` (schema Drizzle) existe mas tem ZERO linhas — foi pensada para
  modelos de tipo de dieta (comentário no código cita low carb/mediterrânea/cetogênica)
  mas nunca foi populada nem tem UI de cadastro.
