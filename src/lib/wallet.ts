import type { Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { getPrivateKey } from "./env.js";

export function getAccount() {
  return privateKeyToAccount(getPrivateKey() as Hex);
}
