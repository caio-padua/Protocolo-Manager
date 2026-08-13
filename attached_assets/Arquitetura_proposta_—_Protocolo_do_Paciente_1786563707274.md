# Arquitetura proposta — Protocolo do Paciente

**Projeto:** redesign do PDF do Protocolo Manager  
**Autor:** Manus AI  
**Status:** especificação funcional e editorial para protótipo  
**Escopo:** documento educativo do paciente, anexos clínico-legais e componente de gráfico radar

## 1. Princípio do redesign

O documento atual já contém quase todos os dados necessários. A melhoria principal não exige aumentar a quantidade de informação, mas **reordená-la segundo as perguntas do paciente**. A mensagem essencial deve aparecer primeiro, em blocos curtos, com linguagem direta e apoio visual. Essa abordagem é coerente com a recomendação de linguagem simples do CDC e com a orientação do CFM para que o consentimento seja claro, acessível e acompanhado de explicação dos termos técnicos.[1] [2]

> **Decisão de produto:** o novo PDF será um pacote único, mas com duas camadas visivelmente separadas: **Guia do Paciente** e **Anexos Clínico-Legais**.

A camada educativa não substitui o TCLE, a conversa com o profissional nem a avaliação individual. Ela prepara o paciente para compreender e formular perguntas.

## 2. Arquitetura recomendada do documento

| Ordem | Página/seção | Pergunta respondida | Conteúdo principal |
| --- | --- | --- | --- |
| 1 | Capa orientada ao paciente | “Que documento é este?” | Nome abreviado, objetivo do plano, profissional, início, sessões, QR/link de contato e aviso de confidencialidade |
| 2 | Seu plano em 1 minuto | “O que preciso entender primeiro?” | Três objetivos, composição resumida, duração, próximo passo e cuidados essenciais |
| 3 | Roda do protocolo | “Quais áreas serão acompanhadas?” | Radar semanticamente tipado, explicação em frase e tabela curta com valores/origem |
| 4 | Como as substâncias se complementam | “Por que cada uma foi escolhida?” | Cartões comparativos com contribuição principal, complementar e cuidados |
| 5–7 | Uma ficha por substância | “O que é, o que pode mudar e quando devo avisar?” | Resumo leigo, objetivo, possíveis percepções, janela temporal, dose/via/sessões, alertas e nota de evidência |
| 8 | Sua jornada | “Como o protocolo acontece?” | Linha do tempo com sessões, marcos, reavaliação e contato |
| 9 | Cuidados e próximos passos | “O que devo fazer agora?” | Preparação, orientações, sinais de alerta e canais da equipe |
| 10 | Investimento | “O que está incluído?” | Valor total, inclusões, situação de pagamento e detalhamento secundário |
| 11 | Vamos confirmar juntos | “O que eu entendi e o que ainda quero perguntar?” | Duas perguntas de confirmação, campo para dúvidas e registro de esclarecimento |
| 12 em diante | Anexos clínico-legais | “Quais são os detalhes formais?” | Prescrição detalhada, TCLE, LGPD, cronograma técnico, assinatura e verificação ICP-Brasil |

A sequência pode variar conforme a quantidade de substâncias, mas a página 2 deve permanecer curta e a separação entre guia e anexos deve ser explícita.

## 3. O gráfico solicitado: nome e uso correto

O elemento descrito como “roda”, “guarda-chuva”, “teia” ou “aranha” é um **gráfico radar**. Ele é adequado para condensar várias dimensões e comparar momentos, desde que todas usem escala e direção consistentes. A AHRQ alerta que o radar atribui visualmente peso semelhante aos eixos, portanto ele não deve sugerir que todas as dimensões têm a mesma importância clínica.[3]

Para o ecossistema Paxter, devem existir **dois modos distintos**, nunca misturados:

| Modo | Título apresentado ao paciente | O que mede | Quando usar |
| --- | --- | --- | --- |
| `protocol_focus` | **Áreas de foco do seu protocolo** | Prioridade definida pelo profissional a partir do plano prescrito | PDF inicial, quando ainda não há medida de evolução |
| `health_evolution` | **Sua evolução percebida** | Escore informado pelo paciente e/ou avaliação clínica padronizada em dois momentos | RAS evolutivo ou reavaliação |

O modo inicial não deve ser chamado de “estado da saúde” nem de “resultado esperado”. Ele representa apenas **onde o plano concentra atenção**. O modo evolutivo não deve atribuir causalidade automática às substâncias.

## 4. Dimensões recomendadas

O radar deve usar de seis a oito dimensões, com rótulos curtos. A configuração inicial recomendada para este tipo de protocolo é:

| ID | Rótulo curto | Pergunta de leitura em linguagem simples |
| --- | --- | --- |
| `energia` | Energia | “Como está sua disposição no dia a dia?” |
| `sono` | Sono | “Como está a qualidade do seu sono?” |
| `clareza_mental` | Clareza mental | “Como estão foco, memória e raciocínio?” |
| `imunidade` | Imunidade | “Como está sua percepção de resistência e recuperação?” |
| `forca_mobilidade` | Força e mobilidade | “Como está sua capacidade física funcional?” |
| `metabolismo` | Metabolismo | “Como estão os sinais metabólicos acompanhados pela equipe?” |
| `qualidade_vida` | Qualidade de vida | “Como está seu bem-estar global?” |

**Longevidade** não deve ser usada como escore evolutivo de curto prazo, pois pode parecer um desfecho diretamente medido. Ela pode permanecer como objetivo longitudinal em texto ou, se o profissional adotar um instrumento validado, receber definição própria.

## 5. Escalas e origem dos dados

### 5.1 Modo `protocol_focus`

A escala deve ser ordinal e explícita, não percentual:

| Valor | Rótulo exibido | Significado |
| ---: | --- | --- |
| 0 | Não avaliado | Não há informação suficiente |
| 1 | Apoio | Área complementar do plano |
| 2 | Foco | Área relevante do protocolo |
| 3 | Foco principal | Uma das prioridades definidas pelo profissional |

A pontuação não deve ser calculada somente pela quantidade de campos de benefício preenchidos. O profissional deve confirmar a prioridade clínica ou uma regra institucional validada deve ser documentada.

### 5.2 Modo `health_evolution`

Usar escala de **0 a 10**, com a mesma direção em todos os eixos: quanto maior, melhor a percepção/resultado naquele instrumento. Os valores devem vir de questionário, avaliação clínica definida ou transformação documentada de um instrumento validado. Se a fonte for diferente, mostrar séries separadas ou gráficos diferentes.

| Série | Estilo recomendado | Regra |
| --- | --- | --- |
| Início | Linha azul-marinho tracejada, sem preenchimento | Data e origem obrigatórias |
| Agora | Linha dourada contínua, preenchimento transparente | Data e origem obrigatórias |
| Meta | Não usar por padrão | Só exibir se definida com o paciente e contextualizada pelo profissional |

O gráfico deve comparar no máximo duas séries por vez. Valores exatos devem aparecer em tabela curta ao lado ou logo abaixo; o visual não deve depender apenas da cor. Recursos visuais podem apoiar a compreensão de informações de saúde, mas precisam de rótulos e explicações claras.[4] [5]

## 6. Contrato de dados proposto

```ts
type RadarMode = 'protocol_focus' | 'health_evolution';
type RadarSource =
  | 'clinician_priority'
  | 'patient_reported'
  | 'clinician_assessment'
  | 'validated_instrument'
  | 'lab_normalized';

interface ProtocolRadarDimension {
  id: string;
  label: string;
  shortLabel: string;
  value: number | null;
  previousValue?: number | null;
  source: RadarSource;
  sourceLabel: string;
  measuredAt?: string;
  previousMeasuredAt?: string;
  scaleMin: number;
  scaleMax: number;
  higherIsBetter: boolean;
  clinicianNote?: string;
}

interface ProtocolRadarData {
  mode: RadarMode;
  title: string;
  interpretation: string;
  dimensions: ProtocolRadarDimension[];
  disclaimer: string;
  reviewedBy?: string;
  reviewedAt?: string;
}
```

### Regras de validação

1. Todas as dimensões do mesmo gráfico devem ter `scaleMin`, `scaleMax` e `higherIsBetter` compatíveis.
2. Valores ausentes permanecem `null`; o sistema não deve completar ou estimar silenciosamente.
3. `lab_normalized` não deve ser misturado com `patient_reported` no mesmo polígono.
4. O modo `health_evolution` exige data e fonte em cada série.
5. O texto de interpretação deve ser aprovado pelo profissional ou gerado a partir de regra institucional revisada.
6. A legenda fixa deve dizer que o gráfico organiza informações e não constitui diagnóstico isolado nem promessa de resultado.

## 7. Leitura do gráfico pelo paciente

O radar nunca deve aparecer sozinho. Abaixo do título, deve haver uma frase interpretativa, por exemplo:

> **Como ler:** quanto mais distante do centro, maior a prioridade desta área no seu protocolo. Este desenho mostra foco do plano, não gravidade da sua saúde nem garantia de resultado.

Para evolução:

> **Como ler:** a linha tracejada mostra seu ponto de partida e a linha dourada mostra seu relato atual. Uma mudança no desenho orienta a conversa com a equipe, mas não substitui avaliação clínica.

Quando houver uma dimensão menor, o documento deve chamá-la de **“ponto para acompanhar”**, e não “falha”, “piora” ou “risco”, salvo quando o profissional registrar formalmente um risco.

## 8. Nova ficha de substância

Cada ficha deve começar com três respostas e só depois apresentar detalhes técnicos:

| Bloco | Exemplo de título | Regra editorial |
| --- | --- | --- |
| Motivo | **Por que foi incluída** | Uma frase, vinculada ao objetivo individual |
| Possíveis mudanças | **O que você pode perceber** | No máximo três itens; usar “pode” e “algumas pessoas” |
| Janela | **Quando costuma ser reavaliada** | Intervalo, não promessa de início de efeito |
| Segurança | **Quando falar com a equipe** | Alertas claros e específicos, sempre visíveis |
| Técnica | **Como será usada** | Dose, via, frequência e sessões |
| Evidência | **O que sabemos até aqui** | Síntese neutra, fonte/categoria e revisão clínica |

A linguagem deve evitar certeza indevida. Substituições recomendadas:

| Evitar | Preferir |
| --- | --- |
| “vai melhorar sua energia” | “foi incluída com o objetivo de apoiar energia e disposição” |
| “efeito garantido” | “a resposta varia entre pessoas” |
| “detoxificação profunda” | “participa de processos antioxidantes e metabólicos; o significado clínico deve ser explicado pela equipe” |
| “eficácia 5 estrelas” | “nível de evidência ou uso clínico, conforme critério institucional explicitado” |
| “resultado em 7 dias” | “a equipe costuma reavaliar este objetivo a partir de…” |

## 9. Confirmação de entendimento

Antes do TCLE, incluir um bloco curto inspirado em *teach-back*. A técnica pede que a pessoa explique com suas próprias palavras e serve para verificar a clareza da comunicação, não para testá-la.[6]

> **Vamos confirmar juntos**  
> 1. Com suas palavras, qual é o objetivo principal deste protocolo?  
> 2. Em quais situações você deve falar com a equipe?  
> 3. Que dúvida ainda quer esclarecer antes de assinar?

Esse bloco deve ser opcional no PDF e registrável no prontuário. O consentimento continua sendo processo de conversa e esclarecimento, e não apenas uma assinatura.[2]

## 10. Integração recomendada no Protocolo Manager

A rota, o upload para Google Drive, o e-mail e a assinatura digital podem ser preservados. A mudança deve ocorrer no DTO compartilhado e no renderizador.

| Camada | Mudança recomendada |
| --- | --- |
| DTO | Centralizar a montagem usada por `routes/protocols.ts` e `routes/area-paciente.ts` |
| Banco | Adicionar dados tipados de radar, fonte, escala, data e revisão clínica |
| Renderização | Dividir `generateProtocolDocumentPdf()` em componentes de página e reutilizar tokens da Fábrica |
| Segurança | Finalizar todo o conteúdo antes da assinatura PAdES e repetir testes de integridade |
| Governança clínica | Exigir status `draft`, `clinically_reviewed` ou `published` para textos educativos |
| Compatibilidade | Manter o gerador antigo disponível por *feature flag* durante a migração |

## 11. Critérios de aceite

O protótipo e a implementação serão considerados adequados quando:

1. o paciente identificar objetivo, composição, duração, cuidados e próximo passo nas duas primeiras páginas;
2. o radar declarar modo, fonte, escala, data e significado;
3. nenhum círculo, estrela ou percentual for apresentado como eficácia individual sem definição;
4. cada substância tiver motivo, expectativa, janela de reavaliação e alerta;
5. o TCLE usar corpo equivalente a pelo menos 12 pt e tiver espaço para dúvidas, conforme recomendação do CFM;[2]
6. todas as páginas forem geradas antes da assinatura e a verificação PAdES continuar válida;
7. o fluxo administrativo e a área do paciente exibirem o mesmo documento e os mesmos dados.

## Referências

[1]: https://www.cdc.gov/health-literacy/php/develop-materials/plain-language.html "CDC — Plain Language Materials & Resources"
[2]: https://portal.cfm.org.br/images/Recomendacoes/1_2016.pdf "Conselho Federal de Medicina — Recomendação CFM nº 1/2016"
[3]: https://digital.ahrq.gov/health-it-tools-and-resources/evaluation-resources/workflow-assessment-health-it-toolkit/all-workflow-tools/radar-chart "AHRQ Digital Healthcare Research — Radar Chart"
[4]: https://www.cdc.gov/health-literacy/php/develop-materials/visual-communication.html "CDC — Visual Communication Resources"
[5]: https://pmc.ncbi.nlm.nih.gov/articles/PMC11165863/ "Galmarini, Marciano e Schulz — Visual-based interventions on health literacy"
[6]: https://www.ahrq.gov/health-literacy/improve/precautions/tool5.html "AHRQ — Use the Teach-Back Method: Tool 5"

## 12. Decisão visual do protótipo de radar

O componente demonstrativo foi renderizado e revisado em duas iterações. A segunda versão resolveu a sobreposição entre título, subtítulo e rótulo superior. O arquivo final preserva:

- sete eixos, limite que mantém leitura confortável em A4;
- escala ordinal escrita por extenso (`Apoio`, `Foco`, `Foco principal`);
- pontos visíveis sobre o polígono;
- preenchimento translúcido e contorno dourado, sem depender apenas da cor;
- rótulos em linguagem simples;
- ressalva explícita de que o desenho não mede gravidade, resultado ou garantia de benefício.

Os valores do protótipo foram derivados exclusivamente dos maiores escores de `impacto por sistema corporal (0 a 5)` já presentes nas fichas do PDF atual. A normalização editorial usada para a demonstração é: `0–2 = Apoio`, `3–4 = Foco` e `5 = Foco principal`. Essa regra serve somente para visualizar o redesign; antes de produção, ela deve ser aprovada pela governança clínica e substituída por prioridade registrada diretamente pelo profissional.

**Ativos gerados:**

- `assets/radar_foco_protocolo.png` — versão raster para o protótipo PDF;
- `assets/radar_foco_protocolo.svg` — versão vetorial para implementação e alta resolução;
- `scripts/gerar_radar_foco.py` — fonte reprodutível do gráfico.
