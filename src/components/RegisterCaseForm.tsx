import { useState } from "react";
import { RegisterCaseDraft, RiskLevel, RISK_LABEL, RULES, today } from "../domain/ledger";

interface Props {
  onRegister: (draft: RegisterCaseDraft) => void;
}

const EMPTY_PLAN = { warningSigns: "", copingStrategies: "", emergencyContacts: "", meansRestriction: "" };

/** 新个案登记：登记日期、风险级别、干预目标；高风险必须附安全计划 */
export function RegisterCaseForm({ onRegister }: Props) {
  const [clientAlias, setClientAlias] = useState("");
  const [counselor, setCounselor] = useState("");
  const [registeredAt, setRegisteredAt] = useState(today());
  const [riskLevel, setRiskLevel] = useState<RiskLevel>("low");
  const [goalsText, setGoalsText] = useState("");
  const [plan, setPlan] = useState(EMPTY_PLAN);

  const submit = () => {
    onRegister({
      clientAlias,
      counselor,
      registeredAt,
      riskLevel,
      goals: goalsText.split(/[\n;；]/).map((s) => s.trim()).filter(Boolean),
      safetyPlan: riskLevel === "high" ? { ...plan } : null,
      safetyPlanBy: counselor,
    });
    setClientAlias("");
    setGoalsText("");
    setPlan(EMPTY_PLAN);
  };

  const setPlanField = (key: keyof typeof EMPTY_PLAN) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setPlan({ ...plan, [key]: e.target.value });

  return (
    <section className="panel">
      <div className="section-heading">
        <div>
          <p>咨询师登记</p>
          <h2>新个案登记</h2>
        </div>
      </div>
      <div className="field-grid">
        <label>
          <span>来访者代号 *</span>
          <input value={clientAlias} onChange={(e) => setClientAlias(e.target.value)} placeholder="如：来访者-D08" />
        </label>
        <label>
          <span>咨询师 *</span>
          <input value={counselor} onChange={(e) => setCounselor(e.target.value)} placeholder="负责咨询师" />
        </label>
        <label>
          <span>登记日期 *</span>
          <input type="date" value={registeredAt} onChange={(e) => setRegisteredAt(e.target.value)} />
        </label>
        <label>
          <span>风险级别 *</span>
          <select value={riskLevel} onChange={(e) => setRiskLevel(e.target.value as RiskLevel)}>
            {(Object.keys(RISK_LABEL) as RiskLevel[]).map((l) => (
              <option key={l} value={l}>
                {RISK_LABEL[l]}
              </option>
            ))}
          </select>
        </label>
        <label className="span-2">
          <span>干预目标 *（每行一条）</span>
          <textarea
            rows={2}
            value={goalsText}
            onChange={(e) => setGoalsText(e.target.value)}
            placeholder={"如：\n降低焦虑自评分数\n建立规律作息"}
          />
        </label>
      </div>

      {riskLevel === "high" && (
        <fieldset className="safety-plan-form">
          <legend>{RULES.SAFETY_PLAN}</legend>
          <div className="field-grid">
            <label>
              <span>预警信号 *</span>
              <input value={plan.warningSigns} onChange={setPlanField("warningSigns")} placeholder="危机加重的信号" />
            </label>
            <label>
              <span>应对策略 *</span>
              <input value={plan.copingStrategies} onChange={setPlanField("copingStrategies")} placeholder="自我调节与求助步骤" />
            </label>
            <label>
              <span>紧急联系人 *</span>
              <input value={plan.emergencyContacts} onChange={setPlanField("emergencyContacts")} placeholder="亲属 / 危机热线" />
            </label>
            <label>
              <span>危险物品限制 *</span>
              <input value={plan.meansRestriction} onChange={setPlanField("meansRestriction")} placeholder="药物、器具的保管安排" />
            </label>
          </div>
        </fieldset>
      )}

      <div className="form-actions">
        <button type="button" className="primary-action" onClick={submit}>
          登记入账
        </button>
      </div>
    </section>
  );
}
