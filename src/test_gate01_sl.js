/**
 * Gate 0.1 — Validador de governanceLimits
 * Deploy como Suitelet para teste manual antes do Scheduled Script.
 *
 * Após deploy:
 *   1. Acesse via URL do Suitelet
 *   2. Verifique o JSON retornado
 *   3. Confirme que accountConcurrencyLimit e unallocatedConcurrencyLimit existem
 *   4. Se OK → Gate 0.1 ✅ → prosseguir com deploy do Scheduled Script
 *
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 */
define(['N/https', 'N/log'], (https, log) => {

  const onRequest = (context) => {
    const result = {
      gate: '0.1',
      endpoint: '/system/v1/governanceLimits',
      timestamp: new Date().toISOString(),
      success: false,
      data: null,
      error: null,
      validation: {
        hasAccountConcurrencyLimit: false,
        hasUnallocatedConcurrencyLimit: false,
        gate_passed: false,
      }
    };

    try {
      const r = https.requestSuiteTalkRest({
        method: https.Method.GET,
        url: '/system/v1/governanceLimits',
      });

      const body = JSON.parse(r.body);
      result.success = true;
      result.data = body;

      // Validar campos esperados
      result.validation.hasAccountConcurrencyLimit =
        typeof body.accountConcurrencyLimit === 'number';
      result.validation.hasUnallocatedConcurrencyLimit =
        typeof body.accountUnallocatedConcurrencyLimit === 'number';
      result.validation.gate_passed =
        result.validation.hasAccountConcurrencyLimit &&
        result.validation.hasUnallocatedConcurrencyLimit;

      log.audit('GATE_0.1', JSON.stringify(result));

    } catch (e) {
      result.error = e.message;
      log.error('GATE_0.1_FAIL', e.message);
    }

    context.response.setHeader({ name: 'Content-Type', value: 'application/json' });
    context.response.write(JSON.stringify(result, null, 2));
  };

  return { onRequest };
});
