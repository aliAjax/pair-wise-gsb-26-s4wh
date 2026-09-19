import { useMemo, useState } from "react";
import {
  CaseRecord,
  CorrectionDraft,
  RiskLevel,
  RISK_LABEL,
  RISK_ORDER,
  RULES,
  SafetyPlanDraft,
  Session,
  SessionDraft,
  CASE_CORRECTABLE_FIELDS,
  SESSION_CORRECTABLE_FIELDS,
  getFieldValue,
  today,
  verifyCaseConsistency,
} from "../domain/ledger";

export interface DetailHandlers {
  onAddSession: (draft: SessionDraft) => void;
  onConfirm: (sessionId: string, supervisor: string, note: string) => void;
  onDowngrade: (target: RiskLevel, by: string) => void;
  onClose: (reason: string, by: string) => void;
  onReopen: (reason: string, by: string) => void;
  onCorrect: (draft: CorrectionDraft) => void;
  onSafetyPlan: (plan: SafetyPlanDraft, by: string) => void;
}

type Props = { record: CaseRecord } & DetailHandlers;

export function CaseDetail(props: Props) {
  const { record } = props;
  const consistency = verifyCaseConsistency(record);
  const pendingHigh = record.sessions.filter((s) => s.riskLevel === "high" && !s.confirmation);

  return (
    <section className="panel case-detail">
      <header className="case-head">
        <div>
          <p>个案详情</p>
          <h2>
            {record.id} · {record.clientAlias}
          </h2>
          <p className="case-meta">
            咨询师 {record.counselor} · 登记于 {record.registeredAt} · 会谈 {record.sessions.length} 次
            {record.closedAt && ` · 结案于 ${record.closedAt}`}
          </p>
        </div>
        <div className="badge-stack">
          <span className={`badge risk-${record.riskLevel}`}>{RISK_LABEL[record.riskLevel]}</span>
          {record.status === "active" ? (
            <span className="badge status-active">在案</span>
          ) : (
            <span className="badge status-closed">已结案·冻结</span>
          )}
          {consistency.length === 0 ? (
            <span className="consistency ok">✓ 对应一致</span>
          ) : (
            <span className="consistency bad" title={consistency.join("\n")}>
              ⚠ 一致性 {consistency.length} 项问题
            </span>
          )}
        </div>
      </header>

      {record.status === "closed" && (
        <div className="frozen-banner">
          记录已冻结：{record.closeReason}。冻结期间仅可追加更正；如需继续会谈请先申请重开。
        </div>
      )}

      {pendingHigh.length > 0 && record.status === "active" && (
        <div className="gate-banner">
          {RULES.SUPERVISOR_GATE}：会谈 {pendingHigh.map((s) => `${s.id}（${s.date}）`).join("、")}{" "}
          待督导确认，确认前下一次会谈不能落盘。
        </div>
      )}

      <div className="detail-block">
        <h3>干预目标</h3>
        <div className="chips">
          {record.goals.map((g, i) => (
            <span key={i}>{g}</span>
          ))}
        </div>
      </div>

      <SafetyPlanSection record={record} onSafetyPlan={props.onSafetyPlan} />

      {record.riskLog.length > 0 && (
        <div className="detail-block">
          <h3>风险级别变更</h3>
          <ul className="audit-list">
            {record.riskLog.map((r, i) => (
              <li key={i}>
                <b>{r.date}</b> {RISK_LABEL[r.from]} → {RISK_LABEL[r.to]} · {r.reason}（{r.by}）
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="detail-block">
        <h3>会谈时间线</h3>
        {record.sessions.length === 0 && <p className="empty-hint">暂无会谈记录。</p>}
        {record.sessions.map((s) => (
          <SessionCard key={s.id} session={s} record={record} onConfirm={props.onConfirm} />
        ))}
      </div>

      {record.status === "active" ? (
        <>
          <SessionForm record={record} onAddSession={props.onAddSession} />
          <DowngradeBox record={record} onDowngrade={props.onDowngrade} />
          <CloseBox record={record} onClose={props.onClose} />
        </>
      ) : (
        <ReopenBox record={record} onReopen={props.onReopen} />
      )}

      <CorrectionForm record={record} onCorrect={props.onCorrect} />
      <CorrectionLog record={record} />
    </section>
  );
}

// ---------- 安全计划 ----------

const EMPTY_PLAN: SafetyPlanDraft = {
  warningSigns: "",
  copingStrategies: "",
  emergencyContacts: "",
  meansRestriction: "",
};

function SafetyPlanSection({
  record,
  onSafetyPlan,
}: {
  record: CaseRecord;
  onSafetyPlan: (plan: SafetyPlanDraft, by: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [plan, setPlan] = useState<SafetyPlanDraft>(record.safetyPlan ?? EMPTY_PLAN);
  const missing = record.riskLevel === "high" && !record.safetyPlan;

  const field =
    (key: keyof SafetyPlanDraft, label: string) =>
    (
      <label>
        <span>{label} *</span>
        <input value={plan[key]} onChange={(e) => setPlan({ ...plan, [key]: e.target.value })} />
      </label>
    );

  return (
    <div className="detail-block">
      <div className="block-head">
        <h3>安全计划</h3>
        {record.status === "active" && (
          <button type="button" className="text-btn" onClick={() => setEditing(!editing)}>
            {editing ? "收起" : record.safetyPlan ? "更新" : "补登"}
          </button>
        )}
      </div>
      {missing && <div className="gate-banner">{RULES.SAFETY_PLAN}：请立即补登，否则会谈不能落盘。</div>}
      {record.safetyPlan ? (
        <dl className="safety-plan-view">
          <div>
            <dt>预警信号</dt>
            <dd>{record.safetyPlan.warningSigns}</dd>
          </div>
          <div>
            <dt>应对策略</dt>
            <dd>{record.safetyPlan.copingStrategies}</dd>
          </div>
          <div>
            <dt>紧急联系人</dt>
            <dd>{record.safetyPlan.emergencyContacts}</dd>
          </div>
          <div>
            <dt>危险物品限制</dt>
            <dd>{record.safetyPlan.meansRestriction}</dd>
          </div>
          <div>
            <dt>登记</dt>
            <dd>
              {record.safetyPlan.createdBy} · {record.safetyPlan.createdAt}
            </dd>
          </div>
        </dl>
      ) : (
        !missing && <p className="empty-hint">当前级别无需安全计划；升为高风险时须补登。</p>
      )}
      {editing && record.status === "active" && (
        <div className="inline-form">
          <div className="field-grid">
            {field("warningSigns", "预警信号")}
            {field("copingStrategies", "应对策略")}
            {field("emergencyContacts", "紧急联系人")}
            {field("meansRestriction", "危险物品限制")}
          </div>
          <div className="form-actions">
            <button
              type="button"
              className="primary-action"
              onClick={() => {
                onSafetyPlan(plan, record.counselor);
                setEditing(false);
              }}
            >
              保存安全计划
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- 会谈卡片 + 督导确认 ----------

function SessionCard({
  session,
  record,
  onConfirm,
}: {
  session: Session;
  record: CaseRecord;
  onConfirm: Props["onConfirm"];
}) {
  const [supervisor, setSupervisor] = useState("林督导");
  const [note, setNote] = useState("");
  const needConfirm = session.riskLevel === "high" && !session.confirmation;
  const corrections = record.corrections.filter((c) => c.targetType === "session" && c.targetId === session.id);

  return (
    <article className={`session-card risk-border-${session.riskLevel}`}>
      <header>
        <div>
          <b>{session.date}</b> · {session.id} · {session.counselor}
        </div>
        <div className="badge-stack">
          <span className={`badge risk-${session.riskLevel}`}>{RISK_LABEL[session.riskLevel]}</span>
          {session.riskLevel === "high" &&
            (session.confirmation ? (
              <span className="badge status-active">
                督导已确认 {session.confirmation.confirmedAt}
              </span>
            ) : (
              <span className="badge status-pending">待督导确认</span>
            ))}
        </div>
      </header>
      <p>
        <span className="field-label">判断依据：</span>
        {session.rationale}
      </p>
      <p>
        <span className="field-label">会谈摘要：</span>
        {session.summary}
      </p>
      <p>
        <span className="field-label">下次目标：</span>
        {session.nextGoal || "—"}
      </p>
      {session.confirmation && (
        <p className="confirm-note">
          督导 {session.confirmation.supervisor} 于 {session.confirmation.confirmedAt} 确认
          {session.confirmation.note && `：${session.confirmation.note}`}
        </p>
      )}
      {needConfirm && record.status === "active" && (
        <div className="inline-form confirm-form">
          <input value={supervisor} onChange={(e) => setSupervisor(e.target.value)} placeholder="督导姓名" />
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="确认意见（可选）" />
          <button type="button" className="primary-action" onClick={() => onConfirm(session.id, supervisor, note)}>
            督导确认
          </button>
        </div>
      )}
      {corrections.length > 0 && (
        <ul className="audit-list compact">
          {corrections.map((c) => (
            <li key={c.id}>
              更正 {c.id} · {c.fieldLabel}「{c.originalContent}」→「{c.newContent}」 · {c.reason} · {c.responsible} ·{" "}
              {c.correctedAt}
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

// ---------- 新增会谈 ----------

function SessionForm({ record, onAddSession }: { record: CaseRecord; onAddSession: Props["onAddSession"] }) {
  const [date, setDate] = useState(today());
  const [riskLevel, setRiskLevel] = useState<RiskLevel>("medium");
  const [rationale, setRationale] = useState("");
  const [summary, setSummary] = useState("");
  const [nextGoal, setNextGoal] = useState("");

  return (
    <div className="detail-block">
      <h3>新增会谈</h3>
      <div className="field-grid">
        <label>
          <span>会谈日期 *</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label>
          <span>本次风险评估 *</span>
          <select value={riskLevel} onChange={(e) => setRiskLevel(e.target.value as RiskLevel)}>
            {(Object.keys(RISK_LABEL) as RiskLevel[]).map((l) => (
              <option key={l} value={l}>
                {RISK_LABEL[l]}
              </option>
            ))}
          </select>
        </label>
        <label className="span-2">
          <span>风险判断依据 *</span>
          <textarea rows={2} value={rationale} onChange={(e) => setRationale(e.target.value)} placeholder="评估观察与依据" />
        </label>
        <label className="span-2">
          <span>会谈摘要 *</span>
          <textarea rows={2} value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="本次会谈要点" />
        </label>
        <label className="span-2">
          <span>下次目标</span>
          <input value={nextGoal} onChange={(e) => setNextGoal(e.target.value)} placeholder="下次会谈前的目标" />
        </label>
      </div>
      <div className="form-actions">
        <button
          type="button"
          className="primary-action"
          onClick={() => {
            onAddSession({ date, riskLevel, rationale, summary, nextGoal, counselor: record.counselor });
            setRationale("");
            setSummary("");
            setNextGoal("");
          }}
        >
          会谈落盘
        </button>
      </div>
    </div>
  );
}

// ---------- 风险降级 ----------

function DowngradeBox({ record, onDowngrade }: { record: CaseRecord; onDowngrade: Props["onDowngrade"] }) {
  const options = (Object.keys(RISK_ORDER) as RiskLevel[]).filter((l) => RISK_ORDER[l] < RISK_ORDER[record.riskLevel]);
  const [target, setTarget] = useState<RiskLevel>(options[options.length - 1] ?? "low");
  if (options.length === 0) return null;
  const validTarget = options.includes(target) ? target : options[options.length - 1];

  return (
    <div className="detail-block">
      <h3>风险降级</h3>
      <p className="rule-hint">{RULES.DOWNGRADE_TWO_LOW}</p>
      <div className="inline-form">
        <select value={validTarget} onChange={(e) => setTarget(e.target.value as RiskLevel)}>
          {options.map((l) => (
            <option key={l} value={l}>
              降至{RISK_LABEL[l]}
            </option>
          ))}
        </select>
        <button type="button" onClick={() => onDowngrade(validTarget, record.counselor)}>
          申请降级
        </button>
      </div>
    </div>
  );
}

// ---------- 结案 / 重开 ----------

function CloseBox({ record, onClose }: { record: CaseRecord; onClose: Props["onClose"] }) {
  const [reason, setReason] = useState("");
  return (
    <div className="detail-block">
      <h3>结案</h3>
      <p className="rule-hint">{RULES.CLOSED_FROZEN}</p>
      <div className="inline-form">
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="结案原因 *" />
        <button type="button" className="danger-action" onClick={() => onClose(reason, record.counselor)}>
          结案并冻结
        </button>
      </div>
    </div>
  );
}

function ReopenBox({ record, onReopen }: { record: CaseRecord; onReopen: Props["onReopen"] }) {
  const [reason, setReason] = useState("");
  return (
    <div className="detail-block">
      <h3>重开个案</h3>
      <p className="rule-hint">重开后个案、会谈、确认状态与更正记录须对应一致，系统将自动校验。</p>
      {record.reopenHistory.length > 0 && (
        <ul className="audit-list">
          {record.reopenHistory.map((r, i) => (
            <li key={i}>
              <b>{r.reopenedAt}</b> 重开：{r.reason}（{r.by}）
            </li>
          ))}
        </ul>
      )}
      <div className="inline-form">
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="重开原因 *" />
        <button type="button" className="primary-action" onClick={() => onReopen(reason, record.counselor)}>
          申请重开
        </button>
      </div>
    </div>
  );
}

// ---------- 更正 ----------

function CorrectionForm({ record, onCorrect }: { record: CaseRecord; onCorrect: Props["onCorrect"] }) {
  const options = useMemo(
    () => [
      ...CASE_CORRECTABLE_FIELDS.map((f) => ({
        value: `case:${record.id}:${f.key}`,
        label: `个案 · ${f.label}`,
      })),
      ...record.sessions.flatMap((s) =>
        SESSION_CORRECTABLE_FIELDS.map((f) => ({
          value: `session:${s.id}:${f.key}`,
          label: `会谈 ${s.id}（${s.date}）· ${f.label}`,
        }))
      ),
    ],
    [record]
  );

  const [sel, setSel] = useState(options[0]?.value ?? "");
  const [newContent, setNewContent] = useState("");
  const [reason, setReason] = useState("");
  const [responsible, setResponsible] = useState(record.counselor);

  const current = options.some((o) => o.value === sel) ? sel : options[0]?.value ?? "";
  const original = useMemo(() => {
    const [tt, tid, field] = current.split(":");
    if (!tt || !tid || !field) return null;
    return getFieldValue(record, tt as "case" | "session", tid, field);
  }, [current, record]);

  return (
    <div className="detail-block">
      <h3>登记更正</h3>
      <p className="rule-hint">{RULES.CORRECTION_AUDIT}（结案冻结后唯一允许的写操作）</p>
      <div className="field-grid">
        <label className="span-2">
          <span>更正对象</span>
          <select value={current} onChange={(e) => setSel(e.target.value)}>
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="span-2">
          <span>原内容（自动带出，冻结保留）</span>
          <input value={original ?? ""} readOnly className="readonly" />
        </label>
        <label className="span-2">
          <span>新内容 *</span>
          <textarea rows={2} value={newContent} onChange={(e) => setNewContent(e.target.value)} />
        </label>
        <label>
          <span>更正原因 *</span>
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="为什么更正" />
        </label>
        <label>
          <span>责任人 *</span>
          <input value={responsible} onChange={(e) => setResponsible(e.target.value)} />
        </label>
      </div>
      <div className="form-actions">
        <button
          type="button"
          onClick={() => {
            const [tt, tid, field] = current.split(":");
            onCorrect({
              targetType: tt as "case" | "session",
              targetId: tid,
              field,
              newContent,
              reason,
              responsible,
            });
            setNewContent("");
            setReason("");
          }}
        >
          登记更正
        </button>
      </div>
    </div>
  );
}

function CorrectionLog({ record }: { record: CaseRecord }) {
  if (record.corrections.length === 0) return null;
  return (
    <div className="detail-block">
      <h3>更正台账（{record.corrections.length}）</h3>
      <ul className="audit-list">
        {record.corrections.map((c) => (
          <li key={c.id}>
            <b>{c.id}</b> · {c.targetType === "case" ? "个案" : `会谈 ${c.targetId}`} · {c.fieldLabel}：原「
            {c.originalContent}」→ 新「{c.newContent}」 · 原因：{c.reason} · 责任人：{c.responsible} · {c.correctedAt}
          </li>
        ))}
      </ul>
    </div>
  );
}
