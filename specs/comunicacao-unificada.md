# Comunicação unificada (WWP + TG) — rascunho para validação do CEO

Status: DESENHO e PREVISÃO DE FALHAS. Nada construído além da função de nomes de backup.

## Objetivo
Uma única conversa por cliente (canal WWP ou TG), lida por Cockpit, Central Telegram e Central de Auditoria, com
visual fiel de cada aplicativo, custo/cobrança por mensagem visível e backup com nomenclatura oficial.

## Fatos verificados (20/11/2026)
1. Telegram guarda em telegram_inbox_messages (empresa_id, cliente_id, chat_id, texto, direcao, recebida_em, lida_em, ambiente_credito).
2. WhatsApp guarda em whatsapp_mensagens_log (cliente_id, telefone, corpo, sid, status, error_code, contexto, via, empresa_id); sem direção explícita.
3. Central de Auditoria lê só /api/whatsapp/messages; bloco Telegram mostra apenas status do bot e diz que o histórico "estará disponível na próxima onda".
4. Mensagens do Cockpit/Telegram aparecem na auditoria só quando espelhadas no log do WhatsApp (contexto cockpit_telegram, 12 linhas).
5. Crédito pré-pago por uso existe (lib/mensageria-credito, registrarEvento); tarifa nasce inativa; Instituto (empresa 5) isento.
6. Telas com simulação de conversa: orientacao-previa.tsx (só estilo WhatsApp); Cockpit aba Telegram (balões próprios). Demais telas: preciso varrer.

## Requisitos (numerados)
1. Seletor de canal WWP | TG em Cockpit e telas de comunicação.
2. Camada única de leitura "conversa" (união das duas tabelas), sempre filtrada por empresa_id.
3. Central de Auditoria passa a listar WWP e TG juntos, com coluna Canal.
4. Colunas da auditoria: Data/hora, Canal, Cliente, Destino (telefone/chat mascarado), Direção, Contexto, Status de entrega, Cobrança (Paga/Isenta/Sem tarifa/Teste), Valor, Prévia, Origem (humano/IA/automático), Clínica.
5. Bolhas fiéis: WhatsApp (verde, cauda, horário, tiques: enviado, entregue, lido azul, relógio na fila, alerta de falha) e Telegram (azul, horário, tiques simples/duplos).
6. Indicador "digitando" (três pontinhos) só quando houver evento real; nunca fingido.
7. Backup: painel recolhível na vertical na Central de Auditoria, papéis Auditor e Administrador da clínica, escopo da própria clínica.
8. Nomes de arquivo conforme lib/backup-mensagens-nome.ts (4 formas validadas).
9. Arquivos de backup todos visíveis em lista, com histórico de downloads (quem, quando, qual).
10. Atualização: um só mecanismo (consulta periódica com aba visível ou SSE), sem recarregar tudo.

## Previsão de falhas
| Falha | Gravidade | Barreira |
|---|---|---|
| Vazar conversa de outra clínica no backup/auditoria | Crítica | empresa_id obrigatório no servidor, teste de isolamento |
| Cobrança exibida errada (teste contado como real) | Alta | usar ambiente_credito e flag de isenção; sem tarifa = "Sem tarifa" |
| Tique azul/lido inventado | Alta | exibir só status vindo do provedor; sem dado = sem tique |
| WhatsApp sem direção: recebidas misturadas | Média | decidir se grava direção nova (migração) |
| Backup pesado derruba API | Média | geração por lote/stream, limite por período |
| CPF no nome do arquivo vaza | Média | decisão do CEO: completo (atual) ou mascarado |
| Mensagens do WhatsApp recebidas hoje não são gravadas? | A verificar | confirmar webhook de entrada |

## Perguntas em aberto
- Cobrança por mensagem: usar apenas tarifas já existentes (inativas) ou definir tabela de preços por serviço?
- Formato do backup: PDF legível, planilha ou ambos.
- Arquivar mensagens antigas além do backup.
