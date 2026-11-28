# Atendimento real do WhatsApp por regras

## Objetivo
Conectar a entrada real Evolution às decisões e respostas editáveis do PAXMED,
sem inteligência artificial obrigatória, publicação ou disparos de teste externos.

## Inventário e desenho
- Entrada: webhook autenticado por clínica e instância em `routes/evolution.ts`.
- Saída: `enviarTextoEvolution`, com estado do provedor e lista de homologação.
- Cérebro clínico existente: `planejarAtendimento`, perguntas aprendidas e
  orientações aprovadas por clínica.
- Comunicação institucional: `telegram_frases`, editor Frases do Assistente.
- Modelos de Comunicação: `comunicacao_modelo_texto`; são moldes de mensagens
  com variáveis reais, não uma base de fatos clínicos ou de preços.
- Agenda: reutilizar o diálogo e as reservas existentes, adicionando escopo
  obrigatório da clínica ao caminho WhatsApp e desativando os interpretadores.
- Central de Conversas: incluir Evolution sem copiar entradas para Telegram,
  preservando estados, classificação, encaminhamento e identidade gravada.

Entrada autenticada → contato único autorizado → controles existentes →
classificação por regras → fontes aprovadas ou motor real → revalidação →
saída para o mesmo contato → histórico e confirmações independentes.

## Requisitos
1. Saudações e identidade usam a apresentação cadastrada da Helena; nunca o
   texto de ausência de orientação clínica.
2. Reconhecer menu, agendamento, consulta de agendamento/retorno, orçamento,
   documentos, exames e equipe, incluindo variações e opções numéricas.
3. Número isolado só vira opção do menu quando o último contexto entregue
   foi o menu, dentro de prazo; não roubar confirmação de documentos ou agenda.
4. Perguntas aprendidas e orientações aprovadas da clínica têm prioridade
   sobre encaminhamento operacional; inteligência artificial é opcional.
5. Sem resposta aprovada: menu ou encaminhamento persistido e alerta efetivo,
   sem alegação falsa; sintomas e decisões médicas preservam a triagem anterior.
6. Documentos continuam no motor existente, com confirmação, procedência,
   identidade e clínica; nunca criar prescrição nem preço para suprir lacuna.
7. Consulta de retorno informa somente compromissos próprios registrados;
   não declarar gratuidade ou elegibilidade de retorno sem regra cadastrada.
8. Isolar clínica, cliente, canal e estado de agenda; nenhum envio de teste real,
   reativação de conversa humana ou ampliação da lista autorizada.
9. Histórico real na central existente, com canal, intenção, processamento,
   encaminhamento e estado do provedor; sem duplicidade ou resposta a eco.
10. Conferir conexão e publicação sem supor que Railway esteja operacional.

## Falhas previstas
| Risco | Barreira / recuperação | Teste |
|---|---|---|
| Clínica ou contato errado | Identidade exata e única, escopo em toda consulta | Sintéticos isolados |
| Saudação esconde sintomas | Triagem clínica antes de operações | Mensagens mistas |
| Número fora de contexto | Último plano/menu entregue e prazo | Menu, agenda e documento |
| Aviso de equipe falha | Estado de falha persistido; não alegar encaminhamento | Provedor falso recusa |
| Queda após envio | Registro antes da rede; não repetir automaticamente | Duplicidade e resultado incerto |
| Motor indisponível | Sem inventar agenda/documento/preço | Lacunas explícitas |
| Estado cruzado entre canais | Chave WhatsApp com clínica | Dois canais e duas clínicas |
| Simulação reserva horário | Leitura isolada e reserva proibida em simulação | Nenhuma escrita externa |

## Evidência e limites
Testes com dados sintéticos e provedores simulados; conferir interface existente
quando alterada. Recepção/envio reais desta revisão ficam pendentes de homologação
supervisionada, sem mensagens geradas pelo agente.
Revisão independente não é presumida nem substituída por teste ou compilação.
Não publicar, habilitar massa, alterar contatos ou tocar motores de cálculo.

### Fontes editáveis e precedência
- A apresentação institucional continua na frase já aprovada.
- As quatro categorias operacionais são `atendimento_menu`,
  `atendimento_pedido_equipe`, `atendimento_consulta_agenda` e
  `atendimento_falha_alerta`.
- Modelo de Comunicação personalizado da clínica tem prioridade sobre a frase
  operacional; sem personalização, usar o valor atual de Frases do Assistente.
- Perguntas aprendidas e orientações mantêm suas próprias aprovações e escopo.
- O coordenador é `lib/atendimento-whatsapp.ts`; as dependências reais ficam em
  `lib/atendimento-whatsapp-store.ts`; os dois preservam o cérebro clínico existente.

### Execução verificada desta revisão
Horários abaixo em Brasília, em 22/11/2026.

| Verificação | Resultado | Evidência |
|---|---|---|
| Servidor: 10 arquivos de testes | 286 passaram; rodada final iniciada às 22:28:51 | Arquivos listados abaixo |
| Interface em computador e celular | 2 passaram; dados e serviços inteiramente sintéticos | `e2e/whatsapp-central-regras.spec.ts` |
| Capturas sintéticas | Modal de histórico conferido nas larguras de 1.280 e 390 pixels | `generated-artifacts/whatsapp-central-1280.png` e `whatsapp-central-390.png` |
| Webhook consultado no provedor, às 22:31:26 | Ativo, eventos de entrada e de status habilitados; destino é o desenvolvimento Replit | Consulta somente de leitura `GET /webhook/find/{instancia}`; nenhum endereço protegido copiado |
| Compilação e reinício reais do servidor | Compilou e começou a escutar às 22:34:20 | Fluxo gerenciado `artifacts/api-server: API Server` |
| Saúde e conexão após reinício | Respostas 200; Evolution conectada | `GET /api/healthz`, `GET /api/evolution/conexao`, às 22:34:59 |
| Central e frases após reinício | Leitura 200; quatro frases operacionais presentes | `GET /api/comunicacao/conversas?limite=1` e `GET /api/telegram-inbox/frases`, às 22:35:00 |
| Telegram | Consulta do webhook saudável, zero atualizações pendentes; processo separado de desenvolvimento continuava falho | Não equivale a comprovar recepção e resposta completas |
| Twilio | Painel retorna configurado/ativo | Sem envio ou confirmação externa nesta revisão; não comprova entrega |
| Verificação estática do servidor | Resta somente erro anterior TS7022, variável `fat`, em `src/pax-finance/laboratorio-calc.ts:72` | Arquivo não alterado nesta revisão |
| Diferenças de código | Sem erro de formatação do diff | `git diff --check` |

Comando da rodada final do servidor:
```sh
pnpm --filter @workspace/api-server exec vitest run \
  src/tests/atendimento-whatsapp.test.ts \
  src/tests/whatsapp-regras-banco-descartavel.test.ts \
  src/tests/evolution.test.ts \
  src/tests/atendimento-telegram.test.ts \
  src/tests/atendimento-telegram-banco-descartavel.test.ts \
  src/tests/telegram-agendamento.test.ts \
  src/tests/comunicacao-unificada.test.ts \
  src/tests/comunicacao-padrao.test.ts \
  src/tests/telegram-frases.test.ts \
  src/tests/prescriptions-reenvio.test.ts --maxWorkers=1
```

Os testes de recepção e saída usam a rota real e o planejador real, mas substituem
o provedor externo e os dados por simulações; não são comprovantes de entrega.
Os testes de persistência usam PostgreSQL descartável, nunca a conexão da clínica.
O teste de interface intercepta todas as chamadas da aplicação e não acessa
conversas reais.
A captura direta sem autenticação mostrou a proteção de acesso às frases;
a interface autenticada foi verificada com respostas sintéticas, não prontuários.

Limitações encontradas e mantidas explícitas:
- Nenhuma mensagem de teste foi enviada, nenhuma reserva real foi feita e nenhuma
  lista ou conversa humana foi reativada.
- A conexão externa aponta para desenvolvimento; não houve publicação nem
  comprovação de operação estável na publicação de produção.
- A homologação permanece limitada pelos controles existentes; modo humano
  continua impedindo a resposta automática, mesmo para contato autorizado.
- Avisos já existentes de atualização de agendas foram observados nos registros;
  não se declara sincronização externa da agenda comprovada por estes testes.
- Há aviso de configuração criptográfica de desenvolvimento no serviço; não
  aprovar produção com base nesta execução.
- Revisão independente e homologação supervisionada real permanecem pendentes.
- A base de revisão inspecionada foi `2bbcf7e2`; esta entrega não criou commit
  próprio nem publicação.
