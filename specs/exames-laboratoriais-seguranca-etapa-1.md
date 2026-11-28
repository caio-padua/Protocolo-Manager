# Especificação — segurança da revisão e preservação de extrações

## Objetivo

Proteger a conferência clínica do módulo existente de exames e impedir que uma reextração destrua resultados anteriores, sem alterar dados reais nem ativar serviços externos.

## Requisitos

1. A conferência operacional e clínica exige sessão válida de colaborador.
2. O profissional gravado no registro vem de `req.collaborator.professionalId`; um `professionalId` recebido no corpo só pode ser aceito quando igual à sessão autenticada.
3. A conferência clínica exige profissional ativo, tipo e categoria `medico`, registro médico validado pelo helper existente e vínculo ativo com a clínica do cliente.
4. A ordem atual permanece: `recebido` para conferência operacional e `conferido_1` para conferência clínica.
5. O identificador enviado pela interface não concede autoridade; a interface mostra que o conferente é a sessão autenticada.
6. A rota de reextração destrutiva responde com bloqueio explícito antes de baixar arquivo, chamar modelo ou apagar resultados, até existir preservação versionada segura.
7. Testes usam somente conteúdo e identidades sintéticos, sem chamadas de modelos, banco de produção ou dados clínicos.
8. Nenhuma configuração global dos modelos é alterada.
9. A separação Gemini/OpenAI/Claude só será integrada nesta etapa se o contrato dos provedores e o tratamento de conflitos puderem ser comprovados sem chamadas pagas. Caso contrário, permanece registrada como pendência.
10. O bloqueio de reprocessamento inclui arquivo duplicado em erro e recuperação automática após reinício, pois uma falha pode ter ocorrido depois de gravar resultados parciais.
11. A conferência em empresa diferente da empresa principal permanece recusada até a interface transmitir a seleção validada pelo servidor e existir teste com o middleware real.

## Falhas previstas e barreiras

| Falha | Barreira | Evidência exigida |
|---|---|---|
| Pedido anônimo ou sessão revogada | `requireCollaborator` no servidor | Recusa antes do manipulador |
| Interface tenta atribuir conferência a outra pessoa | Comparar identificador opcional com a sessão e usar sempre a identidade autenticada | Recusa e nenhuma alteração |
| Profissional sem habilitação médica tenta liberar resultado | Validar tipo, categoria e registro no servidor | Recusa clínica |
| Profissional de outra clínica tenta conferir | Validar vínculo do profissional com a unidade do cliente e empresa da requisição | Recusa sem gravação |
| Reextração substitui valores anteriores | Bloquear a rota destrutiva antes de qualquer operação externa ou exclusão | Resposta de conflito e zero chamadas |
| Modelos discordam sobre metadados ou analitos | Não escolher silenciosamente; manter candidatos e sinalizar revisão | Teste sintético determinístico |
| Conversão sem fator válido | Não converter; manter unidade original e exigir conferência | Teste sintético da função de conversão |

## Fora do escopo desta etapa

1. Migração ou criação de tabelas para versões imutáveis de extração.
2. Execução de Gemini, OpenAI ou Claude, alteração das configurações globais ou habilitação automática dos serviços.
3. Leitura independente do arquivo original pelo OpenAI e implementação do Claude como auditor em chamadas reais, enquanto o formato aceito pelos provedores não for validado sem cobrança.
4. Alteração de dados clínicos existentes, publicação ou implantação.

## Definição de pronto desta etapa

1. A sessão autenticada é a única fonte da identidade do conferente.
2. A conferência clínica só aceita profissional ativo e habilitado pelo registro médico, com vínculo clínico válido.
3. A reextração destrutiva permanece bloqueada sem tocar em arquivo, modelo ou resultado anterior.
4. Testes automatizados sintéticos cobrem autorização, ordem das fases, recebimento/idempotência, conflito de metadados e analitos, conversão, falha sem fator e bloqueio de reprocessamento.
5. Compilação e testes direcionados passam; testes reais de provedor, persistência de produção e homologação clínica permanecem explicitamente fora desta etapa.
