# Exames — evidências e ponto de retomada

## Estado em 16/11/2026

Correção local implementada e testes direcionados aprovados.
Não homologada para uso clínico ou publicação.

## Implementado

- Conferente derivado da sessão validada por requireCollaborator.
- Identificador opcional legado aceito somente se corresponder à sessão.
- Conferência clínica exige tipo/categoria médica, registro com estado e vínculo validado pelo resolvedor clínico existente.
- Transições condicionadas ao estado anterior; atualização sem linha devolve conflito.
- Interface envia o cabeçalho de autenticação na conferência.
- Reextração e reprocessamento manuais recusados antes de efeitos externos.
- Reenvio duplicado em erro não reinicia extração; recuperação automática bloqueada até existir versionamento.
- Fatores de conversão somente positivos e finitos.
- Reconciliação determinística preparatória preserva candidatos conflitantes; NÃO integrada ao pipeline.

## Verificação executada

Comando:

    pnpm --filter @workspace/api-server exec vitest run src/tests/exam-ingestion-idempotency.test.ts src/tests/exam-conference-auth.test.ts src/tests/exam-extraction-safety.test.ts src/tests/clinical-emitter.test.ts

Resultado final: quatro arquivos, 45 testes aprovados.
São 20 testes novos e 25 do resolvedor clínico existente.
Banco, armazenamento, modelos e mensageria são simulados nos testes novos.
Um documento PDF sintético é gerado e lido de verdade pelo parser local.
O teste de conflito de atualização simula retorno vazio; não comprova disputa concorrente em PostgreSQL.

Outros comandos aprovados:

    pnpm --filter @workspace/api-server run typecheck
    pnpm --filter @workspace/api-server run build
    pnpm --filter @workspace/padcom run build
    git diff --check

Compilação da interface possui avisos em arquivos não alterados, incluindo chaves duplicadas e tamanho dos pacotes.
Os dois serviços locais foram reiniciados.
Requisição anônima PATCH para documento de identificador zero, fase clínica, devolveu 401.
Nenhuma conferência autenticada foi executada sobre documento existente.

Uma bateria mais ampla, anterior à correção final dos retries, teve 116 aprovações e uma falha: exam-workspace.test.ts, emissão individual, esperava 200 e recebeu 401.
A falha foi reproduzida isoladamente; o teste e a rota de emissão não foram alterados.
Não foi executada comparação contra uma cópia limpa anterior; portanto não se certifica aqui que seja falha de base.

## Revisão independente

O revisor identificou retomadas automáticas que escapavam do bloqueio e limitação de seleção multiempresa.
As retomadas automáticas foram bloqueadas e receberam teste.
A seleção multiempresa da interface permanece pendente; a divergência é recusada.
Não houve aprovação independente das últimas correções.

## Limitações e ponto exato de retomada

1. Criar ambiente visual com dados inteiramente sintéticos antes de voltar à rota clínica.
2. Exercitar conferência com tenantContextMiddleware real, inclusive seleção de clínica secundária autorizada e recusas.
3. Implementar versões imutáveis e reserva de execução antes de reabrir reprocessamento e recuperação.
4. Validar leitura independente do arquivo original por Gemini/OpenAI e contrato de auditoria do Claude; nenhuma ativação ou chamada paga foi realizada.
5. Cobrir material da amostra, exceções persistidas e percurso completo até Evolução em banco descartável.
6. Repetir regressão ampliada e obter revisão independente final.

A tentativa de captura visual carregou registros existentes inesperadamente.
A captura temporária foi removida, os dados não foram reproduzidos e não houve inspeção de detalhes.
Isso impede considerar o preview uma prova sintética isolada e exige diagnóstico de acesso separado.
Não houve migração de tabelas, publicação ou envio de mensagens solicitado por esta implementação.
O reinício executa inicializadores preexistentes da aplicação; não equivale a executar um teste isolado de persistência.
