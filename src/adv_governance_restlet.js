/**
 * Adaptive Integration Governance Advisor — RESTlet
 * Versão: 3.2
 *
 * Expõe API de diagnóstico e remediação.
 * GET  → diagnóstico completo (limites, integrações, scripts pendentes)
 * POST → ações de remediação (realocação de slots, etc.)
 *
 * @NApiVersion 2.1
 * @NScriptType Restlet
 */
define(['N/https', 'N/query', 'N/record', 'N/search', 'N/runtime', 'N/log'],
  (https, query, record, search, runtime, log) => {

  // ── GET: Diagnóstico Completo ──────────────────────────────────────────
  const get = (params) => {
    const result = {
      timestamp: new Date().toISOString(),
      limits: null,
      integrations: { available: false, method: null, items: [], error: null },
      scripts: { available: false, items: [], error: null },
      capabilities: {
        canListIntegrations: false,
        canLoadIntegration: false,
        canWriteConcurrency: false,
        canDetailScripts: false,
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

    // ── 2. Listar integrações — tentar 3 métodos ─────────────────────────

    // Método A: N/search com tipo 'integration'
    if (!result.integrations.available) {
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
        result.integrations = { available: true, method: 'N/search', items, error: null };
        result.capabilities.canListIntegrations = true;
      } catch (e) {
        result.integrations.error = 'N/search: ' + e.message;
      }
    }

    // Método B: SuiteQL sobre tabela integration
    if (!result.integrations.available) {
      try {
        const q = query.runSuiteQL({
          query: `
            SELECT id, name, concurrencylimit
            FROM integration
            WHERE ROWNUM <= 50
          `
        });
        const items = q.asMappedResults().map(r => ({
          id: r.id,
          name: r.name,
          concurrencyLimit: r.concurrencylimit,
        }));
        result.integrations = { available: true, method: 'SuiteQL', items, error: null };
        result.capabilities.canListIntegrations = true;
      } catch (e) {
        result.integrations.error += ' | SuiteQL: ' + e.message;
      }
    }

    // Método C: REST API /record/v1/integration
    if (!result.integrations.available) {
      try {
        const r = https.requestSuiteTalkRest({
          method: https.Method.GET,
          url: '/record/v1/integration',
        });
        const body = JSON.parse(r.body);
        const items = (body.items || []).map(i => ({
          id: i.id,
          name: i.name || i.id,
          links: i.links,
        }));
        result.integrations = { available: true, method: 'REST', items, error: null };
        result.capabilities.canListIntegrations = true;
      } catch (e) {
        result.integrations.error += ' | REST: ' + e.message;
      }
    }

    // ── 3. Testar load de integration record (se temos IDs) ──────────────
    if (result.integrations.available && result.integrations.items.length > 0) {
      const testId = result.integrations.items[0].id;
      try {
        const rec = record.load({ type: 'integration', id: testId });
        const fields = rec.getFields();
        const concurrencyField = fields.find(f => f.toLowerCase().includes('concurren'));
        result.capabilities.canLoadIntegration = true;
        result.capabilities.integrationFields = fields;
        result.capabilities.concurrencyField = concurrencyField || 'NOT_FOUND';

        if (concurrencyField) {
          const currentVal = rec.getValue(concurrencyField);
          result.capabilities.canWriteConcurrency = 'NEEDS_TEST_VIA_POST';
          result.capabilities.currentConcurrencyValue = currentVal;
        }
      } catch (e) {
        result.capabilities.canLoadIntegration = false;
        result.capabilities.loadError = e.message;
      }
    }

    // ── 4. Scripts pendentes — SuiteQL com ROWNUM ────────────────────────
    try {
      const q = query.runSuiteQL({
        query: `
          SELECT
            taskid,
            status,
            startdate,
            enddate,
            queueid
          FROM scheduledscriptinstance
          WHERE status IN ('PENDING', 'PROCESSING', 'RESTART')
            AND ROWNUM <= 20
          ORDER BY startdate
        `
      });
      const items = q.asMappedResults();
      result.scripts = { available: true, items, error: null };
      result.capabilities.canDetailScripts = true;
    } catch (e) {
      // Tentar sem ORDER BY (pode conflitar com ROWNUM)
      try {
        const q2 = query.runSuiteQL({
          query: `
            SELECT taskid, status, startdate, enddate, queueid
            FROM scheduledscriptinstance
            WHERE status IN ('PENDING', 'PROCESSING', 'RESTART')
              AND ROWNUM <= 20
          `
        });
        const items = q2.asMappedResults();
        result.scripts = { available: true, items, error: null };
        result.capabilities.canDetailScripts = true;
      } catch (e2) {
        result.scripts = { available: false, items: [], error: e2.message };
      }
    }

    return result;
  };

  // ── POST: Ações de Remediação ──────────────────────────────────────────
  const post = (body) => {
    const action = body.action;
    const result = { timestamp: new Date().toISOString(), action, success: false };

    switch (action) {

      // ── Testar escrita de concurrency limit ──────────────────────────
      case 'TEST_WRITE_CONCURRENCY': {
        const integrationId = body.integrationId;
        const newLimit = body.newLimit;
        if (!integrationId || newLimit === undefined) {
          result.error = 'Parâmetros obrigatórios: integrationId, newLimit';
          return result;
        }
        try {
          const rec = record.load({ type: 'integration', id: integrationId });
          const fields = rec.getFields();
          const concurrencyField = fields.find(f => f.toLowerCase().includes('concurren'));
          if (!concurrencyField) {
            result.error = 'Campo de concurrency não encontrado nos fields: ' + fields.join(', ');
            return result;
          }
          const oldValue = rec.getValue(concurrencyField);
          rec.setValue({ fieldId: concurrencyField, value: newLimit });
          rec.save();
          result.success = true;
          result.field = concurrencyField;
          result.oldValue = oldValue;
          result.newValue = newLimit;
        } catch (e) {
          result.error = e.message;
        }
        return result;
      }

      // ── Ler detalhes de uma integração específica ────────────────────
      case 'GET_INTEGRATION_DETAIL': {
        const integrationId = body.integrationId;
        if (!integrationId) {
          result.error = 'Parâmetro obrigatório: integrationId';
          return result;
        }
        try {
          const rec = record.load({ type: 'integration', id: integrationId });
          const fields = rec.getFields();
          const detail = {};
          fields.forEach(f => {
            try { detail[f] = rec.getValue(f); } catch(_) { /* skip */ }
          });
          result.success = true;
          result.fields = fields;
          result.values = detail;
        } catch (e) {
          result.error = e.message;
        }
        return result;
      }

      // ── Realocação: atribuir limite dedicado a uma integração ────────
      case 'REALLOCATE': {
        const integrationId = body.integrationId;
        const suggestedLimit = body.suggestedLimit;
        if (!integrationId || !suggestedLimit) {
          result.error = 'Parâmetros obrigatórios: integrationId, suggestedLimit';
          return result;
        }

        // Verificar se há unallocated suficiente
        try {
          const lr = https.requestSuiteTalkRest({
            method: https.Method.GET,
            url: '/system/v1/governanceLimits',
          });
          const limits = JSON.parse(lr.body);
          const unallocated = limits.accountUnallocatedConcurrencyLimit || 0;

          if (suggestedLimit > unallocated) {
            result.error = `Limite sugerido (${suggestedLimit}) excede unallocated disponível (${unallocated})`;
            result.currentUnallocated = unallocated;
            return result;
          }

          const rec = record.load({ type: 'integration', id: integrationId });
          const fields = rec.getFields();
          const concurrencyField = fields.find(f => f.toLowerCase().includes('concurren'));
          if (!concurrencyField) {
            result.error = 'Campo de concurrency não encontrado';
            return result;
          }

          const oldValue = rec.getValue(concurrencyField);
          rec.setValue({ fieldId: concurrencyField, value: suggestedLimit });
          rec.save();

          result.success = true;
          result.integrationId = integrationId;
          result.field = concurrencyField;
          result.oldLimit = oldValue;
          result.newLimit = suggestedLimit;
          result.previousUnallocated = unallocated;
          result.estimatedNewUnallocated = unallocated - suggestedLimit + (oldValue || 0);
        } catch (e) {
          result.error = e.message;
        }
        return result;
      }

      default:
        result.error = `Ação desconhecida: ${action}. Ações válidas: TEST_WRITE_CONCURRENCY, GET_INTEGRATION_DETAIL, REALLOCATE`;
        return result;
    }
  };

  return { get, post };
});
