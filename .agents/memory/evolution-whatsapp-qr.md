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


## Fase 1B (circuito Telegram + ficha + interruptores)
- Telegram usa o mesmo planejador do WhatsApp (menu numérico só no WhatsApp); controle por canal vale para ambos.
- Testes antigos que mockam pool/db precisam mockar `atendimento-controle` e `atendimento-ficha`; sem isso o controle falha fechado e nada responde.
- Rodar um único vitest por vez (dois em paralelo derrubam o banco descartável).
- Roteiro do teste real: specs/roteiro-teste-real-fase-1b.md; conferência: src/scripts/conferir-homologacao.ts.

## Contas Evolution por clínica

A conta empresarial permanece na configuração legada e continua sendo a única usada pelos fluxos existentes.
Cada conta nova tem `account_id` próprio; proprietário profissional, conta e clínica são identidades distintas. A conta pessoal e a terceira conta pertencem ao proprietário autenticado e podem ter vínculos autorizados em várias clínicas.
Segredos e mensagens novas são separados por `account_id`; os vínculos ativos filtram o acesso por clínica. Revogar vínculo não apaga configuração, segredo ou mensagens.
As tabelas antigas por clínica permanecem como compatibilidade somente para registros existentes e não recebem cópia automática para o modelo novo. O diagnóstico mostra contagens e ambiguidade; a reversão de esquema só pode apagar tabelas novas vazias.
Eventos enviados pelo próprio número (`fromMe`) não comprovam autoria humana; manter a origem como não classificada até uma etapa de atribuição validada.

**Why:** a mesma conta pode ser autorizada em várias clínicas sem duplicar conversas; usar apenas a clínica como identidade fragmenta dados e segredos, enquanto inferir autoria de `fromMe` pode atribuir uma fala automática ao proprietário.

**How to apply:** obter proprietário e clínica do contexto autenticado; exigir vínculo ativo em cada operação; preservar configuração empresarial e rotas legadas; validar unicidade da instância com trava transacional; usar dados sintéticos e nunca parear ou enviar mensagens nos testes.

## Organograma oficial das comunicações pessoal e empresarial

- O organograma aprovado permanece a referência do produto; as proteções técnicas ficam por baixo dele e não mudam caixas, setas nem o sentido dos fluxos.
- A leitura de estilo pessoal considera somente mensagens humanas atribuídas com confiança ao proprietário; mensagens automáticas recebem marca antes do envio, grupos familiares ficam fora e origens ambíguas permanecem não classificadas.
- No ciclo de 24 horas, melhorias de fraseologia podem alimentar a comunicação empresarial, mas números, horários, valores, orientações médicas e fatos precisam permanecer idênticos; mudanças nesses elementos ficam pendentes de revisão, com texto aprovado preservado, histórico e reversão.
- A identidade da comunicação pessoal pertence ao perfil do proprietário, não a uma clínica; conteúdo pessoal não é copiado para clínica ou base global sem controle explícito.
- O organograma descreve etapas futuras; não comprova que leitura horária, revisão diária ou telas estejam implementadas.

**Why:** o responsável confirmou que o desenho do organograma não muda e que as proteções devem preservar autoria, conteúdo factual e separação pessoal/empresarial.

**How to apply:** usar estes pontos como critérios de aceitação das telas e dos ciclos futuros; confirmar capacidade real do provedor antes de parear qualquer aparelho.
