/**
 * Email helper — nodemailer with SMTP env vars.
 * Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS in environment.
 * Falls back to Ethereal (test) transport when not configured.
 *
 * For free production use: Gmail app password, Brevo (300/day free), Mailgun (100/day free).
 */

const nodemailer = require("nodemailer");

let _transport = null;

function getTransport() {
  if (_transport) return _transport;

  if (process.env.SMTP_HOST) {
    _transport = nodemailer.createTransport({
      host:   process.env.SMTP_HOST,
      port:   parseInt(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === "true",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  } else {
    // No SMTP configured — log emails to console in dev
    _transport = {
      sendMail: async (opts) => {
        console.log("\n[MAILER] Email (no SMTP configured):");
        console.log(`  To: ${opts.to}`);
        console.log(`  Subject: ${opts.subject}`);
        console.log(`  --- (HTML body omitted) ---\n`);
        return { messageId: "console-" + Date.now() };
      },
    };
  }

  return _transport;
}

const FROM = process.env.SMTP_FROM || "SF Health Dashboard <noreply@sfhealth.app>";
const APP_URL = process.env.APP_URL || "https://sf-health-dashboard.onrender.com";

function gradeColor(grade) {
  return { A: "#16a34a", B: "#65a30d", C: "#ca8a04", D: "#ea580c", F: "#dc2626" }[grade] || "#6b7280";
}

function scoreColor(score) {
  if (score >= 80) return "#16a34a";
  if (score >= 60) return "#ca8a04";
  return "#dc2626";
}

async function sendAuditReport({ to, orgName, score, grade, shareToken, topActions = [], delta = null }) {
  const appUrl   = APP_URL;
  const shareUrl = shareToken ? `${appUrl}/share/${shareToken}` : null;
  const color    = scoreColor(score);
  const gColor   = gradeColor(grade);

  const deltaHtml = delta !== null
    ? `<span style="font-size:13px;font-weight:700;color:${delta >= 0 ? "#16a34a" : "#dc2626"};margin-left:8px">${delta >= 0 ? "▲" : "▼"} ${Math.abs(delta)} pts</span>`
    : "";

  const actionsHtml = topActions.slice(0, 5).map((a, i) => {
    const pColor = { critical: "#dc2626", high: "#ea580c", medium: "#ca8a04", low: "#16a34a" }[a.priority] || "#6b7280";
    return `
      <tr>
        <td style="padding:10px 12px;color:#6b7280;font-size:13px;">${i + 1}</td>
        <td style="padding:10px 12px;">
          <span style="display:inline-block;padding:2px 8px;border-radius:99px;font-size:11px;font-weight:700;text-transform:uppercase;background:${pColor}22;color:${pColor};">${a.priority}</span>
        </td>
        <td style="padding:10px 12px;color:#374151;font-size:14px;">${a.action || a.text || ""}</td>
        <td style="padding:10px 12px;color:#9ca3af;font-size:12px;text-transform:capitalize;">${a.category || ""}</td>
      </tr>`;
  }).join("");

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#f0f4f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:600px;margin:32px auto;padding:0 16px;">

    <!-- Header -->
    <div style="background:linear-gradient(135deg,#1e3a5f 0%,#0070d2 100%);border-radius:16px 16px 0 0;padding:28px 32px;">
      <div style="color:white;font-size:22px;font-weight:800;letter-spacing:-0.5px;">SF<span style="color:#7dd3fc;">Health</span></div>
      <div style="color:rgba(255,255,255,0.7);font-size:13px;margin-top:4px;">Scheduled Org Health Report</div>
    </div>

    <!-- Score block -->
    <div style="background:white;padding:28px 32px;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb;">
      <div style="font-size:15px;font-weight:600;color:#374151;margin-bottom:20px;">${orgName}</div>
      <div style="display:flex;align-items:center;gap:20px;margin-bottom:24px;flex-wrap:wrap;">
        <div style="text-align:center;">
          <div style="font-size:64px;font-weight:900;color:${color};line-height:1;letter-spacing:-2px;">${score}</div>
          <div style="font-size:13px;color:#9ca3af;">out of 100</div>
        </div>
        <div>
          <div style="font-size:32px;font-weight:800;color:${gColor};">Grade ${grade}</div>
          ${deltaHtml}
          <div style="font-size:13px;color:#6b7280;margin-top:6px;">Health score as of ${new Date().toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"})}</div>
        </div>
      </div>

      ${topActions.length > 0 ? `
      <div style="font-size:14px;font-weight:700;color:#1a202c;margin-bottom:12px;">Top Recommended Actions</div>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead>
          <tr style="border-bottom:2px solid #f3f4f6;">
            <th style="text-align:left;padding:6px 12px;color:#9ca3af;font-size:11px;">#</th>
            <th style="text-align:left;padding:6px 12px;color:#9ca3af;font-size:11px;">PRIORITY</th>
            <th style="text-align:left;padding:6px 12px;color:#9ca3af;font-size:11px;">ACTION</th>
            <th style="text-align:left;padding:6px 12px;color:#9ca3af;font-size:11px;">CATEGORY</th>
          </tr>
        </thead>
        <tbody>${actionsHtml}</tbody>
      </table>` : '<div style="color:#16a34a;font-weight:600;font-size:14px;">No critical issues found — this org is in great health!</div>'}
    </div>

    <!-- CTA -->
    <div style="background:white;padding:0 32px 28px;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb;">
      <div style="display:flex;gap:12px;flex-wrap:wrap;">
        ${shareUrl ? `<a href="${shareUrl}" style="display:inline-block;padding:12px 24px;background:linear-gradient(135deg,#1e3a5f,#0070d2);color:white;border-radius:8px;font-size:14px;font-weight:700;text-decoration:none;">View Full Report</a>` : ""}
        <a href="${appUrl}/app" style="display:inline-block;padding:12px 24px;background:#f0f4f8;color:#1e3a5f;border-radius:8px;font-size:14px;font-weight:700;text-decoration:none;border:1px solid #e2e8f0;">Open Dashboard</a>
      </div>
    </div>

    <!-- Footer -->
    <div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:0 0 16px 16px;padding:16px 32px;text-align:center;">
      <div style="font-size:12px;color:#9ca3af;">SF Health Dashboard · Automated audit report</div>
      <div style="font-size:11px;color:#c4c9d4;margin-top:4px;">You're receiving this because you set up a scheduled audit. <a href="${appUrl}/app" style="color:#9ca3af;">Manage schedules</a></div>
    </div>

  </div>
</body>
</html>`;

  return getTransport().sendMail({
    from:    FROM,
    to,
    subject: `SF Health Report: ${orgName} scored ${score}/100 (${grade})`,
    html,
  });
}

module.exports = { sendAuditReport };
