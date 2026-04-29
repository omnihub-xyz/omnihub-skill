import { lifiPost } from "../../integrations/lifi/client.js";
import type { LifiStep, LifiStepTransactionResponse } from "../../integrations/lifi/types.js";

export async function prepareStepTransaction(step: LifiStep): Promise<LifiStepTransactionResponse> {
  if (!step.id) {
    throw new Error("Step is missing an id — cannot call /advanced/stepTransaction");
  }

  const result = await lifiPost<LifiStepTransactionResponse>(
    "/advanced/stepTransaction",
    step as unknown as Record<string, unknown>,
  );

  if (!result.transactionRequest) {
    throw new Error(
      "LI.FI /advanced/stepTransaction did not return a transactionRequest. " +
        "The step may have expired — re-fetch the route and try again.",
    );
  }

  return result;
}
