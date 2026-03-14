/**
 * Adaptive Governance Advisor — RESTlet Read-Only
 * Endpoint único para coleta de snapshots pelo dashboard externo.
 *
 * GET ?action=snapshot  → dados completos para análise
 * GET ?action=config    → configurações atuais dos deployments
 * GET ?action=changes   → alterações recentes detectadas via systemnote
 *
 * @NApiVersion 2.1
 * @NScriptType Restlet
 */
define(['N/https', 'N/query', 'N/search', 'N/runtime', 'N/log'],
  (https, query, search, runtime, log) => {

  const get = (params) => {
    const action = params.action || 'snapshot';

    switch (action) {
      case 'snapshot': return collectSnapshot();
      case 'config':   return collectConfig();
      case 'changes':  return collectChanges(params.days || 7);
      default:         return { error: `Unknown action: ${action}` };
    }
  };

  // ═══════════════════════════════════════════════════════════════════════
  // SNAPSHOT — coleta completa para o dashboard
  // ═══════════════════════════════════════════════════════════════════════
  const collectSnapshot = () => {
    const ts = new Date().toISOString();

    return {
      collectedAt: ts,
      governance:  collectGovernanceLimits(),
      errors:      collectScriptErrors(),
      executions:  collectExecutionMetrics(),
      mapReduce:   collectMapReduceMetrics(),
      config:      collectConfig(),
      loginAudit:  collectLoginAudit(),
    };
  };

  // ── governanceLimits ──────────────────────────────────────────────────
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
      log.error('GOV_LIMITS', e.message);
      return { error: e.message };
    }
  };

  // ── scriptexecutionlog — erros agrupados por script ───────────────────
  const collectScriptErrors = () => {
    try {
      const grouped = {};
      let totalErrors = 0;

      const s = search.create({
        type: 'scriptexecutionlog',
        filters: [
          ['type', 'is', 'ERROR'],
        ],
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

      // Processar até 1000 registros via paginação
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
              scriptId:    scriptId,
              scriptName:  scriptName,
              scriptType:  row.getValue({ name: 'scripttype', join: 'script' }) || row.getValue('scripttype'),
              errorCount:  0,
              firstSeen:   row.getValue('date'),
              lastSeen:    row.getValue('date'),
              errorTitles: {},
              recentErrors: [],
            };
          }

          const g = grouped[key];
          g.errorCount++;
          g.lastSeen = g.errorCount === 1 ? row.getValue('date') : g.lastSeen;
          if (g.errorCount <= 1) g.firstSeen = row.getValue('date');

          const title = row.getValue('title') || 'No title';
          g.errorTitles[title] = (g.errorTitles[title] || 0) + 1;

          if (g.recentErrors.length < 3) {
            g.recentErrors.push({
              date:   row.getValue('date'),
              time:   row.getValue('time'),
              title:  title,
              detail: (row.getValue('detail') || '').substring(0, 500),
            });
          }
        });
      }

      // Converter errorTitles de objeto para array ordenado
      const items = Object.values(grouped).map(g => ({
        ...g,
        errorTitles: Object.entries(g.errorTitles)
          .map(([title, count]) => ({ title, count }))
          .sort((a, b) => b.count - a.count),
      })).sort((a, b) => b.errorCount - a.errorCount);

      return {
        totalErrors,
        uniqueScripts: items.length,
        topErrors: items.slice(0, 20),
      };
    } catch (e) {
      log.error('SCRIPT_ERRORS', e.message);
      return { error: e.message };
    }
  };

  // ── scheduledscriptinstance — métricas de execução ────────────────────
  const collectExecutionMetrics = () => {
    try {
      const q = query.runSuiteQL({
        query: `
          SELECT
            si.status,
            COUNT(*) AS cnt
          FROM scheduledscriptinstance si
          GROUP BY si.status
          ORDER BY cnt DESC
        `
      });

      const statusBreakdown = q.asMappedResults();

      // Backlog atual
      const backlogQ = query.runSuiteQL({
        query: `
          SELECT COUNT(*) AS backlog
          FROM scheduledscriptinstance
          WHERE status IN ('PENDING', 'RESTART', 'PROCESSING')
        `
      });
      const backlog = parseInt(backlogQ.asMappedResults()[0]?.backlog || '0', 10);

      // Últimas execuções com falha
      const failedQ = query.runSuiteQL({
        query: `
          SELECT
            si.taskid,
            si.status,
            si.startdate,
            si.enddate,
            si.mapreducestage,
            si.percentcomplete,
            si.queue
          FROM scheduledscriptinstance si
          WHERE si.status = 'FAILED'
            AND ROWNUM <= 20
        `
      });

      return {
        statusBreakdown,
        currentBacklog: backlog,
        recentFailed: failedQ.asMappedResults(),
      };
    } catch (e) {
      log.error('EXEC_METRICS', e.message);
      return { error: e.message };
    }
  };

  // ── Map/Reduce — análise por stage ────────────────────────────────────
  const collectMapReduceMetrics = () => {
    try {
      const stageQ = query.runSuiteQL({
        query: `
          SELECT
            si.mapreducestage,
            si.status,
            COUNT(*) AS cnt
          FROM scheduledscriptinstance si
          WHERE si.mapreducestage IS NOT NULL
          GROUP BY si.mapreducestage, si.status
          ORDER BY si.mapreducestage, cnt DESC
        `
      });

      // M/R com falha
      const failedQ = query.runSuiteQL({
        query: `
          SELECT
            si.taskid,
            si.mapreducestage,
            si.status,
            si.startdate,
            si.enddate,
            si.percentcomplete
          FROM scheduledscriptinstance si
          WHERE si.mapreducestage IS NOT NULL
            AND si.status = 'FAILED'
            AND ROWNUM <= 20
        `
      });

      return {
        stageBreakdown: stageQ.asMappedResults(),
        failedStages: failedQ.asMappedResults(),
      };
    } catch (e) {
      log.error('MR_METRICS', e.message);
      return { error: e.message };
    }
  };

  // ── scriptdeployment — configurações atuais ───────────────────────────
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

      // Resumo por tipo
      const byType = {};
      items.forEach(i => {
        const type = i.scripttype || 'UNKNOWN';
        if (!byType[type]) byType[type] = { count: 0, withLimit: 0, items: [] };
        byType[type].count++;
        if (i.concurrencylimit != null) byType[type].withLimit++;
        if (byType[type].items.length < 50) byType[type].items.push(i);
      });

      return {
        totalDeployments: items.length,
        byType,
      };
    } catch (e) {
      log.error('CONFIG', e.message);
      return { error: e.message };
    }
  };

  // ── loginaudit — integrações externas ─────────────────────────────────
  const collectLoginAudit = () => {
    try {
      const q = query.runSuiteQL({
        query: `
          SELECT
            la.oauthappname,
            la.status,
            la.requesturi,
            la.date,
            COUNT(*) AS cnt
          FROM loginaudit la
          WHERE la.oauthappname IS NOT NULL
            AND ROWNUM <= 500
          GROUP BY la.oauthappname, la.status, la.requesturi, la.date
          ORDER BY la.date DESC, cnt DESC
        `
      });

      const rows = q.asMappedResults();

      // Agrupar por app
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

      // Converter para array
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
      log.error('LOGIN_AUDIT', e.message);
      return { error: e.message };
    }
  };

  // ── systemnote — mudanças de config (tunadas) ─────────────────────────
  const collectChanges = (days) => {
    try {
      const q = query.runSuiteQL({
        query: `
          SELECT
            sn.date,
            sn.field,
            sn.oldvalue,
            sn.newvalue,
            sn.context,
            sn.name AS changed_by,
            sn.recordid,
            sn.record AS record_label
          FROM systemnote sn
          WHERE sn.recordtypeid = (
            SELECT id FROM recordtype WHERE scriptid = 'scriptdeployment' AND ROWNUM <= 1
          )
            AND sn.field IN ('CONCURRENCYLIMIT', 'PRIORITY', 'BUFFERSIZE', 'STATUS', 'QUEUEID')
            AND sn.date >= SYSDATE - ${parseInt(days, 10)}
          ORDER BY sn.date DESC
        `
      });

      return {
        days: parseInt(days, 10),
        changes: q.asMappedResults(),
      };
    } catch (e) {
      // Fallback: systemnote sem filtro de recordtype
      try {
        const q2 = query.runSuiteQL({
          query: `
            SELECT
              sn.date,
              sn.field,
              sn.oldvalue,
              sn.newvalue,
              sn.context,
              sn.name AS changed_by,
              sn.recordid,
              sn.record AS record_label
            FROM systemnote sn
            WHERE UPPER(sn.field) IN ('CONCURRENCYLIMIT', 'PRIORITY', 'BUFFERSIZE')
              AND sn.date >= SYSDATE - ${parseInt(days, 10)}
            ORDER BY sn.date DESC
          `
        });

        return {
          days: parseInt(days, 10),
          changes: q2.asMappedResults(),
          note: 'fallback query used',
        };
      } catch (e2) {
        log.error('CHANGES', e2.message);
        return { error: e2.message };
      }
    }
  };

  return { get };
});
