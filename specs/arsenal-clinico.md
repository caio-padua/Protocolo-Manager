# Spec — Arsenal Clínico Paxter (Documentos do Médico)

## Objetivo
Adicionar ao Paxter um grupo novo de ferramentas independentes no menu ("Arsenal Clínico"), cada uma REAL (grava no banco), no layout 3D da skill-layout-paxter, com um motor de Modelos de Documento editáveis (texto com variáveis reutilizáveis) que alimenta as ferramentas.

## Contexto (o que JÁ existe — não duplicar)
- Prescrição de Fórmulas: `/prescricao` (REAL). NÃO refazer.
- Prescritor de Exames: `/exames` (REAL). NÃO refazer.
- Nota fiscal de serviço: `/financeiro/nfse` (Lançador de NFS-e). NÃO refazer.
- Protocolos, RAS, Orçamentos, Pagamentos: já existem. NÃO refazer.
- Fábrica de PDF: `artifacts/api-server/src/lib/documentos/padrao.ts` (`iniciarFabrica`, `novaPagina`, `carimbarRodape`, `finalizar`). USAR para todo PDF novo.
- Padrão de rota leve (sem OpenAPI/Orval): Express + `drizzle-zod`, front consome por `fetch` com `import.meta.env.BASE_URL`. USAR este padrão.

## Ferramentas desta onda (lacunas reais + motor editável)
1. Modelos de Documento (motor editável) — CRUD de textos reutilizáveis por tipo, com variáveis `{{...}}`.
2. Atestados — emitir atestado médico real, com PDF de marca + Drive, persistente e editável.
3. Encaminhamentos — emitir encaminhamento a especialista, com PDF de marca + Drive, persistente e editável.

## Requisitos exatos
### R1 — Motor de Modelos de Documento (editável)
- R1.1 Tabela `document_templates`: `id, tipo, nome, corpo (texto com {{variaveis}}), descricao, variaveis(jsonb), ativo, isDefault, createdAt, updatedAt`.
- R1.2 Rota `/api/document-templates`: GET lista (filtro `?tipo=`), GET :id, POST criar, PUT :id editar, DELETE :id (soft: `ativo=false`).
- R1.3 Substituição de variáveis: função server que troca `{{cliente.nome}}`, `{{cliente.cpf}}`, `{{profissional.nome}}`, `{{profissional.crm}}`, `{{profissional.uf}}`, `{{data.hoje}}`, `{{dias}}`, `{{cid}}`, `{{especialidade}}`, `{{motivo}}` pelo valor real ao emitir. Variável sem valor vira string vazia, nunca quebra.
- R1.4 Tela `/arsenal/modelos`: listar/criar/editar/excluir modelos, campo grande para o corpo, chips clicáveis que inserem variáveis, prévia com valores de exemplo. Layout Paxter 3D.
- R1.5 Seed: ao menos 1 modelo padrão de atestado e 1 de encaminhamento.

### R2 — Atestados
- R2.1 Tabela `medical_certificates` (ver schema): cliente, profissional, tipo, dias, dataInicio, cid, finalidade, corpo, observacao, status, campos de Drive/arquivo, timestamps.
- R2.2 Rota `/api/atestados`: GET lista (filtro `?clientId=`), GET :id, POST criar (status draft), PUT :id editar, POST :id/emitir (gera PDF, marca `emitted`, sobe ao Drive do cliente, devolve link + base64), GET :id/pdf (baixar).
- R2.3 PDF `atestado.ts` usando `documentos/padrao.ts` (emissor `instituto_padua` para atestado clínico), com dados do cliente, corpo, CID quando houver, local/data, bloco de assinatura do profissional (CRM/UF).
- R2.4 Tela `/arsenal/atestados`: escolher cliente (ClientPicker), escolher profissional, escolher tipo, dias/CID/finalidade, carregar Modelo (aplica variáveis), corpo editável, prévia, botão "Emitir Atestado". Lista dos atestados do cliente com status e link do Drive. Layout Paxter 3D.

### R3 — Encaminhamentos
- R3.1 Tabela `referrals` (ver schema): cliente, profissional (origem), especialidadeDestino, profissionalDestino, motivo, resumoClinico, urgencia, corpo, observacao, status, Drive/arquivo, timestamps.
- R3.2 Rota `/api/encaminhamentos`: mesmos verbos do R2.2 (list/get/create/update/emitir/pdf).
- R3.3 PDF `encaminhamento.ts` usando a Fábrica: dados do cliente, especialidade destino, urgência (destaque quando urgente/prioritário), motivo, resumo clínico, assinatura do profissional.
- R3.4 Tela `/arsenal/encaminhamentos`: cliente + profissional + especialidade destino + urgência + motivo + resumo, carregar Modelo, corpo editável, prévia, "Emitir Encaminhamento", lista por cliente. Layout Paxter 3D.

### R4 — Integração ao sistema
- R4.1 Novo grupo no menu lateral: "Arsenal Clínico" com Atestados, Encaminhamentos, Modelos de Documento (menus independentes).
- R4.2 Rotas registradas em `App.tsx`; routers registrados em `routes/index.ts`.
- R4.3 Vocabulário: sempre "cliente" (nunca "paciente") na interface. Sem tag de origem (doutrina dos primos).

## Casos extremos
- Cliente sem CPF/telefone/e-mail: emitir mesmo assim; campos vazios viram "—" no PDF, nunca quebram.
- Profissional sem CRM/UF: emitir; bloco de assinatura mostra o que houver.
- Modelo com variável inexistente: substituição vira string vazia; nunca lança erro.
- Drive do cliente inexistente/sem pasta: emitir e persistir mesmo assim; upload é best-effort (registra falha em log, não derruba a emissão). PDF sempre volta em base64 para download local.
- Emitir duas vezes: cada emissão gera novo PDF; não duplicar homônimos no Drive (nome único com id — ver memória `drive-upload-homonimos`).
- Texto longo no corpo: PDF quebra em várias páginas via `novaPagina` (nunca escrever fora da folha).

## Definição de PRONTO
- As 3 tabelas existem no banco (push aplicado) e as rotas respondem 200 (curl real: list/create/emitir).
- As 3 telas abrem no menu "Arsenal Clínico", criam e emitem de verdade (screenshot).
- Um atestado e um encaminhamento emitidos geram PDF de marca (cabeçalho-mastro + rodapé) e persistem com status `emitted`.
- Modelo editado aplica variáveis corretamente na emissão.
- Layout 100% no padrão Paxter 3D (panel-3d, screen-3d, concave-3d, btn-3d, BlockTitle, campos gravados).
- architect aprova requisito por requisito, zero pendência.

## Linhas vermelhas (NUNCA violar)
- NÃO tocar `/api/budgets/calculate`, motor de desmembramento, motor de agenda, cockpit `/emitir`, validação de protocolo.
- NÃO refazer Prescrição, Exames, NFS-e, Protocolos, RAS (já existem).
- NÃO mudar motor/payload por estética. Toda mudança de tela é APRESENTAÇÃO.
- NÃO usar "paciente" na interface. NÃO inventar auth nova (padrão single-tenant do app).
- Layout SEMPRE skill-layout-paxter; nunca inventar estilo por tela.
