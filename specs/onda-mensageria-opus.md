# Onda — Mensageria Opus (Carta de Encantamento) no Manager

## 1. Objetivo (conclusão primeiro)

Trazer a ferramenta rica "Mensageria Opus" do primo IHE para o Manager (Padcon
Conect / PAXTER) como **Carta de Encantamento**, com DUAS entregas:

- **(A) Compositor editável** — catálogo de blocos de mensagem por categoria
  (período do dia, dia da semana, semana do mês, versículo de sábado, fala do
  Dr. Caio, status do Dr. Caio, elogio da semana, observação de dose, assinatura)
  com **prévia do WhatsApp ao vivo** e **edição inline** de cada bloco. Marca
  PAXTER e design 3D Paxter (ConsoleShell/panel-3d/bevel-3d/concave-3d).
- **(B) Casamento com o motor automático** — o lembrete por período
  (`executarLembretesPeriodo`) passa a montar a mensagem RICA (envelope Opus +
  bloco de prescrição REAL do cliente), personalizada por dia da semana, semana
  do mês, versículo (sábado) e fala do Dr. Caio, em vez do texto simples.

Kaizen: seed idempotente que NÃO apaga edições do CEO; fallback à mensagem simples
se o catálogo estiver vazio/erro (nunca quebra o envio); botão "Abrir no WhatsApp".

Sistemas PRIMOS: o conteúdo entra NATIVO no Manager (sem tag de origem).

---

## 2. Fonte (IHE) e destino (Manager)

| Peça | IHE (fonte) | Manager (destino) |
|---|---|---|
| Tabela | `mensagens_catalogo` (id/categoria/chave/ordem/conteudo jsonb/ativo, UNIQUE(categoria,chave)) | idem, `lib/db/src/schema/mensagens-catalogo.ts` |
| Seed | `scripts/seed-mensageria-opus.sql` (DELETE+INSERT) | `lib/seed-mensageria-opus.ts` função idempotente (onConflictDoNothing), chamada no boot |
| Rota | `routes/mensagens.ts` | `routes/mensagens-catalogo.ts` (GET agrupado, PUT/:id, POST upsert, DELETE soft) |
| Tela | `mensagens.tsx` (montador `mensagemFinal`) | `pages/comunicacao/carta-encantamento.tsx` (design Paxter) |
| Montador server | (não existia) | `lib/mensageria-opus.ts` (`montarMensagemOpus`) |
| Motor | `templateLembretePrescricao` | idem + extrai `blocoPrescricaoPeriodos`; motor usa `montarMensagemOpus` |

---

## 3. Categorias do catálogo (9 + assinatura)

| Categoria | Chaves | Uso na mensagem |
|---|---|---|
| PERIODO | jejum, inicioManha, meioManha, almoco, inicioTarde, meioTarde, inicioNoite, finalNoite, ceia | saudação, abertura, desejo |
| DIA_SEMANA | segunda..domingo | frase do dia |
| SEMANA_MES | 1..4 | frase da semana do mês |
| ELOGIO_SEMANA | 1..4 | elogio por semana |
| VERSICULO_SABADO | 1..4 | versículo (só sábado) |
| DR_CAIO_FALA | 4 falas | bloco "O Dr. Caio sempre diz" |
| DR_CAIO_STATUS | op1..op5 | linha de status (op5 vazio = sem linha) |
| OBS_DOSE | padrao | aviso "dose ≠ 1 cápsula" |
| ASSINATURA | paxter | fechamento + rodapé de marca PAXTER |

Assinatura adaptada à marca: rodapé PAXTER / Padcon Conect (editável na própria
tela). Versículos, falas, elogios: idênticos ao IHE (conteúdo clínico validado).

---

## 4. Composição (espelha `mensagemFinal` do IHE)

Blueprint: abertura -> prescrição -> fala Dr. Caio -> elogio -> obs dose -> assinatura

```
[saudacao]!            (do PERIODO)
{nome}, tudo bem?      (primeiro nome; Manager não guarda gênero)
[status.texto]?        (se não vazio)
if sábado & versículo:
  *Feliz Sábado!* Hoje estamos na *{semanaFrase}*.
  {versiculo.texto}
else:
  Hoje é *{diaLabel}* — estamos na *{semanaFrase}*.
{periodo.abertura}
{dia.frase}
{periodo.desejo}
[BLOCO DE PRESCRIÇÃO]  (tela: exemplo/placeholder; motor: prescrição REAL)
[fala.texto]?
*{elogio.texto}*  + "Parabéns, {nome}. Continue firme."
[obs.texto]
[assinatura]
```

Partes juntadas por `\n\n`, `filter(Boolean)`.

---

## 5. Casamento com o motor (B)

- Extrair `blocoPrescricaoPeriodos(periodos)` de `templateLembretePrescricao`
  (só a listagem de períodos/fórmulas, SEM saudação nem rodapé).
- `montarMensagemOpus({ nome, agora, periodos })`:
  - Carrega catálogo (cache ~60s, invalidável nas escritas).
  - Mapa período→chave PERIODO: `IM→inicioManha`, `IT→inicioTarde`, `NO→inicioNoite`
    (fallback: label == periodo.nome; senão primeiro PERIODO).
  - `diaChave` pelo dia da semana em BRT; `semanaChave` = min(4, ceil(dia/7)).
  - Rotação determinística por data: fala por dia-do-ano, status por dia-da-semana
    (variedade estável no dia). Elogio/versículo por semana do mês.
  - Injeta `blocoPrescricaoPeriodos(periodos)` no lugar do bloco.
  - Se catálogo vazio → retorna `null`.
- No `executarLembretesPeriodo`: `mensagem = montarMensagemOpus(...) ?? templateLembretePrescricao(...)`
  dentro de try/catch — **nunca quebra o envio** (fallback à mensagem simples).

---

## 6. Não-objetivos

- Não mexer no agendamento/idempotência do motor (janela, lembrete_envios).
- Não criar autsenticação nova (app single-tenant; guard global já cobre).
- Não usar OpenAPI/Orval para esta tela: conteúdo é JSONB livre; espelha o IHE
  com `fetch` direto (decisão consciente).

---

## 7. Critérios de aceite

1. `GET /api/mensagens-catalogo` retorna 9+ categorias agrupadas após o seed.
2. Tela `/comunicacao/carta-encantamento` compõe a prévia ao vivo, edita bloco
   (PUT persiste) e copia/abre no WhatsApp. Design 3D Paxter, marca PAXTER.
3. `montarMensagemOpus` produz a mensagem rica; com catálogo vazio, o motor cai
   no template simples (envio nunca quebra).
4. Item no menu Comunicação + link no hub Mensageria + rota no App.
5. Architect aprova sem pendência severa.
