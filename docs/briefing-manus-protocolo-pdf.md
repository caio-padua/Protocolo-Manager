# Briefing para o Dr. Manus — Arquitetura do Protocolo PDF
**De:** Dr. Replit Paxter  
**Para:** Dr. Manus  
**Data:** 12/08/2026  
**Assunto:** Auditoria e sugestões de melhoria do Protocolo Médico Personalizado em PDF

---

## 1. CONTEXTO GERAL

O sistema gera dois documentos distintos ao fechar um protocolo. Este briefing cobre **apenas o primeiro** — o documento de apresentação clínica. O segundo (cadernos jurídicos via ZapSign) está documentado separadamente na seção 6.

| Documento | Para quem | Gerado como | Sistema |
|---|---|---|---|
| **Protocolo Médico Personalizado** | Paciente + arquivo clínico | PDF inline (download) | pdf-signer.ts |
| **Cadernos jurídicos (RAS FAP)** | Assinatura eletrônica paciente | Envelopes ZapSign | assinatura/service.ts |

---

## 2. IDENTIDADE DE MARCA — REGRA ATUAL (CRÍTICO)

O CEO confirmou em 12/08/2026: a marca visível ao cliente é **PADAXOR** (não mais PAXTER).  
O subtítulo em inglês permanece: **Clinical Intelligence System**  
O sistema ainda escreve "PAXTER" no código — isso é uma pendência de rebrand.

Locais no código onde "PAXTER" deve virar "PADAXOR":

| Arquivo | Linha | Texto atual | Deve ser |
|---|---|---|---|
| `pdf-signer.ts` | 922 | `"PAXTER"` | `"PADAXOR"` |
| `pdf-signer.ts` | 924 | `"PAXTER"` (canto superior direito) | `"PADAXOR"` |
| `pdf-signer.ts` | 1229 | `setAuthor("Instituto Padua - Paxter")` | `"Instituto Padua - Padaxor"` |
| `pdf-signer.ts` | 1231 | `setCreator("Sistema Paxter")` | `"Sistema Padaxor"` |
| `pdf-signer.ts` | 1250 | `"PAXTER"` (capa, tamanho 36) | `"PADAXOR"` |
| `pdf-signer.ts` | 1292 | `"Desenvolvido pela Padcon · Paxter"` | `"Desenvolvido pela Padcon · Padaxor"` |
| `pdf-signer.ts` | 911 | footer: `"· Paxter -"` | `"· Padaxor -"` |

---

## 3. ONDE ESTÁ O GERADOR DO PDF

### Arquivo principal
```
artifacts/api-server/src/lib/pdf-signer.ts
```
Tamanho: ~2.090 linhas  
Função de entrada:
```typescript
export async function generateProtocolDocumentPdf(
  data: ProtocolDocumentData
): Promise<{ pdfBytes: Uint8Array; certInfo: any }>
```

### Rota que dispara o PDF
```
artifacts/api-server/src/routes/protocols.ts
GET /api/protocols/:id/document-pdf   (linha 247)
```

---

## 4. A FIAÇÃO — DE ONDE VÊM OS DADOS (DATA BINDINGS)

### 4.1 Fluxo completo de dados

```
GET /api/protocols/:id/document-pdf
        │
        ├── DB: protocolsTable          → protocol (título, datas, valor, unidade, tipo)
        ├── DB: clientsTable            → client (nome, CPF, e-mail, telefone, nascimento)
        ├── DB: professionalsTable      → médico (nome, CRM) + enfermeiro (se houver)
        ├── DB: protocolItemsTable      → itens do protocolo (dose, sessões, intervalo, preço)
        │         └── JOIN substancesTable → nome, cor, tipo de via, todos os campos clínicos
        ├── DB: sessionsTable           → sessões agendadas (data, status)
        │         └── JOIN substanceApplicationsTable → status por substância por sessão
        └── DB: paymentsTable           → pagamentos (valor, método, status, vencimento)
                  │
                  ▼
        generateProtocolDocumentPdf(ProtocolDocumentData)
```

### 4.2 Interface completa de entrada do gerador

```typescript
// Linha 872 — pdf-signer.ts
interface ProtocolDocumentData {
  protocolId: number;
  protocolTitle: string;
  clientName: string;          // clients.name
  clientCpf: string;           // clients.cpf
  clientEmail: string;         // clients.email
  clientPhone?: string;        // clients.phone
  clientBirthDate?: string;    // clients.birth_date
  professionalName: string;    // professionals.name
  professionalCrm?: string;    // professionals.crm
  nurseName?: string;          // professionals onde specialty contém "enf"
  unit: string;                // protocols.unit || "Instituto Pádua"
  serviceType: string;         // protocols.service_type
  startDate: string;           // protocols.start_date (YYYY-MM-DD)
  endDate?: string;            // protocols.end_date
  totalValue: number;          // protocols.total_value
  notes?: string;              // protocols.notes
  substances: ProtocolDocSubstance[];
  sessions: ProtocolDocSession[];
  payments: ProtocolDocPayment[];
}
```

### 4.3 Interface de cada substância (rica — vem de substances + protocol_items)

```typescript
// Linha 820 — pdf-signer.ts
interface ProtocolDocSubstance {
  name: string;                // substances.name
  dose: string;                // protocol_items.dose  ← contém "/2 ML" (pendência de limpeza)
  color: string;               // substances.color (hex)
  totalSessions: number;       // protocol_items.total_sessions
  intervalDays: number;        // protocol_items.interval_days
  startDate: string;           // protocol_items.start_date
  procedureType: string;       // substances.procedure_type: "iv" | "im" | "sc" | "implant"
  unitPrice?: number;          // protocol_items.unit_price || substances.price_per_unit
  
  // Campos narrativos — preenchidos no cadastro da substância
  description?: string;        // substances.description
  mainFunction?: string;       // substances.main_function
  perceivedEffects?: string;   // substances.perceived_effects
  timeToEffect?: string;       // substances.time_to_effect
  contraindications?: string;  // substances.contraindications
  scientificEvidence?: string; // substances.scientific_evidence
  starRating?: number;         // substances.star_rating (1-5)
  
  // Impacto por sistema corporal — objeto JSON no banco
  bodySystemEffects?: Record<string, string>;  // substances.body_system_effects
  // Chaves conhecidas: longevidade, cardiovascular, muscular, metabolismo,
  //   neurocognicao, neurologico, imunologico, hematologico, osteoarticular,
  //   endocrino, hepatico, renal, muscular_hipertrofia, libido_sexual, dermatologico
  
  // Campos de benefício por dimensão — texto livre
  longevityBenefit?: string;
  qualityOfLifeImpact?: string;
  sleepBenefit?: string;
  energyBenefit?: string;
  libidoBenefit?: string;
  physicalPerformance?: string;
  muscleStrength?: string;
  mentalClarity?: string;
  skinHairNails?: string;
  immuneSupport?: string;
}
```

---

## 5. ESTRUTURA DE PÁGINAS DO PDF (ESTADO ATUAL — 12/08/2026)

| Página | Conteúdo | Localização no código |
|---|---|---|
| 1 | **Capa** — logo PADAXOR, título, dados do cliente, valor | pdf-signer.ts linha 1240 |
| 2 | **Matriz de Benefícios** — tabela substância × 9 dimensões (dots coloridos + estrelas) | pdf-signer.ts linha 1296 |
| 3 | **Radar de Foco** — teia de aranha 7 eixos (Energia, Clareza Mental, Imunidade, Ossos/Joints, Força Muscular, Metabolismo, Longevidade) | pdf-signer.ts linha ~1400 (inserida nesta sessão) |
| 4…N | **Fichas individuais das substâncias** — uma página por substância: categoria, tempo de efeito, função principal, barras de impacto por sistema, benefícios por dimensão, efeitos percebidos, evidência científica, contraindicações | pdf-signer.ts linha ~1500 |
| N+1 | **Calendário de sessões** — grade semana × substâncias, status DISP/PROX | pdf-signer.ts linha ~1820 |
| N+2 | **Financeiro** — itemizado por substância + totalizador | pdf-signer.ts linha ~1950 |

### Função auxiliar do radar (adicionada em 12/08/2026)

```typescript
// pdf-signer.ts linha ~1085
function deriveRadarDimensions(substances: ProtocolDocSubstance[]): RadarDim[]
// Mapeia bodySystemEffects e campos de benefício para 7 dimensões
// Escala: 0=ausente, 1=Apoio, 2=Foco, 3=Foco principal

// pdf-signer.ts linha ~1119
function drawRadarChart(page, fonts, cx, cy, radius, dims)
// Desenha polígono + anéis concêntricos + dots dourados + rótulos
// PENDÊNCIA: drawSvgPath() para o polígono fill precisa ser validado —
// pode estar silenciosamente falhando e o fallback de linhas está muito transparente
```

---

## 6. SISTEMA DE CADERNOS JURÍDICOS (SEPARADO — NÃO É O MESMO PDF)

Os cadernos NÃO fazem parte do PDF de protocolo. São documentos separados enviados via ZapSign para assinatura eletrônica do paciente.

**Disparo:** acontece no bloco `(async () => { ... })()` assíncrono pós-resposta da rota `GET /protocols/:id/document-pdf` (linha ~389 em protocols.ts).

**Arquivos envolvidos:**

| Arquivo | Papel |
|---|---|
| `artifacts/api-server/src/lib/cadernos-resolver.ts` | `resolverCodigosCadernos(vias[])` → detecta quais substâncias estão no protocolo por via e retorna Set de códigos (CGLO, CFOR, CIMU, CIMP, CSUB, TCLE, RAS-JUR, CLGPD, CPRIV, CGAR, CTCLE_G, CIMG, CDIG, CFIN, CINC) |
| `artifacts/api-server/src/lib/assinatura/service.ts` | `enviarAssinatura({ pacienteId, templateCodigo, dados, escopo, externalId })` → cria envelope ZapSign, hidrata variáveis `{{campo}}` do template, registra em `assinatura_solicitacoes` |
| `artifacts/api-server/src/routes/protocols.ts` | Monta o objeto `hidratacao` com os dados do protocolo e chama `enviarAssinatura` para cada caderno |

**Variável `{{protocolo.substancias}}` nos cadernos:**  
Atualmente gera uma tabela HTML com 5 colunas (substância, dose, sessões, frequência, via). A dose ainda contém "/2 ML" — pendência de limpeza (regex: `dose.replace(/\s*\/\s*\d+\s*(ml|mL)/gi, '')`).

---

## 7. OPORTUNIDADES DE MELHORIA IDENTIFICADAS

### 7.1 Rebrand PADAXOR (URGENTE)
Todos os "PAXTER" no pdf-signer.ts precisam virar "PADAXOR". Listado em detalhes na seção 2.

### 7.2 Polígono do radar não está renderizando
A função `drawRadarChart` usa `page.drawSvgPath()` para preencher o polígono de dados (cor mint + contorno dourado). No PDF gerado, o polígono não aparece — somente dots dourados nos vértices e linhas de eixo. Duas hipóteses:
- `drawSvgPath()` com `color` + `borderColor` não funciona como esperado nesta versão do pdf-lib
- O fallback (linhas individuais com `drawLine`) está com opacidade insuficiente

**Solução sugerida:** substituir o polígono fill por uma série de triângulos `drawTriangle(center → pt[i] → pt[i+1])` que a pdf-lib renderiza com fill nativo.

### 7.3 Capa da página 1 — espaço subutilizado
A capa tem dados do cliente em lista plana (texto). Oportunidade para um layout 2 colunas ou um bloco visual mais limpo com o radar da capa + valor em destaque.

### 7.4 Ficha de substância — dose exibida ainda contém "/2 ML"
O campo `dose` vem diretamente do banco como `"100 MG / 2 ML"`. O PDF exibe assim na ficha de cada substância. Sugestão: limpar para mostrar só a massa (`100 mg`) — concentração e volume são dados farmacotécnicos, não clínicos para o paciente.

### 7.5 Página financeira — muito discreta
A seção financeira (última página) mostra o itemizado por substância mas o layout é simples. Oportunidade para tornar o total final mais proeminente (tipografia grande, fundo de contraste) e o itemizado em tabela elegante.

### 7.6 Página de radar — rótulos em português e mais descritivos
Os 7 eixos usam nomes técnicos abreviados (`"Ossos/Joints"`). Sugestão: "Ossos e Articulações", "Força Muscular", "Saúde Metabólica" — mais legíveis para o paciente.

### 7.7 Paleta de cores — pendência de consistência
O PDF usa verde-petrol `rgb(0.12, 0.33, 0.33)` como cor dominante mas a marca atual é navy `#0B1D3A` + ouro `#D4AF37`. A página de radar já usa o creme `rgb(0.98, 0.97, 0.95)` e navy `DARK_BLUE`. As fichas de substância ainda usam petrol. Oportunidade de unificar a paleta.

---

## 8. ONDE ESTÃO OS ARQUIVOS — MAPA COMPLETO

```
artifacts/api-server/
├── src/
│   ├── lib/
│   │   ├── pdf-signer.ts           ← ARQUIVO PRINCIPAL do gerador de PDF
│   │   │                              Interfaces: linha 820-891
│   │   │                              Constantes de cor: linha 894-901
│   │   │                              drawDocFooter: linha 910
│   │   │                              drawDocHeaderBrand: linha 920 (marca PADAXOR)
│   │   │                              deriveRadarDimensions: linha ~1085
│   │   │                              drawRadarChart: linha ~1119
│   │   │                              generateProtocolDocumentPdf: linha 1223
│   │   │                              Capa (Pág 1): linha 1240
│   │   │                              Matriz de Benefícios (Pág 2): linha 1296
│   │   │                              Radar (Pág 3): linha ~1400
│   │   │                              Fichas de substância (Pág 4+): linha ~1500
│   │   │                              Calendário de sessões: linha ~1820
│   │   │                              Financeiro: linha ~1950
│   │   │
│   │   ├── cadernos-resolver.ts    ← Resolve quais cadernos ZapSign enviar por via
│   │   ├── assinatura/
│   │   │   └── service.ts          ← enviarAssinatura() — despacha para ZapSign
│   │   ├── ras-fap.ts              ← Gera PDF do RAS FAP PREMIUM (anexo do e-mail)
│   │   └── email-service.ts        ← sendProtocolEmail() — envia e-mail com 2 PDFs
│   │
│   └── routes/
│       └── protocols.ts            ← Rota GET /protocols/:id/document-pdf (linha 247)
│                                      Monta ProtocolDocumentData e chama gerador
│                                      Bloco pós-resposta: upload Drive + e-mail + ZapSign
│
└── src/db/schema.ts (ou packages/db/)
    └── Tabelas: protocols, protocol_items, substances, sessions,
                 substance_applications, payments, clients, professionals
```

### Banco de dados — tabelas relevantes

| Tabela | Conteúdo | Campos-chave para o PDF |
|---|---|---|
| `protocols` | Cabeçalho do protocolo | title, start_date, total_value, unit, service_type, client_id, professional_id |
| `protocol_items` | Uma linha por substância prescrita | substance_id, dose, total_sessions, interval_days, unit_price |
| `substances` | Catálogo completo de substâncias | name, procedure_type, body_system_effects (JSONB), todos os campos de benefício |
| `sessions` | Sessões agendadas | scheduled_date, status, week_number |
| `substance_applications` | Status de cada substância em cada sessão | session_id, substance_id, status, availability |
| `payments` | Pagamentos do protocolo | amount, method, status, due_date, paid_at |

---

## 9. COMO TESTAR AO VIVO

```bash
# Gerar PDF do protocolo 31 (Carlúcia — dados reais)
curl -o protocolo-31.pdf http://localhost:8080/api/protocols/31/document-pdf

# Verificar quantas páginas
# (use pdftoppm ou qualquer visualizador de PDF)
```

O PDF resultante deve ter 13 páginas para o protocolo 31 (6 substâncias + capa + matriz + radar + calendário + financeiro).

---

## 10. PEDIDO DO CEO AO DR. MANUS

O CEO pede que o Dr. Manus:

1. **Audite o PDF gerado** com olhar de produto — identifique o que pode ser melhorado em hierarquia visual, fluxo de leitura e elegância
2. **Sugira melhorias concretas** para cada página, especialmente:
   - Capa (página 1): mais impacto visual com a marca PADAXOR
   - Radar (página 3): polígono fill que não está renderizando + rótulos em PT-BR
   - Fichas de substância (páginas 4+): limpeza de dose + paleta navy/ouro
3. **Proponha o layout ideal** do bloco de substâncias nos cadernos jurídicos (que chegam via ZapSign) — elegante, TDAH-friendly, uma substância por linha
4. **Confirme a paleta correta** — a marca PADAXOR usa navy `#0B1D3A` + ouro `#D4AF37` + creme `#FAF9F6`

O Dr. Replit executará as implementações aprovadas diretamente no código.

---

*Documento gerado pelo Dr. Replit Paxter em 12/08/2026.*  
*Sistema: Padcon Conect · PADAXOR Clinical Intelligence System*
