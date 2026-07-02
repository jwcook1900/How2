/**
 * Tiny Resend client shared by the email + feedback functions. Resend is a
 * transactional-email provider (chosen after AWS declined SES production
 * access): a single HTTPS POST, no SDK. The API key is injected as an Amplify
 * secret (RESEND_API_KEY) so it never reaches the browser.
 *
 * Docs: https://resend.com/docs/api-reference/emails/send-email
 */
export interface EmailAttachment {
  filename: string;
  content: string; // base64-encoded file contents
  contentType?: string;
}

export interface SendEmailInput {
  from: string;
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  replyTo?: string;
  attachments?: EmailAttachment[];
}

export async function sendEmail(input: SendEmailInput): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("Email is not configured");

  const body: Record<string, unknown> = {
    from: input.from,
    to: Array.isArray(input.to) ? input.to : [input.to],
    subject: input.subject,
  };
  if (input.html) body.html = input.html;
  if (input.text) body.text = input.text;
  if (input.replyTo) body.reply_to = input.replyTo;
  if (input.attachments && input.attachments.length) {
    body.attachments = input.attachments.map((a) => ({
      filename: a.filename,
      content: a.content,
      content_type: a.contentType,
    }));
  }

  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer " + key,
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const detail = await resp.text().catch(() => "");
    throw new Error("Email send failed (" + resp.status + ") " + detail.slice(0, 300));
  }
}
