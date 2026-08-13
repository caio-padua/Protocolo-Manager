# Backlog Kaizen da Jornada da Paciente — Item #88

**Princípio:** uma Carta de Tratamento surpreende quando reduz incerteza, torna a conversa clínica mais clara e devolve à paciente uma sensação de cuidado organizado. Ela não deve impressionar com promessas, excesso de informação, diagnóstico automático ou linguagem de marketing.

## O momento de abertura: a regra dos 60 segundos

>A paciente deve conseguir responder em um minuto: **“o que é este plano, o que estou recebendo, por que cada parte está aqui, o que pode variar e como falar com minha equipe?”**

A capa e o roteiro já resolvem identidade, sessões e organização do plano. A ficha de cada substância deve resolver o restante por meio de blocos fixos, com a mesma ordem em todas as páginas. A repetição deliberada é uma forma de acessibilidade: a paciente aprende onde procurar cada resposta.

| Pergunta da paciente | Dado existente | Bloco atual da Carta | Microcopy recomendada para curadoria |
|---|---|---|---|
| “O que é isto?” | `description` | O que é | “Esta substância integra o seu plano por suas características e pelo objetivo definido em consulta.” |
| “Por que foi incluída para mim?” | `mainFunction` | Função no seu plano | “No seu plano, o foco desta etapa é…” |
| “O que pode mudar na minha experiência?” | `perceivedEffects` | O que pode ser percebido | “Algumas pessoas podem perceber… A resposta pode variar; converse com a equipe sobre sua experiência.” |
| “Quando conversamos sobre evolução?” | `timeToEffect` + sessões | Ritmo e acompanhamento | “O acompanhamento será feito ao longo do cronograma; o tempo de resposta pode variar.” |
| “Onde ela entra no plano?” | `bodySystemEffects` | Mapa de sistemas | “Mapa de ênfase do protocolo — não é um exame nem uma medição individual.” |
| “O que é importante informar?” | `contraindications` | Segurança | “Antes de qualquer mudança, informe à equipe medicamentos em uso, alergias, gestação, cirurgias e intercorrências.” |
| “Quanto sabemos sobre isto?” | `scientificEvidence` | Ciência & indicação | “A força da evidência é apresentada com transparência; dúvidas devem ser discutidas em consulta.” |

## Kaizen de primeira ordem: usar somente a fiação existente

Estes aprimoramentos podem entrar no catálogo após revisão médica porque usam campos que já são editáveis, persistidos e consumidos pela Carta Premium. Não exigem novo banco, nova rota, nova tela ou inferência por IA em tempo de geração.

| Prioridade | Melhoria | Campo editável | Critério editorial | Como surpreende sem exagerar |
|---:|---|---|---|---|
| K1 | **Narrativa de propósito** | `mainFunction` | Uma frase que liga a substância ao objetivo do plano, sem alegação de resultado garantido. | Troca a sensação de “lista de produtos” por “plano pensado”. |
| K2 | **Expectativa calibrada** | `perceivedEffects`, `timeToEffect` | Possibilidades observáveis, variação individual e horizonte de conversa. | A paciente não precisa adivinhar o que merece ser relatado. |
| K3 | **Segurança acionável** | `contraindications` | Contexto relevante + instrução de comunicar a equipe; sem prescrever conduta automática. | Demonstra cuidado com o que pode dar errado, não apenas com benefícios. |
| K4 | **Ciência traduzida** | `scientificEvidence` | Certeza, limites e fonte técnica curta, todos revisados por médico. | É incomum receber transparência real sem uma aula impossível de ler. |
| K5 | **Benefícios com seletividade** | `energyBenefit`, `sleepBenefit`, `mentalClarity` e demais | Preencher somente domínios pertinentes à substância e à evidência; máximo de duas frases por domínio. | Evita o catálogo que promete tudo e passa a ser confiável. |
| K6 | **Mapa com honestidade** | `bodySystemEffects`, `starRating` | Tratar as escalas como ênfase editorial do catálogo; legenda obrigatória. | O gráfico fica útil visualmente sem se disfarçar de biometria pessoal. |

## Kaizen de segunda ordem: requer pequena fiação, não novo schema

| Prioridade | Ganho para a paciente | Campo já editável, ainda não entregue ao PDF | Alteração técnica mínima | Regra de segurança |
|---:|---|---|---|---|
| K7 | Entender um blend sem precisar perguntar “o que tem aqui?”. | `composicao` | Incluir no select/mapeamento de `protocols.ts`, DTO da Carta e `pdf-carta-tratamento.ts`. | Exibir como composição do cadastro; não confundir com dose individual. |
| K8 | Diferenciar orientação geral da prescrição daquele protocolo. | `posologia` | Mesmo transporte acima; renderer prioriza `scheduledItems` quando houver dose prescritiva. | A prescrição individual vence sempre; nunca preencher por padrão sem checagem. |
| K9 | Ver, em linguagem simples, os quatro medidores do catálogo. | `categoryMeters` | Passar JSON já existente e desenhar barras verticais no campo direito. | Legenda: “ênfase do protocolo”; não chamar de resultado, eficácia ou prognóstico. |

## O que uma paciente realmente gostaria de ver — mas não está no catálogo hoje

Esses itens devem ser tratados como backlog de produto, e **não colados de forma improvisada em `description` ou `contraindications`**. O texto livre misturaria autoria, prescrição e segurança, tornando o PDF menos confiável.

| Desejo legítimo da paciente | Dado inexistente hoje | Pré-requisito de uma onda futura |
|---|---|---|
| “Quando e onde é minha próxima sessão?” | Data, local, profissional, status. | Campos estruturados do protocolo e owner clínico. |
| “Como me preparo?” | Checklist de preparo por procedimento/indicação. | Autoria médica, versão, validade e escopo por via. |
| “O que faço se houver algo inesperado?” | Critérios de contato e canal oficial. | Validação de risco, horários e responsável de plantão. |
| “Como está minha evolução?” | Métricas individuais de baseline e acompanhamento. | Instrumento clínico aprovado, consentimento e interpretação profissional. |
| “Quais são as referências completas?” | DOI/PMID/URL por afirmação e data de revisão. | Modelo de referências estruturado, não texto solto. |
| “Quem pode prescrever ou executar?” | Score de competência reguladora. | Campo novo, responsável regulatório e regra de exibição por procedimento. |

## Critérios de aceite por lote de curadoria

Cada substância só pode ser promovida a produção se cumprir todos os critérios abaixo. Não há “exceção porque o texto ficou bonito”.

| Teste | Pergunta verificável | Evidência |
|---|---|---|
| Campo | O texto cabe no campo correto sem repurposing? | Diff do cadastro/export JSON. |
| Fonte | A afirmação tem fonte primária, diretriz, revisão sistemática ou ficha institucional identificável? | URL/DOI/PMID e data de acesso. |
| Linguagem | O verbo é proporcional ao nível de certeza? | Revisão clínica na matriz. |
| Segurança | Interações, contraindicações e ausência de evidência foram tratadas quando relevantes? | Checklist de revisão médica. |
| PDF | O conteúdo aparece inteiro no bloco correto e preserva uma substância por folha? | PDF A4 de prova. |
| Reversão | O registro anterior está recuperável? | Backup exportado e `updatedAt` registrado. |

## Kaizen que deve ser recusado nesta fase

A Carta não deve gerar “curiosidades” não verificadas, ranking de substâncias, escore de eficácia, perfil de diagnóstico, recomendações automáticas de troca/dose ou mensagens que empurrem uma paciente a iniciar, parar ou ajustar tratamento sem consulta. Esses atalhos dariam aparência de sofisticação ao custo de segurança, evidência e confiança.

## Próximo passo da orquestração

O Dr. Replit fornece o export **somente-leitura, sem dados de pacientes**, do catálogo vivo. O conjunto mínimo é: `id`, `name`, `updatedAt` e todos os campos da matriz de curadoria. A partir dele, a pesquisa é realizada por coortes de substâncias reais; para cada uma, Manus prepara texto proposto + fontes + nível de evidência + campo-alvo, e o médico responsável decide. Somente depois o Dr. Replit aplica o lote aprovado e entrega backup, diff e PDFs A4 de validação.
