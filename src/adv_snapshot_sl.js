/**
 * Adaptive Governance Advisor — Snapshot Suitelet
 * Wrapper para testar a lógica do RESTlet via browser.
 * Mesma lógica, acessível sem TBA.
 *
 * GET ?action=snapshot  → dados completos
 * GET ?action=config    → configs dos deployments
 * GET ?action=changes   → alterações recentes (systemnote)
 *
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 */
define(['N/https', 'N/query', 'N/search', 'N/runtime', 'N/log'],
  (https, query, search, runtime, log) => {

  const onRequest = (context) => {
    const params = context.request.parameters;
    const action = params.action || 'snapshot';
    let result;

    switch (action) {
      case 'snapshot': result = collectSnapshot(); break;
      case 'config':   result = collectConfig(); break;
      case 'changes':  result = collectChanges(params.days || 7); break;
      default:         result = { error: `Unknown action: ${action}` };
    }

    context.response.setHeader({ name: 'Content-Type', value: 'application/json' });
    context.response.write(JSON.stringify(result, null, 2));
  };

  const collectSnapshot = () => {
    return {
      collectedAt: new Date().toISOString(),
      governance:  collectGovernanceLimits(),
      errors:      collectScriptErrors(),
      executions:  collectExecutionMetrics(),
      mapReduce:   collectMapReduceMetrics(),
      config:      collectConfig(),
      loginAudit:  collectLoginAudit(),
    };
  };

  const collectGovernanceLimits = () => {
    try {
      const r = https.requestSuiteTalkRest({
        method: https.Method.GET,
        url: '/system/v1/governanceLimits',
      });
      const body = JSON.parse(r.body);
      const account = body.accountConcurrencyLimit || 0;
      const unalloc = body.accountUnallocatedConcurrencyLimit || account;
      return {
        accountConcurrencyLimit: account,
        unallocatedConcurrencyLimit: unalloc,
        allocated: account - unalloc,
        saturationPct: account > 0 ? ((account - unalloc) / account * 100) : 0,
        raw: body,
      };
    } catch (e) {
      return { error: e.message };
    }
  };

  const collectScriptErrors = () => {
    try {
      const grouped = {};
      let totalErrors = 0;

      const s = search.create({
        type: 'scriptexecutionlog',
        filters: [['type', 'is', 'ERROR']],
        columns: [
          search.createColumn({ name: 'date', sort: search.Sort.DESC }),
          search.createColumn({ name: 'time' }),
          search.createColumn({ name: 'title' }),
          search.createColumn({ name: 'detail' }),
          search.createColumn({ name: 'scripttype' }),
          search.createColumn({ name: 'name', join: 'script' }),
          search.createColumn({ name: 'scriptid', join: 'script' }),
          search.createColumn({ name: 'scripttype', join: 'script' }),
        ],
      });

      const pagedRun = s.runPaged({ pageSize: 100 });
      const maxPages = Math.min(pagedRun.pageRanges.length, 10);

      for (let p = 0; p < maxPages; p++) {
        pagedRun.fetch({ index: p }).data.forEach(row => {
          totalErrors++;
          const scriptName = row.getValue({ name: 'name', join: 'script' }) || 'Unknown';
          const scriptId   = row.getValue({ name: 'scriptid', join: 'script' }) || 'unknown';
          const key = scriptId;

          if (!grouped[key]) {
            grouped[key] = {
              scriptId: scriptId,
              scriptName: scriptName,
              scriptType: row.getValue({ name: 'scripttype', join: 'script' }) || row.getValue('scripttype'),
              errorCount: 0,
              lastSeen: null,
              firstSeen: null,
              errorTitles: {},
              recentErrors: [],
            };
          }

          const g = grouped[key];
          g.errorCount++;
          const d = row.getValue('date');
          if (!g.lastSeen) g.lastSeen = d;
          g.firstSeen = d;

          const title = row.getValue('title') || 'No title';
          g.errorTitles[title] = (g.errorTitles[title] || 0) + 1;

          if (g.recentErrors.length < 3) {
            g.recentErrors.push({
              date:   d,
              time:   row.getValue('time'),
              title:  title,
              detail: (row.getValue('detail') || '').substring(0, 500),
            });
          }
        });
      }

      const items = Object.values(grouped).map(g => ({
        ...g,
        errorTitles: Object.entries(g.errorTitles)
          .map(([title, count]) => ({ title, count }))
          .sort((a, b) => b.count - a.count),
      })).sort((a, b) => b.errorCount - a.errorCount);

      return { totalErrors, uniqueScripts: items.length, topErrors: items.slice(0, 20) };
    } catch (e) {
      return { error: e.message };
    }
  };

  const collectExecutionMetrics = () => {
    try {
      const statusQ = query.runSuiteQL({
        query: `SELECT si.status, COUNT(*) AS cnt FROM scheduledscriptinstance si GROUP BY si.status ORDER BY cnt DESC`
      });

      const backlogQ = query.runSuiteQL({
        query: `SELECT COUNT(*) AS backlog FROM scheduledscriptinstance WHERE status IN ('PENDING', 'RESTART', 'PROCESSING')`
      });

      const failedQ = query.runSuiteQL({
        query: `SELECT si.taskid, si.status, si.startdate, si.enddate, si.mapreducestage, si.percentcomplete, si.queue FROM scheduledscriptinstance si WHERE si.status = 'FAILED' AND ROWNUM <= 20`
      });

      return {
        statusBreakdown: statusQ.asMappedResults(),
        currentBacklog: parseInt(backlogQ.asMappedResults()[0]?.backlog || '0', 10),
        recentFailed: failedQ.asMappedResults(),
      };
    } catch (e) {
      return { error: e.message };
    }
  };

  const collectMapReduceMetrics = () => {
    try {
      const stageQ = query.runSuiteQL({
        query: `SELECT si.mapreducestage, si.status, COUNT(*) AS cnt FROM scheduledscriptinstance si WHERE si.mapreducestage IS NOT NULL GROUP BY si.mapreducestage, si.status ORDER BY si.mapreducestage, cnt DESC`
      });

      const failedQ = query.runSuiteQL({
        query: `SELECT si.taskid, si.mapreducestage, si.status, si.startdate, si.enddate, si.percentcomplete FROM scheduledscriptinstance si WHERE si.mapreducestage IS NOT NULL AND si.status = 'FAILED' AND ROWNUM <= 20`
      });

      return {
        stageBreakdown: stageQ.asMappedResults(),
        failedStages: failedQ.asMappedResults(),
      };
    } catch (e) {
      return { error: e.message };
    }
  };

  const collectConfig = () => {
    try {
      const q = query.runSuiteQL({
        query: `
          SELECT
            sd.id AS deployment_id,
            sd.scriptid AS deployment_scriptid,
            sd.title AS deployment_title,
            sd.concurrencylimit,
            sd.priority,
            sd.buffersize,
            sd.queueid,
            sd.status AS deploy_status,
            sd.processorpool,
            sd.yieldaftermins,
            s.name AS script_name,
            s.scripttype,
            s.scriptid AS script_scriptid,
            s.id AS script_internal_id
          FROM scriptdeployment sd
          INNER JOIN script s ON sd.script = s.id
          WHERE sd.isdeployed = 'T'
            AND s.scripttype IN ('SCHEDULED', 'MAPREDUCE', 'USEREVENT', 'RESTLET', 'SUITELET')
          ORDER BY s.scripttype, sd.concurrencylimit DESC NULLS LAST
        `
      });

      const items = q.asMappedResults();
      const byType = {};
      items.forEach(i => {
        const type = i.scripttype || 'UNKNOWN';
        if (!byType[type]) byType[type] = { count: 0, withLimit: 0, items: [] };
        byType[type].count++;
        if (i.concurrencylimit != null) byType[type].withLimit++;
        if (byType[type].items.length < 50) byType[type].items.push(i);
      });

      return { totalDeployments: items.length, byType };
    } catch (e) {
      return { error: e.message };
    }
  };

  const collectLoginAudit = () => {
    try {
      const q = query.runSuiteQL({
        query: `
          SELECT la.oauthappname, la.status, la.requesturi, la.date, COUNT(*) AS cnt
          FROM loginaudit la
          WHERE la.oauthappname IS NOT NULL AND ROWNUM <= 500
          GROUP BY la.oauthappname, la.status, la.requesturi, la.date
          ORDER BY la.date DESC, cnt DESC
        `
      });

      const rows = q.asMappedResults();
      const byApp = {};
      rows.forEach(r => {
        const app = r.oauthappname || 'Unknown';
        if (!byApp[app]) byApp[app] = { total: 0, failures: 0, endpoints: {} };
        const cnt = parseInt(r.cnt, 10);
        byApp[app].total += cnt;
        if (r.status !== 'Sucesso') byApp[app].failures += cnt;
        const uri = r.requesturi || 'unknown';
        byApp[app].endpoints[uri] = (byApp[app].endpoints[uri] || 0) + cnt;
      });

      const items = Object.entries(byApp).map(([name, data]) => ({
        appName: name,
        totalCalls: data.total,
        failures: data.failures,
        failurePct: data.total > 0 ? (data.failures / data.total * 100) : 0,
        endpoints: Object.entries(data.endpoints)
          .map(([uri, count]) => ({ uri, count }))
          .sort((a, b) => b.count - a.count),
      })).sort((a, b) => b.failures - a.failures);

      return { items };
    } catch (e) {
      return { error: e.message };
    }
  };

  const collectChanges = (days) => {
    try {
      const q = query.runSuiteQL({
        query: `
          SELECT sn.date, sn.field, sn.oldvalue, sn.newvalue, sn.context, sn.name AS changed_by, sn.recordid, sn.record AS record_label
          FROM systemnote sn
          WHERE UPPER(sn.field) IN ('CONCURRENCYLIMIT', 'PRIORITY', 'BUFFERSIZE', 'STATUS')
            AND sn.date >= SYSDATE - ${parseInt(days, 10)}
          ORDER BY sn.date DESC
        `
      });
      return { days: parseInt(days, 10), changes: q.asMappedResults() };
    } catch (e) {
      return { error: e.message };
    }
  };

  return { onRequest };
});
