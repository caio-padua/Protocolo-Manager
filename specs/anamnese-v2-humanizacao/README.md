# Spec — Anamnese v2: Humanização para o paciente leigo + acesso de teste + mini-dashboard

Data: 21/06/2026. CEO: Dr. Caio. Agente: Dr. Replit Paxter. Método: Paxter Loop (Especificar → Construir → Revisar).

## Objetivo (uma frase)

Tornar a anamnese (questionário de saúde) autoexplicativa para um paciente leigo — cada pergunta com ajuda, exemplo e lógica clínica que não pergunta o impossível — e arrumar o acesso do paciente (mini-dashboard antes da anamnese) e o portão de senha (desligável para teste).

## Glossário (siglas explicadas)

| Sigla / termo | Significado |
|---|---|
| Anamnese | Entrevista de saúde inicial que o paciente responde antes do atendimento |
| AUDIT-C | Escala validada de 3 perguntas que mede risco com álcool (Alcohol Use Disorders Identification Test - Consumption) |
| CAGE | Escala validada de 4 perguntas (Cut down, Annoyed, Guilty, Eye-opener) de rastreio de alcoolismo |
| Maços-ano | Medida de carga tabágica: (cigarros por dia ÷ 20) × anos de fumo |
| Concavo / Well | Painel afundado (baixo-relevo) — classe `concave-3d` |
| Saliente / Bevel | Placa elevada (alto-relevo) — classe `bevel-3d` |
| Painel 3D | Cartão com relevo — classes `panel-3d`, `panel-3d-sub` |
| Skip-logic | Lógica que mostra/esconde perguntas conforme respostas anteriores |
| RBAC | Controle de acesso por papel (Role-Based Access Control) |

## Linhas vermelhas (NÃO cruzar)

| Linha vermelha | Motivo |
|---|---|
| NÃO mudar o motor de cálculo de risco (`pesoGravidade`/`opcoes.peso`) por estética | Art. design Paxter: só apresentação muda |
| NÃO remover o relevo 3D dos painéis | Essência do design Paxter |
| NÃO inventar estilo novo por tela — reusar vocabulário da `skill-layout-paxter` | Lei do Registro de Modelagem |
| Conteúdo das perguntas vem do BANCO (`anamnese_questionario`), não hardcode no TSX | Arquitetura data-driven existente |
| O desligamento do portão de senha tem que ser REVERSÍVEL e VISÍVEL (banner) | Art. 50 (avisar o CEO; não esconder exposição de PII) |
| NÃO truncar a tabela `anamnese_questionario` em produção; alterações de schema são aditivas | Memória: push com notNull em tabela populada |

## Mapa de requisitos (carro-chefe)

| ID | Requisito (uma frase) | Tipo | Cluster |
|---|---|---|---|
| R1 | Desligar o portão de senha por flag reversível (RBAC fica para a fase de governança) | Acesso | 1 |
| R2 | Ao virar de bloco/pergunta, rolar para o TOPO do questionário | Navegação | 6 |
| R3 | Cada pergunta = painel próprio com ajuda em tópicos num Concavo de altura proporcional | Render+Dado | 3 |
| R4 | Botão de VÍDEO explicativo por pergunta (quando houver URL cadastrada) | Render+Dado | 3 |
| R5 | Exemplo de resposta em cada campo (coluna `exemplo`) | Render+Dado | 3 |
| R6 | Cirurgias: lista clicável com nome leigo + nome técnico entre parênteses | Dado+Render | 5 |
| R7 | Lógica por sexo: não mostrar pergunta masculina para mulher e vice-versa | Skip-logic | 5 |
| R8 | Barras de intensidade padronizadas (componente único) | Render | 4 |
| R9 | AUDIT-C: mostrar os RÓTULOS de frequência/dose, não o número cru | Render | 4 |
| R10 | CAGE 2: ao responder SIM, especificar QUEM incomodou (parente/amigo + subcategoria) | Dado+Render | 5 |
| R11 | Tabagismo: "Nunca fumou" esconde as perguntas de cigarro | Skip-logic | 5 |
| R12 | Maços-ano: paciente digita cigarros/dia e anos; o SISTEMA calcula | Render+Dado | 5 |
| R13 | Link do paciente abre o mini-dashboard `/area` (não joga direto na anamnese) | Roteamento | 2 |
| R14 | Operacionalizar de verdade como paciente E como médico (teste real + screenshot) | Validação | 7 |

Detalhe requisito-a-requisito (casos extremos + DONE): ver `requisitos.md`.

## Definição de PRONTO (master)

| Critério | Conferido por |
|---|---|
| Todos R1–R14 cumpridos conforme `requisitos.md` | architect (Fase 3) |
| Anamnese percorrida de ponta a ponta como PACIENTE (screenshot dos pontos-chave) | runtime/captura |
| Fluxo do MÉDICO/colaborador conferido (revisão acessível) | runtime/captura |
| Nenhuma linha vermelha violada | leitura do diff |
| Padrões novos de design registrados na `skill-layout-paxter` e anunciados | leitura da skill |
| Comunicação final em Densidade B com "RESUMO EM 1 LINHA" | replit.md Art.37-51 |

RESUMO EM 1 LINHA: anamnese autoexplicativa para leigo (ajuda+exemplo+vídeo por pergunta, escalas com rótulo, lógica de sexo/tabagismo/maços-ano/cirurgia), acesso do paciente pelo mini-dashboard e portão de senha desligável para teste.
