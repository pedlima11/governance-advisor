import { useState } from 'react';
import { ClipboardList, AlertCircle, Info, CheckCircle, ChevronDown, ChevronRight, MapPin, Zap } from 'lucide-react';
import type { Playbook } from '../utils/scoring';

interface Props {
  playbooks: Playbook[];
}

const priorityConfig = {
  HIGH: { icon: AlertCircle, color: '#FF8675', accent: '#FF8675', glow: 'rgba(255, 134, 117, 0.12)', label: 'URGENTE', pulse: true },
  MEDIUM: { icon: Info, color: '#E8CC7A', accent: '#E8CC7A', glow: 'rgba(232, 204, 122, 0.08)', label: 'ATENÇÃO', pulse: false },
  LOW: { icon: CheckCircle, color: '#6ECB8B', accent: '#6ECB8B', glow: 'rgba(110, 203, 139, 0.06)', label: 'OK', pulse: false },
};

export function PlaybookPanel({ playbooks }: Props) {
  const [expandedIdx, setExpandedIdx] = useState<number>(0);

  return (
    <div className="card">
      <h2 className="card-title">
        <ClipboardList size={20} />
        O Que Fazer
        <span className="pb-count">{playbooks.length} ações</span>
      </h2>

      <div className="pb-list">
        {playbooks.map((pb, i) => {
          const cfg = priorityConfig[pb.priority];
          const Icon = cfg.icon;
          const isOpen = expandedIdx === i;

          return (
            <div
              key={i}
              className={`pb-card ${isOpen ? 'pb-card-open' : ''}`}
              style={{
                '--pb-accent': cfg.accent,
                '--pb-glow': cfg.glow,
              } as React.CSSProperties}
            >
              {/* Accent strip */}
              <div className="pb-accent-strip" style={{ background: cfg.accent }} />

              {/* Header — clickable */}
              <button
                className="pb-trigger"
                onClick={() => setExpandedIdx(isOpen ? -1 : i)}
              >
                <div className="pb-icon-wrap" style={{ background: cfg.glow }}>
                  <Icon size={18} style={{ color: cfg.color }} />
                </div>

                <div className="pb-trigger-content">
                  <span className="pb-action-title">{pb.action}</span>
                  {!isOpen && (
                    <span className="pb-action-preview">{pb.description.slice(0, 80)}…</span>
                  )}
                </div>

                <span className="pb-priority-tag" style={{ background: cfg.glow, color: cfg.color }}>
                  <Zap size={10} />
                  {cfg.label}
                </span>

                <span className="pb-chevron">
                  {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </span>
              </button>

              {/* Expandable body */}
              {isOpen && (
                <div className="pb-body">
                  <p className="pb-description">{pb.description}</p>

                  <div className="pb-timeline">
                    {pb.steps.map((step, j) => (
                      <div key={j} className="pb-step">
                        <div className="pb-step-indicator">
                          <span className="pb-step-dot" style={{ borderColor: cfg.accent }}>
                            {j + 1}
                          </span>
                          {j < pb.steps.length - 1 && <div className="pb-step-line" />}
                        </div>
                        <div className="pb-step-content">{step}</div>
                      </div>
                    ))}
                  </div>

                  {pb.navigation && (
                    <div className="pb-navigation">
                      <MapPin size={12} />
                      <span>{pb.navigation}</span>
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
