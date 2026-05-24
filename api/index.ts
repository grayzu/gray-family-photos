import { handle } from "@hono/node-server/vercel";
import { buildApp } from "../server/app.js";

const app = buildApp();

export default handle(app);
