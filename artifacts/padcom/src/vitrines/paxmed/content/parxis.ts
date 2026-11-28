/**
 * Toda a copy do site PAXMED, em PT e EN.
 * A versão PT é a versão canônica (assinada pelo Dr. Padcon).
 * A versão EN é uma tradução fiel, preservando a atmosfera de maison clínica.
 */

type B = { en: string; pt: string };

export const content = {
  nav: {
    brand: { en: "PAXMED", pt: "PAXMED" },
    tagline: { en: "A PADCOM company", pt: "Uma empresa PADCOM" },
    links: {
      manifesto: { en: "Manifesto", pt: "Manifesto" },
      features: { en: "Features", pt: "Recursos" },
      technology: { en: "Intelligence", pt: "Inteligência" },
      circle: { en: "The Circle", pt: "O Círculo" },
      ecosystem: { en: "Ecosystem", pt: "Ecossistema" },
    } as Record<string, B>,
    cta: { en: "Plans / Request a demo", pt: "Conhecer Planos / Solicitar Demonstração" },
    doctor: { en: "Physician / Clinic Area", pt: "Área do Médico / Clínica" },
    patient: { en: "Patient Portal", pt: "Portal do Paciente" },
    a11y: {
      motionOn: { en: "Animations on — click to reduce", pt: "Animações ativas — clique para reduzir" },
      motionOff: { en: "Reduced motion — click to activate", pt: "Animações reduzidas — clique para ativar" },
      contrastOn: { en: "High contrast active — click for normal", pt: "Contraste alto ativo — clique para normal" },
      contrastOff: { en: "Normal contrast — click to increase", pt: "Contraste normal — clique para aumentar" },
    },
  },

  hero: {
    eyebrow: {
      en: "PAXMED · A PADCOM company",
      pt: "PAXMED · Uma empresa PADCOM",
    },
    titlePre: { en: "The clinical system that works", pt: "O sistema clínico que trabalha" },
    titleGold: { en: "while you care", pt: "enquanto você cuida" },
    titlePost: { en: ".", pt: "." },
    lead: {
      en: "From the first consultation to the definitive archive — no paper, no rework, no legal risk. A high-precision clinical engine, built with exclusivity for physicians and clinics who demand excellence.",
      pt: "Da primeira consulta ao arquivo definitivo — sem papel, sem retrabalho, sem risco jurídico. Um motor clínico de alta precisão, concebido com exclusividade para médicos e clínicas que exigem excelência.",
    },
    ctaPrimary: { en: "Plans / Request a demo", pt: "Conhecer Planos / Solicitar Demonstração" },
    ctaSecondary: { en: "About licensing", pt: "Sobre o licenciamento" },
    stats: [
      { k: { en: "100%", pt: "100%" }, v: { en: "digital & signed", pt: "digital e assinado" } },
      { k: { en: "12", pt: "12" }, v: { en: "licensees per cohort", pt: "licenciados por safra" } },
      { k: { en: "1", pt: "1" }, v: { en: "physician decides", pt: "só médico decide" } },
    ] as { k: B; v: B }[],
  },

  manifesto: {
    eyebrow: { en: "Manifesto · From PADCOM", pt: "Manifesto · Da PADCOM" },
    titlePre: { en: "Built by a physician who ", pt: "Construído por um médico que " },
    titleGold: { en: "grew tired of waiting", pt: "cansou de esperar" },
    titlePost: { en: " for someone else to build it.", pt: " que alguém construísse." },
    body: {
      en: "PAXMED was born inside PADCOM — the clinical engineering arm of the holding, founded by an endocrinologist who decided to design the systems the market never delivered. It is not software adapted to medicine. It is medicine that became a system. And for that reason it cannot be replicated: it demands years of real clinical practice combined with engineering that few in the world can execute.",
      pt: "O PAXMED nasce dentro da PADCOM — a engenharia clínica da holding, fundada por um médico endocrinologista que decidiu projetar os sistemas que o mercado nunca ofereceu. Não é um software adaptado à medicina. É medicina que se tornou sistema. E por isso não se replica: exige anos de prática clínica real somados a uma engenharia que poucos, no mundo, conseguem executar.",
    },
  },

  features: {
    eyebrow: { en: "Features · Chapitre I", pt: "Recursos · Chapitre I" },
    titlePre: { en: "A system to operate. An engine to think. A platform to ", pt: "Um sistema para operar. Um motor para pensar. Uma plataforma para " },
    titleGold: { en: "grow", pt: "crescer" },
    titlePost: { en: ".", pt: "." },
    items: [
      {
        n: "01",
        title: { en: "Unified physician cockpit", pt: "Cockpit unificado do médico" },
        body: {
          en: "A single screen per patient: injectable prescription, compounded formulas, lab orders, laboratory evolution and document issuance. You decide without leaving, without opening another system, without breaking your line of reasoning.",
          pt: "Uma única tela por cliente: prescrição de injetáveis, fórmulas manipuladas, pedidos de exames, evolução laboratorial e emissão de documentos. Você decide sem sair, sem abrir outro sistema, sem quebrar a linha do raciocínio.",
        },
      },
      {
        n: "02",
        title: { en: "Guided protocol launcher", pt: "Lançador guiado de protocolos" },
        body: {
          en: "You define substances, frequencies and dates. In a single command the protocol is created, sessions are validated and the nursing audit form is generated — ready for a sanitary inspection at any moment.",
          pt: "Você define substâncias, frequências e datas. Em um único comando, o protocolo é criado, as sessões validadas e o formulário de auditoria da enfermagem é gerado — pronto para uma fiscalização sanitária a qualquer momento.",
        },
      },
      {
        n: "03",
        title: { en: "Documents with national legal validity", pt: "Documento com validade jurídica nacional" },
        body: {
          en: "Every application generates an official clinical document digitally signed under the Brazilian legal standard — equivalent to a notarised signature, without paper. Archived, delivered by email and available in the patient's app.",
          pt: "Cada aplicação gera um documento clínico oficial assinado digitalmente no padrão jurídico brasileiro — equivalente ao reconhecimento de firma em cartório, sem papel. Arquivado, entregue por e-mail e disponível no app do cliente.",
        },
      },
      {
        n: "04",
        title: { en: "Lab report reading by clinical intelligence", pt: "Leitura de laudos por inteligência clínica" },
        body: {
          en: "Upload the PDF. The engine extracts each analyte automatically and compares it against integrative-medicine reference ranges — not the population standard. You show your patient where they stand on the real spectrum of health.",
          pt: "Envie o PDF do laudo. O motor extrai cada analito automaticamente e o compara com faixas próprias da medicina integrativa — não com o padrão populacional. Você mostra ao cliente onde ele está no espectro real de saúde.",
        },
      },
      {
        n: "05",
        title: { en: "Chronobiological messaging", pt: "Mensageria cronobiológica" },
        body: {
          en: "The system knows the biologically correct moment of each medication and sends the reminder at the right time. Patient adherence rises, secretarial rework falls, clinical outcomes appear.",
          pt: "O sistema conhece o momento biologicamente correto de cada medicamento e envia o lembrete na hora certa. Adesão do cliente sobe, retrabalho da secretária cai, resultado clínico aparece.",
        },
      },
      {
        n: "06",
        title: { en: "Quote console with three scenarios", pt: "Console de orçamento com três cenários" },
        body: {
          en: "Cash, deposit-and-instalments, and full instalments — fees already calculated, volume-discount ladder. The secretary presents. The patient chooses. You close without middleman spreadsheets.",
          pt: "À vista, entrada com parcelas e parcelado — taxas já calculadas, escada de desconto por volume. A secretária apresenta. O cliente escolhe. Você fecha sem intermediar planilhas.",
        },
      },
    ] as { n: string; title: B; body: B }[],
  },

  technology: {
    eyebrow: { en: "Intelligence · Chapitre II", pt: "Inteligência · Chapitre II" },
    titlePre: { en: "The ", pt: "O motor " },
    titleGold: { en: "PAXMED", pt: "PAXMED" },
    titlePost: { en: " engine — working while you consult.", pt: " — que trabalha enquanto você atende." },
    items: [
      {
        term: { en: "Systems-based clinical questionnaire", pt: "Questionário clínico por sistemas" },
        desc: { en: "progressive anamnesis — only what is relevant to that patient. Critical alerts are never suppressed.", pt: "anamnese progressiva — só o que é relevante para aquele cliente. Alertas críticos nunca são suprimidos." },
      },
      {
        term: { en: "Clinical rules engine", pt: "Motor de regras clínicas" },
        desc: { en: "a reasoning library built over decades of practice. The engine remembers for you. The final decision is always yours.", pt: "biblioteca de raciocínio construída sobre décadas de prática. O motor lembra por você. A decisão final é sempre sua." },
      },
      {
        term: { en: "Clinical pathways by complaint", pt: "Caminhos clínicos por queixa" },
        desc: { en: "state the complaint in focus. The system suggests which exams to order and which treatments to consider — before you say a word.", pt: "você informa a queixa em foco. O sistema sugere quais exames pedir e quais tratamentos considerar — antes de você abrir a boca." },
      },
      {
        term: { en: "Integrative reference ranges", pt: "Faixas de referência integrativas" },
        desc: { en: "excellent, optimal, acceptable — through the lens of integrative medicine, not the conventional laboratory standard.", pt: "excelente, ótimo, aceitável — pela ótica da medicina integrativa, não pelo padrão laboratorial convencional." },
      },
      {
        term: { en: "Chronobiological posology", pt: "Posologia cronobiológica" },
        desc: { en: "the engine knows the right moment for each medication in the day — the usage scheme and reminders come ready.", pt: "o motor conhece o momento certo de cada medicamento no dia — o esquema de uso e os lembretes saem prontos." },
      },
      {
        term: { en: "Longitudinal clinical evolution", pt: "Evolução clínica longitudinal" },
        desc: { en: "with every visit the history grows. Over time, your clinic's database becomes a real strategic asset.", pt: "a cada consulta, o histórico cresce. Com o tempo, o banco de dados da sua clínica se torna um ativo estratégico real." },
      },
      {
        term: { en: "Full isolation between clinics", pt: "Isolamento total entre clínicas" },
        desc: { en: "each licensee operates in its own vault. No competitor sees, crosses or touches your data.", pt: "cada licenciado opera em cofre próprio. Nenhum concorrente enxerga, cruza ou toca seus dados." },
      },
      {
        term: { en: "Signature with national legal validity", pt: "Assinatura com validade jurídica nacional" },
        desc: { en: "clinical documents at the Brazilian recognition standard — equivalent to a notarised signature, without paper.", pt: "documentos clínicos com o padrão brasileiro de reconhecimento — equivalente a firma em cartório, sem papel." },
      },
    ] as { term: B; desc: B }[],
  },

  circle: {
    eyebrow: { en: "The Circle · Chapitre III", pt: "O Círculo · Chapitre III" },
    titlePre: { en: "Three steps, ", pt: "Três degraus, uma " },
    titleGold: { en: "one maison", pt: "só maison" },
    titlePost: { en: " — and a limited number of seats.", pt: " — e um número limitado de assentos." },
    lead: {
      en: "PAXMED is not sold in bulk. It is granted, under license, to a small cohort of physicians at a time. You do not choose to enter — you are invited. And once admitted, you acquire the rare right to decide who else will have access.",
      pt: "O PAXMED não é vendido em massa. É concedido, por licença, a uma pequena safra de médicos por vez. Você não escolhe entrar — é convidado. E, uma vez admitido, adquire o direito raro de decidir quem mais terá acesso.",
    },
    steps: [
      {
        title: { en: "I · The Referred", pt: "I · O Indicado" },
        lead: { en: "The door opens through someone already inside the Circle.", pt: "A porta se abre por quem já pertence ao Círculo." },
        body: {
          en: "PAXMED is not sold. It is granted. Receiving a letter of referral means that a licensed physician recognised in your clinic the same standard the maison demands: discretion, clinical excellence and the will to operate as a house, not as a consulting room. From there, your candidacy enters PAXMED's private review. No queue. No sales team. Only a careful decision.",
          pt: "O PAXMED não é vendido. É concedido. Receber uma carta de indicação significa que um médico licenciado reconheceu em sua clínica o mesmo padrão que a maison exige: discrição, excelência clínica e vontade de operar como uma casa, não como um consultório. A partir daí, sua candidatura entra para análise privada da PAXMED. Sem fila. Sem comercial. Apenas uma decisão cuidadosa.",
        },
      },
      {
        title: { en: "II · The Licensee", pt: "II · O Licenciado" },
        lead: { en: "Admitted, you receive a protected territory.", pt: "Admitido, você recebe um território protegido." },
        body: {
          en: "Each licensee occupies an exclusive micro-region: your patients, your protocols, your brand on every digitally-signed document. Access is lifetime, following every evolution of the PAXMED engine, with no upgrade fees. The system learns from your practice, but your data remains inaccessible to any other clinic — including those inside the Circle itself.",
          pt: "Cada licenciado ocupa uma micro-região exclusiva: seus clientes, seus protocolos, sua marca em cada documento assinado digitalmente. O acesso é vitalício às evoluções do motor PAXMED, sem taxas de upgrade. O sistema aprende com sua prática, mas seus dados permanecem inacessíveis a qualquer outra clínica — inclusive às do próprio Círculo.",
        },
      },
      {
        title: { en: "III · The Sub-licensor", pt: "III · O Sublicenciante" },
        lead: { en: "Admission unlocks a rare privilege: the right to refer.", pt: "A admissão abre um privilégio raro: o poder de indicar." },
        body: {
          en: "A PAXMED licensee may sub-license other clinics, provided each is approved by PAXMED. Every new referral you sponsor expands the network and generates a recurring participation over that clinic's license. Your clinical reputation ceases to be reputation alone: it becomes patrimony, income and legacy within the maison.",
          pt: "Um licenciado PAXMED pode sublicenciar outras clínicas, desde que aprovadas pela PAXMED. Cada nova indicação que você patrocina amplia a rede e gera uma participação recorrente sobre a licença daquela clínica. Sua reputação clínica deixa de ser apenas reputação: torna-se patrimônio, rendimento e legado dentro da maison.",
        },
      },
    ] as { title: B; lead: B; body: B }[],
    smallByChoice: {
      title: { en: "The Circle is small by choice — not by limitation.", pt: "O Círculo é pequeno por escolha — não por limitação." },
      body: {
        en: "We cap each cohort at twelve licensees so that every admission receives the engineering, support and curation attention the standard demands. Scarcity is not marketing. It is the only way to preserve what makes PAXMED valuable: being rare.",
        pt: "Limitamos cada safra a doze licenciados para que cada admissão receba a atenção da engenharia, do suporte e da curadoria que o padrão exige. A escassez não é marketing. É a única forma de manter o que torna o PAXMED valioso: ser raro.",
      },
      count: { en: "12", pt: "12" },
      unit: { en: "licensees per cohort", pt: "licenciados por safra" },
    },
  },

  testimonial: {
    quote: {
      en: "I was referred. I received access on a Wednesday. On Friday, I delivered the first legally-valid signed document to my patient. He looked at me differently. PAXMED is not software — it is what separates a clinic from a clinic-maison.",
      pt: "Fui indicado. Recebi o acesso em uma quarta-feira. Na sexta, entreguei o primeiro documento assinado com validade jurídica ao meu cliente. Ele me olhou de forma diferente. O PAXMED não é software — é o que separa uma clínica de uma maison clínica.",
    },
    name: { en: "Dr. Ricardo Almeida Ferreira", pt: "Dr. Ricardo Almeida Ferreira" },
    role: { en: "PAXMED Licensee · Integrative Medicine · Anti-Aging", pt: "Licenciado PAXMED · Medicina Integrativa · Anti-Aging" },
  },

  videos: {
    eyebrow: { en: "Voices of the Circle · Physicians and Clinics", pt: "Vozes do Círculo · Médicos e Clínicas" },
    titlePre: { en: "Hear from those who already ", pt: "Ouça de quem já " },
    titleGold: { en: "operate as a maison", pt: "opera como maison" },
    titlePost: { en: ".", pt: "." },
    items: [
      {
        id: "01",
        title: { en: "Testimony 01", pt: "Depoimento 01" },
        role: { en: "Physician", pt: "Médico(a)" },
        quote: {
          en: "From the first protocol to automated billing — in one week my clinic began operating like a maison.",
          pt: "Do primeiro protocolo à cobrança automática — em uma semana minha clínica passou a operar como uma maison.",
        },
      },
      {
        id: "02",
        title: { en: "Testimony 02", pt: "Depoimento 02" },
        role: { en: "Clinic Management", pt: "Gestão de Clínica" },
        quote: {
          en: "I never imagined a system the team would adopt with pleasure. Today no one opens another screen.",
          pt: "Nunca imaginei um sistema que a equipe adotasse por prazer. Hoje ninguém abre outra tela.",
        },
      },
      {
        id: "03",
        title: { en: "Testimony 03", pt: "Depoimento 03" },
        role: { en: "Healthcare Operations", pt: "Operação em Saúde" },
        quote: {
          en: "With every visit, the house's clinical database grows stronger. PAXMED turned data into patrimony.",
          pt: "A cada consulta, o banco clínico da casa fica mais forte. O PAXMED transformou dados em patrimônio.",
        },
      },
    ] as { id: string; title: B; role: B; quote: B }[],
    dotAria: { en: "Go to testimony", pt: "Ir para depoimento" },
    playAria: { en: "Play", pt: "Reproduzir" },
  },

  ecosystem: {
    eyebrow: { en: "Ecosystem · PADCOM", pt: "Ecossistema · PADCOM" },
    titlePre: { en: "These products are part of a ", pt: "Estes produtos fazem parte de um " },
    titleGold: { en: "larger ecosystem", pt: "ecossistema maior" },
    titlePost: { en: ".", pt: "." },
    body: {
      en: "PADCON Platform® is the corporate architecture that sustains PAXMED and PAXMED — unified identity, role-based security, permanent audit trails. Four sectors. Eighteen systems in development. Three in real production. One foundation.",
      pt: "A PADCON Platform® é a arquitetura corporativa que sustenta a PAXMED e o PAXMED — identidade unificada, segurança por cargo, trilhas de auditoria permanentes. Quatro setores. Dezoito sistemas em desenvolvimento. Três em produção real. Uma fundação só.",
    },
    cta: { en: "Meet PADCON Platform®", pt: "Conheça a PADCON Platform®" },
  },

  scarcity: {
    eyebrow: { en: "Current cohort · Doors closing soon", pt: "Safra atual · Portas fechadas em breve" },
    seats: { en: "12", pt: "12" },
    seatsLabel: { en: "licensees per cohort", pt: "licenciados por safra" },
    closingLabel: { en: "Candidacy closing", pt: "Fechamento da candidatura" },
    calculating: { en: "Calculating deadline…", pt: "Calculando prazo…" },
    slotLabels: {
      days: { en: "days", pt: "dias" },
      hours: { en: "hours", pt: "horas" },
      minutes: { en: "min", pt: "min" },
      seconds: { en: "sec", pt: "seg" },
    },
    body: {
      en: "Candidacies received after closing are considered only for the next cohort. Scarcity is not a sales strategy — it is the only way to preserve the experience and integrity of the Circle.",
      pt: "As candidaturas recebidas após o fechamento são avaliadas apenas para a próxima safra. A escassez não é estratégia de vendas — é a única maneira de preservar a experiência e a integridade do Círculo.",
    },
    cta: { en: "Request a demo", pt: "Solicitar demonstração" },
  },

  cta: {
    eyebrow: { en: "Demonstration Request", pt: "Solicitação de Demonstração" },
    titlePre: { en: "A conversation ", pt: "Uma conversa " },
    titleGold: { en: "behind closed doors", pt: "à porta fechada" },
    titlePost: { en: ".", pt: "." },
    lead: {
      en: "We admit up to twelve licensees per cohort. If you were referred — or believe your clinic's standard justifies a referral — send your request. PAXMED reviews each candidacy personally.",
      pt: "Recebemos até doze licenciados por safra. Médicos e clínicas interessados são bem-vindos: envie sua solicitação. A PAXMED analisa cada candidatura pessoalmente.",
    },
    submitted: {
      title: { en: "Your candidacy has been received.", pt: "Sua candidatura foi recebida." },
      body: {
        en: "A representative of PAXMED will contact you within 48 hours, privately, only if your candidacy advances to the next stage. Silence, if it occurs, is also a respectful answer.",
        pt: "Um responsável da PAXMED entrará em contato em até 48 horas, em caráter privado, apenas se sua candidatura avançar para a próxima etapa. O silêncio, se ocorrer, também é uma resposta respeitosa.",
      },
    },
    fields: {
      name: { en: "Full name", pt: "Nome completo" },
      namePh: { en: "Dr. First Last", pt: "Dr(a). Nome Sobrenome" },
      email: { en: "Professional email", pt: "Email profissional" },
      emailPh: { en: "you@clinic.com", pt: "voce@clinica.com.br" },
      phone: { en: "Phone / WhatsApp", pt: "Telefone / WhatsApp" },
      phonePh: { en: "+1 555 000-0000", pt: "(11) 90000-0000" },
      clinic: { en: "Clinic name", pt: "Nome da clínica" },
      clinicPh: { en: "Maison Integrative Clinic", pt: "Maison Clínica Integrativa" },
      specialty: { en: "Specialty", pt: "Especialidade" },
      volume: { en: "Injectable protocols / month", pt: "Protocolos injetáveis / mês" },
      referrer: { en: "Who referred you · and why", pt: "Quem o indicou · e por quê" },
      referrerPh: {
        en: "If referred, state the physician's name. If not, describe why your clinic fits the Circle standard — protocols, monthly volume, what sets it apart.",
        pt: "Conte-nos sobre sua clínica: protocolos realizados, volume mensal e o que deseja alcançar com o PAXMED.",
      },
      selectPh: { en: "Select…", pt: "Selecione…" },
      selectOptional: { en: "Select (optional)…", pt: "Selecione (opcional)…" },
    },
    specialties: [
      { en: "Integrative Medicine", pt: "Medicina Integrativa" },
      { en: "Aesthetics / Injectables", pt: "Estética / Injetáveis" },
      { en: "Longevity / Anti-Aging", pt: "Longevidade / Anti-Aging" },
      { en: "Orthomolecular", pt: "Ortomolecular" },
      { en: "Endocrinology", pt: "Endocrinologia" },
      { en: "Nutrology", pt: "Nutrologia" },
      { en: "Integrative Gynaecology", pt: "Ginecologia Integrativa" },
      { en: "Other", pt: "Outra" },
    ] as B[],
    volumes: [
      { en: "1 to 10", pt: "1 a 10" },
      { en: "11 to 30", pt: "11 a 30" },
      { en: "31 to 80", pt: "31 a 80" },
      { en: "81 to 200", pt: "81 a 200" },
      { en: "More than 200", pt: "Mais de 200" },
    ] as B[],
    confidential: { en: "Confidential review · Professional secrecy guaranteed", pt: "Análise confidencial · Sigilo profissional garantido" },
    submit: { en: "Send candidacy", pt: "Enviar candidatura" },
    sending: { en: "Sending…", pt: "Enviando…" },
    afterHint: { en: "Reply within 48 hours · Selected candidacies only", pt: "Resposta em até 48 horas · Apenas às candidaturas selecionadas" },
    terms: {
      title: { en: "Eligibility terms and consent", pt: "Termos de elegibilidade e consentimento" },
      items: [
        {
          en: "I declare that I am the physician technically responsible for a clinic in operation, with active CPF/CNPJ and professional registration.",
          pt: "Declaro ser médico responsável técnico por uma clínica em atividade, com CPF/CNPJ e registro profissional ativos.",
        },
        {
          en: "I confirm that this candidacy is reviewed privately and that access to PAXMED depends on a referral approved by PAXMED.",
          pt: "Confirmo que a candidatura é analisada de forma privada e que a implantação do PAXMED depende da aprovação da equipe PAXMED.",
        },
        {
          en: "I understand that the number of licensees is limited to 12 per cohort and that receiving no reply also means the Circle's standard has been preserved.",
          pt: "Entendo que o número de licenciados é limitado a 12 por safra e que o não recebimento de resposta também significa manutenção do padrão do Círculo.",
        },
      ] as B[],
      consent: {
        en: "I have read and agree to the use of the data above for eligibility review, contact regarding my candidacy and, if approved, activation of the PAXMED license, in accordance with LGPD. My data is treated in confidence, is not commercialised and may be requested for deletion at any time via ",
        pt: "Li e concordo com o uso dos dados acima para análise de elegibilidade, contato sobre minha candidatura e, se aprovado, ativação da licença PAXMED, conforme a LGPD. Seus dados são tratados em sigilo, não são comercializados e podem ser solicitados para exclusão a qualquer momento pelo email ",
      },
      email: { en: "contact@paxmed.com.br", pt: "contato@paxmed.com.br" },
    },
    toasts: {
      nameShort: { en: "Please provide your full name.", pt: "Informe seu nome completo." },
      email: { en: "Please provide a valid email.", pt: "Informe um email válido." },
      clinic: { en: "Please provide the clinic name.", pt: "Informe o nome da clínica." },
      specialty: { en: "Please select or enter the specialty.", pt: "Selecione ou informe a especialidade." },
      referrer: { en: "Please describe your protocol needs or who referred you.", pt: "Descreva sua necessidade em protocolos." },
      consent: { en: "You must accept the eligibility and LGPD consent terms.", pt: "É necessário aceitar os termos de elegibilidade e consentimento LGPD." },
      error: { en: "We couldn't submit right now. Please try again shortly.", pt: "Não foi possível enviar agora. Tente novamente em instantes." },
      success: { en: "Request received. We'll reply within 48 hours.", pt: "Solicitação recebida. Retornaremos em até 48 horas." },
    },
  },

  vitrine: {
    gate: {
      eyebrow: { en: "Private demonstration", pt: "Demonstração privada" },
      titlePre: { en: "The PAXMED experience is ", pt: "A experiência PAXMED é " },
      titleGold: { en: "by invitation", pt: "por convite" },
      titlePost: { en: ".", pt: "." },
      lead: {
        en: "To enter the demonstration, identify yourself. The door opens once and stays open on this browser.",
        pt: "Para entrar na demonstração, identifique-se. A porta abre uma vez e permanece aberta neste navegador.",
      },
      chooseTitle: { en: "Choose your entrance", pt: "Escolha sua entrada" },
      patientCard: { en: "I am a patient", pt: "Sou paciente" },
      clinicCard: { en: "I am a clinic", pt: "Sou clínica" },
      patientLead: { en: "See how your clinical journey becomes simpler, safer and more elegant.", pt: "Veja como sua jornada clínica fica mais simples, segura e elegante." },
      clinicLead: { en: "See how the clinical engine operates prescriptions, protocols and documents.", pt: "Veja como o motor clínico opera prescrições, protocolos e documentos." },
      back: { en: "Back to the site", pt: "Voltar ao site" },
    },
    form: {
      nameLabel: { en: "Full name", pt: "Nome completo" },
      namePh: { en: "Your full name", pt: "Seu nome completo" },
      cpfLabel: { en: "CPF", pt: "CPF" },
      cpfPh: { en: "000.000.000-00", pt: "000.000.000-00" },
      cnpjLabel: { en: "CNPJ", pt: "CNPJ" },
      cnpjPh: { en: "00.000.000/0000-00", pt: "00.000.000/0000-00" },
      phoneLabel: { en: "Phone / WhatsApp", pt: "Telefone / WhatsApp" },
      phonePh: { en: "(00) 00000-0000", pt: "(00) 00000-0000" },
      submit: { en: "Open the door", pt: "Abrir a porta" },
      submitting: { en: "Opening…", pt: "Abrindo…" },
      patientTitle: { en: "Patient entrance", pt: "Entrada de paciente" },
      clinicTitle: { en: "Clinic entrance", pt: "Entrada de clínica" },
      consent: {
        en: "I agree to be contacted about the PAXMED demonstration and to the processing of my data under LGPD.",
        pt: "Concordo em ser contactado sobre a demonstração PAXMED e no tratamento dos meus dados conforme a LGPD.",
      },
      toasts: {
        nameShort: { en: "Please provide your full name.", pt: "Informe o nome completo." },
        cpfInvalid: { en: "Invalid CPF. Check the 11 digits.", pt: "CPF inválido. Confira os 11 dígitos." },
        cnpjInvalid: { en: "Invalid CNPJ. Check the 14 digits.", pt: "CNPJ inválido. Confira os 14 dígitos." },
        phoneInvalid: { en: "Invalid phone. Use area code + number.", pt: "Telefone inválido. Use DDD + número." },
        consentRequired: { en: "You must accept the consent term to proceed.", pt: "É necessário aceitar o termo de consentimento para prosseguir." },
        configError: { en: "The demonstration is not yet configured. Please try again later.", pt: "A demonstração ainda não está configurada. Tente novamente em breve." },
        rateLimited: { en: "Too many attempts. Please wait 1 minute.", pt: "Muitas tentativas. Aguarde 1 minuto." },
        botDetected: {
          en: "Please take a moment and try again.",
          pt: "Aguarde um instante e tente novamente.",
        },
      },
    },
    already: {
      title: { en: "You are already registered", pt: "Você já se registrou" },
      lead: {
        en: "This browser has already been granted access. Continue to the demonstration or reset to try again on another device.",
        pt: "Este navegador já teve acesso liberado. Continue para a demonstração ou limpe para tentar novamente em outro dispositivo.",
      },
      reset: { en: "Reset access on this device", pt: "Limpar acesso neste dispositivo" },
    },
    content: {
      eyebrow: { en: "Welcome to the private demonstration", pt: "Bem-vindo à demonstração privada" },
      title: { en: "The Circle is open for you", pt: "O Círculo está aberto para você" },
      patient: {
        body: {
          en: "From the moment you schedule your appointment, PAXMED prepares your clinical pathway. Your doctor receives an integrated cockpit, your documents are signed with legal validity and your reminders arrive at the biologically correct time.",
          pt: "Desde o momento em que você agenda sua consulta, o PAXMED prepara seu caminho clínico. Seu médico recebe um cockpit integrado, seus documentos são assinados com validade jurídica e seus lembretes chegam no momento biologicamente correto.",
        },
        cta: { en: "Schedule a private presentation", pt: "Agendar uma apresentação privada" },
      },
      clinic: {
        body: {
          en: "PAXMED turns your clinic into a maison: unified prescription, guided protocols, legally valid documents, laboratory evolution and a billing console with three scenarios. Everything in one screen, one decision at a time.",
          pt: "O PAXMED transforma sua clínica em uma maison: prescrição unificada, protocolos guiados, documentos com validade jurídica, evolução laboratorial e console de orçamento com três cenários. Tudo em uma tela, uma decisão de cada vez.",
        },
        cta: { en: "Request a demo", pt: "Solicitar demonstração" },
      },
    },
  },

  footer: {
    tagline: {
      en: "A PAXMED product — a PADCOM company. Granted by referral, kept by standard.",
      pt: "Um produto PAXMED — uma empresa PADCOM. Exclusividade e alta precisão para a medicina integrativa.",
    },
    domain: { en: "paxmed.com.br", pt: "paxmed.com.br" },
    email: { en: "contact@paxmed.com.br", pt: "contato@paxmed.com.br" },
    established: { en: "Établi 2026", pt: "Établi 2026" },
    place: { en: "São Paulo · Brazil", pt: "São Paulo · Brasil" },
    rights: { en: "© 2026 PAXMED · All rights reserved", pt: "© 2026 PAXMED · Todos os direitos reservados" },
    signature: { en: "Made with precision", pt: "Feito com precisão" },
    columns: {
      house: {
        title: { en: "The House", pt: "A Casa" },
        lines: [
          { en: "PAXMED · Clinical Intelligence System", pt: "PAXMED · Sistema de Inteligência Clínica" },
          { en: "By PAXMED", pt: "Por PAXMED" },
          { en: "Établi 2026", pt: "Établi 2026" },
          { en: "São Paulo · Brazil", pt: "São Paulo · Brasil" },
        ],
      },
      contact: {
        title: { en: "Private Office", pt: "Escritório Privado" },
        lines: [
          { en: "paxmed.com.br", pt: "paxmed.com.br" },
          { en: "contact@paxmed.com.br", pt: "contato@paxmed.com.br" },
          { en: "Av. Brigadeiro Faria Lima, 3477", pt: "Av. Brigadeiro Faria Lima, 3477" },
          { en: "Itaim Bibi · São Paulo · SP", pt: "Itaim Bibi · São Paulo · SP" },
        ],
      },
      standards: {
        title: { en: "Standards", pt: "Padrões" },
        lines: [
          { en: "LGPD · GDPR compliant", pt: "Conformidade LGPD · GDPR" },
          { en: "ISO/IEC 27001 architecture", pt: "Arquitetura ISO/IEC 27001" },
          { en: "TLS 1.3 · OAuth 2.1", pt: "TLS 1.3 · OAuth 2.1" },
          { en: "CFM · ANVISA aligned", pt: "Alinhado ao CFM · ANVISA" },
        ],
      },
      register: {
        title: { en: "Register", pt: "Registro" },
        lines: [
          { en: "PAXMED® · Registered mark", pt: "PAXMED® · Marca registrada" },
          { en: "PADCON Platform® · INPI", pt: "PADCON Platform® · INPI" },
          { en: "CNPJ 00.000.000/0001-00", pt: "CNPJ 00.000.000/0001-00" },
          { en: "Exclusive onboarding", pt: "Implantação exclusiva" },
        ],
      },
    },
  },
} as const;

export type Bilingual = { en: string; pt: string };