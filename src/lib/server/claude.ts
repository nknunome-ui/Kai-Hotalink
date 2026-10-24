import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { normalizeEvidence, normalizeProfile } from "@/lib/domain/profile";
import { HttpError } from "./http";
import { PROFILE_FIELDS, emptyProfile, type Evidence, type ProfileField, type ResidentProfile } from "@/lib/domain/types";

// Claude は「資料を読んで項目を拾う」「自由記述を要約する」だけを担当する。
// 点数付けと判定は lib/domain/judge.ts のルールで行う。
// ANTHROPIC_API_KEY が無いときはダミーで動く（画面の流れの確認用）。

const MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-5-5";

export const aiEnabled = () => Boolean(process.env.ANTHROPIC_API_KEY);

let client: Anthropic | null = null;
const anthropic = () => (client ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }));

export interface SourceFile {
  name: string;
  contentType: string;
  data: Buffer;
}

export interface ExtractionResult {
  profile: ResidentProfile;
  /** 資料から判断できなかった項目・確認が必要な点 */
  uncertain: string[];
  /** 項目ごとの根拠（資料からの抜き書き） */
  evidence: Evidence[];
  model: string;
}

const PROFILE_TOOL: Anthropic.Tool = {
  name: "record_resident_profile",
  description: "介護資料から読み取った入居希望者の状態を記録する",
  input_schema: {
    type: "object",
    required: ["careLevel", "medical", "physical", "cognition", "summary", "uncertain", "evidence"],
    properties: {
      age: { type: ["integer", "null"], description: "年齢。不明なら null" },
      careLevel: {
        type: "integer",
        minimum: 0,
        maximum: 7,
        description: "0=自立, 1=要支援1, 2=要支援2, 3=要介護1, 4=要介護2, 5=要介護3, 6=要介護4, 7=要介護5",
      },
      medical: {
        type: "object",
        required: ["suction", "gastrostomy", "tracheostomy", "oxygen", "insulin", "urinaryCatheter", "dialysis", "pressureUlcer"],
        properties: {
          suction: { type: "string", enum: ["none", "day", "night", "both"], description: "たん吸引が必要な時間帯" },
          gastrostomy: { type: "boolean", description: "胃ろう・経管栄養" },
          tracheostomy: { type: "boolean", description: "気管切開" },
          oxygen: { type: "boolean", description: "在宅酸素療法" },
          insulin: { type: "boolean", description: "インスリン注射" },
          urinaryCatheter: { type: "boolean", description: "尿道カテーテル留置" },
          dialysis: { type: "boolean", description: "人工透析" },
          pressureUlcer: { type: "boolean", description: "褥瘡の処置が必要" },
        },
      },
      physical: {
        type: "object",
        required: ["mobility", "fallsLastYear"],
        properties: {
          mobility: {
            type: "string",
            enum: ["independent", "supervision", "partial", "full", "bedridden"],
            description: "移動の状態: 自立/見守り/一部介助/全介助/寝たきり",
          },
          fallsLastYear: { type: "integer", minimum: 0, description: "直近1年の転倒回数。記載がなければ 0" },
        },
      },
      cognition: {
        type: "object",
        required: ["dementiaLevel", "wandering", "aggression", "careRefusal", "nightDisturbance"],
        properties: {
          dementiaLevel: {
            type: "integer",
            minimum: 0,
            maximum: 4,
            description: "認知症高齢者の日常生活自立度から: 0=なし/自立, 1=I〜IIa, 2=IIb〜IIIa, 3=IIIb〜IV, 4=M",
          },
          wandering: { type: "boolean" },
          aggression: { type: "boolean", description: "暴言・暴力" },
          careRefusal: { type: "boolean", description: "介護拒否" },
          nightDisturbance: { type: "boolean", description: "昼夜逆転・夜間の不穏" },
        },
      },
      summary: {
        type: "string",
        description: "主な病名、服薬、生活上の注意点などを日本語で300字以内に要約",
      },
      uncertain: {
        type: "array",
        items: { type: "string" },
        description: "資料から判断できなかった項目や、施設が面談で確認すべき点（日本語、各1文）",
      },
      evidence: {
        type: "array",
        description:
          "値を決めた根拠。資料に記載があった項目ごとに1件。記載がなく既定値（なし・0・不要など）にした項目は含めない",
        items: {
          type: "object",
          required: ["field", "quote", "source"],
          properties: {
            field: { type: "string", enum: [...PROFILE_FIELDS], description: "項目名（suction などは medical の中の項目）" },
            quote: { type: "string", description: "根拠になった資料の記述を、原文のまま80字以内で抜き書き" },
            source: { type: "string", description: "資料のファイル名。スタッフの追記なら「スタッフの追記」" },
          },
        },
      },
    },
  },
};

/** Claude API を呼ぶ。失敗したら、施設の担当者が対処できる文言の HttpError にする */
async function callClaude(params: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message> {
  try {
    return await anthropic().messages.create(params);
  } catch (e) {
    console.error("Claude API error", e);
    throw new HttpError(502, claudeErrorMessage(e));
  }
}

function claudeErrorMessage(e: unknown): string {
  if (e instanceof Anthropic.APIConnectionTimeoutError) return "AI の応答に時間がかかりすぎました。資料を減らすか、しばらくしてからもう一度お試しください";
  if (e instanceof Anthropic.APIConnectionError) return "AI（Claude API）に接続できませんでした。しばらくしてからもう一度お試しください";
  if (!(e instanceof Anthropic.APIError)) return "AI の読み取りでエラーが起きました";
  const detail = e.message ?? "";
  switch (e.status) {
    case 401:
      return "ANTHROPIC_API_KEY が正しくありません。Anthropic Console で発行したキーを Vercel の環境変数に登録し直してください";
    case 403:
      return "この APIキーでは Claude を利用できません。Anthropic Console でキーの権限を確認してください";
    case 404:
      return `AI のモデル「${MODEL}」が見つかりません。環境変数 CLAUDE_MODEL を確認してください`;
    case 413:
      return "資料のサイズが大きすぎて AI に送れません。不要な資料を削除してください";
    case 429:
      return "AI の利用上限に達しました。少し時間をおくか、Anthropic Console の利用上限を確認してください";
    case 529:
      return "AI が混み合っています。しばらくしてからもう一度お試しください";
  }
  if (/credit balance/i.test(detail)) return "Anthropic のクレジット残高が不足しています。Anthropic Console の Billing でクレジットを追加してください";
  if (e.status === 400) return `AI が資料を読み取れませんでした（${detail.slice(0, 200)}）`;
  return `AI の読み取りでエラーが起きました（${e.status ?? "不明"}）`;
}

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;

function toBlocks(files: SourceFile[]): Anthropic.ContentBlockParam[] {
  const blocks: Anthropic.ContentBlockParam[] = [];
  for (const f of files) {
    const data = f.data.toString("base64");
    if (f.contentType === "application/pdf") {
      blocks.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data }, title: f.name });
    } else if ((IMAGE_TYPES as readonly string[]).includes(f.contentType)) {
      blocks.push({ type: "text", text: `【資料：${f.name}】` });
      blocks.push({
        type: "image",
        source: { type: "base64", media_type: f.contentType as (typeof IMAGE_TYPES)[number], data },
      });
    } else if (f.contentType.startsWith("text/")) {
      blocks.push({ type: "text", text: `【資料：${f.name}】\n${f.data.toString("utf8").slice(0, 50000)}` });
    }
  }
  return blocks;
}

export async function extractProfile(files: SourceFile[], staffNotes: string): Promise<ExtractionResult> {
  if (!aiEnabled()) return mockExtract(staffNotes);

  const res = await callClaude({
    model: MODEL,
    max_tokens: 4000,
    system:
      "あなたは介護施設の入居相談員を補助するアシスタントです。主治医意見書・ケアプラン・看護サマリーなどの資料から、入居希望者の状態を項目ごとに正確に読み取ってください。資料に書かれていないことは推測せず、該当なし（false / none / 0）にしたうえで、確認が必要なら uncertain に書いてください。値を決めた項目には、根拠になった記述を原文のまま evidence に抜き書きしてください（要約や言い換えはしない）。結果は必ず record_resident_profile ツールで記録してください。",
    tools: [PROFILE_TOOL],
    tool_choice: { type: "tool", name: PROFILE_TOOL.name },
    messages: [
      {
        role: "user",
        content: [
          ...toBlocks(files),
          {
            type: "text",
            text: `以下は施設スタッフの追記です（資料と食い違う場合はスタッフの追記を優先）。\n${staffNotes || "（追記なし）"}`,
          },
        ],
      },
    ],
  });

  const tool = res.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
  if (!tool) throw new Error("AI から抽出結果が返りませんでした");
  const input = tool.input as Record<string, unknown>;
  const uncertain = Array.isArray(input.uncertain)
    ? input.uncertain.filter((x): x is string => typeof x === "string").slice(0, 20)
    : [];
  return { profile: normalizeProfile(input), uncertain, evidence: normalizeEvidence(input.evidence), model: MODEL };
}

/** 家族の自由記述（過去に困ったこと）を、施設が読める短い要約にする */
export async function summarizePastExperience(text: string): Promise<string> {
  const t = text.trim();
  if (!t) return "";
  if (!aiEnabled()) return t.slice(0, 300);
  const res = await callClaude({
    model: MODEL,
    max_tokens: 400,
    system:
      "介護施設の相談員向けに、入居希望者の家族が書いた「過去に病院や介護サービスで困ったこと」を要約します。家族を評価・ラベル付けする言葉（クレーマー、要注意など）は使わず、事実と家族が望んでいたことを中立的に、日本語で2〜3文にまとめてください。",
    messages: [{ role: "user", content: t.slice(0, 2000) }],
  });
  const block = res.content.find((b): b is Anthropic.TextBlock => b.type === "text");
  return block?.text.trim() ?? "";
}

// ---------- ダミー（APIキー未設定時） ----------

function mockExtract(notes: string): ExtractionResult {
  const p = emptyProfile();
  const evidence: Evidence[] = [];
  // 見つけたキーワードを含む一文を根拠として抜き書きする
  const sentences = notes.split(/(?<=[。\n])/).map((x) => x.trim()).filter(Boolean);
  const cite = (field: ProfileField, word: string) => {
    const quote = sentences.find((x) => x.includes(word));
    if (!quote || evidence.some((e) => e.field === field)) return;
    evidence.push({ field, quote, source: "スタッフの追記" });
  };
  const has = (...words: string[]) => words.some((w) => notes.includes(w));
  const care = notes.match(/要介護\s*([1-5１-５])/);
  if (care) p.careLevel = (Number(care[1].replace(/[１-５]/, (d) => String("１２３４５".indexOf(d) + 1))) + 2) as ResidentProfile["careLevel"];
  else if (has("要支援2", "要支援２")) p.careLevel = 2;
  else if (has("要支援")) p.careLevel = 1;
  if (has("吸引")) p.medical.suction = has("夜間") ? "night" : "day";
  p.medical.gastrostomy = has("胃ろう", "胃瘻", "経管");
  p.medical.oxygen = has("酸素");
  p.medical.insulin = has("インスリン");
  p.medical.dialysis = has("透析");
  p.medical.urinaryCatheter = has("カテーテル", "バルーン");
  p.medical.tracheostomy = has("気管切開");
  p.medical.pressureUlcer = has("褥瘡");
  if (has("寝たきり")) p.physical.mobility = "bedridden";
  else if (has("全介助")) p.physical.mobility = "full";
  else if (has("一部介助")) p.physical.mobility = "partial";
  else if (has("見守り")) p.physical.mobility = "supervision";
  const falls = notes.match(/転倒[^0-9０-９]{0,6}([0-9０-９]+)\s*回/);
  if (falls) p.physical.fallsLastYear = Number(falls[1].replace(/[０-９]/g, (d) => String("０１２３４５６７８９".indexOf(d))));
  if (has("認知症")) p.cognition.dementiaLevel = has("重度") ? 3 : has("中等度") ? 2 : 1;
  p.cognition.wandering = has("徘徊");
  p.cognition.aggression = has("暴言", "暴力");
  p.cognition.careRefusal = has("拒否");
  p.cognition.nightDisturbance = has("昼夜逆転", "不穏");
  const KEYWORDS: [ProfileField, string[]][] = [
    ["careLevel", ["要介護", "要支援"]],
    ["suction", ["吸引"]],
    ["gastrostomy", ["胃ろう", "胃瘻", "経管"]],
    ["oxygen", ["酸素"]],
    ["insulin", ["インスリン"]],
    ["dialysis", ["透析"]],
    ["urinaryCatheter", ["カテーテル", "バルーン"]],
    ["tracheostomy", ["気管切開"]],
    ["pressureUlcer", ["褥瘡"]],
    ["mobility", ["寝たきり", "全介助", "一部介助", "見守り"]],
    ["fallsLastYear", ["転倒"]],
    ["dementiaLevel", ["認知症"]],
    ["wandering", ["徘徊"]],
    ["aggression", ["暴言", "暴力"]],
    ["careRefusal", ["拒否"]],
    ["nightDisturbance", ["昼夜逆転", "不穏"]],
  ];
  for (const [field, words] of KEYWORDS) for (const w of words) cite(field, w);
  p.summary = "（AI 未設定のためダミーの読み取りです。スタッフの追記からキーワードで推定しました）";
  return {
    profile: p,
    uncertain: ["ANTHROPIC_API_KEY を設定すると、アップロードした資料を Claude が読み取ります"],
    evidence,
    model: "mock",
  };
}
