# Auditoria da identidade profissional no menu e nos documentos

## Objetivo

Determinar, para cada item do menu lateral, se a ferramenta reconhece o colaborador autenticado e, quando cria ou emite documento clínico, se deriva profissional, cliente e clínica de fontes autorizadas no servidor.

## Escopo obrigatório

1. Inventariar cada item navegável declarado no menu lateral e mapear para a rota e o componente exibido.
2. Classificar cada tela como administrativa, operacional, clínica, emissora de documento ou somente visualizadora.
3. Verificar a barreira de autenticação no navegador e no servidor; não considerar menu oculto ou `localStorage` como autorização.
4. Em fluxos clínicos, rastrear separadamente o preparador, o aprovador e o profissional que assina ou emite.
5. Verificar se clínica e cliente são conferidos por vínculos do servidor, sem confiar em identificadores enviados pelo navegador.
6. Conferir se as liberações por função e por clínica são respeitadas antes da emissão e do envio.
7. Executar somente testes sintéticos ou unitários com provedores externos simulados; não emitir documentos reais nem enviar mensagens a clientes.
8. Registrar cada tela e rota como conforme, incompleta, não conforme ou não avaliada, com evidência e limitação.

## Falhas previstas

| Gravidade | Falha | Barreira esperada |
|---|---|---|
| Crítica | Rota direta sem sessão válida | Bloqueio no servidor e no acesso à tela |
| Crítica | Navegador escolhe médico, clínica ou cliente não autorizado | Recarregar identidade e vínculo no servidor |
| Crítica | Profissional preparador aparece como médico assinante sem autorização | Separar autoria, aprovação e assinatura |
| Alta | Tela de emissão usa médico padrão/global quando há sessão autenticada | Derivar emissor da identidade validada |
| Alta | Papel global permite ação sem concessão local da clínica | Exigir as duas autorizações aplicáveis |
| Alta | Reenvio cria documento novo ou repete envio incerto | Reutilizar documento existente e exigir conferência humana |
| Média | Item do menu, rota e ferramenta de permissões não correspondem | Mapear e reconciliar os três contratos |

## Definição de conclusão da auditoria

1. Todos os itens do menu lateral têm rota e componente identificados.
2. Cada ferramenta clínica e cada rota de emissão, leitura, assinatura e reenvio têm identidade e autorização rastreadas.
3. Lacunas de código e cobertura de teste são descritas com evidência; inventário não equivale a correção.
4. Não há emissão, envio externo, mudança de dados ou alteração de permissão durante a auditoria.
5. A auditoria não declara homologação global se rotas, provas ou telas protegidas não puderem ser verificadas.

## Estado

EM ESPECIFICAÇÃO — auditoria somente de leitura; nenhuma correção de código autorizada por esta etapa.
