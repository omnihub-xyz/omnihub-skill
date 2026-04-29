import { config } from "dotenv";

config({ quiet: true });

export function getPrivateKey(): string {
  const privateKey = process.env.PRIVATE_KEY?.trim();

  if (!privateKey) {
    throw new Error("Missing PRIVATE_KEY in .env");
  }

  if (!/^0x[a-fA-F0-9]{64}$/.test(privateKey)) {
    throw new Error("PRIVATE_KEY must be a 32-byte hex string prefixed with 0x");
  }

  return privateKey;
}
