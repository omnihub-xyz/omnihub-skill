/**
 * OmniHub wallet-signature authentication.
 *
 * The session token is held in module-level state for the lifetime of this
 * process only — it is never persisted to disk and is gone on exit. The
 * signature is an off-chain login signature: no transaction is sent and no
 * gas is spent.
 */

import { getAccount } from "../../lib/wallet.js";
import { omnihubGet, omnihubPost } from "./client.js";

interface SignatureMessageResponse {
  /** Full signable message (the API calls it `nonce`). */
  nonce: string;
}

interface SignatureVerifyResponse {
  token: {
    type: string;
    token: string;
    name: string | null;
    abilities: string[];
    lastUsedAt: string | null;
    expiresAt: string | null;
  };
}

let sessionToken: string | null = null;
let sessionAddress: string | null = null;

export function getSessionToken(): string | null {
  return sessionToken;
}

export function isAuthenticated(): boolean {
  const account = getAccount();
  return sessionToken !== null && sessionAddress === account.address;
}

export function clearAuthToken(): void {
  sessionToken = null;
  sessionAddress = null;
}

/**
 * Startup auth gate. Re-runs the signature flow if the wallet address changes
 * mid-session, so a token cannot be reused with a different signing key.
 */
export async function ensureAuthenticated(): Promise<void> {
  const account = getAccount();

  if (sessionToken !== null && sessionAddress === account.address) {
    console.log("Already authenticated with OmniHub.");
    return;
  }

  const msgResponse = await omnihubGet<SignatureMessageResponse>("/api/skill/signature-message", {
    address: account.address,
  });

  const signature = await account.signMessage({ message: msgResponse.nonce });

  const verifyResponse = await omnihubPost<SignatureVerifyResponse>("/api/skill/signature-verify", {
    address: account.address,
    signature,
  });

  sessionToken = verifyResponse.token.token;
  sessionAddress = account.address;

  console.log();
  console.log("Welcome to OmniHub.");
  console.log("You have been authenticated with OmniHub using your configured wallet.");
  console.log("This login signature does not send a transaction and does not spend gas.");
  console.log();
}
