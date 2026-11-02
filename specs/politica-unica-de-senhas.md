# PAXTER Loop — Política única de senhas do sistema

Data: 02/11/2026
Estado: IMPLEMENTADA E TESTADA — homologação independente pendente
Responsável: Dr. Replit Paxter

## 1. Objetivo

Aplicar a regra de senha informada pelo CEO de forma uniforme em todas as credenciais gerenciadas pelo próprio sistema, sem alterar senhas existentes.

## 2. Regra aprovada

Toda senha nova, redefinida ou alterada pelo usuário deve:

1. Ter entre 10 e 128 caracteres.
2. Começar com uma letra maiúscula, incluindo letras maiúsculas acentuadas.
3. Conter pelo menos um número.
4. Conter pelo menos um sinal de pontuação ou símbolo, como `@`.
5. Não exigir letra minúscula, pois essa condição não foi aprovada pelo CEO.

O limite máximo de 128 caracteres preserva a barreira já existente nas credenciais profissionais.

## 3. Escopo

1. Credenciais de profissionais: primeira senha, alteração autenticada, recuperação por e-mail e recuperação privada de desenvolvimento.
2. Credenciais de clientes: primeira senha, troca obrigatória, definição pelo link e senha provisória gerada pelo sistema.
3. Formulários, mensagens de validação e servidor devem obedecer à mesma função compartilhada.
4. Login apenas verifica a senha existente; não rejeita contas antigas cuja senha não cumpra a nova regra.
5. Não se altera senha existente, identidade, cadastro, clínica, permissões ou histórico.
6. Senhas gerenciadas pelo Google, pelo Clerk ou pela própria plataforma ficam fora do controle deste sistema.

## 4. Decisão de arquitetura

1. Criar uma biblioteca compartilhada sem dependências para ser a fonte única da regra.
2. Importar a mesma função nos serviços e telas, evitando validadores copiados e divergentes.
3. Manter as rotinas de geração de hash e verificação existentes.
4. Gerar senhas provisórias de clientes que também atendam à regra, preservando a troca obrigatória no primeiro acesso.

## 5. Impactos e falhas previstas

| Situação | Comportamento exigido |
|---|---|
| Senha com 10 caracteres e todos os requisitos | Aceitar |
| Menos de 10 ou mais de 128 caracteres | Rejeitar sem gravar |
| Primeiro caractere não é letra maiúscula | Rejeitar sem gravar |
| Nenhum número | Rejeitar sem gravar |
| Nenhum símbolo ou pontuação | Rejeitar sem gravar |
| Interface aceita, servidor rejeita | Evitar: ambos usam a mesma biblioteca |
| Conta antiga tem senha fora do padrão novo | Manter o login atual; aplicar a regra somente na próxima troca |
| Geração de senha provisória | Garantir comprimento, maiúscula inicial, número e símbolo |
| Senha aparece em resposta ou log | Proibido |

## 6. Sequência do PAXTER Loop

1. **Desenhar e especificar:** mapear todas as entradas de senha e aprovar a regra acima.
2. **Prever falhas:** cobrir diferenças entre interface e servidor, contas antigas e senha provisória.
3. **Construir:** criar a biblioteca compartilhada e ligar os fluxos profissionais e de clientes a ela.
4. **Revisar:** revisão independente sequencial após a implementação.
5. **Testar:** cobrir cada requisito positivo e negativo com dados sintéticos.
6. **Homologar:** conferir compilação, testes, inicialização dos serviços e tela pública de acesso.
7. **Aprender:** registrar a regra de produto na memória do projeto.

Nenhuma frente de implementação será executada em paralelo com outra; etapas dependentes começam após a anterior.

## 7. Resultado da execução

1. A regra compartilhada está aplicada às telas e às rotas de profissionais e clientes.
2. As senhas provisórias de clientes também passam pela regra.
3. Os testes focados terminaram com 69 aprovações em três arquivos de teste, incluindo a recusa da rota administrativa sem gravação de credenciais.
4. `pnpm run typecheck:libs` e `git diff --check` passaram.
5. O serviço de interface compilou e ficou pronto no servidor de desenvolvimento; o serviço de API compilou e começou a escutar na porta configurada.
6. As verificações globais de TypeScript não passaram: a API relatou 173 erros em 51 arquivos, e a interface relatou 86 erros em 19 arquivos. Nenhum diagnóstico foi apontado nas telas alteradas; os quatro avisos em `area-paciente.ts` ficam em outras linhas e tratam de tipos de parâmetros e dados do cliente.
7. A ferramenta de revisão independente não ficou disponível nesta execução. Foi feita revisão manual sequencial, mas a homologação independente permanece pendente.
8. Nenhuma senha real foi criada, alterada ou exibida. A produção e a sincronização com o GitHub não foram tocadas.

## 8. Definição de pronto

1. Há uma única implementação compartilhada da regra.
2. Os fluxos profissionais e de clientes usam a mesma regra na interface e no servidor.
3. As senhas provisórias também respeitam a regra.
4. Testes provam aceitação de senha válida no limite mínimo e rejeição de cada requisito ausente.
5. Testes provam que as rotas não gravam credenciais rejeitadas.
6. Senhas existentes, dados reais, produção e integração com o GitHub permanecem intocados.
7. Revisão independente e verificações finais concluídas; sem elas, a etapa não será declarada homologada.
