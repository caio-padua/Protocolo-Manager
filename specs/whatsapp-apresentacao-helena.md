# Apresentação da Helena no WhatsApp

## Objetivo e escopo

Reconhecer saudações e perguntas de identidade no motor compartilhado, somente
no canal WhatsApp do Instituto Pádua, sem enviar testes externos.

## Requisitos

1. Mensagens exclusivamente de saudação ou identificação recebem exatamente:

```text
Olá !

Me chamo Helena,
Assistente virtual do Instituto Pádua.

Tudo bem ?
Como eu poderia te ajudar?
```

2. Texto operacional editável no editor existente de frases, separado das
   orientações clínicas e da apresentação do agendamento.
3. Não consultar biblioteca clínica, emitir documento, pausar ou alertar equipe
   por uma simples apresentação.
4. Preservar motor desligado, lista de clientes autorizados, modo humano,
   deduplicação e validações de identidade/empresa na fronteira Evolution.
5. Cumprimento acompanhado de sintoma, pedido documental ou mudança de
   tratamento não pode ocultar a intenção principal.
6. Não alterar modo humano de clientes, contatos ou configuração do provedor.
7. Distinguir desenvolvimento reiniciado de publicação em produção.

## Impacto e falhas previstas

| Risco | Barreira e teste |
|---|---|
| Pergunta de identidade cai na lacuna clínica | Reconhecimento determinístico antes de consultar biblioteca |
| “Olá, estou com dor” recebe só apresentação | Triagem clínica anterior e reconhecimento da mensagem completa |
| Outra clínica recebe marca Instituto Pádua | Frase específica somente com identidade empresarial correspondente |
| Modo humano é ignorado | Regra inserida depois das barreiras existentes |
| Duplicidade ou falha de envio | Mesma reivindicação, registro de saída e resultado de falha do motor |
| Quebras de linha ou pontuação alteradas | Comparação literal da resposta nos testes |
| Teste dispara rede externa | Dependências sintéticas; nunca chamar rota de envio nem webhook com dados reais |

## Verificação e limites

Executar testes automatizados do motor e de suas dependências afetadas, reiniciar
uma vez o servidor de desenvolvimento e verificar saúde/registros.
Não há mudança visual; captura da aplicação não comprova resposta WhatsApp.
Não publicar nem declarar recepção externa comprovada.
Não tocar cálculos, prescrições, prontuários, cobrança ou decisões médicas.

## Evidências da execução

- Rodada de testes: 174 verificações passaram em três arquivos
  (`atendimento-telegram.test.ts`, `atendimento-telegram-banco-descartavel.test.ts`,
  `evolution.test.ts`), com banco descartável e serviços externos simulados.
- Mais 17 testes passaram em `telegram-frases.test.ts`: total de 191 verificações
  nas duas execuções, sem repetir a contagem da primeira rodada.
- Vinte e quatro variações positivas comparadas literalmente, inclusive
  `Olá com quem estou falando?`, saudações isoladas, maiúsculas, acentos e pontuação.
- Mensagens mistas, sintomas, mudança de dose, modo humano, motor desligado,
  lista de clientes, repetição e falha de envio exercitados.
- A integração em banco descartável conferiu leitura da frase persistida,
  preservação de edição pelo responsável e não aplicação a outra clínica.
- Conferência de tipos executada: continua falhando somente no erro anterior
  TS7022 em `src/pax-finance/laboratorio-calc.ts:72`; nenhum erro nesta correção.
- Nenhuma mensagem externa de teste enviada; nenhum modo humano alterado.
- Não houve publicação nem revisão independente de liberação nesta rodada.
- Servidor de desenvolvimento recompilado e reiniciado; `/api/healthz` respondeu
  200. Leitura autenticada do editor confirmou a nova frase persistida com texto
  e quebras de linha literalmente iguais ao pedido.
- O serviço de publicação informou publicação existente, porém sem compilação
  atual bem-sucedida. Não foi confirmada essa correção no WhatsApp de produção.
