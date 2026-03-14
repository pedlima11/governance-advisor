/**
 * Setup Suitelet — Cria o Custom Record Type e campos do Governance Advisor
 * Deploy como Suitelet, execute uma vez, depois desative.
 *
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 */
define(['N/record', 'N/log'], (record, log) => {

  const RECORD_SCRIPTID = 'customrecord_adv_gov_log';

  const FIELDS = [
    { scriptid: 'custrecord_adv_account_limit',   label: 'Account Limit',      fieldtype: 'INTEGER',  description: 'Limite total de concorrência da conta' },
    { scriptid: 'custrecord_adv_unallocated',      label: 'Unallocated',        fieldtype: 'INTEGER',  description: 'Slots de concorrência livres' },
    { scriptid: 'custrecord_adv_saturation_pct',   label: 'Saturation %',       fieldtype: 'PERCENT',  description: 'Percentual de saturação do pool' },
    { scriptid: 'custrecord_adv_action',           label: 'Action',             fieldtype: 'TEXT',     description: 'Ação recomendada pelo motor' },
    { scriptid: 'custrecord_adv_domain',           label: 'Domain',             fieldtype: 'TEXT',     description: 'Domínio (A/B/AB/NONE)' },
    { scriptid: 'custrecord_adv_urgency',          label: 'Urgency',            fieldtype: 'TEXT',     description: 'Nível de urgência (LOW/MEDIUM/HIGH)' },
    { scriptid: 'custrecord_adv_confidence',       label: 'Confidence',         fieldtype: 'TEXT',     description: 'Nível de confiança (LOW/MEDIUM/HIGH)' },
    { scriptid: 'custrecord_adv_reason',           label: 'Reason',             fieldtype: 'TEXTAREA', description: 'Justificativa da decisão' },
    { scriptid: 'custrecord_adv_enrichment_src',   label: 'Enrichment Source',  fieldtype: 'TEXT',     description: 'Fonte (SUITEQL/PARTIAL/NONE)' },
    { scriptid: 'custrecord_adv_manual_trail',     label: 'Manual Trail JSON',  fieldtype: 'TEXTAREA', description: 'JSON com trilha manual' },
  ];

  const onRequest = (context) => {
    const results = {
      timestamp: new Date().toISOString(),
      steps: [],
      success: false,
    };

    try {
      // Passo 1: Criar o Custom Record Type
      const crt = record.create({ type: 'customrecordtype' });
      crt.setValue({ fieldId: 'recordname', value: 'ADV Governance Log' });
      crt.setValue({ fieldId: 'scriptid', value: RECORD_SCRIPTID });
      crt.setValue({ fieldId: 'description', value: 'Histórico de decisões do Adaptive Integration Governance Advisor' });
      crt.setValue({ fieldId: 'includename', value: true });
      crt.setValue({ fieldId: 'showid', value: true });
      crt.setValue({ fieldId: 'shownotes', value: false });

      const crtId = crt.save();
      results.steps.push({ step: 'CREATE_RECORD_TYPE', id: crtId, status: 'OK' });
      log.audit('SETUP', `Custom Record Type criado: ID ${crtId}`);

      // Passo 2: Criar os campos customizados
      for (const field of FIELDS) {
        try {
          const cf = record.create({ type: 'customrecordcustomfield' });
          cf.setValue({ fieldId: 'rectype', value: crtId });
          cf.setValue({ fieldId: 'label', value: field.label });
          cf.setValue({ fieldId: 'scriptid', value: field.scriptid });
          cf.setValue({ fieldId: 'fieldtype', value: field.fieldtype });
          cf.setValue({ fieldId: 'description', value: field.description });

          const cfId = cf.save();
          results.steps.push({ step: 'CREATE_FIELD', scriptid: field.scriptid, id: cfId, status: 'OK' });
          log.audit('SETUP', `Campo criado: ${field.scriptid} (ID ${cfId})`);
        } catch (fieldErr) {
          results.steps.push({ step: 'CREATE_FIELD', scriptid: field.scriptid, status: 'ERROR', error: fieldErr.message });
          log.error('SETUP_FIELD_ERROR', `${field.scriptid}: ${fieldErr.message}`);
        }
      }

      results.success = results.steps.every(s => s.status === 'OK');

    } catch (e) {
      results.steps.push({ step: 'CREATE_RECORD_TYPE', status: 'ERROR', error: e.message });
      log.error('SETUP_ERROR', e.message);
    }

    context.response.setHeader({ name: 'Content-Type', value: 'application/json' });
    context.response.write(JSON.stringify(results, null, 2));
  };

  return { onRequest };
});
