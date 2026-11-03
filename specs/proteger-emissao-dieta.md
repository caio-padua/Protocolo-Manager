# Proteção da geração e do envio do Plano Nutricional

## Estado

IMPLEMENTAÇÃO E TESTES EXECUTADOS — revisão independente indisponível; não homologado.

## Objetivo

Vincular a emissão, a leitura do histórico e o envio do Plano Nutricional ao médico autenticado, ao cliente selecionado e à clínica em que ambos têm vínculo autorizado.

## Impacto e dependências

1. A emissão usa a identidade do colaborador assinada na sessão, a relação profissional–unidade e o vínculo cliente–unidade já validados por `resolveClinicalEmitter`.
2. O identificador da empresa deve vir da unidade validada, nunca de constante nem do navegador.
3. O gerador atual grava o PDF no armazenamento privado e no histórico; o envio inicial deve recuperar exatamente esse arquivo, em vez de aceitar bytes substituíveis do navegador.
4. O esquema atual de liberação clínica cobre prescrição e pedido de exames, mas não define uma liberação específica para Dieta. Esta etapa não reutiliza indevidamente a permissão de prescrição nem cria uma nova tela de Governança. A emissão direta fica restrita a médico ativo, com registro médico válido e vínculo autorizado à clínica do cliente.
5. O reenvio explícito do histórico poderá manter o campo de destinatário alternativo já existente; o endereço usado fica registrado no histórico do plano e nunca altera o cadastro do cliente.

## Requisitos exatos

1. Exigir token individual de colaborador em `POST /dieta/emitir-pdf` e `POST /dieta/enviar-pdf-email`.
2. Exigir cliente cadastrado para gerar um documento clínico; não permitir emissão sem `clientId`.
3. Antes de gerar, validar colaborador ativo, tipo médico, cliente ativo, unidade ativa, mesma empresa e relação explícita do médico com a unidade.
4. Exigir registro médico com conselho e unidade federativa válidos; sem isso, bloquear a emissão com mensagem de correção cadastral.
5. Usar nome, registro e assinatura do médico autenticado. Não consultar um profissional global marcado como principal.
6. Usar nome e e-mail do cliente do banco. Não confiar em nome, e-mail, empresa, clínica ou profissional enviados pelo navegador.
7. Persistir o profissional emissor, a unidade, a empresa e o cliente no histórico. Registrar também o colaborador que confirmou cada envio e o instante do envio. Acrescentar colunas sem apagar nem reescrever linhas antigas.
8. Se a geração não conseguir persistir o PDF privado e o registro histórico, não retornar sucesso nem permitir o envio posterior como se o arquivo estivesse disponível.
9. Devolver um identificador do plano no cabeçalho HTTP da resposta do PDF. O navegador envia apenas esse identificador e o cliente selecionado ao confirmar o e-mail.
10. No envio inicial, buscar o PDF privado pelo identificador do plano; verificar empresa, unidade, cliente e médico emissor contra a identidade autenticada; usar o e-mail atual do cadastro do cliente; bloquear plano já enviado.
11. Proteger a lista, a visualização, o download e o reenvio do histórico com sessão e vínculo à unidade do cliente. Remover a empresa fixa 5 desses caminhos.
12. Preservar o reenvio explícito com endereço alternativo, mas revalidar médico, cliente, clínica e empresa e registrar o destinatário efetivamente usado sem alterar o e-mail principal do cliente.
13. Atualizar a tela de Dieta para enviar o token individual nos dois pedidos de emissão e confirmar envio. A confirmação não transmite PDF em base64.
14. Testar sessão ausente, médico não autorizado, cliente sem vínculo, unidade/empresa divergente, registro médico incompleto, plano de outro cliente, plano de outra clínica, envio repetido e caminho autorizado.
15. Todos os testes de envio devem substituir o provedor de e-mail por simulação; nenhuma mensagem real pode ser transmitida.
16. O prontuário que apresenta o histórico de Dieta também exige colaborador autenticado e vínculo validado à unidade antes de devolver qualquer dado clínico.

## Falhas previstas e barreiras

| Falha | Barreira esperada | Resultado |
|---|---|---|
| Sem token ou token expirado | `requireCollaborator` antes do handler | Resposta 401; sem geração, persistência ou envio |
| Cliente ausente ou identificador inválido | Validação do corpo antes da geração | Resposta 400; sem efeitos |
| Médico inativo, não médico ou sem vínculo à clínica | `resolveClinicalEmitter` | Resposta 403; sem efeitos |
| Cliente inativo, unidade inativa ou empresa divergente | Validação de identidade no servidor | Resposta 403 ou 404 genérica; sem efeitos |
| Conselho ou unidade federativa ausente/inválida | Validação do cadastro do médico | Resposta 422; sem emissão |
| Falha ao salvar histórico ou PDF privado | Falha explícita; nunca retornar sucesso incompleto | Resposta de erro; sem envio |
| Plano, cliente, unidade, empresa ou emissor incompatível | Conferência do plano contra a sessão e o cliente autorizados | Resposta 404 genérica; sem envio |
| Confirmação inicial repetida | `emailEnviado` verificado no servidor | Resposta 409; nenhum segundo envio |
| Destinatário alternativo no reenvio | Confirmação explícita no histórico; manter cliente intacto | Envio somente após autorização e registro do destino |
| Falha do provedor de e-mail | Resultado honesto; não marcar envio como concluído | Erro visível; histórico preservado para conferência |

## Critérios de conclusão

1. A emissão e o envio são recusados antes de chamar o gerador, o armazenamento ou o provedor quando a identidade ou o vínculo falha.
2. O PDF exibe o profissional da sessão autorizada e o registro médico desse profissional.
3. O servidor envia somente o arquivo privado que foi gerado e registrado para o mesmo cliente e clínica.
4. O histórico mostra registros novos com profissional, unidade, empresa e estado do envio, sem alteração destrutiva de dados antigos.
5. A tela envia autenticação individual e não transmite o conteúdo do PDF no pedido de envio.
6. Testes unitários, de rota e de ponta a ponta comprovam os caminhos permitidos e proibidos usando dados sintéticos e provedores simulados.
7. Revisão independente sequencial concluída; sem ela, o estado permanece BLOQUEADO, não HOMOLOGADO.

## Evidências desta etapa

1. Testes específicos de rota: 20 aprovados; o provedor de e-mail foi simulado.
2. Testes de ponta a ponta da tela: 3 aprovados; o envio foi interceptado e não transmitiu mensagens reais.
3. Compilação e inicialização do servidor: concluídas sem erro.
4. `typecheck:libs`: aprovado antes da implementação final da rota; o esquema não mudou depois.
5. A verificação completa de tipos continua falhando por diagnósticos preexistentes em vários arquivos. Nenhum erro foi apontado nos arquivos novos ou nas rotas de Dieta; o PADCOM mantém um erro antigo em `prontuario/index.tsx`, fora do trecho alterado para baixar o PDF.
6. A revisão independente não pôde ser iniciada neste ambiente; por isso, esta etapa não está homologada.

## Limites desta etapa

1. Não alterar a autorização das outras ferramentas, do menu inteiro ou de outras rotas além das necessárias para este fluxo e seu histórico.
2. Não criar uma permissão de Dieta na tela de Governança; isso exige uma etapa de arquitetura própria.
3. Não apagar nem corrigir automaticamente registros históricos incompletos.
4. Registros antigos sem unidade permanecem no banco, mas ficam ocultos nas rotas protegidas até uma revisão manual; não recebem unidade por suposição.
5. Não chamar o provedor real de e-mail, não enviar dados clínicos reais e não publicar alterações.
