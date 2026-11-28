/**
 * Conteúdo editorial dos exames gastroenterológicos (6 agrupamentos, 16 itens).
 * Fonte única: alimenta o cadastro no banco E o arquivo Word. Texto clínico curto, sem diagnóstico.
 * TUSS fica em branco até conferência com a tabela oficial e a operadora.
 */
export const AVISO_CID_SINTOMA =
  "CID R14 ou K30 descreve sintomas. Não confirma SIBO, gastroparesia ou intolerâncias; o diagnóstico depende do resultado do exame e da avaliação médica.";

export interface ItemGastro {
  codigo: string;
  nome: string;
  descricao: string;
  sinonimos: string[];
  modulo: string;
  cid: string;
  indicacao: string;
  justificativa: string;
  prioridade: "alta" | "media" | "condicional";
  condicoes: string;
  dependencias: string;
  preparo: string;
  /** Exames que já existem no catálogo e são apenas reaproveitados (codigo_exame). Vazio = criar. */
  reaproveita: string[];
  /** Código a criar em catalogo_exames quando não há equivalente. */
  codigoCatalogo?: string;
}
export interface GrupoGastro { codigo: string; ordem: number; nome: string; descricao: string; itens: ItemGastro[] }

const SEM_DEP = "Nenhuma.";

export const GRUPOS_GASTRO: GrupoGastro[] = [
  {
    codigo: "GAS-REFLUXO", ordem: 1, nome: "Refluxo e motilidade esofágica",
    descricao: "Investigação funcional do refluxo e da motilidade do esôfago.",
    itens: [
      {
        codigo: "GAS-REF-IMPPH", nome: "ImpedanciopHmetria esofágica de 24 horas",
        descricao: "Monitorização prolongada do refluxo ácido e não ácido com medida de impedância e pH esofágico.",
        sinonimos: ["pHmetria com impedância", "impedância-pHmetria", "pH-impedanciometria esofágica"],
        modulo: "Refluxo e motilidade esofágica", cid: "K21.0",
        indicacao: "Sintomas de refluxo com esofagite, sintomas extradigestivos ou resposta incompleta ao tratamento.",
        justificativa: "Paciente com doença do refluxo gastroesofágico com esofagite e sintomas persistentes, incluindo manifestações pós-prandiais. Solicito impedanciopHmetria esofágica de 24 horas para caracterizar a exposição ácida e a relação dos sintomas com os episódios de refluxo, orientando a conduta.",
        prioridade: "alta",
        condicoes: "Realizar em serviço com equipamento de impedância. Definir se será com ou sem inibidor de bomba de prótons conforme a pergunta clínica.",
        dependencias: "Endoscopia digestiva alta prévia recomendada. Manometria esofágica, quando solicitada, define o posicionamento do cateter.",
        preparo: "Jejum conforme o serviço. Suspensão ou manutenção do inibidor de bomba de prótons e de antiácidos por decisão do médico solicitante, informada ao paciente por escrito.",
        reaproveita: [], codigoCatalogo: "EXGASIMPEDANCIAPH24H",
      },
      {
        codigo: "GAS-REF-MANO", nome: "Manometria esofágica de alta resolução",
        descricao: "Avaliação da pressão e da coordenação motora do esôfago e dos esfíncteres.",
        sinonimos: ["manometria esofágica", "manometria de alta resolução", "MAR esofágica"],
        modulo: "Refluxo e motilidade esofágica", cid: "K21.0",
        indicacao: "Avaliação da motilidade antes de impedanciopHmetria ou de tratamento do refluxo; sintomas persistentes.",
        justificativa: "Paciente com doença do refluxo gastroesofágico com esofagite e sintomas persistentes. Solicito manometria esofágica de alta resolução para avaliar a motilidade e a barreira antirrefluxo, auxiliando na interpretação do refluxo e no planejamento terapêutico.",
        prioridade: "alta",
        condicoes: "Realizar em serviço com equipamento de alta resolução.",
        dependencias: "Endoscopia digestiva alta prévia recomendada. Costuma anteceder a impedanciopHmetria.",
        preparo: "Jejum de 6 a 8 horas. Medicamentos que alteram a motilidade (procinéticos, bloqueadores de canal de cálcio, nitratos, anticolinérgicos) podem precisar de suspensão, por decisão do médico.",
        reaproveita: [], codigoCatalogo: "EXGASMANOMETRIAESOFAGICAAR",
      },
    ],
  },
  {
    codigo: "GAS-MOTILIDADE", ordem: 2, nome: "Motilidade e distensão",
    descricao: "Esvaziamento gástrico e avaliação por imagem na distensão abdominal.",
    itens: [
      {
        codigo: "GAS-MOT-ESVAZ", nome: "Cintilografia de esvaziamento gástrico de sólidos (4 horas)",
        descricao: "Medida do tempo de esvaziamento do estômago após refeição sólida marcada, com imagens até 4 horas.",
        sinonimos: ["esvaziamento gástrico", "cintilografia gástrica", "cintilografia de esvaziamento do estômago"],
        modulo: "Motilidade e distensão", cid: "K30",
        indicacao: "Plenitude pós-prandial, distensão e saciedade precoce persistentes, sem causa estrutural identificada.",
        justificativa: "Paciente com distensão e plenitude pós-prandial crônicas. Solicito cintilografia de esvaziamento gástrico de sólidos por 4 horas para avaliar o tempo de esvaziamento do estômago, após exclusão de causa estrutural.",
        prioridade: "alta",
        condicoes: "Protocolo de refeição sólida padronizada com leituras até 4 horas.",
        dependencias: "Endoscopia digestiva alta prévia para excluir obstrução ou lesão. Glicemia controlada em pacientes com diabetes.",
        preparo: "Jejum de 8 horas. Suspender, por orientação médica, procinéticos, opioides, anticolinérgicos e outros medicamentos que alterem o esvaziamento (em geral 48 a 72 horas antes).",
        reaproveita: [], codigoCatalogo: "EXGASCINTILOESVAZGASTRICO4H",
      },
      {
        codigo: "GAS-MOT-USGABD", nome: "Ultrassom de abdome total",
        descricao: "Avaliação por imagem dos órgãos abdominais.",
        sinonimos: ["USG abdome total", "ultrassonografia de abdome total", "eco de abdome"],
        modulo: "Motilidade e distensão", cid: "R14",
        indicacao: "Distensão abdominal persistente, para afastar alterações estruturais.",
        justificativa: "Paciente com distensão abdominal crônica pós-prandial. Solicito ultrassom de abdome total para afastar alterações estruturais de fígado, vias biliares, pâncreas e demais órgãos abdominais.",
        prioridade: "media",
        condicoes: "Rotina de ultrassonografia abdominal.",
        dependencias: SEM_DEP,
        preparo: "Jejum de 6 a 8 horas, conforme o serviço. Orientações de gases e bexiga conforme a clínica de imagem.",
        reaproveita: ["EXULTRASSOMDEABDOMETOT"],
      },
    ],
  },
  {
    codigo: "GAS-FERMENTACAO", ordem: 3, nome: "Fermentação e intolerâncias",
    descricao: "Testes respiratórios para fermentação intestinal e intolerâncias a açúcares.",
    itens: [
      {
        codigo: "GAS-FER-SIBO", nome: "Teste respiratório com glicose (hidrogênio e metano) para SIBO/IMO",
        descricao: "Medida de hidrogênio e metano no ar expirado após glicose, para investigar supercrescimento bacteriano do intestino delgado (SIBO) e sobrecrescimento de metanogênicos (IMO).",
        sinonimos: ["breath test glicose", "teste do hálito com glicose", "teste respiratório SIBO", "hidrogênio e metano expirado"],
        modulo: "Fermentação e intolerâncias", cid: "R14",
        indicacao: "Distensão, gases e desconforto abdominal persistentes em que se investiga fermentação no intestino delgado.",
        justificativa: "Paciente com distensão abdominal crônica pós-prandial. Solicito teste respiratório com glicose, medindo hidrogênio e metano, para investigar fermentação no intestino delgado (SIBO/IMO). O CID descreve o sintoma; o diagnóstico depende do resultado e da avaliação médica.",
        prioridade: "alta",
        condicoes: "Dosar hidrogênio e metano, com coletas seriadas conforme o protocolo do laboratório.",
        dependencias: SEM_DEP,
        preparo: "Jejum de 8 a 12 horas. Sem antibióticos nas 4 semanas anteriores; evitar laxantes e probióticos por alguns dias, conforme o laboratório. Dieta pobre em fibras e fermentáveis na véspera. Não fumar nem fazer exercício no dia.",
        reaproveita: [], codigoCatalogo: "EXGASTESTERESPGLICOSEH2CH4",
      },
      {
        codigo: "GAS-FER-LACT", nome: "Teste respiratório de lactose",
        descricao: "Medida de hidrogênio (e metano, quando disponível) no ar expirado após lactose, para investigar má absorção de lactose.",
        sinonimos: ["breath test lactose", "teste do hálito com lactose", "teste de intolerância à lactose"],
        modulo: "Fermentação e intolerâncias", cid: "R14",
        indicacao: "Sintomas após laticínios: distensão, gases, desconforto ou diarreia.",
        justificativa: "Paciente com distensão abdominal e sintomas pós-prandiais. Solicito teste respiratório de lactose para investigar má absorção de lactose como possível contribuinte. O CID descreve o sintoma e não confirma intolerância.",
        prioridade: "media",
        condicoes: "Protocolo de dose de lactose e coletas seriadas conforme o laboratório.",
        dependencias: "Idealmente após a avaliação de SIBO, pois fermentação no delgado pode alterar a interpretação.",
        preparo: "Jejum de 8 a 12 horas. Sem antibióticos nas 4 semanas anteriores. Dieta restrita na véspera, conforme o laboratório.",
        reaproveita: [], codigoCatalogo: "EXGASTESTERESPLACTOSE",
      },
      {
        codigo: "GAS-FER-FRUT", nome: "Teste respiratório de frutose",
        descricao: "Medida de hidrogênio (e metano, quando disponível) no ar expirado após frutose, para investigar má absorção de frutose.",
        sinonimos: ["breath test frutose", "teste do hálito com frutose", "intolerância à frutose (teste respiratório)"],
        modulo: "Fermentação e intolerâncias", cid: "R14",
        indicacao: "Sintomas após frutas, adoçantes ou alimentos ricos em frutose.",
        justificativa: "Paciente com distensão abdominal e sintomas pós-prandiais. Solicito teste respiratório de frutose para investigar má absorção de frutose como possível contribuinte. O CID descreve o sintoma e não confirma intolerância.",
        prioridade: "condicional",
        condicoes: "Solicitar quando a história sugerir relação com frutose ou após resultado dos testes anteriores.",
        dependencias: "Após avaliação de SIBO; idealmente após o teste de lactose.",
        preparo: "Jejum de 8 a 12 horas. Sem antibióticos nas 4 semanas anteriores. Dieta restrita na véspera, conforme o laboratório.",
        reaproveita: [], codigoCatalogo: "EXGASTESTERESPFRUTOSE",
      },
    ],
  },
  {
    codigo: "GAS-CELIACA", ordem: 4, nome: "Doença celíaca",
    descricao: "Triagem sorológica para doença celíaca, feita com a dieta contendo glúten.",
    itens: [
      {
        codigo: "GAS-CEL-ATTG", nome: "Antitransglutaminase IgA",
        descricao: "Anticorpo IgA contra transglutaminase tecidual, teste de triagem principal para doença celíaca.",
        sinonimos: ["anti-tTG IgA", "anticorpo antitransglutaminase tecidual IgA", "anti-transglutaminase"],
        modulo: "Doença celíaca", cid: "R14",
        indicacao: "Triagem de doença celíaca em paciente com sintomas digestivos persistentes.",
        justificativa: "Paciente com distensão abdominal crônica. Solicito antitransglutaminase IgA como triagem de doença celíaca, a ser interpretada junto com a IgA total. O CID descreve o sintoma e não confirma o diagnóstico.",
        prioridade: "alta",
        condicoes: "Coleta de sangue, com dieta contendo glúten.",
        dependencias: "Solicitar junto com a IgA total, para evitar resultado falso-negativo por deficiência de IgA.",
        preparo: "Manter dieta com glúten nas semanas anteriores. Não é necessário jejum, salvo orientação do laboratório.",
        reaproveita: [], codigoCatalogo: "EXGASANTITRANSGLUTAMINASEIGA",
      },
      {
        codigo: "GAS-CEL-IGA", nome: "IgA total",
        descricao: "Dosagem de imunoglobulina A sérica total.",
        sinonimos: ["imunoglobulina A", "IgA sérica", "dosagem de IgA"],
        modulo: "Doença celíaca", cid: "R14",
        indicacao: "Complementa a triagem de doença celíaca: IgA baixa pode tornar o anticorpo IgA falso-negativo.",
        justificativa: "Solicito IgA total para interpretar corretamente a antitransglutaminase IgA na triagem de doença celíaca, já que a deficiência de IgA pode causar resultado falso-negativo.",
        prioridade: "alta",
        condicoes: "Coleta de sangue.",
        dependencias: "Solicitar junto com a antitransglutaminase IgA.",
        preparo: "Sem preparo específico, salvo orientação do laboratório.",
        reaproveita: [], codigoCatalogo: "EXGASIGATOTAL",
      },
      {
        codigo: "GAS-CEL-EMA", nome: "Antiendomísio IgA",
        descricao: "Anticorpo IgA antiendomísio, teste de alta especificidade para doença celíaca.",
        sinonimos: ["anti-endomísio IgA", "EMA IgA", "anticorpo antiendomisio"],
        modulo: "Doença celíaca", cid: "R14",
        indicacao: "Confirmação sorológica quando a antitransglutaminase vier positiva ou duvidosa.",
        justificativa: "Solicito antiendomísio IgA como teste complementar de alta especificidade na investigação de doença celíaca. O CID descreve o sintoma e não confirma o diagnóstico.",
        prioridade: "condicional",
        condicoes: "Em geral solicitado quando a antitransglutaminase IgA é positiva ou duvidosa.",
        dependencias: "Resultado da antitransglutaminase IgA e da IgA total.",
        preparo: "Manter dieta com glúten. Sem jejum, salvo orientação do laboratório.",
        reaproveita: [], codigoCatalogo: "EXGASANTIENDOMISIOIGA",
      },
    ],
  },
  {
    codigo: "GAS-COMPLEMENTAR", ordem: 5, nome: "Avaliação complementar",
    descricao: "Exames de base para afastar outras causas de sintomas digestivos.",
    itens: [
      {
        codigo: "GAS-COM-HEMO", nome: "Hemograma",
        descricao: "Contagem das células do sangue.",
        sinonimos: ["hemograma completo", "HMG"],
        modulo: "Avaliação complementar", cid: "R14",
        indicacao: "Avaliação de anemia e inflamação em sintomas digestivos persistentes.",
        justificativa: "Solicito hemograma para avaliação complementar de paciente com distensão abdominal crônica, buscando sinais de anemia ou inflamação.",
        prioridade: "media", condicoes: "Coleta de sangue.", dependencias: SEM_DEP,
        preparo: "Sem preparo específico, salvo orientação do laboratório.",
        reaproveita: ["EXHEMOGRAMA"],
      },
      {
        codigo: "GAS-COM-HEPATICO", nome: "Perfil hepático (AST, ALT, FA, GGT, bilirrubinas e albumina)",
        descricao: "Conjunto de provas de lesão e função do fígado e das vias biliares.",
        sinonimos: ["provas hepáticas", "função hepática", "TGO TGP FA GGT bilirrubinas albumina"],
        modulo: "Avaliação complementar", cid: "R14",
        indicacao: "Avaliação hepatobiliar em sintomas digestivos persistentes.",
        justificativa: "Solicito perfil hepático (AST, ALT, fosfatase alcalina, GGT, bilirrubinas e albumina) para avaliação complementar de paciente com distensão abdominal crônica.",
        prioridade: "media", condicoes: "Coleta de sangue.", dependencias: SEM_DEP,
        preparo: "Jejum de 8 horas, ou conforme o laboratório.",
        reaproveita: [], codigoCatalogo: "EXGASPERFILHEPATICO",
      },
      {
        codigo: "GAS-COM-TSH", nome: "TSH",
        descricao: "Hormônio estimulante da tireoide.",
        sinonimos: ["hormônio tireoestimulante", "tireotrofina"],
        modulo: "Avaliação complementar", cid: "K30",
        indicacao: "Afastar disfunção tireoidiana como contribuinte de alteração do esvaziamento e do trânsito.",
        justificativa: "Solicito TSH para afastar disfunção tireoidiana como contribuinte em paciente com plenitude e distensão pós-prandial crônicas.",
        prioridade: "media", condicoes: "Coleta de sangue.", dependencias: SEM_DEP,
        preparo: "Sem preparo específico, salvo orientação do laboratório.",
        reaproveita: ["EXTSH"],
      },
      {
        codigo: "GAS-COM-GLICHBA1C", nome: "Glicemia de jejum e hemoglobina glicada (HbA1c)",
        descricao: "Glicose em jejum e controle glicêmico médio dos últimos 90 dias.",
        sinonimos: ["glicose de jejum", "glicohemoglobina", "A1c", "hemoglobina glicosilada"],
        modulo: "Avaliação complementar", cid: "K30",
        indicacao: "Afastar disglicemia, que pode alterar o esvaziamento gástrico.",
        justificativa: "Solicito glicemia de jejum e hemoglobina glicada para afastar disglicemia como contribuinte em paciente com plenitude pós-prandial crônica, antes de interpretar o esvaziamento gástrico.",
        prioridade: "media", condicoes: "Coleta de sangue.", dependencias: "Resultado útil antes da cintilografia de esvaziamento gástrico.",
        preparo: "Jejum de 8 a 12 horas para a glicemia.",
        reaproveita: ["EXGLICEMIADEJEJUM", "EXHEMOGLOBINAGLICADA"],
      },
    ],
  },
  {
    codigo: "GAS-CONDICIONAIS", ordem: 6, nome: "Condicionais",
    descricao: "Solicitar apenas quando o quadro clínico ou os resultados anteriores justificarem.",
    itens: [
      {
        codigo: "GAS-CON-CALPRO", nome: "Calprotectina fecal",
        descricao: "Marcador de inflamação intestinal dosado nas fezes.",
        sinonimos: ["calprotectina nas fezes", "calprotectina fecal quantitativa"],
        modulo: "Condicionais", cid: "R14",
        indicacao: "Diferenciar causa inflamatória de funcional quando há diarreia, perda de peso, sangue nas fezes ou alarme clínico.",
        justificativa: "Solicito calprotectina fecal para auxiliar a distinguir inflamação intestinal de causa funcional em paciente com sintomas digestivos persistentes. O CID descreve o sintoma.",
        prioridade: "condicional",
        condicoes: "Solicitar quando houver sinais de alarme ou suspeita de doença inflamatória intestinal.",
        dependencias: SEM_DEP,
        preparo: "Coleta de fezes conforme o laboratório. Evitar anti-inflamatórios não esteroides por orientação médica, quando possível.",
        reaproveita: [], codigoCatalogo: "EXGASCALPROTECTINAFECAL",
      },
      {
        codigo: "GAS-CON-GIARDIA", nome: "Pesquisa de Giardia nas fezes",
        descricao: "Detecção de Giardia lamblia nas fezes, por antígeno ou parasitológico.",
        sinonimos: ["Giardia lamblia", "antígeno de Giardia nas fezes", "giardíase fezes"],
        modulo: "Condicionais", cid: "R14",
        indicacao: "Distensão, gases e diarreia, sobretudo com exposição de risco ou resposta pobre ao tratamento.",
        justificativa: "Solicito pesquisa de Giardia nas fezes para afastar infecção parasitária como causa de distensão abdominal e sintomas digestivos persistentes. O CID descreve o sintoma.",
        prioridade: "condicional",
        condicoes: "Solicitar quando houver diarreia, exposição de risco ou suspeita clínica.",
        dependencias: "Pode ser feito em conjunto com o parasitológico de fezes, já cadastrado.",
        preparo: "Coleta de fezes conforme o laboratório, em amostras de dias alternados quando indicado.",
        reaproveita: [], codigoCatalogo: "EXGASPESQUISAGIARDIAFEZES",
      },
    ],
  },
];

export const MODELO_CONTEXTUAL = {
  codigo: "GAS-CTX-ESOFAGITE-B",
  titulo: "Resumo contextual: esofagite grau B, distensão pós-prandial e tosse pós-prandial",
  aviso: "Texto editável de apoio ao pedido. Descreve achados e a pergunta clínica; não é diagnóstico automático nem substitui a avaliação médica.",
  texto:
    "Paciente com esofagite de refluxo grau B (classificação de Los Angeles), distensão abdominal pós-prandial crônica e tosse pós-prandial. " +
    "Os exames solicitados buscam esclarecer a relação entre refluxo, motilidade esofágica e gástrica e possíveis fatores de fermentação intestinal, " +
    "e afastar outras causas por avaliação complementar. Os CID R14 e K30 descrevem sintomas e não confirmam SIBO, gastroparesia ou intolerâncias. " +
    "A interpretação final depende dos resultados e da avaliação médica.",
};
