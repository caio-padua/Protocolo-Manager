--
-- PostgreSQL database dump
--

\restrict YMiRR1zElWVG2FgUWL8rpK3hTLVgr5uzFWIHCa6RBXgZBm6J94CzKNUDI09R3TZ

-- Dumped from database version 16.10
-- Dumped by pg_dump version 16.10

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: agent_integration_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_integration_log (
    id integer NOT NULL,
    tipo text NOT NULL,
    agente_id integer,
    client_id integer,
    status text DEFAULT 'ok'::text NOT NULL,
    detalhe jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: agent_integration_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.agent_integration_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: agent_integration_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.agent_integration_log_id_seq OWNED BY public.agent_integration_log.id;


--
-- Name: agent_quick_replies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_quick_replies (
    id integer NOT NULL,
    agente_id integer NOT NULL,
    texto text NOT NULL,
    ordem integer DEFAULT 1 NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: agent_quick_replies_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.agent_quick_replies_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: agent_quick_replies_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.agent_quick_replies_id_seq OWNED BY public.agent_quick_replies.id;


--
-- Name: agentes_frases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agentes_frases (
    id integer NOT NULL,
    agente_id integer,
    tipo_frase text NOT NULL,
    texto text NOT NULL,
    variante integer DEFAULT 1,
    ativo boolean DEFAULT true,
    criado_em timestamp with time zone DEFAULT now()
);


--
-- Name: agentes_frases_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.agentes_frases_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: agentes_frases_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.agentes_frases_id_seq OWNED BY public.agentes_frases.id;


--
-- Name: agentes_motor_escrita; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agentes_motor_escrita (
    id integer NOT NULL,
    agente_id integer,
    tipo_template text NOT NULL,
    template_texto text NOT NULL,
    max_chars integer DEFAULT 500,
    estilo text DEFAULT 'formal'::text,
    ativo boolean DEFAULT true
);


--
-- Name: agentes_motor_escrita_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.agentes_motor_escrita_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: agentes_motor_escrita_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.agentes_motor_escrita_id_seq OWNED BY public.agentes_motor_escrita.id;


--
-- Name: agentes_personalidade; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agentes_personalidade (
    id integer NOT NULL,
    agente_id integer,
    formalidade integer DEFAULT 3,
    empatia integer DEFAULT 3,
    autoridade integer DEFAULT 3,
    velocidade_resposta integer DEFAULT 3,
    verbosidade integer DEFAULT 3,
    clareza integer DEFAULT 3,
    proatividade integer DEFAULT 3,
    threshold_escalada integer DEFAULT 3,
    criatividade integer DEFAULT 3,
    rigor_protocolo integer DEFAULT 3,
    tolerancia_ambiguidade integer DEFAULT 3,
    tom_emocional integer DEFAULT 3,
    foco_tarefa integer DEFAULT 3,
    adaptabilidade integer DEFAULT 3,
    CONSTRAINT agentes_personalidade_adaptabilidade_check CHECK (((adaptabilidade >= 1) AND (adaptabilidade <= 5))),
    CONSTRAINT agentes_personalidade_autoridade_check CHECK (((autoridade >= 1) AND (autoridade <= 5))),
    CONSTRAINT agentes_personalidade_clareza_check CHECK (((clareza >= 1) AND (clareza <= 5))),
    CONSTRAINT agentes_personalidade_criatividade_check CHECK (((criatividade >= 1) AND (criatividade <= 5))),
    CONSTRAINT agentes_personalidade_empatia_check CHECK (((empatia >= 1) AND (empatia <= 5))),
    CONSTRAINT agentes_personalidade_foco_tarefa_check CHECK (((foco_tarefa >= 1) AND (foco_tarefa <= 5))),
    CONSTRAINT agentes_personalidade_formalidade_check CHECK (((formalidade >= 1) AND (formalidade <= 5))),
    CONSTRAINT agentes_personalidade_proatividade_check CHECK (((proatividade >= 1) AND (proatividade <= 5))),
    CONSTRAINT agentes_personalidade_rigor_protocolo_check CHECK (((rigor_protocolo >= 1) AND (rigor_protocolo <= 5))),
    CONSTRAINT agentes_personalidade_threshold_escalada_check CHECK (((threshold_escalada >= 1) AND (threshold_escalada <= 5))),
    CONSTRAINT agentes_personalidade_tolerancia_ambiguidade_check CHECK (((tolerancia_ambiguidade >= 1) AND (tolerancia_ambiguidade <= 5))),
    CONSTRAINT agentes_personalidade_tom_emocional_check CHECK (((tom_emocional >= 1) AND (tom_emocional <= 5))),
    CONSTRAINT agentes_personalidade_velocidade_resposta_check CHECK (((velocidade_resposta >= 1) AND (velocidade_resposta <= 5))),
    CONSTRAINT agentes_personalidade_verbosidade_check CHECK (((verbosidade >= 1) AND (verbosidade <= 5)))
);


--
-- Name: agentes_personalidade_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.agentes_personalidade_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: agentes_personalidade_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.agentes_personalidade_id_seq OWNED BY public.agentes_personalidade.id;


--
-- Name: agentes_trello_cards; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agentes_trello_cards (
    id integer NOT NULL,
    agente_id integer NOT NULL,
    conversation_id integer,
    client_id integer,
    trello_card_id text NOT NULL,
    trello_list_id text,
    board_tipo text DEFAULT 'interno'::text,
    titulo text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: agentes_trello_cards_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.agentes_trello_cards_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: agentes_trello_cards_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.agentes_trello_cards_id_seq OWNED BY public.agentes_trello_cards.id;


--
-- Name: capacidades_agente; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.capacidades_agente (
    id integer NOT NULL,
    agente_id integer,
    pode_whatsapp boolean DEFAULT false,
    pode_email boolean DEFAULT false,
    pode_prontuario boolean DEFAULT false,
    pode_criar_agendamento boolean DEFAULT false,
    pode_ver_financeiro boolean DEFAULT false,
    pode_criar_demanda boolean DEFAULT true,
    pode_escalar boolean DEFAULT true,
    pode_ver_exames boolean DEFAULT false,
    pode_editar_protocolo boolean DEFAULT false,
    pode_ver_ras boolean DEFAULT false,
    pode_enviar_lembrete boolean DEFAULT false,
    pode_criar_cobranca boolean DEFAULT false,
    pode_acesso_total boolean DEFAULT false,
    trello_interno_ativo boolean DEFAULT false,
    trello_list_id_default text,
    trello_externo_ativo boolean DEFAULT false,
    wpp_proativo_ativo boolean DEFAULT false,
    email_proativo_ativo boolean DEFAULT false
);


--
-- Name: capacidades_agente_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.capacidades_agente_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: capacidades_agente_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.capacidades_agente_id_seq OWNED BY public.capacidades_agente.id;


--
-- Name: catalogo_agentes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.catalogo_agentes (
    id integer NOT NULL,
    codigo text NOT NULL,
    nome text NOT NULL,
    cargo text NOT NULL,
    grupo text DEFAULT 'manager'::text NOT NULL,
    emoji text DEFAULT '🤖'::text,
    cor_hex text DEFAULT '#45B8CC'::text,
    sla_minutos integer DEFAULT 30,
    status_prontidao text DEFAULT 'disponivel'::text,
    tom_voz text,
    nao_faz text,
    regras_tdah text,
    perfil_mensagem text,
    frases_escalada jsonb DEFAULT '[]'::jsonb,
    descricao text,
    criado_em timestamp with time zone DEFAULT now()
);


--
-- Name: catalogo_agentes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.catalogo_agentes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: catalogo_agentes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.catalogo_agentes_id_seq OWNED BY public.catalogo_agentes.id;


--
-- Name: commission_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.commission_events (
    id integer NOT NULL,
    member_id integer,
    delegacao_id integer,
    tipo text NOT NULL,
    valor_centavos integer NOT NULL,
    motivo text,
    criado_em timestamp with time zone DEFAULT now()
);


--
-- Name: commission_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.commission_events_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: commission_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.commission_events_id_seq OWNED BY public.commission_events.id;


--
-- Name: delegacao_escalations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.delegacao_escalations (
    id integer NOT NULL,
    delegacao_id integer NOT NULL,
    escalado_de_id integer,
    escalado_para_id integer,
    motivo text,
    criado_em timestamp with time zone DEFAULT now()
);


--
-- Name: delegacao_escalations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.delegacao_escalations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: delegacao_escalations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.delegacao_escalations_id_seq OWNED BY public.delegacao_escalations.id;


--
-- Name: delegacao_justificativas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.delegacao_justificativas (
    id integer NOT NULL,
    delegacao_id integer NOT NULL,
    member_id integer,
    motivo text NOT NULL,
    nova_prazo_em timestamp with time zone,
    aprovado_por integer,
    aprovado_em timestamp with time zone,
    status text DEFAULT 'pendente'::text,
    criado_em timestamp with time zone DEFAULT now()
);


--
-- Name: delegacao_justificativas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.delegacao_justificativas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: delegacao_justificativas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.delegacao_justificativas_id_seq OWNED BY public.delegacao_justificativas.id;


--
-- Name: delegacoes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.delegacoes (
    id integer NOT NULL,
    titulo text NOT NULL,
    descricao text,
    tipo text DEFAULT 'manual'::text NOT NULL,
    origem text,
    prioridade text DEFAULT 'normal'::text NOT NULL,
    status text DEFAULT 'aberto'::text NOT NULL,
    assigned_role text,
    assigned_member_id integer,
    client_id integer,
    protocol_id integer,
    prazo_horas integer DEFAULT 24,
    prazo_em timestamp with time zone,
    concluido_em timestamp with time zone,
    concluido_por integer,
    trello_card_id text,
    trello_list_id text,
    notas text,
    resultado text,
    criado_por integer,
    criado_em timestamp with time zone DEFAULT now(),
    atualizado_em timestamp with time zone DEFAULT now()
);


--
-- Name: delegacoes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.delegacoes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: delegacoes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.delegacoes_id_seq OWNED BY public.delegacoes.id;


--
-- Name: disciplinary_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.disciplinary_events (
    id integer NOT NULL,
    member_id integer,
    tipo text NOT NULL,
    motivo text NOT NULL,
    delegacao_id integer,
    registrado_por integer,
    criado_em timestamp with time zone DEFAULT now()
);


--
-- Name: disciplinary_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.disciplinary_events_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: disciplinary_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.disciplinary_events_id_seq OWNED BY public.disciplinary_events.id;


--
-- Name: dominios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dominios (
    id integer NOT NULL,
    dominio text NOT NULL,
    registrador text,
    registrador_domain_id text,
    status text DEFAULT 'ativo'::text NOT NULL,
    expira_em date,
    auto_renovar boolean DEFAULT true,
    empresa_id integer,
    notas text,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
    titular_nome text,
    titular_documento text,
    data_registro date,
    modulo_pago boolean DEFAULT false NOT NULL,
    valor_mensal_centavos integer,
    ns1 text,
    ns2 text,
    ns3 text,
    ns4 text,
    dns_provider text DEFAULT 'outro'::text,
    cloudflare_zone_id text,
    zoho_verificado boolean DEFAULT false NOT NULL,
    zoho_metodo_verificacao text,
    zoho_conta_admin text,
    zoho_auto_alias boolean DEFAULT false NOT NULL
);


--
-- Name: dominios_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.dominios_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: dominios_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.dominios_id_seq OWNED BY public.dominios.id;


--
-- Name: drive_watcher_files; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.drive_watcher_files (
    file_id text NOT NULL,
    folder_id text NOT NULL,
    folder_type text NOT NULL,
    original_name text NOT NULL,
    renamed_to text,
    client_id integer,
    client_name_raw text,
    status text DEFAULT 'pendente'::text NOT NULL,
    error_msg text,
    exam_document_id integer,
    processed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    copied_drive_id text,
    copied_name text
);


--
-- Name: exam_document_files; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.exam_document_files (
    document_id integer NOT NULL,
    file_name text NOT NULL,
    mime_type text NOT NULL,
    bytes bytea NOT NULL,
    size_bytes integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: narrativas_agente; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.narrativas_agente (
    id integer NOT NULL,
    agente_id integer,
    titulo text NOT NULL,
    contexto text,
    roteiro jsonb DEFAULT '[]'::jsonb,
    criado_em timestamp with time zone DEFAULT now()
);


--
-- Name: narrativas_agente_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.narrativas_agente_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: narrativas_agente_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.narrativas_agente_id_seq OWNED BY public.narrativas_agente.id;


--
-- Name: process_responsibilities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.process_responsibilities (
    id integer NOT NULL,
    processo text NOT NULL,
    categoria text DEFAULT 'operacional'::text NOT NULL,
    responsavel text DEFAULT ''::text NOT NULL,
    aprovador text DEFAULT ''::text NOT NULL,
    consultados text[] DEFAULT '{}'::text[],
    informados text[] DEFAULT '{}'::text[],
    ativo boolean DEFAULT true,
    criado_em timestamp with time zone DEFAULT now(),
    atualizado_em timestamp with time zone DEFAULT now()
);


--
-- Name: process_responsibilities_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.process_responsibilities_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: process_responsibilities_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.process_responsibilities_id_seq OWNED BY public.process_responsibilities.id;


--
-- Name: proposta_dominio; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.proposta_dominio (
    id integer NOT NULL,
    clinica_nome text NOT NULL,
    clinica_cnpj text,
    clinica_email text,
    clinica_telefone text,
    clinica_responsavel text,
    dominio text NOT NULL,
    plano text DEFAULT 'basico'::text NOT NULL,
    emails_incluidos integer DEFAULT 1 NOT NULL,
    valor_adesao_centavos integer DEFAULT 0 NOT NULL,
    valor_mensal_centavos integer NOT NULL,
    status text DEFAULT 'rascunho'::text NOT NULL,
    asaas_customer_id text,
    asaas_charge_id text,
    asaas_subscription_id text,
    asaas_invoice_url text,
    asaas_pix_qr text,
    dominio_id integer,
    notas text,
    criado_em timestamp without time zone DEFAULT now() NOT NULL,
    atualizado_em timestamp without time zone DEFAULT now() NOT NULL,
    pago_em timestamp without time zone,
    ativo_em timestamp without time zone
);


--
-- Name: proposta_dominio_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.proposta_dominio_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: proposta_dominio_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.proposta_dominio_id_seq OWNED BY public.proposta_dominio.id;


--
-- Name: receituario_modelos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.receituario_modelos (
    id integer NOT NULL,
    nome text NOT NULL,
    tipo text DEFAULT 'faixas_paxter'::text NOT NULL,
    config jsonb DEFAULT '{}'::jsonb NOT NULL,
    ativo boolean DEFAULT false NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: receituario_modelos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.receituario_modelos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: receituario_modelos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.receituario_modelos_id_seq OWNED BY public.receituario_modelos.id;


--
-- Name: receituario_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.receituario_tokens (
    token text NOT NULL,
    paciente text NOT NULL,
    medico text NOT NULL,
    crm text NOT NULL,
    clinica text NOT NULL,
    data_emissao text NOT NULL,
    arquivo text NOT NULL,
    drive_url text,
    formulas jsonb DEFAULT '[]'::jsonb NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    client_id integer
);


--
-- Name: registrador_credenciais; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.registrador_credenciais (
    id integer NOT NULL,
    registrador text NOT NULL,
    dados jsonb DEFAULT '{}'::jsonb NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: registrador_credenciais_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.registrador_credenciais_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: registrador_credenciais_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.registrador_credenciais_id_seq OWNED BY public.registrador_credenciais.id;


--
-- Name: sla_monitoring; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sla_monitoring (
    id integer NOT NULL,
    delegacao_id integer,
    sla_horas integer NOT NULL,
    iniciou_em timestamp with time zone DEFAULT now() NOT NULL,
    prazo_em timestamp with time zone NOT NULL,
    concluiu_em timestamp with time zone,
    status text DEFAULT 'dentro_prazo'::text NOT NULL,
    alertas_enviados integer DEFAULT 0
);


--
-- Name: sla_monitoring_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sla_monitoring_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: sla_monitoring_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.sla_monitoring_id_seq OWNED BY public.sla_monitoring.id;


--
-- Name: team_email_aliases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.team_email_aliases (
    id integer NOT NULL,
    email text NOT NULL,
    cargo_codigo text NOT NULL,
    cargo_label text NOT NULL,
    modo text DEFAULT 'local'::text NOT NULL,
    hierarquia text DEFAULT 'alpha'::text NOT NULL,
    clinica text DEFAULT 'padua'::text NOT NULL,
    is_trello_main boolean DEFAULT false,
    member_id integer,
    status text DEFAULT 'vago'::text NOT NULL,
    observacoes text,
    criado_em timestamp with time zone DEFAULT now()
);


--
-- Name: team_email_aliases_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.team_email_aliases_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: team_email_aliases_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.team_email_aliases_id_seq OWNED BY public.team_email_aliases.id;


--
-- Name: team_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.team_members (
    id integer NOT NULL,
    nome text NOT NULL,
    email text,
    telefone text,
    cargo_id integer,
    tipo text DEFAULT 'humano'::text NOT NULL,
    status text DEFAULT 'ativo'::text NOT NULL,
    especialidades text[],
    max_demandas_simultaneas integer DEFAULT 5,
    professional_id integer,
    observacoes text,
    criado_em timestamp with time zone DEFAULT now()
);


--
-- Name: team_members_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.team_members_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: team_members_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.team_members_id_seq OWNED BY public.team_members.id;


--
-- Name: team_positions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.team_positions (
    id integer NOT NULL,
    nome text NOT NULL,
    codigo text NOT NULL,
    descricao text,
    cor_hex text DEFAULT '#3D7A7A'::text,
    nivel integer DEFAULT 1,
    pode_receber_demandas boolean DEFAULT true,
    pode_criar_demandas boolean DEFAULT false,
    sla_horas integer DEFAULT 24,
    criado_em timestamp with time zone DEFAULT now()
);


--
-- Name: team_positions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.team_positions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: team_positions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.team_positions_id_seq OWNED BY public.team_positions.id;


--
-- Name: work_ratings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.work_ratings (
    id integer NOT NULL,
    review_id integer,
    member_id integer,
    nota integer NOT NULL,
    qualidade integer,
    prazo integer,
    comunicacao integer,
    proatividade integer,
    comentario text,
    avaliado_por text,
    criado_em timestamp with time zone DEFAULT now(),
    CONSTRAINT work_ratings_comunicacao_check CHECK (((comunicacao >= 1) AND (comunicacao <= 5))),
    CONSTRAINT work_ratings_nota_check CHECK (((nota >= 1) AND (nota <= 5))),
    CONSTRAINT work_ratings_prazo_check CHECK (((prazo >= 1) AND (prazo <= 5))),
    CONSTRAINT work_ratings_proatividade_check CHECK (((proatividade >= 1) AND (proatividade <= 5))),
    CONSTRAINT work_ratings_qualidade_check CHECK (((qualidade >= 1) AND (qualidade <= 5)))
);


--
-- Name: work_ratings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.work_ratings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: work_ratings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.work_ratings_id_seq OWNED BY public.work_ratings.id;


--
-- Name: work_reviews; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.work_reviews (
    id integer NOT NULL,
    member_id integer,
    demanda_id integer,
    entrega_descricao text NOT NULL,
    arquivos_links text,
    data_entrega timestamp with time zone DEFAULT now(),
    status text DEFAULT 'pendente'::text NOT NULL,
    notas_revisao text,
    revisado_por text,
    revisado_em timestamp with time zone,
    criado_em timestamp with time zone DEFAULT now()
);


--
-- Name: work_reviews_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.work_reviews_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: work_reviews_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.work_reviews_id_seq OWNED BY public.work_reviews.id;


--
-- Name: agent_integration_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_integration_log ALTER COLUMN id SET DEFAULT nextval('public.agent_integration_log_id_seq'::regclass);


--
-- Name: agent_quick_replies id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_quick_replies ALTER COLUMN id SET DEFAULT nextval('public.agent_quick_replies_id_seq'::regclass);


--
-- Name: agentes_frases id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agentes_frases ALTER COLUMN id SET DEFAULT nextval('public.agentes_frases_id_seq'::regclass);


--
-- Name: agentes_motor_escrita id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agentes_motor_escrita ALTER COLUMN id SET DEFAULT nextval('public.agentes_motor_escrita_id_seq'::regclass);


--
-- Name: agentes_personalidade id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agentes_personalidade ALTER COLUMN id SET DEFAULT nextval('public.agentes_personalidade_id_seq'::regclass);


--
-- Name: agentes_trello_cards id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agentes_trello_cards ALTER COLUMN id SET DEFAULT nextval('public.agentes_trello_cards_id_seq'::regclass);


--
-- Name: capacidades_agente id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.capacidades_agente ALTER COLUMN id SET DEFAULT nextval('public.capacidades_agente_id_seq'::regclass);


--
-- Name: catalogo_agentes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalogo_agentes ALTER COLUMN id SET DEFAULT nextval('public.catalogo_agentes_id_seq'::regclass);


--
-- Name: commission_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.commission_events ALTER COLUMN id SET DEFAULT nextval('public.commission_events_id_seq'::regclass);


--
-- Name: delegacao_escalations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delegacao_escalations ALTER COLUMN id SET DEFAULT nextval('public.delegacao_escalations_id_seq'::regclass);


--
-- Name: delegacao_justificativas id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delegacao_justificativas ALTER COLUMN id SET DEFAULT nextval('public.delegacao_justificativas_id_seq'::regclass);


--
-- Name: delegacoes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delegacoes ALTER COLUMN id SET DEFAULT nextval('public.delegacoes_id_seq'::regclass);


--
-- Name: disciplinary_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.disciplinary_events ALTER COLUMN id SET DEFAULT nextval('public.disciplinary_events_id_seq'::regclass);


--
-- Name: dominios id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dominios ALTER COLUMN id SET DEFAULT nextval('public.dominios_id_seq'::regclass);


--
-- Name: narrativas_agente id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.narrativas_agente ALTER COLUMN id SET DEFAULT nextval('public.narrativas_agente_id_seq'::regclass);


--
-- Name: process_responsibilities id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.process_responsibilities ALTER COLUMN id SET DEFAULT nextval('public.process_responsibilities_id_seq'::regclass);


--
-- Name: proposta_dominio id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proposta_dominio ALTER COLUMN id SET DEFAULT nextval('public.proposta_dominio_id_seq'::regclass);


--
-- Name: receituario_modelos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.receituario_modelos ALTER COLUMN id SET DEFAULT nextval('public.receituario_modelos_id_seq'::regclass);


--
-- Name: registrador_credenciais id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.registrador_credenciais ALTER COLUMN id SET DEFAULT nextval('public.registrador_credenciais_id_seq'::regclass);


--
-- Name: sla_monitoring id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sla_monitoring ALTER COLUMN id SET DEFAULT nextval('public.sla_monitoring_id_seq'::regclass);


--
-- Name: team_email_aliases id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_email_aliases ALTER COLUMN id SET DEFAULT nextval('public.team_email_aliases_id_seq'::regclass);


--
-- Name: team_members id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_members ALTER COLUMN id SET DEFAULT nextval('public.team_members_id_seq'::regclass);


--
-- Name: team_positions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_positions ALTER COLUMN id SET DEFAULT nextval('public.team_positions_id_seq'::regclass);


--
-- Name: work_ratings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_ratings ALTER COLUMN id SET DEFAULT nextval('public.work_ratings_id_seq'::regclass);


--
-- Name: work_reviews id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_reviews ALTER COLUMN id SET DEFAULT nextval('public.work_reviews_id_seq'::regclass);


--
-- Name: agent_integration_log agent_integration_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_integration_log
    ADD CONSTRAINT agent_integration_log_pkey PRIMARY KEY (id);


--
-- Name: agent_quick_replies agent_quick_replies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_quick_replies
    ADD CONSTRAINT agent_quick_replies_pkey PRIMARY KEY (id);


--
-- Name: agentes_frases agentes_frases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agentes_frases
    ADD CONSTRAINT agentes_frases_pkey PRIMARY KEY (id);


--
-- Name: agentes_motor_escrita agentes_motor_escrita_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agentes_motor_escrita
    ADD CONSTRAINT agentes_motor_escrita_pkey PRIMARY KEY (id);


--
-- Name: agentes_personalidade agentes_personalidade_agente_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agentes_personalidade
    ADD CONSTRAINT agentes_personalidade_agente_id_key UNIQUE (agente_id);


--
-- Name: agentes_personalidade agentes_personalidade_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agentes_personalidade
    ADD CONSTRAINT agentes_personalidade_pkey PRIMARY KEY (id);


--
-- Name: agentes_trello_cards agentes_trello_cards_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agentes_trello_cards
    ADD CONSTRAINT agentes_trello_cards_pkey PRIMARY KEY (id);


--
-- Name: agentes_trello_cards agentes_trello_cards_trello_card_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agentes_trello_cards
    ADD CONSTRAINT agentes_trello_cards_trello_card_id_key UNIQUE (trello_card_id);


--
-- Name: capacidades_agente capacidades_agente_agente_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.capacidades_agente
    ADD CONSTRAINT capacidades_agente_agente_id_key UNIQUE (agente_id);


--
-- Name: capacidades_agente capacidades_agente_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.capacidades_agente
    ADD CONSTRAINT capacidades_agente_pkey PRIMARY KEY (id);


--
-- Name: catalogo_agentes catalogo_agentes_codigo_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalogo_agentes
    ADD CONSTRAINT catalogo_agentes_codigo_key UNIQUE (codigo);


--
-- Name: catalogo_agentes catalogo_agentes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalogo_agentes
    ADD CONSTRAINT catalogo_agentes_pkey PRIMARY KEY (id);


--
-- Name: commission_events commission_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.commission_events
    ADD CONSTRAINT commission_events_pkey PRIMARY KEY (id);


--
-- Name: delegacao_escalations delegacao_escalations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delegacao_escalations
    ADD CONSTRAINT delegacao_escalations_pkey PRIMARY KEY (id);


--
-- Name: delegacao_justificativas delegacao_justificativas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delegacao_justificativas
    ADD CONSTRAINT delegacao_justificativas_pkey PRIMARY KEY (id);


--
-- Name: delegacoes delegacoes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delegacoes
    ADD CONSTRAINT delegacoes_pkey PRIMARY KEY (id);


--
-- Name: disciplinary_events disciplinary_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.disciplinary_events
    ADD CONSTRAINT disciplinary_events_pkey PRIMARY KEY (id);


--
-- Name: dominios dominios_dominio_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dominios
    ADD CONSTRAINT dominios_dominio_key UNIQUE (dominio);


--
-- Name: dominios dominios_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dominios
    ADD CONSTRAINT dominios_pkey PRIMARY KEY (id);


--
-- Name: drive_watcher_files drive_watcher_files_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.drive_watcher_files
    ADD CONSTRAINT drive_watcher_files_pkey PRIMARY KEY (file_id);


--
-- Name: exam_document_files exam_document_files_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exam_document_files
    ADD CONSTRAINT exam_document_files_pkey PRIMARY KEY (document_id);


--
-- Name: narrativas_agente narrativas_agente_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.narrativas_agente
    ADD CONSTRAINT narrativas_agente_pkey PRIMARY KEY (id);


--
-- Name: process_responsibilities process_responsibilities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.process_responsibilities
    ADD CONSTRAINT process_responsibilities_pkey PRIMARY KEY (id);


--
-- Name: process_responsibilities process_responsibilities_processo_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.process_responsibilities
    ADD CONSTRAINT process_responsibilities_processo_key UNIQUE (processo);


--
-- Name: proposta_dominio proposta_dominio_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proposta_dominio
    ADD CONSTRAINT proposta_dominio_pkey PRIMARY KEY (id);


--
-- Name: receituario_modelos receituario_modelos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.receituario_modelos
    ADD CONSTRAINT receituario_modelos_pkey PRIMARY KEY (id);


--
-- Name: receituario_tokens receituario_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.receituario_tokens
    ADD CONSTRAINT receituario_tokens_pkey PRIMARY KEY (token);


--
-- Name: registrador_credenciais registrador_credenciais_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.registrador_credenciais
    ADD CONSTRAINT registrador_credenciais_pkey PRIMARY KEY (id);


--
-- Name: registrador_credenciais registrador_credenciais_registrador_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.registrador_credenciais
    ADD CONSTRAINT registrador_credenciais_registrador_key UNIQUE (registrador);


--
-- Name: sla_monitoring sla_monitoring_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sla_monitoring
    ADD CONSTRAINT sla_monitoring_pkey PRIMARY KEY (id);


--
-- Name: team_email_aliases team_email_aliases_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_email_aliases
    ADD CONSTRAINT team_email_aliases_email_key UNIQUE (email);


--
-- Name: team_email_aliases team_email_aliases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_email_aliases
    ADD CONSTRAINT team_email_aliases_pkey PRIMARY KEY (id);


--
-- Name: team_members team_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_members
    ADD CONSTRAINT team_members_pkey PRIMARY KEY (id);


--
-- Name: team_positions team_positions_codigo_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_positions
    ADD CONSTRAINT team_positions_codigo_key UNIQUE (codigo);


--
-- Name: team_positions team_positions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_positions
    ADD CONSTRAINT team_positions_pkey PRIMARY KEY (id);


--
-- Name: work_ratings work_ratings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_ratings
    ADD CONSTRAINT work_ratings_pkey PRIMARY KEY (id);


--
-- Name: work_reviews work_reviews_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_reviews
    ADD CONSTRAINT work_reviews_pkey PRIMARY KEY (id);


--
-- Name: idx_dominios_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dominios_status ON public.dominios USING btree (status);


--
-- Name: agentes_frases agentes_frases_agente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agentes_frases
    ADD CONSTRAINT agentes_frases_agente_id_fkey FOREIGN KEY (agente_id) REFERENCES public.catalogo_agentes(id) ON DELETE CASCADE;


--
-- Name: agentes_motor_escrita agentes_motor_escrita_agente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agentes_motor_escrita
    ADD CONSTRAINT agentes_motor_escrita_agente_id_fkey FOREIGN KEY (agente_id) REFERENCES public.catalogo_agentes(id) ON DELETE CASCADE;


--
-- Name: agentes_personalidade agentes_personalidade_agente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agentes_personalidade
    ADD CONSTRAINT agentes_personalidade_agente_id_fkey FOREIGN KEY (agente_id) REFERENCES public.catalogo_agentes(id) ON DELETE CASCADE;


--
-- Name: capacidades_agente capacidades_agente_agente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.capacidades_agente
    ADD CONSTRAINT capacidades_agente_agente_id_fkey FOREIGN KEY (agente_id) REFERENCES public.catalogo_agentes(id) ON DELETE CASCADE;


--
-- Name: commission_events commission_events_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.commission_events
    ADD CONSTRAINT commission_events_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.team_members(id);


--
-- Name: delegacao_escalations delegacao_escalations_escalado_de_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delegacao_escalations
    ADD CONSTRAINT delegacao_escalations_escalado_de_id_fkey FOREIGN KEY (escalado_de_id) REFERENCES public.team_members(id);


--
-- Name: delegacao_escalations delegacao_escalations_escalado_para_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delegacao_escalations
    ADD CONSTRAINT delegacao_escalations_escalado_para_id_fkey FOREIGN KEY (escalado_para_id) REFERENCES public.team_members(id);


--
-- Name: delegacao_justificativas delegacao_justificativas_aprovado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delegacao_justificativas
    ADD CONSTRAINT delegacao_justificativas_aprovado_por_fkey FOREIGN KEY (aprovado_por) REFERENCES public.team_members(id);


--
-- Name: delegacao_justificativas delegacao_justificativas_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delegacao_justificativas
    ADD CONSTRAINT delegacao_justificativas_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.team_members(id);


--
-- Name: delegacoes delegacoes_assigned_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delegacoes
    ADD CONSTRAINT delegacoes_assigned_member_id_fkey FOREIGN KEY (assigned_member_id) REFERENCES public.team_members(id);


--
-- Name: delegacoes delegacoes_concluido_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delegacoes
    ADD CONSTRAINT delegacoes_concluido_por_fkey FOREIGN KEY (concluido_por) REFERENCES public.team_members(id);


--
-- Name: delegacoes delegacoes_criado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delegacoes
    ADD CONSTRAINT delegacoes_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES public.team_members(id);


--
-- Name: disciplinary_events disciplinary_events_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.disciplinary_events
    ADD CONSTRAINT disciplinary_events_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.team_members(id);


--
-- Name: narrativas_agente narrativas_agente_agente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.narrativas_agente
    ADD CONSTRAINT narrativas_agente_agente_id_fkey FOREIGN KEY (agente_id) REFERENCES public.catalogo_agentes(id) ON DELETE CASCADE;


--
-- Name: sla_monitoring sla_monitoring_delegacao_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sla_monitoring
    ADD CONSTRAINT sla_monitoring_delegacao_id_fkey FOREIGN KEY (delegacao_id) REFERENCES public.delegacoes(id);


--
-- Name: team_email_aliases team_email_aliases_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_email_aliases
    ADD CONSTRAINT team_email_aliases_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.team_members(id) ON DELETE SET NULL;


--
-- Name: team_members team_members_cargo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_members
    ADD CONSTRAINT team_members_cargo_id_fkey FOREIGN KEY (cargo_id) REFERENCES public.team_positions(id);


--
-- Name: work_ratings work_ratings_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_ratings
    ADD CONSTRAINT work_ratings_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.team_members(id);


--
-- Name: work_ratings work_ratings_review_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_ratings
    ADD CONSTRAINT work_ratings_review_id_fkey FOREIGN KEY (review_id) REFERENCES public.work_reviews(id);


--
-- Name: work_reviews work_reviews_demanda_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_reviews
    ADD CONSTRAINT work_reviews_demanda_id_fkey FOREIGN KEY (demanda_id) REFERENCES public.delegacoes(id);


--
-- Name: work_reviews work_reviews_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_reviews
    ADD CONSTRAINT work_reviews_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.team_members(id);


--
-- PostgreSQL database dump complete
--

\unrestrict YMiRR1zElWVG2FgUWL8rpK3hTLVgr5uzFWIHCa6RBXgZBm6J94CzKNUDI09R3TZ

