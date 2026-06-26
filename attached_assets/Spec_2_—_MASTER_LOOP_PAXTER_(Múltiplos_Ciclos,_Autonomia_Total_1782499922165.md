# Spec — MASTER LOOP PAXTER (Múltiplos Ciclos, Autonomia Total)

**Data:** 26/06/2026
**Autor:** Dr. Manus (Engenheiro de Missões)
**Aprovado por:** CEO Dr. Caio
**Executante:** Dr. Replit Paxter (Manager)

## Objetivo
Unificar todas as frentes de trabalho (Órgão Dieta, Escore do Cérebro, Órgão Treino, Craniotomia Viva, Mensageria Inteligente e Cockpit da Consulta) em um **único fluxo mestre (Master Loop)**. O Dr. Replit Paxter deve executar este Master Loop com **autonomia total**, avançando de ciclo em ciclo sem interromper o CEO, aplicando a filosofia Kaizen em cada etapa, e só entregando o resultado final quando TODOS os ciclos estiverem concluídos e validados pelo `architect`.

## Regras de Ouro (A Lei do Master Loop)
1. **Autonomia Extrema:** Nenhuma interrupção ao CEO. Orçamento de R$ 5.000,00 liberado para ferramentas/APIs.
2. **Ciclo Ininterrupto:** Terminou a Onda A? Comece a Onda B imediatamente. Não espere aprovação intermediária.
3. **Kaizen:** Em cada Onda, entregue pelo menos UMA melhoria de eficiência ou UX que não estava na spec.
4. **Destruição Criativa:** Se perceber que uma arquitetura proposta pode ser melhorada refazendo-a do zero, refaça. Não limite seu potencial ao que foi escrito se souber fazer melhor.
5. **A Marca PAXTER:** Todas as telas novas devem nascer com o design skeuomórfico 3D (NAVY + OURO), cantos quadrados (radius 6 a 8), logo Paxter no canto superior direito (com efeito de brilho em alto-relevo).
6. **O Bug Crítico Primeiro:** Antes de iniciar a Onda A, o bug dos exames de imagem (1 exame = 1 PDF separado) DEVE ser corrigido no backend.

---

## O MASTER LOOP (As Ondas de Execução)

O Paxter deve executar as seguintes Ondas sequencialmente. Para cada Onda, ele deve aplicar o Paxter Loop (Construir -> Revisar com Architect -> Zero Pendência -> Avançar).

### ONDA 0: O Bug Crítico e a Marca
- **Requisito 1:** Corrigir a geração de PDFs de encaminhamento. Exames de Imagem (Raio-X, RM, USG, TC) **devem** ser gerados em PDFs separados (1 PDF por exame). Exames laboratoriais podem continuar agrupados.
- **Requisito 2:** Garantir que o componente de Header global injete a logo Paxter (3D, ouro, brilho superior) no canto superior direito de TODAS as telas do sistema. O nome "Instituto Pádua" aparece apenas nos PDFs gerados (canto superior esquerdo).

### ONDA A: Órgão DIETA (Nativo)
- **Requisito 1:** Criar 4 tabelas no Drizzle ORM (`dieta_catalogo_alimentos`, `dieta_protocolos`, `dieta_prescricao`, `dieta_prescricao_item`).
- **Requisito 2:** Implementar o Contrato Comum do Órgão (Catálogo + Fila de Indicação + Fatia do Cockpit).
- **Requisito 3:** Lógica de Jejum Intermitente (bloquear refeições fora da janela) e cálculo de TDEE na prescrição.
- **Kaizen Esperado:** UX TDAH-friendly na montagem do cardápio (linhas alinhadas, campos vazios preenchidos com "—").

### ONDA B: O CÉREBRO (Escore de Gravidade por Bloco)
- **Requisito 1:** Atualizar a rota do motor clínico para calcular o Escore de Gravidade por Bloco (SOMA dos pesos das respostas).
- **Requisito 2:** Implementar o multiplicador de intensidade (Leve=1, Moderado=2, Grave=3) e a Red Flag (Sinal de Alarme = 10, que pula direto para grade AMPLIADA).
- **Requisito 3:** Definir a Grade de exames com base no escore (1-3 Básica, 4-6 Intermediária, 7-9 Sofisticada, >=10 Ampliada).
- **Requisito 4:** Expandir `item_tipo` nas tabelas de regras para suportar `dieta_regra` e `treino_regra`. O Cérebro deve escrever na fila de indicação da Dieta.

### ONDA C: Órgão TREINO (Nativo)
- **Requisito 1:** Criar 4 tabelas no Drizzle ORM (`treino_catalogo_exercicios`, `treino_protocolos`, `treino_prescricao`, `treino_prescricao_item`), espelhando a arquitetura da Dieta.
- **Requisito 2:** Implementar o Contrato Comum do Órgão.
- **Requisito 3:** O Cérebro deve ser capaz de escrever na fila de indicação do Treino.

### ONDA D: CRANIOTOMIA VIVA (A Tela das Sinapses)
- **Requisito 1:** Criar a tela `/craniotomia` (orgao independente no menu).
- **Requisito 2:** Layout em 3 colunas verticais estritas (Dendritos, Corpo Celular, Axônios).
- **Requisito 3:** Implementar o Modo Simular. Dropdown de perfil de teste no topo. Ao selecionar, a tela escurece 20%, os dendritos acionados ganham borda dourada, linhas SVG correm da esquerda para a direita (animadas), e o escore pisca no centro.
- **Requisito 4:** Edição in situ. Clicar em um axônio abre um popover inline (sem quebrar a grade) para editar o peso da ligação, salvando no banco em tempo real.

### ONDA E: COCKPIT DA CONSULTA E MENSAGERIA INTELIGENTE
- **Requisito 1:** Consolidar a tela de consulta em 3 colunas (Passado, Presente, Futuro/Prescrição).
- **Requisito 2:** Injetar os Blocos Expansíveis (Accordions) para Fórmulas, Exames, Injetáveis, Implantes, Dieta e Treino na coluna da direita. O componente deve ser burro (recebe DTO do Cérebro).
- **Requisito 3:** Ligar o botão "Finalizar e Emitir Tudo". Ele deve gerar os PDFs, aprovar os orçamentos e enviar a prescrição para o motor de Mensageria.
- **Requisito 4:** Expandir o motor de Mensageria (WhatsApp/Twilio) para agendar lembretes automáticos de fórmulas prescritas, alertas de exames e lembretes de injetáveis, baseados nos períodos do dia e da semana.

---

## Definição de PRONTO (Para o Master Loop)
O Master Loop só será considerado PRONTO quando:
1. O `architect` revisar e aprovar CADA ONDA contra os requisitos desta spec.
2. Nenhuma linha vermelha (como alterar o motor de cálculo por estética) for violada.
3. Todas as telas novas exibirem o design 3D Paxter com a logo dourada no canto superior direito.
4. O Dr. Replit Paxter entregar um relatório final (Densidade B) listando todas as inovações Kaizen que ele implementou por conta própria durante a execução.

**AÇÃO DO PAXTER:** Ao receber esta spec, inicie imediatamente a ONDA 0. Não pare até a ONDA E estar aprovada.
