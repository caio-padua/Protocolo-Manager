---
name: Conceitos RAS / FAP e Glossario de Prescricao (CEO Dr. Caio)
description: Definicoes de negocio do CEO para FAP (papel), RAS (nuvem), conciliacao, fluxo operacional de aplicacao, e glossario Anvisa/SNCR. Inclui divergencia de nomenclatura com o sistema atual.
---

# RAS / FAP — conceitos do CEO (fonte: 3 docs Google, glossario PAWARDS 26.06.02)

## ALERTA DE NOMENCLATURA (divergencia a resolver)
- No SISTEMA HOJE: "RAS" = Registro de Administracao de Substancias (PDF digital assinado ICP-Brasil) + "RAS Fisico" = impresso paisagem para a enfermeira preencher a mao.
- No DOC NOVO do CEO (CONCEITOS RAS FAP): a sigla muda de sentido:
  - **FAP = Formulario de Auditoria de Procedimentos** = o papel fisico de cabeceira preenchido A CANETA na sala, no momento exato da aplicacao. Prova fisica/juridica. (Equivale ao "RAS Fisico" de hoje.)
  - **RAS = Registro de Assistencia Sistemico** = prontuario macro DIGITAL em nuvem: historico, anamnese, planejamento, evolucao a longo prazo.
- **Acao futura (pedir validacao ao CEO antes de mexer):** alinhar a sigla no sistema. Provavel: renomear "RAS Fisico" -> "FAP"; e decidir se o "RAS digital" atual vira "RAS (Registro de Assistencia Sistemico)" ou mantem o nome antigo.

## Tres papeis do fluxo
- **FAP** (papel, caneta, na hora): data/hora real, nome comercial + miligragem (ml/UI), LOTE + VALIDADE, assinatura do profissional (carimbo) E do paciente (proprio punho).
- **RAS** (nuvem, digital): evolucao clinica, tolerancia, reacoes, salvo na pasta segura do paciente.
- **Conciliacao de Backoffice** (auditoria): cruzamento triplo agendamento x FAP papel x RAS nuvem (estoque + financeiro + presenca).

## Fluxo operacional (5 passos)
1. Manha: consultar agenda -> imprimir FAP do ciclo -> fixar na prancheta.
2. Aplicacao: profissional preenche a caneta (data/hora, substancia+dose, lote+validade) + colhe assinaturas (profissional e paciente).
3. Fim do turno: atualizar RAS na nuvem (evolucao, tolerancia, reacoes).
4. Fechamento semanal/mensal: conciliacao tripla (qualitativa sem rasura; quantitativa de estoque; financeira/agendamento).
5. Digitalizar FAP em alta resolucao -> anexar PDF na pasta RAS do paciente -> triturar/descartar papel (LGPD).

## Regras criticas de compliance
- Proibido preenchimento RETROATIVO: FAP preenchida no momento, nunca depois que o paciente sai.
- Rastreabilidade Anvisa: lote + validade na FAP e a unica garantia em evento adverso tardio.
- Validade juridica: evolucao no RAS SEM a FAP assinada a caneta pelo paciente NAO tem valor legal em contestacao/estorno.

# Glossario de prescricao (aba 1 do xlsx) — termos-chave
- **Prescricao** = ato/documento clinico completo (guarda-chuva); 1 prescricao gera N receitas.
- **Receita** = documento gerado A PARTIR da prescricao, formatado para farmacia/paciente.
- **Receita Manipulacao** (magistral/blend) x **Receita Drogaria** (industrializado pronto).
- **Blend** = mistura de varios ativos numa formula unica manipulada (sinergia + personalizacao + praticidade).
- **Ativo** = substancia individual; pode ser controlado ou nao.
- **Controlado** = ATRIBUTO sim/nao de um ativo (dispara receituario especial Anvisa), nao um tipo a parte.
- **Via de Administracao** = propriedade do item (oral, SL, topica, injetavel), nunca coluna nem procedimento.
- **Dose** = quantidade do ativo por administracao (nao confundir com capsula).
- **Tomada** = momento do dia em que o paciente usa (pode ter N doses por tomada).
- **Posologia** = instrucao completa = dose + VIA + frequencia + periodo + observacao.
  - Correcao do CEO: frequencia = se repete apos o termino (nao as vezes por dia); "tomada" = como ingere no dia.
- **Periodo do dia** = janela (jejum, manha, almoco, tarde, noite).
- **Desmembramento (REGRA 14)** = sistema quebra 1 prescricao em N receitas por cor/destino/legalidade.
- **Isolamento do Controlado** = gerar receita so com o controlado, exigida por lei mesmo dentro de blend.
- **Cobertura Legal** = copia isolada e numerada do controlado ao lado do blend.

# SNCR (Sistema Nacional de Controle de Receituarios)
- **Intervalo de Numeracao SNCR** (CEO mandou renomear de "Faixa" para "Intervalo"): intervalo X..Y liberado pela Anvisa por tipo de receita, medico e UF.
- **Numeracao SNCR** = numero individual arrancado do intervalo, impresso na receita isolada do controlado.
- **Cota SNCR** = quanto do intervalo ja foi usado / quanto resta.
- **Regra de ouro:** o sistema NUNCA bloqueia a emissao. Sem numeracao -> ALERTA e emite a receita SEM numero; fluxo segue.
- Ultimos 50 numeros: alerta na tela + emoldura a materia-prima + e-mail/WhatsApp/Trello ao prescritor.
- Intervalo esgotado: continua emitindo SEM numero + avisa CEO para cadastrar novo intervalo.

# Decisoes/correcoes que o CEO ja deixou marcadas no glossario (validar e aplicar quando ele liberar)
- Cores Anvisa OFICIAIS: verde e lilas NAO existem no padrao oficial. Existem: branco comum, magistral, azul B1/B2, amarela A1/A2/A3, branca controle especial.
- Mas o CEO criou uma TABELA DE CORES INTERNA da clinica (so organizacao visual, nao Anvisa): Lilas=hormonios; Verde=fitoterapicos; Laranja=mitocondrial/energeticos; Azul Turquesa=aminoacidos/destox; Amarelo Ouro=vitaminas/minerais; Salmao/Coral=estetica/colageno; Marrom/Terracota=gastrointestinal; Vermelho=injetaveis de alerta/anestesicos; Branco=bases galenicas/hidratacao.
- Nomenclatura de DESTINO: usar padrao aaaaa.bbbbb (5+5): farma.manip, farma.droga, farma.labor (farmacia de laboratorios de injetaveis, quando liberar compra direta de fornecedores).
- Posologia deve sempre incluir a via de administracao.

# Conceito 2 (doc "NOMES EMPRESAS HOLDING") — tangencial, nao e RAS/FAP
- Ecossistema corporativo Padua (marcas com prefixo PA): PADCON Platform (arquitetura), PAWARDS MedCore (inteligencia clinica = motor IHE), PACTOR Protocols (gestao terapeutica), PALINK, PAFIN, PAVISION, PAVOTE, PALEGIS, PAASSEMBLY; grupos PATRIUM (imobiliario) e PALEARN (educacao).
- Tem tambem brainstorm de nomes de marca para a clinica (Paxis, Paxum, Pazith, Paxor, Padur etc) — decisao de branding ainda aberta, sem martelo do CEO.
