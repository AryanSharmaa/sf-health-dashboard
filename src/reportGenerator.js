/**
 * Report Generator
 * Produces an HTML report and a plain-JSON summary from a health score result.
 */

function priorityColor(priority) {
  return { critical: "#dc2626", high: "#ea580c", medium: "#ca8a04", low: "#16a34a" }[priority] || "#6b7280";
}

function scoreColor(score) {
  if (score >= 80) return "#16a34a";
  if (score >= 60) return "#ca8a04";
  return "#dc2626";
}

function gradeColor(grade) {
  return { A: "#16a34a", B: "#65a30d", C: "#ca8a04", D: "#ea580c", F: "#dc2626" }[grade] || "#6b7280";
}

function gaugeArc(score) {
  const pct = score / 100;
  const r = 54;
  const circ = Math.PI * r;
  const dash = pct * circ;
  return { dash: dash.toFixed(1), gap: (circ - dash).toFixed(1), circ: circ.toFixed(1) };
}

function categoryRow(name, cat) {
  const label = {
    automation: "Automation",
    security: "Security",
    dataQuality: "Data Quality",
    apiUsage: "API & Limits",
    codeQuality: "Code Quality",
    userAdoption: "User Adoption",
  }[name] || name;

  const color = scoreColor(cat.score);
  const barWidth = cat.score;

  return `
    <tr>
      <td style="padding:10px 12px;font-weight:500;color:#374151;">${label}</td>
      <td style="padding:10px 12px;">
        <div style="background:#e5e7eb;border-radius:99px;height:10px;width:180px;">
          <div style="background:${color};width:${barWidth}%;height:10px;border-radius:99px;"></div>
        </div>
      </td>
      <td style="padding:10px 12px;font-weight:700;color:${color};text-align:right;">${cat.score}</td>
      <td style="padding:10px 12px;color:#6b7280;text-align:right;">${cat.weight}%</td>
      <td style="padding:10px 12px;color:#6b7280;text-align:right;">${cat.issueCount} issue${cat.issueCount !== 1 ? "s" : ""}</td>
    </tr>`;
}

function actionRow(action, i) {
  const color = priorityColor(action.priority);
  return `
    <tr style="border-bottom:1px solid #f3f4f6;">
      <td style="padding:12px;color:#6b7280;font-size:13px;">${i + 1}</td>
      <td style="padding:12px;">
        <span style="display:inline-block;padding:2px 8px;border-radius:99px;font-size:11px;font-weight:700;text-transform:uppercase;background:${color}22;color:${color};">
          ${action.priority}
        </span>
      </td>
      <td style="padding:12px;color:#374151;font-size:14px;">${action.action}</td>
      <td style="padding:12px;color:#9ca3af;font-size:12px;text-transform:capitalize;">${action.category}</td>
    </tr>`;
}

function generateHTML(healthScore, metadata = {}) {
  const { overallScore, grade, categories, top5RecommendedActions, orgName, orgId, generatedAt,
          orgProfile, isPartial, partialModules, benchmark } = healthScore;
  const arc = gaugeArc(overallScore);
  const color = scoreColor(overallScore);
  const gColor = gradeColor(grade);
  const unusedCount = metadata?.unusedFields?.unusedFieldCount || 0;
  const techDebt = metadata?.techDebt || {};

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>SF Org Health — ${orgName}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f9fafb; color: #111827; }
    .header { background: linear-gradient(135deg, #1e3a5f 0%, #0070d2 100%); color: white; padding: 32px 48px; }
    .header h1 { font-size: 28px; font-weight: 700; }
    .header p { opacity: 0.8; font-size: 14px; margin-top: 4px; }
    .container { max-width: 960px; margin: 32px auto; padding: 0 24px; }
    .card { background: white; border-radius: 12px; box-shadow: 0 1px 4px rgba(0,0,0,0.08); padding: 28px; margin-bottom: 24px; }
    .card h2 { font-size: 17px; font-weight: 700; color: #111827; margin-bottom: 20px; border-bottom: 1px solid #f3f4f6; padding-bottom: 12px; }
    .summary-grid { display: grid; grid-template-columns: auto 1fr; gap: 32px; align-items: center; }
    .gauge-wrap { text-align: center; }
    .gauge-score { font-size: 48px; font-weight: 800; color: ${color}; margin-top: -70px; display: block; }
    .gauge-grade { font-size: 22px; font-weight: 700; color: ${gColor}; }
    .gauge-label { font-size: 12px; color: #6b7280; margin-top: 4px; }
    .meta-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-top: 16px; }
    .meta-item { background: #f9fafb; border-radius: 8px; padding: 14px 16px; }
    .meta-item .val { font-size: 22px; font-weight: 700; color: #111827; }
    .meta-item .lbl { font-size: 12px; color: #6b7280; margin-top: 2px; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; padding: 8px 12px; border-bottom: 2px solid #f3f4f6; }
    tr:hover td { background: #f9fafb; }
    .footer { text-align: center; color: #9ca3af; font-size: 12px; padding: 32px 0 48px; }
    .badge { display: inline-block; padding: 3px 10px; border-radius: 99px; font-size: 12px; font-weight: 600; }
    @media print { body { background: white; } .header { -webkit-print-color-adjust: exact; } }
  </style>
</head>
<body>
  <div class="header">
    <h1>Salesforce Org Health Dashboard</h1>
    <p>${orgName} &nbsp;·&nbsp; ${orgId} &nbsp;·&nbsp; Generated ${new Date(generatedAt).toLocaleString()}</p>
  </div>

  <div class="container">

    ${isPartial ? `
    <div style="background:#fef9c3;border:1px solid #fde047;border-radius:10px;padding:14px 18px;margin-bottom:20px;font-size:14px;color:#713f12;">
      <strong>⚠ Partial scan</strong> — some modules returned incomplete data. Score may be lower than actual.
      Affected: ${(partialModules || []).map(m => `<strong>${m.module}</strong>`).join(", ")}.
    </div>` : ""}

    <!-- Overall Score -->
    <div class="card">
      <h2>Overall Health Score
        <span style="font-size:12px;font-weight:500;color:#6b7280;margin-left:10px;background:#f3f4f6;padding:3px 10px;border-radius:99px;">${orgProfile?.label || "Standard"}</span>
        ${isPartial ? `<span style="font-size:12px;font-weight:600;color:#92400e;margin-left:6px;background:#fef9c3;padding:3px 10px;border-radius:99px;">Partial</span>` : ""}
      </h2>
      <div class="summary-grid">
        <div class="gauge-wrap">
          <svg width="140" height="100" viewBox="0 0 140 80">
            <path d="M 14 74 A 56 56 0 0 1 126 74" fill="none" stroke="#e5e7eb" stroke-width="12" stroke-linecap="round"/>
            <path d="M 14 74 A 56 56 0 0 1 126 74" fill="none" stroke="${color}" stroke-width="12"
              stroke-linecap="round"
              stroke-dasharray="${arc.dash} ${arc.gap}"
              stroke-dashoffset="0"
              pathLength="${arc.circ}"/>
          </svg>
          <span class="gauge-score">${overallScore}</span>
          <span class="gauge-grade">${grade}</span>
          <div class="gauge-label">out of 100</div>
          ${benchmark ? `<div style="font-size:11px;color:#6b7280;margin-top:6px;">Top ${100 - benchmark.percentile}%</div>` : ""}
        </div>
        <div>
          <div class="meta-grid">
            <div class="meta-item">
              <div class="val">${top5RecommendedActions.filter(a => a.priority === "critical").length}</div>
              <div class="lbl">Critical Issues</div>
            </div>
            <div class="meta-item">
              <div class="val">${top5RecommendedActions.filter(a => a.priority === "high").length}</div>
              <div class="lbl">High Issues</div>
            </div>
            <div class="meta-item">
              <div class="val">${unusedCount}</div>
              <div class="lbl">Unused Fields</div>
            </div>
            <div class="meta-item">
              <div class="val">${techDebt.totalApexClasses || "—"}</div>
              <div class="lbl">Apex Classes</div>
            </div>
            <div class="meta-item">
              <div class="val">${techDebt.staleApiVersionClasses || "—"}</div>
              <div class="lbl">Stale API Classes</div>
            </div>
            <div class="meta-item">
              <div class="val">${techDebt.totalVFPages || "—"}</div>
              <div class="lbl">VF Pages</div>
            </div>
          </div>
          ${benchmark ? `
          <div style="background:#eff6ff;border-radius:8px;padding:12px 16px;margin-top:16px;border:1px solid #bfdbfe;">
            <div style="font-size:12px;font-weight:600;color:#1e40af;margin-bottom:6px;">Benchmark</div>
            <div style="font-size:13px;color:#1e3a5f;">${benchmark.message}</div>
            <div style="background:#dbeafe;border-radius:99px;height:8px;margin-top:8px;">
              <div style="background:#2563eb;width:${benchmark.percentile}%;height:8px;border-radius:99px;"></div>
            </div>
          </div>` : ""}
        </div>
      </div>
    </div>

    <!-- Category Scores -->
    <div class="card">
      <h2>Category Breakdown</h2>
      <table>
        <thead>
          <tr>
            <th>Category</th>
            <th>Score</th>
            <th style="text-align:right;">Points</th>
            <th style="text-align:right;">Weight</th>
            <th style="text-align:right;">Issues</th>
          </tr>
        </thead>
        <tbody>
          ${Object.entries(categories).map(([k, v]) => categoryRow(k, v)).join("")}
        </tbody>
      </table>
    </div>

    <!-- Top 5 Actions -->
    <div class="card">
      <h2>Top ${top5RecommendedActions.length} Recommended Actions</h2>
      ${top5RecommendedActions.length === 0
        ? '<p style="color:#16a34a;font-weight:600;">No issues found — this org is in excellent health!</p>'
        : `<table>
            <thead>
              <tr>
                <th>#</th><th>Priority</th><th>Action</th><th>Category</th>
              </tr>
            </thead>
            <tbody>
              ${top5RecommendedActions.map((a, i) => actionRow(a, i)).join("")}
            </tbody>
          </table>`
      }
    </div>

    ${unusedCount > 0 ? `
    <!-- Unused Fields -->
    <div class="card">
      <h2>Unused Custom Fields (${unusedCount} found)</h2>
      <table>
        <thead><tr><th>Object</th><th>Field API Name</th><th>Label</th><th>Type</th></tr></thead>
        <tbody>
          ${(metadata.unusedFields?.unusedFields || []).slice(0, 20).map(f => `
            <tr style="border-bottom:1px solid #f3f4f6;">
              <td style="padding:10px 12px;font-weight:500;">${f.object}</td>
              <td style="padding:10px 12px;font-family:monospace;font-size:13px;color:#6b7280;">${f.fieldName}</td>
              <td style="padding:10px 12px;">${f.fieldLabel}</td>
              <td style="padding:10px 12px;color:#9ca3af;">${f.fieldType}</td>
            </tr>`).join("")}
        </tbody>
      </table>
    </div>` : ""}

  </div>

  <div class="footer">
    Generated by SF Org Health Dashboard &nbsp;·&nbsp; ${new Date(generatedAt).toUTCString()}
  </div>
</body>
</html>`;
}

function generateJSON(healthScore, metadata = {}) {
  const cq = metadata?.codeQuality  || {};
  const au = metadata?.automation   || {};
  const sc = metadata?.security     || {};

  return {
    ...healthScore,
    metadata: {
      unusedFields:        metadata?.unusedFields        || {},
      techDebt: {
        ...(metadata?.techDebt || {}),
        allApexClassNames: metadata?.techDebt?.allApexClassNames || [],
        allVFPageNames:    metadata?.techDebt?.allVFPageNames    || [],
      },
      governorLimits:      metadata?.apiUsage?.governorLimits || {},
      proactiveMonitoring: metadata?.proactiveMonitoring || {},
      // Name lists for drilldowns
      codeQuality: {
        hardcodedIdClassNames: cq.hardcodedIdClassNames   || [],
        classesNoTestNames:    cq.classesNoTestNames      || [],
        inactiveTriggerNames:  cq.inactiveTriggerNames    || [],
      },
      automation: {
        inactiveFlows: (au.flows || [])
          .filter(f => !f.isActive)
          .map(f => ({ name: f.label || f.apiName }))
          .slice(0, 50),
        activeWorkflowNames: [],   // collector returns count only; names not queried
        activeProcessBuilderNames: [],
      },
      security: {
        profilesWithModifyAllNames: sc.profilesWithModifyAllNames || [],
      },
    },
  };
}

function generateConsultingHTML(healthScore, metadata = {}, brandName = "SF HEALTH") {
  const { overallScore, grade, categories, top5RecommendedActions, orgName, generatedAt } = healthScore;
  const arc    = gaugeArc(overallScore);
  const color  = scoreColor(overallScore);
  const gColor = gradeColor(grade);
  const critCount = top5RecommendedActions.filter(a => a.priority === "critical").length;
  const highCount = top5RecommendedActions.filter(a => a.priority === "high").length;
  const auditDate = generatedAt ? new Date(generatedAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) : new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  const execSentences = [
    `Your Salesforce org scored <strong>${overallScore} out of 100</strong>, earning a grade of <strong style="color:${gColor}">${grade}</strong>.`,
    critCount > 0
      ? `There ${critCount === 1 ? "is" : "are"} <strong>${critCount} critical issue${critCount !== 1 ? "s" : ""}</strong> that require immediate attention to prevent business risk.`
      : "No critical issues were detected.",
    highCount > 0
      ? `Additionally, ${highCount} high-priority item${highCount !== 1 ? "s" : ""} ${highCount === 1 ? "was" : "were"} identified that should be addressed in the near term.`
      : "",
    overallScore >= 80
      ? "Overall this org is in good health, but continued monitoring is recommended."
      : overallScore >= 60
        ? "This org requires attention in several areas to reach a healthy baseline."
        : "Significant remediation work is needed to bring this org to an acceptable health level.",
  ].filter(Boolean).join(" ");

  const catRows = Object.entries(categories).map(([k, v]) => {
    const label = { automation:"Automation", security:"Security", dataQuality:"Data Quality", apiUsage:"API & Limits", codeQuality:"Code Quality", userAdoption:"User Adoption" }[k] || k;
    const c = scoreColor(v.score);
    return `<tr>
      <td style="padding:9px 12px;font-weight:500;color:#374151">${label}</td>
      <td style="padding:9px 12px">
        <div style="background:#e5e7eb;border-radius:99px;height:9px;width:160px">
          <div style="background:${c};width:${v.score}%;height:9px;border-radius:99px"></div>
        </div>
      </td>
      <td style="padding:9px 12px;font-weight:700;color:${c};text-align:right">${v.score}</td>
      <td style="padding:9px 12px;color:#6b7280;text-align:right">${v.issueCount} issue${v.issueCount !== 1 ? "s" : ""}</td>
    </tr>`;
  }).join("");

  const actionRows = top5RecommendedActions.map((a, i) => {
    const c = priorityColor(a.priority);
    return `<tr style="border-bottom:1px solid #f3f4f6">
      <td style="padding:10px 12px;color:#6b7280;font-size:13px">${i+1}</td>
      <td style="padding:10px 12px">
        <span style="display:inline-block;padding:2px 8px;border-radius:99px;font-size:11px;font-weight:700;text-transform:uppercase;background:${c}22;color:${c}">${a.priority}</span>
      </td>
      <td style="padding:10px 12px;color:#374151;font-size:14px">${a.action}</td>
      <td style="padding:10px 12px;color:#9ca3af;font-size:12px;text-transform:capitalize">${a.category}</td>
    </tr>`;
  }).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>${brandName} — Salesforce Health Report — ${orgName}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f9fafb;color:#111827}
    .header{background:linear-gradient(135deg,#1e3a5f 0%,#0070d2 100%);color:white;padding:28px 48px;display:flex;align-items:center;justify-content:space-between}
    .header-brand{font-size:22px;font-weight:900;letter-spacing:-0.5px}
    .header-brand span{opacity:.6;font-size:13px;display:block;font-weight:500;letter-spacing:0;margin-top:2px}
    .header-meta{text-align:right;font-size:13px;opacity:.85}
    .header-meta strong{display:block;font-size:16px;font-weight:700;margin-bottom:2px}
    .container{max-width:960px;margin:28px auto;padding:0 24px}
    .card{background:white;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,.08);padding:26px;margin-bottom:22px}
    .card h2{font-size:16px;font-weight:700;color:#111827;margin-bottom:18px;border-bottom:1px solid #f3f4f6;padding-bottom:10px}
    .exec-box{background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:20px 24px;font-size:14px;line-height:1.7;color:#1e3a5f}
    .gauge-wrap{text-align:center}
    .gauge-score{font-size:46px;font-weight:800;color:${color};margin-top:-68px;display:block}
    .gauge-grade{font-size:20px;font-weight:700;color:${gColor}}
    .gauge-sub{font-size:12px;color:#6b7280;margin-top:3px}
    .summary-grid{display:grid;grid-template-columns:auto 1fr;gap:28px;align-items:center}
    .stat-mini-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:14px}
    .stat-mini{background:#f9fafb;border-radius:8px;padding:12px 14px}
    .stat-mini .v{font-size:22px;font-weight:700;color:#111827}
    .stat-mini .l{font-size:12px;color:#6b7280;margin-top:2px}
    table{width:100%;border-collapse:collapse}
    th{text-align:left;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;padding:7px 12px;border-bottom:2px solid #f3f4f6}
    tr:hover td{background:#f9fafb}
    .footer{text-align:center;color:#9ca3af;font-size:12px;padding:28px 0 44px;border-top:1px solid #e5e7eb;margin-top:8px}
    @media print{
      body{background:white}
      .header{-webkit-print-color-adjust:exact;print-color-adjust:exact}
      .exec-box{-webkit-print-color-adjust:exact;print-color-adjust:exact}
      .card{box-shadow:none;border:1px solid #e5e7eb}
      .no-print{display:none!important}
    }
  </style>
</head>
<body>
  <div class="no-print" style="background:#1e3a5f;color:white;text-align:center;padding:10px 20px;font-size:13px;font-weight:600">
    Press <kbd style="background:rgba(255,255,255,.2);border-radius:4px;padding:1px 6px">Ctrl+P</kbd> / <kbd style="background:rgba(255,255,255,.2);border-radius:4px;padding:1px 6px">Cmd+P</kbd> to save as PDF
  </div>

  <div class="header">
    <div class="header-brand">
      ${brandName}
      <span>Salesforce Org Health Report</span>
    </div>
    <div class="header-meta">
      <strong>${orgName}</strong>
      Prepared ${auditDate}
    </div>
  </div>

  <div class="container">

    <!-- Executive Summary -->
    <div class="card">
      <h2>Executive Summary</h2>
      <div class="exec-box">${execSentences}</div>
    </div>

    <!-- Overall Score -->
    <div class="card">
      <h2>Overall Health Score</h2>
      <div class="summary-grid">
        <div class="gauge-wrap">
          <svg width="140" height="100" viewBox="0 0 140 80">
            <path d="M 14 74 A 56 56 0 0 1 126 74" fill="none" stroke="#e5e7eb" stroke-width="12" stroke-linecap="round"/>
            <path d="M 14 74 A 56 56 0 0 1 126 74" fill="none" stroke="${color}" stroke-width="12"
              stroke-linecap="round"
              stroke-dasharray="${arc.dash} ${arc.gap}"
              stroke-dashoffset="0"
              pathLength="${arc.circ}"/>
          </svg>
          <span class="gauge-score">${overallScore}</span>
          <span class="gauge-grade">${grade}</span>
          <div class="gauge-sub">out of 100</div>
        </div>
        <div class="stat-mini-grid">
          <div class="stat-mini"><div class="v" style="color:${critCount>0?"#dc2626":"#16a34a"}">${critCount}</div><div class="l">Critical Issues</div></div>
          <div class="stat-mini"><div class="v" style="color:${highCount>0?"#ea580c":"#16a34a"}">${highCount}</div><div class="l">High Issues</div></div>
          <div class="stat-mini"><div class="v">${top5RecommendedActions.length}</div><div class="l">Total Actions</div></div>
        </div>
      </div>
    </div>

    <!-- Category Breakdown -->
    <div class="card">
      <h2>Category Breakdown</h2>
      <table>
        <thead><tr><th>Category</th><th>Score Bar</th><th style="text-align:right">Score</th><th style="text-align:right">Issues</th></tr></thead>
        <tbody>${catRows}</tbody>
      </table>
    </div>

    <!-- Top Actions -->
    ${top5RecommendedActions.length > 0 ? `
    <div class="card">
      <h2>Top Recommended Actions</h2>
      <table>
        <thead><tr><th>#</th><th>Priority</th><th>Action</th><th>Category</th></tr></thead>
        <tbody>${actionRows}</tbody>
      </table>
    </div>` : ""}

  </div>

  <div class="footer">
    Prepared by <strong>${brandName}</strong> &nbsp;·&nbsp; Confidential &nbsp;·&nbsp; ${auditDate}
  </div>
</body>
</html>`;
}

module.exports = { generateHTML, generateJSON, generateConsultingHTML };
