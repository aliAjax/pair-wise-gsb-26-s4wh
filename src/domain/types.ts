// 危机分级台账 —— 领域类型定义

/** 风险级别：高风险 > 中风险 > 低风险 */
export type RiskLevel = "high" | "medium" | "low";

/** 个案状态：进行中 / 已结案(冻结) / 已重开 */
export type CaseStatus = "active" | "closed" | "reopened";

/** 督导确认状态：未确认 / 已确认 */
export type ConfirmStatus = "pending" | "confirmed";

/** 安全计划（高风险个案必须随附） */
export interface SafetyPlan {
  /** 预警信号 */
  warningSigns: string;
  /** 可自行采取的应对步骤 */
  copingSteps: string;
  /** 可联系的支持者 */
  supporters: string;
  /** 专业求助与危机热线 */
  professionalContacts: string;
  /** 环境安全措施（移除危险物等） */
  environmentSafety: string;
}

/** 会谈记录（首条为登记会谈） */
export interface Session {
  id: string;
  /** 会谈日期 YYYY-MM-DD */
  date: string;
  /** 本次风险级别（咨询师判断） */
  riskLevel: RiskLevel;
  /** 干预目标 */
  goal: string;
  /** 主要内容摘要 */
  summary: string;
  /** 风险降级判断依据（低风险且作为降级依据时必填） */
  downgradeBasis?: string;
  /** 高风险会谈必须随附安全计划 */
  safetyPlan?: SafetyPlan;
  /** 是否落盘（督导确认前，高风险个案的下一次会谈不能落盘） */
  persisted: boolean;
  /** 督导确认状态 */
  confirm: ConfirmStatus;
  /** 督导姓名（已确认时必填） */
  confirmedBy?: string;
  confirmedAt?: string;
  /** 是否为登记会谈 */
  isIntake?: boolean;
}

/** 更正记录（结案冻结后只能以更正形式修改，原文留痕） */
export interface Correction {
  id: string;
  /** 更正的对象：会谈字段 或 个案字段 */
  targetType: "session" | "case";
  targetId: string;
  /** 被更正字段名 */
  field: string;
  /** 原内容 */
  original: string;
  /** 更正后内容 */
  corrected: string;
  /** 更正原因 */
  reason: string;
  /** 责任人 */
  responsible: string;
  /** 更正时间 */
  createdAt: string;
}

/** 个案记录 */
export interface CaseRecord {
  id: string;
  /** 个案登记日期 */
  registeredAt: string;
  /** 来访者代号 */
  clientCode: string;
  /** 咨询师 */
  counselor: string;
  /** 咨询主题 */
  topic: string;
  status: CaseStatus;
  /** 会谈（按日期顺序排列） */
  sessions: Session[];
  /** 更正记录 */
  corrections: Correction[];
  /** 结案时间 */
  closedAt?: string;
  /** 重开时间 */
  reopenedAt?: string;
  /** 重开原因 */
  reopenReason?: string;
}

/** 台账 */
export interface Ledger {
  cases: CaseRecord[];
}

/** 命中的业务限制 */
export interface Conflict {
  /** 限制编码 */
  code:
    | "HIGH_RISK_SAFETY_PLAN_REQUIRED"
    | "PERSIST_BLOCKED_PENDING_SUPERVISION"
    | "DOWNGRADE_NEEDS_TWO_LOW"
    | "DOWNGRADE_BASIS_REQUIRED"
    | "FROZEN_CASE_WRITE_BLOCKED"
    | "CORRECTION_TRACE_REQUIRED"
    | "REOPEN_CONSISTENCY_BROKEN"
    | "CASE_NOT_FOUND"
    | "SESSION_NOT_FOUND"
    | "VALIDATION";
  /** 命中限制的中文说明 */
  message: string;
  /** 个案编号 */
  caseId?: string;
  /** 会谈日期 */
  date?: string;
  /** 风险级别 */
  riskLevel?: RiskLevel;
  /** 附加明细（一致性检查时的逐条问题等） */
  details?: string[];
}

export const RISK_LABEL: Record<RiskLevel, string> = {
  high: "高风险",
  medium: "中风险",
  low: "低风险",
};

export const RISK_ORDER: Record<RiskLevel, number> = {
  high: 3,
  medium: 2,
  low: 1,
};
