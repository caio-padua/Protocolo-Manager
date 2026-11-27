# Inventário de botões — vitrines PAXMED e PAXCARE (27/11/2026)

Verificado no código do Manager (artifacts/padcom/src/vitrines). Não prova fluxo completo em produção.

## PAXMED (raiz de paxmed.com.br)
| Botão | Tipo | Destino | Backend |
|---|---|---|---|
| Manifesto, Recursos, Inteligência, O Círculo, Ecossistema | navegação | âncoras da própria página | nenhum |
| Conhecer planos / Solicitar demonstração | âncora | #contato | nenhum |
| Área do Médico / Clínica | acesso | /login | login do Manager |
| Portal do Paciente | acesso | /area | área do paciente do Manager |
| Formulário de contato (enviar) | formulário | POST /api/vitrine-contatos (mesma origem) | rota vitrine-contatos, limite 5/min; só sucesso se resposta ok |
| Link PADCON | externo | https://padcon.replit.app/ | nenhum |
| Contraste, movimento, idioma | preferência local | navegador | nenhum |
| Play dos vídeos de depoimento | botão sem ação de backend | — | nenhum (sem vídeo ligado) |

## PAXCARE (raiz e /medicos de paxcare.com.br)
| Botão | Tipo | Destino | Backend |
|---|---|---|---|
| Portal do paciente / Descobrir / Explorar / Entrar / planos | acesso | /area | área do paciente do Manager |
| PAXMED (menu e "Conhecer o site PAXMED") | externo | https://paxmed.com.br | nenhum |
| Compartilhar | função do navegador | share/copiar link | nenhum |
| Apresentar o PAXMED ao meu médico | função do navegador | share/copiar mensagem | nenhum |
| Prévias (laudo PDF, rotina, categorias, cofre, compartilhamento) | demonstração local | estado da página | nenhum (dados de exemplo) |
| Aceitar convite e ver exames (/medicos) | formulário de PRÉVIA | estado local | nenhum: lacuna, falta rota de convite |

## Lacunas
1. Convite do médico (PAXCARE /medicos) é só prévia: sem backend.
2. PAXMED do Lovable tem páginas de convite/admin/status ligadas ao Supabase; não integradas ao Manager.
3. Contato: Lovable usa source "paxmed-homepage"; Manager usa "paxmed-vitrine" (rota aceita qualquer texto).
