# Mapa do ecossistema Manager, PAXMED e PAXCARE

Verificado em 28/11/2026 (leitura de arquivos e consultas somente de leitura). Sem segredos e sem dados de pacientes.
Este mapa COMPLEMENTA os documentos existentes. Não substitui nenhuma regra. Índice: [INDICE-DE-ARQUITETURA.md](INDICE-DE-ARQUITETURA.md).

## 1. Como ler este mapa

| Selo | Significado |
|---|---|
| OBSERVADO (data) | Alguém conferiu na fonte nessa data. Pode ter mudado depois. |
| PENDENTE | Sabido, ainda não resolvido. |
| PRETENDIDO | Arquitetura desejada. NÃO está implantada. |
| RESERVADO | Espaço guardado. Não existe projeto, código nem endereço. |

Regra: PRETENDIDO e RESERVADO nunca são lidos como "pronto".

## 2. Organograma descendente (arquitetura PRETENDIDA)

```
                        DR. CAIO (decide tudo)
                                 |
        +------------------------+------------------------+
        |                                                 |
     PAXMED                                           PAXCARE
 (sistema para clinica                          (area do paciente: cofre,
  e medico)                                       planos, compartilhamento)
        |                                                 |
   Vitrine paxmed.com.br                          Vitrine paxcare.com.br
   + futuros sites (5 espacos RESERVADOS)
        |                                                 |
        +------------------------+------------------------+
                                 |
                 LOVABLE = FRENTE DE DESIGN (somente telas)
                 17 projetos catalogados + 5 espacos reservados
                                 |
                  chamadas de API, sem segredo na tela
                                 |
                 MANAGER = regras, autenticacao, dados, integracoes
                  +-----------+-----------+------------+
                  |           |           |            |
              api-server   banco do    arquivos    integracoes
              (regras e    Manager     privados    (Asaas, WhatsApp,
               login)      (PostgreSQL)            Telegram, Google, IA)
                  |
              api-worker (jobs agendados; ver secao 5)
                                 |
                      RAILWAY (hospedagem, ver secao 4)
```

Versão em diagrama (mesma ideia): [lovable-manager.md](lovable-manager.md), seção 2.1.

## 3. O que existe de fato hoje (OBSERVADO)

| Peça | Situação | Data | Evidência |
|---|---|---|---|
| Manager (api-server + padcom) | Existe, roda no desenvolvimento do Replit | 28/11/2026 | processos ativos lidos |
| Vitrines PAXMED e PAXCARE dentro do Manager | Existem no código, ligadas por domínio e caminho. NÃO estão no ar | 28/11/2026 | `artifacts/padcom/src/vitrines`, `host-vitrine.ts` |
| paxmed.com.br | Aponta para a publicação do Replit, versão antiga sem a regra de vitrine; abre direto o sistema | 27/11/2026 | consulta de DNS e do pacote publicado |
| paxcare.com.br | Aponta para a Cloudflare (provável Lovable) | 27/11/2026 | consulta de DNS |
| Sites no Lovable | 17 projetos catalogados; só PAXMED tem código confirmado no repositório de catálogo | 27/11/2026 | `docs/arquitetura/lovable-manager.md` seção 3 |
| Banco publicado no Replit | `neondb` (gerenciado). Tem as 73 tabelas novas; faltam 3 colunas | 27/11/2026 | `docs/operacao/git-e-railway-2026-11-27.md` seção D |
| Banco de desenvolvimento | `heliumdb` (gerenciado) | 28/11/2026 | consulta de leitura |

## 4. Railway: projetos, funções e ambientes

| Projeto | Ambiente | Função | Situação (OBSERVADO) |
|---|---|---|---|
| accomplished-reverence | production | Produção legada do Manager: api-server, padcom, parxis-site, Postgres, railway-mcp-bridge | 27/11/2026: os 3 serviços web respondiam 404 "Application not found"; deploys recentes SKIPPED ou FAILED; sem domínio próprio. Detalhe: `docs/operacao/git-e-railway-2026-11-27.md` |
| perceptive-creation | não informado | Pacote de alterações preparadas, ainda sem aplicar | Auditoria registrada a pedido do Dr. Caio, 28/11/2026 (ver 4.1) |

Identificadores dos serviços de accomplished-reverence: [../RAILWAY-IDS.md](../RAILWAY-IDS.md) (não são segredos).

### 4.1 Auditoria registrada de perceptive-creation

| Fato informado pela auditoria | Tratamento aqui |
|---|---|
| 79 alterações preparadas para 15 serviços | Registrado. NÃO aplicado e NÃO descartado |
| Entre os serviços: bibliotecas internas, `api-worker` e serviços com os mesmos nomes de accomplished-reverence | Risco de confundir ou duplicar serviços entre os dois projetos |
| `api-worker` apenas preparado, nunca implantado | Ver seção 5 |
| Banco | NÃO presumir que seja o mesmo banco de accomplished-reverence. Conferir antes de qualquer ação |
| Teste histórico de saúde da API recebeu 403 | Causa encontrada e corrigida no código local (ver seção 5.1). Correção NÃO publicada |
| Informado pelo Dr. Caio (não reverificado) | Em perceptive-creation restam somente as oito configurações pendentes do worker. Em accomplished-reverence há worker preparado, NÃO implantado, e URL da API preparada para revisão, sem conexão de banco configurada por nós. NÃO afirmar que só há dois serviços em produção nem que a API já serve todas as telas |

Esta documentação não reverificou o Railway; ela guarda o que a auditoria apontou.

## 5. Trabalhador agendado (api-worker) x jobs da API

| Ponto | Situação (OBSERVADO em 28/11/2026) |
|---|---|
| Desenvolvimento | Worker ativo em perfil restrito `telegram-relay-dev`: repasse do Telegram (1 min), conciliação Asaas (3 min), calendário Meus Jogos (15 min) |
| Publicado no Replit | Só api-server; nenhum serviço de worker registrado |
| Jobs dentro da API | Agenda Google (60 s), webhook guard do Telegram (5 min), recuperação do WhatsApp (30 s e 60 s), liberação automática de exames (60 s), limpeza de PDFs de dieta (24 h) |
| Duplicação concreta | O webhook guard do Telegram está na API E no worker `full`. Dois workers no mesmo banco repetiriam farmácia, lembretes e repasse |

### 5.1 Resolvido no código local (NÃO publicado)

| Tema | Causa e correção | Prova (27/11/2026, banco descartável) |
|---|---|---|
| 403 na saúde | O contexto de clínica (`tenantContext.ts`) recusava `/api/healthz` e `/api/health` para sessão sem clínica ativa. Agora só esses dois caminhos saem antes da checagem, sem tocar o banco | `servidor-completo-saude.test.ts`: 10 de 10; rotas protegidas seguem 401/403 |
| Tarefas duplicadas | `lib/exclusividade-tarefas.ts`: trava consultiva do PostgreSQL + carimbo da última execução em `app_settings`. Falha no controle = não executa. Vale para guard do Telegram, jobs da API e cron/temporizadores do worker | `exclusividade-tarefas-banco.test.ts`: 9 de 9; testes do worker 50 de 50 |
| Isolamento entre clínicas A e B | Testes de agenda, exames e medicações | `servidor-completo-clinicas-ab-agenda-exames-medicacoes.test.ts`: 16 de 16 |

Limite: a exclusividade só vale quando este código for publicado. Hoje, no Replit publicado, o worker não existe.

PENDENTE antes de implantar o worker: conferir a lista de jobs do worker contra a da API, escolher onde o webhook guard fica e usar banco diferente do de desenvolvimento. Detalhe: relato de 28/11/2026 no chat do Dr. Caio; os arquivos são `artifacts/api-worker/src/worker.ts` e `artifacts/api-server/src/index.ts`.

## 6. Catálogo vivo (sites, botões, contratos, testes, responsáveis, integrações)

Arquivo único: [`catalogo/catalogo-ecossistema.json`](catalogo/catalogo-ecossistema.json).

| Seção do catálogo | O que guarda |
|---|---|
| `sites` | cada site: situação, data, responsável, última revisão, link do projeto Lovable ou caminho do código |
| `botoes` | rótulo, destino e contrato de cada botão das vitrines |
| `contratos` | método, rota, arquivo do servidor, autenticação, testes ligados |
| `testes` | arquivo, tipo e último resultado conhecido, com data |
| `integracoes` | serviço, dono (Manager) e observação, sem credencial |
| `railway` | projetos, serviços e situação observada |

### 6.1 Como acrescentar um site novo (sem criar projeto falso)

1. Abra o catálogo e vá em `sites`.
2. Para um espaço já reservado (`futuro-01` a `futuro-05`): troque a situação para `pendente`, preencha nome e finalidade e peça ao Dr. Caio o domínio.
3. Só preencha `projetoLovableUrl` quando o projeto existir de verdade.
4. Para cada botão novo, acrescente uma linha em `botoes`, ligada a um `contratoId` existente (ou sem contrato, se não chama o servidor).
5. Rode `pnpm run check:catalogo`. Ele aponta o que ficou sem ligação.
6. Registre a data em `verificadoEm` e `ultimaRevisao`.

## 7. Quem protege o quê (visual)

```
 MUDANCA NO CATALOGO OU NO CODIGO
        |
        v
 [1] VERIFICACAO AUTOMATICA  ----> pega erro de escrita e de ligacao
        |
        v
 [2] REVISAO HUMANA          ----> pega erro de sentido e de decisao
        |
        v
 [3] BACKUP TESTADO + HOMOLOGACAO ----> so para banco, dinheiro, dominio e publicacao
```

| Camada | O que cobre | O que NÃO cobre |
|---|---|---|
| 1. `pnpm run check:catalogo` e `pnpm run test:catalogo` | id repetido, referência ausente, arquivo ou rota citados que não existem, destino de formulário divergente, projeto falso em espaço reservado, plano marcado como implantado, padrões óbvios de segredo, CPF e e-mail | Se o site publicado, o Railway ou o banco estão como o catálogo diz. Mudanças fora do que está escrito no catálogo. Segredo ou dado pessoal em formato incomum |
| 1. `pnpm run check:paxter-governance` | documentos de regra do Paxter (já existente) | o resto do sistema |
| 1. Testes de domínio da vitrine e de convites em banco descartável | regra por domínio; gravação de convite | fluxo completo em produção |
| 2. Revisão humana | texto do catálogo, decisões, se o plano ainda vale | cansaço e pressa; use a lista da seção 8 |
| 3. Backup testado + homologação | migração de banco, cobrança, DNS e domínio, publicação, Railway | nada disso é automático nem pode ser feito sem ordem escrita |

As verificações automáticas reduzem erros; não garantem que não haja conflito nem que tudo foi detectado.

## 8. Lista de revisão humana (antes de mudar o catálogo ou publicar)

1. A situação escrita é a observada, com data? Plano não foi escrito como pronto?
2. Algum segredo, CPF, e-mail ou dado de paciente entrou no texto?
3. Alguma ação toca banco, Railway, domínio, cobrança ou credencial? Então exige ordem escrita, backup testado e homologação.
4. Os dois bancos (Replit e Railway) foram tratados como diferentes até prova em contrário?
5. O worker foi comparado com os jobs da API antes de qualquer implantação?

## 9. Pendências conhecidas

| Nº | Pendência | Dono |
|---|---|---|
| 1 | Publicar a correção do 403 e da exclusividade de tarefas; depois repetir o teste de saúde no ambiente publicado | Dr. Caio |
| 2 | Decidir o destino do pacote de 79 alterações de perceptive-creation | Dr. Caio |
| 3 | Conferir worker x jobs da API e o webhook guard | agente (leitura), Dr. Caio (decisão) |
| 4 | Publicar a versão nova para as vitrines por domínio funcionarem | Dr. Caio |
| 5 | Inventariar os 15 projetos Lovable restantes | Dr. Caio autoriza |
| 6 | Conferir as 3 colunas de banco faltantes antes de publicar | Dr. Caio |
| 7 | Confirmar qual banco real a publicação usa hoje, a topologia de tarefas ativas e qual domínio recebe a API (não reverificado nesta sessão; último registro: `neondb`, 27/11/2026) | agente (leitura) após autorização |
| 8 | Espelho do Paxter: sincronizado em 27/11/2026 por prova (ver índice). Conferir que o commit do espelho foi incluído no merge | Dr. Caio |

RESUMO EM 1 LINHA: o Lovable desenha, o Manager manda, o Railway hospeda; tudo aqui está marcado como observado, pendente ou pretendido, e o plano nunca vale como implantado.
