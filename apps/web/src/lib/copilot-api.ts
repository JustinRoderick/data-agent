import { env } from "@openai-demo/env/web";

export type AgentStepStatus = "pending" | "running" | "completed" | "failed" | "skipped";

export type AgentStepName =
  | "coordinator"
  | "metric_catalog"
  | "schema_lookup"
  | "sql_analyst"
  | "sql_safety"
  | "sandbox_validation"
  | "databricks_execution"
  | "narrative";

export interface CopilotRunEvent {
  type: "step" | "sql" | "result" | "error";
  step?: AgentStepName;
  status?: AgentStepStatus;
  message: string;
  data?: unknown;
}

export interface CopilotRunResult {
  question: string;
  answer: string;
  sql: string;
  citations: Array<{
    title: string;
    sourcePath?: string;
    excerpt: string;
  }>;
  rows: Record<string, unknown>[];
  steps: Array<{
    name: AgentStepName | string;
    status: AgentStepStatus | string;
    summary: string;
  }>;
}

export interface CopilotRunResponse {
  runId: string;
  result: CopilotRunResult;
  events: CopilotRunEvent[];
}

export interface CopilotStreamOptions {
  question: string;
  onEvent?: (event: CopilotRunEvent) => void;
  onStarted?: (runId: string) => void;
}

export async function runCopilotStream({
  question,
  onEvent,
  onStarted,
}: CopilotStreamOptions): Promise<CopilotRunResponse> {
  const response = await fetch(`${env.VITE_SERVER_URL}/api/copilot/runs/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ question }),
  });

  if (!response.ok || !response.body) {
    throw new Error(`Copilot request failed with status ${response.status}.`);
  }

  const decoder = new TextDecoder();
  const reader = response.body.getReader();
  const events: CopilotRunEvent[] = [];
  let buffer = "";
  let runId = "";
  let result: CopilotRunResult | undefined;

  while (true) {
    const { value, done } = await reader.read();
    if (value) {
      buffer += decoder.decode(value, { stream: true });
    }
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";

    for (const part of parts) {
      const parsed = parseSseMessage(part);

      if (!parsed) {
        continue;
      }

      if (parsed.event === "run_started") {
        const data = parsed.data as { runId?: string };
        runId = data.runId ?? "";
        onStarted?.(runId);
        continue;
      }

      if (parsed.event === "run_completed") {
        const data = parsed.data as { runId?: string; result?: CopilotRunResult };
        runId = data.runId ?? runId;
        result = data.result;
        continue;
      }

      if (parsed.event === "error") {
        const data = parsed.data as { message?: string };
        throw new Error(data.message ?? "Copilot stream failed.");
      }

      const event = parsed.data as CopilotRunEvent;
      events.push(event);
      onEvent?.(event);
    }

    if (done) {
      break;
    }
  }

  if (!result) {
    throw new Error("Copilot stream ended without a result.");
  }

  return {
    runId,
    result,
    events,
  };
}

function parseSseMessage(message: string): { event: string; data: unknown } | undefined {
  const eventLine = message.split("\n").find((line) => line.startsWith("event:"));
  const dataLine = message.split("\n").find((line) => line.startsWith("data:"));

  if (!eventLine || !dataLine) {
    return undefined;
  }

  return {
    event: eventLine.replace(/^event:\s*/u, ""),
    data: JSON.parse(dataLine.replace(/^data:\s*/u, "")) as unknown,
  };
}
