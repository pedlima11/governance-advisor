/**
 * Discovery focado no scriptexecutionlog — testa cada coluna individualmente.
 *
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 */
define(['N/search', 'N/log'],
  (search, log) => {

  const onRequest = (context) => {
    const result = {
      timestamp: new Date().toISOString(),
      validColumns: [],
      invalidColumns: [],
      sampleData: null,
      errorSample: null,
      totalRecords: 0,
    };

    // Todas as colunas possíveis do scriptexecutionlog
    const candidates = [
      'internalid',
      'date',
      'time',
      'title',
      'detail',
      'type',
      'name',
      'script',
      'scripttype',
      'owner',
      'user',
      'audience',
      'deployment',
      'level',
      'loglevel',
      'logtype',
      'scriptid',
      'scriptname',
      'deploymentid',
      'context',
      'executioncontext',
      'created',
      'datecreated',
      'recordtype',
      'status',
      'duration',
      'elapsed',
      'runtime',
      'executiontime',
    ];

    // Testar cada coluna individualmente
    candidates.forEach(col => {
      try {
        const s = search.create({
          type: 'scriptexecutionlog',
          columns: [col],
        });
        s.run().getRange({ start: 0, end: 1 });
        result.validColumns.push(col);
      } catch (e) {
        result.invalidColumns.push(col);
      }
    });

    // Contar total
    try {
      const s = search.create({
        type: 'scriptexecutionlog',
        columns: [],
      });
      result.totalRecords = s.runPaged().count;
    } catch (e) {
      result.totalRecords = 'error: ' + e.message.substring(0, 100);
    }

    // Buscar amostra com colunas válidas
    if (result.validColumns.length > 0) {
      try {
        const cols = result.validColumns.map(c =>
          search.createColumn({ name: c })
        );
        // Adicionar sort se 'date' é válido
        if (result.validColumns.includes('date')) {
          cols[result.validColumns.indexOf('date')] =
            search.createColumn({ name: 'date', sort: search.Sort.DESC });
        }

        const s = search.create({
          type: 'scriptexecutionlog',
          columns: cols,
        });

        const samples = [];
        s.run().getRange({ start: 0, end: 5 }).forEach(row => {
          const record = {};
          result.validColumns.forEach(c => {
            record[c] = {
              value: row.getValue(c),
              text: row.getText(c),
            };
          });
          samples.push(record);
        });
        result.sampleData = samples;
      } catch (e) {
        result.sampleData = { error: e.message.substring(0, 300) };
      }

      // Buscar amostra de ERROS
      try {
        const cols = result.validColumns.map(c =>
          search.createColumn({ name: c })
        );
        if (result.validColumns.includes('date')) {
          cols[result.validColumns.indexOf('date')] =
            search.createColumn({ name: 'date', sort: search.Sort.DESC });
        }

        const s = search.create({
          type: 'scriptexecutionlog',
          filters: [['type', 'is', 'ERROR']],
          columns: cols,
        });

        const errors = [];
        s.run().getRange({ start: 0, end: 10 }).forEach(row => {
          const record = {};
          result.validColumns.forEach(c => {
            record[c] = {
              value: row.getValue(c),
              text: row.getText(c),
            };
          });
          errors.push(record);
        });
        result.errorSample = errors;
      } catch (e) {
        result.errorSample = { error: e.message.substring(0, 300) };
      }
    }

    // Testar joins comuns (script.name, script.scripttype via join)
    const joinTests = [
      { name: 'name', join: 'script' },
      { name: 'scripttype', join: 'script' },
      { name: 'scriptid', join: 'script' },
      { name: 'owner', join: 'script' },
      { name: 'name', join: 'deployment' },
      { name: 'scriptid', join: 'deployment' },
      { name: 'title', join: 'deployment' },
    ];

    result.validJoins = [];
    result.invalidJoins = [];

    joinTests.forEach(jt => {
      try {
        const s = search.create({
          type: 'scriptexecutionlog',
          columns: [
            search.createColumn({ name: jt.name, join: jt.join }),
          ],
        });
        const rows = s.run().getRange({ start: 0, end: 1 });
        const val = rows.length > 0 ? {
          value: rows[0].getValue({ name: jt.name, join: jt.join }),
          text: rows[0].getText({ name: jt.name, join: jt.join }),
        } : null;
        result.validJoins.push({
          column: `${jt.join}.${jt.name}`,
          sample: val,
        });
      } catch (e) {
        result.invalidJoins.push({
          column: `${jt.join}.${jt.name}`,
          error: e.message.substring(0, 150),
        });
      }
    });

    context.response.setHeader({ name: 'Content-Type', value: 'application/json' });
    context.response.write(JSON.stringify(result, null, 2));
  };

  return { onRequest };
});
