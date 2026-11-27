---
name: Fila persistente PostgreSQL e medicações do cliente
description: decisões da fila mensagens_fila (PDF de exame) e de cliente_medicacoes com consentimento por clínica
---
Fila: reserva exclusiva, lease maior que o prazo do item, conclusão guardada por worker+nº da tentativa, TTL nunca entrega, job do worker desligado por PADAXOR_FILA_PDF_ATIVA.
**Why:** evitar reentrega de item ainda rodando e envio duplicado.
**How to apply:** vigia do Drive e importação manual ainda NÃO usam a fila (decisão pendente do Dr. Caio).
Medicações: autodeclarada nasce sem validação (servidor ignora estado enviado); só validada + consentimento ativo da clínica entra no lembrete; dose não estruturada bloqueia envio; sincronizarLembretePrescricao SUBSTITUI períodos, então sempre receber lista completa (prescrição + medicações).
Testes: ~14 falhas antigas em cockpit/prescrições/protocol-drive-email por mocks defasados (confirmado: mesmas falhas com arquivos originais).
Tela "Meus medicamentos" (PaxCare, /area): rotas em area-paciente-medicacoes.ts (token do paciente; prévia do admin só lê). Editar conteúdo clínico devolve à "nao_validada"; pausar não muda validação; excluir é lógico.
**Why:** sincronizarLembretePrescricao só roda ao emitir prescrição — pausar/editar/excluir NÃO atualiza o lembrete já gravado até a próxima emissão (lacuna conhecida, declarada ao Dr. Caio).

## Adesão, validação pela clínica e sessão persistente
- Rotas da clínica só mostram o que o cliente cadastrou com consentimento ativo PARA AQUELA clínica; sem consentimento nem a contagem aparece. Decidir (validar/ajustar/recusar) exige médico ou dono da plataforma e confere que a medicação é do cliente da URL (decidirMedicacao só conhece o id da medicação).
- Adesão = tomei / (horários de hoje x dias); aproximação, porque a agenda de horários não tem histórico. Sem registro não conta como tomado.
- Recálculo do lembrete mantém tudo do lembrete gravado que não é do cliente; limite: fórmula da clínica com o mesmo nome de uma medicação própria é tratada como própria.
- Sessão: token de renovação opaco, só hash no servidor, rotação a cada uso, 30 dias deslizantes, teto 90; reuso tardio revoga a família; guardado em localStorage (cookie httpOnly não foi usado por não confirmar mesma origem em produção).
**Why:** evitar CPF a cada 30 min no celular sem enfraquecer o isolamento.
**How to apply:** mexeu em token do paciente, lembrete ou consentimento? chame recalcularLembreteDoCliente e rode os 3 arquivos de teste de medicações.
- Fila central da clínica (menu "Medicações & Adesão", rota /medicacoes-adesao) lê só clientes da empresa com consentimento ativo; Ajustar leva à aba do cliente. Painéis do Cockpit devem usar collabAuthHeaders + BASE_URL (fetch nu = 401).
