// 危机分级台账 —— 领域模型

export type RiskLevel = "low" | "medium" | "high";

export const RISK_ORDER: Record<RiskLevel, number> = { low: 0, medium: 1, high: 2 };

export const RISK_LABEL: Record<RiskLevel, string> = {
  low: "低风险",
  medium: "中风险",
  high: "高风险",
};

/** 台账限制规则（冲突时展示命中的限制） */
export const RULES = {
  COMPLETE: "R0 登记要素完整（日期、风险级别、干预目标、判断依据）",
  SAFETY_PLAN: "R1 高风险个案必须附安全计划",
  SUPERVISOR_GATE: "R2 高风险会谈未经督导确认，下一次会谈不得落盘",
  DOWNGRADE_TWO_LOW: "R3 风险降级须连续两次低风险评估并写明判断依据",
  CLOSED_FROZEN: "R4 结案后记录冻结，仅可追加更正",
  CORRECTION_AUDIT: "R5 更正须保留原内容、更正原因和责任人",
} as const;

export interface SafetyPlan {
  warningSigns: string; // 预警信号
  copingStrategies: string; // 应对策略
  emergencyContacts: string; // 紧急联系人
  meansRestriction: string; // 危险物品限制
  createdBy: string;
  createdAt: string;
}

export interface Confirmation {
  supervisor: string;
  confirmedAt: string;
  note: string;
}

export interface Correction {
  id: string;
  targetType: "case" | "session";
  targetId: string;
  field: string;
  fieldLabel: string;
  originalContent: string; // 原内容（冻结保留）
  newContent: string;
  reason: string; // 更正原因
  responsible: string; // 责任人
  correctedAt: string;
}

export interface Session {
  id: string;
  caseId: string;
  date: string;
  riskLevel: RiskLevel; // 本次会谈评估的风险级别
  rationale: string; // 风险判断依据
  summary: string;
  nextGoal: string;
  counselor: string;
  confirmation: Confirmation | null; // 督导确认
}

export interface RiskLevelChange {
  date: string;
  from: RiskLevel;
  to: RiskLevel;
  reason: string;
  by: string;
}

export type CaseStatus = "active" | "closed";

export interface CaseRecord {
  id: string;
  clientAlias: string; // 来访者代号
  counselor: string; // 咨询师
  registeredAt: string; // 登记日期
  riskLevel: RiskLevel; // 当前风险级别
  goals: string[]; // 干预目标
  safetyPlan: SafetyPlan | null;
  status: CaseStatus;
  closedAt: string | null;
  closeReason: string | null;
  reopenHistory: { reopenedAt: string; reason: string; by: string }[];
  riskLog: RiskLevelChange[];
  sessions: Session[];
  corrections: Correction[]; // 个案级更正台账（会谈更正通过 targetId 关联）
}

export interface LedgerState {
  seq: number; // 单调递增编号发生器
  cases: CaseRecord[];
}

/** 冲突：个案、日期、风险级别、命中的限制 */
export interface Conflict {
  caseId: string;
  date: string;
  riskLevel: RiskLevel;
  restrictions: string[];
  detail: string;
}

export type Result<T> =
  | { ok: true; value: T; notices: string[] }
  | { ok: false; conflict: Conflict };

export const today = () => new Date().toISOString().slice(0, 10);
