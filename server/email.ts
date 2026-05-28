import { Resend } from "resend";
import { env } from "./env.js";

const isProd = process.env.NODE_ENV === "production";
const forceSendInDev = process.env.ALLOW_EMAIL_IN_DEV === "1";
const useResend = !!env.RESEND_API_KEY && (isProd || forceSendInDev);
const resend = useResend ? new Resend(env.RESEND_API_KEY!) : null;

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

  if (!isProd) {
    devLastCode.set(to.trim().toLowerCase(), code);
  }

  if (!resend) {
    console.log(
      `\n[email:dev-fallback] To: ${to}\nSubject: ${subject}\nCode: ${code}\n` +
        (env.RESEND_API_KEY && !forceSendInDev
          ? `(Resend disabled in dev. Set ALLOW_EMAIL_IN_DEV=1 to send real emails locally.)\n`
          : ""),
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

export async function sendInviteEmail(to: string, name?: string, invitedBy?: string) {
  const subject = `You're invited to Gray Family Photos`;
  const greeting = name ? `Hi ${name},` : "Hi,";
  const from = invitedBy ? ` by ${invitedBy}` : "";
  const loginUrl = `${env.APP_BASE_URL}/login?email=${encodeURIComponent(to)}`;
  const text = `${greeting}

You've been invited${from} to Gray Family Photos.

Visit the link below and enter your email to receive a sign-in code:

    ${loginUrl}

If you didn't expect this, you can safely ignore this email.`;

  const html = `<!DOCTYPE html><html><body style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 40px auto; color: #1f2937;">
    <p>${greeting}</p>
    <p>You've been invited${from} to <strong>Gray Family Photos</strong>.</p>
    <p style="margin:24px 0;">
      <a href="${loginUrl}" style="display:inline-block;padding:12px 20px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;font-weight:500;">Sign in to view photos</a>
    </p>
    <p style="font-size:13px;color:#64748b;">Or open this link: <a href="${loginUrl}">${loginUrl}</a></p>
    <p style="font-size:13px;color:#64748b;">If you didn't expect this, you can safely ignore this email.</p>
  </body></html>`;

  if (!resend) {
    console.log(
      `\n[email:dev-fallback] To: ${to}\nSubject: ${subject}\nLink: ${loginUrl}\n` +
        (env.RESEND_API_KEY && !forceSendInDev
          ? `(Resend disabled in dev. Set ALLOW_EMAIL_IN_DEV=1 to send real emails locally.)\n`
          : ""),
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
