# PAXTER Loop - evidencia da primeira unidade normativa

Inicio: 29/10/2026. Conclusao local: 30/10/2026, horario de Brasilia.
Base examinada: a296016fd3a3e3b03e39a3ac8ae6ca3f0348aad8.
Escopo: specs/paxter-loop-governanca.md.
Estado: verificacao documental local e revisao independente aprovadas.
Aceite do proprietario e execucao remota sao evidencias distintas.

## 1. O que foi entregue

| Requisito | Evidencia |
|---|---|
| Codigo canonico com artigos 75 a 82 | .agents/skills/paxter-loop/CODIGO-PAXTER.md |
| Oito fases e tratamento de descobertas | Codigo e .agents/skills/paxter-loop/SKILL.md |
| Uma implementacao por vez, revisao sequencial | Codigo vigente e replit.md; 71 a 74 originais demarcados como historia |
| Dados sinteticos e ambientes isolados | Artigos 68 e 82; suplemento de diretrizes |
| Historia sem renumeracao | Artigo 44 e historico preservado |
| Diretriz antiga intacta | Resumo SHA-256 verificado pelo teste automatico |
| Fonte e espelhos identicos | Comparacao byte a byte dos dois arquivos |
| Manifesto coerente e parcial | Hashes/linhas do loop atualizados; demais skills nao recertificadas |
| Divergencias automaticas | scripts/paxter-governance.mjs e testes |
| Integracao continua documental | .github/workflows/paxter-governance.yml, sem banco ou segredos |

SHA-256 e um resumo criptografico para identificar conteudo.
O resumo da diretriz historica de 15/06/2026 permaneceu:
ba2003d0f544b98c751752472cdc6c664b0bbb13af1aa4c7628210768d149e79.

A nova diretriz e um suplemento datado que incorpora a antiga por referencia,
sem duplicar o perfil pessoal. O marco de vigencia corresponde a ordem de
29/10/2026; as verificacoes finais terminaram apos a virada do dia.

## 2. Revisao independente e retorno ao ciclo

A primeira passagem REPROVOU o aceite documental:
1. Artigo 64 ainda tinha maximizacao indefinida de recursos.
2. Manifesto poderia ser interpretado como certificacao integral.
3. Sincronizacao escrevia antes de verificar a validade normativa da fonte.
4. Memoria nova duplicava diretriz ja registrada nas normas.

Foram corrigidas as causas, nao ocultados os apontamentos:
- Artigo 64 passou a zelo proporcional ao risco e aos criterios essenciais.
- Manifestos distinguem geracao originaria de atualizacao parcial do loop.
- Sincronizacao valida o estado proposto antes de escrever.
- Memoria nova redundante foi retirada; apenas informacao obsoleta de Git foi corrigida.
- Testes negativos adicionais cobrem fonte invalida sem escrita e selo enganoso.
- Testes de regras exigem erro no documento fonte, nao apenas erro de espelho.

Um teste adicional revelou a necessidade de distinguir linhas historicas datadas
de instrucoes novas: o detector agora ignora apenas o bloco historico delimitado
e as linhas datadas, sem ignorar todo conteudo posterior ao historico.
O teste falhou antes da correcao; nao foi removido nem enfraquecido.

O revisor independente voltou em sequencia, somente leitura, e aprovou o escopo
documental apos as correcoes. Confirmou 16 testes aprovados e diff sem erros de
espacamento. Nao houve agentes executores paralelos iniciados nesta unidade.
Nao se afirma que tarefas preexistentes de outras conversas foram interrompidas.

## 3. Comandos executados e resultados

```bash
node scripts/paxter-governance.mjs --sync
pnpm run check:paxter-governance
pnpm run test:paxter-governance
git diff --check
sha256sum DIRETRIZES_CENTRAIS_E_PRE_REQUISITOS_CEO_DR_CAIO_26.06.15.md
```

| Verificacao | Resultado |
|---|---|
| Normas e pares distribuidos | Aprovados |
| Testes Node, ferramenta nativa de testes | 16 aprovados, zero falhas, zero ignorados |
| Ausencia de cada documento obrigatorio | Recusada |
| Fonte ou espelho divergente | Recusado |
| Artigo ausente/duplicado e fase ausente | Recusados |
| Instrucoes antigas ativas | Recusadas pelas formulacoes verificadas |
| Historico ou linhagem alterados | Recusados |
| Manifesto adulterado ou selo integral enganoso | Recusados |
| Sincronizacao repetida | Mesmo conteudo, sem alterar outra skill |
| Fonte invalida ou manifesto incompleto | Recusados antes da escrita |
| Arquivos clinicos alterados nesta unidade | Nenhum |

O arquivo PAXTER_LOOP_EVIDENCIA.json registra hashes do conteudo examinado e a
revisao-base. Antes do commit, os hashes identificam a arvore de trabalho; nao
se declara que mudancas ainda nao commitadas ja pertenciam ao commit-base.
O commit final e verificavel pelo historico deste documento.

## 4. Limites explicitos

- O detector e lexical e estrutural, nao prova consistencia semantica universal.
- Pre-validacao nao torna atomicas falhas de disco entre os quatro arquivos.
  Falha de escrita exige executar a verificacao e repetir a sincronizacao apos
  corrigir a causa; nunca considerar um espelho parcial como aprovado.
- O selo parcial nao recertifica layout nem todos os arquivos do pack.
- O workflow de integracao continua foi criado, mas nao foi executado remotamente
  durante a validacao local. Criar workflow nao configura protecao obrigatoria
  do ramo nem impede sozinho uma publicacao.
- O futuro avaliador de liberacao com evidencias independentes nao foi construido.
- Nao houve teste de tela, banco ou mensagem: nao ha mudanca nessas camadas
  nesta unidade documental. As verificacoes clinicas continuam obrigatorias nas
  respectivas entregas, e nao foram substituidas por estes testes.
- Nao reiniciei servicos clinicos nem corrigi falhas operacionais alheias ao escopo.
- A auditoria integral do repositorio ainda NAO foi executada.
- Nao houve publicacao do sistema, mudanca comercial, cobranca, assinatura real
  ou mensagem real a cliente.

## 5. Sequencia apos aceite desta unidade

Somente depois do aceite: inventario com revisao fixada, matriz de riscos e
confirmacao das pendencias relatadas na auditoria externa.
Validar os achados no codigo atual, pois novas integracoes podem ter mudado
estados assincronos. Nao repetir automaticamente os numeros antigos do inventario.
Corrigir jornadas completas em sequencia, priorizando autorizacao e isolamento,
identidade de atestados/encaminhamentos, arquivos, exames e assinatura conforme
os riscos efetivamente confirmados.
Nao abrir novas tarefas ou iniciar essa segunda unidade neste mesmo trabalho.

RESUMO EM 1 LINHA: normas harmonizadas e verificadas com 16 testes e revisao
independente; homologacao clinica e auditoria integral permanecem fora desta unidade.
