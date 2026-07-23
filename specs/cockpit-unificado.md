# SPEC: Cockpit de Consulta Unificado
**Data:** 23/07/2026  
**Onda:** Fusão Cockpit + Cadastro do Cliente  
**Status:** ESPECIFICANDO  

---

## 0. CONTEXTO (estado atual)

| Tela | Rota | Conteúdo | Tamanho |
|---|---|---|---|
| Cockpit do Cliente | `/cockpit-cliente` | 7 abas: Prescrição / Injetáveis / Implantes / Exames / Evolução / Documentos / Anamnese Prévia + ClienteCracha no topo (foto + dados cadastrais + quadro clínico) | 272 linhas |
| Cadastro do Cliente | `/clients/:id` | 4 abas: Protocolos / Sessões / Financeiro / Endereços + botão Google Drive + formulário de pagamento | 647 linhas |
| Cockpit (formato antigo) | `/cockpit` | 3 colunas DTO: Passado / Presente / Futuro (motor de anamnese) | 650 linhas |
| Menu lateral | — | Tem 3 entradas: "Cockpit da Consulta" → `/cockpit-cliente`, "Cockpit da Anamnese" → `/cockpit-anamnese`, "Cockpit (formato antigo)" → `/cockpit` | — |

## 1. PROBLEMA / DECISÃO DO CEO

O CEO tem hoje **duas telas** para o mesmo cliente: o Cockpit e o Cadastro.  
Decisão (23/07/2026): **UMA TELA ÚNICA** — o Cockpit de Consulta (`/cockpit-cliente`) absorve tudo.

## 2. REFERÊNCIA VISUAL (Paint do CEO)

A imagem mostra o layout desejado:  
- **Topo**: foto do cliente + nome + CPF + dados cadastrais (nascimento, tipo sanguíneo, endereço)  
- **Direita do topo**: Quadro Clínico (patologias diagnosticadas, suspeitas, alergias, medicações contínuas, hábitos)  
- **Faixa de abas**: PRESCRIÇÃO | INJETÁVEIS | IMPLANTES | EXAMES | EVOLUÇÃO | DOCUMENTOS | ANAMNESE PRÉVIA  
- **Novas abas a adicionar**: PROTOCOLOS | FINANCEIRO | CADASTRO  
- **Abaixo**: Prontuário do Cliente (conteúdo da aba ativa)  

O `ClienteCracha` existente JÁ cobre o topo. As abas existentes ficam. Apenas adicionamos as 3 novas.

## 3. O QUE MUDA

### 3.1 — `cockpit-cliente/index.tsx` (ÚNICO ARQUIVO QUE RECEBE CÓDIGO NOVO)

**Adicionar 3 novas entradas no array `ABAS`:**

| id | Rótulo | Ícone | Conteúdo |
|---|---|---|---|
| `protocolos` | Protocolos | `ClipboardList` | Lista de protocolos do cliente (extraída de `clients/detail.tsx` TabsContent "protocols" + "sessions") |
| `financeiro` | Financeiro | `DollarSign` | Pagamentos + formulário de novo pagamento (extraído de `clients/detail.tsx` TabsContent "financial") |
| `cadastro` | Cadastro | `User` | Dados de endereço + Google Drive + ClientServiceAddresses (extraído de `clients/detail.tsx` TabsContent "enderecos") |

**Importações a adicionar:**
- `useListProtocols`, `useListSessions`, `useListPayments` de `@workspace/api-client-react`
- `ClientServiceAddresses` de `@/components/ClientServiceAddresses`
- Hooks e lógica de pagamento (copiados do detail.tsx, adaptados para `clienteId` existente)

**Regra de implementação:**
- O conteúdo das novas abas é extraído do `clients/detail.tsx` e embutido diretamente — sem criar novos arquivos de painel
- Os dados já existem via hooks; apenas renderizar o JSX dentro do bloco `{aba === "protocolos" && ...}`
- Manter o array `AbaId` com tipagem correta

### 3.2 — `App.tsx` (1 LINHA MUDA)

**Rota `/clients/:id`** deixa de renderizar `<ClientDetail>` e passa a redirecionar:

```tsx
// ANTES
<Route path="/clients/:id" component={ClientDetail} />

// DEPOIS
<Route path="/clients/:id">
  {(params) => <Redirect to={`/cockpit-cliente?cliente=${params?.id}`} />}
</Route>
```

O import de `ClientDetail` permanece (não deletar — Regra de Ouro).  
O import de `Redirect` do wouter já existe no arquivo.

### 3.3 — `Layout.tsx` (MENU — 1 ENTRADA REMOVIDA DO VISUAL)

**"Cockpit (formato antigo)"** sai do menu visível.  
Estratégia: não deletar a rota `/cockpit`, apenas remover a entrada do array de menu.  
O arquivo `/cockpit/index.tsx` permanece intacto.

## 4. O QUE NÃO MUDA (REGRA DE OURO)

| Arquivo | Por quê preservar |
|---|---|
| `clients/detail.tsx` | Intacto — conteúdo vai para o cockpit como cópia inline |
| `cockpit/index.tsx` | Intacto — rota `/cockpit` continua existindo |
| `ClienteCracha` + `ClientePicker` | Permanecem exatamente como estão |
| Todas as 7 abas existentes | Permanecem sem alteração |
| URL persistence (`?cliente=ID&aba=X`) | Permanece como está |

## 5. REGRA DIAMANTE (CEO — 23/07/2026)

> "Não teremos 2 telas de Cockpit de Consulta."

- Menu: apenas "Cockpit da Consulta" → `/cockpit-cliente` (entrada do formato antigo removida do menu)
- Clicar em qualquer cliente em `/clients` → redireciona para `/cockpit-cliente?cliente=ID`
- O cockpit do menu e o cockpit aberto pelo cliente = O MESMO COMPONENTE, mesma URL, mesmo estado

## 6. FLUXO PÓS-FUSÃO

```
Lista de clientes (/clients)
  → clica em qualquer cliente
  → redirect /cockpit-cliente?cliente=ID
  → ClientePicker JÁ aparece com o cliente selecionado
  → abas disponíveis: 10 (7 originais + 3 novas)

Menu lateral → "Cockpit da Consulta"
  → abre /cockpit-cliente
  → se não há ?cliente=, mostra ClientePicker para selecionar
  → mesma tela
```

## 7. ORDEM DE CONSTRUÇÃO

```
PASSO 1 → Adicionar 3 abas no cockpit-cliente/index.tsx
           (conteúdo inline, sem criar novos arquivos de painel)

PASSO 2 → Mudar a rota /clients/:id no App.tsx para redirect

PASSO 3 → Remover entrada "Cockpit (formato antigo)" do array de menu em Layout.tsx

PASSO 4 → Testar: abrir /clients → clicar cliente → chega no cockpit com cliente pré-carregado
```

## 8. O QUE NÃO ENTRA NESTA ONDA

- Fusão do `/cockpit` (3 colunas DTO) dentro do cockpit-cliente como aba — pode ser Onda 2
- Redesign visual do ClienteCracha para ficar igual ao Paint — pode ser Onda 2
- Novo campo "Como Conheceu" no topo do crachá — pode ser Onda 2

## 9. CRITÉRIOS DE APROVAÇÃO

- [ ] Clicar em cliente em `/clients` abre o cockpit com o cliente já selecionado
- [ ] As 3 novas abas (Protocolos, Financeiro, Cadastro) mostram os dados do cliente
- [ ] As 7 abas originais continuam funcionando sem regressão
- [ ] Menu lateral tem apenas UMA entrada de cockpit de consulta
- [ ] Nenhum arquivo foi deletado
