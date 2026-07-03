---
name: Mensageria Opus (compositor editável clonado do IHE)
description: Como o compositor de mensagem rica do WhatsApp casa tela + motor automático sem drift; onde mora a fonte única de composição.
---

# Mensageria Opus — Carta de Encantamento

Compositor de mensagem rica do WhatsApp (períodos × dia-da-semana × semana-do-mês
+ versículo de sábado + fala/status do Dr. Caio + elogio + assinatura), clonado do
primo IHE para o Manager como catálogo editável em banco.

## Regra durável: uma composição, dois consumidores
- A MESMA lógica de composição roda no servidor (`montarMensagemOpus`) para o motor
  automático de lembrete por período E é replicada na tela para a prévia. São DUAS
  implementações da mesma estrutura — risco de DRIFT. Se mexer no blueprint (ordem
  dos blocos, sábado→versículo, filter(Boolean).join("\n\n")), mexer nos DOIS.
- **Por quê:** o CEO edita na tela e espera que o lembrete automático saia idêntico.

## Casamento com o motor (nunca quebrar envio)
- O motor tenta `montarMensagemOpus` e cai por `try/catch` no template legado quando
  o catálogo está vazio/erro. Fallback é obrigatório: composição rica nunca pode
  derrubar o disparo do lembrete.

## Catálogo (conteudo = JSONB livre)
- `conteudo` é objeto livre por categoria; por isso a rota CRUD NÃO usa OpenAPI/Orval
  (decisão consciente, espelha o IHE). DELETE é soft (`ativo=false`), upsert por
  `(categoria, chave)`, e TODA escrita invalida o cache do montador (TTL 60s).
- Seed idempotente no boot com `onConflictDoNothing` por `(categoria, chave)`.
- Assinatura adaptada à marca PAXTER (chave "paxter"), sem "Sr." (só primeiro nome).

## Armadilha da tela
- Chaves-padrão do estado (period/status/fala/versículo) DEVEM bater com as chaves do
  seed senão os selects abrem vazios. Editor inline deve expor TODOS os campos do
  bloco (a assinatura tem 7 campos incluindo 4 de rodapé) para a promessa de "editável"
  ser real — o backend aceita o `conteudo` inteiro.
