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

type Required = (typeof required)[number];

function read(name: Required): string {
  const v = process.env[name];
  if (!v || v.trim() === "") {
    throw new Error(
      `Missing required environment variable: ${name}. ` +
        `Copy .env.example to .env.local and fill in values.`,
    );
  }
  return v;
}

export const env = {
  TURSO_DATABASE_URL: read("TURSO_DATABASE_URL"),
  TURSO_AUTH_TOKEN: read("TURSO_AUTH_TOKEN"),
  R2_ACCOUNT_ID: read("R2_ACCOUNT_ID"),
  R2_ACCESS_KEY_ID: read("R2_ACCESS_KEY_ID"),
  R2_SECRET_ACCESS_KEY: read("R2_SECRET_ACCESS_KEY"),
  R2_BUCKET: read("R2_BUCKET"),
  R2_PUBLIC_BASE_URL: read("R2_PUBLIC_BASE_URL").replace(/\/$/, ""),
  NOMINATIM_USER_AGENT: read("NOMINATIM_USER_AGENT"),
  SESSION_SECRET: read("SESSION_SECRET"),
};
