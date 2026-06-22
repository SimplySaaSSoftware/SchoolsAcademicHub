import { Resend } from 'resend';
import { SchoolDoc } from '../types';

const resend = new Resend(process.env.RESEND_API_KEY!);
const FROM   = process.env.RESEND_FROM ?? 'noreply@hpshub.co.za';

interface SendOptions {
  to: string;
  subject: string;
  school: Pick<SchoolDoc, 'name' | 'logo_url' | 'primary_colour'>;
  htmlBody: string;
}

export async function sendEmail({ to, subject, school, htmlBody }: SendOptions): Promise<void> {
  const html = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center" style="padding:2rem 1rem;">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          <!-- Header -->
          <tr>
            <td style="background:${school.primary_colour};padding:1.5rem 2rem;text-align:center;">
              ${school.logo_url
                ? `<img src="${school.logo_url}" alt="${school.name}" height="60" style="margin-bottom:0.5rem;"/><br/>`
                : ''}
              <span style="color:#ffffff;font-size:1.2rem;font-weight:700;">${school.name}</span>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:2rem;">
              ${htmlBody}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:1rem 2rem;text-align:center;font-size:0.8rem;color:#888;border-top:1px solid #eee;">
              &copy; ${new Date().getFullYear()} ${school.name} &mdash; Powered by HPS Academic Hub
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  await resend.emails.send({
    from: `${school.name} <${FROM}>`,
    to,
    subject,
    html,
  });
}

export async function sendPasswordReset(
  to: string,
  name: string,
  resetUrl: string,
  school: Pick<SchoolDoc, 'name' | 'logo_url' | 'primary_colour'>
): Promise<void> {
  await sendEmail({
    to,
    subject: `Reset your ${school.name} password`,
    school,
    htmlBody: `
      <h2 style="margin-top:0;">Hi ${name},</h2>
      <p>You requested a password reset for your ${school.name} Academic Hub account.</p>
      <p style="text-align:center;margin:2rem 0;">
        <a href="${resetUrl}"
           style="background:${school.primary_colour};color:#ffffff;padding:0.75rem 2rem;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block;">
          Reset Password
        </a>
      </p>
      <p style="color:#888;font-size:0.875rem;">This link expires in 1 hour. If you didn't request this, you can safely ignore this email.</p>`,
  });
}
