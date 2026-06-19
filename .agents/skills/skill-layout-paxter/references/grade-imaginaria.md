# Grade Imaginária — Modelo Mental de Layout de Cards

> Aprendizado promulgado em 19/06/2026 a partir do redesenho da Agenda Semanal do Padcon Conect.
> Vale para TODOS os sistemas primos (Manager, IHE, futuros).

---

## Por que "grade imaginária"?

Um card bem construído cria linhas que o olho segue — sem que elas existam como elementos visuais.
O CEO (perfil TDAH) pousa o olhar UMA VEZ e extrai TODAS as informações.
Quando as posições variam conforme o conteúdo, o olho cansa antes de terminar de ler.

A "grade imaginária" é o conjunto de linhas horizontais e verticais implícitas
que o layout gera pela REGULARIDADE das zonas, não por bordas ou separadores visíveis.

---

## Diagrama de zonas (ASCII)

```
┌──────────────────────────────────────────────────────┐
│ ░ │ [⏰ HORÁRIO]  ·  [SEM. X]              [···menu] │  ← Zona 1: TOP BAR  (altura fixa)
│ ░ ├──────────────────────────────────────────────────┤
│ ░ │ NOME DO CLIENTE / ENTIDADE                       │  ← Zona 2a: TÍTULO  (1 linha, truncate)
│ ░ │ [CPF / ID]   [BADGE STATUS]                      │  ← Zona 2b: IDENTIDADE (concave-3d × 2)
│ ░ ├──────────────────────────────────────────────────┤
│ ░ │ [CAMPO A]     │  [CAMPO B]                       │  ← Zona 3: META GRID  (grid-cols-2)
│ ░ │ [CAMPO C]     │  [CAMPO D]                       │    cada célula = MetaField com "—" se vazio
│ ░ ├──────────────────────────────────────────────────┤
│ ░ │ ┌─────────────────────────────────────────────┐  │  ← Zona 4: CONTEÚDO  (concave-3d)
│ ░ │ │ [cor] ITEM A       div  1/8  STATUS  [cbox] │  │    grid de colunas fixas por linha
│ ░ │ │ [cor] ITEM B       div  2/8  STATUS  [cbox] │  │
│ ░ │ └─────────────────────────────────────────────┘  │
└──┴───────────────────────────────────────────────────┘
 ^
 Faixa lateral de status (4px, cor varia por estado — nunca um bloco largo)

Linhas imaginárias criadas:
  Horizontais → H1: fim do top bar | H2: fim da identidade | H3: fim do meta grid
  Verticais   → V1: borda esq. do conteúdo | V2: divisão da coluna direita do meta grid
```

---

## As 5 leis da grade imaginária

| Lei | Enunciado | Anti-padrão proibido |
|---|---|---|
| **Lei 1 — Zona fixa** | Cada zona tem altura previsível. O top bar nunca cresce. | Top bar com flex-wrap que desce o horário para a 2ª linha |
| **Lei 2 — Badge âncora** | Badge de status fica ao lado do CPF/identificador, não no topo-direito. | Badge flutuando ao lado do nome → posição varia com o comprimento do nome |
| **Lei 3 — Slot vazio existe** | Campo sem dado mostra "—" e ocupa o mesmo espaço. | Campo opcional que some quando vazio → todos os campos abaixo sobem |
| **Lei 4 — Grade, não flex** | Meta grid usa `grid-cols-N` fixo. | `flex flex-wrap` → largura dos campos varia com o conteúdo, colunas se perdem |
| **Lei 5 — Coluna por função** | Linhas de itens usam `grid-cols-[template fixo]`. Cada coluna = 1 função única. | Colunas que mudam de largura linha a linha → o olho não consegue alinhar os valores |

---

## Anti-padrão × Padrão (tabela de aprendizado)

| O que estava errado | Por que quebrava | O que fazer |
|---|---|---|
| Bloco lateral `screen-3d` para o horário (w-16) | Comprimia o nome em telas estreitas; criava assimetria | Horário no **top bar** horizontal (`flex items-center`) |
| Badge AGENDADO no canto superior direito do nome | Tamanho do nome empurrava o badge verticalmente | Badge na **linha do CPF**, ao lado, ambos `concave-3d shrink-0` |
| LED piscante `paxter-led-on` no separador de dia | CEO lia "1 SESSÃO" como "primeira sessão"; animação distrai | Contagem estática em `concave-3d` sem animação |
| Separador de dia com `border-dashed border-muted/50` | Quase invisível; não delimitava o dia visualmente | `panel-3d-active` com caixa do número + linha sólida `border-b-2` |
| Campo "Semana" dentro do meta grid | Ocupava slot valioso; semana já estava no top bar | Semana no **top bar** (`Sem. X`); meta grid fica só com campos de negócio |
| `flex items-start justify-between` para nome + badge | Badge saltava conforme comprimento do nome | Nome sozinho na linha 1; badge na linha 2 com `shrink-0` |
| Dropdown ⋯ duplicado (no corpo + no top bar) | Dois menus para a mesma ação | Único dropdown no extremo direito do top bar (`ml-auto`) |

---

## Receita JSX de referência (comentada)

```jsx
<Card className="panel-3d-sub overflow-hidden">
  <div className="flex h-full">

    {/* Faixa lateral de status — máximo 4px, nunca um bloco largo */}
    <div className={`w-1 shrink-0 ${corDaFaixa}`} />

    <CardContent className="p-0 flex-1 min-w-0">

      {/* ── ZONA 1: TOP BAR ──────────────────────────────────────────── */}
      {/* Altura fixa, nunca cresce. Sempre: ícone + tempo · sequência · menu */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-muted/20 bg-muted/8">
        <Clock className="h-3.5 w-3.5 text-cyan-500 shrink-0" />
        <span className="text-sm font-black text-primary tabular-nums">{horario}</span>
        <span className="text-muted-foreground/30 text-xs select-none">·</span>
        <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">
          Sem. {semana}
        </span>
        {/* Menu sempre no extremo direito — ml-auto empurra para cá */}
        <div className="ml-auto">
          <DropdownMenu>...</DropdownMenu>
        </div>
      </div>

      {/* ── ZONA 2: IDENTIDADE ───────────────────────────────────────── */}
      {/* Linha 2a: nome — truncate impede crescimento horizontal */}
      {/* Linha 2b: CPF + badge — ambos shrink-0, nunca se movem */}
      <div className="px-3 pt-3 pb-1">
        <div className="text-base font-black uppercase tracking-tight text-foreground truncate">
          {nomeDoCliente}
        </div>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          {/* CPF — concave-3d, largura natural */}
          <div className="concave-3d px-2 py-0.5 text-[11px] font-bold text-muted-foreground tabular-nums">
            {cpf || "—"}
          </div>
          {/* Badge de status — concave-3d, NUNCA no canto superior-direito */}
          <div className={`concave-3d px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest ${corDoStatus}`}>
            {textoDoStatus}
          </div>
        </div>
      </div>

      {/* ── ZONA 3: META GRID ────────────────────────────────────────── */}
      {/* SEMPRE grid-cols-N fixo. Nunca flex-wrap. Campo vazio = "—", slot mantido. */}
      <div className="grid grid-cols-2 gap-1.5 px-3 pb-2">
        <MetaField label="Unidade"      value={unidade}      icon={Building2} />
        <MetaField label="Protocolo"    value={protocolo} />
        <MetaField label="Procedimento" value={procedimento} />
        <MetaField label="Profissional" value={profissional}  icon={User} />
      </div>

      {/* ── ZONA 4: CONTEÚDO (lista de itens) ───────────────────────── */}
      {/* concave-3d cria o sulco. Cada linha usa grid de template fixo. */}
      <div className="concave-3d mx-3 mb-3 p-2 space-y-1.5">
        {itens.map(item => (
          <div
            key={item.id}
            className="bevel-3d grid grid-cols-[14px_minmax(0,1fr)_0.75rem_3rem_4.5rem_2rem] items-center gap-x-2 px-2.5 py-2"
            //                      ^cor   ^nome            ^div   ^num  ^estado  ^ctrl
          >
            <span className="h-3.5 w-3.5 rounded-[3px] ring-1 ring-black/15 shrink-0"
                  style={{ backgroundColor: item.cor }} />
            <span className="min-w-0 truncate text-xs font-bold uppercase">{item.nome}</span>
            <span className="justify-self-center h-7 w-px bg-foreground/15" /> {/* divisor visual */}
            <span className="text-[11px] font-bold tabular-nums text-right">{item.progresso}</span>
            <span className="text-[9px] font-black uppercase text-center">{item.estado}</span>
            <Checkbox aria-label={`Confirmar ${item.nome}`} />
          </div>
        ))}
      </div>

    </CardContent>
  </div>
</Card>
```

---

## MetaField — helper canônico

```jsx
// Slot fixo com rótulo MAIÚSCULO + valor gravado ou "—"
// Campo NUNCA some — mostra "—" quando vazio, mantendo o alinhamento dos cards abaixo
function MetaField({ label, value, icon: Icon }: { label: string; value: string | null; icon?: any }) {
  const empty = value == null || value === "";
  return (
    <div className="concave-3d px-2.5 py-1.5 min-w-0">
      <div className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/70 leading-none mb-1">
        {label}
      </div>
      <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-tight leading-none min-w-0">
        {Icon && !empty && <Icon className="h-3 w-3 shrink-0 text-muted-foreground" />}
        <span className={`truncate ${empty ? "text-muted-foreground/40" : "text-foreground"}`}>
          {empty ? "—" : value}
        </span>
      </div>
    </div>
  );
}
```

---

## Separador de dia / grupo — não confundir com LED de sessão

Quando os cards são agrupados por dia ou categoria, o separador deve:

```jsx
{/* SEPARADOR DE DIA — delimitação forte, sem LED piscante */}
<div className="flex items-center gap-3 pt-3">
  {/* Caixa do número: panel-3d-active = saliente + halo */}
  <div className={`panel-3d-active flex items-center gap-3 px-4 py-2 ${
    isHoje ? "ring-2 ring-cyan-400/70" : ""
  }`}>
    <div className="flex flex-col items-center min-w-[2.25rem]">
      <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">
        {diaDaSemana}  {/* "SEG", "TER" etc. */}
      </span>
      <span className="text-2xl font-black tabular-nums text-foreground">{dia}</span>
    </div>
    {/* Contagem estática — sem LED piscante, sem animação */}
    {qtd > 0 && (
      <div className="concave-3d px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
        {qtd} {qtd === 1 ? "sessão" : "sessões"}
      </div>
    )}
  </div>
  {/* Linha sólida, não tracejada */}
  <div className={`flex-1 h-0.5 ${isHoje ? "bg-cyan-400/30" : "bg-foreground/8"}`} />
</div>
```

**Regra:** LED (`paxter-led-on`) é EXCLUSIVO para status binário on/off de um item.
Nunca usar LED para contagens ou títulos de seção — confunde "1 item" com "primeira vez".

**Vocabulário clínico obrigatório no separador de dia (decisão CEO 19/06/2026):**

| Termo | Definição clínica | Onde aparece |
|---|---|---|
| **Atendimento** | Visita agendada de um paciente (1 paciente = 1 atendimento) | Contagem no separador de dia da Agenda |
| **Sessão** | Aplicação individual de uma substância num protocolo | Dentro do card — "Sem. X", "1/8", substâncias aplicadas |

`{count} {count === 1 ? "atendimento" : "atendimentos"}` — nunca "sessão/sessões" no separador de dia.

---

## Checklist de revisão (antes de entregar qualquer card)

| # | Pergunta | Resposta esperada |
|---|---|---|
| 1 | O horário/timestamp está no top bar? | Sim, primeira linha do card, `flex items-center` |
| 2 | O badge de status está ao lado do CPF (não do nome)? | Sim, linha 2 da identidade |
| 3 | O meta grid usa `grid-cols-N`, não `flex-wrap`? | Sim |
| 4 | Campos opcionais vazios mostram "—"? | Sim, slot presente, nunca some |
| 5 | Linhas de itens usam `grid-cols-[template fixo]`? | Sim, mesmo template em todas as linhas |
| 6 | Existe algum LED animado em título de seção ou contagem? | Não — LED só para on/off de item |
| 7 | A faixa lateral de status tem no máximo 4–6px? | Sim, `w-1` ou `w-1.5` |
| 8 | O dropdown de ações está no top bar (`ml-auto`)? | Sim, único, não duplicado |
| 9 | Ao truncar o nome, o badge e os campos abaixo ficam no lugar? | Sim — verificar em mobile 360px |
| 10 | Posso "bater o olho uma vez" e saber: quem, quando, status e o que fazer? | Sim — se não, a grade está quebrada |

---

## Aplicabilidade — sistemas primos

Esta referência é agnóstica a projeto. Aplica-se a:

| Sistema | Contexto típico |
|---|---|
| Padcon Conect (Manager) | Cards de sessão (Agenda), cards de protocolo, linhas de estoque, cards de RAS |
| IHE (Integrative Health Engine) | Cards de paciente, cards de exame, linhas de anamnese |
| Qualquer sistema primo futuro | Qualquer lista de entidades com dados de múltiplos campos |

O vocabulário de classes CSS (`panel-3d-sub`, `concave-3d`, `bevel-3d`, `MetaField`) vive
no Padcon Conect. Sistemas primos implementam suas próprias classes equivalentes seguindo
o mesmo modelo mental — não importam as classes, mas sim as 5 leis e o checklist.

---

RESUMO EM 1 LINHA: grade imaginária = zonas empilhadas com altura previsível + slots fixos
com "—" quando vazios + badge de status ao lado do identificador, nunca flutuando ao lado do nome.
