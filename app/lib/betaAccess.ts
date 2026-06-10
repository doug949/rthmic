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
<body style="margin:0;padding:0;background:#07101f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#07101f;min-height:100vh;">
    <tr>
      <td align="center" style="padding:42px 18px;">
        <table width="100%" style="max-width:560px;" cellpadding="0" cellspacing="0">

          <tr>
            <td style="border-radius:28px;border:1px solid rgba(201,165,90,0.26);background:#0d1628;overflow:hidden;box-shadow:0 28px 80px rgba(0,0,0,0.36);">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:34px 34px 0;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td>
                          <p style="margin:0;font-size:13px;letter-spacing:0.42em;text-transform:uppercase;color:#c9a55a;font-weight:500;">RTHMIC</p>
                        </td>
                        <td align="right">
                          <span style="display:inline-block;width:8px;height:8px;border-radius:99px;background:#46cdeb;box-shadow:0 0 18px rgba(70,205,235,0.7);"></span>
                          <span style="display:inline-block;width:8px;height:8px;border-radius:99px;background:#c9a55a;box-shadow:0 0 18px rgba(201,165,90,0.65);margin-left:7px;"></span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <tr>
                  <td style="padding:50px 34px 0;">
                    <p style="margin:0 0 12px;font-size:11px;letter-spacing:0.28em;text-transform:uppercase;color:rgba(70,205,235,0.78);font-weight:600;">Beta access</p>
                    <h1 style="margin:0;font-size:31px;font-weight:300;color:#f8fbff;line-height:1.16;letter-spacing:0.01em;">
                      Your RTHMIC access code is ready.
                    </h1>
                    <p style="margin:18px 0 0;font-size:15px;color:rgba(228,235,246,0.62);line-height:1.65;">
                      Music-powered personal productivity. An entirely new category.
                    </p>
                  </td>
                </tr>

                <tr>
                  <td style="padding:34px 34px 0;">
                    <div style="height:1px;background:linear-gradient(90deg, rgba(201,165,90,0.45), rgba(70,205,235,0.18), transparent);"></div>
                  </td>
                </tr>

                <tr>
                  <td style="padding:34px 34px 0;">
                    <p style="margin:0 0 12px;font-size:11px;text-transform:uppercase;letter-spacing:0.32em;color:rgba(255,255,255,0.34);">Your code</p>
                    <div style="background:linear-gradient(135deg, rgba(201,165,90,0.13), rgba(70,205,235,0.06));border:1px solid rgba(201,165,90,0.42);border-radius:20px;padding:24px 24px;box-sizing:border-box;">
                      <p style="margin:0;font-size:29px;font-family:'SFMono-Regular',Consolas,'Liberation Mono',monospace;letter-spacing:0.13em;color:#d7b465;font-weight:600;line-height:1.25;">${code}</p>
                    </div>
                  </td>
                </tr>

                <tr>
                  <td style="padding:28px 34px 0;">
                    <p style="margin:0 0 10px;font-size:15px;color:rgba(248,251,255,0.78);line-height:1.6;">
                      Open RTHMIC and enter this code when prompted. It works on any device.
                    </p>
                    <p style="margin:0;font-size:14px;color:rgba(228,235,246,0.48);line-height:1.65;">
                      This code is associated with this email address. Keep it secure, and don't share or forward it. It won't expire while you're using RTHMIC.
                    </p>
                  </td>
                </tr>

                <tr>
                  <td style="padding:32px 34px 0;">
                    <a href="https://rthmic.app/login"
                      style="display:block;text-align:center;padding:18px 24px;border-radius:18px;background:rgba(201,165,90,0.14);border:1px solid rgba(201,165,90,0.48);color:#d7b465;font-size:14px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;text-decoration:none;">
                      Open RTHMIC →
                    </a>
                  </td>
                </tr>

                <tr>
                  <td style="padding:34px 34px 0;">
                    <div style="border-radius:18px;border:1px solid rgba(70,205,235,0.15);background:rgba(70,205,235,0.045);padding:20px 20px;">
                      <p style="margin:0 0 10px;font-size:11px;text-transform:uppercase;letter-spacing:0.3em;color:rgba(70,205,235,0.62);">What is RTHMIC</p>
                      <p style="margin:0;font-size:14px;color:rgba(228,235,246,0.58);line-height:1.75;">
                        RTHMIC turns what you're facing right now into a complete song: a Rthm that can install a mindset, break inertia, help you prepare, or carry you through the moment.
                      </p>
                    </div>
                  </td>
                </tr>

                <tr>
                  <td style="padding:30px 34px 34px;">
                    <p style="margin:0;font-size:11px;color:rgba(228,235,246,0.28);line-height:1.7;">
                      You received this because you requested beta access to RTHMIC.<br />
                      RTHMIC · rthmic.app
                    </p>
                  </td>
                </tr>
              </table>
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
RTHMIC — Beta Access

Your code: ${code}

Music-powered personal productivity. An entirely new category.

Open RTHMIC and enter this code when prompted. It works on any device.
This code is associated with this email address. Keep it secure, and don't share or forward it.
It won't expire while you're using RTHMIC.

Open RTHMIC: https://rthmic.app/login

---
What is RTHMIC?
RTHMIC turns what you're facing right now into a complete song: a Rthm that can
install a mindset, break inertia, help you prepare, or carry you through the moment.

---
You received this because you requested beta access to RTHMIC.
RTHMIC · rthmic.app
  `.trim();
}
