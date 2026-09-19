import { useState } from "react";
import { CaseRecord, RiskLevel, SafetyPlan } from "../domain/types";
import { latestSession, riskLabel } from "../domain/rules";
import { RiskBadge } from "./ui";

const EMPTY_PLAN: SafetyPlan = {
  warningSigns: "",
  copingSteps: "",
  supporters: "",
  professionalContacts: "",
  environmentSafety: "",
};

const PLAN_FIELDS: { key: keyof SafetyPlan; label: string; placeholder: string }[] = [
  { key: "warningSigns", label: "预警信号", placeholder: "如：念头反复、失眠、回避社交" },
  { key: "copingSteps", label: "自身应对步骤", placeholder: "可立即执行的 2-3 步行动" },
  { key: "supporters", label: "可联系的支持者", placeholder: "关系与可联系时段" },
  { key: "professionalContacts", label: "专业求助渠道", placeholder: "危机热线 / 急诊资源" },
  { key: "environmentSafety", label: "环境安全措施", placeholder: "危险物管理、看护安排" },
];

export interface SessionDraft {
  date: string;
  riskLevel: RiskLevel;
  goal: string;
  summary: string;
  downgradeBasis: string;
  safetyPlan: SafetyPlan;
}

export function SessionForm({
  cas,
  disabled,
  onSubmit,
}: {
  cas: CaseRecord;
  disabled: boolean;
  onSubmit: (draft: SessionDraft) => void;
}) {
  const [draft, setDraft] = useState<SessionDraft>({
    date: "",
    riskLevel: "medium",
    goal: "",
    summary: "",
    downgradeBasis: "",
    safetyPlan: EMPTY_PLAN,
  });
  const last = latestSession(cas);
  const high = draft.riskLevel === "high";
  // 上上次为高于低风险 + 上次为低风险时，本次低风险将构成“连续第二次低风险”
  const ordered = [...cas.sessions].sort((a, b) => a.date.localeCompare(b.date));
  const willCompleteDowngrade =
    draft.riskLevel === "low" &&
    ordered.at(-1)?.riskLevel === "low" &&
    ordered.at(-2) &&
    ordered[ordered.length - 2].riskLevel !== "low";
  const firstLow = draft.riskLevel === "low" && last && last.riskLevel !== "low";

  function set<K extends keyof SessionDraft>(key: K, value: SessionDraft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  return (
    <form
      className="session-form"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(draft);
        setDraft({
          date: "",
          riskLevel: "medium",
          goal: "",
          summary: "",
          downgradeBasis: "",
          safetyPlan: EMPTY_PLAN,
        });
      }}
    >
      <div className="form-row">
        <label>
          <span>会谈日期 *</span>
          <input
            type="date"
            required
            value={draft.date}
            disabled={disabled}
            onChange={(e) => set("date", e.target.value)}
          />
        </label>
        <label>
          <span>风险级别 *（上次：{last ? riskLabel(last.riskLevel) : "登记"}）</span>
          <div className="seg">
            {(["high", "medium", "low"] as RiskLevel[]).map((l) => (
              <button
                type="button"
                key={l}
                disabled={disabled}
                className={`seg-btn ${draft.riskLevel === l ? "seg-on" : ""} seg-${l}`}
                onClick={() => set("riskLevel", l)}
              >
                {riskLabel(l)}
              </button>
            ))}
          </div>
        </label>
      </div>
      <label>
        <span>干预目标 *</span>
        <input
          required
          disabled={disabled}
          value={draft.goal}
          placeholder="本次会谈的干预目标"
          onChange={(e) => set("goal", e.target.value)}
        />
      </label>
      <label>
        <span>会谈摘要</span>
        <textarea
          rows={2}
          disabled={disabled}
          value={draft.summary}
          placeholder="主要内容与来访者状态"
          onChange={(e) => set("summary", e.target.value)}
        />
      </label>

      {firstLow && (
        <p className="hint hint-watch">
          本次为连续第 1 次低风险，进入<b>观察期</b>，生效级别暂不下降；须再连续一次低风险方可降级。
          <RiskBadge level={draft.riskLevel} effective={false} />
        </p>
      )}
      {willCompleteDowngrade && (
        <label className="basis-field">
          <span>降级判断依据 *（连续两次低风险，写明依据方可降级生效）</span>
          <textarea
            rows={2}
            required
            disabled={disabled}
            value={draft.downgradeBasis}
            placeholder="如：两次会谈期间无危机事件、量表分数变化、社会功能恢复、支持者反馈……"
            onChange={(e) => set("downgradeBasis", e.target.value)}
          />
        </label>
      )}

      {high && (
        <fieldset className="safety-plan">
          <legend>⚠ 安全计划（高风险必填，五项齐全方可登记）</legend>
          <div className="plan-grid">
            {PLAN_FIELDS.map((f) => (
              <label key={f.key}>
                <span>{f.label} *</span>
                <textarea
                  rows={2}
                  required
                  disabled={disabled}
                  value={draft.safetyPlan[f.key]}
                  placeholder={f.placeholder}
                  onChange={(e) =>
                    set("safetyPlan", { ...draft.safetyPlan, [f.key]: e.target.value })
                  }
                />
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <button className="primary-action" type="submit" disabled={disabled}>
        登记会谈并落盘
      </button>
    </form>
  );
}
