import { AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';

interface ErrorScript {
  scriptId: string;
  scriptName: string;
  scriptType: string;
  errorCount: number;
  lastSeen: string;
  firstSeen: string;
  errorTitles: { title: string; count: number }[];
  recentErrors: { date: string; time: string; title: string; detail: string }[];
}

interface Props {
  errors: {
    totalErrors: number;
    uniqueScripts: number;
    topErrors: ErrorScript[];
  };
}

export function ErrorRanking({ errors }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);

  const typeColors: Record<string, string> = {
    RESTLET: '#5A9AB5',
    SCHEDULED: '#8B7ECF',
    SCRIPTLET: '#E8CC7A',
    USEREVENT: '#6ECB8B',
    MAPREDUCE: '#FF8675',
  };

  return (
    <div className="card">
      <h2 className="card-title">
        <AlertTriangle size={20} />
        Top Scripts com Erro
        <span className="badge badge-red">{errors.totalErrors} erros</span>
        <span className="badge badge-gray">{errors.uniqueScripts} scripts</span>
      </h2>

      <div className="error-list">
        {errors.topErrors.map((script) => {
          const isExpanded = expanded === script.scriptId;
          const pct = errors.totalErrors > 0
            ? ((script.errorCount / errors.totalErrors) * 100).toFixed(1)
            : '0';

          return (
            <div key={script.scriptId} className="error-item">
              <div
                className="error-header"
                onClick={() => setExpanded(isExpanded ? null : script.scriptId)}
              >
                <div className="error-bar-bg">
                  <div
                    className="error-bar-fill"
                    style={{
                      width: `${pct}%`,
                      backgroundColor: typeColors[script.scriptType] || '#64748b',
                    }}
                  />
                </div>
                <div className="error-info">
                  <span className="error-name">{script.scriptName}</span>
                  <div className="error-tags">
                    <span
                      className="badge"
                      style={{ backgroundColor: typeColors[script.scriptType] || '#64748b', color: '#fff' }}
                    >
                      {script.scriptType}
                    </span>
                    <span className="error-count">{script.errorCount} erros ({pct}%)</span>
                    <span className="error-dates">{script.firstSeen} → {script.lastSeen}</span>
                  </div>
                </div>
                {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </div>

              {isExpanded && (
                <div className="error-details">
                  <div className="error-titles">
                    <span className="detail-label">Tipos de erro:</span>
                    {script.errorTitles.map((t, i) => (
                      <div key={i} className="error-title-row">
                        <span className="error-title-name">{t.title}</span>
                        <span className="error-title-count">{t.count}x</span>
                      </div>
                    ))}
                  </div>

                  {script.recentErrors.length > 0 && (
                    <div className="error-recent">
                      <span className="detail-label">Erros recentes:</span>
                      {script.recentErrors.map((e, i) => (
                        <div key={i} className="error-recent-item">
                          <span className="error-recent-date">{e.date} {e.time}</span>
                          <span className="error-recent-title">{e.title}</span>
                          <span className="error-recent-detail">{e.detail}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
