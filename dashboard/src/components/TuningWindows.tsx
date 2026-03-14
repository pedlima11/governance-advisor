import { ScoreGauge } from './ScoreGauge';
import { Trophy, ArrowUp, ArrowDown, Minus, User, Calendar } from 'lucide-react';

interface TuningWindow {
  id: string;
  label: string;
  tunedAt: string;
  tunedBy: string;
  tunedVia: string;
  changes: { deployment: string; field: string; from: any; to: any }[];
  metrics: {
    totalErrors: number;
    avgExecTime: number;
    scriptBacklog: number;
    mrFailedStages: number;
    saturationPct: number;
    loginFailures: number;
  };
  score: number;
}

interface Props {
  windows: TuningWindow[];
}

export function TuningWindows({ windows }: Props) {
  const best = windows.reduce((a, b) => a.score < b.score ? a : b, windows[0]);

  return (
    <div className="card">
      <h2 className="card-title">
        <Trophy size={20} />
        Comparação de Tunings
      </h2>
      <div className="windows-grid">
        {windows.map((w) => {
          const isBest = w.id === best.id;
          const isCurrent = w === windows[windows.length - 1];
          return (
            <div
              key={w.id}
              className={`window-card ${isBest ? 'window-best' : ''} ${isCurrent ? 'window-current' : ''}`}
            >
              <div className="window-header">
                <span className="window-label">
                  {w.label}
                  {isBest && <span className="badge badge-green">MELHOR</span>}
                  {isCurrent && !isBest && <span className="badge badge-yellow">ATUAL</span>}
                </span>
              </div>

              <ScoreGauge score={w.score} size={100} />

              <div className="window-meta">
                <span><User size={12} /> {w.tunedBy}</span>
                <span><Calendar size={12} /> {new Date(w.tunedAt).toLocaleDateString('pt-BR')}</span>
                <span className="badge badge-gray">{w.tunedVia}</span>
              </div>

              <div className="window-metrics">
                <MetricRow label="Erros" value={w.metrics.totalErrors} best={best.metrics.totalErrors} />
                <MetricRow label="Tempo médio" value={w.metrics.avgExecTime} best={best.metrics.avgExecTime} suffix="s" />
                <MetricRow label="Backlog" value={w.metrics.scriptBacklog} best={best.metrics.scriptBacklog} />
                <MetricRow label="M/R falhas" value={w.metrics.mrFailedStages} best={best.metrics.mrFailedStages} />
                <MetricRow label="Saturação" value={w.metrics.saturationPct} best={best.metrics.saturationPct} suffix="%" />
                <MetricRow label="Login falhas" value={w.metrics.loginFailures} best={best.metrics.loginFailures} />
              </div>

              {w.changes.length > 0 && (
                <div className="window-changes">
                  <span className="changes-title">Alterações:</span>
                  {w.changes.map((c, i) => (
                    <span key={i} className="change-item">
                      {c.deployment}: {c.field} {c.from ?? '∅'} → {c.to ?? '∅'}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MetricRow({ label, value, best, suffix = '' }: {
  label: string; value: number; best: number; suffix?: string;
}) {
  const isBest = value === best;
  const isWorse = value > best;

  return (
    <div className="metric-row">
      <span className="metric-label">{label}</span>
      <span className={`metric-value ${isBest ? 'metric-best' : isWorse ? 'metric-worse' : ''}`}>
        {value}{suffix}
        {isBest ? <Minus size={12} style={{ color: '#6ECB8B' }} /> :
         isWorse ? <ArrowUp size={12} style={{ color: '#FF8675' }} /> :
         <ArrowDown size={12} style={{ color: '#6ECB8B' }} />}
      </span>
    </div>
  );
}
