/**
 * Test Decision Engine — Suitelet de Simulação
 * Injeta cenários falsos no decide() para validar cada branch do motor.
 *
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 */
define(['N/log'], (log) => {

  // ── IDs reais (mesmos do script principal) ───────────────────────────
  const HISTORY_WINDOW = 6;

  const THRESHOLDS = {
    saturation_high:     85,
    saturation_medium:   70,
    recurrence_window:   HISTORY_WINDOW,
    script_backlog_warn: 10,
  };

  // ── MOTOR DE DECISÃO (cópia exata do principal) ─────────────────────
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

    if (unallocated === 0 && recentSaturations >= THRESHOLDS.recurrence_window) {
      return { ...base, action: 'EVALUATE_SC_PLUS_PURCHASE', domain: 'A', urgency: 'HIGH',
        reason: `Pool esgotado em ${recentSaturations}/${HISTORY_WINDOW} janelas recentes. Rebalanceamento já não resolve. Avaliar compra de SC+.`,
        manual: buildManualTrail(limits) };
    }

    if (unallocated === 0 && recentSaturations < THRESHOLDS.recurrence_window) {
      return { ...base, action: 'REALLOCATE_IF_SUPPORTED', domain: 'A', urgency: 'MEDIUM',
        reason: `Pool esgotado (${saturationPct.toFixed(0)}%) — ocorrência isolada. Redistribuir slots antes de avaliar SC+.`,
        manual: buildManualTrail(limits) };
    }

    if (saturationPct > THRESHOLDS.saturation_high && scriptBacklog > THRESHOLDS.script_backlog_warn) {
      return { ...base, action: 'INVESTIGATE_COMBINED_PRESSURE', domain: 'AB', urgency: 'HIGH',
        reason: `Concorrência em ${saturationPct.toFixed(0)}% + ${scriptBacklog} scripts pendentes. Domínios A e B podem ter causas independentes.`,
        manual: buildManualTrail(limits) };
    }

    if (saturationPct > THRESHOLDS.saturation_high && unallocated > 0) {
      return { ...base, action: 'REDUCE_EXTERNAL_PARALLELISM', domain: 'A', urgency: 'MEDIUM',
        reason: `Pressão em ${saturationPct.toFixed(0)}% com ${unallocated} slots disponíveis. Reduzir paralelismo nos clientes de integração.`,
        manual: buildManualTrail(limits) };
    }

    if (scriptBacklog > THRESHOLDS.script_backlog_warn && saturationPct < 50) {
      return { ...base, action: 'INVESTIGATE_SCRIPT_PROCESSORS', domain: 'B', urgency: 'MEDIUM',
        reason: `${scriptBacklog} scripts pendentes sem saturação de concorrência WS. Investigar design, prioridade e dependency chain.`,
        manual: null };
    }

    if (saturationPct > THRESHOLDS.saturation_medium) {
      return { ...base, action: 'MONITOR', domain: 'A', urgency: 'LOW',
        reason: `Saturação em ${saturationPct.toFixed(0)}% — acima do limiar médio (${THRESHOLDS.saturation_medium}%). Monitorar nas próximas janelas.`,
        manual: null };
    }

    return { ...base, action: 'HOLD', domain: 'NONE', urgency: 'LOW',
      reason: `Sistema estável. Concorrência em ${saturationPct.toFixed(0)}%.`,
      manual: null };
  };

  const buildManualTrail = (limits) => ({
    navigation:           'Setup > Integration > Integration Management > Integration Governance',
    currentAccountLimit:  limits.accountConcurrencyLimit,
    currentUnallocated:   limits.unallocatedConcurrencyLimit,
    candidateIntegration: null,
    referenceDoc:         'https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/bridgehead_156224824287.html'
  });

  // ── CENÁRIOS DE TESTE ───────────────────────────────────────────────
  const buildScenarios = () => {
    // Histórico com 6 janelas de saturação alta (simula recorrência)
    const historyHighSaturation = Array.from({ length: 6 }, (_, i) => ({
      saturation_pct: 90 + i,
      action: 'REDUCE_EXTERNAL_PARALLELISM',
      urgency: 'MEDIUM',
      unallocated: 0,
      enrichment_source: 'NONE',
      timestamp: new Date(Date.now() - i * 4 * 3600000).toISOString(),
    }));

    // Histórico com apenas 2 janelas de saturação alta
    const historyPartial = historyHighSaturation.slice(0, 2);

    return [
      {
        name: '1. HOLD — Sistema estável (situação atual real)',
        limits: { accountConcurrencyLimit: 5, unallocatedConcurrencyLimit: 5 },
        enrichment: { source: 'NONE', integrations: [], scriptBacklog: 0, collectedAt: new Date().toISOString() },
        history: [],
        expect: { action: 'HOLD', urgency: 'LOW', domain: 'NONE' },
      },
      {
        name: '2. MONITOR — Saturação média (75%)',
        limits: { accountConcurrencyLimit: 20, unallocatedConcurrencyLimit: 5 },
        enrichment: { source: 'NONE', integrations: [], scriptBacklog: 0, collectedAt: new Date().toISOString() },
        history: [],
        expect: { action: 'MONITOR', urgency: 'LOW', domain: 'A' },
      },
      {
        name: '3. REDUCE_EXTERNAL_PARALLELISM — Saturação alta com slots livres',
        limits: { accountConcurrencyLimit: 20, unallocatedConcurrencyLimit: 2 },
        enrichment: { source: 'NONE', integrations: [], scriptBacklog: 0, collectedAt: new Date().toISOString() },
        history: [],
        expect: { action: 'REDUCE_EXTERNAL_PARALLELISM', urgency: 'MEDIUM', domain: 'A' },
      },
      {
        name: '4. REALLOCATE_IF_SUPPORTED — Pool esgotado, ocorrência isolada',
        limits: { accountConcurrencyLimit: 20, unallocatedConcurrencyLimit: 0 },
        enrichment: { source: 'NONE', integrations: [], scriptBacklog: 0, collectedAt: new Date().toISOString() },
        history: historyPartial,
        expect: { action: 'REALLOCATE_IF_SUPPORTED', urgency: 'MEDIUM', domain: 'A' },
      },
      {
        name: '5. EVALUATE_SC_PLUS_PURCHASE — Pool esgotado, recorrente (6 janelas)',
        limits: { accountConcurrencyLimit: 20, unallocatedConcurrencyLimit: 0 },
        enrichment: { source: 'NONE', integrations: [], scriptBacklog: 0, collectedAt: new Date().toISOString() },
        history: historyHighSaturation,
        expect: { action: 'EVALUATE_SC_PLUS_PURCHASE', urgency: 'HIGH', domain: 'A' },
      },
      {
        name: '6. INVESTIGATE_SCRIPT_PROCESSORS — Backlog alto sem saturação WS',
        limits: { accountConcurrencyLimit: 20, unallocatedConcurrencyLimit: 15 },
        enrichment: { source: 'PARTIAL', integrations: [], scriptBacklog: 25, collectedAt: new Date().toISOString() },
        history: [],
        expect: { action: 'INVESTIGATE_SCRIPT_PROCESSORS', urgency: 'MEDIUM', domain: 'B' },
      },
      {
        name: '7. INVESTIGATE_COMBINED_PRESSURE — Saturação alta + backlog alto',
        limits: { accountConcurrencyLimit: 20, unallocatedConcurrencyLimit: 2 },
        enrichment: { source: 'PARTIAL', integrations: [], scriptBacklog: 20, collectedAt: new Date().toISOString() },
        history: [],
        expect: { action: 'INVESTIGATE_COMBINED_PRESSURE', urgency: 'HIGH', domain: 'AB' },
      },
      {
        name: '8. Confidence LOW → MEDIUM → HIGH',
        limits: { accountConcurrencyLimit: 5, unallocatedConcurrencyLimit: 5 },
        enrichment: { source: 'NONE', integrations: [], scriptBacklog: 0, collectedAt: new Date().toISOString() },
        history: [],  // será substituído em runtime
        expect: { confidence_progression: ['LOW', 'MEDIUM', 'HIGH'] },
      },
    ];
  };

  // ── EXECUÇÃO DOS TESTES ─────────────────────────────────────────────
  const runTests = () => {
    const scenarios = buildScenarios();
    const results = [];
    let passed = 0;
    let failed = 0;

    scenarios.forEach((scenario, idx) => {

      // Cenário especial: testar progressão de confidence
      if (scenario.expect.confidence_progression) {
        const progression = scenario.expect.confidence_progression;
        const subResults = [];

        // LOW: sem histórico
        const r0 = decide(scenario.limits, scenario.enrichment, []);
        const p0 = r0.confidence === progression[0];
        subResults.push({ history_size: 0, expected: progression[0], got: r0.confidence, pass: p0 });

        // MEDIUM: 3 entradas
        const hist3 = Array.from({ length: 3 }, () => ({
          saturation_pct: 10, action: 'HOLD', urgency: 'LOW', unallocated: 5, enrichment_source: 'NONE', timestamp: new Date().toISOString()
        }));
        const r1 = decide(scenario.limits, scenario.enrichment, hist3);
        const p1 = r1.confidence === progression[1];
        subResults.push({ history_size: 3, expected: progression[1], got: r1.confidence, pass: p1 });

        // HIGH: 6 entradas
        const hist6 = Array.from({ length: 6 }, () => ({
          saturation_pct: 10, action: 'HOLD', urgency: 'LOW', unallocated: 5, enrichment_source: 'NONE', timestamp: new Date().toISOString()
        }));
        const r2 = decide(scenario.limits, scenario.enrichment, hist6);
        const p2 = r2.confidence === progression[2];
        subResults.push({ history_size: 6, expected: progression[2], got: r2.confidence, pass: p2 });

        const allPass = p0 && p1 && p2;
        if (allPass) passed++; else failed++;
        results.push({ name: scenario.name, pass: allPass, subResults });
        return;
      }

      // Cenários normais
      const decision = decide(scenario.limits, scenario.enrichment, scenario.history);
      const checks = {};
      let allPass = true;

      if (scenario.expect.action) {
        checks.action = { expected: scenario.expect.action, got: decision.action, pass: decision.action === scenario.expect.action };
        if (!checks.action.pass) allPass = false;
      }
      if (scenario.expect.urgency) {
        checks.urgency = { expected: scenario.expect.urgency, got: decision.urgency, pass: decision.urgency === scenario.expect.urgency };
        if (!checks.urgency.pass) allPass = false;
      }
      if (scenario.expect.domain) {
        checks.domain = { expected: scenario.expect.domain, got: decision.domain, pass: decision.domain === scenario.expect.domain };
        if (!checks.domain.pass) allPass = false;
      }

      if (allPass) passed++; else failed++;
      results.push({ name: scenario.name, pass: allPass, checks, decision });
    });

    return { total: scenarios.length, passed, failed, results };
  };

  // ── SUITELET ENTRY POINT ────────────────────────────────────────────
  const onRequest = (context) => {
    const report = runTests();

    log.audit('TEST_REPORT', JSON.stringify(report));

    // HTML output
    let html = `
      <html><head>
      <style>
        body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
        h1 { color: #333; }
        .summary { font-size: 18px; margin: 20px 0; padding: 15px; background: ${report.failed === 0 ? '#d4edda' : '#f8d7da'}; border-radius: 8px; }
        .scenario { background: white; margin: 10px 0; padding: 15px; border-radius: 8px; border-left: 4px solid; }
        .pass { border-color: #28a745; }
        .fail { border-color: #dc3545; }
        .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-weight: bold; font-size: 12px; margin-right: 8px; }
        .badge-pass { background: #28a745; color: white; }
        .badge-fail { background: #dc3545; color: white; }
        .detail { color: #666; font-size: 13px; margin-top: 8px; }
        .decision { background: #f8f9fa; padding: 10px; border-radius: 4px; margin-top: 8px; font-family: monospace; font-size: 12px; white-space: pre-wrap; }
        table { border-collapse: collapse; margin-top: 8px; }
        td, th { padding: 4px 12px; border: 1px solid #ddd; font-size: 13px; }
        th { background: #f0f0f0; }
      </style>
      </head><body>
      <h1>Adaptive Governance Advisor — Motor de Decisão</h1>
      <div class="summary">
        <b>Resultado:</b> ${report.passed}/${report.total} cenários passaram
        ${report.failed === 0 ? ' ✓ Todos OK' : ` · ${report.failed} falharam`}
      </div>
    `;

    report.results.forEach(r => {
      const badge = r.pass
        ? '<span class="badge badge-pass">PASS</span>'
        : '<span class="badge badge-fail">FAIL</span>';

      html += `<div class="scenario ${r.pass ? 'pass' : 'fail'}">`;
      html += `${badge} <b>${r.name}</b>`;

      // Cenário de confidence
      if (r.subResults) {
        html += '<table><tr><th>Histórico</th><th>Esperado</th><th>Obtido</th><th></th></tr>';
        r.subResults.forEach(s => {
          html += `<tr>
            <td>${s.history_size} entradas</td>
            <td>${s.expected}</td>
            <td>${s.got}</td>
            <td>${s.pass ? '✓' : '✗'}</td>
          </tr>`;
        });
        html += '</table>';
      }

      // Cenários normais
      if (r.checks) {
        html += '<div class="detail">';
        Object.entries(r.checks).forEach(([key, v]) => {
          const icon = v.pass ? '✓' : '✗';
          html += `${icon} <b>${key}:</b> esperado <code>${v.expected}</code>, obtido <code>${v.got}</code><br>`;
        });
        html += '</div>';
      }

      if (r.decision) {
        html += `<div class="decision">${JSON.stringify(r.decision, null, 2)}</div>`;
      }

      html += '</div>';
    });

    html += '</body></html>';

    context.response.write(html);
  };

  return { onRequest };
});
