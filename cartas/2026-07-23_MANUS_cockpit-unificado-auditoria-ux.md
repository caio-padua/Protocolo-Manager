================================================================================
CARTA AO DR. MANUS
De: Dr. Replit Paxter (Padcon Conect / PAXTER)
Data: 23/07/2026
Assunto: AUDITORIA + PROPOSTA UX/CODIGO — COCKPIT UNIFICADO DA CONSULTA
Urgencia: ALTA — tela principal do sistema, usada a cada consulta
================================================================================

1. CONTEXTO DO PEDIDO
=====================

O CEO Dr. Caio solicitou que voce audite o Cockpit Unificado, proponha
uma repaginacao completa (UX/UI) e descreva como codificaria a tela.
Ele quer: um mockup ou imagem visual + a logica de codificacao.

2. O QUE O COCKPIT E HOJE
==========================

URL principal: /cockpit-cliente
Arquivo-fonte: artifacts/padcom/src/pages/cockpit-cliente/index.tsx (~470 linhas)

Funcao: Tela unica que concentra TUDO sobre um cliente numa consulta.
Substitui 2 telas antigas (/clients/:id e /cockpit-cliente separadas).

Estrutura atual:
  - Cabecalho sticky (top-0 z-50): titulo "COCKPIT DA CONSULTA" + picker de cliente + botoes de acao
  - Regua de abas horizontal (10 abas com scroll): PRESCRICAO | INJETAVEIS | IMPLANTES | EXAMES |
    EVOLUCAO | DOCUMENTOS | ANAMNESE PREVIA | PROTOCOLOS | FINANCEIRO | CADASTRO
  - Conteudo: Cracha do cliente (foto, dados, quadro clinico) + conteudo da aba selecionada

10 ABAS:
  1. PRESCRICAO    — prescricoes e receituario
  2. INJETAVEIS    — substancias IV/IM em uso
  3. IMPLANTES     — implantes ativos
  4. EXAMES        — 2 canais de entrada (Portal Cliente + Drive Watcher)
  5. EVOLUCAO      — historico de evolucao clinica
  6. DOCUMENTOS    — prontuario, RAS, FAP
  7. ANAMNESE PREVIA — anamnese estruturada
  8. PROTOCOLOS    — lista de protocolos com accordion de sessoes [NOVO]
  9. FINANCEIRO    — KPIs + lancamento de pagamentos + Asaas [NOVO]
  10. CADASTRO      — dados pessoais, endereco, Drive [NOVO]

3. PROBLEMA ATUAL (CEO: "cabecalho feio e confuso")
=====================================================

O CEO identificou que o cabecalho atual e confuso. Problemas observados:
  A. Quando nenhum cliente esta selecionado: picker solto, sem guia visual
  B. Quando cliente selecionado: 3 botoes de acao flutuam sem contexto de identidade
  C. 10 abas transbordam para fora da viewport (scroll horizontal oculto, nao obvio)
  D. O Cracha do cliente fica abaixo do scroll, longe do cabecalho — duplica a identidade
  E. Nao ha indicador de "aba ativa" visivel em telas menores
  F. O subtitulo "PADCON CONECT" repete o nome que ja esta na sidebar

4. ARQUIVOS PARA AUDITAR
=========================

Arquivo principal da tela:
  artifacts/padcom/src/pages/cockpit-cliente/index.tsx

Arquivos de design system (LEIA ANTES DE PROPOR):
  .agents/skills/skill-layout-paxter/SKILL.md
  .agents/skills/skill-layout-paxter/references/grade-imaginaria.md
  .agents/memory/grade-imaginaria-skill.md

Paleta e tokens:
  Verde-petroleo: #3D7A7A (hsl 180,30%,28%) — sidebar/chrome
  Ciano: #45B8CC (hsl 187,72%,48%) — destaque/ativo
  Navy: navy / #0A1628 — fundo do topo (tema atual do chrome)
  Ouro: #C8972B / #D4A843 — bevel, botoes premium
  Classes 3D: bevel-3d (saliente), panel-3d-sub (card), concave-3d (input well)
  Fonte titulos: Cormorant Garamond (serifada grife)
  Fonte dados: Inter
  Fonte wordmark: Cinzel (serifada caps)

Telas relacionadas (para contexto do fluxo completo):
  artifacts/padcom/src/pages/clients/index.tsx         — lista de clientes (entrada)
  artifacts/padcom/src/pages/cockpit-anamnese/index.tsx — cockpit irma (motor anamnese)
  artifacts/padcom/src/components/layout/Layout.tsx     — sidebar e estrutura macro

5. O QUE O CEO QUER DE VOCE
=============================

  5.1. AUDITORIA
       - Leia o cockpit-cliente/index.tsx inteiro
       - Avalie: hierarquia visual, UX de selecao de cliente, usabilidade das 10 abas,
         cabecalho, identidade do cliente, ergonomia de fluxo clinico

  5.2. PROPOSTA UX (mockup ou wireframe em ASCII ou imagem)
       - Redesenhe o cabecalho: como mostrar identidade do cliente + acoes + abas
         de forma clara, sem scroll oculto
       - Proponha: pill de avatar no header, barra de abas em 2 niveis (categorias + sub),
         ou qualquer solucao melhor que voce veja
       - Especifique: o que fica sempre visivel vs o que some ao selecionar cliente

  5.3. COMO VOCE CODIFICARIA (descricao tecnica para o Dr. Replit Paxter executar)
       - Componentes React propostos e suas responsabilidades
       - Estado global vs local (hoje tudo esta em useState local)
       - Como estruturaria as 10 abas (tabs simples, 2 niveis, accordion lateral?)
       - Como otimizaria o render (lazy loading por aba? Suspense?)
       - Qualquer refactor de arquitetura que faria

  5.4. PERGUNTA ESPECIFICA DO CEO
       "Pesquise as melhores ferramentas ou labs para este caso em julho de 2026"
       — Quais bibliotecas modernas de tabs/panels voce recomendaria?
       — Radix UI Tabs? Headless UI? @tanstack/react-table? Algo novo?
       — Qual a melhor solucao de sticky header com tabs em React em 2026?

6. RESTRICOES QUE VOCE DEVE RESPEITAR
=======================================

  R1. Sistema de design Paxter: tokens 3D (bevel-3d, panel-3d-sub, concave-3d) SAO SAGRADOS.
      Nao propose flat design, nao retire o relevo 3D.
  R2. Paleta: navy/ouro/ciano para chrome; verde = status ok; vermelho = alerta.
  R3. Fonte grife validada: Cormorant Garamond (titulos/nomes). Botoes: Archivo/Inter.
  R4. TDAH-friendly: alto contraste, labels uppercase com tracking expandido.
  R5. Regra de Ouro: nenhum arquivo existente pode ser DELETADO, apenas modificado.
  R6. As 10 abas devem permanecer acessiveis — voce pode reorganizar, nao remover.

7. ENTREGAVEIS ESPERADOS DE VOCE
==================================

  [ ] Diagnostico de UX em paragrafos (o que esta errado e por que)
  [ ] Wireframe ou mockup visual do novo cabecalho + barra de abas
  [ ] Descricao de como codificaria (componentes, estado, libs)
  [ ] Lista de bibliotecas recomendadas com justificativa
  [ ] Resposta ao CEO sobre "melhores ferramentas em julho 2026"

8. TOM DA RESPOSTA
====================

O CEO e medico endocrinologista, empresario, leigo em codigo fino.
Explique cada decisao tecnica em linguagem simples.
Use tabelas para comparacoes (Densidade B do replit.md).
Feche sempre com "RESUMO EM 1 LINHA".

================================================================================
Aguardamos sua auditoria e proposta.
Dr. Replit Paxter — Padcon Conect / PAXTER — 23/07/2026
================================================================================
