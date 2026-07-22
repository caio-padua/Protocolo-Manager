# SPEC 01 — Tela "Modelo de Receituários"
**Loop Paxter — Fase 1 (ESPECIFICAR)**
**Data:** 22/07/2026 | Status: AGUARDANDO APROVAÇÃO DO CEO

---

## Objetivo
Renomear e reformular a tela `/configuracoes/receituario` como o repositório central
de TODOS os modelos de receituário do sistema, de modo que qualquer motor de geração
de PDF busque o modelo ativo desta tela.

---

## Requisitos

### R01 — Renomear a tela
- URL: `/modelo-receituario` (nova) — redirecionar `/configuracoes/receituario`
- Nome no menu: "Modelo de Receituários"
- Ícone: `LayoutTemplate` (Lucide)
- Posição no menu: dentro de "Arsenal Clínico" (junto com Atestados, Encaminhamentos, Receituário Automático)

### R02 — Modelos salvos
- O sistema salva N modelos nomeados (ex.: "Padrão ANVISA", "Manipulação Instituto Pádua")
- Cada modelo tem: nome, tipo (especial/simples/manipulação), arabescos, logo, cor do cabeçalho, fonte
- Um modelo é marcado como ATIVO por tipo
- Modelos são salvos no banco (tabela `receituario_modelos`) — NÃO só em localStorage

### R03 — Preview ao vivo
- A tela exibe `ReceituarioPreview.tsx` ao lado direito em tempo real
- Toda mudança de config atualiza o preview instantaneamente
- O preview usa dados de demonstração (médico/paciente fictício) para preencher os campos

### R04 — Botão "Testar PDF"
- Gera um PDF de demonstração usando o modelo ativo
- Chama o motor único (Spec 02) com dados fictícios
- Abre o PDF no Drive (pasta de testes) para conferência visual

### R05 — API de modelos
- `GET /api/receituario-modelos` — lista todos os modelos
- `GET /api/receituario-modelos/ativo?tipo=especial` — retorna o modelo ativo por tipo
- `POST /api/receituario-modelos` — salva/atualiza modelo
- `PATCH /api/receituario-modelos/:id/ativar` — marca como ativo

---

## Casos Extremos
- Se nenhum modelo estiver salvo, usar o DEFAULT_CONFIG do sistema
- Ao tentar emitir sem modelo ativo, retornar erro 400 com mensagem clara
- Migração: configurações salvas em localStorage viram modelo "Legado" no banco

---

## Linhas Vermelhas
- NÃO apagar a lógica de arabescos existente em `receituario-config.ts`
- NÃO mudar a estrutura de `ReceituarioPreview.tsx` nesta spec (é spec própria)
- NÃO criar nova tabela sem migration SQL manual

---

## Definição de PRONTO
- [ ] Menu mostra "Modelo de Receituários" em lugar de "Faixa de Receituário" / "Configurações"
- [ ] É possível salvar e carregar modelos do banco
- [ ] O preview ao vivo reflete cada mudança
- [ ] O botão "Testar PDF" gera um PDF visualmente idêntico ao preview
- [ ] Qualquer motor de emissão busca o modelo ativo desta tela
