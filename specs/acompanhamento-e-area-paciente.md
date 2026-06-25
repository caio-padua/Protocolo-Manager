# Spec — Área do Paciente (unificada) + Ferramenta "Acompanhamento"

Status: ESPECIFICAR (Paxter Loop). Escrita em 25/06/2026. Decisões do CEO Dr. Caio marcadas como [MARTELO CEO].
Esta spec NÃO autoriza build de código; autoriza mockups descartáveis (sandbox) e organograma no Canvas.

---

## 1. Telas do paciente — mapa verificado (fonte: App.tsx, manifest.webmanifest)

| O que o paciente faz | Rota hoje | Como entra | Situação |
|---|---|---|---|
| Porta do app instalável (PWA) | /entrada | Abre o app instalado | Existe (start_url do manifest) |
| Área do Paciente — ver dados/documentos | /area | CPF + data de nascimento | Existe — CEO: "está ótimo" |
| Enviar exames/documentos | /portal ("Portal do Cliente") | Link (WhatsApp) ou site; CPF + nascimento | Existe — "está ótimo" |
| Responder Anamnese | /anamnese e /anamnese/v2 | Link ou site (versão clara e escura) | Existe (entrada externa) |
| Marcar consulta (+ cadastro se novo) | /agendar | Link (WhatsApp/e-mail) ou site | Em construção |

Observação: a equipe da clínica NÃO usa essas portas; ela vê os documentos enviados POR DENTRO do
sistema, na ficha do cliente em "Clientes". São os dois lados da mesma coisa.

---

## 2. [MARTELO CEO 25/06/2026] Unificação — Opção A

"Área do Paciente" e "Portal do Cliente" são a MESMA coisa. Decisão: **uma porta só**.

| Item | Definição |
|---|---|
| Nome da porta única | "Área do Paciente" |
| Rota que fica | /area (porta única) |
| /portal | Deixa de ser porta separada; vira a seção "Enviar Exames" dentro da Área |
| Seções dentro da Área | Meus Documentos · Enviar Exames · Minha Anamnese · Marcar Consulta |
| Entrada (regra de ouro) | O paciente entra em UM lugar (link/site ou app instalável) e faz tudo |

Pendência técnica (não bloqueia spec): redirecionar /portal → /area#enviar-exames para não quebrar
links já enviados por WhatsApp.

---

## 3. Ferramenta "Acompanhamento" (evolução clínica) — a dor do CEO

Metáfora oficial do CEO: **"T de encanamento"** — a aba puxa a anamnese passada (linha de base da 1ª
consulta) para o presente, para o médico ver a evolução TABELADA no tempo e bater o olho.

### 3.1 Onde fica (regra de ouro: toda ferramenta tem entrada no menu)
- Aba "Acompanhamento" DENTRO da ficha do cliente (rota /clients/:id), ao lado das abas existentes.

### 3.2 O que a tela mostra — cockpit longitudinal
Tabela onde as LINHAS são indicadores clínicos e as COLUNAS são as consultas no tempo.

| Indicador | Linha de base (1ª consulta) | Consulta N | ... | Tendência |
|---|---|---|---|---|
| Hipertensão | 160/100 | 130/85 | ... | seta verde (melhorou) |
| Dor (0 a 10) | 8 | 3 | ... | seta verde |
| Peso | 92 kg | 88 kg | ... | seta verde |
| Sono | ruim | ruim | ... | âmbar (igual) |
| Colesterol | alto | alto | ... | vermelha (piorou) |
| Nº de remédios | 3 | 2 | ... | verde (reduziu) |

- Cores de tendência reaproveitam o sistema de alerta existente: verde=melhorou, âmbar=igual,
  vermelho=piorou.
- Cada retorno (consulta) cria uma COLUNA nova.

### 3.3 Fluxo (o "T de encanamento")
Anamnese da 1ª consulta (LINHA DE BASE)
  -> abre aba "Acompanhamento" na ficha do cliente
  -> consulta de retorno puxa o passado para cima (vê anamnese antiga + colunas anteriores)
  -> médico INSERE os dados de hoje e MARCA por item: melhorou / igual / piorou
  -> cockpit atualizado: bate o olho na evolução tabelada no tempo

### 3.4 Dados (proposta — definir no build, não criar agora)
- Linha de base: vem da anamnese já existente (não duplicar; referenciar).
- Evolução por consulta: nova coleção (proposta de nome `acompanhamento_evolucoes`) com, por item:
  client_id, data_da_consulta, indicador, valor_base, valor_atual, tendencia (melhorou/igual/piorou),
  alert_color, observacao, profissional.
- Quais indicadores entram no cockpit: derivar dos campos da anamnese + lista fixa editável
  (hipertensão, dor, peso, medicação, sono, energia, colesterol...). A definir com o CEO.

### 3.5 Pendências para o CEO decidir no build
1. Lista oficial dos indicadores do cockpit (quais aparecem por padrão).
2. Quem preenche a coluna nova: só médico, ou também enfermeira?
3. A tendência é marcada à mão pelo médico, calculada pelo sistema, ou os dois?

---

## 4. Mockups/organograma já no Canvas
- ENTREGA 30: organograma do "T de encanamento" + cockpit de exemplo (fluxo de 6 caixas + tabela).

RESUMO EM 1 LINHA: porta única "Área do Paciente" (opção A) e ferramenta "Acompanhamento" (cockpit
indicador × consultas com setas de tendência) especificadas; faltam 3 decisões do CEO antes do build.
