import { CheckCircle, XCircle } from 'lucide-react';

interface Props {
  snapshot: any;
  bestWindow: any;
  currentWindow: any;
}

export function StatusPanel({ snapshot, bestWindow, currentWindow }: Props) {
  const works: string[] = [];
  const fails: string[] = [];

  // Analyze what works
  if (snapshot.executions.currentBacklog === 0) {
    works.push('Fila de scripts limpa — zero backlog');
  }
  if (snapshot.mapReduce.failedStages.length === 0) {
    works.push('Map/Reduce sem falhas — todos os stages completam');
  }
  if (snapshot.governance.saturationPct < 70) {
    works.push(`Concorrência saudável (${snapshot.governance.saturationPct.toFixed(0)}%)`);
  }
  const lowFailApps = snapshot.loginAudit?.items?.filter((a: any) => a.failurePct < 5) || [];
  if (lowFailApps.length > 0) {
    works.push(`${lowFailApps.length} integração(ões) com taxa de erro baixa`);
  }

  // Check if best window config improved things
  if (bestWindow && currentWindow && bestWindow.score < currentWindow.score) {
    const changes = bestWindow.changes || [];
    changes.forEach((c: any) => {
      works.push(`"${bestWindow.label}": ${c.deployment} com ${c.field}=${c.to ?? 'removido'} funcionou (score ${bestWindow.score})`);
    });
  }

  // Analyze what fails
  snapshot.errors.topErrors.forEach((e: any) => {
    if (e.errorCount > 50) {
      fails.push(`${e.scriptName} (${e.scriptType}): ${e.errorCount} erros — "${e.errorTitles[0]?.title}"`);
    }
  });

  if (snapshot.governance.saturationPct > 85) {
    fails.push(`Saturação de concorrência em ${snapshot.governance.saturationPct.toFixed(0)}%`);
  }
  if (snapshot.executions.currentBacklog > 10) {
    fails.push(`${snapshot.executions.currentBacklog} scripts pendentes na fila`);
  }
  if (snapshot.mapReduce.failedStages.length > 0) {
    fails.push(`${snapshot.mapReduce.failedStages.length} stages de M/R falhando`);
  }

  // Check if current config is worse than best
  if (bestWindow && currentWindow && currentWindow.score > bestWindow.score * 1.2) {
    const reverted = currentWindow.changes || [];
    reverted.forEach((c: any) => {
      fails.push(`"${currentWindow.label}": ${c.deployment} com ${c.field}=${c.to ?? 'removido'} piorou performance`);
    });
  }

  return (
    <div className="status-grid">
      <div className="card status-card status-works">
        <h3 className="status-title">
          <CheckCircle size={18} style={{ color: '#6ECB8B' }} />
          O Que Funciona
        </h3>
        {works.length > 0 ? (
          <ul className="status-list">
            {works.map((w, i) => (
              <li key={i} className="status-item status-item-ok">{w}</li>
            ))}
          </ul>
        ) : (
          <p className="status-empty">Nenhum ponto positivo identificado</p>
        )}
      </div>

      <div className="card status-card status-fails">
        <h3 className="status-title">
          <XCircle size={18} style={{ color: '#FF8675' }} />
          O Que Não Funciona
        </h3>
        {fails.length > 0 ? (
          <ul className="status-list">
            {fails.map((f, i) => (
              <li key={i} className="status-item status-item-fail">{f}</li>
            ))}
          </ul>
        ) : (
          <p className="status-empty">Nenhum problema crítico identificado</p>
        )}
      </div>
    </div>
  );
}
