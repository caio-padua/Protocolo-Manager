# Spec: Mostrar no card do cliente quais canais confirmaram o envio do link

**Data:** 10/08/2026  
**Origem:** Task #84 (next_steps) — Paxter Loop

---

## Objetivo

Após clicar em "ENVIAR LINK DE FOTO" ou "ENVIAR LINK DE CADASTRO", o card deve mostrar
permanentemente (enquanto a tela estiver aberta) quais canais foram tentados e qual foi o resultado —
sem fazer nova chamada ao servidor.

---

## Requisitos exatos

1. Após resposta bem-sucedida do `send-link`, o card exibe uma seção de status com uma linha por canal tentado.
2. Cada linha mostra: ícone de canal + nome do canal + resultado (Enviado / Falhou / Não vinculado).
3. Canal **EMAIL**: ✓ verde quando `sent: true`; ✗ âmbar quando `sent: false` (com a mensagem de erro curta, se houver).
4. Canal **WHATSAPP**: ✓ verde quando `sent: true`; ✗ âmbar quando `sent: false`. Se o motor devolveu `link` (wa.me), exibir botão "Abrir WhatsApp" que abre esse link em nova aba.
5. Canal **TELEGRAM**: ✓ verde quando `sent: true`; — cinza quando `skipped: true` (sem chatId vinculado).
6. O estado de canais é **local** (`useState`) — reseta quando o usuário clica novamente para enviar novo link.
7. A seção de status aparece abaixo do bloco de link copiável, acima do e-mail do cliente.
8. A seção usa o sistema visual Paxter 3D: `bevel-3d` para o contêiner, cores `text-emerald-400` (sucesso), `text-amber-400` (falha), `text-muted-foreground` (pulado).
9. Nenhuma nova chamada à API é feita — os dados vêm do campo `resultados` já presente na resposta.
10. O botão "ENVIAR FOTO AGORA" (admin-upload) NÃO mostra status de canal (não usa motor de mensageria).

---

## Casos extremos a tratar

- `resultados` ausente ou vazio → seção não aparece (sem quebrar).
- Canal desconhecido no array → linha omitida silenciosamente.
- `error` de canal muito longo → truncar em 60 caracteres com `…`.

---

## Definição de PRONTO

- Screenshot mostrando a seção de status após clicar "ENVIAR LINK DE FOTO" em cliente com e-mail cadastrado.
- Screenshot mostrando o botão "Abrir WhatsApp" quando o canal WHATSAPP retornou `link` (wa.me).
- Screenshot mostrando o canal TELEGRAM como "Não vinculado" para cliente sem chatId.
- Nenhum erro de TypeScript no componente `photo-card.tsx`.

---

## Linhas vermelhas

- NÃO alterar as rotas de API nem o motor de mensageria.
- NÃO fazer chamadas extras ao servidor para buscar status.
- NÃO usar `rounded-full` em nenhum elemento visual (padrão Paxter: `rounded-[6px]`).
