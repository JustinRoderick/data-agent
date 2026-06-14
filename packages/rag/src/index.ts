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
      }));
  }
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
