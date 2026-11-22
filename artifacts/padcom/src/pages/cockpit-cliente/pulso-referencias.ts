// Referências científicas por assunto do Meu Pulso: uma internacional e uma nacional, conferidas nas páginas das revistas.
export type TipoReferencia = "pressao" | "glicemia" | "frequencia";

export type Referencia = {
  origem: "Internacional" | "Nacional";
  titulo: string;
  autores: string;
  revista: string;
  link: string;
  serve: string; // o que esta fonte sustenta nos níveis mostrados
};

export const REFERENCIAS: Record<TipoReferencia | "sono", Referencia[]> = {
  sono: [
    { origem: "Internacional", titulo: "Recommended Amount of Sleep for a Healthy Adult: A Joint Consensus Statement of the American Academy of Sleep Medicine and Sleep Research Society",
      autores: "Watson NF, Badr MS, Belenky G, et al.", revista: "Sleep. 2015;38(6):843-844",
      link: "https://academic.oup.com/sleep/article/38/6/843/2416939", serve: "Adultos devem dormir 7 horas ou mais por noite para manter a saúde." },
    { origem: "Nacional", titulo: "Validation of the Brazilian Portuguese version of the Pittsburgh Sleep Quality Index",
      autores: "Bertolazi AN, Fagondes SC, Hoff LS, et al.", revista: "Sleep Medicine. 2011;12(1):70-75",
      link: "https://pubmed.ncbi.nlm.nih.gov/21145786", serve: "Questionário de qualidade do sono validado para o português do Brasil." },
  ],
  pressao: [
    { origem: "Internacional", titulo: "2024 ESC Guidelines for the management of elevated blood pressure and hypertension",
      autores: "McEvoy JW, McCarthy CP, Bruno RM, et al.", revista: "European Heart Journal. 2024;45(38):3912-4018",
      link: "https://doi.org/10.1093/eurheartj/ehae178", serve: "Classificação da pressão e valores de referência para medida em casa." },
    { origem: "Nacional", titulo: "Diretrizes Brasileiras de Hipertensão Arterial – 2020",
      autores: "Barroso WKS, Rodrigues CIS, Bortolotto LA, et al.", revista: "Arquivos Brasileiros de Cardiologia. 2021;116(3):516-658",
      link: "https://abccardiol.org/article/diretrizes-brasileiras-de-hipertensao-arterial-2020/", serve: "Classificação e metas de pressão para a população brasileira." },
  ],
  glicemia: [
    { origem: "Internacional", titulo: "2. Diagnosis and Classification of Diabetes: Standards of Care in Diabetes—2026",
      autores: "American Diabetes Association Professional Practice Committee", revista: "Diabetes Care. 2026;49(Supplement_1):S27",
      link: "https://diabetesjournals.org/care/article/49/Supplement_1/S27/163926", serve: "Limites de glicemia de jejum: normal, pré-diabetes e diabetes." },
    { origem: "Nacional", titulo: "Diagnóstico de diabetes mellitus – Diretriz da Sociedade Brasileira de Diabetes",
      autores: "Rodacki M, Cobas RA, Zajdenverg L, et al.", revista: "Diretriz da Sociedade Brasileira de Diabetes, edição 2026",
      link: "https://diretriz.diabetes.org.br/diagnostico-de-diabetes-mellitus", serve: "Critérios de diagnóstico adotados no Brasil." },
  ],
  frequencia: [
    { origem: "Internacional", titulo: "2018 ACC/AHA/HRS Guideline on the Evaluation and Management of Patients With Bradycardia and Cardiac Conduction Delay",
      autores: "Kusumoto FM, Schoenfeld MH, Barrett C, et al.", revista: "Journal of the American College of Cardiology. 2019;74(7):932-987",
      link: "https://www.jacc.org/doi/10.1016/j.jacc.2018.10.044", serve: "Quando a frequência baixa precisa de investigação." },
    { origem: "Nacional", titulo: "Diretriz da Sociedade Brasileira de Cardiologia sobre a Análise e Emissão de Laudos Eletrocardiográficos – 2022",
      autores: "Samesima N, Brito HHA, Pastore CA, et al.", revista: "Arquivos Brasileiros de Cardiologia. 2022;119(4):638-680",
      link: "https://abccardiol.org/article/diretriz-da-sociedade-brasileira-de-cardiologia-sobre-a-analise-e-emissao-de-laudos-eletrocardiograficos-2022", serve: "Cortes usados aqui: abaixo de 50, de 50 a 99 e 100 ou mais." },
  ],
};
