# Spec — Cockpit da Consulta (Console Clínico do Cliente)

## Objetivo (uma frase)
Transformar a tela "Cockpit da Consulta" numa página única, com blocos em sanfona (abrem/fecham), onde o médico escolhe o cliente UMA vez no topo e todos os blocos passam a operar já amarrados àquele cliente, reaproveitando as ferramentas reais que já existem no menu.

## Contexto / decisão de arquitetura
- A tela é o COCKPIT DA CONSULTA (rota `/cockpit`), não uma tela nova. A tela experimental `/consulta` (menu "Consulta (Prontuário)") será aposentada para não haver dois cockpits.
- Reaproveitamento REAL: cada bloco reusa o miolo da tela existente, extraído para um componente compartilhado que aceita `clientId` por prop. A mesma peça alimenta a rota original (onde ela escolhe o cliente sozinha) e o cockpit (onde o cliente vem fixo do topo). Isso evita duplicar lógica/UI (lição de memória: composição duplicada diverge).

## Requisitos exatos
1. Cabeçalho do cliente: um seletor de cliente único no topo (ClientPicker). Ao escolher, exibir nome / CPF / idade no estilo do print (faixa superior, marca PAXTER Motor Clínico). Enquanto nenhum cliente estiver escolhido, os blocos mostram "Escolha um cliente no topo para começar."
2. Blocos empilhados em sanfona (accordion), cada um abre/fecha independente, com estado inicial definido (Evolução de Exames aberto por padrão; demais fechados):
   - B1. INJETÁVEIS — reaproveita a tela de protocolos/injetáveis do cliente, filtrada pelo cliente do topo.
   - B2. PRESCRIÇÃO DE FÓRMULAS — reaproveita `/prescricao`, com o cliente do topo.
   - B3. PEDIDOS DE EXAMES (por BLOCOS e GRADES) — reaproveita o Prescritor de Exames (`/exames`) no modo "por bloco", com o cliente do topo; ao emitir, gera os PDFs e (opcional) envia por e-mail/WhatsApp como já faz hoje.
   - B4. EVOLUÇÃO DE EXAMES — colunas por data com DATA / LABORATÓRIO / AUTOR empilhados no cabeçalho da coluna, valores coloridos por status, faixas clicáveis, toggle "todas as faixas", e os gráficos por exame (o modelo já aprovado, hoje em `/consulta` e no mockup `acompanhamento/Exames.tsx`).
   - B5. ACOMPANHAMENTO (Passado / Presente / Futuro) — mantém o "cérebro" atual do cockpit (`/api/cockpit/:id`), como bloco em sanfona.
3. Todos os blocos operam SEMPRE com o `clientId` do topo. Trocar o cliente no topo re-alimenta todos os blocos.
4. Cada bloco reaproveitado NÃO pode quebrar a tela original correspondente (a rota original continua funcionando com seu próprio seletor de cliente).
5. Comunicação/estados: cada bloco trata carregando / vazio / ERRO de rede distintos (erro mostra mensagem + "Tentar novamente"); vazio real ("nenhum registro") é diferente de falha.
6. Marca/design conforme skill `skill-layout-paxter` (relevo 3D, tokens da marca, MAIÚSCULO nos rótulos, Densidade visual do cockpit).

## Casos extremos a tratar
- Cliente sem protocolo / sem fórmulas / sem exames / sem anamnese: cada bloco mostra vazio honesto, nunca erro.
- Falha de rede em qualquer bloco: estado de erro explícito com "Tentar novamente" (não mascarar como vazio).
- Cliente trocado no meio da navegação: todos os blocos recarregam para o novo cliente sem lixo do anterior.
- Emissão de pedido de exame com envio e-mail/WhatsApp: refletir sucesso/erro por canal, como já faz o Prescritor.
- Bloco pesado (Evolução) não deve travar o carregamento dos demais (carregamento independente por bloco).

## Definição de PRONTO
- `/cockpit` mostra o cabeçalho do cliente (nome/CPF/idade) e os 5 blocos em sanfona, todos amarrados ao cliente do topo.
- Os 4 blocos interativos (Injetáveis, Prescrição de Fórmulas, Pedidos de Exames, Evolução) reusam a ferramenta real e funcionam com dados reais de um cliente real (validado por screenshot + curl nos endpoints).
- A rota experimental `/consulta` é aposentada (redirect para `/cockpit`) e o item de menu "Consulta (Prontuário)" removido; as rotas originais de cada ferramenta continuam funcionando.
- architect (Paxter Loop) aprova requisito por requisito, zero pendência.

## Linhas vermelhas
- NUNCA alterar motores de cálculo/decisão: `/api/budgets/calculate`, motor de desmembramento, motor de anamnese, motor de agenda.
- NÃO mudar payloads/contratos de API por estética.
- NÃO quebrar as telas originais ao extrair os painéis compartilhados.
- Reaproveitar (extrair painel compartilhado), não copiar/colar UI (evitar divergência).
