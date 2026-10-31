import { strict as assert } from "node:assert";
import { ingestMediaDocument } from "./media_ingest.js";

assert.throws(() => ingestMediaDocument({ collection: "", documentId: "x", pdf: "p", title: "t" }));
console.log("request boundary rejects an empty collection as expected");
