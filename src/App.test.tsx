// 界面渲染冒烟：确保 App 在初始台账下能完整渲染且包含关键规则文案
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import App from "./App";

describe("App 渲染冒烟", () => {
  it("台账、规则提示、四个种子个案全部渲染", () => {
    const html = renderToStaticMarkup(<App />);
    expect(html).toContain("心理咨询个案危机分级台账");
    expect(html).toContain("C-101");
    expect(html).toContain("C-204");
    expect(html).toContain("C-317");
    expect(html).toContain("C-451");
    expect(html).toContain("督导确认前下一次会谈不能落盘".replace("不能落盘", "不落盘"));
    expect(html).toContain("安全计划");
    expect(html).toContain("一致性核对");
    expect(html).toContain("更正记录");
  });
});
