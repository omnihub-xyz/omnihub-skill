import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

export class TransactionCancelled extends Error {
  constructor() {
    super("Transaction cancelled.");
  }
}

/**
 * Skipped when AUTO_CONFIRM_TRANSACTIONS=true. Throws TransactionCancelled
 * if the user picks anything other than 1, or if stdin is non-TTY (no way
 * to obtain interactive consent).
 */
export async function confirmTransaction(
  summary: Record<string, string>,
  warnings: string[] = [],
): Promise<void> {
  const autoConfirm = process.env.AUTO_CONFIRM_TRANSACTIONS?.trim().toLowerCase() === "true";

  console.log();
  for (const [key, value] of Object.entries(summary)) {
    console.log(`  ${key.padEnd(16)} ${value}`);
  }

  if (warnings.length > 0) {
    console.log(`\n  Warnings:`);
    for (const w of warnings) console.log(`    - ${w}`);
  }

  if (autoConfirm) {
    console.log(`\nAUTO_CONFIRM_TRANSACTIONS is enabled. Executing now.`);
    return;
  }

  console.log(`\nDo you want to confirm this transaction?`);
  console.log(`  1. Yes`);
  console.log(`  2. No`);

  if (!process.stdin.isTTY) {
    console.log(`\nThis step requires interactive confirmation to continue.`);
    throw new TransactionCancelled();
  }

  const rl = createInterface({ input: stdin, output: stdout });
  let answer: string;
  try {
    answer = await rl.question(`\nEnter choice (1 or 2): `);
  } finally {
    rl.close();
  }

  if (answer.trim() !== "1") {
    throw new TransactionCancelled();
  }
}
