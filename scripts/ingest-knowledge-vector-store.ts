import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { basename, extname, join, relative } from "node:path";

import OpenAI, { toFile } from "openai";
import { config } from "dotenv";

config({ path: "apps/server/.env" });

const knowledgeDir = "knowledge";
const manifestPath = "knowledge/vector-store-manifest.json";
const apiKey = process.env.OPENAI_API_KEY;

if (!apiKey) {
  throw new Error("OPENAI_API_KEY is required to ingest knowledge docs.");
}

const client = new OpenAI({ apiKey });
const files = await listMarkdownFiles(knowledgeDir);

if (files.length === 0) {
  throw new Error(`No markdown files found in ${knowledgeDir}.`);
}

const vectorStore = process.env.OPENAI_VECTOR_STORE_ID
  ? await client.vectorStores.retrieve(process.env.OPENAI_VECTOR_STORE_ID)
  : await client.vectorStores.create({
      name: "Cloud Cost Metrics Copilot Knowledge",
      description: "Cloud cost metric, table, and runbook docs for the Databricks demo.",
      metadata: {
        app: "openai-demo",
        domain: "cloud-cost",
      },
    });

const uploadables = await Promise.all(
  files.map(async (filePath) => {
    const bytes = await readFile(filePath);
    return toFile(bytes, relative(knowledgeDir, filePath), {
      type: "text/markdown",
    });
  }),
);

const batch = await client.vectorStores.fileBatches.uploadAndPoll(
  vectorStore.id,
  {
    files: uploadables,
  },
  {
    pollIntervalMs: 1000,
  },
);

const updatedVectorStore = await client.vectorStores.retrieve(vectorStore.id);
const vectorStoreFiles = await collectAsyncIterable(client.vectorStores.files.list(vectorStore.id));
const uploadBatchId = batch.id.startsWith("vsfb_") ? batch.id : undefined;

await mkdir("knowledge", { recursive: true });
await writeFile(
  manifestPath,
  `${JSON.stringify(
    {
      vectorStoreId: updatedVectorStore.id,
      vectorStoreName: updatedVectorStore.name,
      uploadBatchId,
      status: updatedVectorStore.status,
      fileCounts: updatedVectorStore.file_counts,
      files: await Promise.all(
        files.map(async (filePath, index) => {
          const bytes = await readFile(filePath);
          const vectorStoreFile = vectorStoreFiles[index];

          return {
            path: relative(knowledgeDir, filePath),
            title: titleFromPath(filePath),
            sha256: createHash("sha256").update(bytes).digest("hex"),
            vectorStoreFileId: vectorStoreFile?.id,
            vectorStoreFileStatus: vectorStoreFile?.status,
          };
        }),
      ),
      ingestedAt: new Date().toISOString(),
    },
    null,
    2,
  )}\n`,
);

console.log(`Vector store: ${updatedVectorStore.id}`);
if (uploadBatchId) {
  console.log(`Upload batch: ${uploadBatchId}`);
}
console.log(`Status: ${updatedVectorStore.status}`);
console.log(`Manifest: ${manifestPath}`);
console.log("");
console.log("Add this to apps/server/.env:");
console.log(`OPENAI_VECTOR_STORE_ID=${updatedVectorStore.id}`);

async function listMarkdownFiles(rootDir: string): Promise<string[]> {
  const entries = await readdir(rootDir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = join(rootDir, entry.name);

      if (entry.isDirectory()) {
        return listMarkdownFiles(entryPath);
      }

      if (entry.isFile() && extname(entry.name) === ".md") {
        return [entryPath];
      }

      return [];
    }),
  );

  return files.flat().sort();
}

function titleFromPath(filePath: string): string {
  return basename(filePath, extname(filePath)).replaceAll(/[-_]+/gu, " ");
}

async function collectAsyncIterable<T>(items: AsyncIterable<T>): Promise<T[]> {
  const results = [];
  for await (const item of items) {
    results.push(item);
  }

  return results;
}
