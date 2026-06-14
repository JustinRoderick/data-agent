import { readdir, readFile } from "node:fs/promises";
import { basename, extname, join, relative } from "node:path";

import OpenAI from "openai";
import { z } from "zod";

export const knowledgeDocumentSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  sourcePath: z.string().min(1),
  content: z.string().min(1),
  tags: z.array(z.string()).default([]),
});

export type KnowledgeDocument = z.infer<typeof knowledgeDocumentSchema>;

export interface RetrievedContext {
  documentId: string;
  title: string;
  excerpt: string;
  score: number;
  sourcePath?: string;
}

export interface RagConnector {
  search(query: string, options?: { limit?: number }): Promise<RetrievedContext[]>;
}

export class InMemoryRagConnector implements RagConnector {
  constructor(private readonly documents: KnowledgeDocument[]) {}

  async search(query: string, options: { limit?: number } = {}): Promise<RetrievedContext[]> {
    const terms = tokenize(query);
    const limit = options.limit ?? 5;

    return this.documents
      .map((document) => ({
        document,
        score: scoreDocument(document, terms),
      }))
      .filter((result) => result.score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, limit)
      .map(({ document, score }) => ({
        documentId: document.id,
        title: document.title,
        excerpt: document.content.slice(0, 240),
        score,
        sourcePath: document.sourcePath,
      }));
  }
}

export interface OpenAIVectorStoreRagConnectorOptions {
  apiKey: string;
  vectorStoreId: string;
  client?: OpenAI;
}

export class OpenAIVectorStoreRagConnector implements RagConnector {
  private readonly client: OpenAI;

  constructor(private readonly options: OpenAIVectorStoreRagConnectorOptions) {
    this.client = options.client ?? new OpenAI({ apiKey: options.apiKey });
  }

  async search(query: string, options: { limit?: number } = {}): Promise<RetrievedContext[]> {
    const limit = Math.min(Math.max(options.limit ?? 5, 1), 50);
    const response = await this.client.vectorStores.search(this.options.vectorStoreId, {
      query,
      max_num_results: limit,
      rewrite_query: true,
    });

    const results = await collectAsyncIterable(response);

    return results.map((result) => ({
      documentId: result.file_id,
      title: result.filename,
      excerpt: result.content
        .map((content) => content.text)
        .join("\n\n")
        .slice(0, 1000),
      score: result.score,
      sourcePath: result.filename,
    }));
  }
}

export function createRagConnectorFromEnv(env: {
  OPENAI_API_KEY?: string;
  OPENAI_VECTOR_STORE_ID?: string;
}): RagConnector | undefined {
  if (!env.OPENAI_API_KEY || !env.OPENAI_VECTOR_STORE_ID) {
    return undefined;
  }

  return new OpenAIVectorStoreRagConnector({
    apiKey: env.OPENAI_API_KEY,
    vectorStoreId: env.OPENAI_VECTOR_STORE_ID,
  });
}

export async function loadKnowledgeDocumentsFromDirectory(
  rootDir: string,
): Promise<KnowledgeDocument[]> {
  const files = await listMarkdownFiles(rootDir);

  return Promise.all(
    files.map(async (filePath) => {
      const content = await readFile(filePath, "utf8");
      const sourcePath = relative(rootDir, filePath);
      const title = extractTitle(content) ?? titleFromPath(filePath);

      return knowledgeDocumentSchema.parse({
        id: sourcePath.replaceAll(/[^a-zA-Z0-9_-]+/gu, "-").replaceAll(/^-|-$/gu, ""),
        title,
        sourcePath,
        content,
        tags: sourcePath.split("/").slice(0, -1),
      });
    }),
  );
}

export function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9_]+/u)
    .filter(Boolean);
}

function scoreDocument(document: KnowledgeDocument, terms: string[]): number {
  const haystack = `${document.title} ${document.content} ${document.tags.join(" ")}`.toLowerCase();

  return terms.reduce((score, term) => score + (haystack.includes(term) ? 1 : 0), 0);
}

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

function extractTitle(content: string): string | undefined {
  const firstHeading = content.split(/\r?\n/u).find((line) => line.startsWith("# "));
  return firstHeading?.replace(/^#\s+/u, "").trim();
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
