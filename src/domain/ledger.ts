// 危机分级台账 —— 业务规则（纯函数，便于测试与复用）

import {
  CaseRecord,
  Conflict,
  Correction,
  LedgerState,
  Result,
  RiskLevel,
  RISK_LABEL,
  RISK_ORDER,
  RULES,
  SafetyPlan,
  Session,
  today,
} from "./types";

export * from "./types";

// ---------- 草稿类型 ----------

export interface SafetyPlanDraft {
  warningSigns: string;
  copingStrategies: string;
  emergencyContacts: string;
  meansRestriction: string;
}

export interface RegisterCaseDraft {
  clientAlias: string;
  counselor: string;
  registeredAt: string;
  riskLevel: RiskLevel;
  goals: string[];
  safetyPlan: SafetyPlanDraft | null;
  safetyPlanBy: string;
}

export interface SessionDraft {
  date: string;
  riskLevel: RiskLevel;
  rationale: string;
  summary: string;
  nextGoal: string;
  counselor: string;
}

export interface CorrectionDraft {
  targetType: "case" | "session";
  targetId: string;
  field: string;
  newContent: string;
  reason: string;
  responsible: string;
}

// ---------- 可更正字段 ----------

export const CASE_CORRECTABLE_FIELDS = [
  { key: "clientAlias", label: "来访者代号" },
  { key: "counselor", label: "咨询师" },
  { key: "registeredAt", label: "登记日期" },
  { key: "goals", label: "干预目标" },
] as const;

export const SESSION_CORRECTABLE_FIELDS = [
  { key: "date", label: "会谈日期" },
  { key: "summary", label: "会谈摘要" },
  { key: "nextGoal", label: "下次目标" },
  { key: "rationale", label: "判断依据" },
] as const;

// ---------- 工具 ----------

function ok<T>(value: T, notices: string[] = []): Result<T> {
  return { ok: true, value, notices };
}

function fail<T>(conflict: Conflict): Result<T> {
  return { ok: false, conflict };
}

function conflictOf(
  c: { id: string; riskLevel: RiskLevel },
  date: string,
  restrictions: string[],
  detail: string
): Conflict {
  return { caseId: c.id, date, riskLevel: c.riskLevel, restrictions, detail };
}

export function findCase(state: LedgerState, caseId: string): CaseRecord | undefined {
  return state.cases.find((c) => c.id === caseId);
}

function replaceCase(state: LedgerState, updated: CaseRecord, seqBump = 0): LedgerState {
  return {
    seq: state.seq + seqBump,
    cases: state.cases.map((c) => (c.id === updated.id ? updated : c)),
  };
}

export function safetyPlanComplete(p: SafetyPlanDraft | SafetyPlan | null): boolean {
  return (
    !!p &&
    [p.warningSigns, p.copingStrategies, p.emergencyContacts, p.meansRestriction].every(
      (s) => s.trim().length > 0
    )
  );
}

/** 读取可更正字段的当前内容（个案级或会谈级） */
export function getFieldValue(
  c: CaseRecord,
  targetType: "case" | "session",
  targetId: string,
  field: string
): string | null {
  if (targetType === "case") {
    if (targetId !== c.id) return null;
    switch (field) {
      case "clientAlias":
        return c.clientAlias;
      case "counselor":
        return c.counselor;
      case "registeredAt":
        return c.registeredAt;
      case "goals":
        return c.goals.join("；");
      default:
        return null;
    }
  }
  const s = c.sessions.find((x) => x.id === targetId);
  if (!s) return null;
  switch (field) {
    case "date":
      return s.date;
    case "summary":
      return s.summary;
    case "nextGoal":
      return s.nextGoal;
    case "rationale":
      return s.rationale;
    default:
      return null;
  }
}

// ---------- R0+R1 登记个案 ----------

export function registerCase(state: LedgerState, draft: RegisterCaseDraft): Result<LedgerState> {
  const restrictions: string[] = [];
  const goals = draft.goals.map((g) => g.trim()).filter(Boolean);

  if (!draft.clientAlias.trim() || !draft.counselor.trim() || !draft.registeredAt || goals.length === 0) {
    restrictions.push(RULES.COMPLETE);
  }
  if (draft.riskLevel === "high" && !safetyPlanComplete(draft.safetyPlan)) {
    restrictions.push(RULES.SAFETY_PLAN);
  }
  if (restrictions.length > 0) {
    return fail(
      conflictOf(
        { id: `新个案（${draft.clientAlias.trim() || "未命名"}）`, riskLevel: draft.riskLevel },
        draft.registeredAt || today(),
        restrictions,
        restrictions.includes(RULES.SAFETY_PLAN)
          ? "登记被拦截：高风险个案须完整填写安全计划（预警信号、应对策略、紧急联系人、危险物品限制）。"
          : "登记被拦截：来访者代号、咨询师、登记日期、干预目标均为必填。"
      )
    );
  }

  const id = `C-${state.seq + 1}`;
  const record: CaseRecord = {
    id,
    clientAlias: draft.clientAlias.trim(),
    counselor: draft.counselor.trim(),
    registeredAt: draft.registeredAt,
    riskLevel: draft.riskLevel,
    goals,
    safetyPlan: draft.safetyPlan
      ? { ...draft.safetyPlan, createdBy: draft.safetyPlanBy || draft.counselor, createdAt: today() }
      : null,
    status: "active",
    closedAt: null,
    closeReason: null,
    reopenHistory: [],
    riskLog: [],
    sessions: [],
    corrections: [],
  };
  return ok(
    { seq: state.seq + 1, cases: [...state.cases, record] },
    [`个案 ${id} 已登记：${RISK_LABEL[draft.riskLevel]}，干预目标 ${goals.length} 项。`]
  );
}

// ---------- R1 补登/更新安全计划 ----------

export function upsertSafetyPlan(
  state: LedgerState,
  caseId: string,
  plan: SafetyPlanDraft,
  by: string
): Result<LedgerState> {
  const c = findCase(state, caseId);
  if (!c) return fail(conflictOf({ id: caseId, riskLevel: "low" }, today(), [], "个案不存在。"));
  if (c.status === "closed") {
    return fail(
      conflictOf(c, today(), [RULES.CLOSED_FROZEN], "个案已结案，记录冻结，不能修改安全计划；如需修正请走更正流程。")
    );
  }
  if (!safetyPlanComplete(plan)) {
    return fail(
      conflictOf(c, today(), [RULES.COMPLETE], "安全计划四项内容（预警信号、应对策略、紧急联系人、危险物品限制）均须填写。")
    );
  }
  const updated: CaseRecord = {
    ...c,
    safetyPlan: { ...plan, createdBy: by, createdAt: today() },
  };
  return ok(replaceCase(state, updated), [`个案 ${caseId} 安全计划已${c.safetyPlan ? "更新" : "补登"}。`]);
}

// ---------- R1+R2+R4 会谈落盘 ----------

export function addSession(state: LedgerState, caseId: string, draft: SessionDraft): Result<LedgerState> {
  const c = findCase(state, caseId);
  if (!c) return fail(conflictOf({ id: caseId, riskLevel: "low" }, draft.date, [], "个案不存在。"));

  const restrictions: string[] = [];
  const details: string[] = [];

  // R4 结案冻结
  if (c.status === "closed") {
    restrictions.push(RULES.CLOSED_FROZEN);
    details.push("个案已结案，记录冻结，新会谈不能落盘；如需继续服务请先申请重开。");
  }
  // R1 高风险须附安全计划
  if (c.riskLevel === "high" && !c.safetyPlan) {
    restrictions.push(RULES.SAFETY_PLAN);
    details.push("个案当前为高风险但缺少安全计划，须先补登安全计划。");
  }
  // R2 督导确认门：上一次高风险会谈未确认，下一次不得落盘
  const last = c.sessions[c.sessions.length - 1];
  if (last && last.riskLevel === "high" && !last.confirmation) {
    restrictions.push(RULES.SUPERVISOR_GATE);
    details.push(`上一次会谈 ${last.id}（${last.date}，高风险）尚未经督导确认。`);
  }
  // R0 要素完整
  if (!draft.date || !draft.rationale.trim() || !draft.summary.trim()) {
    restrictions.push(RULES.COMPLETE);
    details.push("会谈日期、风险判断依据、会谈摘要均为必填。");
  }

  if (restrictions.length > 0) {
    return fail(conflictOf(c, draft.date || today(), restrictions, details.join(" ")));
  }

  const session: Session = {
    id: `S-${state.seq + 1}`,
    caseId,
    date: draft.date,
    riskLevel: draft.riskLevel,
    rationale: draft.rationale.trim(),
    summary: draft.summary.trim(),
    nextGoal: draft.nextGoal.trim(),
    counselor: draft.counselor.trim() || c.counselor,
    confirmation: null,
  };

  const notices: string[] = [`会谈 ${session.id} 已落盘（${draft.date}，${RISK_LABEL[draft.riskLevel]}）。`];
  let riskLevel = c.riskLevel;
  let riskLog = c.riskLog;

  if (RISK_ORDER[draft.riskLevel] > RISK_ORDER[c.riskLevel]) {
    // 风险上调立即生效（安全优先）
    riskLevel = draft.riskLevel;
    riskLog = [
      ...c.riskLog,
      {
        date: draft.date,
        from: c.riskLevel,
        to: draft.riskLevel,
        reason: `会谈评估上调：${draft.rationale.trim()}`,
        by: session.counselor,
      },
    ];
    notices.push(`风险级别已上调为${RISK_LABEL[draft.riskLevel]}。`);
    if (draft.riskLevel === "high" && !c.safetyPlan) {
      notices.push("个案已升为高风险：请尽快补登安全计划，否则后续会谈将被限制落盘。");
    }
    if (draft.riskLevel === "high") {
      notices.push("本次为高风险会谈：须经督导确认后，下一次会谈才能落盘。");
    }
  } else if (RISK_ORDER[draft.riskLevel] < RISK_ORDER[c.riskLevel]) {
    // 降级不自动生效：须连续两次低风险评估（R3）
    notices.push(
      `本次评估（${RISK_LABEL[draft.riskLevel]}）低于当前级别（${RISK_LABEL[c.riskLevel]}）：` +
        "按 R3 风险降级须连续两次低风险评估，当前级别维持不变，可在条件满足后通过「申请降级」办理。"
    );
  }

  const updated: CaseRecord = {
    ...c,
    riskLevel,
    riskLog,
    sessions: [...c.sessions, session],
  };
  return ok(replaceCase(state, updated, 1), notices);
}

// ---------- R2 督导确认 ----------

export function confirmSession(
  state: LedgerState,
  caseId: string,
  sessionId: string,
  supervisor: string,
  note: string
): Result<LedgerState> {
  const c = findCase(state, caseId);
  if (!c) return fail(conflictOf({ id: caseId, riskLevel: "low" }, today(), [], "个案不存在。"));
  const s = c.sessions.find((x) => x.id === sessionId);
  if (!s) return fail(conflictOf(c, today(), [], `会谈 ${sessionId} 不存在。`));
  if (c.status === "closed") {
    return fail(conflictOf(c, s.date, [RULES.CLOSED_FROZEN], "个案已结案，记录冻结，不能补确认；如需处理请先重开。"));
  }
  if (s.riskLevel !== "high") {
    return fail(conflictOf(c, s.date, [RULES.SUPERVISOR_GATE], "仅高风险会谈需要督导确认。"));
  }
  if (s.confirmation) {
    return fail(
      conflictOf(c, s.date, [RULES.SUPERVISOR_GATE], "该会谈已完成督导确认，无需重复确认；如需修改确认内容请走更正流程。")
    );
  }
  if (!supervisor.trim()) {
    return fail(conflictOf(c, s.date, [RULES.COMPLETE], "请填写督导姓名。"));
  }

  const sessions = c.sessions.map((x) =>
    x.id === sessionId
      ? { ...x, confirmation: { supervisor: supervisor.trim(), confirmedAt: today(), note: note.trim() } }
      : x
  );
  return ok(replaceCase(state, { ...c, sessions }), [
    `会谈 ${sessionId} 已经督导「${supervisor.trim()}」确认，下一次会谈可以落盘。`,
  ]);
}

// ---------- R3 风险降级 ----------

export function requestDowngrade(
  state: LedgerState,
  caseId: string,
  target: RiskLevel,
  by: string
): Result<LedgerState> {
  const c = findCase(state, caseId);
  if (!c) return fail(conflictOf({ id: caseId, riskLevel: "low" }, today(), [], "个案不存在。"));
  if (c.status === "closed") {
    return fail(conflictOf(c, today(), [RULES.CLOSED_FROZEN], "个案已结案，记录冻结，不能变更风险级别。"));
  }
  if (RISK_ORDER[target] >= RISK_ORDER[c.riskLevel]) {
    return fail(
      conflictOf(c, today(), [RULES.DOWNGRADE_TWO_LOW], `当前级别为${RISK_LABEL[c.riskLevel]}，仅支持向更低级别申请降级。`)
    );
  }

  const lastTwo = c.sessions.slice(-2);
  const problems: string[] = [];
  if (lastTwo.length < 2) {
    problems.push(`会谈记录不足两次（当前 ${lastTwo.length} 次）`);
  }
  lastTwo.forEach((s, i) => {
    if (RISK_ORDER[s.riskLevel] > RISK_ORDER[target]) {
      problems.push(`倒数第 ${lastTwo.length - i} 次会谈（${s.date}）评估为${RISK_LABEL[s.riskLevel]}，高于目标级别`);
    }
    if (!s.rationale.trim()) {
      problems.push(`会谈 ${s.id}（${s.date}）缺少判断依据`);
    }
  });

  if (problems.length > 0) {
    return fail(
      conflictOf(
        c,
        today(),
        [RULES.DOWNGRADE_TWO_LOW],
        `降级至${RISK_LABEL[target]}未满足条件：${problems.join("；")}。`
      )
    );
  }

  const updated: CaseRecord = {
    ...c,
    riskLevel: target,
    riskLog: [
      ...c.riskLog,
      {
        date: today(),
        from: c.riskLevel,
        to: target,
        reason: `连续两次会谈评估均不高于${RISK_LABEL[target]}且判断依据齐全（${lastTwo
          .map((s) => `${s.date} ${RISK_LABEL[s.riskLevel]}`)
          .join("、")}）`,
        by,
      },
    ],
  };
  return ok(replaceCase(state, updated), [
    `个案 ${caseId} 风险级别已降级：${RISK_LABEL[c.riskLevel]} → ${RISK_LABEL[target]}（连续两次低风险评估达标）。`,
  ]);
}

// ---------- R4 结案 / 重开 ----------

export function closeCase(state: LedgerState, caseId: string, reason: string, by: string): Result<LedgerState> {
  const c = findCase(state, caseId);
  if (!c) return fail(conflictOf({ id: caseId, riskLevel: "low" }, today(), [], "个案不存在。"));
  if (c.status === "closed") {
    return fail(conflictOf(c, today(), [RULES.CLOSED_FROZEN], "个案已结案，请勿重复操作。"));
  }
  if (!reason.trim()) {
    return fail(conflictOf(c, today(), [RULES.COMPLETE], "请填写结案原因。"));
  }
  const updated: CaseRecord = {
    ...c,
    status: "closed",
    closedAt: today(),
    closeReason: `${reason.trim()}（结案人：${by.trim() || c.counselor}）`,
  };
  return ok(replaceCase(state, updated), [
    `个案 ${caseId} 已结案，记录冻结：会谈、确认与安全计划不可再变更，仅可追加更正。`,
  ]);
}

export function reopenCase(state: LedgerState, caseId: string, reason: string, by: string): Result<LedgerState> {
  const c = findCase(state, caseId);
  if (!c) return fail(conflictOf({ id: caseId, riskLevel: "low" }, today(), [], "个案不存在。"));
  if (c.status === "active") {
    return fail(conflictOf(c, today(), [], "个案当前在案，无需重开。"));
  }
  if (!reason.trim()) {
    return fail(conflictOf(c, today(), [RULES.COMPLETE], "请填写重开原因。"));
  }
  const updated: CaseRecord = {
    ...c,
    status: "active",
    reopenHistory: [...c.reopenHistory, { reopenedAt: today(), reason: reason.trim(), by: by.trim() || c.counselor }],
  };
  // 重开后一致性校验：个案、会谈、确认状态与更正记录对应一致
  const problems = verifyCaseConsistency(updated);
  const confirmed = updated.sessions.filter((s) => s.confirmation).length;
  const notices =
    problems.length === 0
      ? [
          `个案 ${caseId} 已重开。`,
          `一致性校验通过：会谈 ${updated.sessions.length} 条、督导确认 ${confirmed} 条、更正 ${updated.corrections.length} 条，对应一致。`,
        ]
      : [`个案 ${caseId} 已重开，但一致性校验发现 ${problems.length} 项问题。`, ...problems];
  return ok(replaceCase(state, updated), notices);
}

// ---------- R5 更正（结案后唯一允许的写操作） ----------

export function addCorrection(state: LedgerState, caseId: string, draft: CorrectionDraft): Result<LedgerState> {
  const c = findCase(state, caseId);
  if (!c) return fail(conflictOf({ id: caseId, riskLevel: "low" }, today(), [], "个案不存在。"));

  if (!draft.reason.trim() || !draft.responsible.trim() || !draft.newContent.trim()) {
    return fail(
      conflictOf(c, today(), [RULES.CORRECTION_AUDIT], "更正须填写新内容、更正原因和责任人，三者缺一不可。")
    );
  }

  const original = getFieldValue(c, draft.targetType, draft.targetId, draft.field);
  if (original === null) {
    return fail(conflictOf(c, today(), [RULES.CORRECTION_AUDIT], "更正对象不存在或字段不可更正，更正未登记。"));
  }

  const fieldLabel =
    draft.targetType === "case"
      ? CASE_CORRECTABLE_FIELDS.find((f) => f.key === draft.field)?.label ?? draft.field
      : SESSION_CORRECTABLE_FIELDS.find((f) => f.key === draft.field)?.label ?? draft.field;

  const correction: Correction = {
    id: `COR-${state.seq + 1}`,
    targetType: draft.targetType,
    targetId: draft.targetId,
    field: draft.field,
    fieldLabel,
    originalContent: original,
    newContent: draft.newContent.trim(),
    reason: draft.reason.trim(),
    responsible: draft.responsible.trim(),
    correctedAt: today(),
  };

  // 应用新值（原内容在更正记录中冻结保留）
  let patched: CaseRecord = c;
  if (draft.targetType === "case") {
    patched = { ...c };
    if (draft.field === "clientAlias") patched.clientAlias = correction.newContent;
    if (draft.field === "counselor") patched.counselor = correction.newContent;
    if (draft.field === "registeredAt") patched.registeredAt = correction.newContent;
    if (draft.field === "goals")
      patched.goals = correction.newContent
        .split(/[;；\n]/)
        .map((s) => s.trim())
        .filter(Boolean);
  } else {
    const sessions = c.sessions.map((s) => {
      if (s.id !== draft.targetId) return s;
      const next = { ...s };
      if (draft.field === "date") next.date = correction.newContent;
      if (draft.field === "summary") next.summary = correction.newContent;
      if (draft.field === "nextGoal") next.nextGoal = correction.newContent;
      if (draft.field === "rationale") next.rationale = correction.newContent;
      return next;
    });
    patched = { ...c, sessions };
  }

  const updated: CaseRecord = { ...patched, corrections: [...c.corrections, correction] };
  const frozenNote = c.status === "closed" ? "（个案已结案，此为冻结状态下允许的更正）" : "";
  return ok(replaceCase(state, updated, 1), [
    `更正 ${correction.id} 已登记${frozenNote}：${fieldLabel} 原内容已保留，原因与责任人已存档。`,
  ]);
}

// ---------- 一致性校验（重开后个案/会谈/确认/更正对应一致） ----------

export function verifyCaseConsistency(c: CaseRecord): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();

  c.sessions.forEach((s, i) => {
    if (s.caseId !== c.id) problems.push(`会谈 ${s.id} 的个案引用（${s.caseId}）与个案 ${c.id} 不一致`);
    if (ids.has(s.id)) problems.push(`会谈编号重复：${s.id}`);
    ids.add(s.id);
    // 督导确认门不变式：高风险会谈未确认之前不得存在后续会谈
    if (i < c.sessions.length - 1 && s.riskLevel === "high" && !s.confirmation) {
      problems.push(`会谈 ${s.id}（${s.date}，高风险）未经督导确认，但已存在后续会谈 ${c.sessions[i + 1].id}`);
    }
  });

  for (const cor of c.corrections) {
    if (cor.targetType === "case" && cor.targetId !== c.id) {
      problems.push(`更正 ${cor.id} 的个案引用（${cor.targetId}）与个案 ${c.id} 不一致`);
    }
    if (cor.targetType === "session" && !c.sessions.some((s) => s.id === cor.targetId)) {
      problems.push(`更正 ${cor.id} 指向不存在的会谈 ${cor.targetId}`);
    }
    if (!cor.originalContent.trim() || !cor.reason.trim() || !cor.responsible.trim()) {
      problems.push(`更正 ${cor.id} 缺少原内容、原因或责任人`);
    }
  }

  if (c.riskLevel === "high" && !c.safetyPlan) {
    problems.push("个案当前为高风险但缺少安全计划");
  }
  return problems;
}
