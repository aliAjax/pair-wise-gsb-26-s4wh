import { useState } from "react";
import { CaseRecord, Conflict, RiskLevel } from "../domain/types";
import {
  effectiveLevelAt,
  isFirstLowObservation,
  riskLabel,
} from "../domain/rules";
import { RiskBadge, StatusPill } from "./ui";
import { SessionDraft, SessionForm } from "./SessionForm";
import { CorrectionForm } from "./CorrectionForm";

export type Role = "counselor" | "supervisor" | "admin";

type MutateResult = Conflict | null;

export function CaseDetail({
  cas,
  role,
  onAddSession,
  onConfirm,
  onClose,
  onReopen,
  onCorrect,
  onAudit,
}: {
  cas: CaseRecord;
  role: Role;
  onAddSession: (caseId: string, draft: SessionDraft) => MutateResult;
  onConfirm: (caseId: string, sessionId: string, supervisor: string) => MutateResult;
  onClose: (caseId: string) => MutateResult;
  onReopen: (caseId: string, reason: string) => MutateResult;
  onCorrect: (
    caseId: string,
    sessionId: string,
    payload: { field: string; corrected: string; reason: string; responsible: string }
  ) => MutateResult;
  onAudit: (caseId: string) => Conflict[];
}) {
  const [correcting, setCorrecting] = useState<string | null>(null);
  const [auditConflicts, setAuditConflicts] = useState<Conflict[]>([]);
  const [reopenMode, setReopenMode] = useState(false);
  const [reopenReason, setReopenReason] = useState("");

  const ordered = [...cas.sessions].sort((a, b) => a.date.localeCompare(b.date));
  const last = ordered.at(-1);
  const blocked = !!last && last.confirm !== "confirmed";

  function runAudit() {
    setAuditConflicts(onAudit(cas.id));
  }

  return (
    <article className="case-detail panel">
      <header className="case-head">
        <div>
          <p className="eyebrow">
            登记日期 {cas.registeredAt} · {cas.counselor}
          </p>
          <h2>
            {cas.id} <span className="client-code">{cas.clientCode}</span>
          </h2>
          <p className="topic-line">{cas.topic}</p>
        </div>
        <div className="case-head-side">
          <StatusPill status={cas.status} />
          {cas.closedAt && <span className="meta">结案 {cas.closedAt}</span>}
          {cas.reopenedAt && <span className="meta">重开 {cas.reopenedAt}</span>}
        </div>
      </header>

      {/* 会谈时间线 */}
      <h3 className="timeline-title">会谈、落盘与督导确认时间线</h3>
      <ol className="timeline">
        {ordered.map((s, i) => {
          const eff = effectiveLevelAt(ordered, i);
          const observing = isFirstLowObservation(ordered, i);
          return (
            <li key={s.id} className={`tl-item tl-${s.riskLevel} ${!s.persisted ? "tl-unpersisted" : ""}`}>
              <div className="tl-date">
                <strong>{s.date}</strong>
                {s.isIntake && <span className="tag">登记会谈</span>}
              </div>
              <div className="tl-body">
                <div className="tl-tags">
                  <span className="tag tag-assess">评定 <RiskBadge level={s.riskLevel} /></span>
                  {s.riskLevel !== eff && (
                    <span className="tag tag-eff">
                      生效 <RiskBadge level={eff as RiskLevel} effective />
                    </span>
                  )}
                  {observing && <span className="tag tag-obs">观察期 · 第 1 次低风险</span>}
                  <span className={`tag ${s.persisted ? "tag-persisted" : "tag-blocked"}`}>
                    {s.persisted ? "已落盘" : "未落盘"}
                  </span>
                  <span className={`tag ${s.confirm === "confirmed" ? "tag-confirmed" : "tag-pending"}`}>
                    {s.confirm === "confirmed"
                      ? `督导已确认 · ${s.confirmedBy ?? ""}`
                      : "待督导确认"}
                  </span>
                </div>
                <p className="tl-goal">
                  <b>干预目标：</b>
                  {s.goal}
                </p>
                <p className="tl-summary">{s.summary}</p>
                {s.downgradeBasis && (
                  <p className="tl-basis">
                    <b>降级判断依据：</b>
                    {s.downgradeBasis}
                  </p>
                )}
                {s.safetyPlan && (
                  <details className="plan-details">
                    <summary>⚠ 安全计划（{riskLabel(s.riskLevel)}随附）</summary>
                    <dl>
                      <div>
                        <dt>预警信号</dt>
                        <dd>{s.safetyPlan.warningSigns}</dd>
                      </div>
                      <div>
                        <dt>应对步骤</dt>
                        <dd>{s.safetyPlan.copingSteps}</dd>
                      </div>
                      <div>
                        <dt>支持者</dt>
                        <dd>{s.safetyPlan.supporters}</dd>
                      </div>
                      <div>
                        <dt>专业求助</dt>
                        <dd>{s.safetyPlan.professionalContacts}</dd>
                      </div>
                      <div>
                        <dt>环境安全</dt>
                        <dd>{s.safetyPlan.environmentSafety}</dd>
                      </div>
                    </dl>
                  </details>
                )}
                <div className="tl-actions">
                  {s.confirm !== "confirmed" && (role === "supervisor" || role === "admin") && (
                    <button
                      onClick={() => {
                        const name = role === "supervisor" ? "督导 林岚" : window.prompt("督导姓名") ?? "";
                        if (name.trim()) onConfirm(cas.id, s.id, name);
                      }}
                    >
                      督导确认
                    </button>
                  )}
                  {correcting !== s.id && (
                    <button className="ghost-btn" onClick={() => setCorrecting(s.id)}>
                      提出更正
                    </button>
                  )}
                </div>
                {correcting === s.id && (
                  <CorrectionForm
                    target={s}
                    fieldLabel="会谈字段"
                    original={s.summary}
                    disabled={false}
                    onCancel={() => setCorrecting(null)}
                    onSubmit={(payload) => {
                      const err = onCorrect(cas.id, s.id, payload);
                      if (!err) setCorrecting(null);
                    }}
                  />
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {/* 新增会谈：冻结个案禁用；上一次未确认时提交会被规则引擎拦截 */}
      {cas.status === "closed" ? (
        <div className="frozen-note">
          🔒 个案已于 {cas.closedAt} 结案，记录冻结。直接修改被禁止，仅允许带原内容、原因、责任人的更正；如恢复服务请先重开。
        </div>
      ) : (
        <details className="add-session" open={cas.status === "active" && !blocked}>
          <summary>登记下一次会谈</summary>
          {blocked && (
            <p className="hint hint-danger">
              上一次会谈（{last?.date}）尚未经督导确认 —— 按规则，督导确认前下一次会谈<strong>不能落盘</strong>。
              可先填写草稿，但提交落盘会被拦截。
            </p>
          )}
          <SessionForm
            cas={cas}
            disabled={false}
            onSubmit={(draft) => onAddSession(cas.id, draft)}
          />
        </details>
      )}

      {/* 结案 / 重开 */}
      <div className="case-actions">
        {cas.status === "active" && (role === "counselor" || role === "admin") && (
          <button onClick={() => onClose(cas.id)}>结案并冻结</button>
        )}
        {cas.status === "closed" && !reopenMode && (role === "counselor" || role === "admin") && (
          <button onClick={() => setReopenMode(true)}>重开个案</button>
        )}
        {cas.status === "closed" && reopenMode && (
          <div className="reopen-box">
            <input
              placeholder="重开原因（必填）"
              value={reopenReason}
              onChange={(e) => setReopenReason(e.target.value)}
            />
            <button
              className="primary-action"
              onClick={() => {
                const err = onReopen(cas.id, reopenReason);
                if (!err) {
                  setReopenMode(false);
                  setReopenReason("");
                }
              }}
            >
              确认重开
            </button>
            <button onClick={() => setReopenMode(false)}>取消</button>
          </div>
        )}
        {cas.status === "reopened" && (
          <button onClick={runAudit}>对重开个案做一致性核对</button>
        )}
      </div>

      {cas.status === "reopened" && cas.reopenReason && (
        <p className="reopen-reason">
          <b>重开原因：</b>
          {cas.reopenReason}（{cas.reopenedAt}）
        </p>
      )}

      {auditConflicts.length > 0 && (
        <div className="audit-box">
          {auditConflicts.map((c, idx) => (
            <div key={idx} className="conflict-banner">
              <div className="conflict-head">
                <strong>⛔ 命中限制 · {c.code}</strong>
              </div>
              <p>{c.message}</p>
              <dl className="conflict-grid">
                <div>
                  <dt>个案</dt>
                  <dd>{c.caseId ?? "—"}</dd>
                </div>
                <div>
                  <dt>日期</dt>
                  <dd>{c.date ?? "—"}</dd>
                </div>
                <div>
                  <dt>风险级别</dt>
                  <dd>{c.riskLevel ? riskLabel(c.riskLevel) : "—"}</dd>
                </div>
              </dl>
              {c.details && (
                <ul className="conflict-details">
                  {c.details.map((d, i) => (
                    <li key={i}>{d}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
      {auditConflicts.length === 0 && cas.status === "reopened" && (
        <p className="hint hint-ok">一致性核对结果：个案状态、会谈/确认状态与更正记录对应一致。</p>
      )}

      {/* 更正留痕 */}
      <section className="corrections">
        <h3>更正记录（原文留痕）</h3>
        {cas.corrections.length === 0 ? (
          <p className="hint">暂无更正。</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>日期</th>
                <th>对象/字段</th>
                <th>原内容</th>
                <th>更正后</th>
                <th>原因</th>
                <th>责任人</th>
              </tr>
            </thead>
            <tbody>
              {cas.corrections.map((cor) => (
                <tr key={cor.id}>
                  <td>{cor.createdAt}</td>
                  <td>
                    {cor.targetType === "session"
                      ? `${cas.sessions.find((s) => s.id === cor.targetId)?.date ?? "会谈已缺失"} · ${
                          { goal: "干预目标", summary: "会谈摘要", date: "会谈日期" }[cor.field as "goal"] ?? cor.field
                        }`
                      : "个案字段"}
                  </td>
                  <td className="orig-cell">{cor.original}</td>
                  <td>{cor.corrected}</td>
                  <td>{cor.reason}</td>
                  <td>{cor.responsible}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </article>
  );
}
