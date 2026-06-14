import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().min(1),
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.url(),
    CORS_ORIGIN: z.url(),
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    OPENAI_API_KEY: z.string().min(1).optional(),
    OPENAI_VECTOR_STORE_ID: z.string().min(1).optional(),
    BRAINTRUST_API_KEY: z.string().min(1).optional(),
    BRAINTRUST_PROJECT_NAME: z.string().min(1).default("openai-demo-bi-metrics-copilot"),
    DATABRICKS_SERVER_HOSTNAME: z.string().min(1).optional(),
    DATABRICKS_HTTP_PATH: z.string().min(1).optional(),
    DATABRICKS_TOKEN: z.string().min(1).optional(),
    DATABRICKS_CATALOG: z.string().min(1).default("main"),
    DATABRICKS_SCHEMA: z.string().min(1).default("bi_demo"),
    DATABRICKS_QUERY_TAG: z.string().min(1).default("app:openai-demo-bi-copilot"),
    DATABRICKS_MAX_ROWS: z.coerce.number().int().positive().default(1000),
    ENABLE_DATABRICKS_EXECUTION: z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true"),
    USE_MOCK_DATABRICKS: z
      .enum(["true", "false"])
      .default("true")
      .transform((value) => value === "true"),
  },
  runtimeEnv: process.env,
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});
