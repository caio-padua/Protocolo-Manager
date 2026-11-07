import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, locationsTable, locationProfessionalsTable, professionalsTable, sessionsTable, empresasTable } from "@workspace/db";
import { requireCollaborator } from "./collaborator";

const router: IRouter = Router();

// ── Motor ViaCEP: dado um CEP, retorna { logradouro, bairro, cidade, estado }
// Chamado automaticamente no POST/PUT de clínicas quando CEP é fornecido.
// Se o CEP for inválido ou o serviço estiver fora do ar, retorna null sem errar.
async function lookupCep(rawCep: string): Promise<{
  logradouro: string | null;
  bairro: string | null;
  cidade: string | null;
  estado: string | null;
} | null> {
  try {
    const cep = rawCep.replace(/\D/g, "");
    if (cep.length !== 8) return null;
    const resp = await fetch(`https://viacep.com.br/ws/${cep}/json/`, { signal: AbortSignal.timeout(5000) });
    if (!resp.ok) return null;
    const data = await resp.json() as Record<string, unknown>;
    if (data.erro) return null; // CEP não encontrado
    return {
      logradouro: (data.logradouro as string) || null,
      bairro:     (data.bairro     as string) || null,
      cidade:     (data.localidade as string) || null,
      estado:     (data.uf         as string) || null,
    };
  } catch {
    return null; // timeout ou erro de rede — não bloqueia o save
  }
}

// ── Motor de zona automático ──────────────────────────────────────────────────
// Deriva zona a partir do bairro + cidade + CEP.
// Nunca sobrescreve zona definida manualmente — só preenche quando zona está vazia.
// Regra SP: usa mapa de bairros conhecidos; fallback pelo prefixo do CEP (03xxx=Leste etc.)
// Regra outras cidades: usa o próprio bairro como zona quando não há mapa específico.

const BAIRRO_ZONA_SP: Record<string, string> = {
  // Zona Leste
  "tatuapé": "Zona Leste", "mooca": "Zona Leste", "vila formosa": "Zona Leste",
  "penha": "Zona Leste", "vila matilde": "Zona Leste", "ermelino matarazzo": "Zona Leste",
  "itaquera": "Zona Leste", "são miguel paulista": "Zona Leste", "guaianases": "Zona Leste",
  "cidade tiradentes": "Zona Leste", "jardim helena": "Zona Leste", "são lucas": "Zona Leste",
  "sapopemba": "Zona Leste", "belém": "Zona Leste", "brás": "Zona Leste",
  "pari": "Zona Leste", "água rasa": "Zona Leste", "vila prudente": "Zona Leste",
  "anália franco": "Zona Leste", "jardim anália franco": "Zona Leste",
  // Zona Oeste
  "pinheiros": "Zona Oeste", "perdizes": "Zona Oeste", "lapa": "Zona Oeste",
  "vila leopoldina": "Zona Oeste", "butantã": "Zona Oeste", "vila madalena": "Zona Oeste",
  "alto de pinheiros": "Zona Oeste", "jardim paulistano": "Zona Oeste",
  "itaim bibi": "Zona Oeste", "jardim europa": "Zona Oeste",
  // Zona Sul
  "moema": "Zona Sul", "vila mariana": "Zona Sul", "saúde": "Zona Sul",
  "jabaquara": "Zona Sul", "campo belo": "Zona Sul", "brooklin": "Zona Sul",
  "campo grande": "Zona Sul", "santo amaro": "Zona Sul", "capão redondo": "Zona Sul",
  "grajaú": "Zona Sul", "cidade ademar": "Zona Sul", "ipiranga": "Zona Sul",
  // Zona Norte
  "santana": "Zona Norte", "tucuruvi": "Zona Norte", "tremembé": "Zona Norte",
  "vila guilherme": "Zona Norte", "vila medeiros": "Zona Norte",
  "jaçanã": "Zona Norte", "mandaqui": "Zona Norte", "brasilândia": "Zona Norte",
  "casa verde": "Zona Norte", "limão": "Zona Norte",
  // Centro / Centro-Oeste
  "sé": "Centro", "república": "Centro", "liberdade": "Centro",
  "bela vista": "Centro", "consolação": "Centro", "santa cecília": "Centro",
  "bom retiro": "Centro", "cambuci": "Centro", "aclimação": "Centro",
  "higienópolis": "Centro-Oeste", "campos elíseos": "Centro",
};

const CEP_PREFIX_ZONA_SP: Record<string, string> = {
  "01": "Centro",     "02": "Zona Norte",  "03": "Zona Leste",
  "04": "Zona Sul",   "05": "Zona Oeste",  "06": "Grande SP Oeste",
  "07": "Grande SP Norte", "08": "Zona Leste",  "09": "Grande SP Sul",
};

const BAIRRO_ZONA_BSB: Record<string, string> = {
  "asa sul": "Asa Sul", "asa norte": "Asa Norte",
  "lago sul": "Lago Sul", "lago norte": "Lago Norte",
  "águas claras": "Águas Claras", "taguatinga": "Taguatinga",
  "ceilândia": "Ceilândia", "samambaia": "Samambaia",
  "guará": "Guará", "sobradinho": "Sobradinho",
  "planaltina": "Planaltina", "gama": "Gama",
  "park way": "Park Way", "sudoeste": "Sudoeste",
};

function deriveZona(bairro: string | null, cidade: string | null, estado: string | null, cep: string | null): string | null {
  const norm = (s: string | null) => s?.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim() ?? "";
  const b = norm(bairro);
  const c = norm(cidade);

  // São Paulo
  if (c === "sao paulo" || c === "são paulo") {
    if (b && BAIRRO_ZONA_SP[b]) return BAIRRO_ZONA_SP[b];
    // Fallback pelo CEP
    if (cep) {
      const prefix = cep.replace(/\D/g, "").slice(0, 2);
      if (CEP_PREFIX_ZONA_SP[prefix]) return CEP_PREFIX_ZONA_SP[prefix];
    }
  }

  // Brasília / DF
  if (c === "brasilia" || c === "brasília" || estado === "DF" || estado === "df") {
    if (b && BAIRRO_ZONA_BSB[b]) return BAIRRO_ZONA_BSB[b];
    if (bairro) return bairro; // usa o próprio bairro como zona em BSB
  }

  // Outras cidades: usa o bairro como zona se existir
  if (bairro) return bairro;

  return null;
}

function normalizePhone(raw: unknown): string | null {
  if (raw === undefined || raw === null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  if (s.startsWith("+")) {
    const digits = s.slice(1).replace(/\D/g, "");
    return digits ? "+" + digits : s; // fallback literal (caso extremo 3)
  }
  const digits = s.replace(/\D/g, "");
  if (!digits) return s; // sem dígitos -> preserva o que foi digitado (não bloquear)
  // Heurística Brasil: 10 ou 11 dígitos sem DDI -> prefixa +55
  if (digits.length === 10 || digits.length === 11) return "+55" + digits;
  return "+" + digits;
}

type EmpresaEndereco = {
  nome: string; endereco: string | null; cep: string | null; bairro: string | null;
  cidade: string | null; estado: string | null; zona: string | null; telefone: string | null;
};

// "Rua X, 327" -> { logradouro: "Rua X", numero: "327" }; sem numero -> so logradouro.
function splitEndereco(raw: string | null): { logradouro: string | null; numero: string | null } {
  if (!raw) return { logradouro: null, numero: null };
  const m = raw.match(/^(.*?),\s*(\d[\w./-]*)\s*$/);
  return m ? { logradouro: m[1].trim(), numero: m[2] } : { logradouro: raw.trim(), numero: null };
}

function textoEndereco(parts: { logradouro: string | null; numero: string | null; bairro: string | null; cidade: string | null; estado: string | null; cep: string | null }): string | null {
  const t = [
    [parts.logradouro, parts.numero].filter(Boolean).join(", "),
    parts.bairro,
    parts.cidade ? `${parts.cidade}${parts.estado ? " - " + parts.estado : ""}` : parts.estado,
    parts.cep ? `CEP ${parts.cep}` : "",
  ].filter(Boolean);
  return t.length ? t.join(", ") : null;
}

// Campos de endereco que o local herda da empresa quando e a SEDE.
function enderecoDaEmpresa(emp: EmpresaEndereco) {
  const { logradouro, numero } = splitEndereco(emp.endereco);
  const campos = {
    logradouro, numero, complemento: null as string | null, bairro: emp.bairro ?? null,
    cidade: emp.cidade ?? null, estado: emp.estado ?? null, cep: emp.cep ?? null,
    zona: emp.zona || deriveZona(emp.bairro ?? null, emp.cidade ?? null, emp.estado ?? null, emp.cep ?? null),
  };
  return { ...campos, address: textoEndereco(campos) };
}

async function carregarEmpresa(empresaId: number | null): Promise<EmpresaEndereco | null> {
  if (!empresaId) return null;
  const [emp] = await db.select({
    nome: empresasTable.nome, endereco: empresasTable.endereco, cep: empresasTable.cep,
    bairro: empresasTable.bairro, cidade: empresasTable.cidade, estado: empresasTable.estado,
    zona: empresasTable.zona, telefone: empresasTable.telefone,
  }).from(empresasTable).where(eq(empresasTable.id, empresaId));
  return emp ?? null;
}

function modalidadeValida(v: unknown): "presencial" | "online" | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  return v === "presencial" || v === "online" ? v : undefined;
}

const PAPEIS_AGENDA = ["local", "remoto", "externo", "pessoal", "geral"] as const;
function papelValido(v: unknown): (typeof PAPEIS_AGENDA)[number] | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  return (PAPEIS_AGENDA as readonly string[]).includes(String(v)) ? (v as (typeof PAPEIS_AGENDA)[number]) : undefined;
}
function textoOpcional(v: unknown, max = 500): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  const t = String(v).trim();
  return t ? t.slice(0, max) : null;
}

function serializeLocation(loc: typeof locationsTable.$inferSelect, emp?: EmpresaEndereco | null) {
  // Sede: o endereco exibido e SEMPRE o atual da empresa (nao fica velho se a empresa mudar).
  const herda = loc.mesmoEnderecoEmpresa && (loc.modalidade === "presencial" || loc.modalidade === "online") && emp ? enderecoDaEmpresa(emp) : null;
  return {
    id: loc.id,
    name: loc.name,
    address: herda ? herda.address : (loc.address ?? null),
    type: loc.type,
    color: loc.color,
    active: loc.active === "true",
    googleCalendarId: loc.googleCalendarId ?? null,
    phone: loc.phone ?? null,
    cep: herda ? herda.cep : (loc.cep ?? null),
    logradouro: herda ? herda.logradouro : (loc.logradouro ?? null),
    numero: herda ? herda.numero : (loc.numero ?? null),
    complemento: herda ? herda.complemento : (loc.complemento ?? null),
    bairro: herda ? herda.bairro : (loc.bairro ?? null),
    cidade: herda ? herda.cidade : (loc.cidade ?? null),
    estado: herda ? herda.estado : (loc.estado ?? null),
    zona: herda ? herda.zona : (loc.zona ?? null),
    createdAt: loc.createdAt.toISOString(),
    cnpj: loc.cnpj ?? null,
    razaoSocial: loc.razaoSocial ?? null,
    nomeFantasia: loc.nomeFantasia ?? null,
    certTitular: loc.certTitular ?? null,
    certTipo: loc.certTipo ?? null,
    certValidade: loc.certValidade ?? null,
    empresaId: loc.empresaId ?? null,
    empresaNome: emp?.nome ?? null,
    modalidade: loc.modalidade === "presencial" || loc.modalidade === "online" ? loc.modalidade : null,
    mesmoEnderecoEmpresa: loc.mesmoEnderecoEmpresa,
    enderecoEmpresa: emp ? textoEndereco(enderecoDaEmpresa(emp)) : null,
    agendaPapel: loc.agendaPapel ?? null,
    observacaoLocal: loc.observacaoLocal ?? null,
    nomeEspaco: loc.nomeEspaco ?? null,
  };
}

router.get("/locations", async (_req, res): Promise<void> => {
  const locations = await db.select().from(locationsTable).orderBy(locationsTable.name);
  const empresas = await db.select({
    id: empresasTable.id, nome: empresasTable.nome, endereco: empresasTable.endereco, cep: empresasTable.cep,
    bairro: empresasTable.bairro, cidade: empresasTable.cidade, estado: empresasTable.estado,
    zona: empresasTable.zona, telefone: empresasTable.telefone,
  }).from(empresasTable);
  const empresaPorId = new Map(empresas.map((e) => [e.id, e]));

  const result = await Promise.all(locations.map(async (loc) => {
    const links = await db.select().from(locationProfessionalsTable)
      .where(eq(locationProfessionalsTable.locationId, loc.id));

    const professionals = await Promise.all(links.map(async (link) => {
      const [prof] = await db.select().from(professionalsTable)
        .where(eq(professionalsTable.id, link.professionalId));
      return prof ? { id: prof.id, name: prof.name, specialty: prof.specialty ?? null, role: link.role } : null;
    }));

    return {
      ...serializeLocation(loc, loc.empresaId ? empresaPorId.get(loc.empresaId) : null),
      professionals: professionals.filter(Boolean),
    };
  }));

  res.json(result);
});

router.post("/locations", requireCollaborator, async (req, res): Promise<void> => {
  const { name, address, type, color, googleCalendarId, phone, cep, logradouro, numero, complemento, bairro, cidade, estado, zona } = req.body;
  if (!name) {
    res.status(400).json({ error: "name is required" });
    return;
  }
  const modalidadeBody = modalidadeValida(req.body.modalidade);
  if (req.body.modalidade !== undefined && modalidadeBody === undefined) {
    res.status(422).json({ error: "modalidade deve ser 'presencial' ou 'online'." });
    return;
  }
  const modalidadeFinal = modalidadeBody ?? null;
  const mesmoEndereco = req.body.mesmoEnderecoEmpresa === true && modalidadeFinal !== null;
  if (req.body.mesmoEnderecoEmpresa === true && modalidadeFinal === null) {
    res.status(422).json({ error: "O sinalizador de mesmo endereço da empresa exige definir a modalidade (presencial ou online)." });
    return;
  }
  const papelBody = papelValido(req.body.agendaPapel);
  if (req.body.agendaPapel !== undefined && papelBody === undefined) {
    res.status(422).json({ error: "agendaPapel deve ser local, remoto, externo, pessoal ou geral." });
    return;
  }
  if (!req.tenantContext.empresaId) {
    res.status(403).json({ error: "A sessão não está vinculada a uma empresa. Nenhuma unidade foi criada." });
    return;
  }

  // Auto-preenchimento via ViaCEP: preenche bairro/cidade/estado quando omitidos no body
  let geoBairro  = bairro  ?? null;
  let geoCidade  = cidade  ?? null;
  let geoEstado  = estado  ?? null;
  let geoLogradouro = logradouro ?? null;
  if (cep && (!geoBairro || !geoCidade || !geoEstado)) {
    const geo = await lookupCep(cep);
    if (geo) {
      geoBairro     = geoBairro     || geo.bairro;
      geoCidade     = geoCidade     || geo.cidade;
      geoEstado     = geoEstado     || geo.estado;
      geoLogradouro = geoLogradouro || geo.logradouro;
    }
  }

  // Auto-derivação de zona: só aplica quando não veio zona manual no body
  const geoZona = zona ?? deriveZona(geoBairro, geoCidade, geoEstado, cep ?? null);

  const sede = mesmoEndereco ? await carregarEmpresa(req.tenantContext.empresaId) : null;
  if (mesmoEndereco && !sede) {
    res.status(422).json({ error: "Não foi possível ler o endereço da empresa. Nenhum local foi criado." });
    return;
  }
  const herdado = sede ? enderecoDaEmpresa(sede) : null;

  const [loc] = await db.insert(locationsTable).values({
    name,
    address: address ?? null,
    type: type ?? "clinic",
    color: color ?? "#3B82F6",
    googleCalendarId: googleCalendarId ?? null,
    phone: normalizePhone(phone),
    cep: cep ?? null,
    logradouro: geoLogradouro,
    numero: numero ?? null,
    complemento: complemento ?? null,
    bairro: geoBairro,
    cidade: geoCidade,
    estado: geoEstado,
    zona: geoZona,
    // Empresa vem da identidade autenticada, nunca do corpo enviado pelo navegador.
    empresaId: req.tenantContext.empresaId,
    modalidade: modalidadeFinal,
    mesmoEnderecoEmpresa: mesmoEndereco,
    agendaPapel: papelBody ?? null,
    observacaoLocal: textoOpcional(req.body.observacaoLocal) ?? null,
    nomeEspaco: textoOpcional(req.body.nomeEspaco, 200) ?? null,
    ...(herdado ?? {}),
  }).returning();

  res.status(201).json(serializeLocation(loc, sede ?? await carregarEmpresa(loc.empresaId)));
});

router.put("/locations/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const { name, address, type, color, googleCalendarId, active, phone, cep, logradouro, numero, complemento, bairro, cidade, estado, zona } = req.body;
  const updates: Record<string, any> = {};
  if (name !== undefined) updates.name = name;
  if (address !== undefined) updates.address = address;
  if (type !== undefined) updates.type = type;
  if (color !== undefined) updates.color = color;
  if (googleCalendarId !== undefined) updates.googleCalendarId = googleCalendarId;
  if (active !== undefined) updates.active = String(active);
  if (phone !== undefined) updates.phone = normalizePhone(phone);
  if (cep !== undefined) updates.cep = cep ?? null;
  if (logradouro !== undefined) updates.logradouro = logradouro ?? null;
  if (numero !== undefined) updates.numero = numero ?? null;
  if (complemento !== undefined) updates.complemento = complemento ?? null;
  if (bairro !== undefined) updates.bairro = bairro ?? null;
  if (cidade !== undefined) updates.cidade = cidade ?? null;
  if (estado !== undefined) updates.estado = estado ?? null;
  if (zona !== undefined) updates.zona = zona ?? null;

  // Modalidade e sinalizador "mesmo endereco da empresa".
  const [atual] = await db.select().from(locationsTable).where(eq(locationsTable.id, id));
  if (!atual) {
    res.status(404).json({ error: "Location not found" });
    return;
  }
  const modalidadeBody = modalidadeValida(req.body.modalidade);
  if (req.body.modalidade !== undefined && modalidadeBody === undefined) {
    res.status(422).json({ error: "modalidade deve ser 'presencial' ou 'online'." });
    return;
  }
  const modalidadeFinal = req.body.modalidade !== undefined ? (modalidadeBody ?? null) : (atual.modalidade ?? null);
  let mesmoFinal = req.body.mesmoEnderecoEmpresa !== undefined ? req.body.mesmoEnderecoEmpresa === true : atual.mesmoEnderecoEmpresa;
  if (mesmoFinal && modalidadeFinal === null) {
    if (req.body.mesmoEnderecoEmpresa === true) {
      res.status(422).json({ error: "O sinalizador de mesmo endereço da empresa exige definir a modalidade (presencial ou online)." });
      return;
    }
    mesmoFinal = false; // modalidade voltou a "a definir": deixa de herdar (o endereco antigo fica guardado)
  }
  const papelBody = papelValido(req.body.agendaPapel);
  if (req.body.agendaPapel !== undefined && papelBody === undefined) {
    res.status(422).json({ error: "agendaPapel deve ser local, remoto, externo, pessoal ou geral." });
    return;
  }
  if (req.body.agendaPapel !== undefined) updates.agendaPapel = papelBody ?? null;
  const obs = textoOpcional(req.body.observacaoLocal);
  if (obs !== undefined) updates.observacaoLocal = obs;
  const espaco = textoOpcional(req.body.nomeEspaco, 200);
  if (espaco !== undefined) updates.nomeEspaco = espaco;
  if (req.body.modalidade !== undefined) updates.modalidade = modalidadeFinal;
  if (req.body.mesmoEnderecoEmpresa !== undefined || mesmoFinal !== atual.mesmoEnderecoEmpresa) updates.mesmoEnderecoEmpresa = mesmoFinal;
  let empresaDoLocal: EmpresaEndereco | null = null;
  if (mesmoFinal) {
    empresaDoLocal = await carregarEmpresa(atual.empresaId ?? null);
    if (!empresaDoLocal) {
      res.status(422).json({ error: "Não foi possível ler o endereço da empresa. Nada foi alterado." });
      return;
    }
    Object.assign(updates, enderecoDaEmpresa(empresaDoLocal));
  }

  // Auto-preenchimento via ViaCEP: se CEP foi enviado e campos geo estão ausentes/nulos no body
  if (!mesmoFinal && cep && (!bairro || !cidade || !estado)) {
    const geo = await lookupCep(cep);
    if (geo) {
      if (!updates.bairro && geo.bairro)         updates.bairro  = geo.bairro;
      if (!updates.cidade && geo.cidade)         updates.cidade  = geo.cidade;
      if (!updates.estado && geo.estado)         updates.estado  = geo.estado;
      if (!updates.logradouro && geo.logradouro) updates.logradouro = geo.logradouro;
    }
  }

  // Auto-derivação de zona: só deriva se zona não foi enviada manualmente no body
  if (!mesmoFinal && zona === undefined && !updates.zona) {
    const finalBairro = (updates.bairro as string | null) ?? null;
    const finalCidade = (updates.cidade as string | null) ?? null;
    const finalEstado = (updates.estado as string | null) ?? null;
    const finalCep    = (updates.cep    as string | null) ?? null;
    const derived = deriveZona(finalBairro, finalCidade, finalEstado, finalCep);
    if (derived) updates.zona = derived;
  }

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No fields to update" });
    return;
  }

  const [updated] = await db.update(locationsTable).set(updates).where(eq(locationsTable.id, id)).returning();
  if (!updated) {
    res.status(404).json({ error: "Location not found" });
    return;
  }
  res.json(serializeLocation(updated, empresaDoLocal ?? await carregarEmpresa(updated.empresaId)));
});

router.delete("/locations/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [loc] = await db.select().from(locationsTable).where(eq(locationsTable.id, id));
  if (!loc) {
    res.status(404).json({ error: "Location not found" });
    return;
  }
  // Trava: não apagar clínica com sessões vinculadas (vínculo por nome em sessions.unit)
  const linkedSessions = await db.select({ id: sessionsTable.id }).from(sessionsTable)
    .where(eq(sessionsTable.unit, loc.name));
  if (linkedSessions.length > 0) {
    res.status(409).json({
      error: "Clínica possui sessões vinculadas. Desative-a (active=false) em vez de apagar.",
      sessions: linkedSessions.length,
    });
    return;
  }
  await db.delete(locationProfessionalsTable).where(eq(locationProfessionalsTable.locationId, id));
  await db.delete(locationsTable).where(eq(locationsTable.id, id));
  res.json({ ok: true, deleted: id });
});

router.post("/locations/:id/professionals", async (req, res): Promise<void> => {
  const locationId = parseInt(req.params.id);
  const { professionalId, role } = req.body;
  if (!professionalId) {
    res.status(400).json({ error: "professionalId is required" });
    return;
  }
  const [link] = await db.insert(locationProfessionalsTable).values({
    locationId,
    professionalId: parseInt(professionalId),
    role: role ?? "executor",
  }).returning();
  res.status(201).json(link);
});

export default router;
