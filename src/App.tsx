import { useMemo, useState } from "react";
import "./styles.css";
import {
  Conflict,
  LedgerState,
  Result,
  RULES,
  addCorrection,
  addSession,
  closeCase,
  confirmSession,
  registerCase,
  reopenCase,
  requestDowngrade,
  upsertSafetyPlan,
} from "./domain/ledger";
import { seedState } from "./domain/seed";
import { CaseDetail } from "./components/CaseDetail";
import { ConflictPanel, NoticePanel } from "./components/ConflictPanel";
import { LedgerTable } from "./components/LedgerTable";
import { RegisterCaseForm } from "./components/RegisterCaseForm";

function App() {
  const [state, setState] = useState<LedgerState>(seedState);
  const [selectedId, setSelectedId] = useState<string>(seedState.cases[0]?.id ?? "");
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const [notices, setNotices] = useState<string[]>([]);

  /** 统一执行台账操作：成功入账 / 冲突展示（个案、日期、风险级别、命中的限制） */
  const run = (r: Result<LedgerState>, afterOk?: (s: LedgerState) => void) => {
    if (r.ok) {
      setState(r.value);
      setConflict(null);
      setNotices(r.notices);
      afterOk?.(r.value);
    } else {
      setConflict(r.conflict);
      setNotices([]);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const selected = state.cases.find((c) => c.id === selectedId) ?? state.cases[0] ?? null;

  const metrics = useMemo(() => {
    const active = state.cases.filter((c) => c.status === "active");
    return [
      { label: "在案个案", value: active.length, cls: "status-ok" },
      { label: "高风险个案", value: active.filter((c) => c.riskLevel === "high").length, cls: "status-danger" },
      {
        label: "待督导确认",
        value: state.cases.flatMap((c) => c.sessions).filter((s) => s.riskLevel === "high" && !s.confirmation).length,
        cls: "status-watch",
      },
      { label: "已结案冻结", value: state.cases.filter((c) => c.status === "closed").length, cls: "status-ok" },
    ];
  }, [state]);

  return (
    <main className="app-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">hxwl-12 · 心理咨询个案记录</p>
          <h1>危机分级台账</h1>
          <p className="subtitle">
            按个案登记日期、风险级别与干预目标入账；高风险附安全计划，督导确认前下一次会谈不能落盘；
            降级须连续两次低风险并写明依据；结案冻结后更正留痕，重开自动校验一致性。
          </p>
        </div>
        <div className="stack-card">
          <span>台账限制规则</span>
          <ul className="rules-list">
            {Object.values(RULES).map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      </section>

      <section className="metrics-grid">
        {metrics.map((m) => (
          <article key={m.label} className="metric-card">
            <span>{m.label}</span>
            <strong>{m.value}</strong>
            <i className={m.cls} />
          </article>
        ))}
      </section>

      {conflict && <ConflictPanel conflict={conflict} onDismiss={() => setConflict(null)} />}
      {notices.length > 0 && <NoticePanel notices={notices} onDismiss={() => setNotices([])} />}

      <div className="layout">
        <div className="left-col">
          <LedgerTable cases={state.cases} selectedId={selected?.id ?? ""} onSelect={setSelectedId} />
          <RegisterCaseForm
            onRegister={(draft) =>
              run(registerCase(state, draft), (s) => setSelectedId(s.cases[s.cases.length - 1].id))
            }
          />
        </div>

        {selected && (
          <CaseDetail
            record={selected}
            onAddSession={(draft) => run(addSession(state, selected.id, draft))}
            onConfirm={(sessionId, supervisor, note) => run(confirmSession(state, selected.id, sessionId, supervisor, note))}
            onDowngrade={(target, by) => run(requestDowngrade(state, selected.id, target, by))}
            onClose={(reason, by) => run(closeCase(state, selected.id, reason, by))}
            onReopen={(reason, by) => run(reopenCase(state, selected.id, reason, by))}
            onCorrect={(draft) => run(addCorrection(state, selected.id, draft))}
            onSafetyPlan={(plan, by) => run(upsertSafetyPlan(state, selected.id, plan, by))}
          />
        )}
      </div>
    </main>
  );
}

export default App;
