import { getScoreColor, getScoreLabel } from '../utils/scoring';

interface ScoreGaugeProps {
  score: number;
  size?: number;
}

export function ScoreGauge({ score, size = 120 }: ScoreGaugeProps) {
  const color = getScoreColor(score);
  const label = getScoreLabel(score);
  const radius = (size - 16) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = (score / 100) * circumference;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke="#1E2A38" strokeWidth={8}
        />
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke={color} strokeWidth={8}
          strokeDasharray={circumference}
          strokeDashoffset={circumference - progress}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}
        />
        <text
          x={size / 2} y={size / 2 - 4}
          textAnchor="middle" dominantBaseline="middle"
          fill={color} fontSize={size * 0.28} fontWeight="bold" fontFamily="JetBrains Mono, monospace"
        >
          {score}
        </text>
        <text
          x={size / 2} y={size / 2 + size * 0.16}
          textAnchor="middle" dominantBaseline="middle"
          fill="#5C6F80" fontSize={size * 0.1} fontFamily="DM Sans, sans-serif"
        >
          {label}
        </text>
      </svg>
    </div>
  );
}
