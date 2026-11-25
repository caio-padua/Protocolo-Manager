/**
 * Frases do assistente de agendamento do Telegram.
 *
 * Fonte de verdade em execução: tabela `telegram_frases` (editável na tela do CEO).
 * O mapa FRASES_PADRAO só semeia a tabela na primeira vez (ON CONFLICT DO NOTHING):
 * nunca sobrescreve texto que o CEO já editou. Se a leitura do banco falhar, o assistente
 * não responde (a equipe vê a mensagem na Central); não existe texto de reserva escondido.
 */
import { sql, type SQL } from "drizzle-orm";
import { db } from "@workspace/db";

export interface DefinicaoFrase {
  texto: string;
  grupo: string;
  descricao: string;
  /** Variáveis aceitas, escritas como {nome} no texto. */
  variaveis: string[];
  /** Variáveis que não podem faltar (carregam dado real, como a lista de horários). */
  obrigatorias?: string[];
}

export const FRASES_PADRAO = {
  atendimento_menu: { grupo: "Atendimento WhatsApp", descricao: "Menu operacional; manter os números vinculados às opções.", variaveis: [], texto: "Como posso ajudar?\n\n1 — Agendar consulta\n2 — Consultar meu agendamento ou retorno\n3 — Orçamento\n4 — Receitas, protocolos e documentos\n5 — Pedidos de exames\n6 — Falar com a equipe\n\nResponda com o número ou escreva o que precisa." },
  atendimento_abertura_livre: { grupo: "Atendimento WhatsApp", descricao: "Abertura conversacional usada quando o menu numerado está desativado; sem números nem lista de opções.", variaveis: [], texto: "Olá.\n\nPode me contar, com as suas palavras, o que você precisa?\n\nSe quiser marcar uma consulta, ver o seu agendamento, tratar de documentos ou falar com a equipe, é só escrever." },
  atendimento_pedido_equipe: { grupo: "Atendimento WhatsApp", descricao: "Enviada somente após registrar a pausa e aceitar o alerta da equipe; não confirma solução clínica.", variaveis: [], texto: "Sua solicitação foi registrada para atendimento da equipe.\n\nO atendimento automático desta conversa ficará pausado para que uma pessoa acompanhe seu pedido." },
  atendimento_consulta_agenda: { grupo: "Atendimento WhatsApp", descricao: "Compromissos próprios efetivamente encontrados; não promete direito a retorno.", variaveis: ["compromissos"], obrigatorias: ["compromissos"], texto: "Estes são os seus compromissos registrados na clínica:\n\n{compromissos}\n\nO registro de uma consulta não confirma gratuidade nem direito a retorno.\nPara conferir essas condições, escreva: falar com a equipe." },
  atendimento_endereco: { grupo: "Atendimento WhatsApp", descricao: "Endereço lido do cadastro vigente da própria clínica no momento da resposta; nunca guardado como texto fixo.", variaveis: ["endereco"], obrigatorias: ["endereco"], texto: "O endereço da clínica é:\n\n{endereco}\n\nSe precisar de mais alguma informação, é só escrever." },
  atendimento_esclarecer: { grupo: "Atendimento WhatsApp", descricao: "Pergunta curta quando a mensagem traz mais de um pedido operacional; nenhum pedido é descartado em silêncio.", variaveis: ["opcoes"], obrigatorias: ["opcoes"], texto: "Entendi mais de um pedido na sua mensagem:\n\n{opcoes}\n\nSobre qual deles você quer falar primeiro? Responda com uma frase curta." },
  atendimento_nao_reconhecida: { grupo: "Atendimento WhatsApp", descricao: "Encaminhamento institucional quando a pergunta não tem fonte autorizada; não é avaliação clínica.", variaveis: [], texto: "Recebi sua mensagem, mas não tenho uma resposta autorizada para essa pergunta.\n\nRegistrei o pedido para a equipe da clínica analisar. Esta mensagem não é uma avaliação clínica." },
  atendimento_falha_alerta: { grupo: "Atendimento WhatsApp", descricao: "Falha efetiva do alerta, sem fingir encaminhamento concluído.", variaveis: [], texto: "Sua mensagem está registrada nesta conversa, mas não consegui avisar a equipe automaticamente.\n\nNenhuma informação clínica foi criada ou alterada. O atendimento automático ficará pausado para conferência da equipe." },
  atendimento_apresentacao_instituto_padua: { grupo: "Abertura", descricao: "Apresentação operacional da Helena para saudações e perguntas de identidade no WhatsApp do Instituto Pádua.", variaveis: [], texto: "Olá!\n\nMe chamo Helena,\nAssistente virtual do Instituto Pádua.\n\nTudo bem?\n\nComo eu poderia te ajudar?" },
  orientacao_aprovada_indisponivel: { grupo: "Equipe", descricao: "Lacuna explícita quando nenhuma orientação clínica aprovada responde à pergunta.", variaveis: [], texto: "{nome_linha}Não encontrei uma orientação aprovada pela equipe clínica que responda à sua pergunta. Para não passar informação sem conferência, encaminhei sua dúvida à equipe de {clinica}. Nenhuma prescrição ou tratamento foi alterado." },
  apresentacao: { grupo: "Abertura", descricao: "Primeira frase: assistente virtual e clínica.", variaveis: [], texto: "{nome_linha}Sou a assistente virtual de {clinica}.\n\nTudo bem?" },
  apresentacao_sem_clinica: { grupo: "Abertura", descricao: "Primeira frase quando a clínica não tem nome cadastrado.", variaveis: [], texto: "{nome_linha}Sou a assistente virtual da clínica.\n\nTudo bem?" },
  assinatura: { grupo: "Abertura", descricao: "Assinatura no fim das mensagens importantes.", variaveis: [], texto: "Assistente virtual de {clinica}" },
  visitante_encaminhado: { grupo: "Abertura", descricao: "Quem não é cliente escreveu algo que não é pedido de consulta.", variaveis: [], texto: "Estou aqui à sua disposição.\n\nJá avisei a equipe sobre a sua mensagem, e ela responde por aqui.\n\nSe quiser marcar uma consulta agora, é só me dizer.\n\n{assinatura}" },
  queixa_visitante: { grupo: "Abertura", descricao: "Resposta a queixa de saúde de quem não é cliente. Nunca opina sobre saúde.", variaveis: ["apresentacao"], texto: "{apresentacao}\n\nRecebi a sua mensagem, e já avisei a equipe.\n\nEla responde por aqui, o mais rápido possível.\n\nSe for algo urgente, procure o pronto-socorro ou ligue 192 (SAMU).\n\n{assinatura}" },
  enviar_link_marcacao: { grupo: "Abertura", descricao: "Cliente pediu para marcar consulta: recebe o link de marcação.", variaveis: ["link"], obrigatorias: ["link"], texto: "Com todo prazer.\n\nPara marcar a sua consulta, é só acessar este link e escolher o melhor horário:\n\n{link}\n\nSe tiver qualquer dúvida, estou aqui.\n\n{assinatura}" },
  pergunta_ja_paciente: { grupo: "Quem é a pessoa", descricao: "Primeira pergunta para quem não está vinculado: já é cliente ou é a primeira vez.", variaveis: [], texto: "Para começar, uma pergunta rápida.\n\nVocê já é cliente da clínica, ou será a sua primeira consulta?" },
  vinculo_nao_entendido: { grupo: "Quem é a pessoa", descricao: "Não deu para entender se já é cliente.", variaveis: [], texto: "{nome_linha}Desculpe.\n\nNão entendi bem.\n\nVocê já se consultou com a gente, ou será a sua primeira vez?" },
  pedir_identidade: { grupo: "Quem é a pessoa", descricao: "Pede os dados para conferir o cadastro de quem diz já ser cliente.", variaveis: [], texto: "{nome_linha}Que bom ter você aqui.\n\nPara confirmar o seu cadastro, escreva numa só mensagem:\n\nO seu nome completo, os 4 primeiros números do seu CPF e o ano em que você nasceu." },
  identidade_formato: { grupo: "Quem é a pessoa", descricao: "A mensagem de confirmação veio incompleta.", variaveis: [], texto: "{nome_linha}Não consegui ler os dados.\n\nPode me enviar o nome completo, os 4 primeiros números do CPF e o ano de nascimento?" },
  identidade_nao_confirmada: { grupo: "Quem é a pessoa", descricao: "Os dados não bateram. Não diz qual dado errou.", variaveis: [], texto: "{nome_linha}Não consegui confirmar os seus dados com o cadastro.\n\nConfira com calma e me envie de novo: nome completo, 4 primeiros números do CPF e ano de nascimento." },
  identidade_encaminhada: { grupo: "Quem é a pessoa", descricao: "Falhou mais de uma vez: a equipe assume.", variaveis: [], texto: "{nome_linha}Não consegui confirmar o seu cadastro por aqui, e está tudo bem.\n\nEncaminhei a nossa conversa para a equipe, que responde por aqui.\n\n{assinatura}" },
  identidade_confirmada: { grupo: "Quem é a pessoa", descricao: "Cadastro conferido; segue para a modalidade.", variaveis: ["pergunta_modalidade"], texto: "{nome_linha}Cadastro conferido.\n\nObrigada.\n\n{pergunta_modalidade}" },
  pergunta_modalidade: { grupo: "Perguntas do agendamento", descricao: "Online ou presencial.", variaveis: [], texto: "A consulta seria online ou presencial?" },
  pergunta_preferencias: { grupo: "Perguntas do agendamento", descricao: "Dias e período preferidos.", variaveis: [], texto: "Quais dias da semana ficam melhores para você?\n\nE qual período: manhã, tarde ou noite?" },
  pergunta_periodo: { grupo: "Perguntas do agendamento", descricao: "Só falta o período.", variaveis: [], texto: "Qual período fica melhor para você: manhã, tarde ou noite?\n\nSe tanto faz, é só me dizer." },
  vamos_marcar: { grupo: "Perguntas do agendamento", descricao: "Início do agendamento.", variaveis: ["pergunta_modalidade"], texto: "Vamos marcar a sua consulta.\n\n{pergunta_modalidade}" },
  certo_modalidade: { grupo: "Perguntas do agendamento", descricao: "Confirma a modalidade e pergunta o que falta.", variaveis: ["modalidade", "pergunta"], obrigatorias: ["pergunta"], texto: "Certo.\n\nA consulta será {modalidade}.\n\n{pergunta}" },
  recomecar: { grupo: "Perguntas do agendamento", descricao: "A pessoa pediu para recomeçar.", variaveis: ["pergunta_modalidade"], texto: "{nome_linha}Sem problema.\n\nVamos recomeçar.\n\n{pergunta_modalidade}" },
  olhando_agenda: { grupo: "Horários", descricao: "Antes de mostrar os horários.", variaveis: [], texto: "Só um instante, vou olhar a agenda." },
  procurando_outras: { grupo: "Horários", descricao: "A pessoa recusou as opções.", variaveis: [], texto: "Sem problema.\n\nProcurei outras opções para você." },
  procurando_preferencia: { grupo: "Horários", descricao: "A pessoa mudou a preferência.", variaveis: [], texto: "Certo.\n\nVou procurar com essa preferência." },
  ofereceu_horarios: { grupo: "Horários", descricao: "Lista de horários livres reais.", variaveis: ["prefixo", "modalidade", "lista"], obrigatorias: ["lista"], texto: "{prefixo}\n\nEstes horários estão livres ({modalidade}):\n\n{lista}\n\nQual dessas opções fica melhor para você?\n\nSe preferir outros dias ou períodos, é só me dizer." },
  ofereceu_alternativas: { grupo: "Horários", descricao: "Nada na preferência; mostra outros horários livres.", variaveis: ["prefixo", "modalidade", "lista"], obrigatorias: ["lista"], texto: "{prefixo}\n\nNão há horário livre {modalidade} nessa preferência.\n\nMas estes outros estão livres:\n\n{lista}\n\nQual dessas opções fica melhor para você?\n\nSe preferir outros dias ou períodos, é só me dizer." },
  sem_horario_encaminhada: { grupo: "Horários", descricao: "Sem nenhum horário: a equipe procura.", variaveis: ["prefixo", "modalidade"], texto: "{prefixo}\n\nNão encontrei horário livre {modalidade} com essa preferência.\n\nEncaminhei o seu pedido para a equipe, que procura uma alternativa e responde por aqui.\n\n{assinatura}" },
  escolha_ambigua: { grupo: "Horários", descricao: "Mais de uma opção combina.", variaveis: [], texto: "{nome_linha}Mais de uma opção combina com o que você disse.\n\nPode me dizer qual delas prefere, com mais detalhe?" },
  escolha_nao_entendida: { grupo: "Horários", descricao: "Não entendeu qual opção.", variaveis: ["lista"], obrigatorias: ["lista"], texto: "{nome_linha}Desculpe.\n\nNão entendi qual opção você prefere.\n\nQual dessas opções fica melhor para você?\n\n{lista}\n\nSe preferir, me diga outros dias ou períodos, e eu procuro de novo." },
  encaminhada_sem_entendimento: { grupo: "Horários", descricao: "Três tentativas sem entender.", variaveis: [], texto: "{nome_linha}Não consegui entender a sua escolha.\n\nEncaminhei a conversa para a equipe, que responde por aqui.\n\n{assinatura}" },
  reservado: { grupo: "Resultado", descricao: "Reserva gravada de verdade.", variaveis: ["modalidade", "data", "hora", "local"], obrigatorias: ["data", "hora"], texto: "{nome_linha}Pronto.\n\nA sua consulta {modalidade} está reservada.\n\nData: {data}.\n\nHorário: {hora}.{local}\n\nA equipe da clínica acompanha esta conversa e confirma qualquer detalhe por aqui.\n\n{assinatura}" },
  limite_reservas: { grupo: "Resultado", descricao: "Limite de reservas em 24 horas.", variaveis: [], texto: "{nome_linha}Para novas reservas hoje, preciso da ajuda da equipe.\n\nEncaminhei o seu pedido, e ela responde por aqui.\n\n{assinatura}" },
  erro_reserva: { grupo: "Resultado", descricao: "Falha ao gravar a reserva.", variaveis: [], texto: "{nome_linha}Não consegui gravar essa reserva agora, então ela NÃO foi feita.\n\nEncaminhei para a equipe resolver, e ela responde por aqui.\n\n{assinatura}" },
  horario_ocupado: { grupo: "Resultado", descricao: "Alguém ocupou o horário no meio tempo.", variaveis: [], texto: "Esse horário acabou de ser ocupado por outra pessoa.\n\nNada foi reservado para você." },
  cancelar_remarcar: { grupo: "Resultado", descricao: "Cancelar ou remarcar vai para a equipe.", variaveis: [], texto: "Para cancelar ou remarcar uma consulta, vou encaminhar o seu pedido para a equipe.\n\nEla responde por aqui, assim que possível.\n\n{assinatura}" },
  pediu_pessoa: { grupo: "Resultado", descricao: "A pessoa pediu para falar com a equipe.", variaveis: [], texto: "Claro.\n\nJá avisei a equipe da clínica.\n\nEla responde por aqui, assim que possível.\n\n{assinatura}" },
  escolha_pede_nome: { grupo: "Pedido para a equipe", descricao: "Primeira vez: escolheu horário, falta o nome.", variaveis: ["escolha"], obrigatorias: ["escolha"], texto: "{nome_linha}Combinado.\n\nO horário escolhido foi: {escolha}.\n\nComo você ainda não tem cadastro, preciso de alguns dados para a equipe confirmar.\n\nQual é o seu nome completo?" },
  escolha_pede_telefone: { grupo: "Pedido para a equipe", descricao: "Cliente conferido: escolheu horário, falta o telefone.", variaveis: ["escolha"], obrigatorias: ["escolha"], texto: "{nome_linha}Combinado.\n\nO horário escolhido foi: {escolha}.\n\nQual é o seu telefone com DDD?\n\nAssim a equipe pode falar com você, se precisar." },
  pediu_nome_de_novo: { grupo: "Pedido para a equipe", descricao: "Nome incompleto.", variaveis: [], texto: "Preciso do nome completo, com nome e sobrenome, para a equipe registrar o seu pedido.\n\nPode escrever?" },
  pediu_telefone: { grupo: "Pedido para a equipe", descricao: "Depois do nome, pede o telefone.", variaveis: [], texto: "Obrigada.\n\nQual é o seu telefone com DDD?\n\nAssim a equipe pode falar com você, se precisar." },
  pediu_telefone_de_novo: { grupo: "Pedido para a equipe", descricao: "Telefone ilegível.", variaveis: [], texto: "Não consegui ler o telefone.\n\nPode me enviar com o DDD?" },
  pedido_registrado: { grupo: "Pedido para a equipe", descricao: "Pedido gravado (primeira vez). Deixa claro que NÃO está reservado.", variaveis: ["protocolo", "detalhe"], obrigatorias: ["protocolo"], texto: "{nome_linha}Anotei o seu pedido de agendamento (protocolo {protocolo}){detalhe}.\n\nAtenção: o horário ainda NÃO está reservado.\n\nA equipe vai conferir e confirmar com você por aqui.\n\nPode mandar outras dúvidas.\n\n{assinatura}" },
  pedido_registrado_cliente: { grupo: "Pedido para a equipe", descricao: "Pedido gravado (cliente com cadastro conferido). Deixa claro que NÃO está reservado.", variaveis: ["protocolo", "detalhe"], obrigatorias: ["protocolo"], texto: "{nome_linha}Anotei o seu pedido de agendamento (protocolo {protocolo}){detalhe}.\n\nSeus dados de cadastro foram conferidos.\n\nAtenção: o horário ainda NÃO está reservado.\n\nA equipe vai confirmar com você por aqui.\n\nPode mandar outras dúvidas.\n\n{assinatura}" },
  sem_orientacao_encaminhada: { grupo: "Equipe", descricao: "Mensagem editável quando o motor não encontra resposta aprovada e transfere o caso.", variaveis: [], texto: "{nome_linha}Recebi sua mensagem. A equipe de {clinica} vai responder por aqui assim que possível.\n\n{assinatura}" },
  documento_lista_reenvio: { grupo: "Documentos", descricao: "Pede para a pessoa escolher qual documento emitido deseja receber novamente.", variaveis: ["lista"], obrigatorias: ["lista"], texto: "Encontrei mais de um documento emitido para você:\n{lista}\nQual tipo ou data você quer receber?" },
  documento_simulacao_reenvio: { grupo: "Documentos", descricao: "Explica o resultado da segunda via simulada sem criar solicitação, cobrança ou envio.", variaveis: ["titulo"], obrigatorias: ["titulo"], texto: "Encontrei {titulo}. A segunda via exige uma confirmação explícita e as verificações de liberação. Esta simulação não criou solicitação, não enviou documento e não gerou cobrança." },
  documento_revisao_reenvio: { grupo: "Documentos", descricao: "Confirma que a equipe precisa revisar antes de qualquer cobrança ou envio.", variaveis: ["titulo"], obrigatorias: ["titulo"], texto: "Encontrei {titulo} e registrei sua solicitação. A equipe precisa conferir os critérios de liberação. Não vou enviar nem cobrar agora." },
  documento_oferta_reenvio_taxa: { grupo: "Documentos", descricao: "Apresenta taxa real e pede autorização explícita antes de qualquer cobrança.", variaveis: ["titulo", "taxa"], obrigatorias: ["titulo", "taxa"], texto: "Encontrei {titulo}.{taxa} Para confirmar a solicitação, responda somente “sim” ou “pode enviar”." },
  documento_oferta_reenvio_sem_taxa: { grupo: "Documentos", descricao: "Pede autorização explícita para a segunda via sem taxa.", variaveis: ["titulo"], obrigatorias: ["titulo"], texto: "Encontrei {titulo}. A segunda via está sem cobrança, sujeita às verificações de liberação. Para confirmar a solicitação, responda somente “sim” ou “pode enviar”." },
  documento_confirmacao_reenvio_invalida: { grupo: "Documentos", descricao: "Encaminha à equipe quando não existe uma oferta de segunda via válida.", variaveis: [], texto: "Não encontrei uma oferta válida aguardando confirmação. Vou pedir para a equipe conferir sua solicitação antes de enviar qualquer documento." },
  documento_reenvio_confirmado: { grupo: "Documentos", descricao: "Confirma que a equipe verificará a segunda via após a autorização da pessoa.", variaveis: [], texto: "Confirmado. Vou encaminhar seu pedido de segunda via para as verificações necessárias." },
  documento_reenvio_cancelado: { grupo: "Documentos", descricao: "Confirma que a segunda via não será enviada após a recusa da pessoa.", variaveis: [], texto: "Tudo bem. Não vou enviar a segunda via." },
  documento_lista_itens_receita: { grupo: "Documentos", descricao: "Lista os itens existentes no receituário mais recente.", variaveis: ["lista", "oferta"], obrigatorias: ["lista"], texto: "Seu receituário emitido mais recente contém:\n{lista}{oferta}" },
  documento_lista_formulas_receita: { grupo: "Documentos", descricao: "Pede que a pessoa escolha qual fórmula existente quer que a equipe explique.", variaveis: ["lista"], obrigatorias: ["lista"], texto: "Encontrei mais de uma fórmula no seu receituário:\n{lista}\nQual delas você quer que eu explique?" },
  documento_oferta_formula_reenvio: { grupo: "Documentos", descricao: "Explica como pedir a segunda via sem alterar a orientação clínica aprovada.", variaveis: [], texto: "Se quiser a segunda via deste receituário, responda somente “quero a segunda via”." },
  protocolo_lista_documentos: { grupo: "Documentos", descricao: "Pede para a pessoa escolher qual protocolo deseja que a equipe explique.", variaveis: ["lista"], obrigatorias: ["lista"], texto: "Encontrei mais de um protocolo ativo ou validado:\n{lista}\nQual deles você quer que eu explique?" },
  documento_reenvio_conferencia_cobranca: { grupo: "Documentos", descricao: "Explica que a equipe revisará antes de qualquer cobrança ou envio.", variaveis: [], texto: "A segunda via exige conferência da equipe antes de qualquer cobrança. Nenhuma cobrança foi criada e o documento ainda não foi enviado." },
  documento_reenvio_falha_cobranca: { grupo: "Documentos", descricao: "Orientação após resultado incerto na criação ou no envio de uma cobrança.", variaveis: [], texto: "Não consegui confirmar a criação ou o envio do link de pagamento. Não vou repetir a cobrança automaticamente; a equipe vai conferir antes de qualquer novo envio." },
  documento_reenvio_aguardando_revisao: { grupo: "Documentos", descricao: "Confirma que a equipe revisará o pedido antes da liberação.", variaveis: [], texto: "Recebi seu pedido. A equipe vai conferir os critérios de liberação. Não houve cobrança nem envio do documento." },
  documento_reenvio_aguardando_pagamento: { grupo: "Documentos", descricao: "Informa que o documento continua bloqueado até a clínica confirmar o pagamento.", variaveis: [], texto: "Recebi sua confirmação. O envio continua bloqueado até o pagamento da taxa administrativa ser confirmado pela clínica." },
  documento_reenvio_em_conferencia: { grupo: "Documentos", descricao: "Informa que o pedido permanece em conferência sem cobrança ou envio.", variaveis: [], texto: "Recebi seu pedido. Ele permanece em conferência; não houve cobrança nem envio do documento." },
  documento_link_seguro_whatsapp: { grupo: "Documentos", descricao: "Entrega o link seguro da segunda via pelo WhatsApp.", variaveis: ["titulo", "url"], obrigatorias: ["titulo", "url"], texto: "Segue o link seguro para acessar a segunda via de {titulo}. Ele fica válido por sete dias: {url}" },
  documento_link_seguro_telegram: { grupo: "Documentos", descricao: "Entrega o link seguro da segunda via pelo Telegram.", variaveis: ["titulo", "url"], obrigatorias: ["titulo", "url"], texto: "Segue o link seguro para acessar a segunda via de {titulo}. Ele fica válido por sete dias: <a href=\"{url}\">Abrir documento</a>." },
  whatsapp_identidade_nao_confirmada: { grupo: "Documentos", descricao: "Texto operacional cadastrado para o teste supervisionado: identidade ausente ou ambígua, com alerta aceito pela equipe.", variaveis: [], texto: "Não consegui confirmar com segurança o vínculo deste número ao cadastro da clínica. Nenhum documento foi enviado. A equipe foi avisada para conferir sua identificação." },
  whatsapp_identidade_alerta_indisponivel: { grupo: "Documentos", descricao: "Texto operacional cadastrado para o teste supervisionado: identidade não confirmada e alerta indisponível.", variaveis: [], texto: "Não consegui confirmar com segurança o vínculo deste número ao cadastro da clínica. Nenhum documento foi enviado. Também não consegui confirmar o aviso automático à equipe; entre em contato pelo canal habitual da clínica." },
  documento_original_nao_encontrado: { grupo: "Documentos", descricao: "Texto operacional: ausência de arquivo já emitido no cadastro e na clínica confirmados.", variaveis: [], texto: "Não localizei um documento já emitido que possa reenviar com segurança neste cadastro e nesta clínica. Nenhum documento foi enviado. A equipe foi avisada para conferir o registro." },
  documento_novo_ou_alteracao: { grupo: "Documentos", descricao: "Texto operacional: distingue segunda via de criação, renovação ou alteração de prescrição.", variaveis: [], texto: "Uma receita nova, renovada ou alterada precisa de avaliação e assinatura do médico. Isso não é uma segunda via do arquivo existente. Encaminhei seu pedido à equipe; nenhuma prescrição foi criada ou alterada automaticamente." },
  negociacao_inicio: { grupo: "Negociação", descricao: "Minuto 0 da cadência: cliente pediu condição melhor dentro dos limites; avisa que o caso segue para análise da gestão financeira. Não promete valor.", variaveis: ["gerente"], texto: "{nome_linha}Entendi o seu pedido.\n\nVou levar o seu caso para a gestão financeira analisar.\n\nRetorno com uma resposta em instantes." },
  negociacao_andamento_10: { grupo: "Negociação", descricao: "Minuto 10 da cadência: andamento. Texto honesto: análise em curso, sem afirmar reunião que não houve.", variaveis: ["gerente"], texto: "{nome_linha}Seu caso segue em análise pela gestão financeira.\n\nAinda estou conferindo as condições possíveis para você." },
  negociacao_andamento_20: { grupo: "Negociação", descricao: "Minuto 20 da cadência: andamento. Números em fechamento.", variaveis: ["gerente"], texto: "{nome_linha}Os números do seu caso estão sendo fechados.\n\nEm poucos minutos envio a proposta final." },
  negociacao_proposta_final: { grupo: "Negociação", descricao: "Minuto 30: proposta final. {proposta} vem do motor de orçamento (nunca de IA). Texto declara a autorização dentro dos limites definidos pela gestão.", variaveis: ["gerente", "proposta"], obrigatorias: ["proposta"], texto: "{nome_linha}Conforme os limites definidos pela gestão financeira ({gerente}), consegui autorizar uma condição excepcional para você:\n\n{proposta}\n\nSe fizer sentido, me responda e sigo com o seu atendimento." },
  negociacao_aguarda_gestao: { grupo: "Negociação", descricao: "Pedido fora dos limites automáticos: só registra e avisa a equipe humana; não afirma consulta ao gerente.", variaveis: [], texto: "{nome_linha}Recebi o seu pedido de condição especial.\n\nEle precisa de uma análise da gestão financeira, e a equipe vai retornar por aqui." },
  negociacao_gestao_aprovou: { grupo: "Negociação", descricao: "Enviada SÓ depois de aprovação humana real registrada no sistema.", variaveis: ["gerente", "proposta"], obrigatorias: ["proposta"], texto: "{nome_linha}A gestão financeira ({gerente}) analisou o seu caso e autorizou esta condição:\n\n{proposta}\n\nSe fizer sentido, me responda e sigo com o seu atendimento." },
  negociacao_pausada_cliente: { grupo: "Negociação", descricao: "Cliente escreveu durante a cadência: pausa a automação e passa para a equipe.", variaveis: [], texto: "{nome_linha}Recebi a sua mensagem.\n\nVou passar o seu caso para a equipe acompanhar de perto." },
} as const satisfies Record<string, DefinicaoFrase>;

/** Variáveis que valem em TODAS as frases (preenchidas pelo sistema). */
export const VARIAVEIS_GLOBAIS = ["nome_linha", "clinica", "assinatura"] as const;

export type ChaveFrase = keyof typeof FRASES_PADRAO;
export type MapaFrases = Record<ChaveFrase, string>;
export type FraseDeps = (chave: ChaveFrase, vars?: Record<string, string>) => string;

export function substituir(texto: string, vars: Record<string, string> = {}): string {
  return texto.replace(/\{(\w+)\}/g, (_m, k: string) => (k in vars ? vars[k] : `{${k}}`));
}

/** Monta a função de frases a partir de um mapa já carregado. Chave ausente é erro explícito. */
export function criarFrase(mapa: Partial<Record<ChaveFrase, string>>): FraseDeps {
  return (chave, vars) => {
    const t = mapa[chave];
    if (typeof t !== "string") throw new Error(`frase ausente: ${chave}`);
    return substituir(t, vars);
  };
}

/** "Carlucia,\n\n" quando o nome é conhecido; vazio quando não (frases não dependem do sexo da pessoa). */
export function linhaDoNome(nome?: string | null): string {
  const n = nome?.trim();
  return n ? `${n},\n\n` : "";
}

/** Acrescenta às frases as variáveis globais: nome da pessoa, clínica e assinatura (esta última também é uma frase cadastrada). */
export function comGlobais(base: FraseDeps, g: { clinica?: string | null; primeiroNome?: string | null }): FraseDeps {
  const clinica = g.clinica?.trim() || "nossa clínica";
  const assinatura = base("assinatura", { clinica });
  return (chave, vars) => base(chave, { clinica, nome_linha: linhaDoNome(g.primeiroNome), assinatura, ...vars });
}

export function mapaPadrao(): MapaFrases {
  return Object.fromEntries(Object.entries(FRASES_PADRAO).map(([k, v]) => [k, v.texto])) as MapaFrases;
}

/** Valida texto editado: só variáveis aceitas, obrigatórias presentes, tamanho limitado. */
export function validarTextoFrase(chave: string, texto: unknown): string | null {
  const def = (FRASES_PADRAO as Record<string, DefinicaoFrase>)[chave];
  if (!def) return "frase desconhecida";
  if (typeof texto !== "string" || texto.trim().length < 3) return "texto muito curto";
  if (texto.length > 1000) return "texto acima de 1000 caracteres";
  const usadas = [...texto.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
  const estranha = usadas.find((u) => !def.variaveis.includes(u) && !(VARIAVEIS_GLOBAIS as readonly string[]).includes(u));
  if (estranha) return `variável {${estranha}} não existe nesta frase`;
  if (chave === "assinatura" && usadas.includes("assinatura")) return "a assinatura não pode usar {assinatura}";
  const falta = (def.obrigatorias ?? []).find((o) => !usadas.includes(o));
  if (falta) return `a variável {${falta}} é obrigatória nesta frase`;
  return null;
}

export async function semearFrases(exec: { execute: (q: SQL) => Promise<unknown> }): Promise<void> {
  await exec.execute(sql`CREATE TABLE IF NOT EXISTS telegram_frases (
    chave TEXT PRIMARY KEY, texto TEXT NOT NULL, atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(), atualizado_por INTEGER)`);
  for (const [chave, def] of Object.entries(FRASES_PADRAO)) {
    await exec.execute(sql`INSERT INTO telegram_frases (chave, texto) VALUES (${chave}, ${def.texto}) ON CONFLICT (chave) DO NOTHING`);
  }
  // Atualiza apenas os textos originais com nome fixo; preserva qualquer edição humana.
  const apresentacaoAntiga = "{nome_linha}Eu me chamo Helena, assistente de {clinica}.\n\nTudo bem?";
  const apresentacaoSemClinicaAntiga = "{nome_linha}Eu me chamo Helena, assistente virtual da clínica.\n\nTudo bem?";
  const assinaturaAntiga = "Helena\nAssistente de {clinica}";
  await exec.execute(sql`UPDATE telegram_frases SET texto=${FRASES_PADRAO.apresentacao.texto}
    WHERE chave='apresentacao' AND texto=${apresentacaoAntiga}`);
  // Saudação da Helena: troca somente o texto padrão anterior pelo aprovado; edição humana é preservada.
  const helenaAntiga = "Olá !\n\nMe chamo Helena,\nAssistente virtual do Instituto Pádua.\n\nTudo bem ?\nComo eu poderia te ajudar?";
  await exec.execute(sql`UPDATE telegram_frases SET texto=${FRASES_PADRAO.atendimento_apresentacao_instituto_padua.texto}
    WHERE chave='atendimento_apresentacao_instituto_padua' AND texto=${helenaAntiga}`);
  await exec.execute(sql`UPDATE telegram_frases SET texto=${FRASES_PADRAO.apresentacao_sem_clinica.texto}
    WHERE chave='apresentacao_sem_clinica' AND texto=${apresentacaoSemClinicaAntiga}`);
  await exec.execute(sql`UPDATE telegram_frases SET texto=${FRASES_PADRAO.assinatura.texto}
    WHERE chave='assinatura' AND texto=${assinaturaAntiga}`);
}

/** Lê do banco. Qualquer chave faltando derruba a leitura (o chamador não responde, a equipe assume). */
export async function carregarFrases(): Promise<FraseDeps> {
  const r = await db.execute(sql`SELECT chave, texto FROM telegram_frases`);
  const mapa: Partial<Record<ChaveFrase, string>> = {};
  for (const row of r.rows as Array<{ chave: string; texto: string }>) mapa[row.chave as ChaveFrase] = row.texto;
  const falta = (Object.keys(FRASES_PADRAO) as ChaveFrase[]).find((k) => typeof mapa[k] !== "string");
  if (falta) throw new Error(`frase ausente no banco: ${falta}`);
  return criarFrase(mapa);
}

export async function listarFrases(): Promise<Array<{ chave: string; grupo: string; descricao: string; variaveis: string[]; obrigatorias: string[]; texto: string; padrao: string; atualizadoEm: string | null }>> {
  const r = await db.execute(sql`SELECT chave, texto, atualizado_em FROM telegram_frases`);
  const por = new Map((r.rows as Array<{ chave: string; texto: string; atualizado_em: string | null }>).map((x) => [x.chave, x]));
  return Object.entries(FRASES_PADRAO).map(([chave, d]) => {
    const def = d as DefinicaoFrase;
    return { chave, grupo: def.grupo, descricao: def.descricao, variaveis: [...def.variaveis, ...VARIAVEIS_GLOBAIS.filter((v) => !def.variaveis.includes(v))], obrigatorias: def.obrigatorias ?? [], texto: por.get(chave)?.texto ?? def.texto, padrao: def.texto, atualizadoEm: por.get(chave)?.atualizado_em ?? null };
  });
}

export async function gravarFrase(chave: string, texto: string, porProfissional: number | null): Promise<void> {
  await db.execute(sql`INSERT INTO telegram_frases (chave, texto, atualizado_por) VALUES (${chave}, ${texto}, ${porProfissional})
    ON CONFLICT (chave) DO UPDATE SET texto=EXCLUDED.texto, atualizado_em=NOW(), atualizado_por=EXCLUDED.atualizado_por`);
}
