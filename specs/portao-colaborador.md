# Spec — Portão do Colaborador + Agendamento Multi-Médico/Multi-Local + 4 Entradas + Braços de Pagamento + Central de Cadastro

Data de abertura: 20/06/2026. Autor: Dr. Replit Paxter (a mando do CEO Dr. Caio).
Origem: ENTREGA 8 do Canvas (ids `e8-*`).

## Objetivo (uma frase)

Criar um sistema de agendamento sofisticado com quatro entradas que nunca se misturam (protocolos injetáveis, protocolos estéticos, consulta exclusiva do Dr. Caio com Regra de Ouro, e consulta dos médicos assistentes), apoiado em uma Central de Cadastro 100% editável pelo CEO (médicos, locais, agendas/horários, fraseologia dos botões, textos de pagamento e vídeos), com os braços de pagamento já prontos para associar link/sinal.

## Glossário (siglas e termos)

| Termo | Significado |
|---|---|
| Entrada | Uma "porta" de agendamento no topo da tela; cada uma abre um fluxo próprio |
| Regra de Ouro | Fluxo de desejo do Dr. Caio: 1 botão, datas só a partir de 3 meses, lista de espera, concierge pago ou fila grátis |
| Concierge | Serviço pago que encaixa o paciente antes dos 3 meses |
| Sinal | Pagamento parcial antecipado (aqui 25% do valor), abatido do total no dia |
| Braço de pagamento | Estrutura no código pronta para associar um link de pagamento (sem cobrança real até ligar o provedor) |
| Fraseologia | Texto editável de cada botão e cada explicação exibida ao paciente |
| Colaborador | Funcionário/membro da equipe (não é cliente) |

## Requisitos exatos (numerados)

### Bloco A — Central de Cadastro (aba CADASTRO, admin)
A1. Cadastro de MÉDICOS: criar/editar/remover. Campos mínimos: nome completo, papel (Dr. Caio principal OU assistente), foto opcional.
A2. Cadastro de LOCAIS livres: criar/editar/remover (ex.: Tatuapé, João Pessoa, sala alugada).
A3. Cadastro de AGENDAS por médico E por local: marcar/tirar/editar dias e horários/períodos disponíveis.
A4. Cadastro de FRASEOLOGIA: texto editável de cada botão das 4 entradas.
A5. Cadastro de EXPLICAÇÕES DE PAGAMENTO: textos do concierge, do sinal de 25% e do estético (editáveis).
A6. Cadastro de VÍDEOS de apresentação: espaço de UPLOAD por entrada/contexto (vídeo curto, editável/trocável).
A7. Tudo que é editado aqui reflete imediatamente no que o paciente vê.

### Bloco B — As 4 entradas (lado do paciente)
B1. ENTRADA 1 — Protocolos Injetáveis: a tela atual permanece intacta (não tocar no motor existente).
B2. ENTRADA 2 — Protocolos Estéticos (botox, preenchimento): nova entrada, separada.
B3. ENTRADA 3 — Dr. Caio (exclusiva): botão de máximo destaque com o nome "Dr. Caio Henrique Fernandes Pádua"; ao abrir, a TELA MUDA (transição/identidade visual distinta); aplica a Regra de Ouro.
B4. ENTRADA 4 — Médicos Assistentes: botão ABAIXO do nome do Dr. Caio; tela estilo injetáveis; o paciente SELECIONA o médico primeiro; ao selecionar, a agenda e os horários mudam conforme o cadastro daquele médico.
B5. As quatro entradas NUNCA se misturam (telas, dados e fluxos separados).

### Bloco C — Regra de Ouro (dentro da Entrada 3)
C1. Um único botão sofisticado (nunca a agenda crua).
C2. Datas só a partir de 3 meses (escassez proposital).
C3. Paciente escolhe dia da semana + horário/período.
C4. Entra na LISTA DE ESPERA.
C5. Dois caminhos: (a) CONCIERGE pago (encaixa antes; com regra de devolução se a vaga não se concretizar) ou (b) FILA grátis (secretária ativa ou não a agenda real).

### Bloco D — Braços de pagamento (prontos, sem cobrança real ainda)
D1. Estético agendado durante o protocolo: estrutura para associar link de pagamento (paga depois, não na hora).
D2. Concierge (Dr. Caio): estrutura para link antecipado.
D3. Médico assistente: estrutura para sinal de 25% do valor, abatido do total no dia.
D4. Os textos elegantes (concierge e valorização do tempo) ficam vinculados a cada braço e são editáveis (A5).
D5. Cobrança real depende de provedor (Stripe via Replit) + conta do CEO — fora desta spec; aqui só o "braço".

### Bloco E — Portão do Colaborador
E1. Login da equipe por papel (reutilizar HMAC do portal-token; sem inventar auth nova além do necessário).
E2. Acesso à Central de Cadastro (Bloco A) restrito ao colaborador autenticado.

## Casos extremos a tratar

- Médico sem nenhuma agenda cadastrada: a entrada não deve oferecer horários vazios; mostrar estado "sem horários".
- Local removido que ainda tem agenda vinculada: bloquear remoção ou migrar/avisar (não deixar agenda órfã).
- Vídeo de upload ausente: a tela funciona só com texto (vídeo é opcional).
- Fraseologia vazia: usar um texto padrão de fallback, nunca botão sem rótulo.
- Concierge sem vaga dentro das condições: acionar a regra de devolução (registrar estado, não cobrar de novo).
- Dois pacientes no mesmo horário do mesmo médico/local: impedir overbooking.

## Definição de PRONTO

| Critério | Como conferir |
|---|---|
| As 4 entradas existem, separadas, sem misturar dados/telas | Navegação real + screenshot de cada uma |
| Entrada 3 (Dr. Caio) tem identidade visual distinta e aplica a Regra de Ouro | Screenshot da transição + fluxo até lista de espera |
| Entrada 4 troca agenda/horários ao selecionar o médico | Cadastrar 2 médicos com agendas diferentes e comparar |
| Central de Cadastro edita médicos/locais/agendas/frases/textos/vídeos e reflete no paciente | Editar um texto e ver mudar na entrada |
| Braços de pagamento presentes (estrutura), com textos vinculados | Leitura do código + tela mostrando os textos |
| Portão do Colaborador protege a Central de Cadastro | Tentar acessar sem login → bloqueado |
| Nada quebrou no agendamento de injetáveis existente | Abrir a Agenda atual e conferir |

## Linhas vermelhas

- NUNCA misturar as 4 entradas (dados, telas, fluxos).
- NUNCA tocar/alterar o motor de agendamento de protocolos injetáveis existente nem o motor de RAS FAP.
- NÃO implementar cobrança real sem provedor + decisão do CEO; aqui só o "braço".
- Validar por runtime/screenshot — o typecheck global do repo é pré-quebrado, não usar `tsc` como prova.
- Comunicar ao CEO em Densidade B; explicar siglas; fechar com "RESUMO EM 1 LINHA".

## Ondas de construção (ordem)

| Onda | Conteúdo | Depende de |
|---|---|---|
| 8.1 | Bloco A (Central de Cadastro: médicos, locais, agendas) + esqueleto editável de frases/textos/vídeos | — |
| 8.2 | Bloco E (Portão do Colaborador) | 8.1 |
| 8.3 | Bloco B (as 4 entradas do paciente) incluindo Entrada 3 (Regra de Ouro) e Entrada 4 (seleção de médico) | 8.1 |
| 8.4 | Bloco D (braços de pagamento) + textos vinculados | 8.3 |
| 8.5 | Vídeos (upload real) + WhatsApp/voz (Twilio) nas confirmações | 8.3, credenciais |
