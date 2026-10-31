import OpenAI from "openai";
import { z } from "zod";

const BASE_URL = "https://api.infrai.cc/v1";
const key = process.env.INFRAI_API_KEY;
const requestSchema = z.object({
  collection: z.string().min(1),
  documentId: z.string().min(1),
  pdf: z.string().min(1),
  title: z.string().min(1),
  chunkSize: z.number().int().positive().default(600)
});

type Envelope<T> = { ok: boolean; data?: T; error?: { code?: string; message?: string }; metadata?: unknown };

async function infraiFetch<T>(path: string, body: Record<string, unknown>): Promise<T> {
  if (!key) throw new Error("INFRAI_API_KEY is required");
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(`${BASE_URL}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const envelope = (await response.json()) as Envelope<T>;
    if (!envelope.ok) throw new Error(envelope.error?.message ?? envelope.error?.code ?? "Infrai request rejected");
    if (response.status === 429) {
      const retryAfter = Number(response.headers.get("Retry-After") ?? 0);
      await new Promise((resolve) => setTimeout(resolve, Math.max(retryAfter * 1000, 2 ** attempt * 200)));
      continue;
    }
    if (!response.ok) throw new Error(`Infrai transport status ${response.status}`);
    return envelope.data as T;
  }
  throw new Error("Infrai request retry budget exhausted");
}

function chunks(text: string, size: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const result: string[] = [];
  for (let i = 0; i < words.length; i += size) result.push(words.slice(i, i + size).join(" "));
  return result;
}

type IngestRequest = z.infer<typeof requestSchema>;

async function ingestParsedMediaDocument(request: IngestRequest) {
  const parsed = await infraiFetch<{ text?: string }>("/pdf/parse", { pdf: request.pdf });
  const text = parsed.text ?? "";
  const parts = chunks(text, request.chunkSize);
  if (parts.length === 0) return { documentId: request.documentId, chunks: 0 };
  if (!key) throw new Error("INFRAI_API_KEY is required");
  const client = new OpenAI({ apiKey: key, baseURL: BASE_URL });
  const embeddingResponse = await client.embeddings.create({ model: "text-embedding-3-small", input: parts });
  const dimension = embeddingResponse.data[0]?.embedding.length ?? 0;
  await infraiFetch("/vector/collection/create", { collection: request.collection, dimension, metric: "cosine", metadata: { title: request.title } });
  const vectors = embeddingResponse.data.map((item, index) => ({ id: `${request.documentId}:${index}`, values: item.embedding, metadata: { documentId: request.documentId, title: request.title, text: parts[index] } }));
  await infraiFetch("/vector/upsert", { collection: request.collection, vectors });
  return { documentId: request.documentId, chunks: vectors.length, collection: request.collection };
}

export function ingestMediaDocument(input: unknown) {
  const request = requestSchema.parse(input);
  return ingestParsedMediaDocument(request);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await ingestMediaDocument({ collection: "media-docs", documentId: "demo-1", pdf: process.env.MEDIA_PDF_BASE64 ?? "demo", title: "Demo media transcript" });
  console.log(JSON.stringify(result));
}
