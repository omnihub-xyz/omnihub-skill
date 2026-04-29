import { getAccount } from "../lib/wallet.js";

export async function getAddress(): Promise<string> {
  return getAccount().address;
}
