import { getRandomBytes } from "expo-crypto";

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export function generatePairingCode(randomBytes = getRandomBytes) {
  const bytes = randomBytes(4);
  let suffix = "";
  for (const byte of bytes) {
    suffix += CODE_ALPHABET[byte % CODE_ALPHABET.length];
  }
  return `SAFE-${suffix}`;
}

export async function generateUniquePairingCode(
  isAvailable,
  maxAttempts = 12,
  createCode = generatePairingCode
) {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const code = createCode();
    if (await isAvailable(code)) return code;
  }
  throw new Error("We could not create a unique pairing code. Please try again.");
}
