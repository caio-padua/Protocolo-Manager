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
