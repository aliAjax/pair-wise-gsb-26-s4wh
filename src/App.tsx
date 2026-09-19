import { useMemo, useState } from "react";
import "./styles.css";
import { Conflict, Ledger, RiskLevel, SafetyPlan } from "./domain/types";
import {
  addSession,
  applyCorrection,
  auditLedger,
  closeCase,
  confirmSession,
  createCase,
  effectiveCurrentRisk,
  latestSession,
  reopenCase,
  reopenConsistency,
} from "./domain/rules";
import { seedLedger } from "./domain/seed";
import { ConflictBanner, NoticeBanner, RiskBadge, StatusPill } from "./components/ui";
import { CaseDetail, Role } from "./components/CaseDetail";
import { SessionDraft } from "./components/SessionForm";

type RiskFilter = "all" | RiskLevel | "pending";

const EMPTY_PLAN: SafetyPlan = {
  warningSigns: "",
  copingSteps: "",
  supporters: "",
  professionalContacts: "",
  environmentSafety: "",
};

const PLAN_LABELS: { key: keyof SafetyPlan; label: string }[] = [
  { key: "warningSigns", label: "预警信号" },
  { key: "copingSteps", label: "应对步骤" },
  { key: "supporters", label: "支持者" },
  { key: "professionalContacts", label: "专业求助渠道" },
  { key: "environmentSafety", label: "环境安全措施" },
];

function App() {
  const [ledger, setLedger] = useState<Ledger>(seedLedger);
  const [role, setRole] = useState<Role>("counselor");
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string>("C-101");
  const [riskFilter, setRiskFilter] = useState<RiskFilter>("all");
  const [query, setQuery] = useState("");
  const [showIntake, setShowIntake] = useState(false);
  const [globalAudit, setGlobalAudit] = useState<Conflict[]>([]);

  // 新个案登记表单
  const [intake, setIntake] = useState({
    id: "",
    registeredAt: "",
    clientCode: "",
    counselor: "王旻",
    topic: "",
    riskLevel: "medium" as RiskLevel,
    goal: "",
    summary: "",
    safetyPlan: EMPTY_PLAN,
  });

  const fail = (c: Conflict | null) => {
    setConflict(c);
    setNotice(null);
    return c;
  };
  const ok = (msg: string) => {
    setNotice(msg);
    setConflict(null);
    return null;
  };

  const metrics = useMemo(() => {
    const open = ledger.cases.filter((c) => c.status !== "closed");
    const highRisk = open.filter((c) => effectiveCurrentRisk(c) === "high").length;
    const pending = ledger.cases.reduce(
      (n, c) => n + c.sessions.filter((s) => s.confirm !== "confirmed").length,
      0
    );
    const auditFaults = auditLedger(ledger).length;
    return [
      { label: "活跃个案", value: open.length, tone: "ok" },
      { label: "高风险关注（生效级别）", value: highRisk, tone: "danger" },
      { label: "待督导确认会谈", value: pending, tone: "watch" },
      { label: "重开一致性异常", value: auditFaults, tone: auditFaults ? "danger" : "ok" },
    ];
  }, [ledger]);

  const filtered = ledger.cases.filter((c) => {
    if (query) {
      const q = query.trim().toLowerCase();
      if (!c.id.toLowerCase().includes(q) && !c.clientCode.toLowerCase().includes(q)) return false;
    }
    if (riskFilter === "all") return true;
    if (riskFilter === "pending")
      return c.sessions.some((s) => s.confirm !== "confirmed");
    return effectiveCurrentRisk(c) === riskFilter;
  });

  const selected = ledger.cases.find((c) => c.id === selectedId);

  // ---- 写操作：全部走规则引擎 ----
  const handleCreate = () => {
    const res = createCase(ledger, intake);
    if (!res.ok) return fail(res.conflict);
    setLedger(res.value);
    setSelectedId(intake.id);
    setShowIntake(false);
    setIntake({
      id: "",
      registeredAt: "",
      clientCode: "",
      counselor: "王旻",
      topic: "",
      riskLevel: "medium",
      goal: "",
      summary: "",
      safetyPlan: EMPTY_PLAN,
    });
    ok(`个案 ${intake.id} 已按登记日期 ${res.value.cases.at(-1)?.registeredAt} 登记。`);
  };

  const handleAddSession = (caseId: string, draft: SessionDraft) =>
    mutate(addSession(ledger, caseId, draft), `会谈已登记并落盘（待督导确认）。`);

  const handleConfirm = (caseId: string, sessionId: string, supervisor: string) =>
    mutate(confirmSession(ledger, caseId, sessionId, supervisor), `督导 ${supervisor} 已确认，下一次会谈允许落盘。`);

  const handleClose = (caseId: string) =>
    mutate(closeCase(ledger, caseId), "个案已结案，记录冻结；后续修改只能走更正流程。");

  const handleReopen = (caseId: string, reason: string) =>
    mutate(reopenCase(ledger, caseId, reason), "个案已重开，请执行一致性核对。");

  const handleCorrect = (
    caseId: string,
    sessionId: string,
    payload: { field: string; corrected: string; reason: string; responsible: string }
  ) => {
    const target = ledger.cases.find((c) => c.id === caseId)?.sessions.find((s) => s.id === sessionId);
    if (!target) return fail({ code: "SESSION_NOT_FOUND", message: "会谈不存在。", caseId });
    const original =
      payload.field === "goal" ? target.goal : payload.field === "date" ? target.date : target.summary;
    return mutate(
      applyCorrection(ledger, caseId, {
        targetType: "session",
        targetId: sessionId,
        field: payload.field,
        original,
        corrected: payload.corrected,
        reason: payload.reason,
        responsible: payload.responsible,
      }),
      "更正已提交，原内容、原因与责任人已留痕。"
    );
  };

  function mutate(res: { ok: true; value: Ledger } | { ok: false; conflict: Conflict }, msg: string) {
    if (!res.ok) return fail(res.conflict);
    setLedger(res.value);
    return ok(msg);
  }

  const handleAuditOne = (caseId: string) => {
    const cas = ledger.cases.find((c) => c.id === caseId);
    if (!cas) return [];
    const faults = reopenConsistency(cas);
    if (faults.length === 0) setNotice(`个案 ${caseId} 一致性核对通过。`);
    else {
      setConflict(faults[0]);
      setNotice(null);
    }
    return faults;
  };

  const handleAuditAll = () => {
    const faults = auditLedger(ledger);
    setGlobalAudit(faults);
    if (faults.length === 0) setNotice("全部重开个案核对通过：个案、会谈、确认与更正记录一致。");
  };

  return (
    <main className="app-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">hxwl-12 · 危机分级台账 · port 5112</p>
          <h1>心理咨询个案危机分级台账</h1>
          <p className="subtitle">
            按登记日期、风险级别与干预目标管理个案；高风险强制安全计划，督导确认前下一次会谈不落盘，
            降级须连续两次低风险并写明依据，结案冻结、更正留痕，重开后一致性核对。
          </p>
        </div>
        <div className="stack-card">
          <span>当前角色</span>
          <div className="role-switch">
            {(
              [
                ["counselor", "咨询师"],
                ["supervisor", "督导"],
                ["admin", "机构管理员"],
              ] as [Role, string][]
            ).map(([r, label]) => (
              <button
                key={r}
                className={`role-btn ${role === r ? "role-on" : ""}`}
                onClick={() => setRole(r)}
              >
                {label}
              </button>
            ))}
          </div>
          <strong>
            {role === "counselor" ? "咨询师" : role === "supervisor" ? "督导" : "机构管理员"}视角：
            {role === "supervisor" ? "可确认会谈" : role === "admin" ? "可确认 / 结案 / 全局核对" : "登记与更正"}
          </strong>
        </div>
      </section>

      <NoticeBanner notice={notice} onClose={() => setNotice(null)} />
      <ConflictBanner conflict={conflict} onClose={() => setConflict(null)} />
      {globalAudit.length > 0 && (
        <div className="audit-summary panel">
          <h3>全局一致性核对：{globalAudit.length} 个个案存在冲突</h3>
          {globalAudit.map((c, i) => (
            <ConflictBanner key={i} conflict={c} />
          ))}
          <button onClick={() => setGlobalAudit([])}>收起</button>
        </div>
      )}

      <section className="metrics-grid">
        {metrics.map((m) => (
          <article className="metric-card" key={m.label}>
            <span>{m.label}</span>
            <strong>{m.value}</strong>
            <i className={`status-${m.tone}`} />
          </article>
        ))}
      </section>

      <section className="workspace">
        <aside className="panel narrow">
          <h2>台账筛选</h2>
          <input
            className="search"
            placeholder="搜索个案号 / 来访者代号"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="chips muted filter-chips">
            {(
              [
                ["all", "全部"],
                ["high", "高风险"],
                ["medium", "中风险"],
                ["low", "低风险"],
                ["pending", "待督导确认"],
              ] as [RiskFilter, string][]
            ).map(([f, label]) => (
              <button
                key={f}
                className={riskFilter === f ? "chip-on" : ""}
                onClick={() => setRiskFilter(f)}
              >
                {label}
              </button>
            ))}
          </div>
          <button className="primary-action full" onClick={() => setShowIntake((v) => !v)}>
            {showIntake ? "收起登记表" : "＋ 新个案登记"}
          </button>
          <button className="full" onClick={handleAuditAll}>
            对全部重开个案做一致性核对
          </button>
          <p className="hint rules-hint">
            规则：①高风险附安全计划 ②未督导确认下次会谈不落盘 ③降级须连续两次低风险+依据
            ④结案冻结 ⑤更正留原文/原因/责任人 ⑥重开一致性核对
          </p>
        </aside>

        <section className="panel ledger-list">
          <div className="section-heading">
            <div>
              <p>个案台账</p>
              <h2>
                共 {filtered.length} 例 <span className="muted-text">（总计 {ledger.cases.length} 例）</span>
              </h2>
            </div>
          </div>
          <div className="case-cards">
            {filtered.map((c) => {
              const risk = effectiveCurrentRisk(c);
              const last = latestSession(c);
              const pending = last && last.confirm !== "confirmed";
              return (
                <button
                  key={c.id}
                  className={`case-card ${selectedId === c.id ? "case-card-on" : ""}`}
                  onClick={() => setSelectedId(c.id)}
                >
                  <div className="case-card-top">
                    <strong>{c.id}</strong>
                    <StatusPill status={c.status} />
                  </div>
                  <span className="case-client">{c.clientCode} · {c.topic}</span>
                  <div className="case-card-meta">
                    {risk && <RiskBadge level={risk} />}
                    <span className={pending ? "meta-danger" : "meta"}>
                      {pending ? "上次会谈待督导确认" : `登记 ${c.registeredAt}`}
                    </span>
                  </div>
                  <span className="meta">{c.sessions.length} 次会谈 · {c.corrections.length} 条更正</span>
                </button>
              );
            })}
          </div>
        </section>
      </section>

      {showIntake && (
        <section className="panel intake-panel">
          <div className="section-heading">
            <div>
              <p>咨询师登记</p>
              <h2>新个案登记（登记日期 · 风险级别 · 干预目标）</h2>
            </div>
          </div>
          <div className="field-grid">
            <label>
              <span>个案编号 *</span>
              <input
                value={intake.id}
                placeholder="如 C-508"
                onChange={(e) => setIntake({ ...intake, id: e.target.value })}
              />
            </label>
            <label>
              <span>个案登记日期 *</span>
              <input
                type="date"
                value={intake.registeredAt}
                onChange={(e) => setIntake({ ...intake, registeredAt: e.target.value })}
              />
            </label>
            <label>
              <span>来访者代号 *</span>
              <input
                value={intake.clientCode}
                onChange={(e) => setIntake({ ...intake, clientCode: e.target.value })}
              />
            </label>
            <label>
              <span>咨询师 *</span>
              <input
                value={intake.counselor}
                onChange={(e) => setIntake({ ...intake, counselor: e.target.value })}
              />
            </label>
            <label className="span-2">
              <span>咨询主题</span>
              <input
                value={intake.topic}
                onChange={(e) => setIntake({ ...intake, topic: e.target.value })}
              />
            </label>
            <label className="span-2">
              <span>初始风险级别 *</span>
              <div className="seg">
                {(["high", "medium", "low"] as RiskLevel[]).map((l) => (
                  <button
                    type="button"
                    key={l}
                    className={`seg-btn ${intake.riskLevel === l ? "seg-on" : ""} seg-${l}`}
                    onClick={() => setIntake({ ...intake, riskLevel: l })}
                  >
                    {l === "high" ? "高风险（须附安全计划）" : l === "medium" ? "中风险" : "低风险"}
                  </button>
                ))}
              </div>
            </label>
            <label className="span-2">
              <span>干预目标 *</span>
              <input
                value={intake.goal}
                placeholder="首次会谈的干预目标"
                onChange={(e) => setIntake({ ...intake, goal: e.target.value })}
              />
            </label>
          </div>

          {intake.riskLevel === "high" && (
            <fieldset className="safety-plan">
              <legend>⚠ 安全计划（高风险强制，五项齐全）</legend>
              <div className="plan-grid">
                {PLAN_LABELS.map((f) => (
                  <label key={f.key}>
                    <span>{f.label} *</span>
                    <textarea
                      rows={2}
                      value={intake.safetyPlan[f.key]}
                      onChange={(e) =>
                        setIntake({
                          ...intake,
                          safetyPlan: { ...intake.safetyPlan, [f.key]: e.target.value },
                        })
                      }
                    />
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          <button className="primary-action" onClick={handleCreate}>
            提交登记
          </button>
        </section>
      )}

      {selected && (
        <CaseDetail
          key={selected.id}
          cas={selected}
          role={role}
          onAddSession={handleAddSession}
          onConfirm={handleConfirm}
          onClose={handleClose}
          onReopen={handleReopen}
          onCorrect={handleCorrect}
          onAudit={handleAuditOne}
        />
      )}

      <footer className="app-footer">
        规则引擎见 <code>src/domain/rules.ts</code>（纯函数，可单测）· 演示数据见{" "}
        <code>src/domain/seed.ts</code>
      </footer>
    </main>
  );
}

export default App;
