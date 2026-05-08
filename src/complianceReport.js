/**
 * Compliance Report Generator
 * Produces audit-ready HTML reports for GDPR/DPDP, SOC 2, and ISV/AppExchange review.
 * All reports are designed to be opened in a browser and printed to PDF.
 */

// ─── Shared helpers ───────────────────────────────────────────────────────────

function escHtml(s) {
  return String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

function fmtDate(iso) {
  try { return new Date(iso).toLocaleDateString("en-US", { year:"numeric", month:"long", day:"numeric" }); }
  catch { return iso || "—"; }
}

function statusDot(pass) {
  const c = pass ? "#16a34a" : "#dc2626";
  const label = pass ? "Pass" : "Fail";
  return `<span style="display:inline-flex;align-items:center;gap:5px;font-weight:700;color:${c}">
    <svg width="10" height="10" viewBox="0 0 10 10"><circle cx="5" cy="5" r="5" fill="${c}"/></svg>${label}</span>`;
}

function statusBadge(pass, warnLabel) {
  if (pass === null || pass === undefined) return `<span style="color:#94a3b8;font-weight:600">N/A</span>`;
  if (pass === "warn") return `<span style="display:inline-flex;align-items:center;gap:5px;font-weight:700;color:#ca8a04">
    <svg width="10" height="10" viewBox="0 0 10 10"><circle cx="5" cy="5" r="5" fill="#ca8a04"/></svg>${warnLabel||"Warning"}</span>`;
  const c = pass ? "#16a34a" : "#dc2626";
  const label = pass ? "Pass" : "Fail";
  return `<span style="display:inline-flex;align-items:center;gap:5px;font-weight:700;color:${c}">
    <svg width="10" height="10" viewBox="0 0 10 10"><circle cx="5" cy="5" r="5" fill="${c}"/></svg>${label}</span>`;
}

function checkRow(label, pass, detail, recommendation) {
  const bg   = pass === true ? "#f0fdf4" : pass === false ? "#fef2f2" : "#fffbeb";
  const border = pass === true ? "#bbf7d0" : pass === false ? "#fecaca" : "#fde68a";
  const passVal = pass === "warn" ? "warn" : pass;
  return `<tr style="border-bottom:1px solid #f3f4f6;background:${bg}">
    <td style="padding:12px 14px;font-size:13px;font-weight:600;color:#0f172a;width:38%;border-left:3px solid ${border}">${escHtml(label)}</td>
    <td style="padding:12px 14px;font-size:13px;text-align:center;white-space:nowrap">${statusBadge(passVal)}</td>
    <td style="padding:12px 14px;font-size:13px;color:#374151">${escHtml(detail)}</td>
    <td style="padding:12px 14px;font-size:12px;color:#6b7280;font-style:italic">${recommendation ? escHtml(recommendation) : ""}</td>
  </tr>`;
}

function sectionHeader(title, icon, description) {
  return `<div style="margin:32px 0 16px">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
      <span style="font-size:20px">${icon}</span>
      <h2 style="font-size:17px;font-weight:800;color:#0f172a;margin:0">${escHtml(title)}</h2>
    </div>
    ${description ? `<p style="font-size:13px;color:#64748b;margin:0 0 10px 30px;line-height:1.5">${escHtml(description)}</p>` : ""}
    <table style="width:100%;border-collapse:collapse;border-radius:10px;overflow:hidden;border:1px solid #e2e8f0">
      <thead><tr style="background:#f8fafc">
        <th style="padding:9px 14px;font-size:11px;font-weight:700;color:#6b7280;text-align:left;text-transform:uppercase;letter-spacing:.05em;width:38%">Check</th>
        <th style="padding:9px 14px;font-size:11px;font-weight:700;color:#6b7280;text-align:center;text-transform:uppercase;letter-spacing:.05em;width:10%">Status</th>
        <th style="padding:9px 14px;font-size:11px;font-weight:700;color:#6b7280;text-align:left;text-transform:uppercase;letter-spacing:.05em">Finding</th>
        <th style="padding:9px 14px;font-size:11px;font-weight:700;color:#6b7280;text-align:left;text-transform:uppercase;letter-spacing:.05em;width:28%">Recommendation</th>
      </tr></thead>
      <tbody>`;
}

function closeSectionTable() { return `</tbody></table></div>`; }

function sharedPageHeader(orgName, orgId, reportTitle, subtitle, generatedAt) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>${escHtml(reportTitle)} — ${escHtml(orgName)}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f1f5f9;color:#0f172a;-webkit-font-smoothing:antialiased}
    .page{max-width:960px;margin:0 auto;padding:32px 24px 64px}
    @media print{
      body{background:white}
      .no-print{display:none!important}
      .page{padding:0}
      @page{margin:20mm 15mm}
    }
  </style>
</head>
<body>
<div class="page">

  <!-- Print button -->
  <div class="no-print" style="text-align:right;margin-bottom:16px">
    <button onclick="window.print()" style="padding:8px 20px;background:linear-gradient(135deg,#0a1628,#0070d2);color:white;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer">
      Print / Save as PDF
    </button>
  </div>

  <!-- Header -->
  <div style="background:linear-gradient(135deg,#0a1628 0%,#0070d2 100%);color:white;border-radius:14px;padding:32px 36px;margin-bottom:28px">
    <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;opacity:.6;margin-bottom:8px">SFHealth · Compliance Report</div>
    <h1 style="font-size:28px;font-weight:900;margin-bottom:6px;letter-spacing:-.5px">${escHtml(reportTitle)}</h1>
    <p style="font-size:15px;opacity:.8;margin-bottom:20px">${escHtml(subtitle)}</p>
    <div style="display:flex;flex-wrap:wrap;gap:24px;margin-top:4px;padding-top:20px;border-top:1px solid rgba(255,255,255,.15)">
      <div><div style="font-size:10px;text-transform:uppercase;letter-spacing:.08em;opacity:.5;margin-bottom:3px">Organisation</div><div style="font-size:14px;font-weight:700">${escHtml(orgName)}</div></div>
      <div><div style="font-size:10px;text-transform:uppercase;letter-spacing:.08em;opacity:.5;margin-bottom:3px">Org ID</div><div style="font-size:14px;font-weight:700">${escHtml(orgId)}</div></div>
      <div><div style="font-size:10px;text-transform:uppercase;letter-spacing:.08em;opacity:.5;margin-bottom:3px">Report Date</div><div style="font-size:14px;font-weight:700">${fmtDate(generatedAt)}</div></div>
      <div><div style="font-size:10px;text-transform:uppercase;letter-spacing:.08em;opacity:.5;margin-bottom:3px">Generated By</div><div style="font-size:14px;font-weight:700">SFHealth Automated Audit</div></div>
    </div>
  </div>`;
}

function summaryBanner(passes, fails, warns) {
  const total = passes + fails + warns;
  const pct   = total > 0 ? Math.round((passes / total) * 100) : 0;
  const col   = pct >= 80 ? "#16a34a" : pct >= 60 ? "#ca8a04" : "#dc2626";
  const bg    = pct >= 80 ? "#f0fdf4" : pct >= 60 ? "#fffbeb" : "#fef2f2";
  const border = pct >= 80 ? "#bbf7d0" : pct >= 60 ? "#fde68a" : "#fecaca";
  return `<div style="background:${bg};border:1.5px solid ${border};border-radius:12px;padding:20px 24px;margin-bottom:28px;display:flex;flex-wrap:wrap;align-items:center;gap:24px">
    <div style="text-align:center;min-width:80px">
      <div style="font-size:42px;font-weight:900;color:${col};line-height:1">${pct}%</div>
      <div style="font-size:12px;color:#64748b;margin-top:3px">Compliance</div>
    </div>
    <div style="display:flex;gap:16px;flex-wrap:wrap">
      <div style="text-align:center;background:white;border-radius:8px;padding:10px 18px;border:1px solid #e2e8f0">
        <div style="font-size:22px;font-weight:800;color:#16a34a">${passes}</div>
        <div style="font-size:11px;color:#64748b;margin-top:2px">Passed</div>
      </div>
      <div style="text-align:center;background:white;border-radius:8px;padding:10px 18px;border:1px solid #e2e8f0">
        <div style="font-size:22px;font-weight:800;color:#dc2626">${fails}</div>
        <div style="font-size:11px;color:#64748b;margin-top:2px">Failed</div>
      </div>
      ${warns > 0 ? `<div style="text-align:center;background:white;border-radius:8px;padding:10px 18px;border:1px solid #e2e8f0">
        <div style="font-size:22px;font-weight:800;color:#ca8a04">${warns}</div>
        <div style="font-size:11px;color:#64748b;margin-top:2px">Warnings</div>
      </div>` : ""}
    </div>
    <div style="flex:1;min-width:200px">
      <div style="height:10px;background:#e2e8f0;border-radius:99px;overflow:hidden">
        <div style="width:${pct}%;height:10px;background:${col};border-radius:99px"></div>
      </div>
      <div style="font-size:12px;color:#64748b;margin-top:6px">${passes} of ${total} checks passed</div>
    </div>
  </div>`;
}

function disclaimer(text) {
  return `<div style="margin-top:36px;padding:16px 20px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;font-size:12px;color:#64748b;line-height:1.6">
    <strong style="color:#374151">Disclaimer:</strong> ${escHtml(text)}
  </div>
  <div style="margin-top:16px;text-align:center;font-size:11px;color:#94a3b8">
    Generated by SFHealth Automated Audit · ${fmtDate(new Date().toISOString())} · Confidential
  </div>
  </div></body></html>`;
}

// ─── GDPR / DPDP Report ───────────────────────────────────────────────────────

function generateGdprReport(metadata, healthScore) {
  const sec  = metadata.security     || {};
  const dq   = metadata.dataQuality  || {};
  const ua   = metadata.userAdoption || {};
  const uf   = metadata.unusedFields || {};
  const auto = metadata.automation   || {};
  const org  = metadata;

  // ── Data Subject Access & Guest User ────────────────────────────────────────
  const noGuestAccess     = !sec.guestUserAccess;
  const modifyAllCount    = sec.profilesWithModifyAll || 0;
  const noModifyAllExcess = modifyAllCount <= 1;
  const mfaEnabled        = sec.mfaEnabled === true;

  // ── Data Retention signals ──────────────────────────────────────────────────
  const hasOwnerlessAccounts = (dq.accountsWithoutOwner || 0) > 0;
  const ownerlessCount       = dq.accountsWithoutOwner || 0;
  const nullEmailPct         = ((dq.nullEmailContactsPct || 0) * 100).toFixed(1);
  const lowNullEmail         = (dq.nullEmailContactsPct || 0) < 0.1;
  const duplicateRulesActive = !!dq.duplicateRulesEnabled;
  const unusedFieldCount     = uf.unusedFieldCount || 0;
  const lowUnusedFields      = unusedFieldCount < 20;

  // ── Active users / inactive ─────────────────────────────────────────────────
  const inactiveUserCount = Math.max(0, (ua.totalLicensedUsers || 0) - (ua.monthlyActiveUsers || 0));
  const inactivePct       = ua.totalLicensedUsers > 0 ? ((inactiveUserCount / ua.totalLicensedUsers) * 100).toFixed(0) : 0;
  const lowInactive       = inactiveUserCount < 5;

  // ── Password & session ──────────────────────────────────────────────────────
  const pwdStrong   = sec.passwordPolicyStrength === "strong";
  const pwdMedium   = sec.passwordPolicyStrength === "medium";

  // ── Score summary ───────────────────────────────────────────────────────────
  const checks = [
    noGuestAccess, noModifyAllExcess, mfaEnabled, !hasOwnerlessAccounts,
    lowNullEmail, duplicateRulesActive, lowUnusedFields, lowInactive,
    pwdStrong || pwdMedium,
  ];
  const passes = checks.filter(Boolean).length;
  const fails  = checks.filter(c => c === false).length;

  let html = sharedPageHeader(org.orgName, org.orgId,
    "GDPR & DPDP Readiness Report",
    "Data protection compliance assessment — Guest access, data retention, ownerless records, and data minimisation",
    org.collectedAt);

  html += summaryBanner(passes, fails, 0);

  // Section 1: Access Control
  html += sectionHeader("Access Control & Least Privilege", "🔐",
    "GDPR Article 5(1)(f) and DPDP Section 8 require personal data to be processed securely with appropriate access restrictions.");
  html += checkRow("Guest User Profiles",
    noGuestAccess,
    noGuestAccess ? "No guest user profiles found" : `${sec.guestProfiles?.length || "1+"} guest profile(s) exist — review object & field permissions`,
    noGuestAccess ? "" : "Audit each guest profile's FLS and object permissions. Remove access to any object containing personal data.");
  html += checkRow("Profiles with Modify All Data",
    noModifyAllExcess,
    `${modifyAllCount} profile(s) have Modify All Data` + (modifyAllCount > 0 ? `: ${(sec.profilesWithModifyAllNames || []).join(", ")}` : ""),
    modifyAllCount > 1 ? "Restrict Modify All to System Administrator only. Replace with granular object permissions on other profiles." : "");
  html += checkRow("Multi-Factor Authentication",
    mfaEnabled,
    mfaEnabled ? "MFA is enforced at org level" : "MFA enforcement not detected — users may authenticate with password only",
    mfaEnabled ? "" : "Enable MFA for all users via Setup → Identity → Multi-Factor Authentication. Required for all Salesforce orgs since Feb 2022.");
  html += checkRow("Password Policy Strength",
    pwdStrong ? true : pwdMedium ? "warn" : false,
    `Password policy: ${sec.passwordPolicyStrength || "unknown"}`,
    pwdStrong ? "" : "Set minimum password length to 12+, require complexity (uppercase, number, symbol), and set max age to 90 days.");
  html += closeSectionTable();

  // Section 2: Data Retention & Minimisation
  html += sectionHeader("Data Retention & Minimisation", "🗄️",
    "GDPR Article 5(1)(e) (storage limitation) and DPDP Section 8(7) require personal data not to be retained longer than necessary.");
  html += checkRow("Ownerless Account Records",
    !hasOwnerlessAccounts,
    hasOwnerlessAccounts ? `${ownerlessCount} Account records with no OwnerId — orphaned data with no accountability` : "No ownerless Account records found",
    hasOwnerlessAccounts ? "Assign a Data Owner to all records. Consider a batch job to reassign orphaned records to an archive user." : "");
  html += checkRow("Contact Email Completeness",
    lowNullEmail,
    `${nullEmailPct}% of Contact records have no email address`,
    lowNullEmail ? "" : "Contacts without email may indicate poor data capture. Review intake processes and required field validation.");
  html += checkRow("Duplicate Prevention Rules",
    duplicateRulesActive,
    duplicateRulesActive ? `${dq.activeDuplicateRules || 1} active duplicate rule(s)` : "No active duplicate rules — duplicate personal data records may exist",
    duplicateRulesActive ? "" : "Create Duplicate and Matching Rules on Contact, Lead, and Account to prevent duplicate personal records.");
  html += checkRow("Unused Custom Fields (Data Minimisation)",
    lowUnusedFields,
    `${unusedFieldCount} custom field(s) have no data across all records`,
    lowUnusedFields ? "" : "Remove or archive empty custom fields. Collecting fields for data you never use violates data minimisation principles.");
  html += checkRow("Inactive Licensed Users",
    lowInactive,
    `${inactiveUserCount} user(s) (${inactivePct}%) have not logged in during the past 30 days`,
    lowInactive ? "" : "Deactivate users who no longer need access. Inactive accounts with access to personal data represent an unnecessary risk.");
  html += closeSectionTable();

  // Section 3: Data Integrity
  html += sectionHeader("Data Integrity & Accuracy", "✅",
    "GDPR Article 5(1)(d) requires personal data to be accurate and kept up to date.");
  html += checkRow("Data Storage Usage",
    (dq.storageUsedPct || 0) < 0.85,
    `${dq.storageUsedMB || 0} MB used of ${dq.storageMaxMB || 0} MB (${((dq.storageUsedPct || 0)*100).toFixed(0)}%)`,
    (dq.storageUsedPct || 0) >= 0.85 ? "Review and archive old records. High storage usage may indicate data is retained beyond its useful life." : "");
  html += checkRow("Automation Governance",
    (auto.activeWorkflows || 0) === 0,
    auto.activeWorkflows > 0 ? `${auto.activeWorkflows} active Workflow Rule(s) — legacy automation may not respect data lifecycle` : "No active Workflow Rules",
    auto.activeWorkflows > 0 ? "Migrate Workflow Rules to Flow. Flows support explicit data lifecycle actions including record deletion." : "");
  html += closeSectionTable();

  // Unused fields list
  if ((uf.unusedFields || []).length > 0) {
    html += `<div style="margin-top:24px">
      <h3 style="font-size:14px;font-weight:700;color:#374151;margin-bottom:10px">Unused Custom Fields Detail (top 20)</h3>
      <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden">
        <thead><tr style="background:#f8fafc">
          <th style="padding:8px 12px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;text-align:left">Object</th>
          <th style="padding:8px 12px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;text-align:left">Field API Name</th>
          <th style="padding:8px 12px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;text-align:left">Label</th>
          <th style="padding:8px 12px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;text-align:left">Type</th>
        </tr></thead>
        <tbody>
          ${(uf.unusedFields || []).slice(0,20).map(f => `<tr style="border-bottom:1px solid #f3f4f6">
            <td style="padding:8px 12px;font-size:13px;font-weight:600">${escHtml(f.object)}</td>
            <td style="padding:8px 12px;font-size:12px;font-family:monospace;color:#0070d2">${escHtml(f.fieldName)}</td>
            <td style="padding:8px 12px;font-size:13px">${escHtml(f.fieldLabel)}</td>
            <td style="padding:8px 12px;font-size:12px;color:#94a3b8">${escHtml(f.fieldType)}</td>
          </tr>`).join("")}
        </tbody>
      </table>
    </div>`;
  }

  html += disclaimer(
    "This report is generated from automated metadata analysis of your Salesforce org and is intended as a starting point for compliance review, not a legal opinion. " +
    "For formal GDPR or DPDP compliance assessment, consult a qualified data protection professional. " +
    "SFHealth has read-only access and cannot verify data contents, contractual obligations, or processes outside Salesforce."
  );
  return html;
}

// ─── SOC 2 Readiness Report ───────────────────────────────────────────────────

function generateSoc2Report(metadata, healthScore) {
  const sec  = metadata.security     || {};
  const cq   = metadata.codeQuality  || {};
  const ua   = metadata.userAdoption || {};
  const pm   = metadata.proactiveMonitoring || {};
  const api  = metadata.apiUsage     || {};
  const auto = metadata.automation   || {};
  const td   = metadata.techDebt     || {};
  const org  = metadata;

  const mfaEnabled         = sec.mfaEnabled === true;
  const pwdStrong          = sec.passwordPolicyStrength === "strong";
  const pwdOk              = sec.passwordPolicyStrength !== "weak";
  const modifyAllCount     = sec.profilesWithModifyAll || 0;
  const noModifyAllExcess  = modifyAllCount <= 1;
  const noGuestAccess      = !sec.guestUserAccess;
  const goodCoverage       = (cq.testCoveragePct || 0) >= 75;
  const coveragePct        = ((cq.testCoveragePct || 0) * 100).toFixed(0);
  const noHardcodedIds     = (cq.hardcodedIdCount || 0) === 0;
  const lowLoginFailures   = (pm.errors?.loginFailures7d?.count || 0) < 50;
  const loginFailureCount  = pm.errors?.loginFailures7d?.count || 0;
  const noAsyncErrors      = (pm.errors?.asyncApexErrors7d?.count || 0) < 5;
  const asyncErrorCount    = pm.errors?.asyncApexErrors7d?.count || 0;
  const apiUnder80         = (api.dailyApiUsedPct || 0) < 0.80;
  const apiPct             = ((api.dailyApiUsedPct || 0) * 100).toFixed(0);
  const noStaleApex        = (td.staleApiVersionClasses || 0) === 0;
  const staleCount         = td.staleApiVersionClasses || 0;
  const activeUsers        = ua.monthlyActiveUsers || 0;
  const totalUsers         = ua.totalLicensedUsers || 1;
  const goodAdoption       = activeUsers / totalUsers >= 0.5;
  const noActivePB         = (auto.activeProcessBuilders || 0) === 0;

  const allChecks = [
    mfaEnabled, pwdOk, noModifyAllExcess, noGuestAccess,
    goodCoverage, noHardcodedIds, lowLoginFailures, noAsyncErrors,
    apiUnder80, noStaleApex, goodAdoption, noActivePB,
  ];
  const passes = allChecks.filter(Boolean).length;
  const fails  = allChecks.filter(c => c === false).length;

  let html = sharedPageHeader(org.orgName, org.orgId,
    "SOC 2 Readiness Checklist",
    "Trust Service Criteria — Security, Availability, and Processing Integrity assessment for Salesforce environment",
    org.collectedAt);

  html += summaryBanner(passes, fails, 0);

  // CC6 — Logical Access Controls
  html += sectionHeader("CC6 · Logical and Physical Access Controls", "🔐",
    "SOC 2 CC6.1–CC6.3: Access to information assets is restricted to authorised individuals.");
  html += checkRow("Multi-Factor Authentication (CC6.1)",
    mfaEnabled,
    mfaEnabled ? "MFA enforced at org level" : "MFA not detected — single-factor authentication is a SOC 2 finding",
    mfaEnabled ? "" : "Enable MFA for all users. This is a must-have for SOC 2 Type II.");
  html += checkRow("Password Policy (CC6.1)",
    pwdStrong ? true : pwdOk ? "warn" : false,
    `Current strength: ${sec.passwordPolicyStrength || "unknown"}`,
    pwdStrong ? "" : "Set min length ≥ 12 chars with complexity. Enable account lockout after 5 failed attempts.");
  html += checkRow("Least-Privilege Access (CC6.3)",
    noModifyAllExcess,
    `${modifyAllCount} profile(s) have Modify All Data${modifyAllCount > 1 ? ": " + (sec.profilesWithModifyAllNames||[]).slice(0,3).join(", ") : ""}`,
    modifyAllCount > 1 ? "Restrict Modify All to System Administrator. Document exceptions in your access control policy." : "");
  html += checkRow("Guest User Exposure (CC6.2)",
    noGuestAccess,
    noGuestAccess ? "No guest user profiles" : "Guest profiles found — document what data is accessible without authentication",
    noGuestAccess ? "" : "Review and restrict guest profile permissions. Ensure no sensitive objects are accessible to unauthenticated users.");
  html += closeSectionTable();

  // CC7 — System Operations
  html += sectionHeader("CC7 · System Operations & Monitoring", "📊",
    "SOC 2 CC7.1–CC7.4: The entity monitors system components for anomalies and failures.");
  html += checkRow("Login Failure Rate (CC7.2)",
    lowLoginFailures,
    `${loginFailureCount} login failures in last 7 days`,
    lowLoginFailures ? "" : "High login failures indicate brute-force attempts or broken integrations. Review Login History and enforce account lockout.");
  html += checkRow("Async Apex Error Rate (CC7.3)",
    noAsyncErrors,
    `${asyncErrorCount} async Apex failures in last 7 days`,
    noAsyncErrors ? "" : "Investigate and fix failing batch/queueable jobs. Persistent async errors indicate unhandled exceptions.");
  html += checkRow("API Limit Headroom (CC7.4)",
    apiUnder80,
    `${apiPct}% of daily API limit consumed`,
    apiUnder80 ? "" : "API limit proximity is a service availability risk. Implement API caching and review integration polling patterns.");
  html += closeSectionTable();

  // CC8 — Change Management
  html += sectionHeader("CC8 · Change Management", "🔄",
    "SOC 2 CC8.1: Changes to infrastructure, data, and software are authorised, tested, and documented.");
  html += checkRow("Apex Test Coverage (CC8.1)",
    goodCoverage,
    `Org-wide Apex test coverage: ${coveragePct}%`,
    goodCoverage ? "" : "Below 75% coverage blocks Salesforce deployments. Write tests to cover all critical business logic.");
  html += checkRow("No Hardcoded IDs in Apex (CC8.1)",
    noHardcodedIds,
    noHardcodedIds ? "No hardcoded Salesforce IDs detected" : `${cq.hardcodedIdCount || "Some"} Apex class(es) contain hardcoded record IDs`,
    noHardcodedIds ? "" : "Hardcoded IDs break across environments. Replace with Custom Labels, Custom Metadata, or dynamic SOQL lookups.");
  html += checkRow("No Deprecated Automation (CC8.1)",
    noActivePB,
    noActivePB ? "No active Process Builders" : `${auto.activeProcessBuilders || "Some"} active Process Builder(s) — deprecated and unsupported`,
    noActivePB ? "" : "Migrate Process Builders to Flow before Salesforce removes support. Document the migration in your change log.");
  html += checkRow("Stale API Versions (CC8.1)",
    noStaleApex,
    noStaleApex ? "All Apex on current API versions" : `${staleCount} Apex class(es) on API version 3+ releases behind`,
    noStaleApex ? "" : "Update Apex API versions to stay within Salesforce supported range. Stale versions miss security patches.");
  html += closeSectionTable();

  // A1 — Availability
  html += sectionHeader("A1 · Availability", "⚡",
    "SOC 2 A1.2: The entity monitors the availability of the system.");
  html += checkRow("User Adoption / Active Sessions (A1.1)",
    goodAdoption,
    `${activeUsers} of ${totalUsers} licensed users active in last 30 days (${((activeUsers/totalUsers)*100).toFixed(0)}%)`,
    goodAdoption ? "" : "Low adoption may indicate system reliability issues. Survey users and review error logs.");
  html += closeSectionTable();

  // Evidence checklist (non-automated)
  html += `<div style="margin-top:28px;background:#fffbeb;border:1.5px solid #fde68a;border-radius:12px;padding:20px 24px">
    <div style="font-size:14px;font-weight:800;color:#92400e;margin-bottom:12px">📋 Manual Evidence Required (Not Automatable)</div>
    <div style="font-size:13px;color:#78350f;line-height:1.6">The following SOC 2 controls require manual documentation and cannot be verified by automated metadata scanning:</div>
    <ul style="margin-top:10px;padding-left:20px;font-size:13px;color:#78350f;line-height:1.8">
      <li>Written Information Security Policy (WISP)</li>
      <li>Background checks for employees with system access</li>
      <li>Vendor risk management programme and contracts</li>
      <li>Incident response plan with documented test exercises</li>
      <li>Access review evidence (quarterly or semi-annual certification)</li>
      <li>Change management approval records (CAB meeting minutes or Jira tickets)</li>
      <li>Business continuity / disaster recovery plan and test results</li>
      <li>Security awareness training completion records</li>
    </ul>
  </div>`;

  html += disclaimer(
    "This SOC 2 readiness checklist is generated from automated analysis of Salesforce metadata. " +
    "It covers Trust Service Criteria CC6, CC7, CC8, and A1 as they relate to Salesforce configuration. " +
    "A formal SOC 2 audit requires examination of your entire control environment by a licensed CPA firm (AICPA). " +
    "This report does not constitute a SOC 2 opinion or readiness certification."
  );
  return html;
}

// ─── ISV / AppExchange Security Review ───────────────────────────────────────

function generateIsvReport(metadata, healthScore) {
  const sec  = metadata.security     || {};
  const cq   = metadata.codeQuality  || {};
  const api  = metadata.apiUsage     || {};
  const auto = metadata.automation   || {};
  const td   = metadata.techDebt     || {};
  const pm   = metadata.proactiveMonitoring || {};
  const org  = metadata;

  // ISV-specific checks based on Salesforce AppExchange Security Review requirements
  const noHardcodedIds      = (cq.hardcodedIdCount || 0) === 0;
  const goodCoverage        = (cq.testCoveragePct || 0) >= 75;
  const coveragePct         = ((cq.testCoveragePct || 0) * 100).toFixed(0);
  const noInactiveTriggers  = (cq.inactiveTriggers || 0) === 0;
  const noStaleApex         = (td.staleApiVersionClasses || 0) === 0;
  const staleCount          = td.staleApiVersionClasses || 0;
  const noLegacyVF          = (td.legacyVFPages || 0) === 0;
  const legacyVFCount       = td.legacyVFPages || 0;
  const mfaEnabled          = sec.mfaEnabled === true;
  const noGuestAccess       = !sec.guestUserAccess;
  const noModifyAllExcess   = (sec.profilesWithModifyAll || 0) <= 1;
  const pwdOk               = sec.passwordPolicyStrength !== "weak";
  const apiHealthy          = (api.dailyApiUsedPct || 0) < 0.8;
  const noAsyncErrors       = (pm.errors?.asyncApexErrors7d?.count || 0) < 5;
  const lowCalloutErrors    = (pm.errors?.calloutErrors7d?.count || 0) < 5;

  const allChecks = [
    noHardcodedIds, goodCoverage, noInactiveTriggers, noStaleApex,
    noLegacyVF, mfaEnabled, noGuestAccess, noModifyAllExcess,
    pwdOk, apiHealthy, noAsyncErrors, lowCalloutErrors,
  ];
  const passes = allChecks.filter(Boolean).length;
  const fails  = allChecks.filter(c => c === false).length;

  let html = sharedPageHeader(org.orgName, org.orgId,
    "ISV / AppExchange Security Review",
    "Pre-submission security self-assessment aligned with Salesforce AppExchange Security Review requirements",
    org.collectedAt);

  html += summaryBanner(passes, fails, 0);

  // Code Security
  html += sectionHeader("Code Security", "💻",
    "Salesforce Security Review evaluates Apex, Visualforce, and Lightning code for common vulnerabilities.");
  html += checkRow("No Hardcoded Record IDs",
    noHardcodedIds,
    noHardcodedIds ? "No hardcoded IDs detected in Apex classes" : `${cq.hardcodedIdCount || "Some"} Apex class(es) contain hardcoded Salesforce IDs`,
    noHardcodedIds ? "" : "Replace hardcoded IDs with Custom Labels, Custom Metadata Types, or dynamic SOQL. This is a mandatory fix for AppExchange.");
  html += checkRow("Apex Test Coverage ≥ 75%",
    goodCoverage,
    `Org-wide coverage: ${coveragePct}% (requirement: 75%)`,
    goodCoverage ? "" : "Increase test coverage before submission. Security Review will reject packages with low coverage.");
  html += checkRow("No Inactive Triggers",
    noInactiveTriggers,
    noInactiveTriggers ? "All triggers are active" : `${cq.inactiveTriggers || "Some"} inactive trigger(s) found`,
    noInactiveTriggers ? "" : "Remove or activate inactive triggers. Dead code in a package is flagged in security review.");
  html += checkRow("Apex API Version Currency",
    noStaleApex,
    noStaleApex ? "All Apex on supported API versions" : `${staleCount} Apex class(es) are 3+ API versions behind`,
    noStaleApex ? "" : "Update all Apex to within 3 API versions of current. Stale API versions may use deprecated security features.");
  html += checkRow("No Legacy Visualforce Pages",
    noLegacyVF,
    noLegacyVF ? "No legacy Visualforce pages detected" : `${legacyVFCount} VF page(s) on very old API versions (10+ behind)`,
    noLegacyVF ? "" : "Update or migrate legacy VF pages. Old API versions miss XSS and CSRF protections added in newer versions.");
  html += closeSectionTable();

  // Access & Authentication
  html += sectionHeader("Access Control & Authentication", "🔐",
    "Applications submitted to AppExchange must not rely on or expose excessive permissions.");
  html += checkRow("MFA Enforced",
    mfaEnabled,
    mfaEnabled ? "MFA is enforced" : "MFA not detected on this org",
    mfaEnabled ? "" : "Enable MFA. Salesforce requires MFA for all orgs including developer orgs used for security review.");
  html += checkRow("No Guest User Over-Permission",
    noGuestAccess,
    noGuestAccess ? "No guest profiles found" : "Guest user profile(s) exist — ensure no packaged objects expose data to unauthenticated users",
    noGuestAccess ? "" : "Review all objects your package includes. Ensure guest profiles cannot access packaged data without authentication.");
  html += checkRow("Minimal Admin Permissions",
    noModifyAllExcess,
    `${sec.profilesWithModifyAll || 0} profile(s) with Modify All Data`,
    noModifyAllExcess ? "" : "Your package's permission sets should use minimal permissions. Avoid requiring Modify All in your install instructions.");
  html += checkRow("Strong Password Policy",
    pwdOk,
    `Password policy strength: ${sec.passwordPolicyStrength || "unknown"}`,
    pwdOk ? "" : "Enforce strong passwords in your dev org. Weak password policies are flagged in ISV security reviews.");
  html += closeSectionTable();

  // Reliability & Integration
  html += sectionHeader("Integration & Reliability", "🔗",
    "AppExchange apps must handle errors gracefully and not consume excessive org resources.");
  html += checkRow("API Limit Safety",
    apiHealthy,
    `Daily API usage: ${((api.dailyApiUsedPct||0)*100).toFixed(0)}%`,
    apiHealthy ? "" : "Your app may be consuming too many API calls. Implement caching, use Bulk API for large datasets, and add backoff logic.");
  html += checkRow("Async Apex Error Rate",
    noAsyncErrors,
    `${pm.errors?.asyncApexErrors7d?.count || 0} async Apex failures in last 7 days`,
    noAsyncErrors ? "" : "Unhandled async failures will cause issues in customer orgs. Implement proper exception handling and retry logic.");
  html += checkRow("Callout Error Rate",
    lowCalloutErrors,
    `${pm.errors?.calloutErrors7d?.count || 0} callout failures in last 7 days`,
    lowCalloutErrors ? "" : "Callout failures suggest fragile integrations. Implement Named Credentials for auth and add proper error handling.");
  html += closeSectionTable();

  // Pre-submission checklist
  html += `<div style="margin-top:28px;background:#eff6ff;border:1.5px solid #bfdbfe;border-radius:12px;padding:20px 24px">
    <div style="font-size:14px;font-weight:800;color:#1e40af;margin-bottom:12px">📋 Pre-Submission Checklist (Manual Steps)</div>
    <ul style="padding-left:20px;font-size:13px;color:#1e3a5f;line-height:1.8">
      <li>Run the <a href="https://security.secure.force.com/security/tools/forcecom/scanner" style="color:#0070d2">Salesforce Code Analyzer</a> (PMD) and resolve all Critical findings</li>
      <li>Complete the <a href="https://appexchange.salesforce.com/security" style="color:#0070d2">AppExchange Security Review checklist</a> in the Partner Community</li>
      <li>Ensure all Named Credentials are used for external callouts (no hardcoded endpoints)</li>
      <li>Verify CRUD/FLS is checked before all DML operations in Apex</li>
      <li>Confirm no SOQL injection risks (use bind variables, not string concatenation)</li>
      <li>Test your package in a fresh Developer Edition org, not your production org</li>
      <li>Provide a test script document with admin credentials for the review team</li>
      <li>Review all LWC components for XSS vulnerabilities (no <code>innerHTML</code> with unescaped data)</li>
    </ul>
  </div>`;

  // Apex classes list for review
  if ((td.allApexClassNames || []).length > 0) {
    html += `<div style="margin-top:24px">
      <h3 style="font-size:14px;font-weight:700;color:#374151;margin-bottom:10px">Apex Classes in Scope (${td.allApexClassNames.length})</h3>
      <div style="display:flex;flex-wrap:wrap;gap:6px">
        ${td.allApexClassNames.slice(0,60).map(c => `<code style="background:#f1f5f9;border:1px solid #e2e8f0;border-radius:4px;padding:2px 8px;font-size:12px;color:#0070d2">${escHtml(c.name)}</code>`).join("")}
        ${td.allApexClassNames.length > 60 ? `<span style="font-size:12px;color:#94a3b8;align-self:center">+${td.allApexClassNames.length - 60} more</span>` : ""}
      </div>
    </div>`;
  }

  html += disclaimer(
    "This report is a self-assessment tool to help ISVs prepare for the Salesforce AppExchange Security Review. " +
    "It is not a substitute for the official Salesforce Partner Security Review process. " +
    "Passing all automated checks in this report does not guarantee AppExchange approval. " +
    "Refer to the official Salesforce ISV Security Review documentation for current requirements."
  );
  return html;
}

// ─── Entry point ─────────────────────────────────────────────────────────────

function generateComplianceReport(type, metadata, healthScore) {
  switch (type) {
    case "gdpr":  return generateGdprReport(metadata, healthScore);
    case "soc2":  return generateSoc2Report(metadata, healthScore);
    case "isv":   return generateIsvReport(metadata, healthScore);
    default: throw new Error(`Unknown compliance report type: ${type}`);
  }
}

module.exports = { generateComplianceReport };
