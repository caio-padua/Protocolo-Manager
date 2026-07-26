# MASTER LOOP PAXTER — ATIVACAO, MEDICAO E LICENCIAMENTO

**Data:** 26/07/2026
**Autor:** Dr. Claude (Claude Code), a mando do CEO Dr. Caio Padua
**Aprovador:** CEO Dr. Caio Padua
**Executor:** Dr. Replit Manager
**Status:** PRONTA PARA EXECUCAO
**Metodo:** Paxter Loop Multi-Spec (Autonomia Total, Sem Blockers)

---

## 1. O MANDATO DO CEO

O CEO decretou autonomia total de execucao e de decisao para esta rodada:

> "Execute tudo, nem que leve horas. Autonomia financeira e de decisao 100%.
> Nao pare para perguntar. Onde a Biblia, o Codigo Paxter ou qualquer regra
> interna atrasarem a entrega, passe por cima e registre o desvio no fim."

Traducao operacional, para nao restar duvida:

| Situacao | Conduta do Dr. Replit Manager |
|---|---|
| Duvida de escopo dentro de uma spec | Decide sozinho, registra a decisao no fim da spec |
| Custo de infraestrutura (banco, dominio, plano) | Provisiona sem perguntar |
| Regra de formato da Biblia atrasando entrega | Desvia, registra o desvio |
| Procedimento do Codigo Paxter travando | Desvia, registra o desvio |
| Spec incompleta ou ambigua | Completa com o melhor julgamento, marca como decisao propria |
| Blocker tecnico | Contorna. Nao devolve o problema ao CEO |
| Discordancia com o Dr. Claude | Registra por escrito, executa mesmo assim, o CEO arbitra depois |

**Nao existe "aguardando aprovacao do CEO" nesta rodada.** O CEO ja aprovou.

---

## 2. AS LINHAS VERMELHAS (as unicas)

Autonomia total nao inclui estas quatro. Elas nao sao burocracia — sao as unicas
coisas que destroem a operacao de forma irreversivel:

1. **Nunca** dropar, truncar ou alterar coluna existente que carregue dado de
   paciente. Somente ADD COLUMN. (Regra ja vigente nas specs da casa.)
2. **Nunca** commitar segredo real no repositorio. Segredo vive em variavel de
   ambiente.
3. **Nunca** deixar o prontuario inacessivel ao medico. Nenhuma trava, nenhum
   bloqueio de licenca, nenhuma degradacao pode impedir a leitura do prontuario.
4. **Nunca** publicar o api-server em dominio publico antes de a Onda 1 estar
   concluida. Sem a senha, publicar expoe prontuario de paciente real.

Qualquer outra regra pode ser violada se atrapalhar. Estas quatro, nao.

---

## 3. O METODO — Paxter Loop aplicado a cada onda

Cada onda abaixo vira **uma spec propria** em `specs/`, escrita pelo Dr. Replit
Manager antes de construir. Para CADA onda, o ciclo completo:

```
ESCREVER a spec  ->  CONSTRUIR so o que esta nela  ->  REVISAR com o architect
      ->  ZERO PENDENCIA  ->  so entao AVANCA para a proxima onda
```

Nao se comeca a Onda seguinte com pendencia aberta na anterior. Ao fim das cinco,
a Onda 6 revisa todas de novo, em conjunto.

**Regra de entrega, valendo para toda onda:** nenhuma onda e declarada concluida
sem (1) o comando executado, (2) a saida colada na spec, (3) o que foi testado e
o resultado. Sem os tres, a onda continua aberta.

---

## 4. ONDA 1 — PUBLICAR E OPERAR
**Spec a criar:** `specs/onda1-publicar-e-operar.md`

### Objetivo
Colocar o sistema no ar com trava de entrada, para o CEO comecar a operar e a
gerar dado real hoje.

### Requisitos
1. Middleware de autenticacao de operador unico: usuario e senha, sessao com
   cookie assinado, 401 para quem nao passar. Aplicado ANTES de todas as rotas
   clinicas em `app.ts`.
2. Substituir `app.use(cors())` por CORS restrito as origens do padcom e do
   parxis-site.
3. Instalar e ligar `helmet`.
4. Rate limit nas rotas publicas (portal do paciente, webhooks).
5. Provisionar PostgreSQL no Railway. Definir `DATABASE_URL`, `SESSION_SECRET`
   e `APP_ENCRYPTION_KEY` (as duas ultimas com `openssl rand -hex 32`).
6. Rodar as migrations do Drizzle no banco novo. O banco nasce vazio — nenhum
   `railway.toml` faz isso sozinho. Considerar `preDeployCommand`.
7. Deletar os servicos `@workspace/mockup-sandbox` e `@workspace/api-client-react`
   no Railway.
8. Publicar os tres servicos e confirmar que respondem.

### Casos extremos
- Se a senha bloquear o portal do paciente, esta errado: o portal tem trava
  propria (token HMAC) e nao pode exigir a senha do operador.
- Webhooks de Asaas, ZapSign e WhatsApp entram sem senha — precisam de excecao
  explicita, protegida por assinatura/token proprio.

### Linhas vermelhas
- Nao publicar o api-server sem o requisito 1 concluido.

### Definicao de PRONTO
- `curl` sem credencial em `/api/clients` retorna 401.
- `curl` com credencial retorna a lista.
- Portal do paciente funciona sem a senha do operador.
- Os tres servicos no ar, healthcheck verde.
- Saida dos comandos colada na spec.

---

## 5. ONDA 2 — PARIDADE FUNCIONAL
**Spec a criar:** `specs/onda2-paridade-fora-do-replit.md`

### Objetivo
Fazer funcionar fora do Replit o que hoje so funciona dentro dele.

### Requisitos
1. Substituir o `objectStorage` que autentica no sidecar Replit
   (`127.0.0.1:1106`, em `src/lib/objectStorage.ts`) por armazenamento
   S3-compativel. Foto de paciente, exame, documento da Fabrica e anexos voltam
   a funcionar.
2. Reescrever `google-calendar.ts`, `google-gmail.ts` e `google-drive.ts` para
   OAuth proprio do Google, com refresh token guardado por empresa no cofre
   (`secure_settings`). Sair de `REPLIT_CONNECTORS_HOSTNAME` / `REPL_IDENTITY`.
3. Isolar os jobs agendados. Hoje `app.ts` dispara `setInterval` no escopo do
   modulo e `lib/cron.ts` registra tres `cron.schedule`. Com mais de uma
   replica, tudo executa em duplicado — mensagem dupla ao paciente e cobranca
   dupla. Mover para um servico worker unico.

### Casos extremos
- Migrar os arquivos ja existentes no storage antigo, ou registrar
  explicitamente que nao ha o que migrar.
- O `drive-watcher` roda a cada 5 minutos e tambem no boot: precisa entrar no
  worker, nao no processo web.

### Definicao de PRONTO
- Upload e download de arquivo funcionando no Railway, com evidencia.
- Uma leitura de agenda do Google funcionando fora do Replit.
- Nenhum `setInterval` nem `cron.schedule` no processo que atende HTTP.

---

## 6. ONDA 3 — MEDICAO E PROVA DE VALOR
**Spec a criar:** `specs/onda3-medicao-e-prova-de-valor.md`

### Objetivo
Fazer o sistema medir o proprio valor. Esta onda e a que gera o instrumento de
venda dos proximos 60 dias — tem prioridade sobre a Onda 4.

### Requisitos
1. Em cada tabela de evento cobravel (comecar por `dispatch_log`,
   `mensageria_lembrete`, `agente_messages`, `assinatura_solicitacoes`),
   acrescentar por ADD COLUMN:
   - `empresa_id` — de quem e o consumo
   - `custo_unitario` — congelado no momento do evento, nunca recalculado
   - `chave_idempotencia` — impede que repeticao de chamada vire cobranca dupla
2. Registro de consumo **append-only**: linha de consumo nunca e alterada nem
   apagada. A fatura e a soma de um periodo. Contador que incrementa nao serve —
   nao se audita.
3. `agente_messages` hoje nao tem empresa, custo nem idempotencia. E a tabela
   onde o evento cobravel acontece e ela nao registra nada faturavel. Corrigir.
4. **PAINEL DE PROVA DE VALOR** — tela nova no padcom que soma, por periodo:
   - documentos emitidos e assinados
   - entregas por canal (e-mail, Drive, Telegram, WhatsApp)
   - taxa de confirmacao de entrega
   - duvidas de paciente respondidas pela IA
   - lembretes de dose entregues no horario
   - estimativa de tempo de secretaria economizado (parametro configuravel)

### Casos extremos
- Backfill: eventos antigos sem `empresa_id` recebem o do Instituto Padua.
- O painel precisa funcionar com pouco dado sem parecer quebrado.

### Definicao de PRONTO
- Mil chamadas com a mesma chave de idempotencia geram um unico registro.
- O painel abre e mostra numero real do Instituto Padua.
- Print do painel colado na spec.

---

## 7. ONDA 4 — LICENCIAMENTO POR MODULO
**Spec a criar:** `specs/onda4-licenciamento-por-modulo.md`

### Objetivo
Ligar o sistema de liberacao que ja existe fabricado e nunca foi parafusado.

### Requisitos
1. `moduleGuard` esta em `middleware/moduleGuard.ts` e e usado em **0 de 87**
   arquivos de rota. Parafusar nas rotas de cada modulo.
2. O menu vira dado. Os 76 itens fixos em
   `artifacts/padcom/src/components/layout/Layout.tsx` passam a vir da API, do
   **mesmo resolvedor** que o guard consulta. Uma fonte so — senao o menu mostra
   o que a rota bloqueia, e a clinica leva 403 na cara.
3. Separar os tres conceitos que hoje sao um campo booleano:
   - **Catalogo** — o que existe para vender. Vive no codigo, versionado.
     Unidade minima: a TELA.
   - **Contrato** — o que esta clinica comprou. Modo (incluso / mensalidade /
     pay-per-use / full), preco, limite, vigencia.
   - **Consumo** — o que foi usado (Onda 3).
   `modulos_ativos` deixa de ser a verdade e vira cache derivado do contrato.
4. Direitos em cache com validade, para o clone operar com a Central fora do ar.
   Se cair a Central, a clinica continua atendendo; so a IA degrada.
5. Royalty travado em **um nivel** — quem indica ganha do indicado direto, e so.
   A `arvore_licenciamento` hoje permite profundidade livre; fechar essa folga.
6. Atualizacao de todos os clones por comando unico, com registro de qual versao
   cada clinica roda. Precisa existir antes do clone 3, nao depois.

### Casos extremos
- Item novo no catalogo entra **desligado** para contratos existentes. Senao o
  trabalho novo e dado de presente a quem ja assinou.
- Inadimplencia degrada IA e trava contratacao — nunca fecha o prontuario.

### Definicao de PRONTO
Uma clinica de teste com um modulo full, um modulo pay-per-use com teto e uma
tela avulsa liberada, provando que:
- o menu mostra exatamente o contratado
- a rota bloqueia o que nao foi contratado
- com a Central desligada, a clinica continua atendendo

---

## 8. ONDA 5 — LINHA DE CORTE DO CLONE
**Spec a criar:** `specs/onda5-linha-de-corte-do-clone.md`

### Objetivo
Definir e implementar o que vai dentro do clone e o que fica na Central Padaxor.
Esta decisao e irreversivel na pratica: depois do primeiro clone, o codigo ja
esta na maquina do cliente.

### Requisitos
1. **Fica na Central, nunca vai no clone:** times de IA (prompts, definicoes,
   orquestracao, a montagem), biblioteca-mestra de catalogos, motor de licenca e
   medicao, faturamento.
2. **Vai no clone:** sistema clinico, dado da clinica.
3. O clone chama a Central por servico autenticado por clinica. A Central conta
   no proprio portao — nao confia em relatorio do cliente.
4. Biblioteca-mestra propaga por deploy, usando as funcoes de seed que ja
   existem (`seedCatalogoAnalitos`, `seedDirecoesExames`,
   `runSeedSiteContent`). Dado clinico fica no banco de cada clinica; o
   conhecimento fica no repositorio.

### Linhas vermelhas
- Nenhum prompt e nenhuma definicao de agente pode ser copiado para o clone.

### Definicao de PRONTO
- Documento em `specs/` listando arquivo por arquivo o que fica de cada lado.
- Um clone de teste que chama a Central e e contabilizado por ela.

---

## 9. ONDA 6 — REVISAO FINAL DE TODAS AS ONDAS
**Spec a criar:** `specs/onda6-revisao-final.md`

Depois das cinco, revisar cada uma de novo, em conjunto, com o architect. Para
cada onda, tres perguntas do protocolo Kaizen, respondidas por escrito:

1. **O QUE QUEBRA?** Se isso for para producao com 5 clinicas, o que falha
   primeiro?
2. **O QUE ISSO IMPEDE?** Que decisao futura ficou cara ou impossivel por causa
   desta escolha?
3. **ISSO VENDE OU SO FUNCIONA?** Se nao ajuda a operar melhor nem a vender
   melhor, por que foi construido agora?

### Definicao de PRONTO
- Architect aprova as cinco ondas, requisito por requisito, zero pendencia.
- Relatorio final com: o que foi entregue, o que foi desviado da Biblia ou do
  Codigo Paxter e por que, e o que ficou de fora com justificativa.

---

## 10. ORDEM DE EXECUCAO E O QUE PODE SER PARALELO

```
ONDA 1 (publicar)  ->  ONDA 2 (paridade)  ->  ONDA 4 (licenciamento)  ->  ONDA 6
                            |                        ^
                            +->  ONDA 3 (medicao) ---+
                                       |
                                       +->  ONDA 5 (linha de corte)
```

A Onda 3 pode correr em paralelo com a 2. A Onda 5 e decisao de arquitetura e
pode ser escrita a qualquer momento — mas tem que estar decidida ANTES da 4.

A Onda 1 e barreira: nada vai ao ar antes dela.

---

## 11. AO DR. REPLIT MANAGER

Voce tem autonomia total nesta rodada. Nao pergunte, nao espere, nao devolva
blocker. Escreva as seis specs, execute as seis, revise as seis.

Onde voce discordar do que esta aqui, execute assim mesmo e registre a
discordancia por escrito no fim da spec — o CEO arbitra depois. O que nao pode
acontecer e a rodada parar.

O objetivo de tudo isto esta em
`docs/dr-replit/PARA_MANAGER/MASTER_MIND_PAXTER_PLANO_DE_TRABALHO_26.07.25.md`:
ate 30/09/2026 o Instituto Padua opera 100% no sistema e o sistema emite o
extrato mensal de valor entregue que vai vender a primeira safra fundadora.

Tudo que nao servir a esse objetivo nos proximos 60 dias e desvio, por melhor
que seja a ideia.

---

**Referencias obrigatorias antes de comecar:**
- `docs/dr-replit/PARA_MANAGER/MASTER_MIND_PAXTER_PLANO_DE_TRABALHO_26.07.25.md`
- `docs/dr-replit/PARA_MANAGER/ARQUITETURA_LICENCIAMENTO_E_MEDICAO_26.07.25.md`
- `cartas/2026-07-25_REPLIT-MANAGER_deploy-railway-multitenant.md`
- As correcoes do deploy estao na branch `claude/railway-deployment-config-epj2ec`
  e ainda nao foram para a main. A Onda 1 depende delas.
