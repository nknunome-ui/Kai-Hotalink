import { describe, expect, it } from "vitest";
import { normalizeEvidence } from "./profile";
import { progressOf } from "./progress";
import type { Resident } from "./records";
import { emptyProfile } from "./types";

const base = (): Resident => ({
  id: "r1",
  name: "山田 花子",
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
  profile: null,
  profileConfirmed: false,
  extraction: null,
  staffNotes: "",
  interviewNotes: "",
  priorFacilityNotes: "",
  documents: [],
  survey: null,
  latestJudgment: null,
});

const survey = (issuedAt: string, submittedAt: string | null) => ({
  issuedAt,
  expiresAt: "2026-10-20T00:00:00.000Z",
  submittedAt,
  answers: submittedAt ? {} : null,
  questionIds: [],
  pastExperienceSummary: null,
});

describe("次にやること", () => {
  it("登録直後 → 資料、追記あり → AI読み取り、読み取り後 → 確認", () => {
    const r = base();
    expect(progressOf(r).next).toMatchObject({ step: "documents", text: "資料を登録するか、病状を追記する" });
    r.staffNotes = "要介護3";
    expect(progressOf(r).next).toMatchObject({ step: "documents", text: "AIで資料を読み取る" });
    r.profile = emptyProfile();
    expect(progressOf(r).next?.step).toBe("profile");
    expect(progressOf(r).done).toMatchObject({ documents: true, profile: false });
  });

  it("確認後 → アンケート、回答待ちでも判定に進める", () => {
    const r = { ...base(), profile: emptyProfile(), profileConfirmed: true };
    expect(progressOf(r).next?.step).toBe("survey");
    r.survey = survey("2026-10-02T00:00:00.000Z", null);
    expect(progressOf(r).next).toMatchObject({ step: "judge", text: "判定する（家族の回答は後から反映できます）" });
  });

  it("判定後に回答が来たら再判定、URLを送っただけなら古くならない", () => {
    const at = "2026-10-03T00:00:00.000Z";
    const r: Resident = {
      ...base(),
      profile: emptyProfile(),
      profileConfirmed: true,
      updatedAt: at,
      latestJudgment: { id: "j1", grade: "A", riskScore: 0, at },
    };
    // 判定のあとで URL を発行（updatedAt = issuedAt）
    r.survey = survey("2026-10-04T00:00:00.000Z", null);
    r.updatedAt = "2026-10-04T00:00:00.000Z";
    expect(progressOf(r)).toMatchObject({ stale: false, next: { step: "survey", waiting: true } });
    // 家族が回答
    r.survey = survey("2026-10-04T00:00:00.000Z", "2026-10-05T00:00:00.000Z");
    r.updatedAt = "2026-10-05T00:00:00.000Z";
    expect(progressOf(r)).toMatchObject({ stale: true, next: { step: "judge", text: "情報が変わったので、もう一度判定する" } });
    expect(progressOf(r).done.judge).toBe(false);
    // もう一度判定すると完了
    r.latestJudgment = { id: "j2", grade: "A", riskScore: 0, at: r.updatedAt };
    expect(progressOf(r)).toMatchObject({ stale: false, next: null });
  });
});

describe("AI の根拠", () => {
  it("知らない項目・空の引用・重複を捨て、長さを切る", () => {
    const ev = normalizeEvidence([
      { field: "careLevel", quote: " 要介護3 ", source: "意見書.pdf" },
      { field: "careLevel", quote: "要介護4", source: "別.pdf" },
      { field: "unknown", quote: "x", source: "y" },
      { field: "oxygen", quote: "  ", source: "y" },
      { field: "wandering", quote: "あ".repeat(300) },
      "garbage",
    ]);
    expect(ev).toEqual([
      { field: "careLevel", quote: "要介護3", source: "意見書.pdf" },
      { field: "wandering", quote: "あ".repeat(160), source: "資料" },
    ]);
    expect(normalizeEvidence(undefined)).toEqual([]);
  });
});
