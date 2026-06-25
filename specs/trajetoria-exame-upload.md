# Spec — Trajetória do Exame Uploadado do Paciente

> Loop Paxter — FASE 1 (ESPECIFICAR). Nada é construído fora desta spec. Autor: Dr. Replit Paxter. Data: 25/06/2026.

## Objetivo (uma frase)

Receber o arquivo de um exame (PDF ou imagem), ler os valores com Inteligência Artificial multimodal (mais OCR quando o arquivo for escaneado), localizar ou criar o cadastro do paciente, gravar tudo de forma padronizada em três frentes (banco do sistema, pasta no Google Drive e planilha Google), classificar cada valor pela faixa interna, comparar com exames anteriores e avisar o paciente — sem digitação manual e sem recriar o que já existe.

---

## Glossário (siglas explicadas na primeira vez)

| Sigla / termo | Significado |
|---|---|
| IA multimodal / LLM | Large Language Model = grande modelo de linguagem; entende texto e imagem |
| OCR | Reconhecimento Óptico de Caracteres; lê texto dentro de uma imagem |
| Analito | Cada "item" medido no exame (exemplo: Hemoglobina, Ferritina, PCR) |
| Unidade canônica | A unidade única e oficial que o sistema usa por analito (exemplo: Ferritina sempre em ng/mL) |
| Faixa | Intervalo nomeado de valor (Ruim, Alerta, Atenção, Aceitável, Excelente) — vem do Subcadastro de Exames |
| Idempotente | Rodar duas vezes não duplica nada; cria só o que falta |
| Lead | Possível paciente ainda não convertido (pode receber exame antes da consulta) |
| Hash | Impressão digital do arquivo; serve para saber se já foi recebido |
| Modo Duplo | Tudo funciona dentro do cockpit do paciente E avulso, por seletor de paciente |

---

## Ferramenta de IA escolhida

- Motor: **Gemini** via Replit AI Integrations (proxy interno).
  1. Usa internamente a Replit AI Integrations para acessar o Gemini.
  2. NÃO exige chave de API própria (provisionada automaticamente).
  3. O consumo é cobrado nos créditos da conta.
- Modelo padrão de extração: `gemini-2.5-flash` (rápido e econômico para alto volume).
- Escalonamento automático: se a confiança da extração for baixa, refazer com `gemini-3.1-pro-preview` (raciocínio mais forte).
- Visão (OCR): para PDF escaneado/imagem, enviar a página como imagem ao Gemini (entrada multimodal). PDF digital: extrair texto primeiro (mais barato e exato) e só cair para visão se o texto vier pobre.

---

## Requisitos exatos (numerados)

1. **Ingestão**: aceitar upload de PDF e de imagem (JPG/PNG), por dois caminhos (Modo Duplo):
   1.1. Portal do cliente (já existe) — após upload, dispara o motor.
   1.2. Tela avulsa no Paxter — seletor de paciente (ou criar lead) + upload, chama o mesmo motor.
2. **Idempotência de arquivo**: calcular hash do arquivo; se o mesmo arquivo já foi processado para o mesmo paciente, não reprocessar nem duplicar.
3. **Extração de texto**: PDF digital via biblioteca de texto; se o texto vier insuficiente, cair para OCR/visão da IA.
4. **Extração estruturada (IA)**: a IA devolve JSON estrito validado por Zod com:
   4.1. Paciente: nome, CPF, data de nascimento (quando presentes no laudo).
   4.2. Metadados: data de coleta/recebimento, laboratório.
   4.3. Lista de analitos: nome, valor, unidade, intervalo de referência do laudo, e histórico (datas + valores) quando o laudo trouxer.
5. **Normalização de analito**: mapear o nome lido para um código canônico via dicionário de sinônimos (exemplo: "Glicose"="Glicemia de jejum").
6. **Conversão de unidades**: motor determinístico converte o valor para a unidade canônica do analito.
   6.1. Conversões de escala (massa/volume) puras: g↔mg↔µg↔ng↔pg e /L↔/dL↔/mL (exemplo: mg/dL→mg/L = ×10; ng/mL→µg/L = ×1; µg/dL→µg/L = ×10).
   6.2. Conversões molar↔massa (exemplo: mmol/L↔mg/dL) usando massa molar guardada no catálogo por analito.
   6.3. Se a unidade lida for desconhecida para o analito, NÃO chutar: marcar "conferência obrigatória".
7. **Classificação por faixa**: aplicar as faixas internas do analito (Subcadastro de Exames) sobre o valor canônico e gravar o status (nome da faixa).
8. **Identificação do paciente**:
   8.1. Casar por CPF (só dígitos). Achou → usa.
   8.2. Sem CPF ou não encontrado → casar por nome (alta similaridade) com confirmação humana.
   8.3. Não existe → criar cadastro novo (lead) com nome+CPF+nascimento do laudo.
9. **Persistência em 3 frentes (todas idempotentes)**:
   9.1. **Banco**: tabela de documento do exame + tabela de resultados (1 linha por analito).
   9.2. **Google Drive**: garantir pasta do cliente (NOME + CPF) e arquivar o PDF na subpasta EXAMES; não duplicar arquivo já existente.
   9.3. **Planilha Google padronizada**: 1 planilha por cliente; 1 linha por analito (unidade canônica); a cada exame recebido, **uma coluna nova** com a data, preenchida com valor + status; não recriar coluna de data já existente.
10. **Conferência humana (humano no circuito)**: tela mostrando o que a IA leu, com nível de confiança por campo; a secretária confirma em 1 clique. Valor clínico só é tratado como verdade após conferência (regra de segurança).
11. **Notificação**: ao concluir, enviar e-mail (Gmail) e WhatsApp (Twilio) avisando que o exame foi recebido.
12. **Visualização**: o resultado aparece na sessão Exames do cliente e, havendo exames anteriores do mesmo analito, monta o comparativo antes/depois.

---

## Modelo de dados (novas tabelas)

| Tabela | Para quê | Campos-chave |
|---|---|---|
| exam_documents | 1 por arquivo recebido | id, clientId, hash (único p/ idempotência), fileName, labName, collectionDate, sourcePdfDriveId, status (recebido/conferido), confidence, rawJson (jsonb), createdAt |
| exam_results | 1 por analito por documento | id, examDocumentId, clientId, analyteCode, analyteNameRaw, valueRaw, unitRaw, valueCanonical (numeric), unitCanonical, refLow, refHigh, status, collectionDate |
| exam_analyte_catalog | catálogo canônico de analitos | code, displayName, synonyms (jsonb), canonicalUnit, molarMass (p/ molar↔massa), direction (maior/menor melhor) |
| exam_analyte_ranges | faixas por analito (liga ao Subcadastro) | analyteCode, faixaName, low, high, color, ordem |

Observação: reaproveitar `clients`, `google-drive.ts` (ensureClientFolderStructure, uploadFileToDrive, createClientSpreadsheet, getSheetsClient), `email-service.ts`/`google-gmail.ts` (sendGmailMessage) e `whatsapp.ts` (sendWhatsapp). Não reescrever o que já existe.

---

## Catálogo editável de exames — parametrização de apelidos (refinamento do CEO, 25/06/2026)

Decisão do CEO: os "equívocos" previsíveis da IA/OCR (a sigla que muda, o apelido do exame) NÃO ficam
escondidos no código — viram **parâmetro editável** num cadastro. Quando o motor não acha um exame pelo
nome convencional, ele procura, em paralelo, por todos os apelidos cadastrados.

| Conceito | Significado | Exemplo |
|---|---|---|
| Nome canônico | o nome oficial único do exame no sistema | Hemoglobina Glicada |
| Apelido (alias) | qualquer outro nome/sigla que o mesmo exame pode aparecer no laudo | A1C, HbA1c, Glico-Hb |
| Busca em paralelo | ao casar, o motor testa nome canônico E todos os apelidos ao mesmo tempo | "A1C" no laudo -> casa com Hemoglobina Glicada |
| Editável | o CEO inclui/edita apelidos por tela, sem depender do agente | adicionar "HMG" como apelido de Hemograma |

Regras:
1. O campo `synonyms` (jsonb) de `exam_analyte_catalog` é a fonte dos apelidos (lista de strings).
2. Casamento é case-insensitive e ignora acento/pontuação (normalização).
3. Apelido novo NUNCA apaga histórico já gravado; só melhora o casamento dos próximos laudos.
4. Tela de cadastro (gerência do catálogo) entra na ONDA de interface (UI), com entrada própria no menu
   (Regra de Ouro: toda ferramenta tem entrada no menu). O motor já passa a CONSUMIR os apelidos na Onda 2.

### Exames de imagem (trilha paralela — depende de amostras do CEO)

Exame de imagem não tem "valor numérico + unidade"; tem **achados qualitativos** (tem nódulo / não tem,
medida, classificação). Precisa de um catálogo próprio de "campos a extrair por tipo de exame de imagem".

| Tipo de imagem | Achados-padrão a extrair (exemplo inicial) |
|---|---|
| Ultrassom de tireoide | tem nódulo (sim/não), tamanho, lateralidade, classificação TI-RADS |
| Ultrassom abdominal | esteatose hepática (sim/não), cálculo (sim/não), medidas de órgãos |
| Densitometria óssea | T-score, Z-score, diagnóstico (normal/osteopenia/osteoporose) |

Sigla TI-RADS = sistema de classificação de risco de nódulo de tireoide. Esta trilha só será especificada
em detalhe DEPOIS que o CEO enviar 2 ou 3 laudos de imagem reais, para padronizar os campos a partir do
que os laudos realmente trazem (não chutar).

---

## "Almoço grátis" — colher o histórico que o próprio laudo entrega (CEO, 25/06/2026)

Regra do CEO: quando o laudo traz, em algum trecho, valores de datas ANTERIORES (tabela comparativa do
próprio laboratório), o sistema NÃO descarta isso — colhe cada data passada como uma coluna nova no
comparativo. "Almoço grátis": dado de graça que já veio no arquivo.

| Situação no laudo | O que o sistema faz |
|---|---|
| Laudo traz só o valor da data atual | 1 coluna nova (data da coleta atual) |
| Laudo traz valor atual + histórico de datas anteriores | 1 coluna por data encontrada (atual + cada data passada) |
| Mesma data, dois laboratórios diferentes | 2 colunas distintas para a mesma data, cada uma com seu laboratório no cabeçalho |

Cabeçalho de cada coluna do comparativo:
1. Linha 1 = a DATA (padrão Brasil, ex.: 11/06/2026).
2. Linha 2 = o LABORATÓRIO de origem daquela coluna (nome canônico, apelido ou abreviação, ex.: DASA).
3. Se o nome do laboratório passar de N caracteres, mostra abreviado com reticências ("...") e expande ao
   clicar / passar o mouse (nome completo no título).
4. Não é obrigatório amarrar "qual exame veio de qual laboratório" linha a linha; basta a coluna saber o
   laboratório dela. (Amarração fina por linha fica como melhoria opcional futura.)

Persistência: cada par (data + laboratório) é uma coluna única na planilha e um conjunto de resultados no
banco; reprocessar o mesmo laudo NÃO duplica colunas nem linhas (idempotência por data+laboratório+analito).

---

## Cadastro de unidades por exame — nada hard-coded (CEO, 25/06/2026)

Regra do CEO: nada de unidade fixa no código. Para cada exame, o cadastro lista TODAS as unidades em que
ele pode aparecer, e o CEO marca qual é a "nossa convenção" (unidade canônica). Tudo visível e editável.
"hard-coded" = valor cravado dentro do código, que só o programador muda; o CEO quer o oposto: editável por tela.

| Campo do cadastro de unidade | Para quê | Exemplo (Hemoglobina Glicada) |
|---|---|---|
| Unidade variante | uma forma em que o exame pode vir no laudo | %, mmol/mol |
| Fator de conversão para a canônica | quanto multiplicar para chegar na nossa unidade | mmol/mol -> % via fórmula |
| É a convenção? (marca única) | qual unidade o sistema mostra como padrão | % (marcada) |
| Toggle ativa/desativa | liga ou desliga aquela unidade/conversão sem apagar o registro | desligar uma unidade rara |

Regras:
1. Exatamente UMA unidade marcada como canônica por exame (a "nossa convenção").
2. Toda outra unidade tem fator/fórmula de conversão para a canônica; sem conversão conhecida -> resultado
   vai para "conferência obrigatória" (não chuta).
3. Toggle desligado = o sistema ignora aquela unidade na conversão automática, mas o registro continua lá.
4. Tela de cadastro entra na onda de interface (UI), com entrada no menu. O motor já consome essa tabela na Onda 2.

Modelo de dados acrescentado: tabela `exam_analyte_units` (analyteCode, unit, factorToCanonical numeric OU
formulaKey, isCanonical bool, active bool, ordem). A coluna `canonicalUnit` de `exam_analyte_catalog` passa a
ser derivada da unidade marcada como canônica nesta tabela.

---

## Pipeline (blueprint)

Upload (portal OU avulso) -> hash/idempotência -> extrai texto (ou OCR/visão) -> IA devolve JSON -> normaliza analito -> converte unidade -> classifica faixa -> identifica/cria paciente -> grava (banco + Drive + planilha) -> conferência humana 1 clique -> notifica (e-mail + WhatsApp) -> aparece em Exames + comparativo antes/depois.

---

## Casos extremos a tratar

| Caso | Comportamento esperado |
|---|---|
| Mesmo arquivo enviado 2 vezes | Idempotência por hash: não duplica |
| Paciente sem cadastro | Cria lead com dados do laudo + cria pasta no Drive |
| Laudo sem CPF | Casa por nome com confirmação; se nada, cria lead por nome |
| Unidade fora do padrão do analito | Converte; se desconhecida, marca "conferência obrigatória" (não chuta) |
| Decimal com vírgula (padrão Brasil) e milhar com ponto (210.000) | Parser entende vírgula decimal e ponto de milhar |
| Laudo escaneado (imagem) | Cai para visão/OCR da IA |
| Laudo traz histórico (PCR, Ferro do exame real) | Importa as datas históricas como resultados anteriores p/ o comparativo |
| Analito com sinônimo (Glicose/Glicemia) | Normaliza para o código canônico |
| Pasta/planilha/arquivo já existentes no Drive | Não recria; só acrescenta o que falta |
| IA com baixa confiança | Reprocessa com modelo pro; segue para conferência humana destacada |

---

## Definição de PRONTO (conferível por qualquer um)

1. Subir o PDF real do CEO (Caio Henrique Souza Padua, CPF 293.274.948-06) extrai corretamente: Hemoglobina 18,4 g/dL, Ferritina 617,3 ng/mL, PCR ultrassensível 0,29 mg/dL (com histórico), Ferro 123 µg/dL (com histórico), e marca corretamente acima/abaixo/dentro da referência.
2. A conversão de unidades passa nos testes determinísticos (mínimo 10 pares de unidade, incluindo mg/dL↔mg/L e molar↔massa).
3. O paciente é localizado (se existir) ou criado (se não existir), e a pasta no Drive (NOME + CPF) é garantida sem duplicar.
4. A planilha Google ganha uma coluna nova com a data do exame, valores na unidade canônica e status por faixa.
5. Os resultados aparecem na sessão Exames do cliente e o comparativo antes/depois aparece quando há histórico.
6. E-mail e WhatsApp de "exame recebido" são disparados.
7. Testes semânticos com 10 exames diferentes (valores/unidades/situações diferentes) passam nos critérios definidos abaixo.
8. Rodar o pipeline duas vezes no mesmo arquivo não duplica nada (idempotência comprovada).

---

## Plano de testes

### Determinísticos (lógica pura, sem IA)
1. Conversão de unidades: 10+ pares (mg/dL↔mg/L, ng/mL↔µg/L, µg/dL↔µg/L, mmol/L↔mg/dL via massa molar, g/dL fixo, /µL fixo, % fixo).
2. Parser numérico Brasil: "18,4" → 18.4; "210.000" → 210000; "617,3" → 617.3.
3. Classificação por faixa: valores nas bordas (low, high) caem na faixa certa.
4. Normalização de CPF: "293.274.948-06" → "29327494806".
5. Sinônimos de analito: "Glicose"→código de Glicemia.
6. Idempotência: mesmo hash inserido 2x → 1 documento.

### Semânticos (10 exames reais/sintéticos passando pela IA)
Cada caso varia laboratório, unidades e situação. Critério de aprovação por caso: paciente correto, data de coleta correta, e ≥ 90% dos analitos com valor+unidade+status corretos.
1. Exame real do CEO (DASA, hemograma + PCR + Ferro + Ferritina, com históricos).
2. Glicemia + HbA1c (% e mmol/mol) — diabetes.
3. Perfil lipídico (mg/dL) — colesterol alto.
4. TSH/T4 livre (µUI/mL, ng/dL) — tireoide.
5. Vitamina D (ng/mL) — deficiência.
6. PCR em mg/L (não mg/dL) — testar conversão de escala.
7. Laudo sem CPF — deve criar lead por nome.
8. Laudo escaneado (imagem) — caminho OCR/visão.
9. Homocisteína (µmol/L) — conversão molar.
10. Hemograma com milhar e vírgula (210.000 /µL; 5,90 10^6/µL).

---

## Linhas vermelhas (NÃO violar)

1. Não tocar no motor de orçamento (`/api/budgets/calculate`) nem no motor de desmembramento.
2. Não quebrar o portal do cliente nem o fluxo de upload já existente.
3. Valor clínico só é "verdade" após conferência humana; a IA propõe, a pessoa confirma.
4. Nunca recriar pasta/arquivo/planilha já existentes no Drive (idempotência).
5. Decimal com vírgula e datas no padrão Brasil.
6. Não inventar conversão de unidade desconhecida — marcar para conferência.
7. Não gravar prefixo/tag de origem nos dados (conceito de sistemas primos).

---

## Ondas de construção (FASE 2, após confirmação da arquitetura)

| Onda | Entrega |
|---|---|
| 1 | Ligar IA (Gemini) + extração de texto/OCR + motor de extração estruturada (JSON validado) |
| 2 | Motor de conversão de unidades + normalização de analito + classificação por faixa (com testes determinísticos) |
| 3 | Identificação/criação de paciente + persistência no banco (tabelas novas) |
| 4 | Persistência Drive (pasta + PDF) + planilha Google padronizada (coluna por exame), idempotente |
| 5 | Tela de conferência humana (1 clique) + Modo Duplo (avulso por seletor) |
| 6 | Notificação (e-mail + WhatsApp) + visualização em Exames + comparativo antes/depois |
| 7 | Testes semânticos com os 10 exames + revisão do architect até zero pendência |
