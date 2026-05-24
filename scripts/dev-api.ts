import { serve } from "@hono/node-server";
import { buildApp } from "../server/app.js";

const PORT = Number(process.env.DEV_API_PORT ?? 3001);
const app = buildApp();

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`API dev server listening on http://localhost:${info.port}`);
});
