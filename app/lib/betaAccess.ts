/** Generates a human-readable beta code like `rthm-a3b7x2k9` */
export function makeBetaCode(): string {
  const chars = "abcdefghjkmnpqrstuvwxyz23456789"; // no ambiguous chars
  let suffix = "";
  const arr = new Uint8Array(8);
  crypto.getRandomValues(arr);
  for (const b of arr) suffix += chars[b % chars.length];
  return `rthm-${suffix}`;
}

export function buildBetaAccessEmailHtml(code: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Your RTHMIC Access Code</title>
</head>
<body style="margin:0;padding:0;background:#0d0d0f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0d0d0f;min-height:100vh;">
    <tr>
      <td align="center" style="padding:48px 24px;">
        <table width="100%" style="max-width:480px;" cellpadding="0" cellspacing="0">

          <!-- Wordmark -->
          <tr>
            <td style="padding-bottom:40px;">
              <p style="margin:0;font-size:13px;letter-spacing:0.4em;text-transform:uppercase;color:#c9a55a;font-weight:300;">RTHMIC</p>
            </td>
          </tr>

          <!-- Headline -->
          <tr>
            <td style="padding-bottom:24px;border-bottom:1px solid rgba(201,165,90,0.15);">
              <h1 style="margin:0;font-size:22px;font-weight:300;color:#ffffff;line-height:1.4;letter-spacing:0.01em;">
                Your access code is ready.
              </h1>
            </td>
          </tr>

          <!-- Code block -->
          <tr>
            <td style="padding:32px 0 24px;">
              <p style="margin:0 0 12px;font-size:11px;text-transform:uppercase;letter-spacing:0.3em;color:rgba(255,255,255,0.4);">Your code</p>
              <div style="background:rgba(201,165,90,0.08);border:1px solid rgba(201,165,90,0.35);border-radius:12px;padding:20px 24px;display:inline-block;width:100%;box-sizing:border-box;">
                <p style="margin:0;font-size:22px;font-family:monospace;letter-spacing:0.12em;color:#c9a55a;font-weight:400;">${code}</p>
              </div>
            </td>
          </tr>

          <!-- Instructions -->
          <tr>
            <td style="padding-bottom:32px;">
              <p style="margin:0 0 8px;font-size:13px;color:rgba(255,255,255,0.6);line-height:1.6;">
                Open RTHMIC and enter this code when prompted. It works on any device.
              </p>
              <p style="margin:0;font-size:13px;color:rgba(255,255,255,0.35);line-height:1.6;">
                This code is associated with this email address. Keep it secure, and don't share or forward it.
                It won't expire while you're using RTHMIC.
              </p>
            </td>
          </tr>

          <!-- CTA -->
          <tr>
            <td style="padding-bottom:40px;">
              <a href="https://rthmic.app/login"
                style="display:block;text-align:center;padding:16px 24px;border-radius:12px;background:rgba(201,165,90,0.1);border:1px solid rgba(201,165,90,0.4);color:#c9a55a;font-size:14px;font-weight:600;letter-spacing:0.05em;text-decoration:none;">
                Open RTHMIC →
              </a>
            </td>
          </tr>

          <!-- What is RTHMIC -->
          <tr>
            <td style="border-top:1px solid rgba(255,255,255,0.06);padding-top:32px;padding-bottom:8px;">
              <p style="margin:0 0 10px;font-size:11px;text-transform:uppercase;letter-spacing:0.3em;color:rgba(255,255,255,0.3);">What is RTHMIC</p>
              <p style="margin:0;font-size:13px;color:rgba(255,255,255,0.45);line-height:1.7;">
                RTHMIC generates complete songs built for exactly what you're facing right now.
                You speak your state. It builds a Rthm — a musical tool that installs a mindset,
                breaks inertia, or helps you move through the moment.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding-top:40px;">
              <p style="margin:0;font-size:11px;color:rgba(255,255,255,0.2);line-height:1.6;">
                You received this because someone shared a Rthm with you and you requested beta access.<br />
                RTHMIC · rthmic.app
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

export function buildBetaAccessEmailText(code: string): string {
  return `
RTHMIC — Your Access Code

Your code: ${code}

Open RTHMIC and enter this code when prompted. It works on any device.
This code is associated with this email address. Keep it secure, and don't share or forward it.
It won't expire while you're using RTHMIC.

Open RTHMIC: https://rthmic.app/login

---
What is RTHMIC?
RTHMIC generates complete songs built for exactly what you're facing right now.
You speak your state. It builds a Rthm — a musical tool that installs a mindset,
breaks inertia, or helps you move through the moment.

---
You received this because someone shared a Rthm with you and you requested beta access.
RTHMIC · rthmic.app
  `.trim();
}
