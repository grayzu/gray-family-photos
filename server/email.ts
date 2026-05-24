import { Resend } from "resend";
import { env } from "./env.js";

const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

const devLastCode: Map<string, string> = new Map();

export function getDevLastCode(email: string): string | undefined {
  return devLastCode.get(email.trim().toLowerCase());
}

export async function sendCodeEmail(to: string, code: string, name?: string) {
  const subject = `${code} is your Gray Family Photos sign-in code`;
  const greeting = name ? `Hi ${name},` : "Hi,";
  const text = `${greeting}

Your sign-in code for Gray Family Photos is:

    ${code}

This code expires in 15 minutes. If you didn't request it, you can safely ignore this email.`;

  const html = `<!DOCTYPE html><html><body style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 40px auto; color: #1f2937;">
    <p>${greeting}</p>
    <p>Your sign-in code for Gray Family Photos is:</p>
    <p style="font-size:32px;font-weight:600;letter-spacing:8px;text-align:center;margin:24px 0;padding:16px;background:#f1f5f9;border-radius:8px;">${code}</p>
    <p style="font-size:13px;color:#64748b;">This code expires in 15 minutes.</p>
    <p style="font-size:13px;color:#64748b;">If you didn't request it, you can safely ignore this email.</p>
  </body></html>`;

  if (process.env.NODE_ENV !== "production") {
    devLastCode.set(to.trim().toLowerCase(), code);
  }

  if (!resend) {
    console.log(
      `\n[email:dev-fallback] To: ${to}\nSubject: ${subject}\nCode: ${code}\n`,
    );
    return { id: "dev-fallback" };
  }

  const result = await resend.emails.send({
    from: env.RESEND_FROM_EMAIL,
    to,
    subject,
    text,
    html,
  });
  if (result.error) throw new Error(`resend error: ${result.error.message}`);
  return { id: result.data?.id ?? "unknown" };
}
