---
name: Evolution API (WhatsApp por QR Code)
description: canal provisório por clínica; homologação com lista de contatos autorizados; o que já foi provado com servidor real
---
- Chave e token do webhook ficam no cofre por empresa; identidade e canal precisam ser únicos antes de consultar dados.
- Homologação (padrão ligado): só números de EVOLUTION_CONTATOS_AUTORIZADOS (vírgula) enviam/recebem; lista vazia bloqueia tudo; sai só com EVOLUTION_HOMOLOGACAO=false.
- Motor de entrada fica desligado por padrão; ativação é por clínica; aceite do provedor não comprova entrega ou leitura.
- Vínculo de teste fica separado de `clients.phone`; quatro dígitos só resolvem um contato já autorizado quando a correspondência é única.
**Why:** número autorizado diferente do cadastro canônico não prova identidade; preservar os dois registros evita atribuir conversas à pessoa errada.
**How to apply:** vincular pelo painel de homologação com confirmação administrativa; nunca inferir cliente por sufixo nem sobrescrever o cadastro principal.

## Homologação supervisionada (lições)
- A lista EVOLUTION_CONTATOS_AUTORIZADOS é lida do ambiente do processo: trocou o segredo, reiniciar a API (tela só muda após reinício).
- A Evolution aceita até 4000 caracteres por envio; acima disso, dividir sem perda e interromper na primeira falha.
- Pergunta simulada não entra no histórico como mensagem recebida nem cria solicitação, cobrança, documento ou reserva.
- Entrega efetiva ("entregue"/"lido") depende de confirmação do provedor; nunca inferir status pelo aceite do envio.

## Ordem das confirmações do provedor

Confirmações de entrega e leitura podem chegar antes da resposta da chamada de envio ou simultaneamente.
Uma confirmação mais avançada não pode ser descartada porque outra atualização venceu a corrida.

**Why:** a ordem da rede não acompanha a ordem das operações locais; comparar apenas um estado previamente lido perde evidência legítima.

**How to apply:** testar confirmação precoce, entrega e leitura concorrentes, repetição e retorno atrasado, mantendo o estado mais avançado e sem repetir envios externos.

## Segredos em endereços registrados

A redação genérica do objeto de log não substitui a proteção do endereço dentro do serializador de requisição.
Links protegidos precisam ser ocultados nos registros, mas preservados na resposta entregue ao cliente.

**Why:** a transformação do objeto pode ocorrer antes da serialização da requisição; nessa ordem, um segredo no caminho do endereço ainda pode aparecer no registro final.

**How to apply:** verificar o registro final com credencial sintética e testar separadamente que a resposta da aplicação mantém o link funcional.

## Assistente resolutiva e limite médico

A assistente deve resolver pedidos de documentos já emitidos e explicar somente orientações clínicas aplicáveis já aprovadas, em vez de encaminhar por padrão quando os recursos existentes permitem resolver.

**Why:** o responsável autorizou expressamente esse comportamento; a autorização não permite inventar fatos, aprovar rascunhos clínicos nem decidir nova prescrição ou mudança de tratamento.

**How to apply:** procurar o recurso correto da própria pessoa e clínica, preservar textos editáveis e registrar aceite, entrega e leitura separadamente. Na ausência de arquivo verificável ou orientação aprovada, informar a lacuna. Número exato confirmado não se substitui por variante com dígito adicional por conveniência.

## Apresentação operacional da Helena

Saudações e perguntas sobre a identidade da assistente do Instituto Pádua usam a apresentação exata aprovada pelo responsável, sem depender da existência de orientação clínica aprovada.

**Why:** o responsável separou explicitamente as regras de comunicação institucional da biblioteca clínica; a ausência de orientação não é resposta adequada a “com quem estou falando?”.

**How to apply:** manter o texto editável e a identidade da própria clínica; não interpretar uma saudação inicial como motivo para ignorar o restante clínico da mensagem, a lista autorizada ou o modo humano.

## Atendimento por regras e contexto numérico

O atendimento deve priorizar regras e conteúdos aprovados e editáveis da própria clínica, sem exigir inteligência artificial para reconhecer pedidos comuns.
Modelos institucionais não constituem fonte de fatos médicos, preços, direitos a retorno ou existência de documentos.
O modo humano não deve ser reativado silenciosamente ao corrigir o classificador.

**Why:** o responsável determinou dependência mínima de inteligência artificial e resolução pelos recursos reais; automatizar não autoriza desfazer uma decisão humana de pausa.

**How to apply:** reutilizar os motores existentes, revalidar identidade e fonte antes da saída e informar lacunas sem inventar encaminhamento.
Uma opção numérica só pertence ao menu se o contexto recente e entregue for esse menu, da mesma pessoa, canal e clínica; caso contrário, preservar o diálogo de documento ou agenda.

## Agrupamento, Sinapses e Base Global (23/11/2026)
- Espera de 4 s (teto 12 s) só em desenvolvimento/produção; teste usa `NODE_ENV=test` ou `EVOLUTION_AGRUPAMENTO_MS=0` para processar direto.
- Resposta editada de FAQ só vale com a fonte ainda `aprovada` (antes sobrevivia à revogação).
- Rotas Express novas: não usar `:param(a|b)` (path-to-regexp novo quebra o boot da API); registrar uma rota por valor.
- Base Global: só intenção + variação limpa; limpeza RECUSA em vez de remendar; origem só como hash com sal; telas ainda pendentes.
**Why:** evitar vazamento entre clínicas e queda do servidor. **How to apply:** qualquer promoção passa por `limparVariacaoParaBaseGlobal`.
- Croqui em 4 etapas em specs/cerebro-atendimento-croqui-etapas.md; etapa 1 executa só o que consta lá. Endereço vem de `empresas` na hora da resposta (nunca texto fixo); negação remove orações "não quero X" antes de classificar; intervalo de agrupamento é por clínica (`agrupamento_ms`, 0 desliga).
