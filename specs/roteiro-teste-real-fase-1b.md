# Roteiro do teste real — Fase 1B (NÃO executar sem autorização do Dr. Caio)

Pré-condição: `pnpm --filter @workspace/api-server exec tsx src/scripts/conferir-homologacao.ts` termina com "Sem bloqueios encontrados".

## WhatsApp — Dayana (cliente 12, modo ia)
1. Dayana envia "Olá" -> esperado: apresentação da Helena, idêntica ao texto cadastrado.
2. Dayana envia "Com quem estou falando?" -> Helena.
3. Dayana envia "Qual o endereço?" -> endereço do Instituto Pádua.
4. Dayana envia "Não quero remarcar, quero saber o endereço" -> endereço (não oferece remarcar).
5. Dayana envia dois fragmentos dentro da janela de agrupamento -> uma única resposta.
6. Dayana envia pergunta não clínica desconhecida -> texto institucional + aviso à equipe no Telegram (sem o texto da cliente).
7. Central de Auditoria > "Ficha do atendimento automático": conferir uma ficha por mensagem, contato ***4000, estado "enviado".

## WhatsApp — Carlúcia (cliente 11, hoje humano)
1. Só com autorização expressa: ativar automático (Prontuário/modo do contato) com motivo.
2. Saudação, identidade, endereço; dois fragmentos; confirmar que o contexto da Dayana não aparece.
3. Voltar para humano; enviar mensagem e provar que não há resposta automática (ficha "bloqueado").
4. Reativar automático somente se autorizado.

## Telegram (equivalente)
Mesma sequência com os chats vinculados (Dayana ***6852, Carlúcia ***2285): saudação, identidade, endereço, "Não quero remarcar...", pergunta desconhecida, ficha. No Telegram não há janela de agrupamento nem menu numérico.

## Parada
Interruptores na mesma tela: clínica, canal, emergência (bloqueia tudo). Qualquer resposta inesperada: ligar Emergência e parar.
