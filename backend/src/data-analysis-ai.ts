/**
 * AI-powered data analysis: sends dataset schema to Claude/Codex
 * for column analysis, statistics suggestions, and chart recommendations.
 */

import type {
  DatasetSchema,
  AiAnalysisResult,
  CodingProvider,
} from "@my-ai-console/shared";

export async function analyzeDataset(
  schema: DatasetSchema,
  sampleRows: Record<string, unknown>[],
  provider: CodingProvider,
  model: string
): Promise<AiAnalysisResult> {
  const prompt = buildAnalysisPrompt(schema, sampleRows);

  if (provider === "claude") {
    return analyzeWithClaude(prompt, model);
  } else {
    return analyzeWithOpenAI(prompt, model);
  }
}

function buildAnalysisPrompt(
  schema: DatasetSchema,
  sampleRows: Record<string, unknown>[]
): string {
  const columnDesc = schema.columns
    .map(
      (c) =>
        `  - ${c.name}: 추론 타입=${c.inferredType}, null=${c.nullCount}, 고유값=${c.uniqueCount}, 예시=${c.sampleValues.slice(0, 3).join(", ")}`
    )
    .join("\n");

  const sampleJson = JSON.stringify(sampleRows.slice(0, 5), null, 2);

  return `당신은 데이터 분석 전문가입니다. 다음 데이터셋을 분석하고 JSON 형식으로 응답하세요.
모든 설명은 한국어로 작성하세요.

파일: ${schema.fileName}
행 수: ${schema.rowCount}
파일 크기: ${(schema.fileSizeBytes / 1024).toFixed(1)}KB
파일 형식: ${schema.fileType}

컬럼 정보:
${columnDesc}

샘플 데이터 (처음 5행):
${sampleJson}

다음 JSON 구조로 정확히 응답하세요 (JSON만, 마크다운 코드블록 없이):
{
  "columnDescriptions": {
    "컬럼이름": "이 컬럼에 대한 한국어 설명"
  },
  "statistics": {
    "숫자형컬럼이름": {
      "mean": 평균값,
      "median": 중앙값,
      "min": 최소값,
      "max": 최대값,
      "stddev": 표준편차
    }
  },
  "suggestedCharts": [
    {
      "chartType": "scatter|line|bar|histogram|pie|heatmap|box|violin|regression|correlation|scatter3d",
      "reason": "이 차트를 추천하는 이유 (한국어)",
      "xAxis": "X축에 사용할 컬럼명",
      "yAxis": "Y축에 사용할 컬럼명",
      "priority": 1
    }
  ],
  "dataQualityNotes": [
    "데이터 품질에 대한 한국어 참고사항"
  ]
}

주의사항:
- suggestedCharts는 최대 5개까지, priority 1이 가장 추천
- chartType은 반드시 위에 나열된 값 중 하나
- 시계열 데이터가 있으면 line 차트를 우선 추천
- 수치형 컬럼이 여러 개면 correlation 차트도 추천
- 카테고리형 컬럼이 있으면 bar나 pie 차트 추천`;
}

async function analyzeWithClaude(
  prompt: string,
  model: string
): Promise<AiAnalysisResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return getFallbackAnalysis();
  }

  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey });
  const message = await client.messages.create({
    model,
    max_tokens: 4096,
    messages: [{ role: "user", content: prompt }],
  });

  const text =
    message.content[0]?.type === "text" ? message.content[0].text : "";
  return parseAiResponse(text);
}

async function analyzeWithOpenAI(
  prompt: string,
  model: string
): Promise<AiAnalysisResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return getFallbackAnalysis();
  }

  const { default: OpenAI } = await import("openai");
  const client = new OpenAI({ apiKey });
  const completion = await client.chat.completions.create({
    model,
    messages: [{ role: "user", content: prompt }],
    max_tokens: 4096,
  });

  const text = completion.choices[0]?.message?.content ?? "";
  return parseAiResponse(text);
}

function parseAiResponse(text: string): AiAnalysisResult {
  // Try to extract JSON from the response
  let jsonStr = text.trim();

  // Remove markdown code blocks if present
  const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1].trim();
  }

  // Try to find JSON object in the text
  const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    jsonStr = jsonMatch[0];
  }

  try {
    const parsed = JSON.parse(jsonStr);
    return {
      columnDescriptions: parsed.columnDescriptions ?? {},
      statistics: parsed.statistics ?? {},
      suggestedCharts: (parsed.suggestedCharts ?? []).map(
        (s: Record<string, unknown>) => ({
          chartType: s.chartType ?? "scatter",
          reason: s.reason ?? "",
          xAxis: s.xAxis ?? "",
          yAxis: s.yAxis ?? "",
          priority: Number(s.priority) || 1,
        })
      ),
      dataQualityNotes: parsed.dataQualityNotes ?? [],
    };
  } catch {
    console.error("[DataAnalysisAI] Failed to parse AI response:", text.slice(0, 200));
    return getFallbackAnalysis();
  }
}

function getFallbackAnalysis(): AiAnalysisResult {
  return {
    columnDescriptions: {},
    statistics: {},
    suggestedCharts: [
      {
        chartType: "scatter",
        reason: "기본 산점도로 데이터 분포를 확인하세요",
        xAxis: "",
        yAxis: "",
        priority: 1,
      },
    ],
    dataQualityNotes: ["AI 분석을 사용하려면 API 키를 설정하세요."],
  };
}
