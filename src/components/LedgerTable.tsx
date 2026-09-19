import { CaseRecord, RISK_LABEL, verifyCaseConsistency } from "../domain/ledger";

interface Props {
  cases: CaseRecord[];
  selectedId: string;
  onSelect: (id: string) => void;
}

/** 危机分级台账主表 */
export function LedgerTable({ cases, selectedId, onSelect }: Props) {
  return (
    <section className="panel ledger-panel">
      <div className="section-heading">
        <div>
          <p>危机分级台账</p>
          <h2>个案登记簿</h2>
        </div>
        <span className="ledger-count">{cases.length} 个个案</span>
      </div>
      <div className="table-wrap">
        <table className="ledger-table">
          <thead>
            <tr>
              <th>个案</th>
              <th>登记日期</th>
              <th>风险级别</th>
              <th>状态</th>
              <th>会谈</th>
              <th>待确认</th>
              <th>一致性</th>
            </tr>
          </thead>
          <tbody>
            {cases.map((c) => {
              const pending = c.sessions.filter((s) => s.riskLevel === "high" && !s.confirmation).length;
              const problems = verifyCaseConsistency(c);
              return (
                <tr
                  key={c.id}
                  className={c.id === selectedId ? "selected" : ""}
                  onClick={() => onSelect(c.id)}
                >
                  <td>
                    <b>{c.id}</b>
                    <span className="sub">
                      {c.clientAlias} · {c.counselor}
                    </span>
                  </td>
                  <td>{c.registeredAt}</td>
                  <td>
                    <span className={`badge risk-${c.riskLevel}`}>{RISK_LABEL[c.riskLevel]}</span>
                  </td>
                  <td>
                    {c.status === "active" ? (
                      <span className="badge status-active">在案</span>
                    ) : (
                      <span className="badge status-closed">已结案·冻结</span>
                    )}
                  </td>
                  <td>{c.sessions.length}</td>
                  <td>{pending > 0 ? <span className="badge status-pending">{pending} 次</span> : "—"}</td>
                  <td>
                    {problems.length === 0 ? (
                      <span className="consistency ok">✓ 一致</span>
                    ) : (
                      <span className="consistency bad" title={problems.join("\n")}>
                        ⚠ {problems.length} 项
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
