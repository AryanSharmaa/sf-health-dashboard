/**
 * CLI runner — authenticate, collect, score, and write report.
 * Usage: node src/run.js
 * Or with env overrides: SF_USERNAME=x SF_PASSWORD=y node src/run.js
 */

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { collectOrgMetadata } = require("./sfCollector");
const { scoreOrgHealth } = require("../sfHealthScore");
const { generateHTML, generateJSON } = require("./reportGenerator");

const credentials = {
  loginUrl: `https://${process.env.SF_LOGIN_URL || "login.salesforce.com"}`,
  username: process.env.SF_USERNAME,
  password: process.env.SF_PASSWORD,
  clientId: process.env.SF_CLIENT_ID,
  clientSecret: process.env.SF_CLIENT_SECRET,
};

async function main() {
  if (!credentials.username || !credentials.password) {
    console.error("Missing SF_USERNAME or SF_PASSWORD environment variables.");
    console.error("Copy .env.example to .env and fill in your credentials.");
    process.exit(1);
  }

  console.log(`\n  Connecting to Salesforce (${credentials.loginUrl})...`);
  const metadata = await collectOrgMetadata(credentials);
  console.log(`  Connected: ${metadata.orgName} (${metadata.orgId})`);

  console.log("  Scoring org health...");
  const healthScore = scoreOrgHealth(metadata);

  const outDir = path.resolve(__dirname, "../reports");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const base = `${metadata.orgId}_${timestamp}`;

  const jsonPath = path.join(outDir, `${base}.json`);
  const htmlPath = path.join(outDir, `${base}.html`);

  fs.writeFileSync(jsonPath, JSON.stringify(generateJSON(healthScore, metadata), null, 2));
  fs.writeFileSync(htmlPath, generateHTML(healthScore, metadata));

  console.log(`\n  Overall Score : ${healthScore.overallScore} / 100  (${healthScore.grade})`);
  console.log(`  JSON report   : ${jsonPath}`);
  console.log(`  HTML report   : ${htmlPath}`);

  if (healthScore.top5RecommendedActions.length > 0) {
    console.log("\n  Top recommended actions:");
    healthScore.top5RecommendedActions.forEach((a, i) => {
      console.log(`    ${i + 1}. [${a.priority.toUpperCase()}] ${a.action}`);
    });
  }

  console.log("");
}

main().catch((err) => {
  console.error("\n  Error:", err.message);
  process.exit(1);
});
