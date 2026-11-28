# Especificação — Identidade do laudo: menos falso bloqueio, mesma segurança (regras por clínica)

Data: 16/11/2026. Dono do pedido: Dr. Caio. Estado: implementado e testado com dados sintéticos; NÃO homologado; NÃO publicado.

## 1. Pedido (resumo fiel)

1.1 Pequena divergência de grafia do nome (Dayana / "Dai ana", Souza / Sousa, abreviação, acento, ordem dos sobrenomes) com CPF válido e idêntico ao cadastro e sem contradição forte de nascimento ou outro identificador: aceitar, processar, vincular, registrar apelido e trilha explicativa.
1.2 Nome parecido nunca prova identidade. Nenhuma nota de semelhança substitui o CPF.
1.3 CPF divergente ou inválido, nascimento explicitamente diferente, sinal de dois pacientes no mesmo PDF ou evidência material contraditória: quarentena e revisão humana.
1.4 CPF ausente: permitir análise PRELIMINAR sem inserção definitiva; correlação conservadora.
1.5 Não pedir confirmação humana para variante já verificada por CPF; registrar a decisão e permitir auditoria posterior.
1.6 Criar: matriz de regras por clínica dentro de limites globais; histórico de decisões por versão; métricas de falso bloqueio e de erro de vinculação; testes determinísticos de variantes, homônimos e conflitos.
1.7 Separar em 4 etapas: (1) ingestão segura do original, (2) verificação de identidade, (3) depuração, (4) incorporação ao prontuário.

## 2. As 4 etapas no código

| Etapa | Onde acontece | O que garante |
|---|---|---|
| 1. Ingestão segura do original | `startExamIngestion` grava o documento com a clínica do cliente e a cópia interna | o original é preservado antes de qualquer leitura; nada vai ao prontuário |
| 2. Verificação de identidade | `runIdentityGate` + `assessIdentity` + detectores de evidência | decisão registrada em `exam_identity_checks` (imutável) com versão das regras e trilha |
| 3. Depuração | leitura por IA (já existente) | roda antes da etapa 2, mas o resultado só fica retido em quarentena se a etapa 2 não aprovar |
| 4. Incorporação | `incorporateExtractedExam` / `persistExtractedResults` | só executa com decisão `incorporar` ou `incorporar_com_alias`, ou após liberação humana |

Lacuna declarada: a leitura por IA (etapa 3) ainda acontece antes da verificação (etapa 2), como na primeira entrega. Inverter a ordem exigiria extrair CPF e nome por método separado e barato antes da leitura completa. Não foi feito neste pedido.

## 3. Regras

### 3.1 Limites globais (nenhuma clínica altera)

| Número | Regra |
|---|---|
| G1 | Variante ou nome parcial só é aceito com CPF válido e igual ao cadastro |
| G2 | Sem CPF comparável, só nome exato com nascimento igual entra no prontuário; variante vira análise preliminar |
| G3 | CPF válido e diferente, CPF inválido ou ilegível, nascimento diferente, nome sem nenhuma palavra em comum: quarentena |
| G4 | Dois CPFs válidos distintos no texto do laudo: quarentena |
| G5 | Data de coleta anterior ao nascimento cadastrado: quarentena |
| G6 | Tolerância de edição por palavra: no máximo 2 letras |
| G7 | Toda decisão grava registro imutável com trilha e versão das regras; CPF completo nunca vai para a trilha |

### 3.2 Matriz configurável por clínica (só dentro dos limites)

| Chave | Valores | Padrão |
|---|---|---|
| `variantesComCpf` | verdadeiro / falso | verdadeiro |
| `tiposDeVarianteAceitos` | fonetica, grafia, inicial, abreviacao, ordem, token_dividido, subconjunto, alias_conhecido | todos |
| `distanciaMaximaEdicao` | 0, 1, 2 | 2 |
| `nomeParcialComCpf` | quarentena / aceitar_com_nascimento_igual / aceitar | aceitar_com_nascimento_igual |
| `exigirNascimentoParaAutoAceite` | verdadeiro / falso | falso |
| `permitirPreliminarSemCpf` | verdadeiro / falso | verdadeiro |

3.2.1 Chave desconhecida, tipo errado ou valor acima do teto: a gravação é recusada com 400 e lista de motivos. Nunca se ajusta em silêncio.
3.2.2 Gravar exige colaborador autenticado com perfil dono da plataforma, administrador ou médico, vinculado à clínica da sessão, e justificativa de pelo menos 15 caracteres.
3.2.3 Cada gravação é uma versão nova (tabela `exam_identity_rule_sets`, imutável). Voltar ao padrão também é uma versão nova.
3.2.4 Configuração gravada ilegível: aplica-se o modo MAIS rígido, a trilha avisa, e a tela de regras mostra `degradado: true`.

### 3.3 Decisões

| Decisão | Efeito |
|---|---|
| `incorporar` | identidade provada sem divergência; entra no prontuário |
| `incorporar_com_alias` | provada pelo CPF com variante de nome; entra, grava apelido e trilha |
| `preliminar` | CPF ausente com variante de nome e nascimento igual; fica em quarentena, SEM resultados no prontuário, com prévia dos analitos para conferência |
| `quarentena` | revisão humana (fluxo existente de liberar ou rejeitar) |

### 3.4 Reconhecimento de variantes (sem nota de semelhança)

3.4.1 Palavras comparadas sem depender da ordem (aceita "FERREIRA, Dayana").
3.4.2 Chave fonética do português: y=i, ss=s, z=s, c antes de e/i = s, ph=f, k=c, h mudo, letras dobradas.
3.4.3 Palavras separadas ou coladas ("Dai ana" = "Dayana") quando a junção casa com uma palavra do outro lado.
3.4.4 Inicial e abreviação com ponto.
3.4.5 Nome do meio ou sobrenome omitido, desde que a primeira e a última palavra do nome mais longo casem.
3.4.6 Pelo menos duas palavras casadas por letras (não só iniciais).
3.4.7 Cada divergência recebe um tipo nomeado, que vai para a trilha e para a regra da clínica.

### 3.5 Apelidos
Gravados em `exam_identity_aliases` (por cliente, por clínica) só quando o CPF provou a identidade. Um apelido conhecido conta como grafia aceita nos laudos seguintes, mas NUNCA substitui o CPF. Revogar = preencher `revoked_at`; nada é apagado.

### 3.6 Auditoria posterior
3.6.1 `GET /exames-lab/identidade/auto-aceitos` lista os aceitos automaticamente (filtros: somente com apelido, somente pendentes de auditoria).
3.6.2 `POST /exames-lab/documentos/:id/identidade/auditoria` com `confirmou` ou `vinculo_incorreto`, justificativa de 10 caracteres ou mais; uma auditoria por documento.
3.6.3 `vinculo_incorreto`: o documento passa para o status `identidade_rejeitada` (some do prontuário e da evolução), o status anterior fica gravado no registro, o apelido é revogado. Nenhum resultado é apagado (Regra de Ouro).

### 3.7 Métricas (`GET /exames-lab/identidade/metricas`)
Por versão das regras: total, auto-aceitos, com apelido, preliminares, quarentenas, bloqueios liberados por humano, bloqueios confirmados por humano, ainda sem decisão, auto-aceitos auditados, vínculos incorretos, taxa de falso bloqueio provável, taxa de erro de vinculação, cobertura da auditoria. Taxa sem denominador é `null`, nunca 0%.

## 4. Mudanças de comportamento anunciadas (decisões anteriores alteradas)

| Antes | Agora | Motivo |
|---|---|---|
| Sem CPF, nome com variante + nascimento igual confirmava | vira `preliminar` (não entra no prontuário) | pedido 1.4 e limite G2 |
| CPF inválido com nome e nascimento exatos confirmava | quarentena | pedido 1.3 e limite G3 |
| Nome parcial com CPF igual confirmava | entra só com nascimento igual (padrão); sem nascimento, quarentena; clínica pode mudar | conservador por padrão, configurável |
| Ordem dos nomes importava | não importa | pedido 1.1 |

## 5. Falhas previstas

| Número | Falha | Barreira | Prova |
|---|---|---|---|
| F1 | Homônimo com CPF de outra pessoa aceito pela semelhança do nome | CPF diferente é quarentena e nenhum apelido nasce | teste unitário e de banco |
| F2 | Variante aceita com nascimento explicitamente diferente | G3 | teste unitário e de banco |
| F3 | Dois pacientes no mesmo PDF | G4 (só CPF formatado ou rotulado; número solto é protocolo) | testes |
| F4 | Clínica afrouxa além do limite | validação recusa com 400; chave nova desconhecida também | teste de banco |
| F5 | Regra corrompida vira "tudo liberado" | modo mais rígido e aviso | teste de banco |
| F6 | Duas gravações de regras ou duas auditorias simultâneas | índice único e transação; uma vence, a outra recebe 409 ou nova versão | teste de banco |
| F7 | Vazamento entre clínicas (regras, lista, histórico, métricas, prévia) | clínica sempre da sessão; 404 em leitura de outra clínica | teste de banco |
| F8 | CPF completo na trilha, na lista ou nas métricas | trilha só diz "CPF: igual"; testes procuram os 11 dígitos | teste de banco |
| F9 | Banco anterior com lista curta de eventos | migração amplia a restrição uma vez e é idempotente | teste sobre banco anterior |
| F10 | Resultado de vínculo incorreto continuar visível | status `identidade_rejeitada` filtrado na evolução e no prontuário | teste do status; filtro revisado no código |

## 6. Lacunas declaradas (não resolvidas neste pedido)

6.1 Leitura por IA ainda ocorre antes da verificação (ver seção 2).
6.2 Evidências por sexo, telefone e endereço não são comparadas (o laudo extraído não traz esses campos).
6.3 O detector de dois CPFs só olha o texto do PDF; laudos lidos por visão (sem texto) registram na trilha que não foi avaliado.
6.4 A cópia no Drive e no cofre de um documento com vínculo incorreto não é retirada automaticamente.
6.5 Outros leitores diretos de `exam_results` (além da evolução e do prontuário) não foram todos revisados quanto ao status `identidade_rejeitada`.
6.6 Não há tela: tudo está em rotas. A tela de matriz de regras, a lista de auditoria e o painel de métricas ainda precisam ser desenhados no padrão Paxter.
6.7 Uma auditoria por documento; mudar de ideia depois exige novo mecanismo.
6.8 A taxa de falso bloqueio é provável, não exata: liberação humana indica, mas não prova, que o bloqueio era desnecessário.
6.9 Revisão independente sequencial (Art. 80) ainda não executada.
6.10 Nenhum laudo real foi processado; tudo foi testado com dados sintéticos e PostgreSQL descartável.
