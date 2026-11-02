export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;

export const PASSWORD_POLICY_MESSAGE =
  "A senha deve ter de 10 a 128 caracteres, começar com letra maiúscula e incluir pelo menos um número e um caractere especial.";

export function isAppPasswordValid(value: unknown): value is string {
  return typeof value === "string" &&
    value.length >= PASSWORD_MIN_LENGTH &&
    value.length <= PASSWORD_MAX_LENGTH &&
    /^\p{Lu}/u.test(value) &&
    /\p{N}/u.test(value) &&
    /[\p{P}\p{S}]/u.test(value);
}
