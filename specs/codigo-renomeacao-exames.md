# Código de Renomeação de Exames

Estado: BLOQUEADO — código e testes concluídos; falta revisão independente obrigatória  
Responsável: Dr. Replit Paxter  
Data: 16/11/2026

## 1. Objetivo

Aplicar um único formato de nome a exames recebidos pelo portal, pela varredura automática de pastas e pela ferramenta manual de renomeação, sem apagar arquivos homônimos.

## 2. Regras aprovadas pelo CEO

1. Exame de sangue e laboratório usa o rótulo `LABOR`.
2. Os nomes ficam em maiúsculas, sem acentos e com palavras separadas por espaços.
3. O prefixo de data existente `AA.MM.DD` é preservado.
4. As siglas históricas `USG`, `RMN`, `TC` e `RX` permanecem para suas modalidades.
5. Não inventar siglas para procedimentos sem abreviação canônica clara.
6. Cintilografia usa o nome clínico identificável, por exemplo `CINTILOGRAFIA MIOCARDICA` ou `CINTILOGRAFIA RENAL ESTATICA`.
7. Nenhum caminho de upload pode apagar um arquivo anterior para acomodar um nome repetido.
8. A ferramenta de renomeação em massa não será executada como parte desta implementação.

## 3. Formato e exemplos

Formato: `AA.MM.DD TIPO [REGIÃO E LADO] NOME DO CLIENTE.EXTENSÃO`

Exemplos:

| Conteúdo | Nome esperado |
|---|---|
| Exame laboratorial | `26.11.16 LABOR CLIENTE EXEMPLO.PDF` |
| Ultrassom da tireoide | `26.11.16 USG TIREOIDE CLIENTE EXEMPLO.PDF` |
| Ressonância da coluna lombar | `26.11.16 RMN COLUNA LOMBAR CLIENTE EXEMPLO.PDF` |
| Cintilografia miocárdica | `26.11.16 CINTILOGRAFIA MIOCARDICA CLIENTE EXEMPLO.PDF` |
| Cintilografia renal estática | `26.11.16 CINTILOGRAFIA RENAL ESTATICA CLIENTE EXEMPLO.PDF` |

## 4. Caminhos abrangidos

1. Envio pela Área do Cliente: usa o tipo selecionado no formulário e a data digitada; sem data, mantém o fallback atual em horário de Brasília.
2. Varredura automática do Drive: usa a data extraída do laudo quando válida; classifica como `LABOR` quando extrai analitos e aplica os rótulos reconhecidos às modalidades identificadas no nome ou texto.
3. Renomeação manual em massa: preserva a classificação por texto já existente, normalizando o nome final pelo mesmo construtor.
4. Não alterar a importação histórica para sobrescrever a origem, a identidade do cliente, o estado clínico ou a extração.

## 5. Catálogo de tipos

1. Laboratorial: `LABOR`.
2. Ultrassom: `USG`.
3. Ressonância magnética: `RMN`.
4. Tomografia computadorizada: `TC`.
5. Radiografia: `RX`.
6. Densitometria e mamografia: nomes por extenso, por não haver uma sigla histórica única aprovada no produto.
7. Cardiológicos e procedimentos sem sigla curta aprovada: usar o nome clínico por extenso, sem acento, incluindo a região quando identificada.
8. Exames genéticos usam `GENETICA`; endoscopias e procedimentos sem sigla aprovada mantêm o nome reconhecível por extenso.
9. Cintilografia: manter `CINTILOGRAFIA` e o qualificador reconhecido (por exemplo, `MIOCARDICA`, `RENAL ESTATICA`).
10. Não inferir diagnóstico ou modalidade apenas pela identidade do cliente.

### Pesquisa do catálogo existente

Na base de desenvolvimento foram encontrados 280 exames cadastrados e 89 painéis de imagem. Entre as modalidades preenchidas: 157 laboratoriais, 22 ultrassons, 20 genéticos, 18 tomografias e 10 ressonâncias. Outros registros incluem radiografia, cardiologia, endoscopia, mamografia e densitometria. Há 26 registros sem modalidade preenchida; o nome do exame permanece a fonte de classificação quando o tipo não está informado.

O catálogo contém, entre outros, `CINTILOGRAFIA MIOCARDICA` e `CINTILOGRAFIA RENAL ESTATICA`; por isso os dois nomes foram incluídos na classificação.

## 6. Falhas previstas e barreiras

| Gravidade | Cenário | Barreira | Verificação |
|---|---|---|---|
| Crítica | Um envio com o mesmo nome apaga o PDF anterior | Upload clínico nunca usa exclusão por homônimo | Teste do parâmetro de preservação |
| Alta | Data inválida (por exemplo, 31/02) gera nome enganoso | Validar calendário antes de aceitar o prefixo | Teste de data válida e inválida |
| Alta | Cintilografia é reduzida a `DOCUMENTO` ou a sigla inventada | Rótulos específicos para termos do catálogo e fallback por extenso | Casos renal e miocárdico |
| Alta | Divergência de formato entre portal, watcher e renomeador | Um construtor e normalizador comum | Testes unitários por caminho |
| Média | Nome de cliente ou descrição contém acento, pontuação ou sublinhado | Normalizador remove acentos/pontuação e comprime espaços | Casos com nomes e rótulos acentuados |
| Média | Texto contém palavra incidental de modalidade | Ordem de classificação e padrões com limites de palavra | Casos com exames de sangue e imagem |
| Média | Data de fallback do servidor difere do horário de Brasília | Usar `lib/brt.ts` | Teste determinístico com data fornecida e conferência da chamada BRT |

## 7. Limites e segurança

1. Não renomear arquivos em produção durante a construção ou os testes.
2. Não chamar Google Drive, enviar mensagens, alterar registros reais ou tocar no banco de produção.
3. Os testes usam apenas dados sintéticos e mocks.
4. Não alterar motores clínicos, resultados extraídos, regras de identidade ou liberação de resultados na Evolução.
5. A classificação escolhida pelo cliente no portal continua sendo a fonte de categoria do upload; a implementação não declara que o conteúdo foi clinicamente validado.

## 8. Critérios de conclusão

1. A função comum gera nomes com a data e rótulo normalizados nos três caminhos.
2. `LABOR`, `USG`, `RMN`, `TC` e `RX` são preservados.
3. Cintilografia miocárdica e renal recebem seus qualificadores por extenso e sem acento.
4. Data inválida não é aceita como data digitada.
5. O upload clínico não apaga arquivos homônimos.
6. Testes focados e tipo/construção do servidor passam.
7. Revisão independente e evidências aplicáveis são registradas; sem revisor disponível, a entrega permanece EM REVISÃO ou BLOQUEADA, nunca HOMOLOGADA.
