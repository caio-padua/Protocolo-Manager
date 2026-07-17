/**
 * Cadernos Jurídicos — rotas de seed, listagem, edição e emissão em lote.
 * Usa a tabela assinatura_templates como armazenamento; cada caderno tem um
 * código único (CGLO, CFOR, CIMU, CEND, CIMP, CSUB, TCLE, RAS-JUR).
 * PUT  /api/cadernos-juridicos/:codigo        — atualiza corpoHtml + placeholders.
 * POST /api/cadernos-juridicos/seed           — idempotente: só insere os faltantes.
 * GET  /api/cadernos-juridicos                — lista todos os 8 cadernos com status.
 * POST /api/cadernos-juridicos/emitir-lote    — emite todos (ou lista) para um cliente.
 */
import { Router } from "express";
import { db, assinaturaTemplatesTable, clientsTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { enviarAssinatura } from "../lib/assinatura/service";
import type { CanalDistribuicao } from "../lib/assinatura/types";

const router = Router();

const CODIGOS_PADRAO = ["CGLO","CFOR","CIMU","CEND","CIMP","CSUB","TCLE","RAS-JUR"] as const;

const PLACEHOLDERS_PADRAO = [
  { key: "cliente.nome",           label: "Nome do Cliente",       exemplo: "Maria da Silva" },
  { key: "cliente.cpf",            label: "CPF",                   exemplo: "123.456.789-00" },
  { key: "cliente.dataNascimento", label: "Data de Nascimento",    exemplo: "01/01/1985" },
  { key: "cliente.email",          label: "E-mail",                exemplo: "maria@email.com" },
  { key: "cliente.telefone",       label: "Telefone",              exemplo: "(11) 99999-9999" },
  { key: "medico.nome",            label: "Médico Responsável",    exemplo: "Dr. Caio Pádua" },
  { key: "medico.crm",             label: "CRM",                   exemplo: "123456" },
  { key: "medico.uf",              label: "UF do CRM",             exemplo: "SP" },
  { key: "protocolo.titulo",       label: "Título do Protocolo",   exemplo: "Protocolo Longevidade Plena" },
  { key: "protocolo.substancias",  label: "Lista de Substâncias",  exemplo: "NAD+, Glutationa, Vitamina C" },
  { key: "protocolo.vias",         label: "Vias de Administração", exemplo: "IV, IM, SC, Implante" },
  { key: "protocolo.dataInicio",   label: "Data de Início",        exemplo: "01/08/2026" },
  { key: "protocolo.totalSessoes", label: "Total de Sessões",      exemplo: "12" },
  { key: "protocolo.valorTotal",   label: "Valor Total",           exemplo: "R$ 12.000,00" },
  { key: "clinica.nome",           label: "Nome da Clínica",       exemplo: "Clínica Tatuapé" },
  { key: "clinica.endereco",       label: "Endereço da Clínica",   exemplo: "Rua X, 100 — Tatuapé, SP" },
  { key: "data.hoje",              label: "Data de Hoje",          exemplo: "17/07/2026" },
];

// ────────────────────────────────────────────────────────────────────────────
// TEXTOS DOS CADERNOS
// ────────────────────────────────────────────────────────────────────────────

const HTML_CGLO = `<h2>CONSENTIMENTO GLOBAL DE TRATAMENTO — CGLO</h2>
<p><strong>Clínica:</strong> {{clinica.nome}} — {{clinica.endereco}}</p>
<hr/>
<h3>1. IDENTIFICAÇÃO</h3>
<p><strong>Cliente:</strong> {{cliente.nome}}<br/>
<strong>CPF:</strong> {{cliente.cpf}}<br/>
<strong>Nascimento:</strong> {{cliente.dataNascimento}}<br/>
<strong>E-mail:</strong> {{cliente.email}}<br/>
<strong>Telefone:</strong> {{cliente.telefone}}</p>
<p><strong>Médico Responsável:</strong> {{medico.nome}} — CRM {{medico.crm}}/{{medico.uf}}</p>
<hr/>
<h3>2. PROTOCOLO AUTORIZADO</h3>
<p>O(a) cliente autoriza o protocolo denominado <strong>"{{protocolo.titulo}}"</strong>, com início em {{protocolo.dataInicio}}, totalizando {{protocolo.totalSessoes}} sessões, envolvendo as seguintes substâncias: {{protocolo.substancias}}, administradas pelas vias: {{protocolo.vias}}.</p>
<h3>3. BENEFÍCIOS ESPERADOS</h3>
<p>O(a) cliente foi informado(a) sobre os benefícios clínicos esperados: melhora do bem-estar, otimização metabólica, suporte à longevidade e qualidade de vida. Os resultados variam individualmente e dependem de adesão ao protocolo, estilo de vida e características biológicas.</p>
<h3>4. RISCOS E EFEITOS ADVERSOS</h3>
<p>O(a) cliente declara ciência dos riscos inerentes: reações locais no sítio de aplicação, reações alérgicas, náuseas, tontura e desconfortos transitórios. Reações mais graves, embora raras, serão prontamente tratadas pela equipe médica.</p>
<h3>5. ALTERNATIVAS TERAPÊUTICAS</h3>
<p>Existem alternativas terapêuticas ao protocolo proposto. O(a) cliente optou livremente pelo presente protocolo após esclarecimento adequado.</p>
<h3>6. DIREITO DE REVOGAÇÃO</h3>
<p>O(a) cliente pode revogar este consentimento a qualquer momento, sem prejuízo ao atendimento, comunicando formalmente ao médico ou à administração da clínica.</p>
<h3>7. PROTEÇÃO DE DADOS — LGPD (Lei nº 13.709/2018)</h3>
<p>Os dados pessoais e de saúde serão usados exclusivamente para: execução do protocolo, emissão de documentos clínicos, acompanhamento evolutivo e cumprimento de obrigações legais. O(a) cliente tem direito a acessar, corrigir, excluir ou portar seus dados a qualquer tempo.</p>
<h3>8. ARMAZENAMENTO DIGITAL</h3>
<p>O(a) cliente autoriza o armazenamento digital no sistema PAXTER e em nuvem segura (Google Drive), com acesso somente leitura ao e-mail cadastrado.</p>
<h3>9. DECLARAÇÃO FINAL</h3>
<p>Declaro ter lido, compreendido e concordado integralmente com este Termo Global de Consentimento, em {{data.hoje}}.</p>
<br/>
<p>_________________________________ <br/><strong>{{cliente.nome}}</strong> — CPF: {{cliente.cpf}}</p>
<p>_________________________________ <br/><strong>{{medico.nome}}</strong> — CRM: {{medico.crm}}/{{medico.uf}}</p>`;

const HTML_CFOR = `<h2>TERMO DE CONSENTIMENTO — FÓRMULAS MAGISTRAIS — CFOR</h2>
<p><strong>Clínica:</strong> {{clinica.nome}} | <strong>Médico:</strong> {{medico.nome}} — CRM {{medico.crm}}/{{medico.uf}}</p>
<hr/>
<h3>1. IDENTIFICAÇÃO DO CLIENTE</h3>
<p><strong>Nome:</strong> {{cliente.nome}} | <strong>CPF:</strong> {{cliente.cpf}} | <strong>Nascimento:</strong> {{cliente.dataNascimento}}</p>
<h3>2. OBJETO</h3>
<p>Este Termo regula o consentimento do(a) cliente para o uso de fórmulas magistrais (medicamentos manipulados) no âmbito do protocolo <strong>"{{protocolo.titulo}}"</strong>. Substâncias envolvidas: {{protocolo.substancias}}.</p>
<h3>3. NATUREZA DAS FÓRMULAS MAGISTRAIS</h3>
<p>Fórmulas magistrais são medicamentos preparados individualmente por farmácias habilitadas, sob prescrição médica, conforme RDC nº 67/2007 da ANVISA e Resolução CFM nº 1.974/2011. São personalizadas e elaboradas exclusivamente para o presente tratamento, com base na avaliação clínica do(a) cliente.</p>
<h3>4. DECLARAÇÕES DO CLIENTE</h3>
<ul>
<li>Estou ciente de que as fórmulas são de uso exclusivo pessoal e intransferível.</li>
<li>Não autorizo a reprodução das prescrições sem nova avaliação médica e prescrição atualizada.</li>
<li>Fui orientado(a) sobre posologia, forma de uso, armazenamento e prazo de validade de cada formulação.</li>
<li>Informei ao médico sobre todos os medicamentos em uso, alergias e condições de saúde relevantes.</li>
<li>Compreendo que os resultados variam individualmente.</li>
</ul>
<h3>5. RISCOS ESPECÍFICOS DE MANIPULADOS</h3>
<p>Risco de reações alérgicas a componentes da fórmula, variação de concentração entre lotes (inerente ao manipulado), possível interação com outros medicamentos em uso. Qualquer reação incomum deve ser imediatamente comunicada ao médico.</p>
<h3>6. LGPD</h3>
<p>Dados utilizados exclusivamente para fins terapêuticos e regulatórios, nos termos da Lei nº 13.709/2018.</p>
<h3>7. ASSINATURA</h3>
<p>Em {{data.hoje}}, declaro meu consentimento livre e esclarecido para uso das fórmulas magistrais prescritas.</p>
<br/>
<p>_________________________________ <br/><strong>{{cliente.nome}}</strong> — CPF: {{cliente.cpf}}</p>
<p>_________________________________ <br/><strong>{{medico.nome}}</strong> — CRM: {{medico.crm}}/{{medico.uf}}</p>`;

const HTML_CIMU = `<h2>TERMO DE CONSENTIMENTO — INJETÁVEIS VIA INTRAMUSCULAR (IM) — CIMU</h2>
<p><strong>Clínica:</strong> {{clinica.nome}} | <strong>Médico:</strong> {{medico.nome}} — CRM {{medico.crm}}/{{medico.uf}}</p>
<hr/>
<h3>1. IDENTIFICAÇÃO</h3>
<p><strong>Nome:</strong> {{cliente.nome}} | <strong>CPF:</strong> {{cliente.cpf}} | <strong>Nascimento:</strong> {{cliente.dataNascimento}}</p>
<h3>2. PROCEDIMENTO AUTORIZADO</h3>
<p>Autorizo a administração de substâncias por via intramuscular (IM) no âmbito do protocolo <strong>"{{protocolo.titulo}}"</strong>. Substâncias: {{protocolo.substancias}}. Início: {{protocolo.dataInicio}}. Sessões: {{protocolo.totalSessoes}}.</p>
<h3>3. DESCRIÇÃO DO PROCEDIMENTO</h3>
<p>A via intramuscular consiste na introdução de substâncias diretamente no tecido muscular por meio de agulha. Duração média por sessão: 15 minutos. O procedimento é realizado por profissional habilitado (médico ou enfermeiro), em ambiente clínico controlado.</p>
<h3>4. RISCOS ESPECÍFICOS DA VIA IM</h3>
<ul>
<li>Dor e desconforto local no sítio de aplicação</li>
<li>Hematoma ou equimose transitória</li>
<li>Endurecimento local (nodulação transitória)</li>
<li>Risco de abscessos em casos de técnica inadequada (minimizado pelo ambiente controlado)</li>
<li>Reação alérgica à substância administrada (rara)</li>
<li>Lesão nervosa (extremamente rara com técnica correta)</li>
</ul>
<h3>5. BENEFÍCIOS ESPERADOS</h3>
<p>Absorção rápida e eficiente das substâncias, sem necessidade de acesso venoso. Ideal para substâncias lipossolúveis e de liberação controlada.</p>
<h3>6. CONTRAINDICAÇÕES INFORMADAS</h3>
<p>Discrasias sanguíneas, anticoagulação terapêutica, infecção no sítio de aplicação, alergia conhecida à substância ou aos veículos utilizados.</p>
<h3>7. DECLARAÇÕES DO CLIENTE</h3>
<ul>
<li>Informei todas as alergias, condições de saúde e medicamentos em uso.</li>
<li>Fui esclarecido(a) sobre o procedimento, riscos e alternativas.</li>
<li>Autorizo a equipe a tomar as medidas de segurança necessárias.</li>
</ul>
<h3>8. LGPD</h3>
<p>Dados usados exclusivamente para fins terapêuticos, nos termos da Lei nº 13.709/2018.</p>
<h3>9. ASSINATURA — {{data.hoje}}</h3>
<p>_________________________________ <br/><strong>{{cliente.nome}}</strong> — CPF: {{cliente.cpf}}</p>
<p>_________________________________ <br/><strong>{{medico.nome}}</strong> — CRM: {{medico.crm}}/{{medico.uf}}</p>`;

const HTML_CEND = `<h2>TERMO DE CONSENTIMENTO — PROCEDIMENTOS ENDOVENOSOS (IV) — CEND</h2>
<p><strong>Clínica:</strong> {{clinica.nome}} | <strong>Médico:</strong> {{medico.nome}} — CRM {{medico.crm}}/{{medico.uf}}</p>
<hr/>
<h3>1. IDENTIFICAÇÃO</h3>
<p><strong>Nome:</strong> {{cliente.nome}} | <strong>CPF:</strong> {{cliente.cpf}} | <strong>Nascimento:</strong> {{cliente.dataNascimento}}</p>
<h3>2. PROCEDIMENTO AUTORIZADO</h3>
<p>Autorizo procedimentos endovenosos (via IV) no protocolo <strong>"{{protocolo.titulo}}"</strong>. Substâncias: {{protocolo.substancias}}. Início: {{protocolo.dataInicio}}. Total de sessões: {{protocolo.totalSessoes}}.</p>
<h3>3. DESCRIÇÃO DO PROCEDIMENTO</h3>
<p>Procedimentos endovenosos (IV) consistem na infusão de substâncias diretamente na corrente sanguínea por acesso venoso periférico. Duração média: 30 minutos por sessão. Realizados por médico ou enfermeiro habilitado em ambiente clínico controlado.</p>
<h3>4. RISCOS ESPECÍFICOS DA VIA IV</h3>
<ul>
<li>Dor, hematoma ou flebite no local da punção</li>
<li>Infiltração de substância fora da veia (extravasamento)</li>
<li>Reação alérgica ou anafilática à substância (rara)</li>
<li>Sensação de calor, rubor ou formigamento durante a infusão (transitório)</li>
<li>Flebosclerose com múltiplos acessos ao longo do tempo</li>
</ul>
<h3>5. CONSENTIMENTO ESPECÍFICO — VITAMINA C ENDOVENOSA (quando aplicável)</h3>
<p>Para infusões de Vitamina C acima de 10g, declaro ciência da necessidade de dosagem prévia de G6PD (glicose-6-fosfato desidrogenase) para excluir deficiência enzimática, que contraindica o uso em altas doses.</p>
<h3>6. CONSENTIMENTO ESPECÍFICO — NAD+ (quando aplicável)</h3>
<p>Para infusões de NAD+ (Nicotinamida Adenina Dinucleotídeo), fui informado(a) sobre a velocidade adequada de infusão e sobre possíveis desconfortos transitórios (aperto no peito, rubor, tontura) que são dose e velocidade-dependentes e cessam com redução da velocidade de infusão.</p>
<h3>7. BENEFÍCIOS ESPERADOS</h3>
<p>Absorção imediata com 100% de biodisponibilidade, adequada para substâncias que requerem concentração plasmática rápida e precisa.</p>
<h3>8. CONTRAINDICAÇÕES INFORMADAS</h3>
<p>Insuficiência cardíaca descompensada, insuficiência renal grave, deficiência de G6PD (para Vitamina C em altas doses), coagulopatias graves, flebite ativa.</p>
<h3>9. DECLARAÇÕES DO CLIENTE</h3>
<ul>
<li>Informei todas as condições de saúde, alergias e medicamentos em uso.</li>
<li>Fui esclarecido(a) sobre todos os riscos e benefícios.</li>
<li>Declaro não ter as contraindicações acima ou que as mesmas foram devidamente avaliadas.</li>
</ul>
<h3>10. LGPD</h3>
<p>Dados usados exclusivamente para fins terapêuticos, nos termos da Lei nº 13.709/2018.</p>
<h3>11. ASSINATURA — {{data.hoje}}</h3>
<p>_________________________________ <br/><strong>{{cliente.nome}}</strong> — CPF: {{cliente.cpf}}</p>
<p>_________________________________ <br/><strong>{{medico.nome}}</strong> — CRM: {{medico.crm}}/{{medico.uf}}</p>`;

const HTML_CIMP = `<h2>TERMO DE CONSENTIMENTO — IMPLANTES E PELLETS — CIMP</h2>
<p><strong>Clínica:</strong> {{clinica.nome}} | <strong>Médico:</strong> {{medico.nome}} — CRM {{medico.crm}}/{{medico.uf}}</p>
<hr/>
<h3>1. IDENTIFICAÇÃO</h3>
<p><strong>Nome:</strong> {{cliente.nome}} | <strong>CPF:</strong> {{cliente.cpf}} | <strong>Nascimento:</strong> {{cliente.dataNascimento}}</p>
<h3>2. PROCEDIMENTO AUTORIZADO</h3>
<p>Autorizo a realização de procedimento de implante subcutâneo (pellet) no protocolo <strong>"{{protocolo.titulo}}"</strong>. Substâncias: {{protocolo.substancias}}. Data de início: {{protocolo.dataInicio}}.</p>
<h3>3. DESCRIÇÃO DO PROCEDIMENTO</h3>
<p>O implante subcutâneo (pellet) consiste na inserção de cápsulas biodegradáveis de liberação lenta sob a pele, geralmente na região glútea ou abdominal, sob anestesia local. O procedimento é realizado em ambiente clínico estéril por médico habilitado. Duração: aproximadamente 60 minutos. O implante se dissolve naturalmente ao longo de 3 a 6 meses.</p>
<h3>4. RISCOS ESPECÍFICOS DO IMPLANTE</h3>
<ul>
<li>Dor e desconforto no sítio cirúrgico (transitório)</li>
<li>Hematoma ou equimose local</li>
<li>Infecção no sítio de inserção (raro, tratável com antibiótico)</li>
<li>Extrusão do implante (expulsão espontânea — rara)</li>
<li>Fibrose local ao redor do pellet</li>
<li>Reação alérgica ao material do implante (rara)</li>
<li>Necessidade de revisão cirúrgica em casos excepcionais</li>
</ul>
<h3>5. CUIDADOS PÓS-PROCEDIMENTO</h3>
<ul>
<li>Manter o local limpo e seco por 48 horas</li>
<li>Evitar atividade física intensa por 72 horas</li>
<li>Não manipular o sítio de inserção</li>
<li>Retornar imediatamente em caso de sinais de infecção (dor, calor, rubor, secreção)</li>
<li>Retorno de acompanhamento conforme orientação médica</li>
</ul>
<h3>6. CONTRAINDICAÇÕES</h3>
<p>Infecção ativa no sítio de inserção, distúrbios graves de coagulação, alergia ao material do implante, condições clínicas que contraindiquem o procedimento conforme avaliação médica individualizada.</p>
<h3>7. DECLARAÇÕES DO CLIENTE</h3>
<ul>
<li>Fui informado(a) sobre alternativas ao implante (injeções periódicas, uso oral).</li>
<li>Declaro não ter as contraindicações acima ou que foram devidamente avaliadas.</li>
<li>Autorizo o procedimento e estou ciente dos cuidados pós-operatórios.</li>
</ul>
<h3>8. LGPD</h3>
<p>Dados usados exclusivamente para fins terapêuticos, nos termos da Lei nº 13.709/2018.</p>
<h3>9. ASSINATURA — {{data.hoje}}</h3>
<p>_________________________________ <br/><strong>{{cliente.nome}}</strong> — CPF: {{cliente.cpf}}</p>
<p>_________________________________ <br/><strong>{{medico.nome}}</strong> — CRM: {{medico.crm}}/{{medico.uf}}</p>`;

const HTML_CSUB = `<h2>TERMO DE CONSENTIMENTO — SUBSTÂNCIAS ESPECIAIS (PEPTÍDEOS / GLP-1 / GH) — CSUB</h2>
<p><strong>Clínica:</strong> {{clinica.nome}} | <strong>Médico:</strong> {{medico.nome}} — CRM {{medico.crm}}/{{medico.uf}}</p>
<hr/>
<h3>1. IDENTIFICAÇÃO</h3>
<p><strong>Nome:</strong> {{cliente.nome}} | <strong>CPF:</strong> {{cliente.cpf}} | <strong>Nascimento:</strong> {{cliente.dataNascimento}}</p>
<h3>2. SUBSTÂNCIAS ESPECIAIS AUTORIZADAS</h3>
<p>No âmbito do protocolo <strong>"{{protocolo.titulo}}"</strong>, autorizo o uso das seguintes substâncias de categoria especial: {{protocolo.substancias}}, pelas vias: {{protocolo.vias}}. Início: {{protocolo.dataInicio}}.</p>
<h3>3. NATUREZA DAS SUBSTÂNCIAS ESPECIAIS</h3>
<p>As substâncias desta categoria incluem peptídeos bioativos, agonistas de GLP-1 (receptor de peptídeo semelhante ao glucagon-1), hormônio do crescimento (GH) e análogos, entre outros compostos de uso terapêutico avançado. Algumas podem ter uso <em>off-label</em> (fora das indicações aprovadas em bula), conforme prescrito pelo médico com fundamento em evidências científicas disponíveis.</p>
<h3>4. DECLARAÇÃO SOBRE USO OFF-LABEL (quando aplicável)</h3>
<p>Fui informado(a) de que algumas substâncias do meu protocolo podem ser utilizadas em indicações não aprovadas pela ANVISA, mas baseadas em literatura científica e no julgamento clínico do médico. Compreendo e aceito essa condição.</p>
<h3>5. RISCOS ESPECÍFICOS</h3>
<ul>
<li><strong>Peptídeos:</strong> reações no sítio de injeção, náuseas, alterações de apetite, cefaleia transitória</li>
<li><strong>GLP-1 e análogos:</strong> náuseas, vômitos, diarreia (especialmente no início), desaceleração do esvaziamento gástrico, risco de pancreatite (raro)</li>
<li><strong>GH e análogos:</strong> retenção hídrica transitória, parestesias, artralgia, potencial efeito em resistência insulínica (monitorado)</li>
<li>Hipoglicemia em uso concomitante com outros agentes (orientação sobre reconhecimento e conduta)</li>
</ul>
<h3>6. MONITORAMENTO OBRIGATÓRIO</h3>
<p>O(a) cliente concorda em realizar os exames de monitoramento indicados pelo médico (glicemia, IGF-1, painel hormonal, função hepática e renal) conforme cronograma estabelecido, como condição para continuidade do protocolo.</p>
<h3>7. CONTRAINDICAÇÕES</h3>
<p>Neoplasias ativas ou suspeitas, histórico de pancreatite grave, carcinoma medular de tireoide ou síndrome MEN 2 (para análogos GLP-1), insuficiência hepática ou renal grave, gravidez ou lactação.</p>
<h3>8. DECLARAÇÕES DO CLIENTE</h3>
<ul>
<li>Informei todas as condições de saúde, alergias e medicamentos em uso.</li>
<li>Estou ciente do caráter especial e, quando aplicável, off-label das substâncias.</li>
<li>Comprometo-me a realizar os exames de monitoramento.</li>
<li>Autorizo o uso das substâncias descritas sob supervisão médica contínua.</li>
</ul>
<h3>9. LGPD</h3>
<p>Dados usados exclusivamente para fins terapêuticos, nos termos da Lei nº 13.709/2018.</p>
<h3>10. ASSINATURA — {{data.hoje}}</h3>
<p>_________________________________ <br/><strong>{{cliente.nome}}</strong> — CPF: {{cliente.cpf}}</p>
<p>_________________________________ <br/><strong>{{medico.nome}}</strong> — CRM: {{medico.crm}}/{{medico.uf}}</p>`;

const HTML_TCLE = `<h2>TERMO DE CONSENTIMENTO LIVRE E ESCLARECIDO — TCLE</h2>
<p><em>Conforme Resolução CFM nº 1.995/2012 e Lei nº 8.080/1990</em></p>
<p><strong>Clínica:</strong> {{clinica.nome}} — {{clinica.endereco}}</p>
<hr/>
<h3>1. IDENTIFICAÇÃO DO CLIENTE</h3>
<p><strong>Nome:</strong> {{cliente.nome}}<br/>
<strong>CPF:</strong> {{cliente.cpf}}<br/>
<strong>Nascimento:</strong> {{cliente.dataNascimento}}<br/>
<strong>E-mail:</strong> {{cliente.email}}<br/>
<strong>Telefone:</strong> {{cliente.telefone}}</p>
<p><strong>Médico Responsável:</strong> {{medico.nome}} — CRM {{medico.crm}}/{{medico.uf}}</p>
<hr/>
<h3>2. PROTOCOLO DE TRATAMENTO</h3>
<p><strong>Denominação:</strong> {{protocolo.titulo}}<br/>
<strong>Substâncias:</strong> {{protocolo.substancias}}<br/>
<strong>Vias de Administração:</strong> {{protocolo.vias}}<br/>
<strong>Início Previsto:</strong> {{protocolo.dataInicio}}<br/>
<strong>Total de Sessões:</strong> {{protocolo.totalSessoes}}</p>
<hr/>
<h3>3. OBJETIVO DO TRATAMENTO</h3>
<p>Este protocolo tem como objetivo promover a saúde integral do(a) cliente, com foco em: longevidade celular, otimização metabólica e hormonal, melhora do bem-estar, energia, imunidade e qualidade de vida. O tratamento é individualizado, baseado em avaliação clínica e exames laboratoriais.</p>
<h3>4. PROCEDIMENTOS AUTORIZADOS</h3>
<p>O(a) cliente autoriza expressamente a administração das substâncias do protocolo pelas vias indicadas ({{protocolo.vias}}), realizadas por profissional habilitado, em ambiente clínico controlado, com todos os recursos de segurança disponíveis.</p>
<h3>5. RISCOS GERAIS E EFEITOS ADVERSOS</h3>
<ul>
<li>Reações locais: dor, hematoma, flebite, endurecimento no sítio de aplicação</li>
<li>Reações sistêmicas leves: náuseas, cefaleia, tontura, rubor (transitórios)</li>
<li>Reações alérgicas: urticária, edema — raras, tratadas imediatamente</li>
<li>Reações anafiláticas: extremamente raras; a clínica dispõe de kit de emergência</li>
</ul>
<h3>6. CONTRAINDICAÇÕES VERIFICADAS</h3>
<p>O médico realizou avaliação clínica completa e confirma a ausência das principais contraindicações para as substâncias e vias do protocolo. O(a) cliente informou todas as condições de saúde, alergias e medicamentos em uso.</p>
<h3>7. ALTERNATIVAS AO TRATAMENTO</h3>
<p>O(a) cliente foi informado(a) sobre as alternativas terapêuticas disponíveis, incluindo terapias orais, mudanças de estilo de vida e outras abordagens. Optou livremente pelo presente protocolo.</p>
<h3>8. DIREITO AO LIVRE CONSENTIMENTO E À REVOGAÇÃO</h3>
<p>Este consentimento é livre, voluntário e informado. O(a) cliente pode revogá-lo a qualquer momento, sem qualquer prejuízo ou constrangimento, bastando comunicar ao médico ou à clínica por escrito ou verbalmente.</p>
<h3>9. DIREITOS DO CLIENTE</h3>
<ul>
<li>Receber informações claras sobre o tratamento a qualquer momento</li>
<li>Acessar seu prontuário e todos os documentos clínicos</li>
<li>Ser tratado com dignidade e respeito</li>
<li>Obter segunda opinião médica quando desejar</li>
<li>Decidir sobre a continuidade ou interrupção do tratamento</li>
</ul>
<h3>10. PROTEÇÃO DE DADOS (LGPD — Lei nº 13.709/2018)</h3>
<p>Os dados pessoais e de saúde serão tratados exclusivamente para: execução do protocolo, emissão de documentos clínicos (RAS, receituários, atestados), acompanhamento evolutivo e cumprimento de obrigações legais e regulatórias. O(a) cliente tem direito a acessar, corrigir, excluir ou portar seus dados.</p>
<h3>11. ARMAZENAMENTO DIGITAL</h3>
<p>Autorizo o armazenamento digital no sistema PAXTER (Motor Clínico — Protocolos Injetáveis) e em nuvem segura (Google Drive), com compartilhamento exclusivo ao meu e-mail cadastrado, em modo somente leitura.</p>
<h3>12. CONTATO DE EMERGÊNCIA</h3>
<p>Em caso de reação adversa fora do ambiente clínico, o(a) cliente deve entrar em contato imediatamente pelo telefone da clínica: {{clinica.endereco}}.</p>
<h3>13. DECLARAÇÃO FINAL</h3>
<p>Declaro que:</p>
<ul>
<li>Li e compreendi integralmente este Termo de Consentimento Livre e Esclarecido</li>
<li>Tive ampla oportunidade de esclarecer todas as minhas dúvidas</li>
<li>Recebi uma cópia deste documento para meus arquivos</li>
<li>Manifesto meu consentimento LIVRE, VOLUNTÁRIO E ESCLARECIDO para a realização do protocolo descrito</li>
</ul>
<p><strong>Data e Local:</strong> {{clinica.nome}}, {{data.hoje}}</p>
<br/>
<p>_________________________________ <br/><strong>{{cliente.nome}}</strong><br/>CPF: {{cliente.cpf}}<br/><em>Cliente / Paciente</em></p>
<br/>
<p>_________________________________ <br/><strong>{{medico.nome}}</strong><br/>CRM: {{medico.crm}}/{{medico.uf}}<br/><em>Médico(a) Responsável</em></p>`;

const HTML_RAS_JUR = `<h2>REGISTRO DE ASSISTÊNCIA SISTÊMICA — VERSÃO JURÍDICA — RAS-JUR</h2>
<p><strong>SISTEMA PAXTER — MOTOR CLÍNICO | PROTOCOLOS INJETÁVEIS</strong><br/>
<em>Este documento possui valor jurídico e é assinado digitalmente com certificado ICP-Brasil A1.</em></p>
<hr/>
<h3>1. DADOS DA CLÍNICA E DO PROFISSIONAL</h3>
<p><strong>Clínica:</strong> {{clinica.nome}}<br/>
<strong>Endereço:</strong> {{clinica.endereco}}<br/>
<strong>Médico Responsável:</strong> {{medico.nome}}<br/>
<strong>CRM:</strong> {{medico.crm}}/{{medico.uf}}</p>
<h3>2. DADOS DO CLIENTE</h3>
<p><strong>Nome:</strong> {{cliente.nome}}<br/>
<strong>CPF:</strong> {{cliente.cpf}}<br/>
<strong>Data de Nascimento:</strong> {{cliente.dataNascimento}}<br/>
<strong>E-mail:</strong> {{cliente.email}}<br/>
<strong>Telefone:</strong> {{cliente.telefone}}</p>
<h3>3. PROTOCOLO DE TRATAMENTO</h3>
<p><strong>Denominação:</strong> {{protocolo.titulo}}<br/>
<strong>Data de Início:</strong> {{protocolo.dataInicio}}<br/>
<strong>Total de Sessões:</strong> {{protocolo.totalSessoes}}<br/>
<strong>Substâncias Autorizadas:</strong> {{protocolo.substancias}}<br/>
<strong>Vias de Administração:</strong> {{protocolo.vias}}</p>
<h3>4. REGISTRO DO ATENDIMENTO</h3>
<p>Este Registro de Assistência Sistêmica (RAS) documenta formalmente a realização do protocolo acima descrito, em conformidade com: Resolução CFM nº 1.638/2002 (prontuário médico), RDC ANVISA nº 67/2007, Lei nº 9.434/1997 e demais normas aplicáveis ao exercício da medicina e da enfermagem no Brasil.</p>
<h3>5. DECLARAÇÃO DE CONFORMIDADE</h3>
<p>O médico responsável declara que:</p>
<ul>
<li>O protocolo foi prescrito com base em avaliação clínica individualizada do(a) paciente</li>
<li>As substâncias utilizadas foram administradas por profissional habilitado, em dose e via adequadas</li>
<li>O(a) paciente foi devidamente informado(a) e assinou o TCLE correspondente</li>
<li>Todas as intercorrências, se houverem, foram devidamente registradas no prontuário</li>
<li>Os materiais utilizados possuem rastreabilidade (lote, validade, fornecedor)</li>
</ul>
<h3>6. VALOR PROBATÓRIO</h3>
<p>Este documento, quando assinado digitalmente com certificado ICP-Brasil A1 ou com assinatura eletrônica avançada (ZapSign), possui plena validade jurídica nos termos da MP nº 2.200-2/2001, Lei nº 14.063/2020 e ICP-Brasil, sendo equivalente à assinatura manuscrita para todos os fins de direito.</p>
<h3>7. LGPD</h3>
<p>Dados tratados conforme Lei nº 13.709/2018. Acesso restrito ao profissional médico, equipe clínica habilitada e ao próprio cliente, mediante autenticação.</p>
<h3>8. ASSINATURA ELETRÔNICA</h3>
<p><strong>Data de Emissão:</strong> {{data.hoje}}<br/>
<strong>Assinado por:</strong> {{medico.nome}} — CRM {{medico.crm}}/{{medico.uf}}<br/>
<em>Assinatura digital verificável via PAXTER — Motor Clínico.</em></p>
<br/>
<p>_________________________________ <br/><strong>{{cliente.nome}}</strong><br/>CPF: {{cliente.cpf}}<br/><em>Cliente / Responsável</em></p>
<p>_________________________________ <br/><strong>{{medico.nome}}</strong><br/>CRM: {{medico.crm}}/{{medico.uf}}<br/><em>Médico(a) Responsável</em></p>`;

// ────────────────────────────────────────────────────────────────────────────
// CADASTRO DOS 8 CADERNOS
// ────────────────────────────────────────────────────────────────────────────

const CADERNOS_PADRAO = [
  {
    codigo: "CGLO",
    titulo: "Consentimento Global de Tratamento",
    tipoDoc: "TERMO",
    corpoHtml: HTML_CGLO,
    exigeMedico: true,
    exigeClinica: true,
  },
  {
    codigo: "CFOR",
    titulo: "Consentimento — Fórmulas Magistrais",
    tipoDoc: "TCLE",
    corpoHtml: HTML_CFOR,
    exigeMedico: true,
    exigeClinica: true,
  },
  {
    codigo: "CIMU",
    titulo: "Consentimento — Injetáveis Intramusculares (IM)",
    tipoDoc: "TCLE",
    corpoHtml: HTML_CIMU,
    exigeMedico: true,
    exigeClinica: true,
  },
  {
    codigo: "CEND",
    titulo: "Consentimento — Procedimentos Endovenosos (IV)",
    tipoDoc: "TCLE",
    corpoHtml: HTML_CEND,
    exigeMedico: true,
    exigeClinica: true,
  },
  {
    codigo: "CIMP",
    titulo: "Consentimento — Implantes e Pellets",
    tipoDoc: "TCLE",
    corpoHtml: HTML_CIMP,
    exigeMedico: true,
    exigeClinica: true,
  },
  {
    codigo: "CSUB",
    titulo: "Consentimento — Substâncias Especiais (Peptídeos / GLP-1 / GH)",
    tipoDoc: "TCLE",
    corpoHtml: HTML_CSUB,
    exigeMedico: true,
    exigeClinica: true,
  },
  {
    codigo: "TCLE",
    titulo: "Termo de Consentimento Livre e Esclarecido (TCLE Principal)",
    tipoDoc: "TCLE",
    corpoHtml: HTML_TCLE,
    exigeMedico: true,
    exigeClinica: true,
  },
  {
    codigo: "RAS-JUR",
    titulo: "Registro de Assistência Sistêmica — Versão Jurídica",
    tipoDoc: "RAS",
    corpoHtml: HTML_RAS_JUR,
    exigeMedico: true,
    exigeClinica: true,
  },
] as const;

// ────────────────────────────────────────────────────────────────────────────
// ROTAS
// ────────────────────────────────────────────────────────────────────────────

// GET /api/cadernos-juridicos — lista os 8 cadernos com status (semeado ou não)
router.get("/cadernos-juridicos", async (_req, res): Promise<void> => {
  try {
    const existentes = await db
      .select()
      .from(assinaturaTemplatesTable)
      .where(inArray(assinaturaTemplatesTable.codigo, [...CODIGOS_PADRAO]));

    const mapaExistentes = new Map(existentes.map((t) => [t.codigo, t]));

    const resultado = CADERNOS_PADRAO.map((c) => {
      const existente = mapaExistentes.get(c.codigo);
      return existente
        ? { ...existente, semeado: true }
        : { ...c, id: null, semeado: false, placeholders: PLACEHOLDERS_PADRAO, ativo: true };
    });

    res.json({ cadernos: resultado, placeholders: PLACEHOLDERS_PADRAO });
  } catch (err) {
    res.status(500).json({ error: "erro_listar_cadernos", detalhe: String(err) });
  }
});

// POST /api/cadernos-juridicos/seed — idempotente: insere só os que faltam
router.post("/cadernos-juridicos/seed", async (_req, res): Promise<void> => {
  try {
    const existentes = await db
      .select({ codigo: assinaturaTemplatesTable.codigo })
      .from(assinaturaTemplatesTable)
      .where(inArray(assinaturaTemplatesTable.codigo, [...CODIGOS_PADRAO]));

    const codigosExistentes = new Set(existentes.map((e) => e.codigo));
    const faltantes = CADERNOS_PADRAO.filter((c) => !codigosExistentes.has(c.codigo));

    if (faltantes.length === 0) {
      res.json({ inseridos: 0, pulados: CADERNOS_PADRAO.length, mensagem: "Todos os cadernos já estavam semeados." });
      return;
    }

    const inseridos = await db
      .insert(assinaturaTemplatesTable)
      .values(
        faltantes.map((c) => ({
          codigo: c.codigo,
          titulo: c.titulo,
          tipoDoc: c.tipoDoc,
          corpoHtml: c.corpoHtml,
          placeholders: PLACEHOLDERS_PADRAO,
          exigeMedico: c.exigeMedico,
          exigeClinica: c.exigeClinica,
          exigeTestemunhas: false,
          ativo: true,
        })),
      )
      .returning({ id: assinaturaTemplatesTable.id, codigo: assinaturaTemplatesTable.codigo });

    res.status(201).json({
      inseridos: inseridos.length,
      pulados: codigosExistentes.size,
      codigos: inseridos.map((i) => i.codigo),
    });
  } catch (err) {
    res.status(500).json({ error: "erro_seed_cadernos", detalhe: String(err) });
  }
});

// POST /api/cadernos-juridicos/emitir-lote — emite todos (ou lista) para um cliente
// Corpo: { clientId, protocolId?, dadosHidratacao?, codigos?, canais? }
router.post("/cadernos-juridicos/emitir-lote", async (req, res): Promise<void> => {
  const {
    clientId,
    protocolId,
    dadosHidratacao = {},
    codigos,
    canais = ["WHATSAPP", "EMAIL"],
  } = req.body as {
    clientId: number;
    protocolId?: number;
    dadosHidratacao?: Record<string, string>;
    codigos?: string[];
    canais?: string[];
  };

  if (!clientId) {
    res.status(400).json({ error: "clientId é obrigatório." });
    return;
  }

  const codigosAlvo = (codigos && codigos.length > 0)
    ? codigos
    : [...CODIGOS_PADRAO] as string[];

  // Busca os templates ativos
  const templates = await db
    .select({ id: assinaturaTemplatesTable.id, codigo: assinaturaTemplatesTable.codigo, titulo: assinaturaTemplatesTable.titulo, tipoDoc: assinaturaTemplatesTable.tipoDoc })
    .from(assinaturaTemplatesTable)
    .where(inArray(assinaturaTemplatesTable.codigo, codigosAlvo));

  if (templates.length === 0) {
    res.status(422).json({ error: "Nenhum caderno semeado. Execute POST /api/cadernos-juridicos/seed primeiro." });
    return;
  }

  // Busca dados do cliente para hidratação automática
  const [cliente] = await db
    .select()
    .from(clientsTable)
    .where(eq(clientsTable.id, clientId))
    .limit(1);

  if (!cliente) {
    res.status(404).json({ error: "Cliente não encontrado." });
    return;
  }

  const hidratacaoBase: Record<string, string> = {
    "cliente.nome": cliente.name || "",
    "cliente.cpf": cliente.cpf || "",
    "cliente.email": cliente.email || "",
    "cliente.telefone": cliente.phone || "",
    "data.hoje": new Date().toLocaleDateString("pt-BR"),
    "medico.nome": "Dr. Caio Henrique Fernandes Pádua",
    "medico.crm": "XXXXX",
    "medico.uf": "SP",
    "clinica.nome": "Clínica Tatuapé — Padcon Conect",
    "clinica.endereco": "São Paulo — SP",
    ...dadosHidratacao,
  };

  const resultados: { codigo: string; titulo: string; status: "enviado" | "erro"; detalhe?: string; solicitacaoId?: number }[] = [];

  for (const tpl of templates) {
    try {
      const resultado = await enviarAssinatura({
        pacienteId: clientId,
        templateCodigo: tpl.codigo,
        tipoDoc: tpl.tipoDoc as "TCLE" | "TERMO" | "RAS" | "OUTRO",
        titulo: tpl.titulo,
        escopo: protocolId ? `PROTOCOLO:${protocolId}` : undefined,
        canais: canais as CanalDistribuicao[],
        dados: hidratacaoBase,
        incluirMedico: true,
      });
      resultados.push({ codigo: tpl.codigo, titulo: tpl.titulo, status: "enviado", solicitacaoId: resultado.solicitacaoId });
    } catch (err) {
      resultados.push({ codigo: tpl.codigo, titulo: tpl.titulo, status: "erro", detalhe: String(err) });
    }
  }

  const enviados = resultados.filter((r) => r.status === "enviado").length;
  const erros = resultados.filter((r) => r.status === "erro").length;

  res.status(200).json({
    clienteId: clientId,
    clienteNome: cliente.name,
    protocolId: protocolId ?? null,
    totalCadernos: templates.length,
    enviados,
    erros,
    resultados,
  });
});

// PUT /api/cadernos-juridicos/:codigo — atualiza corpoHtml e/ou titulo
router.put("/cadernos-juridicos/:codigo", async (req, res): Promise<void> => {
  const { codigo } = req.params;
  const { corpoHtml, titulo, placeholders } = req.body as {
    corpoHtml?: string;
    titulo?: string;
    placeholders?: unknown[];
  };

  if (!corpoHtml && !titulo && !placeholders) {
    res.status(400).json({ error: "Nenhum campo para atualizar." });
    return;
  }

  try {
    const campos: Record<string, unknown> = { atualizadoEm: new Date() };
    if (corpoHtml) campos.corpoHtml = corpoHtml;
    if (titulo) campos.titulo = titulo;
    if (placeholders) campos.placeholders = placeholders;

    const [atualizado] = await db
      .update(assinaturaTemplatesTable)
      .set(campos)
      .where(eq(assinaturaTemplatesTable.codigo, codigo))
      .returning();

    if (!atualizado) {
      res.status(404).json({ error: "Caderno não encontrado. Execute /seed primeiro." });
      return;
    }

    res.json({ caderno: atualizado });
  } catch (err) {
    res.status(500).json({ error: "erro_atualizar_caderno", detalhe: String(err) });
  }
});

export default router;
