# Marca da clínica na mensagem do Guia Digital

## Objetivo
Manter a marca da mensagem de chegada coerente com a clínica indicada no link.

## Requisitos
1. Aceitar `tenantSlug` opcional no POST `/api/onboarding/enviar-guia`.
2. Com slug, buscar `empresas.nome` no servidor e usá-lo no cabeçalho enviado por WhatsApp e Telegram.
3. Sem slug, preservar “Instituto Pádua”.
4. A tela existente deve enviar o mesmo slug usado no link, omitindo o campo quando não houver slug.

## Casos extremos
- Slug informado deve ser texto não vazio de até 80 caracteres, normalizado como na configuração pública.
- Slug desconhecido retorna 404 antes da reserva de quota e sem enviar mensagens.
- Falha de consulta impede envio; não mascara falha com a marca padrão.

## Pronto
Testes HTTP com provedores simulados verificam ambos os canais, fallback legado, validação e slug desconhecido. A tela compila e o servidor inicia.

## Restrições
Não mudar quotas, motores de envio, identidade dos pacientes, eventos de abertura, layout nem banco de dados.

## Ampliação autorizada pelo responsável pelo produto
O responsável autorizou corrigir o vínculo de autorização neste fluxo, após a revisão identificar que o contexto global ainda fixa empresa 5.

1. Resolver a empresa pelo profissional ativo identificado no token assinado, usando `professionals.empresa_id`, já existente no banco.
2. Usar a mesma resolução em `minha-config` e `enviar-guia`, sem alterar o contexto global de outras ferramentas.
3. Rejeitar profissional sem vínculo, desativado, empresa inexistente, cliente de outra empresa ou slug de outra empresa, antes de reservar quota ou enviar.
4. Sem slug no pedido, preservar Instituto Pádua na empresa legada 5; nas licenciadas usar o nome da empresa autenticada, nunca a marca legada.
5. Não confiar no papel, empresa, slug ou cliente enviados pelo navegador como prova de autorização.
6. Impedir envio com link contendo tenant de outra empresa.
7. Confirmar o fluxo com token assinado, consulta real em tabelas temporárias isoladas e provedores simulados.
8. Migração somente aditiva para garantir a coluna de vínculo em instalações antigas; nunca inferir nem sobrescrever vínculos.
9. O seletor deve carregar clientes ativos da mesma empresa autenticada por rota local ao guia, pois a lista geral ainda usa o contexto global legado.
10. Enquanto configuração ou lista de clientes carregam ou falham, bloquear envio e oferecer nova tentativa, sem marca padrão silenciosa.
