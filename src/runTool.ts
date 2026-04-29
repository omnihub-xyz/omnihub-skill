import { tools } from "./tools/index.js";

const toolName = process.argv[2];

if (!toolName) {
  throw new Error(
    "Missing tool name. Common: address, chain-balance, token-balance, " +
      "omnihub:discover, omnihub:collection, mint:prepare, mint:execute, " +
      "collection:prepare, collection:deploy.",
  );
}

const tool = tools[toolName as keyof typeof tools];

if (!tool) {
  throw new Error(`Unknown tool name: ${toolName}`);
}

const result = await tool();

if (result !== undefined) {
  console.log(
    JSON.stringify(result, (_, value) => (typeof value === "bigint" ? value.toString() : value), 2),
  );
}
