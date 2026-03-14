# Fase 0 — Relatório de Validação dos Gates
**Ambiente:** td3052652
**Data:** 2026-03-13
**Versão do Plano:** 3.1

---

## Gate 0.1 — governanceLimits

| Item | Resultado |
|------|-----------|
| Endpoint | `/services/rest/system/v1/governanceLimits` |
| Testável via MCP? | **NÃO** — é um endpoint de sistema, não um record type |
| Status | **PENDENTE** — requer teste manual via REST API Browser ou SuiteScript |
| Impacto se falhar | **Bloqueia tudo** |

**Ação:** Usar o script `test_gate01.js` (Suitelet) para validar o shape real do endpoint antes do deploy do Scheduled Script.

---

## Gate 0.2 — Tabelas SuiteQL

### webserviceslog
| Item | Resultado |
|------|-----------|
| Existe no metadata catalog? | **NÃO** — HTTP 404 |
| Existe via query direta? | **NÃO** — "Tipo de pesquisa inválida" |
| Variações testadas | `webserviceslog`, `WebServicesUsageLog`, `webservicesoperationlog` |
| **Conclusão** | **NÃO DISPONÍVEL** neste ambiente |

### scheduledscriptinstance
| Item | Resultado |
|------|-----------|
| Existe no metadata catalog? | **SIM** |
| Query funcional? | **SIM** — `SELECT COUNT(*) AS backlog FROM scheduledscriptinstance WHERE status IN ('PENDING','RESTART')` retorna `backlog: 0` |
| Campos disponíveis | `internalId`, `mapReduceStage`, `endDate`, `percentComplete`, `dateCreated`, `startDate`, `timestampCreated`, `queue`, `taskId`, `status` |
| Campos **NÃO disponíveis** | `id`, `scriptid`, `integrationid`, `script` |

### integration (tabela SuiteQL)
| Item | Resultado |
|------|-----------|
| Existe no metadata catalog? | **NÃO** — HTTP 404 |
| Existe via query direta? | **NÃO** — "Tipo de pesquisa inválida" |
| **Conclusão** | **NÃO DISPONÍVEL** — sem dados de concorrência por integração |

**Impacto no Enrichment:**
- Query com JOIN `webserviceslog ↔ integration` é **inviável**
- Enrichment reduzido a: backlog de `scheduledscriptinstance` apenas
- `IntegrationMetric[]` sempre vazio → `source: 'PARTIAL'`
- `candidateIntegration` no ManualTrail sempre `null`

---

## Gate 0.3 — Integration Record (REST API)

| Item | Resultado |
|------|-----------|
| Endpoint testado | `/services/rest/record/v1/integration` |
| Existe como record type REST? | **NÃO** — HTTP 404 |
| `concurrencyLimit` writable? | **NÃO TESTÁVEL** — record não existe |
| **Conclusão** | **AUTOMAÇÃO DESABILITADA** |

**Impacto:** PATCH `/record/v1/integration/{id}` não é possível. Output sempre via ManualTrail.

---

## Resumo dos Impactos

| Camada | Status | Detalhes |
|--------|--------|----------|
| **MVP** | ✅ Viável (pendente Gate 0.1) | governanceLimits + Custom Record + Motor + Dashboard |
| **Enrichment** | ⚠️ Parcial | Apenas `scheduledscriptinstance` backlog. Sem dados por integração. |
| **Automação** | ❌ Desabilitada | `integration` record não acessível via REST |

---

## Ajustes Aplicados ao Script

1. `collectEnrichment()` → queries de `webserviceslog` removidas, mantém apenas backlog
2. `readHistory()` → sort corrigido para `created` DESC (era `saturation_pct` DESC)
3. `buildManualTrail()` → `candidateIntegration` sempre `null` (sem dados por integração)
4. Motor de decisão → simplificado para operar com `governanceLimits` + histórico + backlog
5. Automação PATCH → removida do fluxo
