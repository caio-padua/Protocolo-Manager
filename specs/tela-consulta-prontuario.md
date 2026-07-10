# Spec — Tela Única da Consulta (Prontuário na hora do atendimento)

## Objetivo (uma frase)
Numa só tela, escolhendo o cliente, o médico prescreve exames, vê a evolução Antes/Depois dos exames por faixas e vê o acompanhamento do cliente — tudo ligado a dados reais.

## Dor do CEO (contexto)
Na hora da consulta o médico precisa de UMA tela onde faz as três coisas sem trocar de página: (1) prescrever exames, (2) ver antes/depois dos exames, (3) ver o acompanhamento do cliente.

## Rota e menu
1. Nova rota `/consulta` no `App.tsx` (dentro do shell com `Layout`).
2. Item de menu "Consulta (Prontuário)" no grupo clínico do `Layout.tsx`, ícone estetoscópio/prancheta.

## Requisitos exatos
1. Cabeçalho com um único `ClientPicker` (seletor de cliente compartilhado) e a identidade do cliente escolhido (nome). Sem cliente escolhido, as abas pedem para escolher.
2. Três abas na mesma tela: **Prescrever Exames**, **Evolução (Antes/Depois)**, **Acompanhamento**. Trocar de aba NÃO troca o cliente escolhido.
3. Aba **Prescrever Exames** (dados reais):
   - Catálogo de exames de `GET /api/catalogos/exames`, com busca por nome.
   - Carrinho de exames selecionados; remover item.
   - Emitir por `POST /api/exam-requests/emit` com `{ clientId, professionalId?, observacao?, sendEmail, sendWhatsapp, items[] }` (item = `{ nomeExame, codigoExame?, grupoPrincipal?, preparo?, tipo }`, tipo em SANGUE/IMAGEM/OUTROS).
   - Toggles enviar e-mail / enviar WhatsApp; médico solicitante opcional de `GET /api/professionals`.
   - Mostrar resultado (PDFs gerados, status de e-mail/WhatsApp).
4. Aba **Evolução (Antes/Depois)** (dados reais de `GET /api/exames-lab/evolucao/:clientId`):
   - Uma coluna por coleta. **No cabeçalho da coluna, empilhado: (linha 1) DATA, (linha 2) LABORATÓRIO, (linha 3) quem fez a extração/lançamento (nome + sobrenome do conferente + cargo).**
   - Uma linha por analito (nome + unidade + faixa de referência).
   - Valor colorido pela situação (`status`: acima=vermelho, abaixo=âmbar, dentro=verde, conferência=cinza).
   - Coluna de tendência (subiu/caiu/estável).
   - Coluna do nome do exame fica congelada ao rolar de lado.
5. Aba **Acompanhamento** (dados reais de `GET /api/cockpit/:clientId`):
   - Três blocos: Passado (protocolos, orçamentos, nº de respostas de anamnese), Presente (escore total, grade global, red flag, alarmes), Futuro (fórmulas, exames sugeridos, injetáveis, implantes).

## Casos extremos
1. Cliente sem exames: Evolução mostra estado vazio claro ("Nenhum exame para este cliente").
2. Cliente sem anamnese: Acompanhamento pode vir com contagens zeradas — mostrar mesmo assim, sem quebrar.
3. Coluna sem conferente (só IA): 3ª linha do cabeçalho mostra "Aguardando conferência" em vez de nome.
4. Falha de rede em qualquer aba: mensagem de erro, sem tela branca.
5. Emitir sem cliente ou sem itens: botão desabilitado.

## Definição de PRONTO
1. `/consulta` abre no menu, com o seletor de cliente no topo.
2. As três abas funcionam com o mesmo cliente selecionado, cada uma puxando dados reais dos endpoints acima.
3. Na Evolução, cada coluna mostra DATA, LABORATÓRIO e AUTOR da extração empilhados abaixo da data.
4. Prescrever gera solicitação real (retorno com PDFs) para um cliente de teste.
5. Validado por screenshot da tela real rodando (typecheck global é pré-quebrado; validar por runtime).

## Linhas vermelhas
1. NÃO alterar os motores existentes de evolução (`/api/exames-lab/evolucao`), de prescrição (`/api/exam-requests/emit`) nem do cockpit (`/api/cockpit`). A tela só CONSOME.
2. NÃO recriar tabelas nem endpoints que já existem.
3. NÃO tocar em schema de banco nesta onda.
4. Marca PAXTER e Densidade B na comunicação ao CEO.
