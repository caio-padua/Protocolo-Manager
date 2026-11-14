/**
 * Catálogo comercial PaxMed (planos, módulos, serviços, complementos, tarifas, custos, configuração, contratos).
 *
 * Princípios (ordem do CEO):
 *  - NADA comercial fixo na tela nem no motor: tudo mora nestas tabelas e é editável.
 *  - O preenchimento inicial (proposta) roda UMA vez (marcador em cat_config) e nunca sobrescreve edições:
 *    nem reinício, nem linha apagada pelo usuário volta sozinha.
 *  - Toda edição guarda versão; contratos congelam o plano aplicado (preço, desconto, franquia, módulos).
 *  - Campo desconhecido fica NULL ("não informado"): nenhuma margem real é calculada com fato inventado.
 *  - Cadastrar preço NÃO ativa integração: cada tarifa informa a disponibilidade real.
 */
import { pool } from "@workspace/db";
import { definirTarifa, type TipoEvento } from "./mensageria-credito";

export const AMBIENTE_PADRAO = "homologacao";
export const PROPOSTA_REF = "Proposta comercial de homologação do CEO";
export const PROPOSTA_DATA = "2026-11-14";

let _pronto: Promise<void> | null = null;
export function garantirCatalogo(): Promise<void> {
  _pronto ??= (async () => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS cat_config (
        chave TEXT PRIMARY KEY, valor JSONB, atualizado_por TEXT, atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS cat_versoes (
        id BIGSERIAL PRIMARY KEY, entidade TEXT NOT NULL, chave TEXT NOT NULL, versao INTEGER NOT NULL,
        snapshot JSONB NOT NULL, por TEXT, criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (entidade, chave, versao)
      );
      CREATE TABLE IF NOT EXISTS cat_planos (
        id SERIAL PRIMARY KEY, codigo TEXT UNIQUE NOT NULL, nome TEXT NOT NULL, descricao TEXT,
        preco_mensal_centavos BIGINT NOT NULL CHECK (preco_mensal_centavos >= 0),
        condicao_anual TEXT, desconto_anual_pct NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (desconto_anual_pct >= 0 AND desconto_anual_pct <= 100),
        compromisso_meses INTEGER NOT NULL DEFAULT 0, prescritores_incluidos INTEGER NOT NULL DEFAULT 0,
        unidades_incluidas INTEGER NOT NULL DEFAULT 1, modulos JSONB NOT NULL DEFAULT '[]'::jsonb,
        franquia_texto_centavos BIGINT NOT NULL DEFAULT 0 CHECK (franquia_texto_centavos >= 0),
        validade_proposta DATE, ambiente TEXT NOT NULL DEFAULT 'homologacao',
        vigencia_inicio DATE, vigencia_fim DATE, status TEXT NOT NULL DEFAULT 'proposta',
        observacoes TEXT, proposta_ref TEXT, proposta_data DATE, ordem INTEGER NOT NULL DEFAULT 0,
        versao INTEGER NOT NULL DEFAULT 1, atualizado_por TEXT, atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS cat_itens (
        id SERIAL PRIMARY KEY, tipo TEXT NOT NULL CHECK (tipo IN ('modulo','servico','complemento')),
        codigo TEXT UNIQUE NOT NULL, nome TEXT NOT NULL, descricao TEXT,
        preco_centavos BIGINT CHECK (preco_centavos IS NULL OR preco_centavos >= 0),
        unidade TEXT, recorrencia TEXT NOT NULL DEFAULT 'mensal',
        disponibilidade TEXT NOT NULL DEFAULT 'disponivel', escopo TEXT, observacao TEXT,
        status TEXT NOT NULL DEFAULT 'proposta', proposta_ref TEXT, proposta_data DATE, ordem INTEGER NOT NULL DEFAULT 0,
        versao INTEGER NOT NULL DEFAULT 1, atualizado_por TEXT, atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS cat_tarifas (
        id BIGSERIAL PRIMARY KEY, codigo TEXT NOT NULL, versao INTEGER NOT NULL, grupo TEXT NOT NULL,
        nome_evento TEXT NOT NULL, unidade TEXT NOT NULL, preco_centavos BIGINT CHECK (preco_centavos IS NULL OR preco_centavos >= 0),
        moeda TEXT NOT NULL DEFAULT 'BRL', vigencia_inicio TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        regra_cobranca TEXT, regra_fracionamento TEXT, elegivel_franquia BOOLEAN NOT NULL DEFAULT FALSE,
        disponibilidade TEXT NOT NULL DEFAULT 'cadastrado_nao_integrado', ativo BOOLEAN NOT NULL DEFAULT TRUE,
        observacao TEXT, proposta_ref TEXT, proposta_data DATE, criado_por TEXT, criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (codigo, versao)
      );
      CREATE TABLE IF NOT EXISTS cat_custos (
        id SERIAL PRIMARY KEY, codigo TEXT UNIQUE NOT NULL, tarifa_codigo TEXT, provedor TEXT NOT NULL, servico TEXT NOT NULL,
        moeda TEXT NOT NULL, unidade TEXT NOT NULL, custo_referencia NUMERIC(14,6), custo_referencia_saida NUMERIC(14,6),
        fonte TEXT, fonte_data DATE, fonte_oficial BOOLEAN NOT NULL DEFAULT FALSE, custo_efetivo NUMERIC(14,6),
        limite_clinica TEXT, observacao TEXT, versao INTEGER NOT NULL DEFAULT 1,
        atualizado_por TEXT, atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS cat_contratos (
        id SERIAL PRIMARY KEY, empresa_id INTEGER NOT NULL, plano_codigo TEXT NOT NULL, plano_versao INTEGER NOT NULL,
        plano_snapshot JSONB NOT NULL, rotulo TEXT, preco_mensal_centavos BIGINT NOT NULL, desconto_anual_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
        condicao TEXT NOT NULL DEFAULT 'mensal', compromisso_meses INTEGER NOT NULL DEFAULT 0,
        franquia_texto_centavos BIGINT NOT NULL DEFAULT 0, modulos JSONB NOT NULL DEFAULT '[]'::jsonb,
        vigencia_inicio DATE, vigencia_fim DATE, renovacao TEXT, reajuste_proposto_pct NUMERIC(6,2),
        juros_pct NUMERIC(6,2) NOT NULL DEFAULT 0, multa_pct NUMERIC(6,2) NOT NULL DEFAULT 0,
        ambiente TEXT NOT NULL DEFAULT 'homologacao', status TEXT NOT NULL DEFAULT 'piloto',
        criado_por TEXT, criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS cat_contratos_vigente_unico ON cat_contratos (empresa_id) WHERE status IN ('piloto','ativo');
      CREATE TABLE IF NOT EXISTS msg_franquia_uso (
        empresa_id INTEGER NOT NULL, mes TEXT NOT NULL, usado_centavos BIGINT NOT NULL DEFAULT 0,
        PRIMARY KEY (empresa_id, mes)
      );
    `);
    await aplicarProposta();
  })().catch((e) => { _pronto = null; throw e; });
  return _pronto;
}

// ─────────────────────────────────────────────────────────────────────────────
// Proposta inicial (dados, não código de tela). Roda uma única vez.
// ─────────────────────────────────────────────────────────────────────────────
const BASE = ["agenda", "pacientes", "cockpit", "prescricao_protocolo_basico", "documentos", "area_cliente"];
const OPERACAO = [...BASE, "protocolos_avancados", "aplicacoes_rasp", "estoque", "orcamento_crm"];
const AUTOMACAO = [...OPERACAO, "financeiro_avancado", "exames", "indicadores"];

const PLANOS = [
  { codigo: "nucleo", nome: "Núcleo", descricao: "Agenda, pacientes, Cockpit, prescrição e protocolo básico, documentos e Área do Cliente.", preco: 49700, desc: 10, comp: 0, presc: 2, un: 1, mods: BASE, franq: 0,
    cond: "Pagamento anual antecipado com desconto proposto; mensal sem compromisso." },
  { codigo: "operacao", nome: "Operação", descricao: "Tudo do Núcleo mais protocolos avançados, aplicações/RASP, estoque, orçamento e CRM.", preco: 99700, desc: 10, comp: 0, presc: 5, un: 1, mods: OPERACAO, franq: 0,
    cond: "Pagamento anual antecipado com desconto proposto; mensal sem compromisso." },
  { codigo: "automacao", nome: "Automação", descricao: "Tudo da Operação mais financeiro avançado, exames e indicadores.", preco: 179700, desc: 10, comp: 0, presc: 10, un: 1, mods: AUTOMACAO, franq: 50000,
    cond: "Pagamento anual antecipado com desconto proposto; mensal sem compromisso." },
  { codigo: "full", nome: "Full", descricao: "Capacidades da Automação, 2 unidades e franquia de texto ampliada.", preco: 350000, desc: 0, comp: 12, presc: 10, un: 2, mods: AUTOMACAO, franq: 400000,
    cond: "Compromisso de 12 meses, sem desconto acumulado.",
    obs: "Proposta sujeita à validação de custo do piloto. Sem consumo ilimitado: a franquia é limitada." },
];

const MODULOS_BASE = [
  ["agenda", "Agenda"], ["pacientes", "Pacientes"], ["cockpit", "Cockpit da Consulta"],
  ["prescricao_protocolo_basico", "Prescrição e protocolo básico"], ["documentos", "Documentos"], ["area_cliente", "Área do Cliente"],
];
const MODULOS_AVULSOS: Array<[string, string, number]> = [
  ["protocolos_avancados", "Protocolos avançados", 29900], ["aplicacoes_rasp", "Aplicações e RASP", 19900], ["estoque", "Estoque", 14900],
  ["orcamento_crm", "Orçamento e CRM", 19900], ["financeiro_avancado", "Financeiro avançado", 24900], ["exames", "Exames", 24900],
  ["indicadores", "Indicadores", 14900],
];

type Tarifa = { codigo: string; grupo: string; nome: string; unidade: string; preco: number; regra: string; fracao: string; franquia: boolean; disp: string; ativo?: boolean; obs?: string };
const TARIFAS: Tarifa[] = [
  { codigo: "msg_recebida", grupo: "mensageria", nome: "Recebimento válido de mensagem", unidade: "mensagem", preco: 3, regra: "Cobra ao receber mensagem válida, depois do filtro de abuso.", fracao: "Sem fracionamento.", franquia: true, disp: "integrado" },
  { codigo: "msg_enviada", grupo: "mensageria", nome: "Envio aceito de mensagem", unidade: "mensagem", preco: 12, regra: "Cobra somente quando o provedor aceitou o envio. Envio falho não é cobrável.", fracao: "Sem fracionamento.", franquia: true, disp: "integrado" },
  { codigo: "msg_solucionada", grupo: "mensageria", nome: "Solicitação solucionada pela automação", unidade: "solicitação", preco: 120, regra: "Cobra quando a automação conclui a solicitação sem humano. Encaminhamento ao humano não conta.", fracao: "Sem fracionamento.", franquia: true, disp: "integrado" },
  { codigo: "msg_tempo", grupo: "mensageria", nome: "Tempo ativo de processamento de IA de texto (alternativa)", unidade: "minuto", preco: 180, regra: "Alternativa à taxa de solicitação solucionada, nunca adicional à mesma resolução. Não cobra espera do paciente nem conversa aberta.", fracao: "Proporcional aos segundos de processamento ativo.", franquia: true, disp: "cadastrado_nao_integrado", ativo: false, obs: "Desativada por padrão." },
  { codigo: "exame_extracao_pagina", grupo: "documento", nome: "Extração de exame", unidade: "página", preco: 49, regra: "Por página processada.", fracao: "Por página inteira.", franquia: false, disp: "cadastrado_nao_integrado" },
  { codigo: "ia_resumo_documento", grupo: "ia", nome: "Organização/resumo com IA", unidade: "documento", preco: 390, regra: "Por documento processado.", fracao: "Por documento.", franquia: false, disp: "cadastrado_nao_integrado" },
  { codigo: "transcricao_minuto", grupo: "voz", nome: "Transcrição", unidade: "minuto", preco: 12, regra: "Pela duração real do áudio.", fracao: "Segundos reais, arredondados para cima ao segundo; valor final arredondado para cima ao centavo.", franquia: false, disp: "cadastrado_nao_integrado" },
  { codigo: "voz_flash_turbo", grupo: "voz", nome: "Voz ElevenLabs Flash/Turbo", unidade: "mil caracteres", preco: 190, regra: "Por caracteres sintetizados.", fracao: "Proporcional aos caracteres; arredondado para cima ao centavo.", franquia: false, disp: "cadastrado_nao_integrado" },
  { codigo: "voz_v3", grupo: "voz", nome: "Voz ElevenLabs v3", unidade: "mil caracteres", preco: 390, regra: "Por caracteres sintetizados.", fracao: "Proporcional aos caracteres; arredondado para cima ao centavo.", franquia: false, disp: "cadastrado_nao_integrado" },
  { codigo: "video_avatar3", grupo: "video", nome: "Vídeo HeyGen Avatar III Digital Twin", unidade: "minuto", preco: 1990, regra: "Pela duração real do vídeo gerado.", fracao: "Segundos reais, arredondados para cima ao segundo; valor final arredondado para cima ao centavo.", franquia: false, disp: "cadastrado_nao_integrado" },
  { codigo: "video_avatar4", grupo: "video", nome: "Vídeo HeyGen Avatar IV Digital Twin", unidade: "minuto", preco: 15990, regra: "Pela duração real do vídeo gerado.", fracao: "Segundos reais, arredondados para cima ao segundo; valor final arredondado para cima ao centavo.", franquia: false, disp: "cadastrado_nao_integrado" },
  { codigo: "video_avatar5", grupo: "video", nome: "Vídeo HeyGen Avatar V Digital Twin", unidade: "minuto", preco: 23990, regra: "Pela duração real do vídeo gerado.", fracao: "Segundos reais, arredondados para cima ao segundo; valor final arredondado para cima ao centavo.", franquia: false, disp: "cadastrado_nao_integrado" },
  { codigo: "assinatura_externa", grupo: "assinatura", nome: "Assinatura por provedor externo", unidade: "documento", preco: 1490, regra: "Por documento assinado fora da rubrica nativa. A rubrica nativa do paciente está incluída e não é cobrada.", fracao: "Por documento.", franquia: false, disp: "cadastrado_nao_integrado" },
];

const ITENS: Array<{ tipo: string; codigo: string; nome: string; preco: number | null; unidade: string; rec: string; disp: string; obs?: string; escopo?: string }> = [
  ...MODULOS_BASE.map(([c, n]) => ({ tipo: "modulo", codigo: c, nome: n, preco: null, unidade: "módulo", rec: "incluido_no_plano", disp: "disponivel", obs: "Incluído em todos os planos; não vendido avulso." })),
  ...MODULOS_AVULSOS.map(([c, n, p]) => ({ tipo: "modulo", codigo: c, nome: n, preco: p, unidade: "mês", rec: "mensal", disp: "disponivel", obs: c === "exames" ? "Processamento por consumo cobrado à parte (tarifa de extração)." : "Só cobrar quando fora do plano; nunca duas vezes." })),
  { tipo: "modulo", codigo: "unidade_adicional", nome: "Unidade adicional", preco: 24900, unidade: "unidade/mês", rec: "mensal", disp: "disponivel", obs: "Outra clínica independente exige contrato e isolamento próprios." },
  { tipo: "modulo", codigo: "prescritor_adicional", nome: "Prescritor adicional", preco: 7900, unidade: "prescritor/mês", rec: "mensal", disp: "disponivel", obs: "Profissionais administrativos e pacientes não contam como prescritores." },
  { tipo: "modulo", codigo: "suporte_prioritario", nome: "Suporte prioritário", preco: 79000, unidade: "mês", rec: "mensal", disp: "a_validar", escopo: "Escopo e prazo de atendimento a definir.", obs: "Valor a validar; escopo e prazo editáveis." },
  { tipo: "servico", codigo: "implantacao", nome: "Implantação", preco: 99000, unidade: "serviço", rec: "unico", disp: "disponivel", obs: "Não é receita recorrente." },
  { tipo: "servico", codigo: "migracao_assistida", nome: "Migração assistida", preco: 299000, unidade: "serviço", rec: "unico", disp: "disponivel", escopo: "Escopo definido em proposta própria.", obs: "Não é receita recorrente." },
  { tipo: "servico", codigo: "treinamento_adicional", nome: "Treinamento adicional", preco: 19500, unidade: "hora", rec: "hora", disp: "disponivel" },
  { tipo: "servico", codigo: "integracao_personalizada", nome: "Integração personalizada", preco: 19500, unidade: "hora", rec: "hora", disp: "disponivel" },
  { tipo: "complemento", codigo: "biblioteca_profissional_adicional", nome: "Biblioteca profissional adicional", preco: 19900, unidade: "mês", rec: "mensal", disp: "nao_integrado", obs: "Conteúdo depende de autoria, autorização e revisão; não implica prescrição automática. A biblioteca da clínica já está incluída." },
  { tipo: "complemento", codigo: "api_integracao", nome: "API de integração", preco: 19900, unidade: "mês", rec: "mensal", disp: "nao_integrado", obs: "Implantação orçada à parte." },
  { tipo: "complemento", codigo: "armazenamento_extra", nome: "Armazenamento extra", preco: 3990, unidade: "10 GB/mês", rec: "mensal", disp: "nao_integrado", obs: "Armazenamento não sai da franquia de texto." },
  { tipo: "complemento", codigo: "ambiente_dedicado", nome: "Ambiente dedicado", preco: null, unidade: "sob orçamento", rec: "sob_orcamento", disp: "sob_orcamento", obs: "Custo ainda não levantado: valor pendente, sem estimativa inventada." },
];

const CUSTOS = [
  { codigo: "anthropic_sonnet_4_6", tarifa: null, provedor: "Anthropic", servico: "Claude Sonnet 4.6 (tokens)", moeda: "USD", unidade: "milhão de tokens (entrada/saída)", ref: 3, refSaida: 15, fonte: "Informado pelo CEO; não localizado na tabela oficial atual (docs.anthropic.com, conferida em 14/11/2026).", oficial: false },
  { codigo: "anthropic_sonnet_5_5", tarifa: null, provedor: "Anthropic", servico: "Claude Sonnet 5.5 (tokens)", moeda: "USD", unidade: "milhão de tokens (entrada/saída)", ref: 2, refSaida: 10, fonte: "https://docs.anthropic.com/en/docs/about-claude/pricing (conferida em 14/11/2026). Modelo cadastrado não significa integrado.", oficial: true },
  { codigo: "elevenlabs_flash_turbo", tarifa: "voz_flash_turbo", provedor: "ElevenLabs", servico: "Flash/Turbo", moeda: "USD", unidade: "mil caracteres", ref: 0.04, fonte: "https://elevenlabs.io/pricing/api (conferida em 14/11/2026).", oficial: true },
  { codigo: "elevenlabs_v3", tarifa: "voz_v3", provedor: "ElevenLabs", servico: "v3", moeda: "USD", unidade: "mil caracteres", ref: 0.08, fonte: "https://elevenlabs.io/pricing/api (conferida em 14/11/2026).", oficial: true },
  { codigo: "elevenlabs_scribe", tarifa: "transcricao_minuto", provedor: "ElevenLabs", servico: "Scribe", moeda: "USD", unidade: "hora de áudio", ref: 0.2, fonte: "https://elevenlabs.io/pricing/api (valor 0,20 conferido; unidade hora conforme informado pelo CEO). Consumo medido em minutos.", oficial: true },
  { codigo: "heygen_avatar3", tarifa: "video_avatar3", provedor: "HeyGen", servico: "Avatar III Digital Twin", moeda: "USD", unidade: "minuto", ref: 0.6, fonte: "Fonte secundária (adsgen.ai, 14/11/2026). Página oficial não obtida.", oficial: false },
  { codigo: "heygen_avatar4", tarifa: "video_avatar4", provedor: "HeyGen", servico: "Avatar IV Digital Twin", moeda: "USD", unidade: "minuto", ref: 4.83, fonte: "Informado pelo CEO. Página oficial não obtida.", oficial: false },
  { codigo: "heygen_avatar5", tarifa: "video_avatar5", provedor: "HeyGen", servico: "Avatar V Digital Twin", moeda: "USD", unidade: "minuto", ref: 7.2, fonte: "Fonte secundária (adsgen.ai, 14/11/2026). Página oficial não obtida.", oficial: false },
  { codigo: "assinatura_externa_provedor", tarifa: "assinatura_externa", provedor: "Provedor de assinatura", servico: "Assinatura por documento", moeda: "BRL", unidade: "documento", ref: null, fonte: "Custo contratado não informado.", oficial: false },
];

const CONFIG_INICIAL: Record<string, unknown> = {
  margem_alvo_pct: 70,
  cambio_efetivo: null,
  cambio_planejamento: null,
  cambio_planejamento_rotulo: "Hipótese de planejamento (não é câmbio efetivo). Informe para ver cenário.",
  impostos_pct: null,
  custo_infraestrutura_mensal_centavos: null,
  custo_suporte_mensal_centavos: null,
  recargas_sugeridas_centavos: [5000, 10000, 30000, 50000, 100000],
  recarga_bonus_automatico: false,
  alertas_pct: [50, 80, 95],
  alerta_saldo_zero: true,
  credito_comprado_expira: "nunca",
  franquia_acumula: false,
  juros_padrao_pct: 0,
  multa_padrao_pct: 0,
  cobranca_recorrente_automatica: false,
  limite_frequencia_visitante_por_hora: 30,
  regra_limite_frequencia: "Mensagens acima do limite por hora não geram cobrança nem resposta; o filtro roda antes do registro do evento.",
};

async function aplicarProposta(): Promise<void> {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    // Trava de execução única: quem ganhar a corrida semeia, o outro espera e vê o marcador.
    await c.query("SELECT pg_advisory_xact_lock(7790001)");
    const ja = await c.query(`SELECT 1 FROM cat_config WHERE chave = 'proposta_inicial_aplicada'`);
    if (ja.rows.length === 0) {
      let ordem = 0;
      for (const p of PLANOS) {
        await c.query(
          `INSERT INTO cat_planos (codigo, nome, descricao, preco_mensal_centavos, condicao_anual, desconto_anual_pct, compromisso_meses,
             prescritores_incluidos, unidades_incluidas, modulos, franquia_texto_centavos, validade_proposta, ambiente, vigencia_inicio,
             status, observacoes, proposta_ref, proposta_data, ordem, atualizado_por)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,'2026-12-31',$12,'2026-11-14','proposta',$13,$14,$15,$16,'proposta inicial')
           ON CONFLICT (codigo) DO NOTHING`,
          [p.codigo, p.nome, p.descricao, p.preco, p.cond, p.desc, p.comp, p.presc, p.un, JSON.stringify(p.mods), p.franq, AMBIENTE_PADRAO,
            (p as { obs?: string }).obs ?? null, PROPOSTA_REF, PROPOSTA_DATA, ++ordem]);
      }
      ordem = 0;
      for (const i of ITENS) {
        await c.query(
          `INSERT INTO cat_itens (tipo, codigo, nome, preco_centavos, unidade, recorrencia, disponibilidade, escopo, observacao, status, proposta_ref, proposta_data, ordem, atualizado_por)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'proposta',$10,$11,$12,'proposta inicial') ON CONFLICT (codigo) DO NOTHING`,
          [i.tipo, i.codigo, i.nome, i.preco, i.unidade, i.rec, i.disp, i.escopo ?? null, i.obs ?? null, PROPOSTA_REF, PROPOSTA_DATA, ++ordem]);
      }
      for (const t of TARIFAS) {
        await c.query(
          `INSERT INTO cat_tarifas (codigo, versao, grupo, nome_evento, unidade, preco_centavos, regra_cobranca, regra_fracionamento,
             elegivel_franquia, disponibilidade, ativo, observacao, proposta_ref, proposta_data, criado_por)
           VALUES ($1,1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'proposta inicial') ON CONFLICT (codigo, versao) DO NOTHING`,
          [t.codigo, t.grupo, t.nome, t.unidade, t.preco, t.regra, t.fracao, t.franquia, t.disp, t.ativo ?? true, t.obs ?? null, PROPOSTA_REF, PROPOSTA_DATA]);
      }
      for (const k of CUSTOS) {
        await c.query(
          `INSERT INTO cat_custos (codigo, tarifa_codigo, provedor, servico, moeda, unidade, custo_referencia, custo_referencia_saida, fonte, fonte_data, fonte_oficial, atualizado_por)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'2026-11-14',$10,'proposta inicial') ON CONFLICT (codigo) DO NOTHING`,
          [k.codigo, k.tarifa, k.provedor, k.servico, k.moeda, k.unidade, k.ref, (k as { refSaida?: number }).refSaida ?? null, k.fonte, k.oficial]);
      }
      for (const [chave, valor] of Object.entries(CONFIG_INICIAL)) {
        await c.query(`INSERT INTO cat_config (chave, valor, atualizado_por) VALUES ($1,$2::jsonb,'proposta inicial') ON CONFLICT (chave) DO NOTHING`, [chave, JSON.stringify(valor)]);
      }
      await c.query(`INSERT INTO cat_config (chave, valor, atualizado_por) VALUES ('proposta_inicial_aplicada', $1::jsonb, 'sistema')`,
        [JSON.stringify({ em: new Date().toISOString(), ref: PROPOSTA_REF, data: PROPOSTA_DATA })]);
    }
    await c.query("COMMIT");
  } catch (e) {
    await c.query("ROLLBACK").catch(() => {});
    throw e;
  } finally { c.release(); }

  // Motor de cobrança lê msg_tarifas: espelha a proposta UMA vez só onde ainda não existe tarifa padrão.
  const jaEspelhou = await pool.query(`SELECT 1 FROM cat_config WHERE chave = 'tarifas_motor_espelhadas'`);
  if (jaEspelhou.rows.length === 0) {
    for (const t of TARIFAS.filter((x) => x.grupo === "mensageria")) {
      const tipo = TIPO_DO_CODIGO[t.codigo];
      const existe = await pool.query(`SELECT 1 FROM msg_tarifas WHERE empresa_id IS NULL AND tipo_evento = $1 LIMIT 1`, [tipo]).catch(() => ({ rows: [] as unknown[] }));
      if (existe.rows.length === 0) {
        await definirTarifa({ empresaId: null, tipo, valorCentavos: t.preco, ativo: t.ativo ?? true,
          unidade: tipo === "tempo" ? "minuto" : undefined, criterio: tipo === "tempo" ? "tempo ativo de processamento, proporcional aos segundos" : undefined, por: "proposta inicial" });
      }
    }
    await pool.query(`INSERT INTO cat_config (chave, valor, atualizado_por) VALUES ('tarifas_motor_espelhadas','true'::jsonb,'sistema') ON CONFLICT (chave) DO NOTHING`);
  }
}

export const TIPO_DO_CODIGO: Record<string, TipoEvento> = {
  msg_recebida: "recebida", msg_enviada: "enviada", msg_solucionada: "solucionada", msg_tempo: "tempo",
};

// ─────────────────────────────────────────────────────────────────────────────
// Leitura
// ─────────────────────────────────────────────────────────────────────────────
const num = (v: unknown) => (v == null ? null : Number(v));

export function financeiroDoPlano(p: { preco_mensal_centavos: number; desconto_anual_pct: number; compromisso_meses: number }) {
  const mensal = Number(p.preco_mensal_centavos);
  const desc = Number(p.desconto_anual_pct);
  const doze = mensal * 12;
  const anualAntecipado = Math.round(doze * (1 - desc / 100));
  return {
    mensalidadeCentavos: mensal,
    compromissoMeses: Number(p.compromisso_meses),
    totalCompromissoCentavos: mensal * Number(p.compromisso_meses),
    totalAnualSemDescontoCentavos: doze,
    descontoAnualPct: desc,
    totalAnualAntecipadoCentavos: anualAntecipado,
    equivalenteMensalAnualCentavos: Math.round(anualAntecipado / 12),
    economiaAnualCentavos: doze - anualAntecipado,
  };
}

export async function lerCatalogo() {
  await garantirCatalogo();
  const [pl, it, ta, cu, cf] = await Promise.all([
    pool.query(`SELECT * FROM cat_planos ORDER BY ordem, id`),
    pool.query(`SELECT * FROM cat_itens ORDER BY tipo, ordem, id`),
    pool.query(`SELECT DISTINCT ON (codigo) * FROM cat_tarifas ORDER BY codigo, versao DESC`),
    pool.query(`SELECT * FROM cat_custos ORDER BY id`),
    pool.query(`SELECT chave, valor FROM cat_config WHERE chave <> 'proposta_inicial_aplicada' AND chave <> 'tarifas_motor_espelhadas'`),
  ]);
  const planos = pl.rows.map((p) => ({ ...p, preco_mensal_centavos: Number(p.preco_mensal_centavos), franquia_texto_centavos: Number(p.franquia_texto_centavos),
    desconto_anual_pct: Number(p.desconto_anual_pct), financeiro: financeiroDoPlano({ ...p, preco_mensal_centavos: Number(p.preco_mensal_centavos), desconto_anual_pct: Number(p.desconto_anual_pct) }) }));
  const config: Record<string, unknown> = {};
  for (const r of cf.rows) config[r.chave] = r.valor;
  return {
    planos,
    itens: it.rows.map((i) => ({ ...i, preco_centavos: num(i.preco_centavos) })),
    tarifas: ta.rows.map((t) => ({ ...t, preco_centavos: num(t.preco_centavos) })),
    custos: cu.rows.map((c) => ({ ...c, custo_referencia: num(c.custo_referencia), custo_referencia_saida: num(c.custo_referencia_saida), custo_efetivo: num(c.custo_efetivo) })),
    config,
  };
}

/** Módulos avulsos cobráveis: o que foi pedido e NÃO está no plano (nunca cobra duas vezes). */
export function modulosAvulsosCobraveis(planoModulos: string[], pedidos: string[]): string[] {
  const inc = new Set(planoModulos);
  return [...new Set(pedidos)].filter((m) => !inc.has(m));
}

/** Consumo fracionado por duração/caracteres: arredonda para cima, sempre verificável. */
export function calcularFracionado(precoUnitarioCentavos: number, unidade: "minuto" | "mil_caracteres", quantidade: number): number {
  if (!Number.isFinite(quantidade) || quantidade < 0) throw new RangeError("quantidade inválida");
  if (unidade === "minuto") return Math.ceil((precoUnitarioCentavos * Math.ceil(quantidade)) / 60); // quantidade em segundos
  return Math.ceil((precoUnitarioCentavos * Math.ceil(quantidade)) / 1000);
}

// ─────────────────────────────────────────────────────────────────────────────
// Escrita (sempre versionada)
// ─────────────────────────────────────────────────────────────────────────────
async function versionar(c: { query: (q: string, v?: unknown[]) => Promise<{ rows: any[] }> }, entidade: string, chave: string, versao: number, snap: unknown, por: string) {
  await c.query(`INSERT INTO cat_versoes (entidade, chave, versao, snapshot, por) VALUES ($1,$2,$3,$4::jsonb,$5) ON CONFLICT DO NOTHING`, [entidade, chave, versao, JSON.stringify(snap), por]);
}

const CAMPOS_PLANO: Record<string, string> = {
  nome: "text", descricao: "text", preco_mensal_centavos: "int", condicao_anual: "text", desconto_anual_pct: "num", compromisso_meses: "int",
  prescritores_incluidos: "int", unidades_incluidas: "int", modulos: "json", franquia_texto_centavos: "int", validade_proposta: "date",
  ambiente: "text", vigencia_inicio: "date", vigencia_fim: "date", status: "text", observacoes: "text",
};
const CAMPOS_ITEM: Record<string, string> = { nome: "text", descricao: "text", preco_centavos: "int", unidade: "text", recorrencia: "text", disponibilidade: "text", escopo: "text", observacao: "text", status: "text" };
const CAMPOS_CUSTO: Record<string, string> = { custo_referencia: "num", custo_referencia_saida: "num", fonte: "text", fonte_data: "date", fonte_oficial: "bool", custo_efetivo: "num", limite_clinica: "text", observacao: "text", moeda: "text", unidade: "text", servico: "text", provedor: "text" };

function validar(campos: Record<string, string>, body: Record<string, unknown>) {
  const sets: string[] = []; const vals: unknown[] = [];
  for (const [k, tipo] of Object.entries(campos)) {
    if (!(k in body)) continue;
    let v = body[k];
    if (v === "" ) v = null;
    if (v !== null) {
      if (tipo === "int" && !(typeof v === "number" && Number.isSafeInteger(v) && v >= 0)) throw new RangeError(`${k}: inteiro não negativo`);
      if (tipo === "num" && !(typeof v === "number" && Number.isFinite(v) && v >= 0)) throw new RangeError(`${k}: número não negativo`);
      if (tipo === "bool" && typeof v !== "boolean") throw new RangeError(`${k}: verdadeiro/falso`);
      if ((tipo === "text" || tipo === "date") && typeof v !== "string") throw new RangeError(`${k}: texto`);
      if (tipo === "json" && !Array.isArray(v)) throw new RangeError(`${k}: lista`);
    }
    vals.push(tipo === "json" ? JSON.stringify(v) : v);
    sets.push(`${k} = $${vals.length}${tipo === "json" ? "::jsonb" : ""}`);
  }
  if (!sets.length) throw new RangeError("nada para alterar");
  return { sets, vals };
}

async function txn<T>(fn: (c: { query: (q: string, v?: unknown[]) => Promise<{ rows: any[] }> }) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try { await c.query("BEGIN"); const r = await fn(c as never); await c.query("COMMIT"); return r; }
  catch (e) { await c.query("ROLLBACK").catch(() => {}); throw e; } finally { c.release(); }
}

export async function editarPlano(codigo: string, body: Record<string, unknown>, por: string) {
  await garantirCatalogo();
  const { sets, vals } = validar(CAMPOS_PLANO, body);
  return txn(async (c) => {
    const ant = (await c.query(`SELECT * FROM cat_planos WHERE codigo = $1 FOR UPDATE`, [codigo])).rows[0];
    if (!ant) throw new RangeError("plano inexistente");
    await versionar(c, "plano", codigo, ant.versao, ant, por);
    vals.push(por, codigo);
    const r = await c.query(`UPDATE cat_planos SET ${sets.join(", ")}, versao = versao + 1, atualizado_por = $${vals.length - 1}, atualizado_em = NOW() WHERE codigo = $${vals.length} RETURNING *`, vals);
    return r.rows[0];
  });
}

export async function criarPlano(body: Record<string, unknown>, por: string) {
  await garantirCatalogo();
  const codigo = String(body.codigo ?? "").trim().toLowerCase();
  if (!/^[a-z0-9_]{2,40}$/.test(codigo)) throw new RangeError("código: letras minúsculas, números e _");
  if (typeof body.nome !== "string" || !body.nome.trim()) throw new RangeError("nome obrigatório");
  await pool.query(`INSERT INTO cat_planos (codigo, nome, preco_mensal_centavos, ambiente, status, atualizado_por) VALUES ($1,$2,0,'homologacao','rascunho',$3)`, [codigo, body.nome.trim(), por]);
  const { codigo: _c, ...resto } = body; void _c;
  return Object.keys(resto).length > 1 ? editarPlano(codigo, resto, por) : (await pool.query(`SELECT * FROM cat_planos WHERE codigo=$1`, [codigo])).rows[0];
}

export async function editarItem(codigo: string, body: Record<string, unknown>, por: string) {
  await garantirCatalogo();
  const { sets, vals } = validar(CAMPOS_ITEM, body);
  return txn(async (c) => {
    const ant = (await c.query(`SELECT * FROM cat_itens WHERE codigo = $1 FOR UPDATE`, [codigo])).rows[0];
    if (!ant) throw new RangeError("item inexistente");
    await versionar(c, "item", codigo, ant.versao, ant, por);
    vals.push(por, codigo);
    return (await c.query(`UPDATE cat_itens SET ${sets.join(", ")}, versao = versao + 1, atualizado_por = $${vals.length - 1}, atualizado_em = NOW() WHERE codigo = $${vals.length} RETURNING *`, vals)).rows[0];
  });
}

export async function editarCusto(codigo: string, body: Record<string, unknown>, por: string) {
  await garantirCatalogo();
  const { sets, vals } = validar(CAMPOS_CUSTO, body);
  return txn(async (c) => {
    const ant = (await c.query(`SELECT * FROM cat_custos WHERE codigo = $1 FOR UPDATE`, [codigo])).rows[0];
    if (!ant) throw new RangeError("custo inexistente");
    await versionar(c, "custo", codigo, ant.versao, ant, por);
    vals.push(por, codigo);
    return (await c.query(`UPDATE cat_custos SET ${sets.join(", ")}, versao = versao + 1, atualizado_por = $${vals.length - 1}, atualizado_em = NOW() WHERE codigo = $${vals.length} RETURNING *`, vals)).rows[0];
  });
}

/** Nova versão da tarifa (linha nova). Para eventos de mensageria, o motor de cobrança recebe a mesma versão. */
export async function editarTarifa(codigo: string, body: Record<string, unknown>, por: string) {
  await garantirCatalogo();
  const ant = (await pool.query(`SELECT * FROM cat_tarifas WHERE codigo = $1 ORDER BY versao DESC LIMIT 1`, [codigo])).rows[0];
  if (!ant) throw new RangeError("tarifa inexistente");
  const pick = <T,>(k: string, d: T): T => (k in body ? (body[k] as T) : d);
  const preco = pick<number | null>("preco_centavos", num(ant.preco_centavos));
  if (preco !== null && !(typeof preco === "number" && Number.isSafeInteger(preco) && preco >= 0)) throw new RangeError("preco_centavos: inteiro não negativo");
  const ativo = pick<boolean>("ativo", ant.ativo);
  const unidade = pick<string>("unidade", ant.unidade);
  const regraCobranca = pick<string | null>("regra_cobranca", ant.regra_cobranca);
  const tipo = TIPO_DO_CODIGO[codigo];
  // Motor primeiro: se recusar (ex.: tempo ativo sem critério), nada é gravado no catálogo.
  if (tipo) {
    if (preco === null) throw new RangeError("tarifa do motor exige preço");
    await definirTarifa({ empresaId: null, tipo, valorCentavos: preco, ativo, unidade: tipo === "tempo" ? unidade : undefined,
      criterio: tipo === "tempo" ? (regraCobranca ?? undefined) : undefined, por });
  }
  const r = await pool.query(
    `INSERT INTO cat_tarifas (codigo, versao, grupo, nome_evento, unidade, preco_centavos, moeda, regra_cobranca, regra_fracionamento, elegivel_franquia,
       disponibilidade, ativo, observacao, proposta_ref, proposta_data, criado_por)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
    [codigo, ant.versao + 1, ant.grupo, pick("nome_evento", ant.nome_evento), unidade, preco, pick("moeda", ant.moeda), regraCobranca,
      pick("regra_fracionamento", ant.regra_fracionamento), pick("elegivel_franquia", ant.elegivel_franquia), pick("disponibilidade", ant.disponibilidade),
      ativo, pick("observacao", ant.observacao), ant.proposta_ref, ant.proposta_data, por]);
  return r.rows[0];
}

export async function editarConfig(chave: string, valor: unknown, por: string) {
  await garantirCatalogo();
  if (["proposta_inicial_aplicada", "tarifas_motor_espelhadas"].includes(chave)) throw new RangeError("chave reservada");
  const existe = await pool.query(`SELECT 1 FROM cat_config WHERE chave = $1`, [chave]);
  if (!existe.rows.length) throw new RangeError("configuração inexistente");
  await pool.query(`UPDATE cat_config SET valor = $2::jsonb, atualizado_por = $3, atualizado_em = NOW() WHERE chave = $1`, [chave, JSON.stringify(valor), por]);
}

// ─────────────────────────────────────────────────────────────────────────────
// Margem: custo, receita, contribuição e resultado distintos. Sem fato inventado.
// ─────────────────────────────────────────────────────────────────────────────
export async function analiseMargem() {
  const cat = await lerCatalogo();
  const cfg = cat.config as Record<string, any>;
  const cambioEfetivo = num(cfg.cambio_efetivo);
  const cambioPlan = num(cfg.cambio_planejamento);
  const metaPct = num(cfg.margem_alvo_pct);
  const linhas = cat.custos.map((k) => {
    const tarifa = cat.tarifas.find((t) => t.codigo === k.tarifa_codigo) ?? null;
    const receita = tarifa?.preco_centavos ?? null;
    const brl = (cambio: number | null) => {
      const ref = k.custo_efetivo ?? k.custo_referencia;
      if (ref == null) return null;
      if (k.moeda === "BRL") return Math.round(ref * 100);
      return cambio == null ? null : Math.round(ref * cambio * 100);
    };
    // Unidades: Scribe é por hora e a tarifa por minuto.
    const fator = k.codigo === "elevenlabs_scribe" ? 1 / 60 : 1;
    const fx = (v: number | null) => (v == null ? null : Math.round(v * fator));
    const custoReal = fx(brl(cambioEfetivo));
    const custoHip = fx(brl(cambioPlan));
    const contribuicao = (custo: number | null) => (receita == null || custo == null ? null : receita - custo);
    const margem = (custo: number | null) => (receita == null || custo == null || receita === 0 ? null : Math.round(((receita - custo) / receita) * 1000) / 10);
    return {
      custoCodigo: k.codigo, tarifaCodigo: k.tarifa_codigo, provedor: k.provedor, servico: k.servico, moedaCusto: k.moeda,
      receitaUnitariaCentavos: receita,
      real: { custoCentavos: custoReal, contribuicaoCentavos: contribuicao(custoReal), margemPct: margem(custoReal),
        situacao: custoReal == null ? "nao_informado" : "calculado" },
      hipotese: { custoCentavos: custoHip, contribuicaoCentavos: contribuicao(custoHip), margemPct: margem(custoHip),
        situacao: custoHip == null ? "nao_informado" : "hipotese", rotulo: "CENÁRIO DE PLANEJAMENTO (hipótese), não resultado real" },
      acimaDaMeta: margem(custoHip) == null || metaPct == null ? null : (margem(custoHip) as number) >= metaPct,
    };
  });
  return {
    margemAlvoPct: metaPct, cambioEfetivo, cambioPlanejamento: cambioPlan,
    aviso: cambioEfetivo == null
      ? "Câmbio efetivo, impostos, infraestrutura, suporte e custos contratados NÃO foram informados: nenhuma margem é apresentada como real."
      : "Margem real considera apenas os custos informados; itens não informados continuam fora do cálculo.",
    linhas,
    resultadoOperacional: { situacao: "nao_informado", motivo: "Exige impostos, infraestrutura e suporte informados." },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Contratos (piloto): congelam o plano aplicado
// ─────────────────────────────────────────────────────────────────────────────
export async function criarContrato(p: { empresaId: number; planoCodigo: string; rotulo: string; condicao?: "mensal" | "anual_antecipado"; por: string; ambiente?: string }) {
  await garantirCatalogo();
  if ((p.ambiente ?? AMBIENTE_PADRAO) !== "homologacao") throw new RangeError("somente homologação nesta implementação");
  return txn(async (c) => {
    const pl = (await c.query(`SELECT * FROM cat_planos WHERE codigo = $1`, [p.planoCodigo])).rows[0];
    if (!pl) throw new RangeError("plano inexistente");
    const vig = (await c.query(`SELECT id FROM cat_contratos WHERE empresa_id = $1 AND status IN ('piloto','ativo')`, [p.empresaId])).rows[0];
    if (vig) throw new RangeError("a clínica já tem contrato vigente; encerre-o antes");
    const cfg = (await c.query(`SELECT chave, valor FROM cat_config WHERE chave IN ('juros_padrao_pct','multa_padrao_pct')`)).rows;
    const g = (k: string) => Number(cfg.find((x) => x.chave === k)?.valor ?? 0);
    const r = await c.query(
      `INSERT INTO cat_contratos (empresa_id, plano_codigo, plano_versao, plano_snapshot, rotulo, preco_mensal_centavos, desconto_anual_pct, condicao,
         compromisso_meses, franquia_texto_centavos, modulos, vigencia_inicio, renovacao, juros_pct, multa_pct, ambiente, status, criado_por)
       VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7,$8,$9,$10,$11::jsonb,CURRENT_DATE,'Sem renovação automática (piloto)',$12,$13,'homologacao','piloto',$14) RETURNING *`,
      [p.empresaId, pl.codigo, pl.versao, JSON.stringify(pl), p.rotulo, pl.preco_mensal_centavos, pl.desconto_anual_pct, p.condicao ?? "mensal",
        pl.compromisso_meses, pl.franquia_texto_centavos, JSON.stringify(pl.modulos), g("juros_padrao_pct"), g("multa_padrao_pct"), p.por]);
    return r.rows[0];
  });
}

export async function contratoVigente(empresaId: number) {
  await garantirCatalogo();
  const r = await pool.query(`SELECT * FROM cat_contratos WHERE empresa_id = $1 AND status IN ('piloto','ativo') ORDER BY id DESC LIMIT 1`, [empresaId]);
  return r.rows[0] ?? null;
}

export async function contratosDeTodas() {
  await garantirCatalogo();
  return (await pool.query(`SELECT c.*, e.nome AS empresa_nome FROM cat_contratos c LEFT JOIN empresas e ON e.id = c.empresa_id ORDER BY c.id DESC`)).rows;
}

// ─────────────────────────────────────────────────────────────────────────────
// Franquia mensal: consumida ANTES do crédito comprado, não acumula, só elegíveis.
// ─────────────────────────────────────────────────────────────────────────────
export const mesDe = (d = new Date()) => {
  const f = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" }).format(d);
  return f.slice(0, 7);
};
