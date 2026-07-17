import { useState } from "react";
import { ParxisWordmark } from "@/components/brand/ParxisWordmark";
import { ParxisLogo } from "@/components/brand/ParxisLogo";

const C = {
  pt: {
    nav: { cta: "Falar com Especialista", lang: "EN" },
    hero: {
      descriptor: "Clinical Intelligence System",
      signature:  "Precision in Integrative Care",
      tagline:    "AI-guided prescriptions, exams and injectable protocols.",
      sub: "O sistema de gestão clínica definitivo para protocolos injetáveis de alta complexidade. Do protocolo ao arquivo — totalmente integrado, juridicamente seguro, clinicamente preciso.",
      cta1: "Agendar Demonstração",
      cta2: "Ver Funcionalidades",
    },
    pain: {
      title: "A gestão amadora custa caro.",
      sub:   "O crescimento da sua clínica de injetáveis está sendo travado por processos que geram risco legal, perda de receita e exposição regulatória.",
      items: [
        { title: "Controle em Papel",        desc: "Protocolos em cadernos e planilhas desconexas, sem rastreabilidade de substâncias ou lotes." },
        { title: "Risco Jurídico Sem RAS",   desc: "Administração de injetáveis sem Registro de Assistência Sistêmica com validade legal e carimbo de tempo." },
        { title: "Prontuário Fragmentado",   desc: "Histórico do cliente espalhado entre WhatsApp, pastas físicas e sistemas clínicos genéricos." },
        { title: "Comunicação Quebrada",     desc: "Clientes esquecem sessões, não recebem código de validação, nem orientações pré e pós-aplicação." },
        { title: "Exames Perdidos",          desc: "Laudos enterrados no WhatsApp, sem comparação de evolução clínica nem organização por data." },
        { title: "Agenda Sem Orquestração",  desc: "Boxes de aplicação ociosos por falta de gestão do ciclo completo do protocolo e da equipe." },
      ],
    },
    features: {
      title: "30 Módulos. Uma Plataforma.",
      sub:   "Cada funcionalidade foi projetada para o fluxo real de uma clínica de protocolos injetáveis — sem adaptações forçadas de sistemas genéricos.",
      items: [
        {
          num: "01", name: "Protocolo Digital — Lançador Guiado",
          desc: "Monte protocolos completos em uma única tela. Substâncias, datas de início, frequência, dose por item e precificação individual. O cronograma de sessões é gerado automaticamente.",
          tags: ["Lançador guiado", "Cronograma automático", "Precificação por item"],
        },
        {
          num: "02", name: "Agenda Semanal Visual",
          desc: "Visão semanal com cartões codificados por cor: verde para concluído, âmbar para parcial, azul para hoje, vermelho para perdido, cinza para cancelado. Gestão de boxes com tempo estimado automático por tipo de procedimento.",
          tags: ["Código de cores", "Gestão de boxes", "Tempo estimado"],
        },
        {
          num: "03", name: "RAS com Validade Jurídica",
          desc: "Registro de Assistência Sistêmica gerado automaticamente com assinatura digital qualificada — padrão jurídico nacional. Cada administração documentada, carimbada e juridicamente blindada conforme CFM e Anvisa.",
          tags: ["Assinatura qualificada", "CFM / Anvisa", "Carimbo de tempo"],
        },
        {
          num: "04", name: "FAP — Formulário de Auditoria em Papel",
          desc: "Planilha em PDF paisagem para controle manual da enfermagem. Grade consolidada por semana, colunas fixas por substância, células de confirmação individual. Linha de assinatura com carimbo CRM/COREN.",
          tags: ["PDF paisagem", "Grade semanal", "Auditoria em papel"],
        },
        {
          num: "05", name: "Protocolo Completo PDF",
          desc: "Documento de 8 a 10 páginas com capa de marca, matriz de benefícios por substância com classificação por estrelas, fichas técnicas, termos de consentimento por via de aplicação, cláusula legal e resumo financeiro.",
          tags: ["8–10 páginas", "Termo de consentimento", "Resumo financeiro"],
        },
        {
          num: "06", name: "Arquivo Digital Automático na Nuvem",
          desc: "O sistema cria e organiza automaticamente a pasta digital do cliente com 15 subpastas temáticas. Todos os PDFs gerados são enviados para a subpasta correta com nomenclatura padronizada — sem trabalho manual.",
          tags: ["15 subpastas", "Nomenclatura padrão", "Upload automático"],
        },
        {
          num: "07", name: "Comunicação Automatizada com o Cliente",
          desc: "O cliente recebe mensagem antes de cada sessão com código de verificação, lista de substâncias e orientações. Após a sessão, recebe o registro assinado em anexo. Tudo automático, com identidade visual da clínica.",
          tags: ["Pré e pós-sessão", "Código de verificação", "PDF em anexo"],
        },
        {
          num: "08", name: "Portal Exclusivo do Cliente",
          desc: "Portal privado para o cliente acompanhar o protocolo, visualizar sessões agendadas e consultar seu histórico. Upload de laudos classificado automaticamente por tipo e roteado para a pasta correta.",
          tags: ["Acesso privado", "Upload classificado", "Histórico completo"],
        },
        {
          num: "09", name: "Estoque com Alertas Inteligentes",
          desc: "Controle de substâncias, soluções e insumos com alertas automáticos de nível crítico e nível baixo. Rastreamento de lote, validade e consumo por protocolo.",
          tags: ["Alerta crítico", "Rastreio de lote", "Validade"],
        },
        {
          num: "10", name: "Financeiro e Controle de Pagamentos",
          desc: "Registro de recebimentos por modalidade: PIX, cartão, boleto e dinheiro. Parcelamento com identificação por cartão. Saldo corrente automático com total pago e pendente por protocolo.",
          tags: ["Múltiplas modalidades", "Parcelamento", "Saldo corrente"],
        },
        {
          num: "11", name: "Catálogo Clínico de Substâncias",
          desc: "Biblioteca expandível com ficha técnica completa por substância: função principal, efeitos percebidos, impacto por sistema orgânico, benefícios em longevidade, sono, energia, libido e performance. Classificação de eficácia.",
          tags: ["Ficha técnica", "Por sistema orgânico", "Longevidade"],
        },
        {
          num: "12", name: "Anamnese Digital Progressiva",
          desc: "Questionário clínico estruturado por sistema do corpo com lógica dinâmica — só mostra o que é relevante para aquele cliente. Alarmes clínicos detectados automaticamente em múltiplas camadas de proteção.",
          tags: ["Lógica dinâmica", "Alarme automático", "Por sistemas"],
        },
        {
          num: "13", name: "Gestão do Corpo Clínico",
          desc: "Cadastro de médicos, enfermeiras e administrativos com perfis por especialização e vínculo por localização. Cada cargo acessa menus e permissões próprios — médico vê tudo, enfermeira vê o que é seu.",
          tags: ["Por cargo", "Multi-localização", "Permissões individuais"],
        },
        {
          num: "14", name: "Sincronização com Google Agenda",
          desc: "Sessões sincronizadas com até três agendas simultâneas: geral, médico e enfermagem. Duração definida automaticamente pelo tipo de procedimento. Endereço do local de aplicação incluído no evento.",
          tags: ["3 agendas", "Duração automática", "Endereço no evento"],
        },
        {
          num: "15", name: "Prescrição de Fórmulas Manipuladas",
          desc: "Receituário completo para farmácias de manipulação. Ativos, doses, vias e orientações organizados em documento clínico impresso no formato exigido pela regulamentação sanitária. Assinado digitalmente.",
          tags: ["Fórmulas manipuladas", "Regulamentação sanitária", "Assinado"],
        },
        {
          num: "16", name: "Numeração Legal Automática de Receitas",
          desc: "Receitas de medicamentos controlados recebem numeração oficial obrigatória por lei, na cor e no formato corretos exigidos pela Anvisa e pelo Conselho Federal de Medicina. Zero risco de autuação.",
          tags: ["Numeração oficial", "Controlados", "Anvisa / CFM"],
        },
        {
          num: "17", name: "Pedido de Exames Já Formatado",
          desc: "O médico seleciona o exame e o sistema já tem o texto do pedido pronto — com preparo do cliente, finalidade clínica e corpo formatado. O médico não escreve; o sistema gera e imprime.",
          tags: ["Texto gerado", "Preparo do cliente", "PDF oficial"],
        },
        {
          num: "18", name: "Leitura de Laudos por Inteligência Artificial",
          desc: "O médico envia o PDF do laudo e a IA extrai cada resultado automaticamente: analito, valor, data e laboratório. Funciona com laudos digitais e com laudos escaneados em papel. Sem digitação.",
          tags: ["IA extrai", "Digital + escaneado", "Sem digitação manual"],
        },
        {
          num: "19", name: "Faixas de Referência Integrativas",
          desc: "Os resultados são interpretados pelas faixas da medicina integrativa — não só pelo 'normal' do laboratório convencional. O sistema mostra o que é ótimo para longevidade, performance e bem-estar.",
          tags: ["Referência integrativa", "Longevidade", "Além do convencional"],
        },
        {
          num: "20", name: "Evolução Visual de Exames no Tempo",
          desc: "Gráficos longitudinais por marcador. O médico mostra ao cliente como a vitamina D, testosterona, cortisol e outros indicadores evoluíram desde o início do acompanhamento. Argumento clínico em imagem.",
          tags: ["Gráficos longitudinais", "Evolução real", "Argumento clínico"],
        },
        {
          num: "21", name: "Console de Orçamento Clínico",
          desc: "Vitrine visual de substâncias com precificação flexível. Gera automaticamente três cenários de pagamento — à vista, entrada com parcelas ou parcelamento total — com descontos e encargos já calculados.",
          tags: ["3 cenários", "Desconto automático", "Fechamento na consulta"],
        },
        {
          num: "22", name: "Agendamento Inteligente pelo Cliente",
          desc: "O cliente marca a própria consulta pelo sistema — sem telefonema. Dois caminhos disponíveis: fila padrão ou acesso prioritário com pagamento integrado. A clínica confirma com um clique.",
          tags: ["Autoagendamento", "Acesso prioritário", "Pagamento integrado"],
        },
        {
          num: "23", name: "App do Cliente Instalável no Celular",
          desc: "O cliente instala o app direto do navegador — sem App Store nem Play Store. Acessa documentos, agenda, protocolo e envia exames. Ícone na tela inicial, funciona como app nativo.",
          tags: ["Sem loja de apps", "Ícone na tela", "Multiplataforma"],
        },
        {
          num: "24", name: "Lembretes de Tratamento no Período Certo",
          desc: "O sistema agenda lembretes automáticos para o cliente tomar cada medicamento prescrito no período do dia correto — manhã, tarde, noite — conforme a prescrição. Aderência sem esforço da equipe.",
          tags: ["Período do dia", "Automático", "Aderência ao tratamento"],
        },
        {
          num: "25", name: "Atestados Médicos Digitais",
          desc: "Emite atestado médico real com dados do cliente, código de doença quando aplicável, dias, finalidade, assinatura e número de registro do profissional. PDF com marca da clínica, arquivado na nuvem.",
          tags: ["PDF de marca", "CID automático", "Arquivo permanente"],
        },
        {
          num: "26", name: "Encaminhamentos a Especialistas",
          desc: "Gera encaminhamento com especialidade de destino, grau de urgência, motivo e resumo clínico em PDF oficial com identidade visual da clínica. Arquivado automaticamente na pasta do cliente.",
          tags: ["Urgência destacada", "Resumo clínico", "Arquivo automático"],
        },
        {
          num: "27", name: "Modelos de Documento com Variáveis",
          desc: "O médico cria modelos de texto uma vez. Na emissão, o sistema preenche automaticamente nome do cliente, data, código de doença e registro do profissional. Sem digitação repetitiva.",
          tags: ["Modelo reutilizável", "Preenchimento automático", "Zero repetição"],
        },
        {
          num: "28", name: "Nota Fiscal de Serviço Eletrônica",
          desc: "NFS-e emitida diretamente no sistema, sem abrir outra plataforma. Histórico de notas por cliente integrado ao painel financeiro da clínica.",
          tags: ["NFS-e integrada", "Sem outro software", "Histórico fiscal"],
        },
        {
          num: "29", name: "Acompanhamento Evolutivo por Sessão",
          desc: "A cada sessão aplicada o sistema gera relatório de progresso: número da sessão, percentual do protocolo concluído, histórico das últimas sessões, nível de aderência e tolerância. Enviado ao cliente.",
          tags: ["Progresso por sessão", "Aderência", "Relatório automático"],
        },
        {
          num: "30", name: "Cockpit Unificado da Consulta",
          desc: "Uma tela, um cliente, tudo acessível. O médico abre a ficha e encontra em abas: prescrição de fórmulas, injetáveis, implantes, pedidos de exames, evolução e documentos — sem navegar para fora.",
          tags: ["Tudo em uma tela", "Por abas", "Zero navegação"],
        },
      ],
    },
    pawards: {
      label: "Inteligência Clínica",
      title: "PAWARDS MED CORE",
      sub: "O motor de inteligência clínica que opera por baixo do PARXIS. Recebe os dados da anamnese e dos exames, cruza com o maior catálogo clínico integrativo do mercado, e sugere o caminho clínico — para o médico decidir com mais velocidade, mais embasamento e menos risco.",
      items: [
        { num: "I",    name: "Motor de Anamnese por Sistemas",      desc: "Questionário clínico estruturado por sistema do corpo. Só abre as perguntas relevantes. Alarmes clínicos detectados automaticamente — nunca suprimidos, mesmo que o cliente queira pular." },
        { num: "II",   name: "Motor de Regras Clínicas",            desc: "Biblioteca de raciocínio: o sistema cruza sintomas, histórico e exames e aponta sugestões. O médico não precisa lembrar de tudo — o motor sugere, o médico valida e decide." },
        { num: "III",  name: "Caminhos Clínicos por Queixa",        desc: "O médico informa a queixa principal ou o diagnóstico e o sistema monta o caminho completo sugerido: quais exames pedir e quais tratamentos considerar." },
        { num: "IV",   name: "Catálogo de Fórmulas Manipuladas",    desc: "Biblioteca completa de fórmulas com composição, ativos, via, posologia por período do dia e efeitos. O médico consulta e prescreve sem sair do sistema." },
        { num: "V",    name: "Catálogo de Injetáveis",              desc: "Acervo extenso de substâncias injetáveis com dados clínicos completos, vinculado ao motor de sugestão. A maior base clínica integrativa disponível em sistema." },
        { num: "VI",   name: "Catálogo de Exames com Texto Pronto", desc: "Cada exame tem o texto do pedido formatado, o preparo do cliente e a finalidade clínica registrada. O médico seleciona — o sistema gera o documento." },
        { num: "VII",  name: "Blocos Temáticos de Exames",          desc: "Grupos de exames organizados por tema clínico: hormonal, metabólico, cardiovascular, longevidade. Um clique pede o painel completo." },
        { num: "VIII", name: "Posologia pelo Período do Dia",       desc: "O sistema conhece o momento ideal de cada medicamento e gera automaticamente o esquema de uso por período do dia para o cliente seguir com precisão." },
      ],
    },
    flow: {
      title: "Mecânica Operacional",
      sub: "Um fluxo perfeitamente orquestrado, sem atritos.",
      steps: [
        { n: "01", title: "Onboarding",    desc: "Clínica configurada em 24h com substâncias, equipe, locais e integrações ativas." },
        { n: "02", title: "Prescrição",    desc: "Médico lança protocolo com substâncias, precificação e cronograma automático de sessões." },
        { n: "03", title: "Agendamento",   desc: "Sessões criadas automaticamente. Cliente recebe código por mensagem e e-mail de marca." },
        { n: "04", title: "Aplicação",     desc: "Enfermagem confirma substância a substância. Registro gerado e assinado digitalmente." },
        { n: "05", title: "Arquivo",       desc: "Pasta digital organizada automaticamente. Histórico completo com assinatura de validade jurídica." },
      ],
    },
    audience: {
      title: "Para quem é o PARXIS?",
      yes: {
        label: "Ideal para",
        items: [
          "Clínicas de Medicina Estética Avançada",
          "Centros de Longevidade e Anti-aging",
          "Clínicas de Medicina do Esporte e Performance",
          "Médicos com reposição hormonal e terapias IV/IM",
          "Clínicas com volume alto de terapias intravenosas",
          "Operações multi-clínica com equipe de enfermagem própria",
        ],
      },
      no: {
        label: "Não recomendado para",
        items: [
          "Consultórios sem procedimentos injetáveis in-house",
          "Clínicas gerais sem foco em protocolos seriados",
          "Operações 100% analógicas resistentes ao digital",
        ],
      },
    },
    cta: {
      title: "Eleve o padrão da sua operação.",
      sub: "Agende uma demonstração e descubra como o PARXIS transforma a complexidade clínica em precisão sistêmica.",
      btn: "Agendar Demonstração",
    },
    footer: {
      by: "PARXIS by PAWARDS",
      tagline: "Precision in Integrative Care",
    },
  },

  en: {
    nav: { cta: "Talk to a Specialist", lang: "PT" },
    hero: {
      descriptor: "Clinical Intelligence System",
      signature:  "Precision in Integrative Care",
      tagline:    "AI-guided prescriptions, exams and injectable protocols.",
      sub: "The definitive clinical management system for high-complexity injectable protocols. From prescription to archive — fully integrated, legally compliant, clinically precise.",
      cta1: "Schedule a Demo",
      cta2: "View Features",
    },
    pain: {
      title: "Amateurish management costs dearly.",
      sub:   "Your injectable clinic's growth is being throttled by processes that generate legal risk, revenue loss, and regulatory exposure.",
      items: [
        { title: "Paper-Based Control",      desc: "Protocols in notebooks and disconnected spreadsheets, with no substance or batch traceability." },
        { title: "Legal Risk Without RAS",   desc: "Injectable administration without a legally valid Systemic Assistance Record with a certified timestamp." },
        { title: "Fragmented Records",       desc: "Client history scattered across WhatsApp, physical folders, and generic clinical systems." },
        { title: "Broken Communication",     desc: "Clients miss sessions, don't receive validation codes, or pre/post-infusion instructions." },
        { title: "Lost Lab Reports",         desc: "Results buried in WhatsApp with no clinical evolution comparison or date-based organization." },
        { title: "Unorchestrated Schedule",  desc: "Idle infusion chairs due to lack of full protocol cycle and nursing team management." },
      ],
    },
    features: {
      title: "30 Modules. One Platform.",
      sub:   "Each feature was designed for the real workflow of an injectable protocol clinic — not a forced adaptation of a generic system.",
      items: [
        {
          num: "01", name: "Digital Protocol — Guided Launcher",
          desc: "Build complete protocols in a single screen. Substances, start dates, frequency, individual doses and pricing. Session schedule generated automatically.",
          tags: ["Guided launcher", "Auto schedule", "Per-item pricing"],
        },
        {
          num: "02", name: "Visual Weekly Schedule",
          desc: "Weekly view with color-coded cards: green for done, amber for partial, blue for today, red for missed, gray for cancelled. Chair management with automatic estimated time per procedure type.",
          tags: ["Color-coded", "Chair management", "Auto time estimate"],
        },
        {
          num: "03", name: "RAS with Legal Validity",
          desc: "Systemic Assistance Record automatically generated with qualified digital signature — national legal standard. Every administration documented, timestamped, and legally shielded per CFM and Anvisa.",
          tags: ["Qualified signature", "CFM / Anvisa", "Certified timestamp"],
        },
        {
          num: "04", name: "FAP — Paper Audit Form",
          desc: "Landscape PDF for nursing manual control. Consolidated weekly grid, fixed substance columns, individual confirmation cells. Signature line with CRM/COREN stamp.",
          tags: ["Landscape PDF", "Weekly grid", "Paper audit"],
        },
        {
          num: "05", name: "Complete Protocol PDF",
          desc: "8–10 page document with branded cover, substance benefits matrix with star ratings, technical sheets, informed consent by administration route, legal clause and financial summary.",
          tags: ["8–10 pages", "Consent by route", "Financial summary"],
        },
        {
          num: "06", name: "Automatic Digital Archive",
          desc: "The system automatically creates and organizes the client's digital folder with 15 themed subfolders. All generated PDFs are sent to the correct subfolder with standardized naming — no manual effort.",
          tags: ["15 subfolders", "Standard naming", "Auto upload"],
        },
        {
          num: "07", name: "Automated Client Communication",
          desc: "The client receives a message before each session with verification code, substance list and instructions. After the session, receives the signed record as an attachment. All automatic, with the clinic's branding.",
          tags: ["Pre & post-session", "Verification code", "PDF attachment"],
        },
        {
          num: "08", name: "Exclusive Client Portal",
          desc: "Private portal for the client to follow the protocol, view scheduled sessions and consult history. Lab report upload automatically classified by type and routed to the correct folder.",
          tags: ["Private access", "Auto-classified", "Full history"],
        },
        {
          num: "09", name: "Inventory with Smart Alerts",
          desc: "Substance, solution and supply control with automatic critical and low-level alerts. Batch tracking, expiration dates and per-protocol consumption tracking.",
          tags: ["Critical alerts", "Batch tracking", "Expiration"],
        },
        {
          num: "10", name: "Financial and Payment Control",
          desc: "Payment recording by modality: PIX, card, boleto and cash. Installments with per-card identification. Automatic running balance with total paid and pending per protocol.",
          tags: ["Multiple modalities", "Installments", "Running balance"],
        },
        {
          num: "11", name: "Clinical Substance Catalog",
          desc: "Expandable library with full technical profile per substance: main function, perceived effects, body system impact, longevity, sleep, energy, libido and performance benefits. Efficacy rating.",
          tags: ["Technical profile", "By body system", "Longevity"],
        },
        {
          num: "12", name: "Progressive Digital Anamnesis",
          desc: "Structured clinical questionnaire by body system with dynamic logic — only shows what is relevant for that client. Clinical alerts detected automatically in multiple protection layers.",
          tags: ["Dynamic logic", "Auto alert", "By system"],
        },
        {
          num: "13", name: "Clinical Staff Management",
          desc: "Registration of physicians, nurses and staff with profiles by specialization and location binding. Each role has its own menus and permissions — the physician sees everything, the nurse sees what is theirs.",
          tags: ["By role", "Multi-location", "Individual permissions"],
        },
        {
          num: "14", name: "Google Calendar Sync",
          desc: "Sessions synced to up to three simultaneous calendars: general, physician, and nursing. Duration set automatically by procedure type. Clinic address included in the event.",
          tags: ["3 calendars", "Auto duration", "Address in event"],
        },
        {
          num: "15", name: "Compounded Formula Prescriptions",
          desc: "Full prescription for compounding pharmacies. Active ingredients, doses, routes and usage instructions organized in a clinical document printed in the format required by health regulations. Digitally signed.",
          tags: ["Compounded formulas", "Health regulations", "Signed"],
        },
        {
          num: "16", name: "Automatic Legal Prescription Numbering",
          desc: "Prescriptions for controlled substances receive the mandatory official numbering required by law, in the correct color and format required by Anvisa and the Federal Medical Council. Zero risk of compliance violation.",
          tags: ["Official numbering", "Controlled substances", "Anvisa / CFM"],
        },
        {
          num: "17", name: "Pre-formatted Exam Orders",
          desc: "The physician selects the exam and the system already has the order text ready — with patient preparation instructions, clinical purpose and formatted body. The physician does not write; the system generates and prints.",
          tags: ["Text generated", "Patient preparation", "Official PDF"],
        },
        {
          num: "18", name: "AI Lab Report Reading",
          desc: "The physician uploads the report PDF and AI extracts each result automatically: analyte, value, date and laboratory. Works with digital reports and scanned paper reports. No manual entry.",
          tags: ["AI extracts", "Digital + scanned", "No manual entry"],
        },
        {
          num: "19", name: "Integrative Reference Ranges",
          desc: "Results are interpreted using integrative medicine reference ranges — not just the 'normal' from a conventional lab. The system shows what is optimal for longevity, performance and well-being.",
          tags: ["Integrative reference", "Longevity", "Beyond conventional"],
        },
        {
          num: "20", name: "Visual Exam Evolution Over Time",
          desc: "Longitudinal charts by marker. The physician shows the client how vitamin D, testosterone, cortisol and other indicators have evolved since the beginning of follow-up. Clinical argument in image form.",
          tags: ["Longitudinal charts", "Real evolution", "Clinical argument"],
        },
        {
          num: "21", name: "Clinical Budget Console",
          desc: "Visual substance showcase with flexible pricing. Automatically generates three payment scenarios — cash, partial down payment with installments, or full installments — with discounts and fees already calculated.",
          tags: ["3 scenarios", "Auto discount", "Close during consultation"],
        },
        {
          num: "22", name: "Smart Client Self-Scheduling",
          desc: "The client books their own appointment through the system — no phone call needed. Two paths: standard queue or priority access with integrated payment. The clinic confirms with one click.",
          tags: ["Self-scheduling", "Priority access", "Integrated payment"],
        },
        {
          num: "23", name: "Installable Client App",
          desc: "The client installs the app directly from the browser — no App Store or Play Store needed. Access documents, schedule, protocol and send exams. Icon on the home screen, works like a native app.",
          tags: ["No app store", "Home screen icon", "Cross-platform"],
        },
        {
          num: "24", name: "Treatment Reminders at the Right Time",
          desc: "The system automatically schedules reminders for the client to take each prescribed medication at the correct time of day — morning, afternoon or evening — as per the prescription. Adherence without team effort.",
          tags: ["Time of day", "Automatic", "Treatment adherence"],
        },
        {
          num: "25", name: "Digital Medical Certificates",
          desc: "Issues real medical certificates with client data, diagnosis code when applicable, days, purpose, signature and professional registration number. Branded PDF archived in the client's cloud folder.",
          tags: ["Branded PDF", "Auto diagnosis code", "Permanent archive"],
        },
        {
          num: "26", name: "Specialist Referrals",
          desc: "Generates referral with destination specialty, urgency level, reason and clinical summary in an official branded PDF. Automatically archived in the client's folder.",
          tags: ["Urgency highlighted", "Clinical summary", "Auto archive"],
        },
        {
          num: "27", name: "Document Templates with Variables",
          desc: "The physician creates text templates once. When issuing, the system automatically fills in the client's name, date, diagnosis code and professional registration. No repetitive typing.",
          tags: ["Reusable template", "Auto fill", "Zero repetition"],
        },
        {
          num: "28", name: "Electronic Service Invoice",
          desc: "Electronic service invoice issued directly in the system, without opening another platform. Invoice history per client integrated into the clinic's financial panel.",
          tags: ["Integrated invoice", "No extra software", "Fiscal history"],
        },
        {
          num: "29", name: "Session-by-Session Progress Tracking",
          desc: "After each session, the system generates a progress report: session number, protocol completion percentage, last-session history, adherence and tolerance levels. Sent to the client.",
          tags: ["Per-session progress", "Adherence", "Auto report"],
        },
        {
          num: "30", name: "Unified Consultation Cockpit",
          desc: "One screen, one client, everything accessible. The physician opens the record and finds in tabs: formula prescriptions, injectables, implants, exam orders, evolution and documents — without navigating away.",
          tags: ["All in one screen", "Tabbed", "Zero navigation"],
        },
      ],
    },
    pawards: {
      label: "Clinical Intelligence",
      title: "PAWARDS MED CORE",
      sub: "The clinical intelligence engine that powers PARXIS from below. It receives anamnesis and exam data, cross-references it against the largest integrative clinical catalog available, and suggests the clinical path — so the physician decides faster, better informed, with less risk.",
      items: [
        { num: "I",    name: "System-Based Anamnesis Engine",     desc: "Structured clinical questionnaire by body system. Only opens relevant questions. Clinical alerts detected automatically — never suppressed, even if the client tries to skip." },
        { num: "II",   name: "Clinical Rules Engine",             desc: "Reasoning library: the system cross-references symptoms, history and exams and surfaces suggestions. The physician doesn't need to remember everything — the engine suggests, the physician validates." },
        { num: "III",  name: "Clinical Pathways by Chief Complaint", desc: "The physician enters the chief complaint or diagnosis and the system builds the complete suggested pathway: which exams to order and which treatments to consider." },
        { num: "IV",   name: "Compounded Formula Catalog",        desc: "Complete library of compounded formulas with composition, active ingredients, route, dosage by time of day and effects. Consult and prescribe without leaving the system." },
        { num: "V",    name: "Injectable Substance Catalog",      desc: "Extensive catalog of injectable substances with complete clinical data, linked to the suggestion engine. The largest integrative clinical database available in a single system." },
        { num: "VI",   name: "Exam Catalog with Pre-written Orders", desc: "Each exam has the formatted order text, patient preparation instructions and clinical purpose recorded. The physician selects — the system generates the document." },
        { num: "VII",  name: "Thematic Exam Panels",              desc: "Exam groups organized by clinical theme: hormonal, metabolic, cardiovascular, longevity. One click orders the complete panel." },
        { num: "VIII", name: "Time-of-Day Dosing",                desc: "The system knows the optimal moment for each medication and automatically generates the time-of-day dosing schedule for the client to follow with precision." },
      ],
    },
    flow: {
      title: "Operational Mechanics",
      sub: "A perfectly orchestrated workflow, frictionless.",
      steps: [
        { n: "01", title: "Onboarding",     desc: "Clinic configured in 24h with substances, team, locations and active integrations." },
        { n: "02", title: "Prescription",   desc: "Physician launches protocol with substances, pricing, and automatic session schedule." },
        { n: "03", title: "Scheduling",     desc: "Sessions created automatically. Client receives verification code and branded email." },
        { n: "04", title: "Application",    desc: "Nursing confirms substance by substance. Record generated and digitally signed." },
        { n: "05", title: "Archiving",      desc: "Digital folder organized automatically. Full history with legally valid digital signature." },
      ],
    },
    audience: {
      title: "Who is PARXIS for?",
      yes: {
        label: "Ideal for",
        items: [
          "Advanced Medical Aesthetics Clinics",
          "Longevity and Anti-aging Centers",
          "Sports Medicine and Performance Clinics",
          "Physicians prescribing hormonal therapy IV/IM",
          "High-volume intravenous therapy clinics",
          "Multi-clinic operations with in-house nursing teams",
        ],
      },
      no: {
        label: "Not recommended for",
        items: [
          "Practices without in-house injectable procedures",
          "General clinics without serial protocol focus",
          "100% analog operations resistant to digital adoption",
        ],
      },
    },
    cta: {
      title: "Elevate the standard of your operation.",
      sub: "Schedule a demonstration and discover how PARXIS transforms clinical complexity into systemic precision.",
      btn: "Schedule a Demo",
    },
    footer: {
      by: "PARXIS by PAWARDS",
      tagline: "Precision in Integrative Care",
    },
  },
} as const;

type Lang = keyof typeof C;

export default function Home() {
  const [lang, setLang] = useState<Lang>("pt");
  const t = C[lang];

  const WHATSAPP_URL = "https://wa.me/5511999999999?text=Quero%20conhecer%20o%20PARXIS";

  return (
    <div className="min-h-screen overflow-x-hidden" style={{ background: "var(--parxis-black-950)", color: "var(--parxis-text-main)" }}>

      {/* ── NAV ─────────────────────────────────────────────────────────── */}
      <nav style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 50, background: "rgba(4,2,2,0.96)", backdropFilter: "blur(20px)", borderBottom: "1px solid rgba(242,184,23,0.10)", height: 68 }}>
        <div style={{ maxWidth: 1280, margin: "0 auto", padding: "0 32px", height: "100%", display: "flex", alignItems: "center", gap: 40 }}>

          {/* Logo + separador */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
            <ParxisWordmark fontSize={20} />
            <span style={{ width: 1, height: 16, background: "rgba(242,184,23,0.20)", display: "block" }} />
            <span style={{ fontFamily: "var(--app-font-label)", fontSize: 10, letterSpacing: "0.22em", color: "var(--parxis-text-muted)", textTransform: "uppercase" as const }}>
              Motor Clínico
            </span>
          </div>

          {/* Menu central */}
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 36 }}>
            {(lang === "pt"
              ? ["Manifesto", "Recursos", "Tecnologia", "Para Clínicas"]
              : ["Manifesto", "Resources", "Technology", "For Clinics"]
            ).map((item) => (
              <a
                key={item}
                href="#features"
                style={{ fontFamily: "var(--app-font-label)", fontSize: 11, letterSpacing: "0.17em", color: "#C8BEAA", textTransform: "uppercase" as const, textDecoration: "none", transition: "color 220ms", whiteSpace: "nowrap" as const }}
                onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.color = "#FFD85A"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.color = "#C8BEAA"; }}
              >
                {item}
              </a>
            ))}
          </div>

          {/* Direita: idioma + CTA */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
            <button
              onClick={() => setLang(l => l === "pt" ? "en" : "pt")}
              style={{ fontFamily: "var(--app-font-label)", fontSize: 11, letterSpacing: "0.16em", color: "#8E8576", border: "1px solid rgba(242,184,23,0.18)", padding: "5px 14px", background: "transparent", cursor: "pointer", transition: "all 200ms", textTransform: "uppercase" as const }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = "#FFD85A"; (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(242,184,23,0.40)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = "#8E8576"; (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(242,184,23,0.18)"; }}
            >
              {t.nav.lang}
            </button>
            <a
              href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer"
              className="btn-gold"
              style={{ fontFamily: "var(--app-font-label)", fontSize: 11, letterSpacing: "0.14em", padding: "10px 20px", display: "inline-flex", alignItems: "center", gap: 8 }}
            >
              {t.nav.cta}
            </a>
          </div>

        </div>
      </nav>

      {/* ── HERO ────────────────────────────────────────────────────────── */}
      <section
        className="relative pt-[72px] min-h-screen flex items-center overflow-hidden"
        style={{ background: "radial-gradient(ellipse at 65% 40%, #1C0A0C 0%, #0D0404 40%, #050505 75%)" }}
      >
        {/* Glow dourado centrado no símbolo */}
        <div className="absolute pointer-events-none" style={{ right: "8%", top: "50%", transform: "translate(20%, -50%)", width: "55vw", height: "55vw", maxWidth: 700, maxHeight: 700, background: "radial-gradient(ellipse, rgba(242,184,23,0.07) 0%, transparent 65%)", borderRadius: "50%" }} />

        <div className="container mx-auto px-6 py-24 relative z-10">
          <div className="flex flex-col lg:flex-row items-center gap-12 lg:gap-0">

            {/* ── ESQUERDA: texto ── */}
            <div className="flex-1 lg:pr-16 text-center lg:text-left">
              {/* Eyebrow */}
              <p className="animate-fade-up mb-6" style={{ fontFamily: "var(--app-font-label)", fontSize: 11, letterSpacing: "0.30em", color: "var(--parxis-gold-deep)", textTransform: "uppercase" }}>
                {t.hero.descriptor}
              </p>

              {/* Headline principal — grande como no Lovable */}
              <h1 className="animate-fade-up animate-fade-up-delay-1" style={{ fontFamily: "var(--app-font-serif)", fontSize: "clamp(36px, 5.5vw, 72px)", fontWeight: 700, lineHeight: 1.10, letterSpacing: "-0.01em", marginBottom: 28, color: "#FFFFFF" }}>
                {lang === "pt" ? (
                  <>
                    O motor clínico das{" "}
                    <em style={{ fontStyle: "italic", color: "var(--parxis-gold-main)" }}>clínicas integrativas</em>{" "}
                    de alto padrão.
                  </>
                ) : (
                  <>
                    The clinical engine for{" "}
                    <em style={{ fontStyle: "italic", color: "var(--parxis-gold-main)" }}>premium integrative</em>{" "}
                    clinics.
                  </>
                )}
              </h1>

              {/* Linha dourada */}
              <div className="divider-gold w-20 mb-8 mx-auto lg:mx-0 animate-fade-up animate-fade-up-delay-1" />

              {/* Sub */}
              <p className="animate-fade-up animate-fade-up-delay-2 mb-10 leading-relaxed" style={{ color: "var(--parxis-text-secondary)", fontSize: "clamp(15px, 1.5vw, 17px)", maxWidth: 520 }}>
                {t.hero.sub}
              </p>

              {/* CTAs */}
              <div className="animate-fade-up animate-fade-up-delay-3 flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
                <a
                  href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer"
                  className="btn-gold inline-flex items-center justify-center gap-2 px-8 py-4"
                  style={{ fontFamily: "var(--app-font-display)", fontSize: 12, letterSpacing: "0.14em" }}
                >
                  {t.hero.cta1} <span style={{ fontSize: 18 }}>›</span>
                </a>
                <a
                  href="#features"
                  className="btn-gold-outline inline-flex items-center justify-center gap-2 px-8 py-4"
                  style={{ fontFamily: "var(--app-font-display)", fontSize: 12, letterSpacing: "0.14em" }}
                >
                  {t.hero.cta2}
                </a>
              </div>
            </div>

            {/* ── DIREITA: símbolo levitando + wordmark ── */}
            <div className="flex-shrink-0 flex items-center justify-center animate-fade-up animate-fade-up-delay-2" style={{ width: "clamp(280px, 42vw, 520px)" }}>
              <ParxisLogo width={Math.round(480)} mode="breath" />
            </div>

          </div>
        </div>

        {/* Linha dourada inferior */}
        <div className="absolute bottom-0 left-0 w-full h-px" style={{ background: "linear-gradient(90deg, transparent, rgba(242,184,23,0.18), transparent)" }} />
      </section>

      {/* ── PAIN POINTS ─────────────────────────────────────────────────── */}
      <section className="py-28" style={{ background: "linear-gradient(180deg, #0A0203 0%, #130406 50%, #0A0203 100%)" }}>
        <div className="container mx-auto px-6">
          <div className="text-center mb-16 max-w-2xl mx-auto">
            <p style={{ fontFamily: "var(--app-font-label)", fontSize: 10, letterSpacing: "0.28em", color: "var(--parxis-gold-deep)", textTransform: "uppercase", marginBottom: 16 }}>
              {lang === "pt" ? "O Problema" : "The Problem"}
            </p>
            <h2 style={{ fontFamily: "var(--app-font-serif)", fontSize: "clamp(28px, 4vw, 44px)", fontWeight: 700, marginBottom: 16, lineHeight: 1.2 }}>{t.pain.title}</h2>
            <p style={{ color: "var(--parxis-text-secondary)", lineHeight: 1.8, fontSize: 15 }}>{t.pain.sub}</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {t.pain.items.map((item, i) => (
              <div key={i} className="p-7" style={{ background: "linear-gradient(145deg, #1A0507, #120304)", border: "1px solid rgba(180,30,30,0.18)", borderTop: "2px solid rgba(200,40,40,0.35)" }}>
                <div style={{ fontFamily: "var(--app-font-label)", fontSize: 10, letterSpacing: "0.20em", color: "rgba(200,60,60,0.70)", marginBottom: 14, textTransform: "uppercase" }}>
                  {String(i + 1).padStart(2, "0")}
                </div>
                <h3 style={{ fontFamily: "var(--app-font-serif)", fontSize: 17, fontWeight: 600, marginBottom: 12, lineHeight: 1.3 }}>{item.title}</h3>
                <p style={{ color: "var(--parxis-text-muted)", lineHeight: 1.75, fontSize: 14 }}>{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURES — PARXIS 30 MÓDULOS ────────────────────────────────── */}
      <section id="features" className="py-32" style={{ background: "linear-gradient(180deg, #050505 0%, #0E0304 30%, #160507 60%, #0E0304 85%, #050505 100%)" }}>
        <div className="container mx-auto px-6">
          <div className="text-center mb-20 max-w-3xl mx-auto">
            <p style={{ fontFamily: "var(--app-font-label)", fontSize: 10, letterSpacing: "0.28em", color: "var(--parxis-gold-deep)", textTransform: "uppercase", marginBottom: 16 }}>
              {lang === "pt" ? "Recursos · Chapitre II" : "Resources · Chapter II"}
            </p>
            <h2 style={{ fontFamily: "var(--app-font-serif)", fontSize: "clamp(32px, 4.5vw, 54px)", fontWeight: 700, marginBottom: 16, lineHeight: 1.15 }}>{t.features.title}</h2>
            <div className="divider-gold w-40 mx-auto my-6" />
            <p style={{ color: "var(--parxis-text-secondary)", lineHeight: 1.8, fontSize: 15, maxWidth: 600, margin: "0 auto" }}>{t.features.sub}</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {t.features.items.map((feat, i) => (
              <div
                key={i}
                className="p-7"
                style={{ background: "linear-gradient(160deg, #1C0608 0%, #130404 100%)", border: "1px solid rgba(180,30,30,0.15)", borderTop: "none", borderLeft: "none", position: "relative", transition: "background 220ms" }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "linear-gradient(160deg, #240810 0%, #1A0506 100%)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "linear-gradient(160deg, #1C0608 0%, #130404 100%)"; }}
              >
                {/* Número */}
                <div style={{ fontFamily: "var(--app-font-label)", fontSize: 11, letterSpacing: "0.20em", color: "rgba(242,184,23,0.35)", marginBottom: 16 }}>{feat.num}</div>
                {/* Título */}
                <h3 style={{ fontFamily: "var(--app-font-serif)", fontSize: 17, fontWeight: 600, lineHeight: 1.3, color: "#F8F1DE", marginBottom: 12 }}>{feat.name}</h3>
                {/* Linha */}
                <div style={{ width: 28, height: 1, background: "rgba(242,184,23,0.30)", marginBottom: 14 }} />
                {/* Desc */}
                <p style={{ color: "var(--parxis-text-muted)", lineHeight: 1.75, fontSize: 13 }}>{feat.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PAWARDS MED CORE ────────────────────────────────────────────── */}
      <section className="py-32 relative overflow-hidden" style={{ background: "linear-gradient(180deg, #050505 0%, #0C0808 40%, #050505 100%)", borderTop: "1px solid rgba(242,184,23,0.08)", borderBottom: "1px solid rgba(242,184,23,0.08)" }}>
        <div className="absolute inset-0 pointer-events-none opacity-[0.025]" style={{ backgroundImage: "radial-gradient(circle, #F2B817 1px, transparent 1px)", backgroundSize: "48px 48px" }} />
        <div className="container mx-auto px-6 relative z-10">
          <div className="text-center mb-20 max-w-3xl mx-auto">
            <p style={{ fontFamily: "var(--app-font-label)", fontSize: 10, letterSpacing: "0.28em", color: "var(--parxis-gold-deep)", textTransform: "uppercase", marginBottom: 16 }}>
              {t.pawards.label} · Chapitre III
            </p>
            <h2 style={{ fontFamily: "var(--app-font-serif)", fontSize: "clamp(28px, 4vw, 50px)", fontWeight: 700, marginBottom: 20, lineHeight: 1.15 }}>
              {t.pawards.title}
            </h2>
            <div className="divider-gold w-40 mx-auto my-6" />
            <p style={{ color: "var(--parxis-text-secondary)", lineHeight: 1.8, fontSize: 15, maxWidth: 640, margin: "0 auto" }}>
              {t.pawards.sub}
            </p>
          </div>
          <div className="grid md:grid-cols-2 gap-4 max-w-5xl mx-auto">
            {t.pawards.items.map((item, i) => (
              <div key={i} className="p-7 flex items-start gap-5" style={{ background: "linear-gradient(145deg, #110E08, #090705)", border: "1px solid rgba(242,184,23,0.08)", borderLeft: "3px solid rgba(242,184,23,0.28)" }}>
                <span style={{ fontFamily: "var(--app-font-label)", fontSize: 14, color: "rgba(242,184,23,0.40)", minWidth: 28, paddingTop: 3, fontStyle: "italic" }}>
                  {item.num}
                </span>
                <div>
                  <h3 style={{ fontFamily: "var(--app-font-serif)", fontSize: 16, fontWeight: 600, color: "var(--parxis-gold-light)", marginBottom: 10, lineHeight: 1.3 }}>
                    {item.name}
                  </h3>
                  <p style={{ color: "var(--parxis-text-secondary)", lineHeight: 1.75, fontSize: 14 }}>
                    {item.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FLOW ────────────────────────────────────────────────────────── */}
      <section className="py-28" style={{ background: "var(--parxis-black-900)" }}>
        <div className="container mx-auto px-6">
          <div className="text-center mb-16">
            <p style={{ fontFamily: "var(--app-font-label)", fontSize: 10, letterSpacing: "0.28em", color: "var(--parxis-gold-deep)", textTransform: "uppercase", marginBottom: 14 }}>
              {lang === "pt" ? "Tecnologia · Chapitre IV" : "Technology · Chapter IV"}
            </p>
            <h2 style={{ fontFamily: "var(--app-font-serif)", fontSize: "clamp(26px, 3.5vw, 42px)", fontWeight: 700, marginBottom: 10, lineHeight: 1.2 }}>{t.flow.title}</h2>
            <p style={{ color: "var(--parxis-text-muted)", fontSize: 15 }}>{t.flow.sub}</p>
          </div>
          <div className="flex flex-col md:flex-row justify-between items-start gap-8 relative">
            <div className="hidden md:block absolute top-10 left-0 right-0 h-px" style={{ background: "linear-gradient(90deg, transparent, rgba(242,184,23,0.12), transparent)" }} />
            {t.flow.steps.map((s, i) => (
              <div key={i} className="flex flex-col items-center text-center flex-1 relative z-10 px-4">
                <div style={{ width: 60, height: 60, border: "1px solid rgba(242,184,23,0.22)", background: "radial-gradient(circle at 50% 30%, #1A0D05, #0A0504)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20, fontFamily: "var(--app-font-label)", fontSize: 16, letterSpacing: "0.04em", color: "var(--parxis-gold-medium)", fontStyle: "italic" }}>
                  {s.n}
                </div>
                <h4 style={{ fontFamily: "var(--app-font-serif)", fontSize: 15, fontWeight: 600, color: "var(--parxis-gold-light)", marginBottom: 8, lineHeight: 1.3 }}>{s.title}</h4>
                <p style={{ fontSize: 13, color: "var(--parxis-text-muted)", lineHeight: 1.7 }}>{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── AUDIENCE ────────────────────────────────────────────────────── */}
      <section className="py-28" style={{ background: "linear-gradient(180deg, #050505 0%, #0A0203 40%, #050505 100%)" }}>
        <div className="container mx-auto px-6">
          <div className="text-center mb-14">
            <p style={{ fontFamily: "var(--app-font-label)", fontSize: 10, letterSpacing: "0.28em", color: "var(--parxis-gold-deep)", textTransform: "uppercase", marginBottom: 14 }}>
              {lang === "pt" ? "Para Clínicas · Chapitre V" : "For Clinics · Chapter V"}
            </p>
            <h2 style={{ fontFamily: "var(--app-font-serif)", fontSize: "clamp(28px, 4vw, 46px)", fontWeight: 700, lineHeight: 1.15 }}>{t.audience.title}</h2>
          </div>
          <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
            <div className="p-9" style={{ background: "linear-gradient(145deg, #180608, #0E0304)", border: "1px solid rgba(242,184,23,0.10)", borderTop: "2px solid rgba(242,184,23,0.45)" }}>
              <h3 style={{ fontFamily: "var(--app-font-label)", fontSize: 11, letterSpacing: "0.20em", textTransform: "uppercase", color: "var(--parxis-gold-main)", marginBottom: 20 }}>{t.audience.yes.label}</h3>
              <ul className="space-y-4">
                {t.audience.yes.items.map((item, i) => (
                  <li key={i} className="flex items-start gap-3" style={{ color: "var(--parxis-text-secondary)", fontSize: 14, lineHeight: 1.65, fontFamily: "var(--app-font-sans)" }}>
                    <span style={{ color: "var(--parxis-gold-medium)", marginTop: 3, flexShrink: 0 }}>◆</span>{item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="p-9" style={{ background: "linear-gradient(145deg, #090909, #050505)", border: "1px solid rgba(255,255,255,0.05)", borderTop: "2px solid rgba(255,255,255,0.08)" }}>
              <h3 style={{ fontFamily: "var(--app-font-label)", fontSize: 11, letterSpacing: "0.20em", textTransform: "uppercase", color: "var(--parxis-text-muted)", marginBottom: 20 }}>{t.audience.no.label}</h3>
              <ul className="space-y-4">
                {t.audience.no.items.map((item, i) => (
                  <li key={i} className="flex items-start gap-3" style={{ color: "var(--parxis-text-muted)", fontSize: 14, lineHeight: 1.65, fontFamily: "var(--app-font-sans)" }}>
                    <span style={{ color: "rgba(255,255,255,0.18)", marginTop: 3, flexShrink: 0 }}>—</span>{item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA FINAL ───────────────────────────────────────────────────── */}
      <section className="py-32 relative overflow-hidden" style={{ background: "radial-gradient(ellipse at 50% 50%, #2C0D10 0%, #0A0505 45%, #050505 100%)" }}>
        <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse 50% 60% at 50% 50%, rgba(242,184,23,0.06) 0%, transparent 65%)" }} />
        <div className="container mx-auto px-6 relative z-10 flex flex-col items-center text-center">
          <ParxisLogo width={180} className="mb-12 opacity-90" />
          <div className="divider-gold w-40 mb-10" />
          <h2 style={{ fontFamily: "var(--app-font-serif)", fontSize: "clamp(28px, 4vw, 52px)", fontWeight: 700, marginBottom: 20, maxWidth: 700 }}>{t.cta.title}</h2>
          <p style={{ color: "var(--parxis-text-secondary)", fontSize: 16, lineHeight: 1.7, maxWidth: 560, marginBottom: 40 }}>{t.cta.sub}</p>
          <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" className="btn-gold inline-flex items-center gap-3 px-10 py-5" style={{ fontFamily: "var(--app-font-label)", fontSize: 12, letterSpacing: "0.14em" }}>
            {t.cta.btn} <span style={{ fontSize: 18 }}>›</span>
          </a>
        </div>
      </section>

      {/* ── FOOTER ──────────────────────────────────────────────────────── */}
      <footer style={{ background: "#030303", borderTop: "1px solid rgba(242,184,23,0.06)", padding: "40px 0" }}>
        <div className="container mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <ParxisWordmark fontSize={16} />
          <p style={{ fontFamily: "var(--app-font-serif)", fontSize: 12, color: "var(--parxis-text-muted)", letterSpacing: "0.10em", fontStyle: "italic" }}>{t.footer.tagline}</p>
          <p style={{ fontFamily: "var(--app-font-label)", fontSize: 10, color: "var(--parxis-text-muted)", letterSpacing: "0.14em", textTransform: "uppercase" }}>{t.footer.by}</p>
        </div>
      </footer>

    </div>
  );
}
