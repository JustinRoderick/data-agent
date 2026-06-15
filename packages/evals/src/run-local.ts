import { Eval } from "braintrust";

import { braintrustProjectName, cloudCostEvaluator } from "./braintrust";

const result = await Eval(braintrustProjectName, cloudCostEvaluator, {
  noSendLogs: true,
});

console.log("");
console.log("Cloud Cost Copilot mock eval summary");
console.log(JSON.stringify(result.summary, null, 2));
