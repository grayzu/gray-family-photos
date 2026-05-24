import { handle } from "hono/vercel";
import { buildApp } from "../server/app.js";

export const config = { runtime: "nodejs" };

const app = buildApp();
const handler = handle(app);

export default handler;
export const GET = handler;
export const POST = handler;
export const DELETE = handler;
export const PATCH = handler;
export const PUT = handler;
