// Snapshot real coletado do td3052652 em 2026-03-14T03:20:41.898Z
export const sampleSnapshot = {
  collectedAt: "2026-03-14T03:20:41.898Z",
  governance: {
    accountConcurrencyLimit: 5,
    unallocatedConcurrencyLimit: 5,
    allocated: 0,
    saturationPct: 0,
  },
  errors: {
    totalErrors: 1000,
    uniqueScripts: 8,
    topErrors: [
      {
        scriptId: "CUSTOMSCRIPT4989",
        scriptName: "rl_create_subsidiary.js",
        scriptType: "RESTLET",
        errorCount: 782,
        lastSeen: "13/03/2026",
        firstSeen: "11/03/2026",
        errorTitles: [
          { title: "Set Text Error", count: 334 },
          { title: "SuiteQL Error", count: 285 },
          { title: "FTE Rule Error", count: 62 },
          { title: "Vendor Address Error", count: 37 },
          { title: "Det save error", count: 34 },
          { title: "Set Lookup setText Failed", count: 7 },
          { title: "Create Item Error", count: 7 },
        ],
        recentErrors: [
          {
            date: "13/03/2026",
            time: "4:35 tarde",
            title: "SuiteQL Error",
            detail: "SQL: SELECT id, name FROM CUSTOMRECORD_BRL_TAX_ALIAS_MAP ORDER BY name | Error: Record 'CUSTOMRECORD_BRL_TAX_ALIAS_MAP' was not found.",
          },
          {
            date: "13/03/2026",
            time: "4:35 tarde",
            title: "SuiteQL Error",
            detail: "SQL: SELECT id, name FROM CUSTOMRECORD_FTEBR_SPECIAL_TAXREGIME ORDER BY name | Error: Record 'CUSTOMRECORD_FTEBR_SPECIAL_TAXREGIME' was not found.",
          },
        ],
      },
      {
        scriptId: "CUSTOMSCRIPT_8299_LICENSE_REQUEST_SS",
        scriptName: "Request License SS",
        scriptType: "SCHEDULED",
        errorCount: 192,
        lastSeen: "05/03/2028",
        firstSeen: "11/03/2026",
        errorTitles: [
          { title: "ss_request_license - runRequestRetry()", count: 160 },
          { title: "ss_request_license - runScheduledRequest()", count: 32 },
        ],
        recentErrors: [
          {
            date: "05/03/2028",
            time: "10:31 tarde",
            title: "ss_request_license - runRequestRetry()",
            detail: "Code: CLIC012 — License request failed. ServerResponseSignatureValidator: required: signature, authCode, refCode",
          },
        ],
      },
      {
        scriptId: "CUSTOMSCRIPT4992",
        scriptName: "rl_demo_assistant.js",
        scriptType: "RESTLET",
        errorCount: 9,
        lastSeen: "11/03/2026",
        firstSeen: "11/03/2026",
        errorTitles: [
          { title: "SuiteQL Error", count: 6 },
          { title: "Set Text Error", count: 2 },
          { title: "FTE Rule Error", count: 1 },
        ],
        recentErrors: [],
      },
      {
        scriptId: "CUSTOMSCRIPT4995",
        scriptName: "adv_governance_advisor_ss.js",
        scriptType: "SCHEDULED",
        errorCount: 6,
        lastSeen: "13/03/2026",
        firstSeen: "13/03/2026",
        errorTitles: [
          { title: "SAVE_LOG_ERROR", count: 3 },
          { title: "HISTORY_ERROR", count: 3 },
        ],
        recentErrors: [],
      },
      {
        scriptId: "CUSTOMSCRIPT_SW_INITIATE_WARMER_SL",
        scriptName: "Account Warmer Starter",
        scriptType: "SCRIPTLET",
        errorCount: 4,
        lastSeen: "12/03/2026",
        firstSeen: "12/03/2026",
        errorTitles: [
          { title: "QUERY call failed", count: 3 },
          { title: "Query RESTlet failed", count: 1 },
        ],
        recentErrors: [
          {
            date: "12/03/2026",
            time: "4:27 manhã",
            title: "QUERY call failed",
            detail: "SSS_REQUEST_TIME_EXCEEDED — host ultrapassou tempo máximo de resposta",
          },
        ],
      },
    ],
  },
  executions: {
    statusBreakdown: [{ status: "COMPLETE", cnt: 3020 }],
    currentBacklog: 0,
    recentFailed: [],
  },
  mapReduce: {
    stageBreakdown: [
      { mapreducestage: "GET_INPUT", status: "COMPLETE", cnt: 182 },
      { mapreducestage: "MAP", status: "COMPLETE", cnt: 182 },
      { mapreducestage: "REDUCE", status: "COMPLETE", cnt: 182 },
      { mapreducestage: "SHUFFLE", status: "COMPLETE", cnt: 182 },
      { mapreducestage: "SUMMARIZE", status: "COMPLETE", cnt: 182 },
    ],
    failedStages: [],
  },
  config: {
    totalDeployments: 760,
    byType: {
      MAPREDUCE: { count: 141, withLimit: 141 },
      SCHEDULED: { count: 272, withLimit: 0 },
      USEREVENT: { count: 333, withLimit: 0 },
      RESTLET: { count: 14, withLimit: 0 },
    },
  },
  loginAudit: {
    items: [
      {
        appName: "Assistente_Claude",
        totalCalls: 500,
        failures: 5,
        failurePct: 1,
        endpoints: [
          { uri: "/services/rest/query/v1/suiteql", count: 299 },
          { uri: "/app/site/hosting/restlet.nl", count: 161 },
          { uri: "/services/rest/record/v1/account", count: 31 },
        ],
      },
    ],
  },
};

// Snapshots simulados para comparação de tunings
export const tuningWindows = [
  {
    id: "window_1",
    label: "Tuning 1",
    tunedAt: "2026-03-05T10:00:00Z",
    tunedBy: "Pedro Lima",
    tunedVia: "UI",
    changes: [
      { deployment: "SearchTask Processor MR", field: "concurrencylimit", from: 1, to: 2 },
      { deployment: "QueryTask Processor MR", field: "concurrencylimit", from: 1, to: 2 },
    ],
    metrics: {
      totalErrors: 1450,
      avgExecTime: 42,
      scriptBacklog: 18,
      mrFailedStages: 5,
      saturationPct: 92,
      loginFailures: 8,
    },
    score: 78,
  },
  {
    id: "window_2",
    label: "Tuning 2",
    tunedAt: "2026-03-10T14:30:00Z",
    tunedBy: "João Santos",
    tunedVia: "UI",
    changes: [
      { deployment: "rl_create_subsidiary.js", field: "concurrencylimit", from: null, to: 3 },
      { deployment: "Request License SS", field: "priority", from: 2, to: 1 },
    ],
    metrics: {
      totalErrors: 380,
      avgExecTime: 15,
      scriptBacklog: 2,
      mrFailedStages: 0,
      saturationPct: 45,
      loginFailures: 1,
    },
    score: 22,
  },
  {
    id: "window_3",
    label: "Atual",
    tunedAt: "2026-03-13T09:00:00Z",
    tunedBy: "Pedro Lima",
    tunedVia: "UI",
    changes: [
      { deployment: "rl_create_subsidiary.js", field: "concurrencylimit", from: 3, to: null },
    ],
    metrics: {
      totalErrors: 1000,
      avgExecTime: 28,
      scriptBacklog: 0,
      mrFailedStages: 0,
      saturationPct: 0,
      loginFailures: 5,
    },
    score: 52,
  },
];
