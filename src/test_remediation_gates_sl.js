/**
 * Remediation Gates Validator
 * Testa o que é possível automatizar via SuiteScript
 *
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 */
define(['N/query', 'N/record', 'N/search', 'N/log'],
  (query, record, search, log) => {

    const onRequest = (context) => {
      const results = {
        timestamp: new Date().toISOString(),
        gates: {}
      };

      // ── GATE R1: Listar integrações e seus limites via SuiteQL ────────
      try {
        const r1 = query.runSuiteQL({
          query: `
            SELECT
              id,
              name,
              concurrencylimit
            FROM integration
            WHERE isinactive = 'F'
            ORDER BY name
          `
        });
        const integrations = r1.asMappedResults();
        results.gates.R1_LIST_INTEGRATIONS = {
          status: 'OK',
          count: integrations.length,
          integrations: integrations.slice(0, 20),
          note: 'SuiteQL consegue ler integrações e concurrencylimit'
        };
      } catch (e) {
        results.gates.R1_LIST_INTEGRATIONS = {
          status: 'ERROR',
          error: e.message
        };
      }

      // ── GATE R2: Carregar integration record via N/record ─────────────
      try {
        // Primeiro pega o ID de uma integração qualquer via SuiteQL
        const idResult = query.runSuiteQL({
          query: `SELECT id FROM integration WHERE isinactive = 'F' ORDER BY id FETCH FIRST 1 ROWS ONLY`
        });
        const rows = idResult.asMappedResults();

        if (rows.length > 0) {
          const testId = rows[0].id;
          const rec = record.load({ type: 'integration', id: testId });
          const currentLimit = rec.getValue({ fieldId: 'concurrencylimit' });
          const recName = rec.getValue({ fieldId: 'name' });

          // Lista todos os campos disponíveis
          const fields = rec.getFields();

          results.gates.R2_LOAD_RECORD = {
            status: 'OK',
            integrationId: testId,
            name: recName,
            currentConcurrencyLimit: currentLimit,
            availableFields: fields,
            note: 'record.load() funciona para integration'
          };

          // ── GATE R3: Testar se concurrencylimit é writable ──────────
          // NÃO salva — apenas testa setValue sem save()
          try {
            const testValue = currentLimit || 0;
            rec.setValue({ fieldId: 'concurrencylimit', value: testValue });
            const readBack = rec.getValue({ fieldId: 'concurrencylimit' });

            results.gates.R3_WRITE_CONCURRENCY = {
              status: 'SETTABLE',
              note: 'setValue() aceita concurrencylimit (NÃO salvou — apenas teste em memória)',
              originalValue: currentLimit,
              testSetValue: testValue,
              readBack: readBack,
              WARNING: 'Para confirmar write real, é necessário chamar save() — não feito neste teste'
            };
          } catch (e2) {
            results.gates.R3_WRITE_CONCURRENCY = {
              status: 'NOT_WRITABLE',
              error: e2.message,
              note: 'concurrencylimit não aceita setValue — automação de realocação não é possível'
            };
          }
        } else {
          results.gates.R2_LOAD_RECORD = {
            status: 'SKIP',
            note: 'Nenhuma integração ativa encontrada'
          };
          results.gates.R3_WRITE_CONCURRENCY = { status: 'SKIP' };
        }
      } catch (e) {
        results.gates.R2_LOAD_RECORD = {
          status: 'ERROR',
          error: e.message
        };
        results.gates.R3_WRITE_CONCURRENCY = { status: 'SKIP' };
      }

      // ── GATE R4: Detalhar scripts pendentes ───────────────────────────
      try {
        const r4 = query.runSuiteQL({
          query: `
            SELECT
              ssi.taskid,
              ssi.status,
              ssi.startdate,
              ssi.enddate,
              ssi.queueid,
              ss.scriptid,
              ss.name AS scriptname
            FROM scheduledscriptinstance ssi
            LEFT JOIN scheduledscript ss ON ssi.taskid = ss.scriptid
            WHERE ssi.status IN ('PENDING', 'PROCESSING', 'RESTART')
            ORDER BY ssi.startdate
            FETCH FIRST 20 ROWS ONLY
          `
        });
        const scripts = r4.asMappedResults();
        results.gates.R4_SCRIPT_DETAILS = {
          status: 'OK',
          count: scripts.length,
          scripts: scripts,
          note: 'Detalhamento de scripts pendentes disponível'
        };
      } catch (e) {
        // Tenta query simplificada se o JOIN falhar
        try {
          const r4b = query.runSuiteQL({
            query: `
              SELECT
                taskid,
                status,
                startdate,
                enddate,
                queueid
              FROM scheduledscriptinstance
              WHERE status IN ('PENDING', 'PROCESSING', 'RESTART')
              ORDER BY startdate
              FETCH FIRST 20 ROWS ONLY
            `
          });
          const scripts = r4b.asMappedResults();
          results.gates.R4_SCRIPT_DETAILS = {
            status: 'PARTIAL',
            count: scripts.length,
            scripts: scripts,
            note: 'JOIN com scheduledscript falhou, mas consulta básica funciona',
            joinError: e.message
          };
        } catch (e2) {
          results.gates.R4_SCRIPT_DETAILS = {
            status: 'ERROR',
            error: e2.message
          };
        }
      }

      // ── GATE R5: Verificar webserviceslog (para enrichment futuro) ────
      try {
        const r5 = query.runSuiteQL({
          query: `
            SELECT
              integrationid,
              httpmethod,
              httpresponsecode,
              date
            FROM webserviceslog
            WHERE date >= SYSDATE - (2/24)
            FETCH FIRST 5 ROWS ONLY
          `
        });
        const logs = r5.asMappedResults();
        results.gates.R5_WEBSERVICESLOG = {
          status: 'OK',
          count: logs.length,
          sample: logs,
          note: 'webserviceslog acessível — enrichment completo possível'
        };
      } catch (e) {
        results.gates.R5_WEBSERVICESLOG = {
          status: 'UNAVAILABLE',
          error: e.message,
          note: 'webserviceslog não disponível nesta conta'
        };
      }

      // ── Resumo ────────────────────────────────────────────────────────
      results.summary = {
        canListIntegrations:    results.gates.R1_LIST_INTEGRATIONS?.status === 'OK',
        canLoadIntegration:     results.gates.R2_LOAD_RECORD?.status === 'OK',
        canWriteConcurrency:    results.gates.R3_WRITE_CONCURRENCY?.status === 'SETTABLE',
        canDetailScripts:       ['OK', 'PARTIAL'].includes(results.gates.R4_SCRIPT_DETAILS?.status),
        canAccessWebServicesLog: results.gates.R5_WEBSERVICESLOG?.status === 'OK',
      };

      results.remediation_capabilities = {
        auto_reallocate: results.summary.canWriteConcurrency
          ? 'POSSÍVEL — pode redistribuir slots automaticamente'
          : 'MANUAL — precisa de playbook com passos',
        auto_diagnose_scripts: results.summary.canDetailScripts
          ? 'POSSÍVEL — pode listar scripts travados com detalhes'
          : 'MANUAL — precisa de playbook com passos',
        auto_identify_top_consumers: results.summary.canAccessWebServicesLog
          ? 'POSSÍVEL — pode ranquear integrações por consumo'
          : 'LIMITADO — só via governanceLimits (sem detalhamento por integração)',
      };

      context.response.setHeader({ name: 'Content-Type', value: 'application/json' });
      context.response.write(JSON.stringify(results, null, 2));
    };

    return { onRequest };
  });
