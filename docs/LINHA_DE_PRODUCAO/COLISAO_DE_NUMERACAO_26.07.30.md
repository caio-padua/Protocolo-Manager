# COLISAO DE NUMERACAO DA LINHA DE PRODUCAO — 30/07/2026

> Registro de incidente. Escrito pelo Dr. Code em 30/07/2026, apos conferir
> a main, o commit 3a38349 e a pasta do Google Drive do CEO.
>
> Resumo em uma linha: a fila de producao foi escrita duas vezes em paralelo,
> os dois arquivos usam os MESMOS numeros para itens DIFERENTES, e a copia da
> planilha no Drive do CEO foi substituida sem aviso. E a quarta colisao da
> equipe, e a primeira que atingiu o proprio instrumento de coordenacao.

---

## 1. O QUE FOI ENTREGUE DE VERDADE (conferido, nao afirmado)

O Dr. Replit entregou codigo real. Isso nao esta em duvida e nao e o problema.

| Verificacao | Resultado |
| --- | --- |
| Commit `3a38349` existe | sim, autor `Dr. Replit Paxter`, 30/07/2026 00:12 |
| Esta na `main` | sim, confirmado por `git branch -r --contains` |
| Volume | 4 arquivos, 268 linhas acrescentadas, 194 removidas |
| Item 11 (tela de login) | `artifacts/padcom/src/pages/login/index.tsx` criado; `CollaboratorGate` passou a redirecionar para `/login?returnTo=<rota>`; codigo morto removido |
| Item 15 (marca) | `artifacts/padcom/index.html` com titulo e titulo de aplicativo corrigidos |

Entrega legitima, com hash e com codigo. O incidente e de coordenacao, nao de
qualidade do trabalho.

---

## 2. O DEFEITO: DOIS SIGNIFICADOS PARA O MESMO NUMERO

Existem hoje duas filas, escritas em paralelo, na mesma pasta:

```
docs/LINHA_DE_PRODUCAO/
  README.md                                     <- fila do Dr. Replit (na main)
  LINHA_DE_PRODUCAO_PADAXOR_VERSAO_26.07.29.md  <- fila do Dr. Code (PR #6)
  PADAXOR_LINHA_DE_PRODUCAO_26.07.29.xlsx       <- planilha do Dr. Code
.agents/outputs/
  PADAXOR_LINHA_DE_PRODUCAO_26.07.29.xlsx       <- planilha do Dr. Replit, MESMO NOME
```

O `git` aceitou as duas sem conflito, porque os nomes de arquivo sao
diferentes. E exatamente o modo de falha que a fila existia para impedir:
duas verdades convivendo em silencio.

### Onde o mesmo numero significa coisas diferentes

| Nº | Na fila do Dr. Code | Na fila do Dr. Replit |
| --- | --- | --- |
| 8 | `empresa_id` na tabela `professionals` (Dr. Code, P0) | Linha de producao sincronizada (Dr. Replit, CONCLUIDO) |
| 9 | Isolamento entre clinicas por RLS (Dr. Code, P0) | Isolamento multi-tenant (Dr. Replit, P0) |
| 10 | Marca distinta nos dois esquemas de senha (Dr. Code, P0) | Auditoria de rotas: vazamento entre empresas (Dr. Replit, P0) |
| 11 | Tela de login dentro do padaxor (Dr. Replit, P1) | aparece DUAS VEZES: tela de login CONCLUIDA, e RBAC por empresa (Dr. Code, P0, aberto) |
| 12 | Site vira botao, nao segundo login (Dr. Lovable, P1) | DNS para Cloudflare (Dr. Caio, P1) |
| 13 | DNS do padaxor.com.br no Cloudflare (Dr. Caio) | Dominio proprio no Railway (Dr. Code) |
| 15 | Marca PAXTER para PADAXOR no painel (Dr. Replit) | aparece DUAS VEZES: titulo CONCLUIDO, e telas internas AGUARDA CEO |
| 16 | Porta da area do paciente (Dr. Lovable, P1) | Catalogo de modulos com precos (Dr. Replit, P2) |
| 19 | Catalogo de modulos com precos (Dr. Caio, decisao) | Bilhetagem de uso por clinica (Dr. Code, P2) |
| 31 | Colapsar o Supabase (Dr. Lovable, P3) | Planos do paciente (Dr. Lovable, P3) |

### Numero repetido dentro do mesmo arquivo

Conferido por contagem programatica da tabela do `README.md`: 38 linhas de
item para 36 numeros distintos. Os numeros 11 e 15 aparecem duas vezes cada,
com item, dono e estado diferentes em cada ocorrencia.

Consequencia pratica imediata: o recado "proximos liberados para voce: 9 e 11
(RBAC)" nao pode ser obedecido, porque no mesmo arquivo o item 11 esta
marcado CONCLUIDO e ABERTO ao mesmo tempo.

### O recado contradiz a propria tabela que o acompanha

O recado diz "Dr. Lovable pode comecar o item 12". Na tabela do mesmo arquivo,
o item 12 e "DNS para Cloudflare", do Dr. Caio. O item 12 do Dr. Lovable
existe apenas na outra fila. O recado foi escrito numa numeracao e a tabela
noutra, dentro do mesmo documento.

### Contradicao de territorio

A matriz do `README.md` atribui o item 9 (isolamento multi-tenant no banco)
ao Dr. Replit, e na linha seguinte declara que o Dr. Replit "nunca toca sem
avisar: banco em producao". As duas frases nao podem valer juntas. As duas
matrizes concordam que o banco e do Dr. Code — e essa concordancia resolve o
caso.

---

## 3. ITENS QUE DESAPARECERAM NA SEGUNDA FILA

Estes existem na fila do Dr. Code e nao tem equivalente na do Dr. Replit.
Um deles e P0.

| Nº | Item | Prioridade | Por que importa |
| --- | --- | --- | --- |
| 10 | Marca distinta nos dois esquemas de senha (`scrypt-col$` e `scrypt-pac$`) | P0 critico | Foi a causa raiz da falha de login que custou uma noite. Os dois esquemas gravam `scrypt$` hoje. Sumiu da segunda fila. |
| 17 | Indice unico em `lower(login_username)` | P1 alto | Impede dois colaboradores com o mesmo usuario |
| 29 | SPF e DKIM no dominio proprio | P1 alto | Sem isso o convite de licenciado chega marcado como golpe |
| 30 | `railway.toml` versionado | P3 baixo | Hoje a configuracao vive so no painel; se o projeto sumir, o codigo nao reconstroi o sistema |
| 31 | Colapsar o Supabase | P3 baixo | Espelho e transicao, nao destino |
| 35 | `X-Request-Id` e contrato `openapi.yaml` | P3 baixo | Acaba com reclamacao sem rastro |

Em sentido contrario, a fila do Dr. Replit trouxe itens novos e legitimos que
nao existiam na primeira: auditoria de vazamento entre empresas, ZapSign em
producao, notificacao por WhatsApp pos-consulta, PWA do portal do paciente,
painel de receita recorrente, cockpit em tempo real, documentacao tecnica
viva, integracao com Telegram, e duas missoes para o Dr. Manus. Mais a
decisao de isolamento entre os repositorios Padaxor e Parlegis, que e um
risco real e nao estava mapeado.

Nada disso se perde. Entra como numero novo a partir de 37, nunca
reaproveitando numero existente.

---

## 4. A PLANILHA DO DRIVE FOI SUBSTITUIDA

| Verificacao | Resultado |
| --- | --- |
| Arquivo entregue ao CEO em 29/07, identificador `10RrkOPg...` | NAO EXISTE MAIS. Consulta ao Drive devolve "entidade nao encontrada" |
| Arquivo presente na pasta PADAXOR PROJETO agora | identificador `1U84ZS2E...`, 41.001 bytes, criado 30/07/2026 00:06:40 |
| Nome | identico ao anterior: `PADAXOR_LINHA_DE_PRODUCAO_26.07.29.xlsx` |
| Origem provavel | `.agents/scripts/upload-drive.mjs`, acrescentado na main no commit `a86f804` |
| Ja foi editado pelo CEO? | nao: `modifiedTime` igual ao `createdTime`, nenhuma resposta perdida |

O CEO foi orientado duas vezes a abrir a planilha e responder a decisao
numero 2. A planilha que ele abriria agora nao e a que foi descrita: os
numeros que cada decisao destrava sao outros. A decisao 2 e a mesma pergunta
nas duas filas (valores dos modulos), o que evitou dano — por coincidencia,
nao por desenho.

Nenhuma resposta do CEO foi perdida, porque o arquivo novo nunca foi editado.

---

## 5. A CAUSA RAIZ, EM UMA FRASE

Dois agentes receberam a mesma tarefa de coordenar e nenhum dos dois sabia
que o outro a tinha recebido. A coordenacao precisa de um unico escritor,
como qualquer outro recurso compartilhado.

---

## 6. A CORRECAO: UM ESCRITOR, NUMERO IMUTAVEL, ESTADO CONFERIDO POR MAQUINA

### Regra 1 — um unico escritor da fila

Um so agente escreve a fila e a planilha. Os outros pedem a mudanca pelo
recado. Motivo: a fila e recurso compartilhado; recurso compartilhado com
dois escritores corrompe sem avisar, foi o que aconteceu aqui e no
`drizzle.config.ts`.

### Regra 2 — numero de item e identidade permanente

Numero nunca se reaproveita, nunca se reatribui, nunca se renumera. Trabalho
novo recebe numero novo a partir do maior existente. E o mesmo princípio do
Art. 28-A da Biblia, aplicado a item de fila em vez de versao de documento.
Quando duas filas divergem, os numeros da fila que tem verificacao automatica
prevalecem, e os itens da outra entram como numeros novos.

### Regra 3 — quem entrega nao anuncia estado em prosa

Quem conclui um item muda o ESTADO na fila e cita o hash. O recado em prosa
fica para o que nao e estado: aviso, pergunta, risco encontrado. Motivo:
prosa e onde a numeracao errada se esconde.

### Regra 4 — o que esta livre e calculado, nao afirmado

`conferir_coerencia.py` le a cadeia de dependencias inteira e responde quem
pode comecar o que. Enquanto o estado vem de calculo, ninguem precisa
perguntar, e por isso o CEO deixa de ser pombo correio.

O conferidor passou a acusar tambem numero de item repetido — o defeito
exato deste incidente.

### Regra 5 — um unico dono do envio para o Drive

Dois scripts subindo arquivo de mesmo nome para a mesma pasta se sobrescrevem
em silencio. Um dono, um script.

---

## RESUMO EM 1 LINHA

A fila foi escrita duas vezes, os numeros 8 a 31 significam coisas diferentes
nas duas versoes, os numeros 11 e 15 significam duas coisas dentro da mesma
versao, a planilha do Drive do CEO foi substituida sem aviso e sem perda de
resposta, e a correcao e um unico escritor com numero imutavel e estado
conferido por maquina.
