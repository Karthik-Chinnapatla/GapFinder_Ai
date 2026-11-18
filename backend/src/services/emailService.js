const nodemailer = require('nodemailer');

let cachedTransporter = null;

function getTransporter() {
  if (cachedTransporter) return cachedTransporter;

  const user = (process.env.SMTP_USER || '').trim();
  const pass = (process.env.SMTP_PASS || '').replace(/\s+/g, '');

  if (!user || !pass) {
    throw new Error('Gmail SMTP credentials (SMTP_USER / SMTP_PASS) are not configured.');
  }

  cachedTransporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user,
      pass,
    },
  });

  return cachedTransporter;
}

function getFromHeader() {
  const user = (process.env.SMTP_USER || 'gapfinderplatform@gmail.com').trim();
  const fromName = (process.env.SMTP_FROM_NAME || 'GapFinder AI').trim();
  return `"${fromName}" <${user}>`;
}

async function sendOtpEmail({ to, name, otp, purpose = 'login' }) {
  const transporter = getTransporter();
  const displayName = name || 'Student';
  const isRegister = purpose === 'register';
  const actionLabel = isRegister ? 'verify your new account' : 'complete your sign-in';
  const subject = `GapFinder AI — Your Verification OTP: ${otp}`;

  const text = [
    `Hi ${displayName},`,
    '',
    `Use the following 6-digit One-Time Password (OTP) to ${actionLabel} on GapFinder AI:`,
    '',
    `    ${otp}`,
    '',
    'This code expires in 10 minutes. Do not share it with anyone.',
    '',
    'If you did not request this code, you can safely ignore this email.',
    '',
    '— GapFinder AI',
    'Discover what you are missing before it matters.',
  ].join('\n');

  const html = `
  <div style="margin:0;padding:0;background-color:#F8FAFC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background:#FFFFFF;border:1px solid #E2E8F0;border-radius:16px;overflow:hidden;">
            <tr>
              <td style="background:#4F46E5;padding:24px 32px;color:#FFFFFF;">
                <h1 style="margin:0;font-size:20px;font-weight:700;letter-spacing:-0.02em;">GapFinder AI</h1>
                <p style="margin:4px 0 0;font-size:12px;opacity:0.9;">Find what you&apos;re missing before exam day</p>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">
                <p style="margin:0 0 12px;font-size:15px;color:#0F172A;font-weight:600;">Hi ${escapeHtml(displayName)},</p>
                <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#475569;">
                  Enter the 6-digit verification code below to ${actionLabel} on <strong>GapFinder AI</strong>:
                </p>
                <div style="text-align:center;margin:24px 0;padding:20px;background:#EEF2FF;border:1px dashed #818CF8;border-radius:12px;">
                  <span style="font-family:'Courier New',Courier,monospace;font-size:32px;font-weight:800;letter-spacing:8px;color:#312E81;">${otp}</span>
                </div>
                <p style="margin:0 0 8px;font-size:13px;color:#64748B;">
                  This code is valid for <strong>10 minutes</strong>. For your security, never share this code with anyone.
                </p>
                <p style="margin:0;font-size:12px;color:#94A3B8;">
                  If you did not request this verification code, you can safely ignore this message.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 32px;background:#F8FAFC;border-top:1px solid #E2E8F0;font-size:12px;color:#64748B;text-align:center;">
                Sent by <strong>GapFinder AI</strong> &middot; gapfinderplatform@gmail.com
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </div>`;

  return transporter.sendMail({
    from: getFromHeader(),
    to,
    subject,
    text,
    html,
  });
}

async function sendLoginSuccessEmail({ to, name, isNewUser = false, timestamp = new Date() }) {
  const transporter = getTransporter();
  const displayName = name || 'Student';
  const formattedTime = timestamp.toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  const subject = isNewUser
    ? 'Welcome to GapFinder AI — Successfully Logged In'
    : 'GapFinder AI — Successfully Logged In';

  const heading = isNewUser ? 'Welcome to GapFinder AI!' : 'Successfully Logged In!';
  const thankYouLine = 'Thank you for logging into GapFinder AI. Successfully logged in!';
  const intro = isNewUser
    ? 'Your new GapFinder AI account has been verified. Upload your syllabus and notes to uncover important concepts you might be missing.'
    : 'Your GapFinder AI account login was completed successfully.';

  const text = [
    `Hi ${displayName},`,
    '',
    thankYouLine,
    '',
    intro,
    '',
    `Account: ${to}`,
    `Signed in at: ${formattedTime}`,
    '',
    'If this was not you, please change your password immediately.',
    '',
    '— GapFinder AI',
  ].join('\n');

  const html = `
  <div style="margin:0;padding:0;background-color:#F8FAFC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background:#FFFFFF;border:1px solid #E2E8F0;border-radius:16px;overflow:hidden;">
            <tr>
              <td style="background:#059669;padding:24px 32px;color:#FFFFFF;">
                <h1 style="margin:0;font-size:20px;font-weight:700;letter-spacing:-0.02em;">${heading}</h1>
                <p style="margin:4px 0 0;font-size:12px;opacity:0.95;">GapFinder AI &middot; Login Confirmed</p>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">
                <p style="margin:0 0 12px;font-size:15px;color:#0F172A;font-weight:600;">Hi ${escapeHtml(displayName)},</p>
                <p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#059669;font-weight:700;">
                  ${thankYouLine}
                </p>
                <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#475569;">
                  ${intro}
                </p>
                <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:12px;padding:16px 20px;margin-bottom:20px;">
                  <p style="margin:0 0 6px;font-size:13px;color:#334155;"><strong>Email:</strong> ${escapeHtml(to)}</p>
                  <p style="margin:0;font-size:13px;color:#334155;"><strong>Time:</strong> ${escapeHtml(formattedTime)}</p>
                </div>
                <p style="margin:0;font-size:12px;color:#94A3B8;">
                  If you did not recognize this login activity, please secure your account right away.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 32px;background:#F8FAFC;border-top:1px solid #E2E8F0;font-size:12px;color:#64748B;text-align:center;">
                Sent by <strong>GapFinder AI</strong> &middot; gapfinderplatform@gmail.com
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </div>`;

  return transporter.sendMail({
    from: getFromHeader(),
    to,
    subject,
    text,
    html,
  });
}

function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

module.exports = {
  sendOtpEmail,
  sendLoginSuccessEmail,
};
