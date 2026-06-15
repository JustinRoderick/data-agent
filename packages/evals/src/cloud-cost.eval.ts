import { Eval } from "braintrust";

import { braintrustProjectName, cloudCostEvaluator } from "./braintrust";

await Eval(braintrustProjectName, cloudCostEvaluator, {
  noSendLogs: !process.env.BRAINTRUST_API_KEY,
});
