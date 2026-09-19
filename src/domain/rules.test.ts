// 危机分级台账 —— 规则引擎自检
import { describe, expect, it } from "vitest";
import { Ledger, RiskLevel, SafetyPlan } from "./types";
import {
  addSession,
  applyCorrection,
  auditLedger,
  closeCase,
  confirmSession,
  createCase,
  currentRisk,
  downgradeCheck,
  effectiveCurrentRisk,
  effectiveLevelAt,
  reopenCase,
  validateIntake,
} from "./rules";

const PLAN: SafetyPlan = {
  warningSigns: "w",
  copingSteps: "c",
  supporters: "s",
  professionalContacts: "p",
  environmentSafety: "e",
};

function baseInput(over: Partial<Parameters<typeof createCase>[1]> = {}) {
  return {
    id: "C-T1",
    registeredAt: "2026-09-01",
    clientCode: "X-1",
    counselor: "咨询师甲",
    topic: "测试主题",
    riskLevel: "medium" as RiskLevel,
    goal: "稳定情绪",
    ...over,
  };
}

function sessionInput(over: Partial<Parameters<typeof addSession>[2]> = {}) {
  return {
    date: "2026-09-10",
    riskLevel: "medium" as RiskLevel,
    goal: "目标",
    summary: "摘要",
    ...over,
  };
}

function register(over: Partial<Parameters<typeof createCase>[1]> = {}): Ledger {
  const res = createCase({ cases: [] }, baseInput(over));
  if (!res.ok) throw new Error("登记失败: " + res.conflict.message);
  return res.value;
}

function caseId(l: Ledger) {
  return l.cases[0].id;
}

/** 确认个案全部会谈，便于推进到下一步 */
function confirmAll(ledger: Ledger): Ledger {
  let l = ledger;
  for (const c of l.cases) {
    for (const s of c.sessions) {
      if (s.confirm !== "confirmed") {
        const r = confirmSession(l, c.id, s.id, "督导乙");
        if (r.ok) l = r.value;
      }
    }
  }
  return l;
}

describe("规则一：登记 + 高风险安全计划", () => {
  it("普通登记成功，按登记日期/风险/目标建档", () => {
    const l = register();
    expect(l.cases).toHaveLength(1);
    expect(l.cases[0].registeredAt).toBe("2026-09-01");
    expect(currentRisk(l.cases[0])).toBe("medium");
  });

  it("高风险缺安全计划被拦截", () => {
    const err = validateIntake(baseInput({ riskLevel: "high" }));
    expect(err?.code).toBe("HIGH_RISK_SAFETY_PLAN_REQUIRED");
  });

  it("安全计划缺项（五项不全）被拦截", () => {
    const err = validateIntake(
      baseInput({ riskLevel: "high", safetyPlan: { ...PLAN, supporters: "" } })
    );
    expect(err?.code).toBe("HIGH_RISK_SAFETY_PLAN_REQUIRED");
  });

  it("高风险附完整安全计划可登记，计划随登记会谈落盘", () => {
    const l = register({ riskLevel: "high", safetyPlan: PLAN });
    expect(l.cases[0].sessions[0].safetyPlan).toBeDefined();
  });

  it("缺干预目标被拦截", () => {
    const err = validateIntake(baseInput({ goal: " " }));
    expect(err?.code).toBe("VALIDATION");
  });
});

describe("规则二：督导确认前下一次会谈不能落盘", () => {
  it("登记会谈未确认时新增会谈被拦截", () => {
    const l = register();
    const res = addSession(l, caseId(l), sessionInput());
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.conflict.code).toBe("PERSIST_BLOCKED_PENDING_SUPERVISION");
  });

  it("督导确认后可以新增并落盘，新会谈初始为待确认", () => {
    let l = confirmAll(register());
    const res = addSession(l, caseId(l), sessionInput({ date: "2026-09-12" }));
    expect(res.ok).toBe(true);
    if (res.ok) {
      l = res.value;
      const added = l.cases[0].sessions.at(-1)!;
      expect(added.persisted).toBe(true);
      expect(added.confirm).toBe("pending");
    }
  });

  it("督导确认必须留督导姓名", () => {
    const l = register();
    const res = confirmSession(l, caseId(l), l.cases[0].sessions[0].id, "  ");
    expect(res.ok).toBe(false);
  });
});

describe("规则三：连续两次低风险方可降级且须写明依据", () => {
  it("高风险直接降为中风险被拦截（不能跳过低风险）", () => {
    let l = register({ riskLevel: "high", safetyPlan: PLAN });
    l = confirmAll(l);
    const res = addSession(l, caseId(l), sessionInput({ riskLevel: "medium" }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.conflict.code).toBe("DOWNGRADE_NEEDS_TWO_LOW");
  });

  it("中风险后第一次低风险放行（观察期），生效级别仍为中风险", () => {
    let l = register({ riskLevel: "medium" });
    l = confirmAll(l);
    const res = addSession(l, caseId(l), sessionInput({ riskLevel: "low", date: "2026-09-10" }));
    expect(res.ok).toBe(true);
    if (res.ok) {
      l = res.value;
      expect(effectiveCurrentRisk(l.cases[0])).toBe("medium");
      const ordered = [...l.cases[0].sessions].sort((a, b) => a.date.localeCompare(b.date));
      expect(ordered[1].riskLevel).toBe("low");
    }
  });

  it("第二次低风险但未写判断依据被拦截", () => {
    let l = register({ riskLevel: "medium" });
    l = confirmAll(l);
    let r = addSession(l, caseId(l), sessionInput({ riskLevel: "low", date: "2026-09-10" }));
    if (!r.ok) throw new Error(r.conflict.message);
    l = confirmAll(r.value);
    const res = addSession(l, caseId(l), sessionInput({ riskLevel: "low", date: "2026-09-20" }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.conflict.code).toBe("DOWNGRADE_BASIS_REQUIRED");
  });

  it("连续两次低风险且写明依据，降级生效为低风险", () => {
    let l = register({ riskLevel: "medium" });
    l = confirmAll(l);
    let r = addSession(l, caseId(l), sessionInput({ riskLevel: "low", date: "2026-09-10" }));
    if (!r.ok) throw new Error(r.conflict.message);
    l = confirmAll(r.value);
    r = addSession(l, caseId(l), {
      ...sessionInput({ riskLevel: "low", date: "2026-09-20" }),
      downgradeBasis: "两周内无惊恐发作、量表下降、社会功能恢复。",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      l = r.value;
      expect(effectiveCurrentRisk(l.cases[0])).toBe("low");
      expect(l.cases[0].sessions.at(-1)?.downgradeBasis).toContain("量表");
    }
  });

  it("观察期内回升中风险，随后再次低风险算第一次而非第二次", () => {
    let l = register({ riskLevel: "medium" });
    l = confirmAll(l);
    const steps: RiskLevel[] = ["low", "medium", "low"];
    let date = 10;
    for (const level of steps) {
      const r = addSession(l, caseId(l), sessionInput({ riskLevel: level, date: `2026-09-${date}` }));
      if (!r.ok) throw new Error(r.conflict.message);
      l = confirmAll(r.value);
      date += 8;
    }
    // medium -> low(观察) -> medium(重置) -> low(再次观察)：仍未降级
    expect(effectiveCurrentRisk(l.cases[0])).toBe("medium");
  });

  it("持续低风险之后不再要求依据（已在低风险级别）", () => {
    let l = register({ riskLevel: "low" });
    l = confirmAll(l);
    const r = addSession(l, caseId(l), sessionInput({ riskLevel: "low", date: "2026-09-15" }));
    expect(r.ok).toBe(true);
    expect(downgradeCheck(l.cases[0], { date: "x", riskLevel: "low" })).toBeNull();
  });

  it("高风险会谈同样强制安全计划", () => {
    let l = register({ riskLevel: "low" });
    l = confirmAll(l);
    const r = addSession(l, caseId(l), sessionInput({ riskLevel: "high", date: "2026-09-15" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.conflict.code).toBe("HIGH_RISK_SAFETY_PLAN_REQUIRED");
  });
});

describe("规则四：结案冻结", () => {
  it("存在未确认会谈时不能结案", () => {
    const l = register();
    const r = closeCase(l, caseId(l));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.conflict.code).toBe("PERSIST_BLOCKED_PENDING_SUPERVISION");
  });

  it("全部确认后可以结案", () => {
    const l = confirmAll(register());
    const r = closeCase(l, caseId(l));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.cases[0].status).toBe("closed");
  });

  it("冻结个案不能新增会谈", () => {
    let l = closeCase(confirmAll(register()), "C-T1");
    if (!l.ok) throw new Error("结案失败");
    const r = addSession(l.value, caseId(l.value), sessionInput());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.conflict.code).toBe("FROZEN_CASE_WRITE_BLOCKED");
  });
});

describe("规则五：更正保留原内容、原因、责任人", () => {
  it("冻结后更正缺责任人被拦截", () => {
    let l = closeCase(confirmAll(register()), "C-T1");
    if (!l.ok) throw new Error("结案失败");
    const target = l.value.cases[0].sessions[0];
    const r = applyCorrection(l.value, caseId(l.value), {
      targetType: "session",
      targetId: target.id,
      field: "summary",
      original: target.summary,
      corrected: "新摘要",
      reason: "事实错误",
      responsible: "  ",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.conflict.code).toBe("CORRECTION_TRACE_REQUIRED");
  });

  it("更正不覆盖原文，原内容/原因/责任人全部留痕", () => {
    let l = closeCase(confirmAll(register()), "C-T1");
    if (!l.ok) throw new Error("结案失败");
    const target = l.value.cases[0].sessions[0];
    const r = applyCorrection(l.value, caseId(l.value), {
      targetType: "session",
      targetId: target.id,
      field: "summary",
      original: target.summary,
      corrected: "更正后的摘要",
      reason: "来访者来电澄清",
      responsible: "咨询师甲",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      const c = r.value.cases[0];
      expect(c.sessions[0].summary).toBe("更正后的摘要");
      const cor = c.corrections[0];
      expect(cor.original).toBe("登记会谈");
      expect(cor.reason).toBe("来访者来电澄清");
      expect(cor.responsible).toBe("咨询师甲");
    }
  });
});

describe("规则六：重开与一致性核对", () => {
  it("只有已结案个案可以重开，且需要原因", () => {
    const l = register();
    expect(reopenCase(l, "C-T1", "x").ok).toBe(false);
    const closed = closeCase(confirmAll(l), "C-T1");
    if (!closed.ok) throw new Error("结案失败");
    expect(reopenCase(closed.value, "C-T1", " ").ok).toBe(false);
    const r = reopenCase(closed.value, "C-T1", "风险反复");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.cases[0].status).toBe("reopened");
  });

  it("重开后状态一致 → 核对无冲突", () => {
    const closed = closeCase(confirmAll(register()), "C-T1");
    if (!closed.ok) throw new Error("结案失败");
    const reopened = reopenCase(closed.value, "C-T1", "复发");
    if (!reopened.ok) throw new Error("重开失败");
    expect(auditLedger(reopened.value)).toHaveLength(0);
  });

  it("上一次会谈未确认却出现已落盘会谈 → 命中 REOPEN_CONSISTENCY_BROKEN，并展示个案/日期/级别/明细", () => {
    const closed = closeCase(confirmAll(register()), "C-T1");
    if (!closed.ok) throw new Error("结案失败");
    const reopened = reopenCase(closed.value, "C-T1", "复发");
    if (!reopened.ok) throw new Error("重开失败");
    // 手工构造不一致状态：新增一次未落盘未确认会谈，再追加一次已落盘会谈
    let l = reopened.value;
    const c0 = l.cases[0];
    const ordered = [...c0.sessions].sort((a, b) => a.date.localeCompare(b.date));
    const last = ordered[ordered.length - 1];
    const broken: Ledger = {
      cases: [
        {
          ...c0,
          sessions: [
            ...c0.sessions,
            { ...last, id: "x-unconfirmed", date: "2026-10-01", riskLevel: "medium", persisted: false, confirm: "pending" },
            { ...last, id: "x-persisted", date: "2026-10-08", riskLevel: "medium", persisted: true, confirm: "pending" },
          ],
        },
      ],
    };
    const faults = auditLedger(broken);
    expect(faults).toHaveLength(1);
    expect(faults[0].code).toBe("REOPEN_CONSISTENCY_BROKEN");
    expect(faults[0].caseId).toBe("C-T1");
    expect(faults[0].date).toBeUndefined();
    expect(faults[0].riskLevel).toBe("medium");
    expect(faults[0].details?.join("\n")).toContain("未经督导确认");
  });

  it("更正记录指向已删除会谈 → 一致性核对报出", () => {
    const closed = closeCase(confirmAll(register()), "C-T1");
    if (!closed.ok) throw new Error("结案失败");
    const reopened = reopenCase(closed.value, "C-T1", "复发");
    if (!reopened.ok) throw new Error("重开失败");
    const c = reopened.value.cases[0];
    const broken: Ledger = {
      cases: [
        {
          ...c,
          corrections: [
            ...c.corrections,
            {
              id: "cor-x",
              targetType: "session",
              targetId: "missing-session",
              field: "summary",
              original: "o",
              corrected: "n",
              reason: "r",
              responsible: "p",
              createdAt: "2026-10-01",
            },
          ],
        },
      ],
    };
    expect(auditLedger(broken)[0].details?.join("\n")).toContain("无法对应");
  });
});

describe("生效级别的边界", () => {
  it("登记为低风险时直接生效为低风险", () => {
    const l = register({ riskLevel: "low" });
    expect(effectiveCurrentRisk(l.cases[0])).toBe("low");
  });

  it("观察期的低风险会谈 effectiveLevelAt 返回前一级别", () => {
    let l = register({ riskLevel: "high", safetyPlan: PLAN });
    l = confirmAll(l);
    const r = addSession(l, caseId(l), sessionInput({ riskLevel: "low", date: "2026-09-10" }));
    if (!r.ok) throw new Error(r.conflict.message);
    const ordered = [...r.value.cases[0].sessions].sort((a, b) => a.date.localeCompare(b.date));
    expect(effectiveLevelAt(ordered, 1)).toBe("high");
  });
});
