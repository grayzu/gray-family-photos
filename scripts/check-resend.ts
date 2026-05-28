import "dotenv/config";
import { Resend } from "resend";

const apiKey = process.env.RESEND_API_KEY;
const from = process.env.RESEND_FROM_EMAIL ?? "Gray Family Photos <onboarding@resend.dev>";
const to = process.argv[2];

if (!apiKey) {
  console.error("RESEND_API_KEY not set in environment.");
  process.exit(1);
}
if (!to) {
  console.error("Usage: npx tsx --env-file=.env.local scripts/check-resend.ts <to-email>");
  process.exit(1);
}

const fromAddress = (from.match(/<([^>]+)>/)?.[1] ?? from).trim();
const fromDomain = fromAddress.split("@")[1];

console.log(`RESEND_FROM_EMAIL : ${from}`);
console.log(`From address      : ${fromAddress}`);
console.log(`From domain       : ${fromDomain}`);
console.log(`Sending test to   : ${to}\n`);

const resend = new Resend(apiKey);

try {
  const domains = await resend.domains.list();
  const list = (domains.data as { data?: Array<{ name: string; status: string }> } | null)?.data;
  if (list && list.length > 0) {
    console.log("Verified domains on this Resend account:");
    for (const d of list) console.log(`  - ${d.name} (${d.status})`);
    const match = list.find((d) => d.name === fromDomain);
    if (!match) {
      console.log(
        `\nWARNING: '${fromDomain}' is NOT in your Resend account. ` +
          `On Resend free tier you can only send to your own verified email when using onboarding@resend.dev. ` +
          `Verify ${fromDomain} at https://resend.com/domains to send to anyone.`,
      );
    } else if (match.status !== "verified") {
      console.log(`\nWARNING: '${fromDomain}' status is '${match.status}', not 'verified'.`);
    }
  } else {
    console.log("No domains registered on this Resend account.");
    if (fromDomain === "resend.dev") {
      console.log(
        "Using onboarding@resend.dev means delivery is limited to your account's own verified email. " +
          "Add and verify a domain at https://resend.com/domains for real recipients.",
      );
    }
  }
} catch (e) {
  console.error("Could not list domains:", e instanceof Error ? e.message : e);
}

console.log("\nSending test email...");
const result = await resend.emails.send({
  from,
  to,
  subject: "Gray Family Photos: Resend test",
  text: "This is a delivery test from check-resend.ts.",
});
if (result.error) {
  console.error("Resend rejected the send:", result.error);
  process.exit(2);
}
console.log(`OK. Resend id: ${result.data?.id}`);
console.log(`Check delivery at https://resend.com/emails/${result.data?.id}`);
