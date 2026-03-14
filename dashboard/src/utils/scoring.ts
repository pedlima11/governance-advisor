export interface WindowMetrics {
  totalErrors: number;
  avgExecTime: number;
  scriptBacklog: number;
  mrFailedStages: number;
  saturationPct: number;
  loginFailures: number;
}

const WEIGHTS = {
  errors: 0.35,
  execTime: 0.20,
  backlog: 0.15,
  mrFailed: 0.10,
  saturation: 0.15,
  loginFail: 0.05,
};

const normalize = (value: number, max: number): number =>
  max > 0 ? Math.min(value / max, 1) : 0;

export const calculateScore = (m: WindowMetrics): number => {
  const score =
    WEIGHTS.errors     * normalize(m.totalErrors, 2000) +
    WEIGHTS.execTime   * normalize(m.avgExecTime, 120) +
    WEIGHTS.backlog    * normalize(m.scriptBacklog, 50) +
    WEIGHTS.mrFailed   * normalize(m.mrFailedStages, 20) +
    WEIGHTS.saturation * normalize(m.saturationPct, 100) +
    WEIGHTS.loginFail  * normalize(m.loginFailures, 50);

  return Math.round(score * 100);
};

export const getScoreColor = (score: number): string => {
  if (score <= 30) return '#6ECB8B';
  if (score <= 60) return '#E8CC7A';
  return '#FF8675';
};

export const getScoreLabel = (score: number): string => {
  if (score <= 30) return 'Saudável';
  if (score <= 60) return 'Atenção';
  return 'Crítico';
};

export interface Playbook {
  action: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  description: string;
  steps: string[];
  navigation?: string;
}

export const generatePlaybooks = (
  snapshot: any,
  windows: any[]
): Playbook[] => {
  const playbooks: Playbook[] = [];
  const bestWindow = windows.reduce((a, b) => a.score < b.score ? a : b, windows[0]);
  const currentWindow = windows[windows.length - 1];

  // Top error scripts
  if (snapshot.errors?.topErrors?.length > 0) {
    const top = snapshot.errors.topErrors[0];
    if (top.errorCount > 100) {
      const topTitle = top.errorTitles?.[0]?.title || 'Unknown';
      playbooks.push({
        action: `Corrigir ${top.scriptName}`,
        priority: 'HIGH',
        description: `${top.errorCount} erros desde ${top.firstSeen}. Erro principal: "${topTitle}" (${top.errorTitles?.[0]?.count || 0}x).`,
        steps: [
          `Acesse Customization > Scripting > Scripts > busque "${top.scriptName}"`,
          `Verifique o Execution Log filtrado por Erro`,
          `Erro principal: "${topTitle}"`,
          top.recentErrors?.[0]?.detail
            ? `Detalhe: ${top.recentErrors[0].detail.substring(0, 200)}`
            : 'Analise os detalhes do erro no log',
          top.scriptType === 'RESTLET'
            ? 'Como é RESTlet, verifique se os Custom Records referenciados existem nesta conta'
            : 'Verifique dependências e permissões do script',
        ],
        navigation: 'Customization > Scripting > Scripts',
      });
    }
  }

  // Rollback recommendation
  if (bestWindow && currentWindow && bestWindow.id !== currentWindow.id) {
    const pctWorse = currentWindow.score > 0 && bestWindow.score > 0
      ? Math.round(((currentWindow.score - bestWindow.score) / bestWindow.score) * 100)
      : 0;

    if (pctWorse > 20) {
      const changeSteps = bestWindow.changes?.map(
        (c: any) => `${c.deployment}: ${c.field} → ${c.to ?? 'sem limite'}`
      ) || [];

      playbooks.push({
        action: `Rollback para "${bestWindow.label}"`,
        priority: 'HIGH',
        description: `Config atual é ${pctWorse}% pior que a melhor janela (${bestWindow.label}, score ${bestWindow.score}). Tuning feito por ${bestWindow.tunedBy} em ${new Date(bestWindow.tunedAt).toLocaleDateString('pt-BR')}.`,
        steps: [
          'Acesse Setup > Integration > Integration Management > Integration Governance',
          ...changeSteps.map((s: string) => `Ajuste: ${s}`),
          'Salve e aguarde a próxima coleta para verificar impacto',
        ],
        navigation: 'Setup > Integration > Integration Management',
      });
    }
  }

  // Saturation
  if (snapshot.governance?.saturationPct > 70) {
    playbooks.push({
      action: 'Reduzir saturação de concorrência',
      priority: snapshot.governance.saturationPct > 85 ? 'HIGH' : 'MEDIUM',
      description: `Saturação em ${snapshot.governance.saturationPct.toFixed(0)}%. ${snapshot.governance.unallocatedConcurrencyLimit} slots livres de ${snapshot.governance.accountConcurrencyLimit}.`,
      steps: [
        'Acesse Setup > Integration > Integration Management > Integration Governance',
        'Ordene por "Concurrency Allocated" decrescente',
        'Identifique integrações com limite alto e uso real baixo',
        'Reduza o limite dessas integrações para liberar slots',
        'Peça aos parceiros com maior volume para reduzir threads paralelas',
      ],
      navigation: 'Setup > Integration > Integration Management > Integration Governance',
    });
  }

  // Script backlog
  if (snapshot.executions?.currentBacklog > 10) {
    playbooks.push({
      action: 'Investigar backlog de scripts',
      priority: 'MEDIUM',
      description: `${snapshot.executions.currentBacklog} scripts pendentes na fila.`,
      steps: [
        'Acesse Customization > Scripting > Script Status',
        'Filtre por status PENDING e RESTART',
        'Identifique scripts que estão há mais tempo na fila',
        'Verifique se há scripts com yieldaftermins alto travando a fila',
        'Considere aumentar prioridade dos scripts críticos',
      ],
      navigation: 'Customization > Scripting > Script Status',
    });
  }

  // M/R failures
  if (snapshot.mapReduce?.failedStages?.length > 0) {
    playbooks.push({
      action: 'Investigar Map/Reduce com falha',
      priority: 'MEDIUM',
      description: `${snapshot.mapReduce.failedStages.length} stages com falha em Map/Reduce.`,
      steps: [
        'Acesse Customization > Scripting > Script Status',
        'Filtre por tipo Map/Reduce e status Failed',
        'Identifique em qual stage está falhando (GET_INPUT, MAP, REDUCE, SUMMARIZE)',
        'GET_INPUT: problema nos dados de entrada ou query',
        'MAP/REDUCE: problema no processamento individual — verifique o log do script',
        'SUMMARIZE: problema na consolidação — geralmente timeout ou limite de governance',
      ],
      navigation: 'Customization > Scripting > Script Status',
    });
  }

  // Login failures
  const highFailApps = snapshot.loginAudit?.items?.filter(
    (a: any) => a.failurePct > 5
  ) || [];
  if (highFailApps.length > 0) {
    playbooks.push({
      action: 'Investigar falhas de integração externa',
      priority: 'MEDIUM',
      description: `${highFailApps.length} integração(ões) com taxa de falha acima de 5%.`,
      steps: [
        'Acesse Setup > Integration > Integration Management',
        ...highFailApps.map(
          (a: any) => `${a.appName}: ${a.failures} falhas (${a.failurePct.toFixed(1)}%)`
        ),
        'Verifique se os tokens de acesso estão válidos',
        'Verifique se os roles associados têm as permissões necessárias',
      ],
      navigation: 'Setup > Integration > Integration Management',
    });
  }

  // If nothing critical, add a HOLD
  if (playbooks.length === 0) {
    playbooks.push({
      action: 'Sistema estável — monitorar',
      priority: 'LOW',
      description: 'Nenhuma ação imediata necessária. Continue monitorando.',
      steps: ['Próxima coleta em 4 horas'],
    });
  }

  return playbooks.sort((a, b) => {
    const order = { HIGH: 0, MEDIUM: 1, LOW: 2 };
    return order[a.priority] - order[b.priority];
  });
};
