import type { SendMailOptions, Transporter } from 'nodemailer';
import { describe, expect, it } from 'vitest';
import {
  authLink,
  buildMailMessage,
  deliverAuthEmail,
  isMailEnabled,
  renderAuthEmail,
  sendAuthEmail,
  type AuthEmailInput,
} from '../src/services/mail';

const expiresAt = new Date('2026-11-05T12:00:00.000Z');

const clientInput: AuthEmailInput = {
  email: 'client@example.com',
  firstName: 'Ada',
  role: 'USER',
  token: 'tok en/+value',
  expiresAt,
};

const adminInput: AuthEmailInput = {
  email: 'admin@example.com',
  firstName: 'Grace',
  role: 'ADMIN',
  token: 'admin-token',
  expiresAt,
};

describe('mail service', () => {
  it('is disabled when SMTP is not configured', () => {
    expect(isMailEnabled()).toBe(false);
  });

  it('builds client links against the client app URL', () => {
    expect(authLink('INVITE', 'USER', 'abc')).toBe(
      'http://localhost:5173/accept-invitation?token=abc',
    );
    expect(authLink('PASSWORD_RESET', 'USER', 'abc')).toBe(
      'http://localhost:5173/reset-password?token=abc',
    );
  });

  it('builds admin links against the admin app URL and encodes tokens', () => {
    expect(authLink('INVITE', 'ADMIN', 'a b/c')).toBe(
      'http://localhost:5174/accept-invitation?token=a%20b%2Fc',
    );
    expect(authLink('PASSWORD_RESET', 'SUPER_ADMIN', 'abc')).toBe(
      'http://localhost:5174/reset-password?token=abc',
    );
  });

  it('renders an invitation email with the one-time link and expiry', () => {
    const rendered = renderAuthEmail('INVITE', clientInput);
    expect(rendered.subject).toContain('invited');
    expect(rendered.text).toContain('Hi Ada');
    expect(rendered.text).toContain(
      'http://localhost:5173/accept-invitation?token=tok%20en%2F%2Bvalue',
    );
    expect(rendered.text).toContain('Nov 2026');
    expect(rendered.html).toContain('Set your password');
    expect(rendered.html).toContain('href="http://localhost:5173/accept-invitation');
  });

  it('renders a password reset email with the reset link and safe-ignore note', () => {
    const rendered = renderAuthEmail('PASSWORD_RESET', adminInput);
    expect(rendered.subject).toContain('Reset');
    expect(rendered.text).toContain('http://localhost:5174/reset-password?token=admin-token');
    expect(rendered.text).toContain('did not request a reset');
    expect(rendered.html).toContain('Reset your password');
  });

  it('escapes user-controlled names in the HTML body', () => {
    const rendered = renderAuthEmail('INVITE', { ...clientInput, firstName: '<script>x</script>' });
    expect(rendered.html).not.toContain('<script>');
    expect(rendered.html).toContain('&lt;script&gt;');
  });

  it('reports manual delivery when SMTP is not configured', async () => {
    const result = await deliverAuthEmail('INVITE', clientInput);
    expect(result).toEqual({ delivery: 'manual' });
  });

  it('sends through an injected transport', async () => {
    const messages: SendMailOptions[] = [];
    const transport = {
      sendMail: async (message: SendMailOptions) => {
        messages.push(message);
        return { accepted: [clientInput.email] };
      },
    } as unknown as Transporter;

    const result = await sendAuthEmail('INVITE', clientInput, transport);
    expect(result.sent).toBe(true);
    expect(messages).toHaveLength(1);
    expect(messages[0].subject).toContain('invited');
    expect(messages[0].to).toEqual({ name: 'Ada', address: clientInput.email });
    expect(String(messages[0].text)).toContain('accept-invitation?token=');
    expect(buildMailMessage('INVITE', clientInput).html).toContain('accept-invitation');
  });

  it('returns an error without throwing when the transport fails', async () => {
    const transport = {
      sendMail: async () => {
        throw new Error('SMTP connection refused');
      },
    } as unknown as Transporter;

    const result = await sendAuthEmail('PASSWORD_RESET', clientInput, transport);
    expect(result.sent).toBe(false);
    expect(result.error).toContain('SMTP connection refused');
  });
});
