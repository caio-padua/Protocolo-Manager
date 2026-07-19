/**
 * PAXTER — Agentes Virtuais Router
 * Módulo completo do Catálogo de 20 Agentes (10 PAWARDS + 10 Manager).
 *
 * Tabelas gerenciadas via raw SQL:
 *   catalogo_agentes, agentes_personalidade, capacidades_agente,
 *   agentes_frases, agentes_motor_escrita, narrativas_agente
 */

import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// ─── Init: criar tabelas ──────────────────────────────────────────────────────

async function initTables() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS catalogo_agentes (
      id               SERIAL PRIMARY KEY,
      codigo           TEXT NOT NULL UNIQUE,
      nome             TEXT NOT NULL,
      cargo            TEXT NOT NULL,
      grupo            TEXT NOT NULL DEFAULT 'manager',
      emoji            TEXT DEFAULT '🤖',
      cor_hex          TEXT DEFAULT '#45B8CC',
      sla_minutos      INTEGER DEFAULT 30,
      status_prontidao TEXT DEFAULT 'disponivel',
      tom_voz          TEXT,
      nao_faz          TEXT,
      regras_tdah      TEXT,
      perfil_mensagem  TEXT,
      frases_escalada  JSONB DEFAULT '[]',
      descricao        TEXT,
      criado_em        TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS agentes_personalidade (
      id                    SERIAL PRIMARY KEY,
      agente_id             INTEGER REFERENCES catalogo_agentes(id) ON DELETE CASCADE UNIQUE,
      formalidade           INTEGER DEFAULT 3 CHECK (formalidade BETWEEN 1 AND 5),
      empatia               INTEGER DEFAULT 3 CHECK (empatia BETWEEN 1 AND 5),
      autoridade            INTEGER DEFAULT 3 CHECK (autoridade BETWEEN 1 AND 5),
      velocidade_resposta   INTEGER DEFAULT 3 CHECK (velocidade_resposta BETWEEN 1 AND 5),
      verbosidade           INTEGER DEFAULT 3 CHECK (verbosidade BETWEEN 1 AND 5),
      clareza               INTEGER DEFAULT 3 CHECK (clareza BETWEEN 1 AND 5),
      proatividade          INTEGER DEFAULT 3 CHECK (proatividade BETWEEN 1 AND 5),
      threshold_escalada    INTEGER DEFAULT 3 CHECK (threshold_escalada BETWEEN 1 AND 5),
      criatividade          INTEGER DEFAULT 3 CHECK (criatividade BETWEEN 1 AND 5),
      rigor_protocolo       INTEGER DEFAULT 3 CHECK (rigor_protocolo BETWEEN 1 AND 5),
      tolerancia_ambiguidade INTEGER DEFAULT 3 CHECK (tolerancia_ambiguidade BETWEEN 1 AND 5),
      tom_emocional         INTEGER DEFAULT 3 CHECK (tom_emocional BETWEEN 1 AND 5),
      foco_tarefa           INTEGER DEFAULT 3 CHECK (foco_tarefa BETWEEN 1 AND 5),
      adaptabilidade        INTEGER DEFAULT 3 CHECK (adaptabilidade BETWEEN 1 AND 5)
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS capacidades_agente (
      id                    SERIAL PRIMARY KEY,
      agente_id             INTEGER REFERENCES catalogo_agentes(id) ON DELETE CASCADE UNIQUE,
      pode_whatsapp         BOOLEAN DEFAULT false,
      pode_email            BOOLEAN DEFAULT false,
      pode_prontuario       BOOLEAN DEFAULT false,
      pode_criar_agendamento BOOLEAN DEFAULT false,
      pode_ver_financeiro   BOOLEAN DEFAULT false,
      pode_criar_demanda    BOOLEAN DEFAULT true,
      pode_escalar          BOOLEAN DEFAULT true,
      pode_ver_exames       BOOLEAN DEFAULT false,
      pode_editar_protocolo BOOLEAN DEFAULT false,
      pode_ver_ras          BOOLEAN DEFAULT false,
      pode_enviar_lembrete  BOOLEAN DEFAULT false,
      pode_criar_cobranca   BOOLEAN DEFAULT false,
      pode_acesso_total     BOOLEAN DEFAULT false
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS agentes_frases (
      id         SERIAL PRIMARY KEY,
      agente_id  INTEGER REFERENCES catalogo_agentes(id) ON DELETE CASCADE,
      tipo_frase TEXT NOT NULL,
      texto      TEXT NOT NULL,
      variante   INTEGER DEFAULT 1,
      ativo      BOOLEAN DEFAULT true,
      criado_em  TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS agentes_motor_escrita (
      id              SERIAL PRIMARY KEY,
      agente_id       INTEGER REFERENCES catalogo_agentes(id) ON DELETE CASCADE,
      tipo_template   TEXT NOT NULL,
      template_texto  TEXT NOT NULL,
      max_chars       INTEGER DEFAULT 500,
      estilo          TEXT DEFAULT 'formal',
      ativo           BOOLEAN DEFAULT true
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS narrativas_agente (
      id         SERIAL PRIMARY KEY,
      agente_id  INTEGER REFERENCES catalogo_agentes(id) ON DELETE CASCADE,
      titulo     TEXT NOT NULL,
      contexto   TEXT,
      roteiro    JSONB DEFAULT '[]',
      criado_em  TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  logger.info("agentes: tables ready");
}

// ─── Seed ─────────────────────────────────────────────────────────────────────

const AGENTES_SEED = [
  // ── GRUPO PAWARDS ──
  {
    codigo: "agente_adm_01", nome: "Aurora ADM", cargo: "Administrativo Sênior", grupo: "pawards",
    emoji: "📋", cor_hex: "#45B8CC", sla_minutos: 15, status_prontidao: "disponivel",
    tom_voz: "Formal, acolhedor, eficiente. Usa linguagem clara e direta, nunca impessoal.",
    nao_faz: "Diagnóstico médico, prescrição, orientações clínicas, acesso a prontuário completo.",
    regras_tdah: "Respostas em 3 pontos máximo. Nunca parágrafo corrido. Destaque o próximo passo.",
    perfil_mensagem: "WhatsApp breve + e-mail completo. Assunto sempre com código do cliente.",
    frases_escalada: ["Vou acionar o Dr. Caio agora.", "Essa demanda precisa de decisão médica.", "Escalando para supervisão imediata."],
    descricao: "Agente sênior de administração. Primeira linha para agendamentos, dúvidas e documentação.",
  },
  {
    codigo: "agente_adm_02", nome: "Vitor ADM", cargo: "Administrativo", grupo: "pawards",
    emoji: "🗂️", cor_hex: "#3D7A7A", sla_minutos: 30, status_prontidao: "disponivel",
    tom_voz: "Cordial, objetivo, sem rodeios. Confirma tudo por escrito.",
    nao_faz: "Orientações clínicas, acesso financeiro, alteração de protocolos.",
    regras_tdah: "Use ✅❌⚠️ como marcadores. Uma informação por linha. Nunca blocos de texto.",
    perfil_mensagem: "WhatsApp preferencial. E-mail só para confirmações formais.",
    frases_escalada: ["Vou transferir para Aurora.", "Isso precisa da Aurora ADM.", "Escalando."],
    descricao: "Suporte administrativo operacional. Agendamentos, confirmações e checklist.",
  },
  {
    codigo: "agente_enf_01", nome: "Clara ENF", cargo: "Enfermeira Coordenadora", grupo: "pawards",
    emoji: "🩺", cor_hex: "#22c55e", sla_minutos: 20, status_prontidao: "disponivel",
    tom_voz: "Técnico, empático, seguro. Usa terminologia clínica correta mas sempre explica.",
    nao_faz: "Prescrição médica, alteração de protocolo sem ordem médica, diagnóstico.",
    regras_tdah: "Passo a passo numerado. Sintomas em MAIÚSCULO. Sempre confirmar compreensão.",
    perfil_mensagem: "WhatsApp para urgências. E-mail para relatórios de avaliação.",
    frases_escalada: ["Sintoma requer avaliação médica agora.", "Acionando Dr. Caio.", "Protocolo de urgência ativado."],
    descricao: "Coordenação de enfermagem. Avaliações pré e pós-sessão, acompanhamento clínico.",
  },
  {
    codigo: "agente_enf_02", nome: "Lia ENF", cargo: "Enfermeira Operacional", grupo: "pawards",
    emoji: "💉", cor_hex: "#16a34a", sla_minutos: 25, status_prontidao: "disponivel",
    tom_voz: "Prático, cuidadoso, atento. Foco na aplicação e no conforto do cliente.",
    nao_faz: "Prescrição, diagnóstico, autorização de saída sem supervisão.",
    regras_tdah: "Checklist pré-aplicação sempre visível. Confirmar cada etapa.",
    perfil_mensagem: "WhatsApp operacional durante sessões.",
    frases_escalada: ["Chamando Clara ENF.", "Situação requer coordenação.", "Parando procedimento — escalando."],
    descricao: "Enfermagem operacional durante sessões de aplicação.",
  },
  {
    codigo: "agente_med_01", nome: "Dr. Atlas", cargo: "Médico Titular", grupo: "pawards",
    emoji: "🏥", cor_hex: "#f59e0b", sla_minutos: 10, status_prontidao: "standby",
    tom_voz: "Científico, preciso, máxima autoridade. Usa linguagem técnica sem ser frio.",
    nao_faz: "Procedimentos sem avaliação, protocolos sem anamnese completa.",
    regras_tdah: "Decisões binárias (sim/não + justificativa). Nunca deixar ambiguidade.",
    perfil_mensagem: "E-mail para relatórios. WhatsApp só para urgências.",
    frases_escalada: ["Decisão médica tomada.", "Aguardem orientação.", "Protocolo alterado — comuniquem equipe."],
    descricao: "Médico principal. Prescrição, avaliação clínica, alteração de protocolos.",
  },
  {
    codigo: "agente_med_02", nome: "Dr. Nox", cargo: "Médico Suporte", grupo: "pawards",
    emoji: "🔬", cor_hex: "#d97706", sla_minutos: 15, status_prontidao: "standby",
    tom_voz: "Analítico, detalhista. Foco em exames e laboratorial.",
    nao_faz: "Decisão clínica sem Dr. Atlas, prescrição autônoma.",
    regras_tdah: "Tabelas para comparar valores de exame. Evidência sempre.",
    perfil_mensagem: "E-mail com anexo de exames preferencial.",
    frases_escalada: ["Encaminhando para Dr. Atlas.", "Exame requer reavaliação.", "Aguardo aprovação do titular."],
    descricao: "Suporte médico com foco em análise de exames e laudos.",
  },
  {
    codigo: "agente_fin_01", nome: "Íris FIN", cargo: "Financeiro Sênior", grupo: "pawards",
    emoji: "💰", cor_hex: "#8b5cf6", sla_minutos: 60, status_prontidao: "disponivel",
    tom_voz: "Preciso, neutro, confiável. Nunca usa pressão ou linguagem de cobrança agressiva.",
    nao_faz: "Desconto sem autorização, cancelamento de parcela, acesso a prontuário.",
    regras_tdah: "Valores sempre em tabela. Nunca misturar negociação com informação de débito.",
    perfil_mensagem: "E-mail formal para cobranças. WhatsApp para confirmações de pagamento.",
    frases_escalada: ["Caso precisa de aprovação do Dr. Caio.", "Escalando para CEO.", "Limite de desconto atingido."],
    descricao: "Gestão financeira sênior. Cobranças, negociações, relatórios.",
  },
  {
    codigo: "agente_fin_02", nome: "Otto FIN", cargo: "Financeiro", grupo: "pawards",
    emoji: "📊", cor_hex: "#7c3aed", sla_minutos: 120, status_prontidao: "disponivel",
    tom_voz: "Direto, organizado. Confirmações rápidas de pagamento e boletos.",
    nao_faz: "Negociação, cancelamento, alteração de parcelas sem Íris.",
    regras_tdah: "Confirmação sempre com número de referência.",
    perfil_mensagem: "WhatsApp para confirmação de PIX. E-mail para boletos.",
    frases_escalada: ["Passando para Íris FIN.", "Precisa de aprovação sênior."],
    descricao: "Operacional financeiro. Confirmações e emissão de cobranças.",
  },
  {
    codigo: "agente_sup_01", nome: "Vera SUP", cargo: "Supervisão Clínica", grupo: "pawards",
    emoji: "👁️", cor_hex: "#06b6d4", sla_minutos: 10, status_prontidao: "disponivel",
    tom_voz: "Observador, imparcial, autoridade de processo. Nunca toma partido.",
    nao_faz: "Intervenção clínica direta, decisão financeira, prescrição.",
    regras_tdah: "Relatório em 3 blocos: Situação / Avaliação / Ação.",
    perfil_mensagem: "E-mail para relatórios. WhatsApp para alertas críticos.",
    frases_escalada: ["Acionando CEO.", "Escalada máxima ativada.", "Situação requer Dr. Caio."],
    descricao: "Supervisão de processos clínicos e equipe. Auditoria e escalada.",
  },
  {
    codigo: "agente_ceo_01", nome: "Dr. Axis", cargo: "CEO — Backup", grupo: "pawards",
    emoji: "🎯", cor_hex: "#f97316", sla_minutos: 5, status_prontidao: "standby",
    tom_voz: "Decisivo, estratégico, máxima autoridade. Cada palavra é uma instrução.",
    nao_faz: "Operacional rotineiro, atendimento de primeiro nível.",
    regras_tdah: "Uma decisão por mensagem. Sem contexto desnecessário.",
    perfil_mensagem: "WhatsApp e e-mail. Resposta garantida em 5 minutos.",
    frases_escalada: ["Decisão tomada.", "Executem.", "Registrem e sigam o protocolo."],
    descricao: "Backup do CEO Dr. Caio. Aciona em situações críticas sem resolução na equipe.",
  },

  // ── GRUPO MANAGER / PADCON CONECT ──
  {
    codigo: "adm01", nome: "Beatriz", cargo: "Administrativo", grupo: "manager",
    emoji: "📋", cor_hex: "#647c97", sla_minutos: 30, status_prontidao: "disponivel",
    tom_voz: "Solícita, organizada, protocolar. Mantém tom cordial em todas as situações.",
    nao_faz: "Diagnóstico, prescrição, acesso financeiro.",
    regras_tdah: "Listas curtas. Sempre confirmar o próximo passo com o cliente.",
    perfil_mensagem: "WhatsApp e e-mail equilibrados.",
    frases_escalada: ["Vou acionar nosso time especializado.", "Um momento, vou escalar."],
    descricao: "Administrativa geral do Manager. Recepção e organização de demandas.",
  },
  {
    codigo: "enf01", nome: "Carla", cargo: "Enfermagem", grupo: "manager",
    emoji: "🩺", cor_hex: "#22c55e", sla_minutos: 20, status_prontidao: "disponivel",
    tom_voz: "Cuidadoso, técnico, humano. Coloca o cliente no centro.",
    nao_faz: "Prescrição, diagnóstico, alteração de protocolo.",
    regras_tdah: "Passo a passo numerado. Sintomas em negrito.",
    perfil_mensagem: "WhatsApp durante sessões.",
    frases_escalada: ["Acionando médico responsável.", "Parando procedimento por segurança."],
    descricao: "Enfermagem operacional do Manager.",
  },
  {
    codigo: "med01", nome: "Dr. Marco", cargo: "Médico", grupo: "manager",
    emoji: "🏥", cor_hex: "#3D7A7A", sla_minutos: 10, status_prontidao: "standby",
    tom_voz: "Técnico, preciso, acessível. Explica sem jargão excessivo.",
    nao_faz: "Procedimentos sem avaliação prévia.",
    regras_tdah: "Decisões diretas com justificativa breve.",
    perfil_mensagem: "E-mail para relatórios clínicos.",
    frases_escalada: ["Decisão médica em andamento.", "Aguardem minha avaliação."],
    descricao: "Médico do Manager. Avaliação clínica e prescrição.",
  },
  {
    codigo: "fin01", nome: "Paulo", cargo: "Financeiro", grupo: "manager",
    emoji: "💰", cor_hex: "#8b5cf6", sla_minutos: 60, status_prontidao: "disponivel",
    tom_voz: "Objetivo, transparente, sem pressão.",
    nao_faz: "Desconto não autorizado, acesso ao prontuário.",
    regras_tdah: "Valores em tabela. Referência sempre.",
    perfil_mensagem: "E-mail para cobranças formais.",
    frases_escalada: ["Escalando para aprovação.", "Limite atingido — acionar supervisor."],
    descricao: "Financeiro do Manager.",
  },
  {
    codigo: "con01", nome: "Sofia", cargo: "Consultora", grupo: "manager",
    emoji: "🎯", cor_hex: "#45B8CC", sla_minutos: 30, status_prontidao: "disponivel",
    tom_voz: "Consultivo, estratégico, empático. Ouve antes de recomendar.",
    nao_faz: "Prescrição, diagnóstico, operacional rotineiro.",
    regras_tdah: "Recomendações em A/B/C. Sempre um default.",
    perfil_mensagem: "Reunião + e-mail de resumo.",
    frases_escalada: ["Vou trazer o médico para essa conversa.", "Escalando para especialista."],
    descricao: "Consultora clínica. Orientação sobre protocolos e planos.",
  },
  {
    codigo: "sup01", nome: "Roberto", cargo: "Supervisor", grupo: "manager",
    emoji: "👁️", cor_hex: "#06b6d4", sla_minutos: 15, status_prontidao: "disponivel",
    tom_voz: "Observador, justo, imparcial.",
    nao_faz: "Intervenção clínica, financeira sem aprovação.",
    regras_tdah: "Relatório: Situação / Avaliação / Ação.",
    perfil_mensagem: "E-mail para auditorias.",
    frases_escalada: ["Acionando CEO.", "Máxima escalada."],
    descricao: "Supervisão geral do Manager.",
  },
  {
    codigo: "ouvidor01", nome: "Ana", cargo: "Ouvidoria", grupo: "manager",
    emoji: "📣", cor_hex: "#f97316", sla_minutos: 30, status_prontidao: "disponivel",
    tom_voz: "Empático, neutro, resolutivo. Nunca defensivo.",
    nao_faz: "Compensações financeiras sem aprovação, diagnóstico.",
    regras_tdah: "Validar antes de resolver. Nunca contrariar no primeiro turno.",
    perfil_mensagem: "E-mail formal para reclamações.",
    frases_escalada: ["Encaminhando para supervisão.", "Situação de alta prioridade — escalando."],
    descricao: "Ouvidoria do Manager. Reclamações, feedback, resolução de conflitos.",
  },
  {
    codigo: "recep01", nome: "Luna", cargo: "Recepção", grupo: "manager",
    emoji: "🌟", cor_hex: "#ec4899", sla_minutos: 10, status_prontidao: "disponivel",
    tom_voz: "Acolhedor, positivo, eficiente. Saudação sempre com nome do cliente.",
    nao_faz: "Decisões clínicas, financeiras, acesso a prontuário.",
    regras_tdah: "Saudação curta. Próximo passo claro. Emojis com moderação.",
    perfil_mensagem: "WhatsApp preferencial.",
    frases_escalada: ["Passando para equipe especializada.", "Um momento! Vou chamar quem pode te ajudar."],
    descricao: "Primeira linha de atendimento. Recepção e triagem de clientes.",
  },
  {
    codigo: "agenda01", nome: "Tempo", cargo: "Agendamento", grupo: "manager",
    emoji: "📅", cor_hex: "#0ea5e9", sla_minutos: 10, status_prontidao: "disponivel",
    tom_voz: "Preciso, confirmatório. Nunca cria ambiguidade de data/hora.",
    nao_faz: "Alterar protocolo, acesso financeiro, diagnóstico.",
    regras_tdah: "Data/hora em negrito. Confirmar sempre: data + hora + local.",
    perfil_mensagem: "WhatsApp para confirmações rápidas.",
    frases_escalada: ["Conflito de agenda — escalando.", "Precisa de aprovação para essa mudança."],
    descricao: "Motor de agendamento. Confirmações, lembretes, reagendamentos.",
  },
  {
    codigo: "farm01", nome: "Rex", cargo: "Farmácia", grupo: "manager",
    emoji: "💊", cor_hex: "#84cc16", sla_minutos: 45, status_prontidao: "disponivel",
    tom_voz: "Técnico, cauteloso, detalhista. Nunca arrisca em caso de dúvida.",
    nao_faz: "Prescrição, diagnóstico, alteração de dose sem médico.",
    regras_tdah: "Nome do medicamento sempre em CAPS. Dose e via em tabela.",
    perfil_mensagem: "E-mail para dispensações formais.",
    frases_escalada: ["Dúvida farmacológica — escalando.", "Interação medicamentosa detectada — parando."],
    descricao: "Farmácia e dispensação. Controle de substâncias e injetáveis.",
  },
];

// Personalidade (14 dimensões, 1-5) — mesma ordem de AGENTES_SEED
const PERSONALITY_SEED = [
  // PAWARDS
  { formalidade: 4, empatia: 4, autoridade: 3, velocidade_resposta: 5, verbosidade: 3, clareza: 5, proatividade: 4, threshold_escalada: 3, criatividade: 3, rigor_protocolo: 4, tolerancia_ambiguidade: 3, tom_emocional: 3, foco_tarefa: 5, adaptabilidade: 4 },
  { formalidade: 4, empatia: 3, autoridade: 2, velocidade_resposta: 4, verbosidade: 2, clareza: 5, proatividade: 3, threshold_escalada: 2, criatividade: 2, rigor_protocolo: 4, tolerancia_ambiguidade: 3, tom_emocional: 2, foco_tarefa: 5, adaptabilidade: 3 },
  { formalidade: 4, empatia: 5, autoridade: 4, velocidade_resposta: 4, verbosidade: 3, clareza: 5, proatividade: 5, threshold_escalada: 4, criatividade: 3, rigor_protocolo: 5, tolerancia_ambiguidade: 2, tom_emocional: 4, foco_tarefa: 5, adaptabilidade: 4 },
  { formalidade: 3, empatia: 5, autoridade: 3, velocidade_resposta: 4, verbosidade: 2, clareza: 4, proatividade: 4, threshold_escalada: 3, criatividade: 2, rigor_protocolo: 5, tolerancia_ambiguidade: 2, tom_emocional: 4, foco_tarefa: 5, adaptabilidade: 3 },
  { formalidade: 5, empatia: 3, autoridade: 5, velocidade_resposta: 3, verbosidade: 2, clareza: 5, proatividade: 4, threshold_escalada: 5, criatividade: 4, rigor_protocolo: 5, tolerancia_ambiguidade: 2, tom_emocional: 2, foco_tarefa: 5, adaptabilidade: 3 },
  { formalidade: 5, empatia: 2, autoridade: 4, velocidade_resposta: 3, verbosidade: 4, clareza: 5, proatividade: 3, threshold_escalada: 4, criatividade: 5, rigor_protocolo: 5, tolerancia_ambiguidade: 2, tom_emocional: 2, foco_tarefa: 5, adaptabilidade: 3 },
  { formalidade: 5, empatia: 3, autoridade: 4, velocidade_resposta: 3, verbosidade: 3, clareza: 5, proatividade: 4, threshold_escalada: 4, criatividade: 2, rigor_protocolo: 5, tolerancia_ambiguidade: 2, tom_emocional: 2, foco_tarefa: 5, adaptabilidade: 3 },
  { formalidade: 4, empatia: 2, autoridade: 3, velocidade_resposta: 4, verbosidade: 2, clareza: 4, proatividade: 3, threshold_escalada: 3, criatividade: 2, rigor_protocolo: 4, tolerancia_ambiguidade: 3, tom_emocional: 2, foco_tarefa: 5, adaptabilidade: 3 },
  { formalidade: 5, empatia: 3, autoridade: 4, velocidade_resposta: 5, verbosidade: 2, clareza: 5, proatividade: 5, threshold_escalada: 5, criatividade: 3, rigor_protocolo: 5, tolerancia_ambiguidade: 2, tom_emocional: 3, foco_tarefa: 5, adaptabilidade: 4 },
  { formalidade: 5, empatia: 2, autoridade: 5, velocidade_resposta: 5, verbosidade: 1, clareza: 5, proatividade: 5, threshold_escalada: 5, criatividade: 4, rigor_protocolo: 5, tolerancia_ambiguidade: 1, tom_emocional: 2, foco_tarefa: 5, adaptabilidade: 3 },
  // MANAGER
  { formalidade: 4, empatia: 4, autoridade: 3, velocidade_resposta: 4, verbosidade: 3, clareza: 4, proatividade: 4, threshold_escalada: 3, criatividade: 3, rigor_protocolo: 3, tolerancia_ambiguidade: 3, tom_emocional: 3, foco_tarefa: 4, adaptabilidade: 4 },
  { formalidade: 3, empatia: 5, autoridade: 3, velocidade_resposta: 4, verbosidade: 3, clareza: 4, proatividade: 4, threshold_escalada: 3, criatividade: 2, rigor_protocolo: 5, tolerancia_ambiguidade: 2, tom_emocional: 4, foco_tarefa: 5, adaptabilidade: 3 },
  { formalidade: 5, empatia: 3, autoridade: 5, velocidade_resposta: 3, verbosidade: 2, clareza: 5, proatividade: 4, threshold_escalada: 5, criatividade: 3, rigor_protocolo: 5, tolerancia_ambiguidade: 2, tom_emocional: 2, foco_tarefa: 5, adaptabilidade: 3 },
  { formalidade: 5, empatia: 2, autoridade: 3, velocidade_resposta: 3, verbosidade: 3, clareza: 5, proatividade: 3, threshold_escalada: 4, criatividade: 2, rigor_protocolo: 5, tolerancia_ambiguidade: 2, tom_emocional: 2, foco_tarefa: 5, adaptabilidade: 3 },
  { formalidade: 4, empatia: 5, autoridade: 3, velocidade_resposta: 3, verbosidade: 4, clareza: 4, proatividade: 5, threshold_escalada: 3, criatividade: 5, rigor_protocolo: 3, tolerancia_ambiguidade: 4, tom_emocional: 4, foco_tarefa: 4, adaptabilidade: 5 },
  { formalidade: 5, empatia: 3, autoridade: 4, velocidade_resposta: 4, verbosidade: 2, clareza: 5, proatividade: 5, threshold_escalada: 5, criatividade: 3, rigor_protocolo: 5, tolerancia_ambiguidade: 2, tom_emocional: 3, foco_tarefa: 5, adaptabilidade: 3 },
  { formalidade: 4, empatia: 5, autoridade: 2, velocidade_resposta: 4, verbosidade: 4, clareza: 4, proatividade: 4, threshold_escalada: 3, criatividade: 3, rigor_protocolo: 3, tolerancia_ambiguidade: 4, tom_emocional: 5, foco_tarefa: 4, adaptabilidade: 5 },
  { formalidade: 3, empatia: 5, autoridade: 2, velocidade_resposta: 5, verbosidade: 3, clareza: 4, proatividade: 5, threshold_escalada: 2, criatividade: 4, rigor_protocolo: 3, tolerancia_ambiguidade: 4, tom_emocional: 5, foco_tarefa: 4, adaptabilidade: 5 },
  { formalidade: 4, empatia: 3, autoridade: 3, velocidade_resposta: 5, verbosidade: 1, clareza: 5, proatividade: 4, threshold_escalada: 3, criatividade: 2, rigor_protocolo: 5, tolerancia_ambiguidade: 2, tom_emocional: 2, foco_tarefa: 5, adaptabilidade: 3 },
  { formalidade: 4, empatia: 3, autoridade: 3, velocidade_resposta: 3, verbosidade: 3, clareza: 5, proatividade: 3, threshold_escalada: 4, criatividade: 2, rigor_protocolo: 5, tolerancia_ambiguidade: 2, tom_emocional: 2, foco_tarefa: 5, adaptabilidade: 3 },
];

// Capacidades (13 booleanos) — mesma ordem de AGENTES_SEED
const CAPACIDADES_SEED = [
  // PAWARDS
  { pode_whatsapp: true,  pode_email: true,  pode_prontuario: false, pode_criar_agendamento: true,  pode_ver_financeiro: false, pode_criar_demanda: true,  pode_escalar: true,  pode_ver_exames: false, pode_editar_protocolo: false, pode_ver_ras: false, pode_enviar_lembrete: true,  pode_criar_cobranca: false, pode_acesso_total: false },
  { pode_whatsapp: true,  pode_email: true,  pode_prontuario: false, pode_criar_agendamento: true,  pode_ver_financeiro: false, pode_criar_demanda: true,  pode_escalar: true,  pode_ver_exames: false, pode_editar_protocolo: false, pode_ver_ras: false, pode_enviar_lembrete: true,  pode_criar_cobranca: false, pode_acesso_total: false },
  { pode_whatsapp: true,  pode_email: true,  pode_prontuario: true,  pode_criar_agendamento: false, pode_ver_financeiro: false, pode_criar_demanda: true,  pode_escalar: true,  pode_ver_exames: true,  pode_editar_protocolo: false, pode_ver_ras: true,  pode_enviar_lembrete: true,  pode_criar_cobranca: false, pode_acesso_total: false },
  { pode_whatsapp: true,  pode_email: false, pode_prontuario: true,  pode_criar_agendamento: false, pode_ver_financeiro: false, pode_criar_demanda: true,  pode_escalar: true,  pode_ver_exames: false, pode_editar_protocolo: false, pode_ver_ras: true,  pode_enviar_lembrete: false, pode_criar_cobranca: false, pode_acesso_total: false },
  { pode_whatsapp: true,  pode_email: true,  pode_prontuario: true,  pode_criar_agendamento: false, pode_ver_financeiro: false, pode_criar_demanda: true,  pode_escalar: true,  pode_ver_exames: true,  pode_editar_protocolo: true,  pode_ver_ras: true,  pode_enviar_lembrete: true,  pode_criar_cobranca: false, pode_acesso_total: false },
  { pode_whatsapp: false, pode_email: true,  pode_prontuario: true,  pode_criar_agendamento: false, pode_ver_financeiro: false, pode_criar_demanda: true,  pode_escalar: true,  pode_ver_exames: true,  pode_editar_protocolo: true,  pode_ver_ras: true,  pode_enviar_lembrete: false, pode_criar_cobranca: false, pode_acesso_total: false },
  { pode_whatsapp: true,  pode_email: true,  pode_prontuario: false, pode_criar_agendamento: false, pode_ver_financeiro: true,  pode_criar_demanda: true,  pode_escalar: true,  pode_ver_exames: false, pode_editar_protocolo: false, pode_ver_ras: false, pode_enviar_lembrete: true,  pode_criar_cobranca: true,  pode_acesso_total: false },
  { pode_whatsapp: true,  pode_email: true,  pode_prontuario: false, pode_criar_agendamento: false, pode_ver_financeiro: true,  pode_criar_demanda: true,  pode_escalar: false, pode_ver_exames: false, pode_editar_protocolo: false, pode_ver_ras: false, pode_enviar_lembrete: false, pode_criar_cobranca: true,  pode_acesso_total: false },
  { pode_whatsapp: true,  pode_email: true,  pode_prontuario: true,  pode_criar_agendamento: false, pode_ver_financeiro: true,  pode_criar_demanda: true,  pode_escalar: true,  pode_ver_exames: true,  pode_editar_protocolo: false, pode_ver_ras: true,  pode_enviar_lembrete: true,  pode_criar_cobranca: false, pode_acesso_total: false },
  { pode_whatsapp: true,  pode_email: true,  pode_prontuario: true,  pode_criar_agendamento: true,  pode_ver_financeiro: true,  pode_criar_demanda: true,  pode_escalar: true,  pode_ver_exames: true,  pode_editar_protocolo: true,  pode_ver_ras: true,  pode_enviar_lembrete: true,  pode_criar_cobranca: true,  pode_acesso_total: true  },
  // MANAGER
  { pode_whatsapp: true,  pode_email: true,  pode_prontuario: false, pode_criar_agendamento: true,  pode_ver_financeiro: false, pode_criar_demanda: true,  pode_escalar: true,  pode_ver_exames: false, pode_editar_protocolo: false, pode_ver_ras: false, pode_enviar_lembrete: true,  pode_criar_cobranca: false, pode_acesso_total: false },
  { pode_whatsapp: true,  pode_email: true,  pode_prontuario: true,  pode_criar_agendamento: false, pode_ver_financeiro: false, pode_criar_demanda: true,  pode_escalar: true,  pode_ver_exames: true,  pode_editar_protocolo: false, pode_ver_ras: true,  pode_enviar_lembrete: true,  pode_criar_cobranca: false, pode_acesso_total: false },
  { pode_whatsapp: true,  pode_email: true,  pode_prontuario: true,  pode_criar_agendamento: false, pode_ver_financeiro: false, pode_criar_demanda: true,  pode_escalar: true,  pode_ver_exames: true,  pode_editar_protocolo: true,  pode_ver_ras: true,  pode_enviar_lembrete: true,  pode_criar_cobranca: false, pode_acesso_total: false },
  { pode_whatsapp: true,  pode_email: true,  pode_prontuario: false, pode_criar_agendamento: false, pode_ver_financeiro: true,  pode_criar_demanda: true,  pode_escalar: true,  pode_ver_exames: false, pode_editar_protocolo: false, pode_ver_ras: false, pode_enviar_lembrete: true,  pode_criar_cobranca: true,  pode_acesso_total: false },
  { pode_whatsapp: true,  pode_email: true,  pode_prontuario: false, pode_criar_agendamento: false, pode_ver_financeiro: false, pode_criar_demanda: true,  pode_escalar: true,  pode_ver_exames: false, pode_editar_protocolo: false, pode_ver_ras: false, pode_enviar_lembrete: true,  pode_criar_cobranca: false, pode_acesso_total: false },
  { pode_whatsapp: true,  pode_email: true,  pode_prontuario: true,  pode_criar_agendamento: false, pode_ver_financeiro: true,  pode_criar_demanda: true,  pode_escalar: true,  pode_ver_exames: true,  pode_editar_protocolo: false, pode_ver_ras: true,  pode_enviar_lembrete: true,  pode_criar_cobranca: false, pode_acesso_total: false },
  { pode_whatsapp: true,  pode_email: true,  pode_prontuario: false, pode_criar_agendamento: false, pode_ver_financeiro: false, pode_criar_demanda: true,  pode_escalar: true,  pode_ver_exames: false, pode_editar_protocolo: false, pode_ver_ras: false, pode_enviar_lembrete: false, pode_criar_cobranca: false, pode_acesso_total: false },
  { pode_whatsapp: true,  pode_email: false, pode_prontuario: false, pode_criar_agendamento: true,  pode_ver_financeiro: false, pode_criar_demanda: true,  pode_escalar: true,  pode_ver_exames: false, pode_editar_protocolo: false, pode_ver_ras: false, pode_enviar_lembrete: true,  pode_criar_cobranca: false, pode_acesso_total: false },
  { pode_whatsapp: true,  pode_email: true,  pode_prontuario: false, pode_criar_agendamento: true,  pode_ver_financeiro: false, pode_criar_demanda: true,  pode_escalar: false, pode_ver_exames: false, pode_editar_protocolo: false, pode_ver_ras: false, pode_enviar_lembrete: true,  pode_criar_cobranca: false, pode_acesso_total: false },
  { pode_whatsapp: false, pode_email: true,  pode_prontuario: false, pode_criar_agendamento: false, pode_ver_financeiro: false, pode_criar_demanda: true,  pode_escalar: true,  pode_ver_exames: false, pode_editar_protocolo: false, pode_ver_ras: false, pode_enviar_lembrete: false, pode_criar_cobranca: false, pode_acesso_total: false },
];

const FRASES_SEED = [
  // Aurora ADM (idx 0) — sample
  { codigo: "agente_adm_01", frases: [
    { tipo_frase: "abertura",     texto: "Bom dia! Sou Aurora da equipe PAXTER. Como posso te ajudar hoje?" },
    { tipo_frase: "encerramento", texto: "Perfeito! Tudo registrado. Qualquer dúvida, estamos à disposição." },
    { tipo_frase: "escalada",     texto: "Vou acionar nossa equipe especializada agora mesmo. Aguarde." },
    { tipo_frase: "confirmacao",  texto: "Confirmado! Você receberá um e-mail com todos os detalhes." },
    { tipo_frase: "empatia",      texto: "Entendo perfeitamente. Vamos resolver isso juntos." },
  ]},
  // Dr. Atlas (idx 4)
  { codigo: "agente_med_01", frases: [
    { tipo_frase: "abertura",     texto: "Dr. Atlas aqui. Me informe o protocolo e os sintomas relatados." },
    { tipo_frase: "encerramento", texto: "Decisão registrada. Equipe notificada. Protocolo atualizado." },
    { tipo_frase: "escalada",     texto: "Situação requer minha avaliação presencial. Acionando agora." },
    { tipo_frase: "alerta",       texto: "ALERTA CLÍNICO: sintoma requer avaliação imediata." },
    { tipo_frase: "confirmacao",  texto: "Prescrição confirmada. Dispensar conforme protocolo 4A." },
  ]},
  // Íris FIN (idx 6)
  { codigo: "agente_fin_01", frases: [
    { tipo_frase: "abertura",     texto: "Olá! Íris aqui, do financeiro. Qual é a sua dúvida sobre pagamento?" },
    { tipo_frase: "encerramento", texto: "Tudo certo! Pagamento registrado e confirmado no sistema." },
    { tipo_frase: "escalada",     texto: "Esse caso precisa de aprovação do Dr. Caio. Encaminhandoc agora." },
    { tipo_frase: "recusa",       texto: "Não consigo autorizar esse desconto sem aprovação superior." },
    { tipo_frase: "lembrete",     texto: "Lembrete: parcela com vencimento em 3 dias. Precisa de suporte?" },
  ]},
  // Clara ENF (idx 2)
  { codigo: "agente_enf_01", frases: [
    { tipo_frase: "abertura",     texto: "Olá! Clara aqui. Vamos fazer sua avaliação pré-sessão agora?" },
    { tipo_frase: "alerta",       texto: "SINTOMA RELATADO requer atenção. Parando protocolo." },
    { tipo_frase: "empatia",      texto: "Fica tranquilo(a). Estou aqui e vamos cuidar de tudo com calma." },
    { tipo_frase: "escalada",     texto: "Vou chamar o médico responsável imediatamente." },
    { tipo_frase: "encerramento", texto: "Avaliação concluída. Tudo registrado no seu prontuário." },
  ]},
  // Ana OUVIDORIA (idx 16)
  { codigo: "ouvidor01", frases: [
    { tipo_frase: "abertura",     texto: "Olá! Sou Ana, da Ouvidoria PAXTER. Pode me contar o que aconteceu?" },
    { tipo_frase: "empatia",      texto: "Escutei tudo. Sinto muito pelo transtorno. Vamos resolver." },
    { tipo_frase: "encerramento", texto: "Protocolo aberto. Você receberá retorno em até 48 horas." },
    { tipo_frase: "escalada",     texto: "Esse caso foi escalado para a supervisão com prioridade máxima." },
    { tipo_frase: "confirmacao",  texto: "Sua reclamação foi registrada com o número REF-{{codigo}}." },
  ]},
];

const MOTOR_SEED = [
  { codigo: "agente_adm_01", templates: [
    { tipo_template: "whatsapp_lembrete", template_texto: "Olá {{nome}}! Lembrete da sua sessão amanhã, {{data}} às {{hora}} na {{clinica}}. Confirme com um ✅", max_chars: 160, estilo: "informal_cordial" },
    { tipo_template: "email_pre_sessao",  template_texto: "Prezado(a) {{nome}},\n\nSua sessão está confirmada para {{data}} às {{hora}}.\n\nSubstâncias: {{substancias}}\n\nQualquer dúvida, responda este e-mail.\n\nEquipe PAXTER", max_chars: 500, estilo: "formal" },
    { tipo_template: "alerta_interno",    template_texto: "[ALERTA ADM] Cliente {{nome}} | Motivo: {{motivo}} | Ação requerida: {{acao}}", max_chars: 200, estilo: "tecnico" },
  ]},
  { codigo: "agente_med_01", templates: [
    { tipo_template: "email_pre_sessao",  template_texto: "Avaliação pré-sessão — {{nome}}\n\nProtocolo: {{protocolo}}\nSessão: {{sessao_num}} de {{total}}\nSubstâncias: {{substancias}}\n\nObservações: {{observacoes}}\n\nDr. Atlas — Médico Titular", max_chars: 600, estilo: "clinico_formal" },
    { tipo_template: "alerta_interno",    template_texto: "[MÉDICO — ATENÇÃO] Protocolo {{protocolo}} | Cliente: {{nome}} | Sintoma: {{sintoma}} | Decisão: {{decisao}}", max_chars: 300, estilo: "tecnico" },
    { tipo_template: "escalamento",       template_texto: "ESCALAMENTO MÉDICO\nCliente: {{nome}}\nSituação: {{situacao}}\nDecisão imediata requerida.\n— Dr. Atlas", max_chars: 250, estilo: "urgente" },
  ]},
  { codigo: "agente_fin_01", templates: [
    { tipo_template: "whatsapp_lembrete", template_texto: "Olá {{nome}}! Lembrete: parcela de R$ {{valor}} vence em {{data}}. PIX: {{chave_pix}}", max_chars: 160, estilo: "neutro_direto" },
    { tipo_template: "email_pre_sessao",  template_texto: "Demonstrativo Financeiro — {{nome}}\n\nTotal do protocolo: R$ {{total}}\nPago: R$ {{pago}}\nPendente: R$ {{pendente}}\nPróximo vencimento: {{vencimento}}\n\nÍris FIN — Financeiro PAXTER", max_chars: 500, estilo: "formal" },
    { tipo_template: "alerta_interno",    template_texto: "[FIN ALERTA] Cliente {{nome}} | Débito: R${{valor}} | Vencimento: {{data}} | Status: {{status}}", max_chars: 200, estilo: "tecnico" },
  ]},
];

const NARRATIVAS_SEED = [
  {
    codigo: "agente_adm_01",
    titulo: "Confirmação de Agendamento Pós-Protocolo",
    contexto: "Cliente que finalizou protocolo pergunta sobre reagendamento",
    roteiro: [
      { papel: "cliente", texto: "Oi, terminei o protocolo. Quero continuar, como faço?" },
      { papel: "agente",  texto: "Que ótimo saber que você quer continuar! Vou verificar a disponibilidade do Dr. Caio para uma consulta de renovação. Qual período você prefere — manhã ou tarde?" },
      { papel: "cliente", texto: "Tarde, preferencialmente." },
      { papel: "agente",  texto: "Perfeito! Temos vaga na terça-feira às 15h. Confirmo?" },
      { papel: "cliente", texto: "Sim, pode confirmar." },
      { papel: "agente",  texto: "Consulta agendada! Você receberá a confirmação por e-mail agora. Até lá!" },
    ],
  },
  {
    codigo: "agente_enf_01",
    titulo: "Avaliação de Sintoma Durante Aplicação",
    contexto: "Cliente relata tontura durante sessão de endovenoso",
    roteiro: [
      { papel: "cliente", texto: "Estou me sentindo um pouco tonta durante a aplicação." },
      { papel: "agente",  texto: "Vamos pausar a aplicação agora. TONTURA reportada. Lia, pause o procedimento. Clara aqui — vou avaliar. Você está sentada ou deitada?" },
      { papel: "cliente", texto: "Deitada." },
      { papel: "agente",  texto: "Ótimo. Vou verificar sua pressão e saturação. Respire fundo comigo. Isso é normal em alguns casos mas vamos cuidar com atenção." },
      { papel: "cliente", texto: "Obrigada, já melhorou um pouco." },
      { papel: "agente",  texto: "Fico feliz. Vamos aguardar 5 minutos antes de retomar, com monitoramento contínuo. Acionei o Dr. Caio por precaução — ele acompanhará à distância." },
    ],
  },
  {
    codigo: "agente_fin_01",
    titulo: "Negociação de Parcela em Atraso",
    contexto: "Cliente com parcela vencida há 10 dias entra em contato",
    roteiro: [
      { papel: "cliente", texto: "Vi que tenho uma parcela atrasada. Posso negociar?" },
      { papel: "agente",  texto: "Claro! Parcela de R$ 450,00 vencida em 10/07. Temos duas opções: regularizar hoje com desconto de 5% na multa, ou parcelar em mais 2x sem juros adicionais. Qual prefere?" },
      { papel: "cliente", texto: "Posso pagar hoje, mas quero o desconto." },
      { papel: "agente",  texto: "Aprovado! Valor com desconto: R$ 427,50. Envio o PIX agora. Após o pagamento me mande o comprovante e regularizo no sistema em até 1 hora." },
      { papel: "cliente", texto: "Pago agora." },
      { papel: "agente",  texto: "Perfeito! Pagamento registrado e protocolo normalizado. Obrigada pela agilidade!" },
    ],
  },
  {
    codigo: "ouvidor01",
    titulo: "Reclamação sobre Atendimento",
    contexto: "Cliente insatisfeito com demora no retorno",
    roteiro: [
      { papel: "cliente", texto: "Faz 3 dias que mandei mensagem e ninguém respondeu. Estou insatisfeito." },
      { papel: "agente",  texto: "Sinto muito pelo transtorno. Isso não deveria ter acontecido. Pode me dar mais detalhes sobre quando e como entrou em contato?" },
      { papel: "cliente", texto: "Mandei WhatsApp na terça à tarde." },
      { papel: "agente",  texto: "Entendi. Vou investigar o que ocorreu e garantir que isso não se repita. Abri um protocolo com prioridade. Você receberá um retorno nosso até amanhã ao meio-dia. Posso registrar algo mais?" },
      { papel: "cliente", texto: "Não. Só quero uma resposta." },
      { papel: "agente",  texto: "Garantido. Protocolo aberto. Muito obrigada pela confiança em nos comunicar. Faremos melhor." },
    ],
  },
];

async function seedAgentes() {
  const existing = await db.execute(sql`SELECT COUNT(*) as c FROM catalogo_agentes`);
  const count = Number((existing.rows[0] as Record<string, unknown>)?.c ?? 0);
  if (count > 0) return;

  for (let i = 0; i < AGENTES_SEED.length; i++) {
    const a = AGENTES_SEED[i];
    const p = PERSONALITY_SEED[i];
    const cap = CAPACIDADES_SEED[i];

    const res = await db.execute(sql`
      INSERT INTO catalogo_agentes
        (codigo, nome, cargo, grupo, emoji, cor_hex, sla_minutos, status_prontidao,
         tom_voz, nao_faz, regras_tdah, perfil_mensagem, frases_escalada, descricao)
      VALUES (
        ${a.codigo}, ${a.nome}, ${a.cargo}, ${a.grupo}, ${a.emoji}, ${a.cor_hex},
        ${a.sla_minutos}, ${a.status_prontidao}, ${a.tom_voz}, ${a.nao_faz},
        ${a.regras_tdah}, ${a.perfil_mensagem}, ${JSON.stringify(a.frases_escalada)}::jsonb,
        ${a.descricao}
      )
      ON CONFLICT (codigo) DO NOTHING
      RETURNING id
    `);

    const id = (res.rows[0] as Record<string, unknown>)?.id;
    if (!id) continue;

    await db.execute(sql`
      INSERT INTO agentes_personalidade
        (agente_id, formalidade, empatia, autoridade, velocidade_resposta, verbosidade,
         clareza, proatividade, threshold_escalada, criatividade, rigor_protocolo,
         tolerancia_ambiguidade, tom_emocional, foco_tarefa, adaptabilidade)
      VALUES (
        ${id}, ${p.formalidade}, ${p.empatia}, ${p.autoridade}, ${p.velocidade_resposta},
        ${p.verbosidade}, ${p.clareza}, ${p.proatividade}, ${p.threshold_escalada},
        ${p.criatividade}, ${p.rigor_protocolo}, ${p.tolerancia_ambiguidade},
        ${p.tom_emocional}, ${p.foco_tarefa}, ${p.adaptabilidade}
      )
      ON CONFLICT (agente_id) DO NOTHING
    `);

    await db.execute(sql`
      INSERT INTO capacidades_agente
        (agente_id, pode_whatsapp, pode_email, pode_prontuario, pode_criar_agendamento,
         pode_ver_financeiro, pode_criar_demanda, pode_escalar, pode_ver_exames,
         pode_editar_protocolo, pode_ver_ras, pode_enviar_lembrete, pode_criar_cobranca, pode_acesso_total)
      VALUES (
        ${id}, ${cap.pode_whatsapp}, ${cap.pode_email}, ${cap.pode_prontuario},
        ${cap.pode_criar_agendamento}, ${cap.pode_ver_financeiro}, ${cap.pode_criar_demanda},
        ${cap.pode_escalar}, ${cap.pode_ver_exames}, ${cap.pode_editar_protocolo},
        ${cap.pode_ver_ras}, ${cap.pode_enviar_lembrete}, ${cap.pode_criar_cobranca},
        ${cap.pode_acesso_total}
      )
      ON CONFLICT (agente_id) DO NOTHING
    `);
  }

  for (const grupo of FRASES_SEED) {
    const res = await db.execute(sql`SELECT id FROM catalogo_agentes WHERE codigo = ${grupo.codigo}`);
    const agente_id = (res.rows[0] as Record<string, unknown>)?.id;
    if (!agente_id) continue;
    for (const f of grupo.frases) {
      await db.execute(sql`
        INSERT INTO agentes_frases (agente_id, tipo_frase, texto)
        VALUES (${agente_id}, ${f.tipo_frase}, ${f.texto})
      `);
    }
  }

  for (const grupo of MOTOR_SEED) {
    const res = await db.execute(sql`SELECT id FROM catalogo_agentes WHERE codigo = ${grupo.codigo}`);
    const agente_id = (res.rows[0] as Record<string, unknown>)?.id;
    if (!agente_id) continue;
    for (const t of grupo.templates) {
      await db.execute(sql`
        INSERT INTO agentes_motor_escrita (agente_id, tipo_template, template_texto, max_chars, estilo)
        VALUES (${agente_id}, ${t.tipo_template}, ${t.template_texto}, ${t.max_chars}, ${t.estilo})
      `);
    }
  }

  for (const n of NARRATIVAS_SEED) {
    const res = await db.execute(sql`SELECT id FROM catalogo_agentes WHERE codigo = ${n.codigo}`);
    const agente_id = (res.rows[0] as Record<string, unknown>)?.id;
    if (!agente_id) continue;
    await db.execute(sql`
      INSERT INTO narrativas_agente (agente_id, titulo, contexto, roteiro)
      VALUES (${agente_id}, ${n.titulo}, ${n.contexto}, ${JSON.stringify(n.roteiro)}::jsonb)
    `);
  }

  logger.info("agentes: seed completo — 20 agentes, personalidade, capacidades, frases, motor, narrativas");
}

// ─── Boot ─────────────────────────────────────────────────────────────────────

initTables()
  .then(() => seedAgentes())
  .catch((err) => logger.error({ err }, "agentes: erro no boot"));

// ─── Rotas ────────────────────────────────────────────────────────────────────

// GET /agentes — catálogo completo com joins
router.get("/agentes", async (req, res) => {
  const { grupo, cargo, status } = req.query;
  const rows = await db.execute(sql`
    SELECT a.*, p.*, cap.*,
      a.id as id, p.id as pid, cap.id as cid
    FROM catalogo_agentes a
    LEFT JOIN agentes_personalidade p ON p.agente_id = a.id
    LEFT JOIN capacidades_agente cap ON cap.agente_id = a.id
    WHERE 1=1
      ${grupo ? sql`AND a.grupo = ${grupo}` : sql``}
      ${cargo ? sql`AND a.cargo ILIKE ${'%' + cargo + '%'}` : sql``}
      ${status ? sql`AND a.status_prontidao = ${status}` : sql``}
    ORDER BY a.grupo, a.id
  `);
  res.json({ items: rows.rows });
});

// GET /agentes/:id — agente completo
router.get("/agentes/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const [agente, personalidade, capacidades, frases, motor, narrativas] = await Promise.all([
    db.execute(sql`SELECT * FROM catalogo_agentes WHERE id = ${id}`),
    db.execute(sql`SELECT * FROM agentes_personalidade WHERE agente_id = ${id}`),
    db.execute(sql`SELECT * FROM capacidades_agente WHERE agente_id = ${id}`),
    db.execute(sql`SELECT * FROM agentes_frases WHERE agente_id = ${id} AND ativo = true ORDER BY tipo_frase`),
    db.execute(sql`SELECT * FROM agentes_motor_escrita WHERE agente_id = ${id} AND ativo = true`),
    db.execute(sql`SELECT * FROM narrativas_agente WHERE agente_id = ${id} ORDER BY criado_em`),
  ]);
  if (!agente.rows[0]) { res.status(404).json({ error: "Agente não encontrado" }); return; }
  res.json({
    ...agente.rows[0],
    personalidade: personalidade.rows[0] ?? null,
    capacidades: capacidades.rows[0] ?? null,
    frases: frases.rows,
    motor_escrita: motor.rows,
    narrativas: narrativas.rows,
  });
});

// PATCH /agentes/:id — editar agente
router.patch("/agentes/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const { nome, cargo, sla_minutos, status_prontidao, tom_voz, nao_faz, regras_tdah, perfil_mensagem, descricao, cor_hex, emoji, frases_escalada } = req.body;
  await db.execute(sql`
    UPDATE catalogo_agentes SET
      nome             = COALESCE(${nome ?? null}, nome),
      cargo            = COALESCE(${cargo ?? null}, cargo),
      sla_minutos      = COALESCE(${sla_minutos ?? null}, sla_minutos),
      status_prontidao = COALESCE(${status_prontidao ?? null}, status_prontidao),
      tom_voz          = COALESCE(${tom_voz ?? null}, tom_voz),
      nao_faz          = COALESCE(${nao_faz ?? null}, nao_faz),
      regras_tdah      = COALESCE(${regras_tdah ?? null}, regras_tdah),
      perfil_mensagem  = COALESCE(${perfil_mensagem ?? null}, perfil_mensagem),
      descricao        = COALESCE(${descricao ?? null}, descricao),
      cor_hex          = COALESCE(${cor_hex ?? null}, cor_hex),
      emoji            = COALESCE(${emoji ?? null}, emoji),
      frases_escalada  = COALESCE(${frases_escalada ? JSON.stringify(frases_escalada) + '::jsonb' : null}, frases_escalada)
    WHERE id = ${id}
  `);
  res.json({ ok: true });
});

// GET /agentes/personalidade — todas
router.get("/agentes-personalidade", async (_req, res) => {
  const rows = await db.execute(sql`
    SELECT a.id, a.codigo, a.nome, a.cargo, a.grupo, a.cor_hex, a.emoji, p.*
    FROM catalogo_agentes a
    LEFT JOIN agentes_personalidade p ON p.agente_id = a.id
    ORDER BY a.grupo, a.id
  `);
  res.json({ items: rows.rows });
});

// PATCH /agentes-personalidade/:agente_id
router.patch("/agentes-personalidade/:agente_id", async (req, res) => {
  const agente_id = parseInt(req.params.agente_id);
  const fields = ["formalidade","empatia","autoridade","velocidade_resposta","verbosidade","clareza",
                  "proatividade","threshold_escalada","criatividade","rigor_protocolo",
                  "tolerancia_ambiguidade","tom_emocional","foco_tarefa","adaptabilidade"];
  for (const f of fields) {
    const v = req.body[f];
    if (v !== undefined) {
      await db.execute(sql`UPDATE agentes_personalidade SET ${sql.raw(f)} = ${v} WHERE agente_id = ${agente_id}`);
    }
  }
  res.json({ ok: true });
});

// GET /agentes-capacidades
router.get("/agentes-capacidades", async (_req, res) => {
  const rows = await db.execute(sql`
    SELECT a.id, a.codigo, a.nome, a.cargo, a.grupo, a.cor_hex, a.emoji, cap.*
    FROM catalogo_agentes a
    LEFT JOIN capacidades_agente cap ON cap.agente_id = a.id
    ORDER BY a.grupo, a.id
  `);
  res.json({ items: rows.rows });
});

// PATCH /agentes-capacidades/:agente_id
router.patch("/agentes-capacidades/:agente_id", async (req, res) => {
  const agente_id = parseInt(req.params.agente_id);
  const bools = ["pode_whatsapp","pode_email","pode_prontuario","pode_criar_agendamento",
                 "pode_ver_financeiro","pode_criar_demanda","pode_escalar","pode_ver_exames",
                 "pode_editar_protocolo","pode_ver_ras","pode_enviar_lembrete","pode_criar_cobranca","pode_acesso_total"];
  for (const b of bools) {
    const v = req.body[b];
    if (v !== undefined) {
      await db.execute(sql`UPDATE capacidades_agente SET ${sql.raw(b)} = ${v} WHERE agente_id = ${agente_id}`);
    }
  }
  res.json({ ok: true });
});

// GET /agentes-frases?agente_id=&tipo=
router.get("/agentes-frases", async (req, res) => {
  const { agente_id, tipo } = req.query;
  const rows = await db.execute(sql`
    SELECT f.*, a.nome as agente_nome, a.codigo as agente_codigo, a.cor_hex
    FROM agentes_frases f
    JOIN catalogo_agentes a ON a.id = f.agente_id
    WHERE f.ativo = true
      ${agente_id ? sql`AND f.agente_id = ${agente_id}` : sql``}
      ${tipo ? sql`AND f.tipo_frase = ${tipo}` : sql``}
    ORDER BY f.tipo_frase, f.id
  `);
  res.json({ items: rows.rows });
});

// POST /agentes-frases
router.post("/agentes-frases", async (req, res) => {
  const { agente_id, tipo_frase, texto, variante } = req.body;
  const r = await db.execute(sql`
    INSERT INTO agentes_frases (agente_id, tipo_frase, texto, variante)
    VALUES (${agente_id}, ${tipo_frase}, ${texto}, ${variante ?? 1})
    RETURNING *
  `);
  res.status(201).json(r.rows[0]);
});

// PATCH /agentes-frases/:id
router.patch("/agentes-frases/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const { texto, ativo } = req.body;
  await db.execute(sql`
    UPDATE agentes_frases SET
      texto = COALESCE(${texto ?? null}, texto),
      ativo = COALESCE(${ativo ?? null}, ativo)
    WHERE id = ${id}
  `);
  res.json({ ok: true });
});

// DELETE /agentes-frases/:id
router.delete("/agentes-frases/:id", async (req, res) => {
  await db.execute(sql`UPDATE agentes_frases SET ativo = false WHERE id = ${parseInt(req.params.id)}`);
  res.json({ ok: true });
});

// GET /agentes-motor
router.get("/agentes-motor", async (req, res) => {
  const { agente_id } = req.query;
  const rows = await db.execute(sql`
    SELECT m.*, a.nome as agente_nome, a.cor_hex, a.emoji
    FROM agentes_motor_escrita m
    JOIN catalogo_agentes a ON a.id = m.agente_id
    WHERE m.ativo = true
      ${agente_id ? sql`AND m.agente_id = ${agente_id}` : sql``}
    ORDER BY m.agente_id, m.tipo_template
  `);
  res.json({ items: rows.rows });
});

// PATCH /agentes-motor/:id
router.patch("/agentes-motor/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const { template_texto, max_chars, estilo } = req.body;
  await db.execute(sql`
    UPDATE agentes_motor_escrita SET
      template_texto = COALESCE(${template_texto ?? null}, template_texto),
      max_chars      = COALESCE(${max_chars ?? null}, max_chars),
      estilo         = COALESCE(${estilo ?? null}, estilo)
    WHERE id = ${id}
  `);
  res.json({ ok: true });
});

// GET /agentes-narrativas
router.get("/agentes-narrativas", async (req, res) => {
  const { agente_id } = req.query;
  const rows = await db.execute(sql`
    SELECT n.*, a.nome as agente_nome, a.cor_hex, a.emoji, a.cargo
    FROM narrativas_agente n
    JOIN catalogo_agentes a ON a.id = n.agente_id
    WHERE 1=1 ${agente_id ? sql`AND n.agente_id = ${agente_id}` : sql``}
    ORDER BY n.agente_id, n.id
  `);
  res.json({ items: rows.rows });
});

// POST /agentes-narrativas
router.post("/agentes-narrativas", async (req, res) => {
  const { agente_id, titulo, contexto, roteiro } = req.body;
  const r = await db.execute(sql`
    INSERT INTO narrativas_agente (agente_id, titulo, contexto, roteiro)
    VALUES (${agente_id}, ${titulo}, ${contexto ?? null}, ${JSON.stringify(roteiro ?? [])}::jsonb)
    RETURNING *
  `);
  res.status(201).json(r.rows[0]);
});

// GET /agentes-stats — KPIs do painel
router.get("/agentes-stats", async (_req, res) => {
  const [total, por_grupo, por_status, por_cargo] = await Promise.all([
    db.execute(sql`SELECT COUNT(*) as total FROM catalogo_agentes`),
    db.execute(sql`SELECT grupo, COUNT(*) as n FROM catalogo_agentes GROUP BY grupo`),
    db.execute(sql`SELECT status_prontidao, COUNT(*) as n FROM catalogo_agentes GROUP BY status_prontidao`),
    db.execute(sql`SELECT cargo, COUNT(*) as n, AVG(sla_minutos)::int as sla_medio FROM catalogo_agentes GROUP BY cargo ORDER BY n DESC`),
  ]);
  res.json({
    total: Number((total.rows[0] as Record<string,unknown>)?.total ?? 0),
    por_grupo: por_grupo.rows,
    por_status: por_status.rows,
    por_cargo: por_cargo.rows,
  });
});

export default router;
