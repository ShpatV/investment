import nodemailer, { type SendMailOptions, type Transporter } from 'nodemailer';
import type { Role } from '@prisma/client';
import { config } from '../config';

export type AuthEmailKind = 'INVITE' | 'PASSWORD_RESET';
export type DeliveryStatus = 'email' | 'manual' | 'email_failed';

export interface AuthEmailRecipient {
  email: string;
  firstName: string;
  role: Role;
}

export interface AuthEmailInput extends AuthEmailRecipient {
  token: string;
  expiresAt: Date;
}

export interface PreparedMail {
  subject: string;
  text: string;
  html: string;
}

export interface MailResult {
  sent: boolean;
  error?: string;
}

export interface DeliveryResult {
  delivery: DeliveryStatus;
  error?: string;
}

/** SMTP is optional. Without it, invite/reset links stay in the API response (development only). */
export function isMailEnabled(): boolean {
  return config.mail.enabled && Boolean(config.mail.from);
}

export function portalLabel(role: Role): string {
  return role === 'USER' ? 'client portal' : 'administrator portal';
}

export function portalUrlForRole(role: Role): string {
  return role === 'USER' ? config.mail.clientAppUrl : config.mail.adminAppUrl;
}

export function authLink(kind: AuthEmailKind, role: Role, token: string): string {
  const path = kind === 'INVITE' ? config.mail.invitePath : config.mail.resetPath;
  return `${portalUrlForRole(role)}${path}?token=${encodeURIComponent(token)}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatExpiry(expiresAt: Date): string {
  return `${expiresAt.toUTCString()} (UTC)`;
}

export function renderAuthEmail(kind: AuthEmailKind, input: AuthEmailInput): PreparedMail {
  const name = input.firstName.trim() || 'there';
  const link = authLink(kind, input.role, input.token);
  const expires = formatExpiry(input.expiresAt);
  const portal = portalLabel(input.role);

  const subject =
    kind === 'INVITE'
      ? `You have been invited to the ${config.mail.fromName} ${portal}`
      : `Reset your ${config.mail.fromName} password`;

  const lead =
    kind === 'INVITE'
      ? `An account has been created for you on the ${config.mail.fromName} ${portal}. Use the link below to choose your password and sign in.`
      : `We received a request to reset the password for your ${config.mail.fromName} account. Use the link below to choose a new password.`;

  const action = kind === 'INVITE' ? 'Set your password' : 'Reset your password';
  const note =
    kind === 'INVITE'
      ? 'This invitation link can be used once.'
      : 'This reset link can be used once. If you did not request a reset, you can safely ignore this email; your password will not change.';

  const text = [
    `Hi ${name},`,
    '',
    lead,
    '',
    `${action}: ${link}`,
    '',
    `This link expires on ${expires}. ${note}`,
    '',
    `If the button does not work, copy and paste the link above into your browser.`,
    '',
    `— ${config.mail.fromName}`,
  ].join('\n');

  const safeName = escapeHtml(name);
  const safeLink = escapeHtml(link);
  const safeNote = escapeHtml(note);
  const safeExpiry = escapeHtml(expires);
  const safeFromName = escapeHtml(config.mail.fromName);
  const safePortal = escapeHtml(portal);

  const html = `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1f2933;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e4e7eb;border-radius:8px;">
            <tr>
              <td style="padding:32px 32px 16px 32px;border-bottom:1px solid #e4e7eb;">
                <div style="font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:#52606d;">${safeFromName}</div>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">
                <h1 style="margin:0 0 16px 0;font-size:20px;line-height:28px;font-weight:600;color:#102a43;">${escapeHtml(action)}</h1>
                <p style="margin:0 0 12px 0;font-size:15px;line-height:24px;">Hi ${safeName},</p>
                <p style="margin:0 0 24px 0;font-size:15px;line-height:24px;">${escapeHtml(lead)}</p>
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px 0;">
                  <tr>
                    <td style="border-radius:6px;background:#102a43;">
                      <a href="${safeLink}" style="display:inline-block;padding:12px 22px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">${escapeHtml(action)}</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:0 0 8px 0;font-size:13px;line-height:20px;color:#52606d;">This link expires on ${safeExpiry}. ${safeNote}</p>
                <p style="margin:0 0 8px 0;font-size:13px;line-height:20px;color:#52606d;">If the button does not work, copy and paste this link into your browser:</p>
                <p style="margin:0 0 24px 0;font-size:13px;line-height:20px;word-break:break-all;"><a href="${safeLink}" style="color:#1f6feb;">${safeLink}</a></p>
                <p style="margin:0;font-size:13px;line-height:20px;color:#52606d;">— ${safeFromName} ${safePortal}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px;border-top:1px solid #e4e7eb;font-size:12px;line-height:18px;color:#7b8794;">
                This is an automated message. Do not reply to this email.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { subject, text, html };
}

export function buildMailMessage(kind: AuthEmailKind, input: AuthEmailInput): SendMailOptions {
  const rendered = renderAuthEmail(kind, input);
  return {
    from: { name: config.mail.fromName, address: config.mail.from ?? 'no-reply@localhost' },
    to: { name: input.firstName, address: input.email },
    subject: rendered.subject,
    text: rendered.text,
    html: rendered.html,
  };
}

let cachedTransport: Transporter | null = null;
let cachedTransportKey = '';

function transportKey(): string {
  const { host, port, secure, user, rejectUnauthorized } = config.mail;
  return [host, port, secure, user ?? '', rejectUnauthorized].join('|');
}

function getTransport(): Transporter {
  const key = transportKey();
  if (!cachedTransport || cachedTransportKey !== key) {
    cachedTransport?.close();
    cachedTransport = nodemailer.createTransport({
      host: config.mail.host,
      port: config.mail.port,
      secure: config.mail.secure,
      auth: config.mail.user
        ? { user: config.mail.user, pass: config.mail.pass ?? '' }
        : undefined,
      tls: { rejectUnauthorized: config.mail.rejectUnauthorized },
      pool: true,
      maxConnections: 3,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
    cachedTransportKey = key;
  }
  return cachedTransport;
}

/** Closes pooled SMTP connections during a graceful shutdown. */
export function closeMailTransport(): void {
  cachedTransport?.close();
  cachedTransport = null;
  cachedTransportKey = '';
}

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Sends one invitation/reset email. Retries once on transient failures and never
 * includes the token in logs or error messages.
 */
export async function sendAuthEmail(
  kind: AuthEmailKind,
  input: AuthEmailInput,
  transportOverride?: Transporter,
): Promise<MailResult> {
  if (!transportOverride && !isMailEnabled()) {
    return { sent: false, error: 'SMTP is not configured' };
  }

  const message = buildMailMessage(kind, input);
  const transport = transportOverride ?? getTransport();
  let lastError = 'Unknown email error';

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      await transport.sendMail(message);
      return { sent: true };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      if (attempt === 1) await delay(400);
    }
  }

  return { sent: false, error: lastError.slice(0, 500) };
}

/**
 * Delivers an invitation/reset email when SMTP is configured. Without SMTP the
 * token is returned to the caller as a manual link (development/on-prem setups).
 */
export async function deliverAuthEmail(
  kind: AuthEmailKind,
  input: AuthEmailInput,
  transportOverride?: Transporter,
): Promise<DeliveryResult> {
  if (!transportOverride && !isMailEnabled()) return { delivery: 'manual' };
  const result = await sendAuthEmail(kind, input, transportOverride);
  return result.sent
    ? { delivery: 'email' }
    : { delivery: 'email_failed', error: result.error };
}
