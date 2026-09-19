import { Conflict, RISK_LABEL } from "../domain/ledger";

/** 冲突面板：展示个案、日期、风险级别及命中的限制 */
export function ConflictPanel({ conflict, onDismiss }: { conflict: Conflict; onDismiss: () => void }) {
  return (
    <section className="conflict-panel" role="alert">
      <div className="conflict-head">
        <strong>⚠ 操作被拦截 · 命中 {conflict.restrictions.length} 条限制</strong>
        <button type="button" onClick={onDismiss}>
          知道了
        </button>
      </div>
      <div className="conflict-meta">
        <span>
          个案 <b>{conflict.caseId}</b>
        </span>
        <span>
          日期 <b>{conflict.date}</b>
        </span>
        <span className={`badge risk-${conflict.riskLevel}`}>{RISK_LABEL[conflict.riskLevel]}</span>
      </div>
      {conflict.restrictions.length > 0 && (
        <ul className="restriction-list">
          {conflict.restrictions.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}
      <p className="conflict-detail">{conflict.detail}</p>
    </section>
  );
}

export function NoticePanel({ notices, onDismiss }: { notices: string[]; onDismiss: () => void }) {
  return (
    <section className="notice-panel">
      <div className="conflict-head">
        <strong>✓ 已入账</strong>
        <button type="button" onClick={onDismiss}>
          知道了
        </button>
      </div>
      <ul>
        {notices.map((n, i) => (
          <li key={i}>{n}</li>
        ))}
      </ul>
    </section>
  );
}
