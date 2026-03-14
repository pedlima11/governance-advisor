/**
 * Adaptive Governance Advisor — Deep Discovery
 * Mapeia scriptexecutionlog (N/search), tempos de execução e erros de login.
 *
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 */
define(['N/search', 'N/query', 'N/log'],
  (search, query, log) => {

  const onRequest = (context) => {
    const result = {
      timestamp: new Date().toISOString(),
      scriptExecutionLog: {},
      executionTimes: {},
      mapReduceAnalysis: {},
      loginErrors: {},
      topErrorScripts: {},
      deploymentConfig: {},
    };

    // ── 1. scriptexecutionlog — descobrir campos e buscar erros ──────────
    try {
      // Primeiro: descobrir colunas disponíveis
      const discoverySearch = search.create({
        type: 'scriptexecutionlog',
        columns: [
          'internalid',
          'date',
          'time',
          'title',
          'detail',
          'type',
          'script',
          'scripttype',
          'owner',
          'user',
        ],
      });
      const discoveryCols = discoverySearch.columns.map(c => c.name);

      // Buscar últimos 50 registros de ERRO
      const errorSearch = search.create({
        type: 'scriptexecutionlog',
        filters: [
          ['type', 'is', 'ERROR'],
        ],
        columns: [
          search.createColumn({ name: 'date', sort: search.Sort.DESC }),
          search.createColumn({ name: 'time' }),
          search.createColumn({ name: 'title' }),
          search.createColumn({ name: 'detail' }),
          search.createColumn({ name: 'type' }),
          search.createColumn({ name: 'script' }),
          search.createColumn({ name: 'scripttype' }),
        ],
      });

      const errors = [];
      errorSearch.run().getRange({ start: 0, end: 50 }).forEach(row => {
        errors.push({
          date:       row.getValue('date'),
          time:       row.getValue('time'),
          title:      row.getValue('title'),
          detail:     (row.getValue('detail') || '').substring(0, 300),
          type:       row.getValue('type'),
          scriptId:   row.getValue('script'),
          scriptName: row.getText('script'),
          scriptType: row.getText('scripttype'),
        });
      });

      result.scriptExecutionLog = {
        available: true,
        columnsFound: discoveryCols,
        recentErrors: errors,
        errorCount: errors.length,
      };
    } catch (e) {
      result.scriptExecutionLog = {
        available: false,
        error: e.message.substring(0, 300),
      };
    }

    // ── 2. Top scripts com mais erros (agrupado) ────────────────────────
    try {
      const grouped = {};
      const errorSearch2 = search.create({
        type: 'scriptexecutionlog',
        filters: [
          ['type', 'is', 'ERROR'],
        ],
        columns: [
          search.createColumn({ name: 'date', sort: search.Sort.DESC }),
          search.createColumn({ name: 'title' }),
          search.createColumn({ name: 'script' }),
          search.createColumn({ name: 'scripttype' }),
        ],
      });

      errorSearch2.run().getRange({ start: 0, end: 200 }).forEach(row => {
        const scriptId = row.getValue('script');
        const key = scriptId || 'unknown';
        if (!grouped[key]) {
          grouped[key] = {
            scriptId:   scriptId,
            scriptName: row.getText('script'),
            scriptType: row.getText('scripttype'),
            count:      0,
            lastError:  row.getValue('date'),
            titles:     new Set(),
          };
        }
        grouped[key].count++;
        const title = row.getValue('title') || '';
        if (title && grouped[key].titles.size < 3) {
          grouped[key].titles.add(title.substring(0, 150));
        }
      });

      const topErrors = Object.values(grouped)
        .map(g => ({ ...g, titles: Array.from(g.titles) }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 20);

      result.topErrorScripts = {
        available: true,
        items: topErrors,
      };
    } catch (e) {
      result.topErrorScripts = {
        available: false,
        error: e.message.substring(0, 300),
      };
    }

    // ── 3. Tempo de execução por script (scheduled + M/R) ───────────────
    try {
      const timeQuery = query.runSuiteQL({
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
          WHERE si.status IN ('COMPLETE', 'FAILED')
            AND si.startdate IS NOT NULL
            AND si.enddate IS NOT NULL
            AND ROWNUM <= 100
        `
      });

      const rows = timeQuery.asMappedResults();

      // Separar Scheduled de M/R
      const scheduled = rows.filter(r => r.taskid && r.taskid.startsWith('SCHEDSCRIPT'));
      const mapreduce = rows.filter(r => r.taskid && r.taskid.startsWith('MAPREDUCETASK'));

      result.executionTimes = {
        available: true,
        totalRows: rows.length,
        scheduled: {
          count: scheduled.length,
          samples: scheduled.slice(0, 10),
        },
        mapReduce: {
          count: mapreduce.length,
          samples: mapreduce.slice(0, 10),
        },
      };
    } catch (e) {
      result.executionTimes = {
        available: false,
        error: e.message.substring(0, 300),
      };
    }

    // ── 4. Map/Reduce — análise por stage ───────────────────────────────
    try {
      const mrQuery = query.runSuiteQL({
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

      result.mapReduceAnalysis = {
        available: true,
        stageBreakdown: mrQuery.asMappedResults(),
      };
    } catch (e) {
      result.mapReduceAnalysis = {
        available: false,
        error: e.message.substring(0, 300),
      };
    }

    // ── 5. Login audit — erros de integração ────────────────────────────
    try {
      const loginQuery = query.runSuiteQL({
        query: `
          SELECT
            la.oauthappname,
            la.status,
            la.requesturi,
            la.useragent,
            la.date,
            COUNT(*) AS cnt
          FROM loginaudit la
          WHERE la.status != 'Sucesso'
            AND ROWNUM <= 200
          GROUP BY la.oauthappname, la.status, la.requesturi, la.useragent, la.date
          ORDER BY cnt DESC
        `
      });

      result.loginErrors = {
        available: true,
        items: loginQuery.asMappedResults(),
      };
    } catch (e) {
      result.loginErrors = {
        available: false,
        error: e.message.substring(0, 300),
      };
    }

    // ── 6. Deployment configs atuais (com nome do script) ───────────────
    try {
      const configQuery = query.runSuiteQL({
        query: `
          SELECT
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
          WHERE s.scripttype IN ('SCHEDULED', 'MAPREDUCE')
            AND sd.status = 'RELEASED'
          ORDER BY sd.concurrencylimit DESC NULLS LAST
        `
      });

      const configs = configQuery.asMappedResults();

      result.deploymentConfig = {
        available: true,
        totalDeployments: configs.length,
        withConcurrencyLimit: configs.filter(c => c.concurrencylimit != null).length,
        withoutConcurrencyLimit: configs.filter(c => c.concurrencylimit == null).length,
        items: configs.slice(0, 30),
      };
    } catch (e) {
      result.deploymentConfig = {
        available: false,
        error: e.message.substring(0, 300),
      };
    }

    // ── 7. Resumo executivo ─────────────────────────────────────────────
    result.summary = {
      canTrackErrors: result.scriptExecutionLog.available,
      canMeasureTime: result.executionTimes.available,
      canAnalyzeMR: result.mapReduceAnalysis.available,
      canTrackLoginErrors: result.loginErrors.available,
      canReadConfig: result.deploymentConfig.available,
      dashboardViable:
        result.scriptExecutionLog.available &&
        result.executionTimes.available &&
        result.deploymentConfig.available,
    };

    // ── Resposta ─────────────────────────────────────────────────────────
    context.response.setHeader({ name: 'Content-Type', value: 'application/json' });
    context.response.write(JSON.stringify(result, null, 2));
  };

  return { onRequest };
});
