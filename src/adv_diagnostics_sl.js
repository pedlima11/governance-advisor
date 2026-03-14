/**
 * Adaptive Governance Advisor — Diagnóstico de Capacidades
 * Testa o que é possível automatizar via SuiteScript.
 *
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 */
define(['N/https', 'N/query', 'N/record', 'N/search', 'N/log'],
  (https, query, record, search, log) => {

  const onRequest = (context) => {
    const result = {
      timestamp: new Date().toISOString(),
      limits: null,
      integrations: { available: false, method: null, items: [], errors: [] },
      scripts: { available: false, items: [], errors: [] },
      capabilities: {
        canListIntegrations: false,
        canLoadIntegration: false,
        canWriteConcurrency: 'UNKNOWN',
        canDetailScripts: false,
        integrationFields: [],
        concurrencyField: null,
      }
    };

    // ── 1. Governance Limits ─────────────────────────────────────────────
    try {
      const r = https.requestSuiteTalkRest({
        method: https.Method.GET,
        url: '/system/v1/governanceLimits',
      });
      result.limits = JSON.parse(r.body);
    } catch (e) {
      result.limits = { error: e.message };
    }

    // ── 2. Listar integrações — 3 métodos ────────────────────────────────

    // Método A: N/search
    try {
      const s = search.create({
        type: 'integration',
        columns: [
          search.createColumn({ name: 'name' }),
          search.createColumn({ name: 'internalid' }),
        ]
      });
      const items = [];
      s.run().getRange({ start: 0, end: 50 }).forEach(row => {
        items.push({
          id: row.getValue('internalid'),
          name: row.getValue('name'),
        });
      });
      if (items.length > 0) {
        result.integrations = { available: true, method: 'N/search', items, errors: [] };
        result.capabilities.canListIntegrations = true;
      }
    } catch (e) {
      result.integrations.errors.push('N/search: ' + e.message);
    }

    // Método B: SuiteQL
    if (!result.integrations.available) {
      try {
        const q = query.runSuiteQL({
          query: `SELECT id, name, concurrencylimit FROM integration WHERE ROWNUM <= 50`
        });
        const items = q.asMappedResults().map(r => ({
          id: r.id, name: r.name, concurrencyLimit: r.concurrencylimit,
        }));
        if (items.length > 0) {
          result.integrations = { available: true, method: 'SuiteQL', items, errors: [] };
          result.capabilities.canListIntegrations = true;
        }
      } catch (e) {
        result.integrations.errors.push('SuiteQL: ' + e.message);
      }
    }

    // Método C: REST API
    if (!result.integrations.available) {
      try {
        const r = https.requestSuiteTalkRest({
          method: https.Method.GET,
          url: '/record/v1/integration',
        });
        const body = JSON.parse(r.body);
        const items = (body.items || []).map(i => ({
          id: i.id, name: i.name || i.id,
        }));
        if (items.length > 0) {
          result.integrations = { available: true, method: 'REST_API', items, errors: [] };
          result.capabilities.canListIntegrations = true;
        }
      } catch (e) {
        result.integrations.errors.push('REST: ' + e.message);
      }
    }

    // ── 3. Testar load de integration record ─────────────────────────────
    if (result.integrations.available && result.integrations.items.length > 0) {
      const testId = result.integrations.items[0].id;
      try {
        const rec = record.load({ type: 'integration', id: testId });
        const fields = rec.getFields();
        result.capabilities.canLoadIntegration = true;
        result.capabilities.integrationFields = fields;

        const concField = fields.find(f =>
          f.toLowerCase().includes('concurren') || f.toLowerCase().includes('limit')
        );
        result.capabilities.concurrencyField = concField || 'NOT_FOUND';

        if (concField) {
          result.capabilities.currentConcurrencyValue = rec.getValue(concField);
          result.capabilities.canWriteConcurrency = 'TESTABLE_VIA_POST';
        }
      } catch (e) {
        result.capabilities.loadError = e.message;
      }
    }

    // ── 4. Scripts pendentes — 3 tentativas de SQL ───────────────────────

    // Tentativa A: com ORDER BY
    try {
      const q = query.runSuiteQL({
        query: `
          SELECT taskid, status, startdate, enddate, queueid
          FROM scheduledscriptinstance
          WHERE status IN ('PENDING', 'PROCESSING', 'RESTART')
            AND ROWNUM <= 20
          ORDER BY startdate
        `
      });
      result.scripts = { available: true, items: q.asMappedResults(), errors: [] };
      result.capabilities.canDetailScripts = true;
    } catch (e) {
      result.scripts.errors.push('SQL_A: ' + e.message);
    }

    // Tentativa B: sem ORDER BY
    if (!result.scripts.available) {
      try {
        const q = query.runSuiteQL({
          query: `
            SELECT taskid, status, startdate, enddate, queueid
            FROM scheduledscriptinstance
            WHERE status IN ('PENDING', 'PROCESSING', 'RESTART')
              AND ROWNUM <= 20
          `
        });
        result.scripts = { available: true, items: q.asMappedResults(), errors: [] };
        result.capabilities.canDetailScripts = true;
      } catch (e) {
        result.scripts.errors.push('SQL_B: ' + e.message);
      }
    }

    // Tentativa C: só contar (mínimo viável)
    if (!result.scripts.available) {
      try {
        const q = query.runSuiteQL({
          query: `SELECT COUNT(*) AS total FROM scheduledscriptinstance WHERE status IN ('PENDING', 'PROCESSING', 'RESTART')`
        });
        result.scripts = { available: true, items: q.asMappedResults(), errors: result.scripts.errors };
        result.capabilities.canDetailScripts = true;
      } catch (e) {
        result.scripts.errors.push('SQL_C: ' + e.message);
      }
    }

    // ── Resposta ─────────────────────────────────────────────────────────
    context.response.setHeader({ name: 'Content-Type', value: 'application/json' });
    context.response.write(JSON.stringify(result, null, 2));
  };

  return { onRequest };
});
