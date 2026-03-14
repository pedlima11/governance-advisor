/**
 * Adaptive Governance Advisor — Discovery de Tabelas e Colunas
 * Mapeia o que está disponível para diagnóstico de scripts e integrações.
 *
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 */
define(['N/query', 'N/search', 'N/log'],
  (query, search, log) => {

  const onRequest = (context) => {
    const result = {
      timestamp: new Date().toISOString(),
      tables: {},
      searchTypes: {},
      summary: {
        tablesAvailable: [],
        tablesUnavailable: [],
        bestDataSources: {}
      }
    };

    // ── 1. Descobrir colunas de tabelas conhecidas ───────────────────────
    const tablesToTest = [
      'scheduledscriptinstance',
      'scriptexecutionlog',
      'scriptdeployment',
      'script',
      'webserviceslog',
      'integration',
      'integrationrecordusage',
      'concurrencylog',
      'systemlog',
      'loginaudit',
      'systemnote',
    ];

    tablesToTest.forEach(table => {
      try {
        const q = query.runSuiteQL({
          query: `SELECT * FROM ${table} WHERE ROWNUM <= 3`
        });
        const rows = q.asMappedResults();
        const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
        result.tables[table] = {
          available: true,
          rowCount: rows.length,
          columns: columns,
          sampleRow: rows[0] || null,
        };
        result.summary.tablesAvailable.push(table);
      } catch (e) {
        result.tables[table] = {
          available: false,
          error: e.message.substring(0, 200),
        };
        result.summary.tablesUnavailable.push(table);
      }
    });

    // ── 2. Se scheduledscriptinstance tem colunas, buscar pendentes ──────
    if (result.tables.scheduledscriptinstance?.available) {
      try {
        const cols = result.tables.scheduledscriptinstance.columns;
        const selectCols = cols.slice(0, 15).join(', ');
        const q = query.runSuiteQL({
          query: `SELECT ${selectCols} FROM scheduledscriptinstance WHERE ROWNUM <= 20`
        });
        result.tables.scheduledscriptinstance.allRows = q.asMappedResults();
      } catch (e) {
        result.tables.scheduledscriptinstance.allRowsError = e.message.substring(0, 200);
      }
    }

    // ── 3. Se scriptexecutionlog existe, buscar erros recentes ───────────
    if (result.tables.scriptexecutionlog?.available) {
      try {
        const cols = result.tables.scriptexecutionlog.columns;
        const hasType = cols.find(c => c.toLowerCase().includes('type') || c.toLowerCase().includes('level'));
        const hasDate = cols.find(c => c.toLowerCase().includes('date') || c.toLowerCase().includes('time'));

        let errorQuery = `SELECT * FROM scriptexecutionlog WHERE ROWNUM <= 10`;
        if (hasType) {
          errorQuery = `SELECT * FROM scriptexecutionlog WHERE LOWER(${hasType}) LIKE '%error%' AND ROWNUM <= 10`;
        }

        const q = query.runSuiteQL({ query: errorQuery });
        result.tables.scriptexecutionlog.recentErrors = q.asMappedResults();
      } catch (e) {
        result.tables.scriptexecutionlog.recentErrorsError = e.message.substring(0, 200);
      }
    }

    // ── 4. Tentar N/search para tipos de registro de script ──────────────
    const searchTypes = [
      'scheduledscriptinstance',
      'scriptexecutionlog',
      'scriptdeployment',
      'script',
      'scheduledscript',
      'mapreduce',
      'mapreducescriptlog',
    ];

    searchTypes.forEach(type => {
      try {
        const s = search.create({ type: type, columns: [] });
        const count = s.runPaged().count;
        result.searchTypes[type] = { available: true, count: count };
      } catch (e) {
        result.searchTypes[type] = { available: false, error: e.message.substring(0, 150) };
      }
    });

    // ── 5. Tentar buscar script deployments com detalhes ─────────────────
    if (result.tables.scriptdeployment?.available) {
      try {
        const cols = result.tables.scriptdeployment.columns.slice(0, 15).join(', ');
        const q = query.runSuiteQL({
          query: `SELECT ${cols} FROM scriptdeployment WHERE ROWNUM <= 20`
        });
        result.tables.scriptdeployment.allRows = q.asMappedResults();
      } catch (e) {
        result.tables.scriptdeployment.allRowsError = e.message.substring(0, 200);
      }
    }

    // ── 6. Resumo: melhores fontes de dados ──────────────────────────────
    result.summary.bestDataSources = {
      scriptErrors:
        result.tables.scriptexecutionlog?.available ? 'scriptexecutionlog' :
        result.searchTypes.scheduledscriptinstance?.available ? 'N/search:scheduledscriptinstance' :
        'NENHUM',
      scriptBacklog:
        result.tables.scheduledscriptinstance?.available ? 'scheduledscriptinstance' : 'NENHUM',
      integrationTraffic:
        result.tables.webserviceslog?.available ? 'webserviceslog' :
        result.tables.integration?.available ? 'integration' : 'NENHUM',
      deploymentStatus:
        result.tables.scriptdeployment?.available ? 'scriptdeployment' : 'NENHUM',
    };

    // ── Resposta ─────────────────────────────────────────────────────────
    context.response.setHeader({ name: 'Content-Type', value: 'application/json' });
    context.response.write(JSON.stringify(result, null, 2));
  };

  return { onRequest };
});
