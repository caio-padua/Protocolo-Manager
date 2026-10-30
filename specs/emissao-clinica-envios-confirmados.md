# Emissão clínica e entrega confirmada

## Objetivo
Gerar receitas sem enviar dados clínicos implicitamente e permitir entregas explícitas, autorizadas e auditadas por destinatário/canal.

## Requisitos
1. Emitir gera documentos, sem e-mail, WhatsApp, Telegram, cópia ao proprietário, upload para farmácia ou ativação automática de lembretes. Isso também vale para a finalização pelo endpoint do Cockpit, que exige identidade clínica validada. Preservar cartões regulatórios internos SNCR, sem e-mail automático, e preservar agenda já ativa cuja autorização de telefone/clínica permaneça válida; não revogar consentimento ao atualizar conteúdo.
2. Leitura, PDF e envios exigem colaborador e vínculo médico/local do paciente; empresa vem desse vínculo, nunca do tenant legado ou query string.
3. Cada envio exige canal e destinatário confirmado contra o cadastro atual. Não há canal ou destinatário padrão. Farmácia deve estar vinculada às receitas da prescrição.
4. Reenvio de e-mail usa médico e clínica da prescrição, validados com o ator autenticado; não há cópias fixas. Rotas antigas obedecem o mesmo contrato. Rota de teste com destinatário arbitrário fica desabilitada.
5. Registrar tentativa antes do provedor e resultado por canal; falha de auditoria impede disparo. Retornar aceito pelo provedor, falha ou resultado desconhecido sem confundir aceitação com entrega. Vincular a tentativa única ao log WhatsApp para refletir os retornos finais posteriores, inclusive recusa depois da aceitação.
6. Cockpit e tela de prescrição compartilham lista autorizada, escolha e confirmação individual dos destinatários, resultados persistidos e erros legíveis.
7. Sincronização de fórmulas não liga lembretes. Ativação de agenda requer confirmação explícita do telefone; troca de contato invalida autorização. Não enviar áudio adicional implicitamente.
8. Testes automatizados apenas com banco e provedores simulados.

## Casos extremos
Sem login, sem vínculo, empresa divergente, paciente histórico ambíguo, contato alterado, canal ausente, destinatário adulterado, provedor recusando/lançando, registro indisponível, atualização concorrente da interface.

## Pronto
Cobertura dos caminhos de emissão, autorização e entrega com simulações; build e inicialização; captura da rota pública sem retirar autenticação.

## Linhas vermelhas
Não alterar desmembramento, numeração ANVISA nem cálculos clínicos; não apagar dados, não testar enviando mensagens reais, não substituir infraestrutura multi-tenant global.
