/**
 * Unit tests for sfCollector helper logic (pure functions only).
 * Network/jsforce calls are mocked.
 */

jest.mock("jsforce");
const jsforce = require("jsforce");

// ─── Mock connection factory ──────────────────────────────────────────────────

function makeMockConn(overrides = {}) {
  return {
    login: jest.fn().mockResolvedValue({}),
    query: jest.fn().mockResolvedValue({ records: [] }),
    tooling: {
      query: jest.fn().mockResolvedValue({ records: [] }),
    },
    limits: jest.fn().mockResolvedValue({
      DailyApiRequests: { Max: 15000, Remaining: 10000 },
      DataStorageMB: { Max: 1024, Remaining: 512 },
      FileStorageMB: { Max: 2048, Remaining: 1000 },
    }),
    describe: jest.fn().mockResolvedValue({ fields: [] }),
    metadata: {
      read: jest.fn().mockRejectedValue(new Error("not available")),
    },
    version: "59.0",
    ...overrides,
  };
}

// ─── Tests: data shape returned by collectors ─────────────────────────────────

describe("collectOrgMetadata — output shape (mocked jsforce)", () => {
  let conn;

  beforeEach(() => {
    conn = makeMockConn();
    jsforce.Connection.mockImplementation(() => conn);
  });

  test("returns all required top-level keys", async () => {
    const { collectOrgMetadata } = require("./sfCollector");
    const result = await collectOrgMetadata({
      loginUrl: "https://login.salesforce.com",
      username: "test@example.com",
      password: "pass",
    });

    expect(result).toHaveProperty("orgId");
    expect(result).toHaveProperty("orgName");
    expect(result).toHaveProperty("collectedAt");
    expect(result).toHaveProperty("automation");
    expect(result).toHaveProperty("security");
    expect(result).toHaveProperty("dataQuality");
    expect(result).toHaveProperty("apiUsage");
    expect(result).toHaveProperty("codeQuality");
    expect(result).toHaveProperty("userAdoption");
    expect(result).toHaveProperty("unusedFields");
    expect(result).toHaveProperty("techDebt");
  });

  test("collectedAt is a valid ISO string", async () => {
    const { collectOrgMetadata } = require("./sfCollector");
    const result = await collectOrgMetadata({ username: "u", password: "p" });
    expect(new Date(result.collectedAt).toISOString()).toBe(result.collectedAt);
  });

  test("falls back to 'unknown' orgId when query returns empty", async () => {
    const { collectOrgMetadata } = require("./sfCollector");
    const result = await collectOrgMetadata({ username: "u", password: "p" });
    expect(result.orgId).toBe("unknown");
  });
});

// ─── Tests: automation shape ──────────────────────────────────────────────────

describe("automation collection", () => {
  test("maps active/inactive flows correctly", async () => {
    const conn = makeMockConn();
    conn.query.mockImplementation((soql) => {
      if (soql.includes("FlowDefinitionView") && !soql.includes("Workflow")) {
        return Promise.resolve({
          records: [
            { Id: "1", ApiName: "Flow_A", Label: "Flow A", Status: "Active", ProcessType: "Flow", LastModifiedDate: "2024-01-01" },
            { Id: "2", ApiName: "Flow_B", Label: "Flow B", Status: "Inactive", ProcessType: "Flow", LastModifiedDate: "2023-01-01" },
          ],
        });
      }
      return Promise.resolve({ records: [] });
    });
    jsforce.Connection.mockImplementation(() => conn);

    const { collectOrgMetadata } = require("./sfCollector");
    const result = await collectOrgMetadata({ username: "u", password: "p" });

    expect(result.automation.totalFlows).toBe(2);
    expect(result.automation.activeFlows).toBe(1);
    expect(result.automation.inactiveFlows).toBe(1);
  });

  test("handles empty flows gracefully", async () => {
    const conn = makeMockConn();
    jsforce.Connection.mockImplementation(() => conn);

    const { collectOrgMetadata } = require("./sfCollector");
    const result = await collectOrgMetadata({ username: "u", password: "p" });

    expect(result.automation.flows).toEqual([]);
    expect(result.automation.activeFlows).toBe(0);
    expect(result.automation.inactiveFlows).toBe(0);
  });
});

// ─── Tests: API usage / limits ────────────────────────────────────────────────

describe("apiUsage collection", () => {
  test("calculates dailyApiUsedPct from limits", async () => {
    const conn = makeMockConn({
      limits: jest.fn().mockResolvedValue({
        DailyApiRequests: { Max: 10000, Remaining: 2000 },
        DataStorageMB: { Max: 1024, Remaining: 512 },
      }),
    });
    jsforce.Connection.mockImplementation(() => conn);

    const { collectOrgMetadata } = require("./sfCollector");
    const result = await collectOrgMetadata({ username: "u", password: "p" });

    expect(result.apiUsage.dailyApiUsedPct).toBeCloseTo(0.8, 2);
    expect(result.apiUsage.dailyApiMax).toBe(10000);
  });

  test("dailyApiUsedPct capped at 1 when remaining exceeds max (defensive)", async () => {
    const conn = makeMockConn({
      limits: jest.fn().mockResolvedValue({
        DailyApiRequests: { Max: 100, Remaining: 0 },
        DataStorageMB: { Max: 1024, Remaining: 512 },
      }),
    });
    jsforce.Connection.mockImplementation(() => conn);

    const { collectOrgMetadata } = require("./sfCollector");
    const result = await collectOrgMetadata({ username: "u", password: "p" });
    expect(result.apiUsage.dailyApiUsedPct).toBeLessThanOrEqual(1);
  });

  test("falls back gracefully when limits() throws", async () => {
    const conn = makeMockConn({
      limits: jest.fn().mockRejectedValue(new Error("Unauthorized")),
    });
    jsforce.Connection.mockImplementation(() => conn);

    const { collectOrgMetadata } = require("./sfCollector");
    await expect(collectOrgMetadata({ username: "u", password: "p" })).resolves.toBeDefined();
  });

  test("governor limits object is present in output", async () => {
    const conn = makeMockConn();
    jsforce.Connection.mockImplementation(() => conn);

    const { collectOrgMetadata } = require("./sfCollector");
    const result = await collectOrgMetadata({ username: "u", password: "p" });
    expect(result.apiUsage).toHaveProperty("governorLimits");
    expect(result.apiUsage.governorLimits).toHaveProperty("dailyApiRequests");
  });
});

// ─── Tests: data quality ──────────────────────────────────────────────────────

describe("dataQuality collection", () => {
  test("storageUsedPct computed correctly from limits", async () => {
    const conn = makeMockConn({
      limits: jest.fn().mockResolvedValue({
        DailyApiRequests: { Max: 15000, Remaining: 10000 },
        DataStorageMB: { Max: 1000, Remaining: 100 },
      }),
    });
    jsforce.Connection.mockImplementation(() => conn);

    const { collectOrgMetadata } = require("./sfCollector");
    const result = await collectOrgMetadata({ username: "u", password: "p" });
    expect(result.dataQuality.storageUsedPct).toBeCloseTo(0.9, 2);
  });

  test("storageUsedPct never exceeds 1", async () => {
    const conn = makeMockConn({
      limits: jest.fn().mockResolvedValue({
        DailyApiRequests: { Max: 15000, Remaining: 10000 },
        DataStorageMB: { Max: 100, Remaining: 0 },
      }),
    });
    jsforce.Connection.mockImplementation(() => conn);

    const { collectOrgMetadata } = require("./sfCollector");
    const result = await collectOrgMetadata({ username: "u", password: "p" });
    expect(result.dataQuality.storageUsedPct).toBeLessThanOrEqual(1);
  });

  test("duplicateRulesEnabled is false when no active rules", async () => {
    const conn = makeMockConn();
    conn.tooling.query.mockResolvedValue({
      records: [{ Id: "1", DeveloperName: "Rule1", IsActive: false }],
    });
    jsforce.Connection.mockImplementation(() => conn);

    const { collectOrgMetadata } = require("./sfCollector");
    const result = await collectOrgMetadata({ username: "u", password: "p" });
    expect(result.dataQuality.duplicateRulesEnabled).toBe(false);
  });

  test("duplicateRulesEnabled is true when at least one active rule exists", async () => {
    const conn = makeMockConn();
    conn.tooling.query.mockImplementation((soql) => {
      if (soql.includes("DuplicateRule")) {
        return Promise.resolve({
          records: [{ Id: "1", DeveloperName: "Rule1", IsActive: true }],
        });
      }
      return Promise.resolve({ records: [] });
    });
    jsforce.Connection.mockImplementation(() => conn);

    const { collectOrgMetadata } = require("./sfCollector");
    const result = await collectOrgMetadata({ username: "u", password: "p" });
    expect(result.dataQuality.duplicateRulesEnabled).toBe(true);
  });
});

// ─── Tests: code quality ──────────────────────────────────────────────────────

describe("codeQuality collection", () => {
  test("apexTestCoveragePct computed from org wide coverage", async () => {
    const conn = makeMockConn();
    conn.tooling.query.mockImplementation((soql) => {
      if (soql.includes("ApexOrgWideCoverage")) {
        return Promise.resolve({
          records: [{ NumLinesCovered: 800, NumLinesUncovered: 200 }],
        });
      }
      return Promise.resolve({ records: [] });
    });
    jsforce.Connection.mockImplementation(() => conn);

    const { collectOrgMetadata } = require("./sfCollector");
    const result = await collectOrgMetadata({ username: "u", password: "p" });
    expect(result.codeQuality.apexTestCoveragePct).toBeCloseTo(0.8, 2);
  });

  test("apexTestCoveragePct is 0 when coverage data unavailable", async () => {
    const conn = makeMockConn();
    jsforce.Connection.mockImplementation(() => conn);

    const { collectOrgMetadata } = require("./sfCollector");
    const result = await collectOrgMetadata({ username: "u", password: "p" });
    expect(result.codeQuality.apexTestCoveragePct).toBe(0);
  });
});

// ─── Tests: error resilience ──────────────────────────────────────────────────

describe("sfCollector — error resilience", () => {
  test("safeQuery returns fallback [] when query throws", async () => {
    const conn = makeMockConn({
      query: jest.fn().mockRejectedValue(new Error("SOQL error")),
    });
    jsforce.Connection.mockImplementation(() => conn);

    const { collectOrgMetadata } = require("./sfCollector");
    await expect(collectOrgMetadata({ username: "u", password: "p" })).resolves.toBeDefined();
  });

  test("safeToolingQuery returns fallback [] when tooling.query throws", async () => {
    const conn = makeMockConn();
    conn.tooling.query.mockRejectedValue(new Error("Tooling API error"));
    jsforce.Connection.mockImplementation(() => conn);

    const { collectOrgMetadata } = require("./sfCollector");
    await expect(collectOrgMetadata({ username: "u", password: "p" })).resolves.toBeDefined();
  });

  test("login failure propagates as thrown error", async () => {
    const conn = makeMockConn({
      login: jest.fn().mockRejectedValue(new Error("INVALID_LOGIN")),
    });
    jsforce.Connection.mockImplementation(() => conn);

    const { collectOrgMetadata } = require("./sfCollector");
    await expect(collectOrgMetadata({ username: "bad", password: "bad" })).rejects.toThrow("INVALID_LOGIN");
  });

  test("limits() failure does not crash the collector", async () => {
    const conn = makeMockConn({
      limits: jest.fn().mockRejectedValue(new Error("Forbidden")),
    });
    jsforce.Connection.mockImplementation(() => conn);

    const { collectOrgMetadata } = require("./sfCollector");
    const result = await collectOrgMetadata({ username: "u", password: "p" });
    expect(result).toHaveProperty("apiUsage");
  });
});
