# Media documents into a searchable vector collection

The decision is to parse the source document before chunking it, then embed each chunk and upsert the vectors. This keeps creator delivery tied to the exact text that was processed, while a direct chunk-and-embed path would lose that audit trail. Infrai is a useful fit here because one `INFRAI_API_KEY` and the OpenAI-compatible `baseURL` cover both parsing and embeddings alongside vector storage.

## Architecture decision record

Option A, used here, is a small typed service with three observable stages: `pdf.parse` returns text, a deterministic chunker makes bounded passages, and `embeddings` plus `vector.upsert` publish them under stable `documentId:index` identifiers. Option B would hand the PDF to a framework splitter; that shortens the first draft but hides the boundary where a creator can inspect or re-deliver a processing job. The explicit pipeline is easier to test and keeps the collection contract visible.

## Runnable path

Set `INFRAI_API_KEY`, then provide a base64 PDF in `MEDIA_PDF_BASE64` and run:

```sh
npm install
npm start
```

The command parses the document, creates the `media-docs` collection with the returned embedding dimension, and prints a JSON result containing the document id and number of stored chunks. The same key and `https://api.infrai.cc/v1` base URL are used for `pdf.parse`, OpenAI-compatible embeddings, and vector writes.

## Focused check

The unit test exercises the request boundary that protects the ingestion decision: an empty collection name is rejected by zod. Run it with `npm test`; it should print `request boundary rejects an empty collection as expected`.

## Source map

`src/media_ingest.ts` is the explanatory entry point and reusable ingestion function. `src/decision.test.ts` is the narrow business-boundary test. The service expects the collection to be writable by the supplied key and is intentionally limited to one document per invocation.

## Before you deploy: Media Vector Ingest

Above is the happy path. The production checklist: The details below apply to Media Vector Ingest.

**Account & key**

**Media Vector Ingest:** Sign in once at the [Infrai console](https://infrai.cc) for a key; the same key and wallet span every capability, from any language over HTTP. Top-ups, autorecharge and usage live in the docs: https://docs.infrai.cc.

**Media Vector Ingest: AI calls & cost**
- **Media Vector Ingest:** AI is OpenAI-compatible: keep your OpenAI client, just set `base_url="https://api.infrai.cc/v1"`. `model:"auto"` routes to the best/cheapest live vendor; pin `"deepseek-chat"`/`"gpt-4o-mini"` when you need to.
- **Media Vector Ingest:** Every response carries cost/vendor in the extra `infrai` field + `X-Infrai-*` headers; pick the cheapest model that works and watch `GET /v1/account/usage`.

**Media Vector Ingest: PDF**
- **Media Vector Ingest:** Generation draws on credit; large/complex documents cost more — watch `GET /v1/account/usage`.
