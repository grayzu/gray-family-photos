const required = [
  "TURSO_DATABASE_URL",
  "TURSO_AUTH_TOKEN",
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET",
  "R2_PUBLIC_BASE_URL",
  "NOMINATIM_USER_AGENT",
  "SESSION_SECRET",
] as const;

const optional = ["RESEND_API_KEY", "RESEND_FROM_EMAIL", "APP_BASE_URL"] as const;

type Required = (typeof required)[number];
type Optional = (typeof optional)[number];

function readRequired(name: Required): string {
  const v = process.env[name];
  if (!v || v.trim() === "") {
    throw new Error(
      `Missing required environment variable: ${name}. ` +
        `Copy .env.example to .env.local and fill in values.`,
    );
  }
  return v;
}

function readOptional(name: Optional): string | null {
  const v = process.env[name];
  return v && v.trim() !== "" ? v : null;
}

export const env = {
  TURSO_DATABASE_URL: readRequired("TURSO_DATABASE_URL"),
  TURSO_AUTH_TOKEN: readRequired("TURSO_AUTH_TOKEN"),
  R2_ACCOUNT_ID: readRequired("R2_ACCOUNT_ID"),
  R2_ACCESS_KEY_ID: readRequired("R2_ACCESS_KEY_ID"),
  R2_SECRET_ACCESS_KEY: readRequired("R2_SECRET_ACCESS_KEY"),
  R2_BUCKET: readRequired("R2_BUCKET"),
  R2_PUBLIC_BASE_URL: readRequired("R2_PUBLIC_BASE_URL").replace(/\/$/, ""),
  NOMINATIM_USER_AGENT: readRequired("NOMINATIM_USER_AGENT"),
  SESSION_SECRET: readRequired("SESSION_SECRET"),
  RESEND_API_KEY: readOptional("RESEND_API_KEY"),
  RESEND_FROM_EMAIL:
    readOptional("RESEND_FROM_EMAIL") ??
    "Gray Family Photos <onboarding@resend.dev>",
  APP_BASE_URL: (readOptional("APP_BASE_URL") ?? "https://gray-family-photos.vercel.app").replace(
    /\/$/,
    "",
  ),
};
