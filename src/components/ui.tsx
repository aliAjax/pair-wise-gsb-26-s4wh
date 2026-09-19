import { RiskLevel } from "../domain/types";

export function RiskBadge({ level, effective }: { level: RiskLevel; effective?: boolean }) {
  const cls =
    level === "high" ? "badge-danger" : level === "medium" ? "badge-watch" : "badge-ok";
  const label = level === "high" ? "高风险" : level === "medium" ? "中风险" : "低风险";
  return (
    <span className={`badge ${cls}`} title={effective === false ? "观察期，生效级别暂未下降" : undefined}>
      {label}
      {effective === false && <em className="obs">观察期</em>}
    </span>
  );
}

export function StatusPill({ status }: { status: "active" | "closed" | "reopened" }) {
  const map = {
    active: ["pill-active", "进行中"],
    closed: ["pill-frozen", "已结案·冻结"],
    reopened: ["pill-reopen", "已重开"],
  } as const;
  const [cls, label] = map[status];
  return <span className={`pill ${cls}`}>{label}</span>;
}

export function ConflictBanner({
  conflict,
  onClose,
}: {
  conflict: {
    code: string;
    message: string;
    caseId?: string;
    date?: string;
    riskLevel?: RiskLevel;
    details?: string[];
  } | null;
  onClose?: () => void;
}) {
  if (!conflict) return null;
  const risk =
    conflict.riskLevel === "high"
      ? "高风险"
      : conflict.riskLevel === "medium"
      ? "中风险"
      : conflict.riskLevel === "low"
      ? "低风险"
      : "—";
  return (
    <div className="conflict-banner" role="alert">
      <div className="conflict-head">
        <strong>⛔ 命中限制 · {conflict.code}</strong>
        {onClose && (
          <button className="ghost-btn" onClick={onClose} aria-label="关闭">
            ×
          </button>
        )}
      </div>
      <p>{conflict.message}</p>
      <dl className="conflict-grid">
        <div>
          <dt>个案</dt>
          <dd>{conflict.caseId ?? "—"}</dd>
        </div>
        <div>
          <dt>日期</dt>
          <dd>{conflict.date ?? "—"}</dd>
        </div>
        <div>
          <dt>风险级别</dt>
          <dd>{risk}</dd>
        </div>
      </dl>
      {conflict.details && conflict.details.length > 0 && (
        <ul className="conflict-details">
          {conflict.details.map((d, i) => (
            <li key={i}>{d}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function NoticeBanner({ notice, onClose }: { notice: string | null; onClose: () => void }) {
  if (!notice) return null;
  return (
    <div className="notice-banner" role="status">
      <span>✅ {notice}</span>
      <button className="ghost-btn" onClick={onClose} aria-label="关闭">
        ×
      </button>
    </div>
  );
}
