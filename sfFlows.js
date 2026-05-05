const https = require("https");
const querystring = require("querystring");

// --- Config (set via env vars or replace directly) ---
const SF_CLIENT_ID = process.env.SF_CLIENT_ID || "YOUR_CONNECTED_APP_CLIENT_ID";
const SF_CLIENT_SECRET = process.env.SF_CLIENT_SECRET || "YOUR_CONNECTED_APP_CLIENT_SECRET";
const SF_USERNAME = process.env.SF_USERNAME || "your@email.com";
const SF_PASSWORD = process.env.SF_PASSWORD || "yourPasswordPlusSecurityToken";
const SF_LOGIN_URL = process.env.SF_LOGIN_URL || "login.salesforce.com"; // use test.salesforce.com for sandboxes
const API_VERSION = "59.0";

function post(hostname, path, body) {
  return new Promise((resolve, reject) => {
    const data = querystring.stringify(body);
    const options = {
      hostname,
      path,
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": Buffer.byteLength(data),
      },
    };
    const req = https.request(options, (res) => {
      let raw = "";
      res.on("data", (chunk) => (raw += chunk));
      res.on("end", () => {
        try {
          resolve(JSON.parse(raw));
        } catch {
          reject(new Error(`Failed to parse response: ${raw}`));
        }
      });
    });
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

function request(options, body = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let raw = "";
      res.on("data", (chunk) => (raw += chunk));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(raw) });
        } catch {
          resolve({ status: res.statusCode, body: raw });
        }
      });
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

async function authenticate() {
  const result = await post(SF_LOGIN_URL, "/services/oauth2/token", {
    grant_type: "password",
    client_id: SF_CLIENT_ID,
    client_secret: SF_CLIENT_SECRET,
    username: SF_USERNAME,
    password: SF_PASSWORD,
  });

  if (!result.access_token) {
    throw new Error(`OAuth failed: ${JSON.stringify(result)}`);
  }

  const instanceHost = new URL(result.instance_url).hostname;
  return { accessToken: result.access_token, instanceHost };
}

async function queryFlows(instanceHost, accessToken) {
  const soql = encodeURIComponent(
    "SELECT Id, ApiName, Label, Status, LastModifiedDate, ProcessType FROM FlowDefinitionView ORDER BY Label"
  );

  const { status, body } = await request({
    hostname: instanceHost,
    path: `/services/data/v${API_VERSION}/query?q=${soql}`,
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });

  if (status !== 200 || !body.records) {
    throw new Error(`Flow query failed (${status}): ${JSON.stringify(body)}`);
  }

  return body.records;
}

function buildSummary(records) {
  const flows = records.map((r) => ({
    id: r.Id,
    label: r.Label,
    apiName: r.ApiName,
    processType: r.ProcessType,
    status: r.Status,
    isActive: r.Status === "Active",
    lastModifiedDate: r.LastModifiedDate,
  }));

  return {
    totalCount: flows.length,
    activeCount: flows.filter((f) => f.isActive).length,
    inactiveCount: flows.filter((f) => !f.isActive).length,
    generatedAt: new Date().toISOString(),
    flows,
  };
}

async function main() {
  console.log("Authenticating with Salesforce...");
  const { accessToken, instanceHost } = await authenticate();
  console.log(`Connected to: ${instanceHost}`);

  console.log("Fetching Flows...");
  const records = await queryFlows(instanceHost, accessToken);

  const summary = buildSummary(records);
  console.log(JSON.stringify(summary, null, 2));
  return summary;
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});

module.exports = { authenticate, queryFlows, buildSummary };
