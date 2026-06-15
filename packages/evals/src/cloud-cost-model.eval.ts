import { Eval } from "braintrust";

import { braintrustModelProjectName, cloudCostModelAnswerEvaluator } from "./braintrust-model";

await Eval(braintrustModelProjectName, cloudCostModelAnswerEvaluator, {
  noSendLogs: !process.env.BRAINTRUST_API_KEY,
});
