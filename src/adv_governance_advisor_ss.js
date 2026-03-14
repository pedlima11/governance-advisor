/**
 * Adaptive Integration Governance Advisor
 * Versão: 3.1-adjusted (pós Fase 0)
 *
 * Ajustes aplicados após validação no td3052652:
 *  - webserviceslog NÃO disponível → enrichment reduzido a backlog de scripts
 *  - integration record NÃO acessível via REST → automação PATCH removida
 *  - scheduledscriptinstance campos corrigidos (internalId, taskId, status)
 *  - readHistory() ordenação corrigida para 'created' DESC
 *  - IDs corrigidos: NetSuite duplicou prefixo customrecord/custrecord
 *
 * @NApiVersion 2.1
 * @NScriptType ScheduledScript
 */
define(['N/https', 'N/query', 'N/record', 'N/search', 'N/email', 'N/runtime', 'N/log'],
  (https, query, record, search, email, runtime, log) => {

  const HISTORY_WINDOW   = 6;
  const CUSTOM_RECORD_ID = 'customrecordcustomrecord_adv_gov_log';

  // IDs reais dos campos (NetSuite duplicou prefixo custrecord_)
  const F = {
    ACCOUNT_LIMIT:  'custrecordcustrecord_adv_account_limit',
    UNALLOCATED:    'custrecordcustrecord_adv_unallocated',
    SATURATION_PCT: 'custrecordcustrecord_adv_saturation_pct',
    ACTION:         'custrecordcustrecord_adv_action',
    DOMAIN:         'custrecordcustrecord_adv_domain',
    URGENCY:        'custrecordcustrecord_adv_urgency',
    CONFIDENCE:     'custrecordcustrecord_adv_confidence',
    REASON:         'custrecordcustrecord_adv_reason',
    ENRICHMENT_SRC: 'custrecordcustrecord_adv_enrichment_src',
    MANUAL_TRAIL:   'custrecordcustrecord_adv_manual_trail',
  };

  const execute = () => {

    // ── 1. Leitura oficial (MVP — sempre executa) ─────────────────────
    const limits = readGovernanceLimits();
    if (!limits) {
      log.error('ABORT', 'governanceLimits indisponível');
      return;
    }
    log.audit('LIMITS', JSON.stringify(limits));

    // ── 2. Histórico das últimas N decisões (MVP — lê do Custom Record)
    const history = readHistory(HISTORY_WINDOW);
    log.audit('HISTORY', `${history.length} entradas carregadas`);

    // ── 3. Enrichment (apenas backlog — webserviceslog indisponível) ──
    const enrichment = collectEnrichment();
    log.audit('ENRICHMENT', JSON.stringify({
      source: enrichment.source,
      scriptBacklog: enrichment.scriptBacklog
    }));

    // ── 4. Decisão ────────────────────────────────────────────────────
    const decision = decide(limits, enrichment, history);
    log.audit('DECISION', JSON.stringify(decision));

    // ── 5. Persistir (alimenta history nas próximas execuções) ────────
    saveLog(limits, enrichment, decision);

    // ── 6. Alertar ────────────────────────────────────────────────────
    if (decision.urgency !== 'LOW') {
      sendAlert(decision, limits);
    }
  };

  // ── COLLECTOR: governanceLimits ──────────────────────────────────────
  const readGovernanceLimits = () => {
    try {
      const r = https.requestSuiteTalkRest({
        method: https.Method.GET,
        url: '/system/v1/governanceLimits',
      });
      const body = JSON.parse(r.body);

      return {
        accountConcurrencyLimit:     body.accountConcurrencyLimit ?? 0,
        unallocatedConcurrencyLimit: body.accountUnallocatedConcurrencyLimit ?? body.accountConcurrencyLimit ?? 0,
        _raw: body,
      };
    } catch (e) {
      log.error('LIMITS_ERROR', e.message);
      return null;
    }
  };

  // ── COLLECTOR: histórico do Custom Record ───────────────────────────
  const readHistory = (n) => {
    try {
      const results = [];
      const s = search.create({
        type: CUSTOM_RECORD_ID,
        filters: [],
        columns: [
          search.createColumn({ name: 'created', sort: search.Sort.DESC }),
          search.createColumn({ name: F.SATURATION_PCT }),
          search.createColumn({ name: F.ACTION }),
          search.createColumn({ name: F.URGENCY }),
          search.createColumn({ name: F.UNALLOCATED }),
          search.createColumn({ name: F.ENRICHMENT_SRC }),
        ]
      });
      s.run().getRange({ start: 0, end: n }).forEach(row => {
        results.push({
          saturation_pct:    parseFloat(row.getValue(F.SATURATION_PCT)) || 0,
          action:            row.getValue(F.ACTION),
          urgency:           row.getValue(F.URGENCY),
          unallocated:       parseInt(row.getValue(F.UNALLOCATED), 10) || 0,
          enrichment_source: row.getValue(F.ENRICHMENT_SRC),
          timestamp:         row.getValue('created'),
        });
      });
      return results;
    } catch (e) {
      log.error('HISTORY_ERROR', e.message);
      return [];
    }
  };

  // ── COLLECTOR: enrichment ───────────────────────────────────────────
  const collectEnrichment = () => {
    const base = {
      source: 'NONE',
      integrations: [],
      scriptBacklog: 0,
      collectedAt: new Date().toISOString()
    };

    try {
      const scriptResult = query.runSuiteQL({
        query: `
          SELECT COUNT(*) AS backlog
          FROM scheduledscriptinstance
          WHERE status IN ('PENDING', 'RESTART')
        `
      });

      const backlog = parseInt(scriptResult.asMappedResults()[0]?.backlog || '0', 10);

      return {
        source: backlog > 0 ? 'PARTIAL' : 'NONE',
        integrations: [],
        scriptBacklog: backlog,
        collectedAt: new Date().toISOString()
      };
    } catch (e) {
      log.audit('ENRICHMENT_SKIP', e.message);
      return base;
    }
  };

  // ── MOTOR DE DECISÃO ─────────────────────────────────────────────────
  const THRESHOLDS = {
    saturation_high:     85,
    saturation_medium:   70,
    recurrence_window:   HISTORY_WINDOW,
    script_backlog_warn: 10,
  };

  const decide = (limits, enrichment, history) => {
    const accountLimit  = limits.accountConcurrencyLimit || 0;
    const unallocated   = limits.unallocatedConcurrencyLimit ?? accountLimit;
    const saturationPct = accountLimit > 0
      ? ((accountLimit - unallocated) / accountLimit * 100)
      : 0;

    const recentSaturations = history
      .filter(h => h.saturation_pct > THRESHOLDS.saturation_high).length;

    const confidence =
      history.length >= HISTORY_WINDOW ? 'HIGH' :
      history.length > 0               ? 'MEDIUM' : 'LOW';

    const base = { confidence };
    const scriptBacklog = enrichment.scriptBacklog;

    // ── Domínio A: Pool de concorrência ────────────────────────────────

    if (unallocated === 0 && recentSaturations >= THRESHOLDS.recurrence_window) {
      return {
        ...base,
        action: 'EVALUATE_SC_PLUS_PURCHASE',
        domain: 'A',
        urgency: 'HIGH',
        reason: `Pool esgotado em ${recentSaturations}/${HISTORY_WINDOW} janelas recentes. Rebalanceamento já não resolve. Avaliar compra de SC+.`,
        manual: buildManualTrail(limits)
      };
    }

    if (unallocated === 0 && recentSaturations < THRESHOLDS.recurrence_window) {
      return {
        ...base,
        action: 'REALLOCATE_IF_SUPPORTED',
        domain: 'A',
        urgency: 'MEDIUM',
        reason: `Pool esgotado (${saturationPct.toFixed(0)}%) — ocorrência isolada. Redistribuir slots antes de avaliar SC+.`,
        manual: buildManualTrail(limits)
      };
    }

    // ── Pressão combinada A+B ──────────────────────────────────────────

    if (saturationPct > THRESHOLDS.saturation_high && scriptBacklog > THRESHOLDS.script_backlog_warn) {
      return {
        ...base,
        action: 'INVESTIGATE_COMBINED_PRESSURE',
        domain: 'AB',
        urgency: 'HIGH',
        reason: `Concorrência em ${saturationPct.toFixed(0)}% + ${scriptBacklog} scripts pendentes. Domínios A e B podem ter causas independentes. Investigar antes de recomendar SC+. Reavaliar após ${HISTORY_WINDOW} janelas.`,
        manual: buildManualTrail(limits)
      };
    }

    if (saturationPct > THRESHOLDS.saturation_high && unallocated > 0) {
      return {
        ...base,
        action: 'REDUCE_EXTERNAL_PARALLELISM',
        domain: 'A',
        urgency: 'MEDIUM',
        reason: `Pressão em ${saturationPct.toFixed(0)}% com ${unallocated} slots disponíveis. Reduzir paralelismo nos clientes de integração.`,
        manual: buildManualTrail(limits)
      };
    }

    // ── Domínio B: Scripts (pool separado) ─────────────────────────────

    if (scriptBacklog > THRESHOLDS.script_backlog_warn && saturationPct < 50) {
      return {
        ...base,
        action: 'INVESTIGATE_SCRIPT_PROCESSORS',
        domain: 'B',
        urgency: 'MEDIUM',
        reason: `${scriptBacklog} scripts pendentes sem saturação de concorrência WS. Investigar design, prioridade e dependency chain.`,
        manual: null
      };
    }

    // ── Saturação média — monitorar ────────────────────────────────────

    if (saturationPct > THRESHOLDS.saturation_medium) {
      return {
        ...base,
        action: 'MONITOR',
        domain: 'A',
        urgency: 'LOW',
        reason: `Saturação em ${saturationPct.toFixed(0)}% — acima do limiar médio (${THRESHOLDS.saturation_medium}%). Monitorar nas próximas janelas.`,
        manual: null
      };
    }

    // ── Sistema estável ────────────────────────────────────────────────

    return {
      ...base,
      action: 'HOLD',
      domain: 'NONE',
      urgency: 'LOW',
      reason: `Sistema estável. Concorrência em ${saturationPct.toFixed(0)}%.`,
      manual: null
    };
  };

  // ── TRILHA MANUAL ────────────────────────────────────────────────────
  const buildManualTrail = (limits) => {
    return {
      navigation:           'Setup > Integration > Integration Management > Integration Governance',
      currentAccountLimit:  limits.accountConcurrencyLimit,
      currentUnallocated:   limits.unallocatedConcurrencyLimit,
      candidateIntegration: null,
      referenceDoc:         'https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/bridgehead_156224824287.html'
    };
  };

  // ── PERSISTÊNCIA ─────────────────────────────────────────────────────
  const saveLog = (limits, enrichment, decision) => {
    try {
      const r = record.create({ type: CUSTOM_RECORD_ID });
      const satPct = limits.accountConcurrencyLimit > 0
        ? ((limits.accountConcurrencyLimit - limits.unallocatedConcurrencyLimit)
            / limits.accountConcurrencyLimit * 100)
        : 0;

      r.setValue('name',           decision.action + ' · ' + new Date().toISOString().slice(0, 16));
      r.setValue(F.ACCOUNT_LIMIT,  limits.accountConcurrencyLimit);
      r.setValue(F.UNALLOCATED,    limits.unallocatedConcurrencyLimit);
      r.setValue(F.SATURATION_PCT, satPct);
      r.setValue(F.ACTION,         decision.action);
      r.setValue(F.DOMAIN,         decision.domain);
      r.setValue(F.URGENCY,        decision.urgency);
      r.setValue(F.CONFIDENCE,     decision.confidence);
      r.setValue(F.REASON,         decision.reason);
      r.setValue(F.ENRICHMENT_SRC, enrichment.source);
      r.setValue(F.MANUAL_TRAIL,   decision.manual ? JSON.stringify(decision.manual) : '');
      r.save();
      log.audit('SAVE_OK', 'Log persistido com sucesso');
    } catch (e) {
      log.error('SAVE_LOG_ERROR', e.message);
    }
  };

  // ── ALERTA ───────────────────────────────────────────────────────────
  const sendAlert = (decision, limits) => {
    try {
      const manualHtml = decision.manual
        ? `<p><b>Navegação:</b> ${decision.manual.navigation}</p>
           <p><b>Limite da conta:</b> ${decision.manual.currentAccountLimit}</p>
           <p><b>Unallocated:</b> ${decision.manual.currentUnallocated}</p>
           <p><b>Referência:</b> <a href="${decision.manual.referenceDoc}">Documentação Oracle</a></p>`
        : '';

      email.send({
        author:     runtime.getCurrentUser().id,
        recipients: [runtime.getCurrentUser().id],
        subject:    `[Governance Advisor] ${decision.urgency} · ${decision.action} · confidence: ${decision.confidence}`,
        body: `<h2>Adaptive Integration Governance Advisor</h2>
          <p><b>Ação:</b> ${decision.action} (Domínio ${decision.domain})</p>
          <p><b>Urgência:</b> ${decision.urgency} · <b>Confiança:</b> ${decision.confidence}</p>
          <p><b>Motivo:</b> ${decision.reason}</p>
          <p><b>Concorrência:</b> ${limits.accountConcurrencyLimit - limits.unallocatedConcurrencyLimit}
             / ${limits.accountConcurrencyLimit} · Livre: ${limits.unallocatedConcurrencyLimit}</p>
          ${manualHtml}`
      });
      log.audit('ALERT_SENT', `Urgency: ${decision.urgency}`);
    } catch (e) {
      log.error('ALERT_ERROR', e.message);
    }
  };

  return { execute };
});
