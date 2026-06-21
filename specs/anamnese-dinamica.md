# Anamnese Dinamica (modo express do paciente)

Alvo: deixar a ficha de 114 perguntas (14 blocos A-N) rapida e por clique para um
paciente empresario, com skip-logic (ligar/desligar partes) e barras de intensidade.
Construido a pedido direto do CEO (Opcao C, sem spec previa); este arquivo e o registro.

## Onde
- Tela: `artifacts/padcom/src/pages/anamnese.tsx` (rota `/anamnese`, portal publico).
- API: `artifacts/api-server/src/routes/anamnese-portal.ts` (GET `/anamnese-portal/questionario`).

## Regras
1. Subdivisao: dentro de cada bloco, perguntas agrupam pelo campo `sistema`.
   Sistema com 2+ perguntas vira um GRUPO com pergunta-porteira (gateway).
   Sistema com 1 pergunta, ou sem sistema, vira pergunta DIRETA (sempre visivel).
2. Pergunta-porteira: comeca FECHADA ("Nao, nenhuma" selecionado). Patient toca
   "Sim, tenho" para abrir e ver as perguntas detalhadas do sistema.
3. Sinal de alarme (`eSinalAlarme`) NUNCA fica escondido atras de porteira fechada:
   essas perguntas sao sempre diretas (seguranca clinica).
4. Fechar a porteira DESCARTA as respostas daquele grupo, para a tela ("sem queixa")
   bater com o que e enviado ao backend.
5. Submit envia apenas respostas preenchidas. Grupo fechado nao envia nada.
6. Intensidade: perguntas de escala (opcoes numericas, 3+ niveis) viram BARRA
   segmentada com legenda minimo/maximo (ex.: Ausente .. Grave). Tap define o nivel.
7. SIM/NAO e listas curtas continuam como botoes (pills).

## Divida tecnica registrada (decisao do CEO pendente)
- O motor (`computeMotor`) trata ausencia como "nao respondido", nao como "negado".
  Com skip-logic, grupo fechado = ausencia = motor nao registra negacao explicita.
  Para comparabilidade sessao-a-sessao, avaliar gravar "negado" no payload da porteira.
  NAO implementado nesta onda (evita mexer na semantica do motor sem ordem do CEO).

## Fontes
- Dados ja importados (planilha do CEO + base do Dr. Replit IHE), 114 perguntas,
  27 sistemas, 85 com opcoes de clique, 34 escalas validadas, 6 sinais de alarme.
