import { auth } from "@openai-demo/auth";
import { env } from "@openai-demo/env/server";
import {
  copilotQuestionSchema,
  runCloudCostCopilot,
  type CopilotRunEvent,
} from "@openai-demo/agents";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

import { createCopilotDependencies } from "./lib/dependencies";

const app = new Hono();
const runEvents = new Map<string, CopilotRunEvent[]>();

app.use(logger());
app.use(
  "/*",
  cors({
    origin: env.CORS_ORIGIN,
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  }),
);

app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

app.get("/", (c) => {
  return c.text("OK");
});

app.post("/api/copilot/runs", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const input = copilotQuestionSchema.parse({
    ...body,
    runMode: env.USE_MOCK_DATABRICKS ? "mock" : "live",
  });
  const runId = crypto.randomUUID();
  const events: CopilotRunEvent[] = [];
  runEvents.set(runId, events);
  const dependencies = await createCopilotDependencies();
  const result = await runCloudCostCopilot(input, {
    ...dependencies,
    onEvent: (event) => {
      events.push(event);
    },
  });

  return c.json({
    runId,
    result,
    events,
  });
});

app.post("/api/copilot/runs/stream", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const input = copilotQuestionSchema.parse({
    ...body,
    runMode: env.USE_MOCK_DATABRICKS ? "mock" : "live",
  });
  const runId = crypto.randomUUID();
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (eventName: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      };

      try {
        const events: CopilotRunEvent[] = [];
        runEvents.set(runId, events);
        send("run_started", { runId });
        const dependencies = await createCopilotDependencies();
        const result = await runCloudCostCopilot(input, {
          ...dependencies,
          onEvent: (event) => {
            events.push(event);
            send(event.type, event);
          },
        });

        send("run_completed", { runId, result });
      } catch (error) {
        send("error", {
          runId,
          message: error instanceof Error ? error.message : "Unknown copilot error",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
});

app.get("/api/copilot/runs/:runId/events", (c) => {
  const runId = c.req.param("runId");
  const events = runEvents.get(runId) ?? [];

  return new Response(
    events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(""),
    {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    },
  );
});

export default app;
