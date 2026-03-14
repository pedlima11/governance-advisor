import { Activity, Cpu, Clock, Layers } from 'lucide-react';

interface Props {
  snapshot: any;
}

export function GovernanceHeader({ snapshot }: Props) {
  const gov = snapshot.governance;
  const exec = snapshot.executions;
  const config = snapshot.config;
  const errors = snapshot.errors;

  const cards = [
    {
      icon: Activity,
      label: 'Concorrência',
      value: `${gov.allocated}/${gov.accountConcurrencyLimit}`,
      sub: `${gov.saturationPct.toFixed(0)}% saturação`,
      color: gov.saturationPct > 85 ? '#FF8675' : gov.saturationPct > 70 ? '#E8CC7A' : '#6ECB8B',
    },
    {
      icon: Cpu,
      label: 'Erros Ativos',
      value: errors.totalErrors.toLocaleString(),
      sub: `${errors.uniqueScripts} scripts`,
      color: errors.totalErrors > 500 ? '#FF8675' : errors.totalErrors > 100 ? '#E8CC7A' : '#6ECB8B',
    },
    {
      icon: Clock,
      label: 'Backlog',
      value: exec.currentBacklog.toString(),
      sub: 'scripts pendentes',
      color: exec.currentBacklog > 10 ? '#FF8675' : exec.currentBacklog > 0 ? '#E8CC7A' : '#6ECB8B',
    },
    {
      icon: Layers,
      label: 'Deployments',
      value: config.totalDeployments.toString(),
      sub: Object.entries(config.byType as Record<string, { count: number }>)
        .map(([k, v]) => `${v.count} ${k}`)
        .join(' · '),
      color: '#5A9AB5',
    },
  ];

  return (
    <div className="header-grid">
      {cards.map((card, i) => (
        <div key={i} className="header-card">
          <div className="header-card-icon" style={{ color: card.color }}>
            <card.icon size={24} />
          </div>
          <div className="header-card-content">
            <span className="header-card-label">{card.label}</span>
            <span className="header-card-value" style={{ color: card.color }}>{card.value}</span>
            <span className="header-card-sub">{card.sub}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
