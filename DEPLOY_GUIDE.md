# Adaptive Integration Governance Advisor — Guia de Deploy
**Ambiente:** td3052652 · **Versão:** 3.1-adjusted

---

## Pré-requisitos
- Feature **REST Web Services** habilitada na conta
- Role com permissão para criar Custom Records e Scripts
- Acesso ao File Cabinet (SuiteScripts)

---

## Ordem de Deploy

### Passo 1: Custom Record (via Suitelet automatizado)
1. Acesse **Documents > Files > File Cabinet > SuiteScripts**
2. Crie pasta `AdaptiveGovernance`
3. Upload de `setup_custom_record_sl.js`
4. **Customization > Scripting > Scripts > New** → selecione `setup_custom_record_sl.js`
   - Script ID: `customscript_adv_setup`
   - Deployment ID: `customdeploy_adv_setup`
   - Status: **Testing**
   - Role: Administrator
5. Acesse a URL do Suitelet — ele criará automaticamente o Custom Record Type e todos os campos
6. Verifique que o JSON retornado mostra `"success": true`
7. Desative o deployment após execução bem-sucedida
8. Campos criados:

| Campo | Script ID | Tipo |
|-------|-----------|------|
| Account Limit | `custrecord_adv_account_limit` | Integer |
| Unallocated | `custrecord_adv_unallocated` | Integer |
| Saturation % | `custrecord_adv_saturation_pct` | Percent |
| Action | `custrecord_adv_action` | Free-Form Text |
| Domain | `custrecord_adv_domain` | Free-Form Text |
| Urgency | `custrecord_adv_urgency` | List (LOW/MEDIUM/HIGH) |
| Confidence | `custrecord_adv_confidence` | List (LOW/MEDIUM/HIGH) |
| Reason | `custrecord_adv_reason` | Long Text |
| Enrichment Source | `custrecord_adv_enrichment_src` | Free-Form Text |
| Manual Trail JSON | `custrecord_adv_manual_trail` | Long Text |

### Passo 2: Upload dos Scripts restantes
1. Na mesma pasta `SuiteScripts/AdaptiveGovernance`, upload de:
   - `adv_governance_advisor_ss.js`
   - `test_gate01_sl.js`

### Passo 3: Gate 0.1 — Validar governanceLimits
1. **Customization > Scripting > Scripts > New**
2. Selecione `test_gate01_sl.js`
3. Configurar:
   - Script ID: `customscript_adv_gate01_test`
   - Deployment ID: `customdeploy_adv_gate01_test`
   - Status: **Testing**
   - Role: Administrator
4. Acesse a URL do Suitelet
5. Verifique o JSON retornado:
   ```json
   {
     "validation": {
       "hasAccountConcurrencyLimit": true,
       "hasUnallocatedConcurrencyLimit": true,
       "gate_passed": true
     }
   }
   ```
6. Se `gate_passed: true` → prosseguir para o Passo 4
7. Se `gate_passed: false` → **PARAR** — anotar shape real e ajustar script

### Passo 4: Scheduled Script
1. **Customization > Scripting > Scripts > New**
2. Selecione `adv_governance_advisor_ss.js`
3. Configurar:
   - Script ID: `customscript_adv_governance_advisor`
   - Deployment ID: `customdeploy_adv_governance_advisor`
   - Status: **Testing** (primeiro)
   - Log Level: AUDIT
4. Execute manualmente uma vez (botão "Save and Execute")
5. Verifique nos logs:
   - `LIMITS` — dados do governanceLimits
   - `HISTORY` — contagem de entradas históricas
   - `ENRICHMENT` — source + backlog
   - `DECISION` — ação recomendada
   - `SAVE_OK` — log persistido
6. Verifique o Custom Record — deve ter 1 registro criado
7. Se tudo OK → mudar status para **Scheduled**
8. Configurar schedule: **Every 4 hours** (ajustável)

---

## Arquitetura de Decisão (fluxo do motor)

```
unallocated === 0?
  ├── SIM + recorrente (≥6 janelas) → EVALUATE_SC_PLUS_PURCHASE (HIGH)
  └── SIM + isolado                 → REALLOCATE_IF_SUPPORTED (MEDIUM)

saturation > 85% + backlog > 10?
  └── SIM → INVESTIGATE_COMBINED_PRESSURE (HIGH)

saturation > 85% + unallocated > 0?
  └── SIM → REDUCE_EXTERNAL_PARALLELISM (MEDIUM)

backlog > 10 + saturation < 50%?
  └── SIM → INVESTIGATE_SCRIPT_PROCESSORS (MEDIUM)

saturation > 70%?
  └── SIM → MONITOR (LOW)

default → HOLD (LOW)
```

---

## Limitações Conhecidas (pós Fase 0)

| Limitação | Impacto | Mitigação futura |
|-----------|---------|------------------|
| `webserviceslog` indisponível | Sem dados por integração | Habilitar Web Services Usage Log na conta |
| `integration` record indisponível | Sem PATCH automático | Usar Integration Governance UI manualmente |
| Enrichment parcial | Apenas backlog de scripts | Reativar bloco SuiteQL quando tabelas disponíveis |
