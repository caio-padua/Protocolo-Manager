# Certificado Vencido: Geração Clínica Explicitamente Sem Assinatura

## Objetivo

Permitir que um médico autorizado gere uma prescrição no Cockpit quando seu certificado pessoal estiver comprovadamente vencido, mantendo o documento e o histórico claramente identificados como não assinados.

## Requisitos

1. Preservar integralmente a validação vigente de médico autenticado, cadastro profissional, cliente, clínica, vínculo e permissão de governança.
2. Exibir no topo das telas que usam certificado pessoal: estado real do certificado, data inicial e data final de validade, sem expor arquivo, senha ou dados sigilosos.
3. Usar a luzinha Paxter em vela verde somente quando o servidor confirmar que o certificado corresponde ao profissional e está vigente; vencido, futuro, ausente, incompatível, inválido ou indisponível nunca pode aparecer como verde.
4. Permitir geração de prescrição sem assinatura somente quando o servidor comprovar que o certificado correspondente ao médico está vencido. Ausência, senha incorreta, titular divergente, chave incompatível, certificado ainda não vigente ou falha de armazenamento continuam bloqueados.
5. Exigir ação explícita do médico em botão separado para gerar sem assinatura. A solicitação do navegador não é prova da validade nem de autorização.
6. Preservar autoria, paciente, clínica, permissões e fluxo de aprovação; se houver conferência clínica, somente o médico autenticado que aprova pode gerar o documento.
7. Identificar o estado no sistema e no próprio arquivo como “GERADO SEM ASSINATURA DIGITAL — NÃO ASSINADO”; informar que exige assinatura manual antes de uso clínico e não afirmar validade jurídica.
8. Preservar o registro no histórico, permitindo consulta e download autenticados.
9. Não enviar documentos sem assinatura por e-mail, WhatsApp, Telegram, farmácia, links públicos ou pasta externa; não disparar lembretes como consequência desse modo.
10. Não consumir numeração controlada no caminho sem assinatura; bloquear receitas controladas nesse modo com orientação clara.
11. Manter a emissão assinada atual sem alteração quando o certificado estiver vigente.
12. Aplicar o estado e o indicador às telas de prescrição do Cockpit, pedido de exames do Cockpit e prescrição independente que usam o certificado pessoal do médico; apenas a prescrição do Cockpit recebe nesta etapa a ação de geração sem assinatura.
13. Nas telas de RAS e protocolos que usam certificado global do sistema, mostrar um indicador separado e corretamente identificado; não oferecer geração sem assinatura nessa etapa.
14. Não adicionar indicador a atestados ou encaminhamentos que não usam certificado digital no fluxo atual.
15. Persistir a classificação de assinatura e a validade observada na emissão em colunas aditivas; não apagar nem reclassificar registros existentes.

## Falhas previstas e barreiras

| Falha | Gravidade | Barreira | Recuperação | Teste |
|---|---|---|---|---|
| Certificado vigente exibido como vencido | Alta | Datas e estado calculados no servidor com relógio controlado em teste | Recarregar status; emissão assinada permanece disponível | Certificado sintético vigente |
| Certificado de outra pessoa usado para gerar sem assinatura | Crítica | Conferir CPF do titular contra médico autenticado antes de qualquer modo | Bloquear sem gravar | Titular divergente |
| Certificado ausente ou senha incorreta tratado como vencido | Crítica | Estados distintos; só o estado `expired` habilita modo sem assinatura | Corrigir cadastro ou senha | Ausente e senha incorreta |
| Certificado com início futuro tratado como vencido | Alta | Comparar `notBefore` e `notAfter` separadamente | Aguardar vigência ou cadastrar certificado correto | Certificado ainda não vigente |
| Documento sem assinatura enviado automaticamente | Crítica | Bloquear integrações, links públicos e rotas de reenvio | Download autenticado para revisão e assinatura manual | E-mail, WhatsApp, Telegram, farmácia e reenvio |
| Receita controlada consome numeração sem assinatura | Alta | Bloquear o caminho sem assinatura para itens controlados antes da transação | Assinar com certificado vigente | Receita controlada |
| Rascunho ou aprovação duplicada | Alta | Preservar chave de requisição, transação e guarda de aprovação existentes | Consultar histórico; não repetir emissão | Repetição e concorrência |
| Migração altera registros anteriores | Crítica | Somente `ADD COLUMN IF NOT EXISTS`, com padrão que preserva documentos já assinados | Parar a homologação se o esquema divergir | Banco isolado e consulta comparativa |

## Escopo técnico

- API: estado seguro de validade do certificado pessoal; emissão da prescrição do Cockpit com `signatureMode` explícito; persistência do estado; bloqueio de entrega/reenvio não assinado.
- Documentos: faixa destacada, em todas as páginas, para arquivos gerados sem assinatura.
- Interface: painel Paxter 3D no topo dos fluxos pessoais, luzinha em vela e ação separada para geração sem assinatura.
- Certificado global: indicador distinto nas telas de RAS e protocolos, sem confundir certificado global com a identidade do médico.
- Dados e integrações: migração aditiva; nenhum envio real nem acesso a banco de produção.

## Definição de pronto

1. Certificado pessoal vigente gera prescrição assinada e conserva o fluxo atual.
2. Certificado vencido só permite gerar a prescrição do Cockpit sem assinatura após ação explícita; estado é persistido e claramente visível na tela, no histórico e no arquivo.
3. Certificado ausente, futuro, inválido, com senha incorreta ou de outro titular não permite contornar a assinatura; pedidos de exames continuam exigindo certificado vigente.
4. Pedido sem assinatura não pode ser enviado, reenviado, aberto por link público, encaminhado a farmácia nem causar lembrete.
5. Receita controlada não consome numeração no caminho sem assinatura.
6. Governança, aprovações, autoria e isolamento por clínica continuam preservados.
7. Testes sintéticos cobrem estados de validade, identidades divergentes, permissões, falhas, repetição, persistência e efeitos externos bloqueados.
8. Revisão independente sequencial aprova o diff; execução de desenvolvimento, migração aditiva, registros do banco, logs e capturas de computador e celular são apresentados.
9. Nenhum merge, envio ao GitHub, publicação, implantação, envio real ou dado de produção é realizado.

## Limites desta etapa

- O documento sem assinatura não é apresentado como assinado nem declarado juridicamente válido.
- RAS e protocolos continuam usando o mecanismo global existente; esta etapa só identifica corretamente seu estado visual.
- Nenhum certificado real será usado em testes; somente certificados sintéticos em ambiente isolado.
