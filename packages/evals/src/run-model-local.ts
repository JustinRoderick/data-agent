import { Eval } from "braintrust";

import { braintrustModelProjectName, cloudCostModelAnswerEvaluator } from "./braintrust-model";

const result = await Eval(braintrustModelProjectName, cloudCostModelAnswerEvaluator, {
  noSendLogs: true,
});

console.log("");
console.log("Cloud Cost Copilot model-backed answer eval summary");
console.log(JSON.stringify(result.summary, null, 2));
