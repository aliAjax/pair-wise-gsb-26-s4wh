import { useState } from "react";
import { Session } from "../domain/types";

export function CorrectionForm({
  target,
  fieldLabel,
  original,
  disabled,
  onSubmit,
  onCancel,
}: {
  target: Session;
  fieldLabel: string;
  original: string;
  disabled: boolean;
  onSubmit: (input: { field: string; corrected: string; reason: string; responsible: string }) => void;
  onCancel: () => void;
}) {
  const [field, setField] = useState<"goal" | "summary" | "date">("summary");
  const [corrected, setCorrected] = useState(original);
  const [reason, setReason] = useState("");
  const [responsible, setResponsible] = useState("");

  const originals: Record<typeof field, string> = {
    goal: target.goal,
    summary: target.summary,
    date: target.date,
  };
  const labels: Record<typeof field, string> = {
    goal: "干预目标",
    summary: "会谈摘要",
    date: "会谈日期",
  };

  return (
    <form
      className="correction-form"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ field, corrected, reason, responsible });
      }}
    >
      <h4>对 {target.date} 会谈提出更正</h4>
      <label>
        <span>更正字段</span>
        <select
          value={field}
          disabled={disabled}
          onChange={(e) => {
            const f = e.target.value as typeof field;
            setField(f);
            setCorrected(originals[f]);
          }}
        >
          <option value="summary">会谈摘要</option>
          <option value="goal">干预目标</option>
          <option value="date">会谈日期</option>
        </select>
      </label>
      <div className="orig-box">
        <span>原内容（冻结保留，不覆盖）</span>
        <p>{originals[field]}</p>
      </div>
      <label>
        <span>更正后内容</span>
        <textarea
          rows={2}
          required
          disabled={disabled}
          value={corrected}
          onChange={(e) => setCorrected(e.target.value)}
        />
      </label>
      <label>
        <span>更正原因 *</span>
        <input
          required
          disabled={disabled}
          value={reason}
          placeholder="为什么需要更正"
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      <label>
        <span>责任人 *</span>
        <input
          required
          disabled={disabled}
          value={responsible}
          placeholder="如：王旻（咨询师）"
          onChange={(e) => setResponsible(e.target.value)}
        />
      </label>
      <div className="form-actions">
        <button className="primary-action" type="submit" disabled={disabled}>
          提交更正（原文留痕）
        </button>
        <button type="button" disabled={disabled} onClick={onCancel}>
          取消
        </button>
      </div>
      <p className="hint">更正字段：{labels[field]}（{fieldLabel}）</p>
    </form>
  );
}
