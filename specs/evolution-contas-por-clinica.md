# Especificação — Contas Evolution isoladas por clínica

## Objetivo
Preparar no servidor a conta empresarial legada e duas contas Evolution novas por proprietário (pessoal e terceira configurável), associáveis a clínicas autorizadas, sem modificar a conexão empresarial existente, sem presumir capacidade do provedor e sem iniciar envios.

## Requisitos
1. Manter inalteradas as consultas e gravações da configuração empresarial legada em evolution_instancias e os segredos evolution.apiKey.<empresa> e evolution.webhookToken.<empresa>.
2. Representar a conta empresarial como origem legada somente leitura nas novas operações; não copiar configuração nem mensagens para novas tabelas.
3. Dar a cada conta nova um identificador próprio. Manter proprietário profissional, conta e vínculo com clínica como identidades distintas.
4. Vincular a conta pessoal ao profissional proprietário autenticado. A conta pessoal e a terceira conta são administradas somente pelo proprietário da plataforma; outros colaboradores não podem enumerá-las por identificador.
5. Persistir configuração e controles independentes na identidade da conta, não por clínica. Vínculos ativos guardam empresa, categoria e autorização separadamente; os quatro controles começam desligados.
6. Usar chaves distintas do cofre cifrado por identificador da conta. Nunca devolver credenciais; impedir que a conta acesse a credencial de outra identidade.
7. Amarrar webhooks novos a identificador da conta + token próprio + nome exato da instância. Exigir pelo menos um vínculo ativo; rejeitar token incorreto, conta inexistente e instância divergente antes de persistir.
8. Se captura estiver habilitada explicitamente, guardar eventos de mensagem em tabela própria por conta, com origem sempre não classificada; não encaminhar ao atendimento, aprendizado ou resposta. Se desligada, não persistir o corpo da mensagem.
9. Nenhuma rota nova envia mensagens ou solicita código de pareamento automaticamente. A rota de consulta/pareamento fica disponível apenas após configuração e ativação explícitas, mas não será chamada nos testes.
10. Migração aditiva, explícita e repetível. Não copiar, atualizar ou remover linhas legadas. O diagnóstico mostra apenas contagens e vínculos ambíguos. O script reverso recusa a remoção enquanto houver conta, vínculo ou mensagem nova.
11. Testes usam PostgreSQL temporário e Express real; autenticação de colaborador e contexto de clínica consultam profissionais e vínculos no banco descartável. Mensagens e credenciais de teste são sintéticas.
12. Impedir concorrência de configuração entre a instância empresarial, as antigas contas por clínica e as novas contas por identidade, usando bloqueio transacional compartilhado e índices de unicidade nas novas tabelas.

## Impacto e compatibilidade
- Mantêm-se sem alteração as rotas atuais /evolution/config, /evolution/conexao, /evolution/qr, /evolution/webhook/registrar e /evolution/webhook/:empresaId/:token.
- Consumidores empresariais continuam usando lerConfig(empresaId) e as chaves legadas; somente a validação de instância foi ampliada e a gravação empresarial passou a usar bloqueio transacional contra concorrência.
- Novas contas usam identidade, vínculos, segredos e mensagens separados; nenhuma conversa legada é copiada.
- As antigas rotas por clínica permanecem como compatibilidade somente quando há uma linha antiga correspondente. A rota empresarial e os webhooks legados seguem montados.
- A autorização nova compara profissional autenticado, proprietário da conta e clínica da sessão; as consultas de conta exigem vínculo ativo.

## Falhas previstas
| Falha | Barreira | Prova |
|---|---|---|
| Conta ou empresa de outra clínica passada no corpo/URL | usar empresa da sessão e filtro composto em cada SQL; resposta genérica 404 | chamadas com IDs cruzados |
| Colaborador tenta abrir conta pessoal | exigir proprietário da plataforma e titular igual; esconder existência com 404 | teste de perfil não autorizado |
| Credencial cruzada entre contas | chave cifrada inclui empresa e account_key; GET nunca retorna segredo | comparar chaves e rotas |
| Evento vindo de instância errada ou token errado | token constante e instância exata; sem persistência | testes de webhook |
| Duas contas apontam para a mesma instância do provedor | bloqueio transacional compartilhado, checagem cruzada e índice único | tentativa de reuso de instância |
| Captura desligada | retornar sucesso neutro sem salvar corpo | SELECT no banco isolado |
| Eventos duplicados | índice único por empresa+conta+provider_id | reenvio de fixture sintética |
| Conta empresarial interrompida | não regravar nem trocar legado; não chamar provedor no teste | snapshot da linha legada e regressão atual |
| Capacidade insuficiente no Railway/Evolution | não provisionar nem declarar suporte operacional | limitação registrada; teste apenas local |

## Definição de pronto
- O registro empresarial legado permanece idêntico antes e depois da migração isolada.
- As rotas novas não atravessam empresa nem conta e recusam permissões insuficientes.
- Contas pessoais/adicionais começam sem conexão, captura, aprendizado ou respostas habilitados.
- Webhook de conta grava somente em armazenamento isolado quando captura está ligada e nunca dispara atendimento/envio.
- A suíte nova de autorização e isolamento passa em PostgreSQL descartável, com middleware real e chamadas HTTP locais.
- A suíte regressiva existente de Evolution passa, incluindo operações por clínica e webhooks legados.
- Nenhum aparelho foi pareado, mensagem foi enviada, implantação foi publicada ou serviço Railway foi alterado.

## Linhas vermelhas
- Não modificar valores, chaves ou linhas legadas da conta empresarial.
- Não alterar o motor de atendimento, as rotas antigas de envio, o tom de voz ou os dados dos bancos de mensagens existentes.
- Não ler conversas privadas nem usar dados pessoais em testes.
- Não presumir que Railway ou Evolution comportem três instâncias; a configuração em código não prova capacidade hospedada.
- Não implementar as tarefas #801 a #804.

## Aditivo de arquitetura — identidade da conta e vínculos autorizados

Esta revisão amplia a tarefa #800 sem iniciar as telas da tarefa #801.

- A conta tem identificador próprio; sua identidade de proprietário e suas associações com clínicas são registros separados.
- O identificador do proprietário vem do profissional autenticado pelo servidor. A clínica vem exclusivamente do contexto autenticado da sessão.
- Uma conta pessoal do proprietário e uma terceira conta configurável podem ser associadas a mais de uma clínica, mas só o proprietário autenticado pode criar, consultar, alterar ou revogar esses vínculos.
- Cada clínica mantém no máximo um vínculo ativo por categoria de conta. Revogar vínculo é lógico e não apaga conta, configuração, segredo ou mensagem.
- A conta empresarial continua na configuração e nas rotas legadas; não há cópia de configuração, segredo, vínculo ou mensagem empresarial.
- Webhooks pessoais identificam a conta por identificador próprio, token próprio e nome exato da instância. Não recebem clínica presumida e não entram na rota empresarial nem no motor clínico.
- Eventos de saída não provam autoria humana. Toda mensagem nova permanece com origem `nao_classificada`.
- A mudança de esquema é apenas aditiva. O diagnóstico informa contagens e grupos de proprietário/categoria ligados a mais de uma clínica; nenhuma linha ou segredo legado é copiado, alterado ou apagado automaticamente.
- O script reverso apaga apenas as tabelas novas e somente se estiverem vazias. Se já houver dados, a reversão segura é voltar o código e preservar as tabelas.
- Testes de migração, autorização, associação, webhook, falhas, vínculo revogado e reinício usam PostgreSQL temporário e dados sintéticos. Nenhum esquema de produção é alterado.
