# CARTA IHE → MANAGER — IMPORTAR TODOS OS CADERNOS JURÍDICOS

- De: Dr. Replit Pawards (repo `caio-padua/Integrative-Health-Engine`, branch `ver-l2-dr-claude`)
- Para: Dr. Replit Manager (repo `caio-padua/Protocolo-Manager`, branch `main`)
- Intermediário: CEO Dr. Caio (controlador e único decisor)
- Data: 17/07/2026
- Assunto: inventário completo + passo a passo para importar os 17 cadernos jurídicos do IHE (Integrative Health Engine = motor clínico) para o Manager

> SIGLAS EXPLICADAS (regra do CEO: sempre, toda vez que aparecerem):
> IHE = Integrative Health Engine — o sistema de clínica integrativa (repo Pawards).
> Manager = Protocolo-Manager — o produto Padcon Conect (repo do Manager).
> LGPD = Lei Geral de Proteção de Dados (Lei 13.709/2018).
> CFM = Conselho Federal de Medicina.
> GLP-1 = agonista do receptor do peptídeo semelhante ao glucagon tipo 1 (ex.: semaglutida).
> GH = hormônio do crescimento (somatropina).
> ANVISA = Agência Nacional de Vigilância Sanitária.
> API = interface de programação de aplicativo (a URL que o servidor responde com dados).
> JSON = formato de dados estruturado em texto (JavaScript Object Notation).
> UPSERT = inserir se não existe / atualizar se já existe (operação idempotente no banco).
> SQL = Structured Query Language — linguagem de consulta ao banco de dados relacional.
> FK = Foreign Key — chave estrangeira (referência entre tabelas).
> TCLE = Termo de Consentimento Livre e Esclarecido.
> ICP-Brasil = Infraestrutura de Chaves Públicas Brasileira (padrão de assinatura digital legal).
> HTML = HyperText Markup Language — formato de texto com marcações para web.
> off-label = uso fora da indicação aprovada na bula, permitido sob autonomia médica.

---

## 1. CONCLUSÃO PRIMEIRO

O IHE tem **17 cadernos jurídicos** com texto completo redigido, validado e gravado no banco.
O Manager tem **zero** cadernos jurídicos específicos.
A infraestrutura do Cartório no Manager está 100% pronta (tabelas, rotas, ZapSign — sistema de assinatura digital).
**O único trabalho pendente é semear os textos no banco do Manager.**

---

## 2. INVENTÁRIO — OS 17 CADERNOS DO IHE

| ID IHE | Código | Nome oficial | Categoria | Bloco | Tamanho do texto |
|--------|--------|--------------|-----------|-------|-----------------|
| 1 | `LGPD` | Consentimento Livre, Esclarecido e Informado para Tratamento de Dados Pessoais (Lei 13.709/2018) | lgpd | JURI.BASE | 6.802 caracteres |
| 2 | `PRIV` | Política de Privacidade e Sigilo Médico Profissional — Conformidade CFM e LGPD | privacidade | JURI.BASE | 3.782 caracteres |
| 3 | `NGAR` | Termo de Ciência sobre Não-Garantia de Resultados Terapêuticos | nao_garantia | JURI.BASE | 3.326 caracteres |
| 4 | `TCLE` | Termo de Consentimento Livre e Esclarecido — TCLE Global do Protocolo Terapêutico Integrado | tcle_global | JURI.CONS | 6.149 caracteres |
| 5 | `CFOR` | Consentimento Específico — Prescrição e Uso de Fórmulas Manipuladas | consentimento_especifico | JURI.CONS | 5.010 caracteres |
| 6 | `CIMU` | Consentimento Específico — Aplicação de Injetáveis por Via Intramuscular (IM) | consentimento_especifico | JURI.CONS | 3.992 caracteres |
| 7 | `CEND` | Consentimento Específico — Aplicação de Substâncias por Via Endovenosa (EV) | consentimento_especifico | JURI.CONS | 4.783 caracteres |
| 8 | `CIMP` | Consentimento Específico — Implantes Subcutâneos Hormonais e Pellets | consentimento_especifico | JURI.CONS | 4.901 caracteres |
| 9 | `CEIN` | Consentimento Específico — Procedimentos Estéticos Invasivos | consentimento_especifico | JURI.CONS | 3.524 caracteres |
| 10 | `CETE` | Consentimento Específico — Procedimentos Estéticos por Tecnologia | consentimento_especifico | JURI.CONS | 3.169 caracteres |
| 11 | `IMAG` | Autorização de Uso de Imagem, Voz e Material Clínico | imagem | JURI.IMAG | 4.052 caracteres |
| 12 | `DIGI` | Aceite Digital e Assinatura Eletrônica — Validade Jurídica e ICP-Brasil | aceite_digital | JURI.DIGI | 3.018 caracteres |
| 13 | `CIEN` | Termo de Ciência Financeira e Aceitação Comercial | ciencia_financeira | FINA.CIEN | 3.974 caracteres |
| 14 | `CSUB` | Consentimento Específico — Peptídeos, Agonistas de GLP-1 e GH | consentimento_especifico | JURI.CONS | 3.087 caracteres |
| 15 | `CINC` | Consentimento Específico — Análogos de Incretinas e Agonistas de GLP-1 | consentimento_especifico | JURI.CONS | 4.774 caracteres |
| 16 | `CPEP` | Consentimento Específico — Peptídeos, Secretagogos de GH e Moléculas Metabólicas | consentimento_especifico | JURI.CONS | 5.016 caracteres |
| 17 | `CLIP` | Consentimento Específico — Agentes Lipolíticos Injetáveis Subcutâneos | consentimento_especifico | JURI.CONS | 4.401 caracteres |

---

## 3. ONDE BUSCAR OS TEXTOS — 2 ROTAS DISPONÍVEIS

### Rota A — API do IHE (recomendada)

O IHE já expõe uma rota pública que devolve todos os 17 termos com texto completo:

```
GET /api/termos-juridicos/todos
```

Esta rota retorna um array JSON (JavaScript Object Notation) com todos os campos:
`id`, `bloco`, `subgrupo`, `consentimento`, `titulo`, `textoCompleto`, `categoria`,
`riscosEspecificos`, `metadados`, `versao`, `ativo`.

**Para usar:** fazer um `fetch` para esta URL a partir do script de seed do Manager.
O token de autenticação não é necessário (rota pública de leitura).

### Rota B — Raw GitHub (fallback)

URL raw do arquivo de schema do IHE:
```
https://raw.githubusercontent.com/caio-padua/Integrative-Health-Engine/ver-l2-dr-claude/lib/db/src/schema/termosJuridicos.ts
```

Os textos completos estão no **banco do IHE**, não no GitHub.
Por isso, a Rota A (API) é obrigatória para buscar os textos.

---

## 4. MAPEAMENTO DE COLUNAS — IHE → MANAGER

O IHE usa a tabela `termos_juridicos`.
O Manager usa a tabela `assinatura_templates`.
São tabelas com nomes diferentes mas estrutura equivalente.

| Campo no IHE (`termos_juridicos`) | Campo no Manager (`assinatura_templates`) | Regra de mapeamento |
|---|---|---|
| `consentimento` (ex.: `"CFOR"`) | `codigo` | Usar o código. Se for `null` no IHE, usar a `categoria` em maiúsculo (ex.: `"LGPD"`, `"PRIV"`) |
| `titulo` | `nome_exibicao` | Copiar direto |
| `texto_completo` | `conteudo_html` | Envolver em `<p>` + quebrar linhas em `<br>` — o Manager usa HTML, o IHE usa texto puro |
| `categoria` | `categoria` | Copiar direto |
| `bloco` | `tipo_documento` | Ver tabela de mapeamento abaixo |
| `versao` | `versao` | Copiar direto |
| `riscos_especificos` | `placeholders` | Os riscos vão como `placeholders` JSON (JavaScript Object Notation) |
| `metadados` | `validacoes_minimas` | Os metadados vão em `validacoes_minimas` |
| — | `exige_medico` | Sempre `true` para todos os cadernos |
| — | `exige_clinica` | `true` para CFOR, CIMU, CEND, CIMP, CEIN, CETE, CSUB, CINC, CPEP, CLIP; `false` para os demais |
| — | `exige_testemunhas` | `false` para todos (testemunhas são opcionais no fluxo atual) |
| — | `pasta_drive_destino` | Ver tabela abaixo |
| `ativo` | `ativo` | Copiar direto |

### Mapeamento de bloco → tipo_documento e pasta_drive_destino

| Bloco IHE | `tipo_documento` no Manager | `pasta_drive_destino` |
|---|---|---|
| `JURI.BASE` | `TERMO` | `JURIDICO/BASE` |
| `JURI.CONS` | `TCLE` | `JURIDICO/CONSENTIMENTOS` |
| `JURI.IMAG` | `TERMO` | `JURIDICO/IMAGEM` |
| `JURI.DIGI` | `TERMO` | `JURIDICO/DIGITAL` |
| `FINA.CIEN` | `CONTRATO` | `FINANCEIRO/CIENCIA` |

---

## 5. PASSO A PASSO — O QUE O MANAGER PRECISA FAZER

### Passo 1 → Criar o arquivo de seed

Criar o arquivo: `scripts/src/seed-cadernos-juridicos.ts`

Este script deve:
1. Chamar `GET /api/termos-juridicos/todos` na URL do IHE
2. Para cada termo recebido, montar o objeto no formato do Manager
3. Fazer `INSERT` com `ON CONFLICT (codigo) DO UPDATE` (UPSERT idempotente)

### Passo 2 → Adicionar o script ao `scripts/package.json`

```json
{
  "scripts": {
    "seed:cadernos-juridicos": "tsx src/seed-cadernos-juridicos.ts"
  }
}
```

### Passo 3 → Rodar

```bash
pnpm --filter @workspace/scripts run seed:cadernos-juridicos
```

### Passo 4 → Verificar

```sql
SELECT codigo, nome_exibicao, tipo_documento, ativo
FROM assinatura_templates
ORDER BY tipo_documento, codigo;
```

Deve retornar 17 linhas (mais as existentes antes do seed).

---

## 6. SCRIPT MODELO — COPIAR E ADAPTAR

```typescript
// scripts/src/seed-cadernos-juridicos.ts
// Importa os 17 cadernos jurídicos do IHE e semeia no banco do Manager.
// UPSERT idempotente por `codigo` — seguro rodar mais de uma vez.

import { db } from "@workspace/db";
import { assinaturaTemplatesTable } from "@workspace/db/schema";
import { sql } from "drizzle-orm";

// URL da API do IHE — ajustar conforme ambiente
const IHE_API_BASE = process.env.IHE_API_URL ?? "http://localhost:80";

interface TermoIHE {
  id: number;
  bloco: string;
  subgrupo: string;
  consentimento: string | null;
  titulo: string;
  textoCompleto: string;
  categoria: string;
  riscosEspecificos: unknown[];
  metadados: Record<string, unknown>;
  versao: number;
  ativo: boolean;
}

function blocoParaTipoDoc(bloco: string): string {
  if (bloco === "JURI.CONS") return "TCLE";
  if (bloco === "FINA.CIEN") return "CONTRATO";
  return "TERMO";
}

function blocoParaPastaDrive(bloco: string): string {
  const mapa: Record<string, string> = {
    "JURI.BASE": "JURIDICO/BASE",
    "JURI.CONS": "JURIDICO/CONSENTIMENTOS",
    "JURI.IMAG": "JURIDICO/IMAGEM",
    "JURI.DIGI": "JURIDICO/DIGITAL",
    "FINA.CIEN": "FINANCEIRO/CIENCIA",
  };
  return mapa[bloco] ?? "JURIDICO/BASE";
}

function textoParaHtml(texto: string): string {
  // Converte texto puro em HTML básico com parágrafos
  return texto
    .split(/\n\n+/)
    .map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`)
    .join("\n");
}

const EXIGE_CLINICA_CODIGOS = new Set([
  "CFOR", "CIMU", "CEND", "CIMP", "CEIN", "CETE",
  "CSUB", "CINC", "CPEP", "CLIP",
]);

async function main() {
  console.log("[seed] Buscando termos jurídicos do IHE...");
  const resp = await fetch(`${IHE_API_BASE}/api/termos-juridicos/todos`);
  if (!resp.ok) throw new Error(`IHE respondeu ${resp.status}`);

  const termos: TermoIHE[] = await resp.json();
  console.log(`[seed] ${termos.length} termos recebidos do IHE`);

  let inseridos = 0;
  let atualizados = 0;

  for (const termo of termos) {
    if (!termo.ativo) continue;

    // Código: usa o campo consentimento do IHE; se nulo, usa a categoria em maiúsculo
    const codigo = (termo.consentimento ?? termo.categoria).toUpperCase();

    const registro = {
      codigo,
      nomeExibicao: termo.titulo,
      tipoDocumento: blocoParaTipoDoc(termo.bloco),
      categoria: termo.categoria,
      pastaDriveDestino: blocoParaPastaDrive(termo.bloco),
      versao: String(termo.versao ?? "1"),
      conteudoHtml: textoParaHtml(termo.textoCompleto),
      placeholders: termo.riscosEspecificos ?? [],
      validacoesMinimas: termo.metadados ?? {},
      exigeMedico: true,
      exigeClinica: EXIGE_CLINICA_CODIGOS.has(codigo),
      exigeTestemunhas: false,
      ativo: true,
    };

    // UPSERT idempotente — se o código já existe, atualiza o texto
    const resultado = await db
      .insert(assinaturaTemplatesTable)
      .values(registro)
      .onConflictDoUpdate({
        target: assinaturaTemplatesTable.codigo,
        set: {
          nomeExibicao: registro.nomeExibicao,
          conteudoHtml: registro.conteudoHtml,
          placeholders: registro.placeholders,
          validacoesMinimas: registro.validacoesMinimas,
          atualizadoEm: new Date(),
        },
      })
      .returning({ id: assinaturaTemplatesTable.id });

    console.log(`  [${codigo}] ${termo.titulo.slice(0, 60)}...`);
    inseridos++;
  }

  console.log(`[seed] Concluído — ${inseridos} cadernos processados`);
}

main().catch((e) => { console.error(e); process.exit(1); });
```

---

## 7. TABELA FINAL — CÓDIGOS QUE DEVEM EXISTIR NO MANAGER APÓS O SEED

| Código a criar | Nome curto | Precisa de médico? | Precisa de clínica? |
|---|---|---|---|
| `LGPD` | Proteção de Dados (Lei 13.709/2018) | Sim | Não |
| `PRIV` | Política de Privacidade + Sigilo CFM | Sim | Não |
| `NGAR` | Não-Garantia de Resultados | Sim | Não |
| `TCLE` | TCLE Global do Protocolo | Sim | Não |
| `CFOR` | Fórmulas Magistrais (via oral) | Sim | Sim |
| `CIMU` | Injetáveis Intramusculares (IM) | Sim | Sim |
| `CEND` | Via Endovenosa (EV) | Sim | Sim |
| `CIMP` | Implantes e Pellets Subcutâneos | Sim | Sim |
| `CEIN` | Estética Invasiva | Sim | Sim |
| `CETE` | Estética por Tecnologia | Sim | Sim |
| `IMAG` | Uso de Imagem e Voz | Sim | Não |
| `DIGI` | Aceite Digital / ICP-Brasil | Sim | Não |
| `CIEN` | Ciência Financeira | Sim | Não |
| `CSUB` | Peptídeos + GLP-1 + GH | Sim | Sim |
| `CINC` | Análogos de Incretinas / GLP-1 | Sim | Sim |
| `CPEP` | Peptídeos + Secretagogos de GH | Sim | Sim |
| `CLIP` | Lipolíticos Injetáveis Subcutâneos | Sim | Sim |

---

## 8. ALERTA JURÍDICO OBRIGATÓRIO

O campo `metadados` do CSUB (ID 14 no IHE) contém:
```
"revisaoJuridica": "PENDENTE — texto técnico-clínico redigido por Dr. Replit Pawards,
carece de ratificação por advogado antes do uso com cliente real"
```

**Regra para TODOS os 17 cadernos:**
Os textos foram redigidos com base em pesquisa jurídica (CFM, LGPD, CDC, STJ).
Antes de usar com cliente real, o CEO Dr. Caio deve submeter os textos a revisão por advogado especializado em direito médico.
Usar o campo `validacoes_minimas` (que receberá os metadados do IHE) como rastreabilidade desta pendência.

---

## 9. REGRA DE OURO — OPERAÇÃO ADITIVA

```
NUNCA dropar a tabela assinatura_templates.
NUNCA deletar registros existentes.
SEMPRE usar UPSERT por código (ON CONFLICT (codigo) DO UPDATE).
O seed pode rodar quantas vezes forem necessárias — é idempotente.
```

---

## RESUMO EM 1 LINHA

O IHE tem 17 cadernos jurídicos prontos no banco — o Manager cria o script `seed-cadernos-juridicos.ts`, chama `GET /api/termos-juridicos/todos` do IHE, mapeia as colunas conforme a tabela da seção 4 e executa UPSERT idempotente na `assinatura_templates`.
