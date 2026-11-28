import { registrarExposicaoTelegram } from "../lib/cofre-estado.js";
const novo = await registrarExposicaoTelegram("Valor exibido por engano em resposta de diagnostico (Etapa 0).");
console.log(JSON.stringify({ rotacaoPendenteRegistrada: novo }));
process.exit(0);
