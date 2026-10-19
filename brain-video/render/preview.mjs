// Real-time preview with the soundtrack: node render/preview.mjs [port]
// Open the printed URL and click the page to start; add &t=SECONDS to start later.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "./server.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const server = await serve(ROOT, Number(process.argv[2] || 8017));
console.log(`http://127.0.0.1:${server.address().port}/render/index.html?play&t=0`);
