// 危机分级台账 —— 业务规则引擎
// 所有写操作都经此模块校验：返回 ok 或命中的限制 Conflict。

import {
  CaseRecord,
  CaseStatus,
  Conflict,
  Correction,
  Ledger,
  RISK_ORDER,
  RiskLevel,
  SafetyPlan,
  Session,
} from "./types";

// ---------- 工具 ----------

let seq = 0;
export function uid(prefix: string): string {
  seq += 1;
  return `${prefix}-${Date.now().toString(36)}-${seq}`;
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function findCase(ledger: Ledger, caseId: string): CaseRecord | undefined {
  return ledger.cases.find((c) => c.id === caseId);
}

export function findSession(
  cas: CaseRecord,
  sessionId: string
): Session | undefined {
  return cas.sessions.find((s) => s.id === sessionId);
}

export function latestSession(cas: CaseRecord): Session | undefined {
  return [...cas.sessions].sort((a, b) => a.date.localeCompare(b.date)).at(-1);
}

/** 当前生效风险级别 = 最近一次会谈的级别 */
export function currentRisk(cas: CaseRecord): RiskLevel | undefined {
  return latestSession(cas)?.riskLevel;
}

export function isSafetyPlanComplete(plan?: SafetyPlan): boolean {
  if (!plan) return false;
  return (
    plan.warningSigns.trim() !== "" &&
    plan.copingSteps.trim() !== "" &&
    plan.supporters.trim() !== "" &&
    plan.professionalContacts.trim() !== "" &&
    plan.environmentSafety.trim() !== ""
  );
}

/**
 * 规则一：咨询师按「个案登记日期、风险级别、干预目标」登记，
 * 高风险必须附安全计划（五项内容齐全）。
 */
export function validateIntake(input: {
  registeredAt: string;
  clientCode: string;
  counselor: string;
  riskLevel: RiskLevel;
  goal: string;
  safetyPlan?: SafetyPlan;
}): Conflict | null {
  if (!input.registeredAt || !input.clientCode.trim() || !input.counselor.trim()) {
    return {
      code: "VALIDATION",
      message: "登记日期、来访者代号、咨询师为必填项。",
      riskLevel: input.riskLevel,
      date: input.registeredAt,
    };
  }
  if (!input.goal.trim()) {
    return {
      code: "VALIDATION",
      message: "干预目标为必填项。",
      riskLevel: input.riskLevel,
      date: input.registeredAt,
    };
  }
  if (input.riskLevel === "high" && !isSafetyPlanComplete(input.safetyPlan)) {
    return {
      code: "HIGH_RISK_SAFETY_PLAN_REQUIRED",
      message: "高风险个案必须随附完整安全计划（预警信号、应对步骤、支持者、专业求助、环境安全五项）。",
      riskLevel: "high",
      date: input.registeredAt,
    };
  }
  return null;
}

/**
 * 规则二：督导确认前，下一次会谈不能落盘。
 * 判定：当前最新会谈尚未经督导确认时，禁止再新增/落盘任何会谈。
 */
export function supervisionBlock(cas: CaseRecord, date: string): Conflict | null {
  const last = latestSession(cas);
  if (last && last.confirm !== "confirmed") {
    return {
      code: "PERSIST_BLOCKED_PENDING_SUPERVISION",
      message: `上一次会谈（${last.date}）尚未经督导确认，下一次会谈（${date}）不能落盘。`,
      caseId: cas.id,
      date,
      riskLevel: last.riskLevel,
    };
  }
  return null;
}

/**
 * 规则三：风险降级必须连续两次低风险，并写明判断依据。
 *
 * 序列建模（prev 为上一次会谈，prev2 为上上次）：
 *  - 高/中 → 中（终点不是低风险）：直接拦截，降级终点必须是低风险；
 *  - 高/中 → 低（第 1 次低风险）：放行，记为“观察期”，生效级别暂不下降；
 *  - 低（观察期）→ 低（第 2 次）：必须填写判断依据，降级方告生效；
 *  - 观察期内回升为中/高：观察作废。
 */
export function downgradeCheck(
  cas: CaseRecord,
  next: { date: string; riskLevel: RiskLevel; downgradeBasis?: string }
): Conflict | null {
  const ordered = [...cas.sessions].sort((a, b) => a.date.localeCompare(b.date));
  const prev = ordered.at(-1);
  const prev2 = ordered.at(-2);
  if (!prev) return null;

  // 试图降到中风险，或跨越低风险直接降级 —— 一律不允许
  if (
    RISK_ORDER[next.riskLevel] < RISK_ORDER[prev.riskLevel] &&
    next.riskLevel !== "low"
  ) {
    return {
      code: "DOWNGRADE_NEEDS_TWO_LOW",
      message: "风险降级须以连续两次低风险为前提，不能直接降为中风险。",
      caseId: cas.id,
      date: next.date,
      riskLevel: next.riskLevel,
    };
  }

  // 连续第 2 次低风险，且上上次高于低风险 —— 降级生效，必须写明依据
  const completesDowngrade =
    next.riskLevel === "low" &&
    prev.riskLevel === "low" &&
    !!prev2 &&
    RISK_ORDER[prev2.riskLevel] > RISK_ORDER.low;
  if (completesDowngrade && (!next.downgradeBasis || next.downgradeBasis.trim() === "")) {
    return {
      code: "DOWNGRADE_BASIS_REQUIRED",
      message: "已连续两次低风险，降级生效前必须写明判断依据。",
      caseId: cas.id,
      date: next.date,
      riskLevel: next.riskLevel,
    };
  }
  return null;
}

/**
 * 某次会谈的“生效风险级别”：降级须连续两次低风险，
 * 因此第一次低风险（前一次不是低风险）仍按原级别生效（观察期）。
 */
export function effectiveLevelAt(ordered: Session[], index: number): RiskLevel {
  const s = ordered[index];
  if (s.riskLevel === "low" && index > 0 && ordered[index - 1].riskLevel !== "low") {
    return ordered[index - 1].riskLevel;
  }
  return s.riskLevel;
}

/** 该会谈是否为“连续两次低风险”的第一次（观察期，尚未降级） */
export function isFirstLowObservation(ordered: Session[], index: number): boolean {
  const s = ordered[index];
  return s.riskLevel === "low" && index > 0 && ordered[index - 1].riskLevel !== "low";
}

/** 个案当前生效风险级别 */
export function effectiveCurrentRisk(cas: CaseRecord): RiskLevel | undefined {
  const ordered = [...cas.sessions].sort((a, b) => a.date.localeCompare(b.date));
  const last = ordered.at(-1);
  if (!last) return undefined;
  return effectiveLevelAt(ordered, ordered.length - 1);
}

/** 新增会谈的完整校验 */
export function validateSession(
  cas: CaseRecord,
  input: {
    date: string;
    riskLevel: RiskLevel;
    goal: string;
    summary: string;
    downgradeBasis?: string;
    safetyPlan?: SafetyPlan;
  }
): Conflict | null {
  if (cas.status === "closed") {
    return {
      code: "FROZEN_CASE_WRITE_BLOCKED",
      message: "个案已结案冻结，不能直接新增会谈；如需继续请先重开个案。",
      caseId: cas.id,
      date: input.date,
      riskLevel: input.riskLevel,
    };
  }
  if (!input.date || !input.goal.trim()) {
    return {
      code: "VALIDATION",
      message: "会谈日期与干预目标为必填项。",
      caseId: cas.id,
      date: input.date,
    };
  }
  if (input.riskLevel === "high" && !isSafetyPlanComplete(input.safetyPlan)) {
    return {
      code: "HIGH_RISK_SAFETY_PLAN_REQUIRED",
      message: "本次评定为高风险，必须随附完整安全计划。",
      caseId: cas.id,
      date: input.date,
      riskLevel: "high",
    };
  }
  const sup = supervisionBlock(cas, input.date);
  if (sup) return sup;
  const down = downgradeCheck(cas, input);
  if (down) return down;
  return null;
}

/**
 * 规则四：结案后记录冻结。结案后任何字段修改只能走更正流程。
 */
export function assertNotFrozen(cas: CaseRecord, date?: string): Conflict | null {
  if (cas.status === "closed") {
    return {
      code: "FROZEN_CASE_WRITE_BLOCKED",
      message: "个案已结案冻结，原内容不可修改；请走更正流程并保留原文、原因与责任人。",
      caseId: cas.id,
      date,
    };
  }
  return null;
}

/**
 * 规则五：冻结后的更正必须保留：原内容、更正原因、责任人。
 * 更正不覆盖原文，另存为 Correction 留痕。
 */
export function validateCorrection(input: {
  original: string;
  reason: string;
  responsible: string;
}): Conflict | null {
  if (
    input.original.trim() === "" ||
    input.reason.trim() === "" ||
    input.responsible.trim() === ""
  ) {
    return {
      code: "CORRECTION_TRACE_REQUIRED",
      message: "更正必须同时保留原内容、更正原因和责任人，三项缺一不可。",
    };
  }
  return null;
}

/**
 * 规则六：重开后做一致性核对——个案状态、会谈落盘/确认状态、更正记录三者对应一致。
 * 返回发现的全部冲突（无冲突返回空数组）。
 */
export function reopenConsistency(cas: CaseRecord): Conflict[] {
  const conflicts: Conflict[] = [];
  const details: string[] = [];

  if (cas.status !== "reopened") {
    details.push(`个案状态为 ${statusLabel(cas.status)}，与“已重开”不一致。`);
  }
  if (!cas.reopenedAt) {
    details.push("缺少重开时间，无法与重开后的会谈、更正记录对应。");
  }

  // 落盘/确认链路：相邻会谈之间，未确认的会谈之后不得有已落盘会谈
  const ordered = [...cas.sessions].sort((a, b) => a.date.localeCompare(b.date));
  ordered.forEach((s, i) => {
    if (!s.persisted && s.confirm === "confirmed") {
      details.push(`会谈 ${s.date} 已督导确认但未落盘，状态矛盾。`);
    }
    if (i > 0) {
      const prev = ordered[i - 1];
      if (s.persisted && prev.confirm !== "confirmed") {
        details.push(
          `会谈 ${s.date} 已落盘，但其上一次会谈 ${prev.date} 未经督导确认，违反“确认前下一次会谈不能落盘”。`
        );
      }
    }
  });

  // 更正记录必须能对应到现存的会谈/个案字段
  cas.corrections.forEach((cor) => {
    if (cor.targetType === "session") {
      const target = cas.sessions.find((s) => s.id === cor.targetId);
      if (!target) {
        details.push(`更正记录 ${cor.id} 指向的会谈 ${cor.targetId} 已不存在，无法对应。`);
      }
    }
    if (!cor.original || !cor.reason || !cor.responsible) {
      details.push(`更正记录 ${cor.id} 缺少原内容/原因/责任人之一，留痕不完整。`);
    }
  });

  if (details.length > 0) {
    conflicts.push({
      code: "REOPEN_CONSISTENCY_BROKEN",
      message: `个案 ${cas.id} 重开后一致性核对未通过：个案状态、会谈/确认状态与更正记录存在 ${details.length} 处不对应。`,
      caseId: cas.id,
      riskLevel: currentRisk(cas),
      details,
    });
  }
  return conflicts;
}

export function riskLabel(level: RiskLevel): string {
  return level === "high" ? "高风险" : level === "medium" ? "中风险" : "低风险";
}

export function statusLabel(status: CaseStatus): string {
  return status === "active" ? "进行中" : status === "closed" ? "已结案·冻结" : "已重开";
}

// ---------- 纯函数写操作（不可变更新） ----------

export type Result<T> = { ok: true; value: T } | { ok: false; conflict: Conflict };

export function createCase(
  ledger: Ledger,
  input: {
    id: string;
    registeredAt: string;
    clientCode: string;
    counselor: string;
    topic: string;
    riskLevel: RiskLevel;
    goal: string;
    summary?: string;
    safetyPlan?: SafetyPlan;
  }
): Result<Ledger> {
  const err = validateIntake(input);
  if (err) return { ok: false, conflict: err };
  if (findCase(ledger, input.id)) {
    return {
      ok: false,
      conflict: {
        code: "VALIDATION",
        message: `个案编号 ${input.id} 已存在。`,
        caseId: input.id,
      },
    };
  }
  const intake: Session = {
    id: uid("s"),
    date: input.registeredAt,
    riskLevel: input.riskLevel,
    goal: input.goal,
    summary: input.summary ?? "登记会谈",
    safetyPlan: input.riskLevel === "high" ? input.safetyPlan : undefined,
    persisted: true,
    confirm: "pending",
    isIntake: true,
  };
  const cas: CaseRecord = {
    id: input.id,
    registeredAt: input.registeredAt,
    clientCode: input.clientCode.trim(),
    counselor: input.counselor.trim(),
    topic: input.topic.trim(),
    status: "active",
    sessions: [intake],
    corrections: [],
  };
  return { ok: true, value: { cases: [...ledger.cases, cas] } };
}

export function addSession(
  ledger: Ledger,
  caseId: string,
  input: {
    date: string;
    riskLevel: RiskLevel;
    goal: string;
    summary: string;
    downgradeBasis?: string;
    safetyPlan?: SafetyPlan;
  }
): Result<Ledger> {
  const cas = findCase(ledger, caseId);
  if (!cas)
    return { ok: false, conflict: { code: "CASE_NOT_FOUND", message: "个案不存在。", caseId } };
  const err = validateSession(cas, input);
  if (err) return { ok: false, conflict: err };

  const session: Session = {
    id: uid("s"),
    date: input.date,
    riskLevel: input.riskLevel,
    goal: input.goal,
    summary: input.summary,
    downgradeBasis: input.downgradeBasis?.trim() || undefined,
    safetyPlan: input.riskLevel === "high" ? input.safetyPlan : undefined,
    persisted: true,
    confirm: "pending",
  };
  const next = updateCase(ledger, caseId, (c) => ({
    ...c,
    sessions: [...c.sessions, session].sort((a, b) => a.date.localeCompare(b.date)),
  }));
  return { ok: true, value: next };
}

/** 督导确认会谈 */
export function confirmSession(
  ledger: Ledger,
  caseId: string,
  sessionId: string,
  supervisor: string
): Result<Ledger> {
  const cas = findCase(ledger, caseId);
  if (!cas)
    return { ok: false, conflict: { code: "CASE_NOT_FOUND", message: "个案不存在。", caseId } };
  const session = findSession(cas, sessionId);
  if (!session)
    return {
      ok: false,
      conflict: { code: "SESSION_NOT_FOUND", message: "会谈不存在。", caseId },
    };
  if (!supervisor.trim()) {
    return {
      ok: false,
      conflict: { code: "VALIDATION", message: "督导确认为必填。", caseId, date: session.date },
    };
  }
  const next = updateCase(ledger, caseId, (c) => ({
    ...c,
    sessions: c.sessions.map((s) =>
      s.id === sessionId
        ? { ...s, confirm: "confirmed" as const, confirmedBy: supervisor.trim(), confirmedAt: today() }
        : s
    ),
  }));
  return { ok: true, value: next };
}

/** 结案：冻结 */
export function closeCase(ledger: Ledger, caseId: string): Result<Ledger> {
  const cas = findCase(ledger, caseId);
  if (!cas)
    return { ok: false, conflict: { code: "CASE_NOT_FOUND", message: "个案不存在。", caseId } };
  if (cas.status === "closed") {
    return {
      ok: false,
      conflict: {
        code: "FROZEN_CASE_WRITE_BLOCKED",
        message: "个案已处于结案冻结状态。",
        caseId,
      },
    };
  }
  const unconfirmed = cas.sessions.some((s) => s.confirm !== "confirmed");
  if (unconfirmed) {
    return {
      ok: false,
      conflict: {
        code: "PERSIST_BLOCKED_PENDING_SUPERVISION",
        message: "仍有会谈未经督导确认，不能结案。",
        caseId,
        riskLevel: currentRisk(cas),
      },
    };
  }
  const next = updateCase(ledger, caseId, (c) => ({ ...c, status: "closed", closedAt: today() }));
  return { ok: true, value: next };
}

/** 重开个案 */
export function reopenCase(
  ledger: Ledger,
  caseId: string,
  reason: string
): Result<Ledger> {
  const cas = findCase(ledger, caseId);
  if (!cas)
    return { ok: false, conflict: { code: "CASE_NOT_FOUND", message: "个案不存在。", caseId } };
  if (cas.status !== "closed") {
    return {
      ok: false,
      conflict: { code: "VALIDATION", message: "只有已结案冻结的个案可以重开。", caseId },
    };
  }
  if (!reason.trim()) {
    return { ok: false, conflict: { code: "VALIDATION", message: "请填写重开原因。", caseId } };
  }
  const next = updateCase(ledger, caseId, (c) => ({
    ...c,
    status: "reopened",
    reopenedAt: today(),
    reopenReason: reason.trim(),
  }));
  return { ok: true, value: next };
}

/**
 * 更正：结案冻结后只允许这种修改方式。原文保留在 Correction 中，
 * 字段当前值更新为更正值；active/reopened 状态也可使用（统一留痕）。
 */
export function applyCorrection(
  ledger: Ledger,
  caseId: string,
  input: {
    targetType: "session" | "case";
    targetId: string;
    field: string;
    original: string;
    corrected: string;
    reason: string;
    responsible: string;
  }
): Result<Ledger> {
  const cas = findCase(ledger, caseId);
  if (!cas)
    return { ok: false, conflict: { code: "CASE_NOT_FOUND", message: "个案不存在。", caseId } };
  const traceErr = validateCorrection(input);
  if (traceErr) return { ok: false, conflict: { ...traceErr, caseId } };

  if (input.targetType === "session") {
    const target = findSession(cas, input.targetId);
    if (!target)
      return {
        ok: false,
        conflict: { code: "SESSION_NOT_FOUND", message: "被更正的会谈不存在。", caseId },
      };
  }

  const correction: Correction = {
    id: uid("cor"),
    targetType: input.targetType,
    targetId: input.targetId,
    field: input.field,
    original: input.original,
    corrected: input.corrected,
    reason: input.reason,
    responsible: input.responsible,
    createdAt: today(),
  };

  const next = updateCase(ledger, caseId, (c) => {
    let sessions = c.sessions;
    if (input.targetType === "session") {
      sessions = c.sessions.map((s) => {
        if (s.id !== input.targetId) return s;
        const value = input.corrected;
        switch (input.field) {
          case "goal":
            return { ...s, goal: value };
          case "summary":
            return { ...s, summary: value };
          case "date":
            return { ...s, date: value };
          default:
            return s;
        }
      });
    }
    return { ...c, sessions, corrections: [...c.corrections, correction] };
  });
  return { ok: true, value: next };
}

/** 对全台账跑一致性核对（重开后 / 随时可手动跑） */
export function auditLedger(ledger: Ledger): Conflict[] {
  return ledger.cases.filter((c) => c.status === "reopened").flatMap(reopenConsistency);
}

function updateCase(
  ledger: Ledger,
  caseId: string,
  fn: (c: CaseRecord) => CaseRecord
): Ledger {
  return { cases: ledger.cases.map((c) => (c.id === caseId ? fn(c) : c)) };
}
