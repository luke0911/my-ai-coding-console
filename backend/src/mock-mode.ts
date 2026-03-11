/**
 * 모의 모드: ANTHROPIC_API_KEY 없이 실제와 유사한 이벤트 시퀀스를 생성합니다.
 *
 * 시뮬레이션하는 코딩 세션:
 * 1. 파일 읽기
 * 2. 변경 계획 수립
 * 3. 새 파일 작성
 * 4. 기존 파일 수정
 * 5. 테스트 실행
 * 6. 결과 보고
 *
 * 프론트엔드 개발 및 데모용으로 유용합니다.
 */

import { v4 as uuid } from "uuid";
import { eventBus } from "./event-bus.js";
import { hookManager } from "./hooks.js";
import { approvalManager } from "./approval.js";
import type { SessionStage } from "@my-ai-console/shared";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function emitStage(sessionId: string, stage: SessionStage, description: string) {
  eventBus.emit({
    type: "stage:change",
    sessionId,
    timestamp: Date.now(),
    stage,
    description,
  });
}

export async function runMockSession(
  sessionId: string,
  prompt: string,
  workspacePath: string
): Promise<void> {
  const model = "claude-sonnet-4-5-20250929";
  let totalInput = 0;
  let totalOutput = 0;
  let totalCost = 0;

  const emitTokens = () => {
    totalInput += Math.floor(Math.random() * 500) + 200;
    totalOutput += Math.floor(Math.random() * 300) + 100;
    totalCost = (totalInput * 3 + totalOutput * 15) / 1_000_000;
    eventBus.emit({
      type: "token:update",
      sessionId,
      timestamp: Date.now(),
      inputTokens: totalInput,
      outputTokens: totalOutput,
      cacheReadTokens: Math.floor(totalInput * 0.3),
      cacheWriteTokens: Math.floor(totalInput * 0.1),
      totalCostUsd: totalCost,
      contextBudgetRemaining: Math.max(0, 1 - totalInput / 200000),
    });
  };

  // ─── 세션 시작 ────────────────────────────────────────
  eventBus.emit({
    type: "session:created",
    sessionId,
    workspacePath,
    model,
    timestamp: Date.now(),
  });
  await hookManager.run(sessionId, "post", "session_create", { sessionId, workspacePath });

  await delay(300);

  // ─── 생각 중 ─────────────────────────────────────────
  emitStage(sessionId, "thinking", "프롬프트 분석 중...");
  eventBus.emit({ type: "agent:thinking", sessionId, timestamp: Date.now() });
  await delay(1500);
  emitTokens();

  // ─── 응답 스트리밍 (청크 단위) ────────────────────────
  const responseChunks = [
    `"${prompt}" 작업을 도와드리겠습니다.\n\n`,
    "먼저 현재 프로젝트 구조를 확인하고 ",
    "필요한 변경 사항을 구현하겠습니다.\n\n",
    "관련 파일을 읽어 기존 코드를 파악하겠습니다.",
  ];
  for (const chunk of responseChunks) {
    eventBus.emit({
      type: "agent:response",
      sessionId,
      timestamp: Date.now(),
      content: chunk,
      partial: true,
    });
    await delay(200);
  }
  eventBus.emit({
    type: "agent:response",
    sessionId,
    timestamp: Date.now(),
    content: "",
    partial: false,
  });

  await delay(500);
  emitTokens();

  // ─── 계획 수립 ────────────────────────────────────────
  emitStage(sessionId, "planning", "구현 계획 수립 중...");
  eventBus.emit({
    type: "agent:plan",
    sessionId,
    timestamp: Date.now(),
    plan: "1. 기존 소스 파일 읽기\n2. 수정 포인트 파악\n3. 유틸리티 모듈 생성\n4. 메인 엔트리 포인트 업데이트\n5. 테스트 실행하여 검증",
    nextAction: "src/index.ts를 읽어 현재 구조 파악",
  });
  eventBus.emit({
    type: "agent:reasoning",
    sessionId,
    timestamp: Date.now(),
    summary: "변경 전에 현재 아키텍처를 파악하기 위해 파일 분석부터 시작합니다",
    context: "일관성을 위해 기존 패턴이 있는지 확인이 필요합니다",
  });

  await delay(800);

  // ─── 파일 읽기 ────────────────────────────────────────
  emitStage(sessionId, "coding", "소스 파일 읽는 중...");

  const readToolId = uuid();
  eventBus.emit({
    type: "tool:call",
    sessionId,
    timestamp: Date.now(),
    toolName: "Read",
    toolId: readToolId,
    parameters: { file_path: `${workspacePath}/src/index.ts` },
  });
  await delay(600);

  const mockFileContent = `import express from 'express';

const app = express();
const PORT = 3000;

app.get('/', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(\`Server running on port \${PORT}\`);
});
`;

  eventBus.emit({
    type: "file:read",
    sessionId,
    timestamp: Date.now(),
    filePath: `${workspacePath}/src/index.ts`,
    content: mockFileContent,
    lineCount: 12,
  });
  eventBus.emit({
    type: "tool:result",
    sessionId,
    timestamp: Date.now(),
    toolId: readToolId,
    toolName: "Read",
    result: "파일 읽기 완료 (12줄)",
    success: true,
    durationMs: 45,
  });

  await delay(500);
  emitTokens();

  // ─── 추론 ────────────────────────────────────────────
  eventBus.emit({
    type: "agent:reasoning",
    sessionId,
    timestamp: Date.now(),
    summary: "현재 엔트리 포인트는 기본 Express 서버입니다. 헬퍼 함수가 포함된 유틸리티 모듈을 추가하고 메인 파일을 업데이트하겠습니다.",
    context: "관심사 분리를 위해 별도 모듈을 생성하는 것이 적합합니다",
  });

  await delay(800);

  // ─── 파일 쓰기 (승인 확인 포함) ─────────────────────
  emitStage(sessionId, "coding", "새 유틸리티 모듈 작성 중...");

  const newFileContent = `/**
 * 애플리케이션 유틸리티 헬퍼
 */

export function formatResponse(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

export function validateInput(input: string): boolean {
  return input.length > 0 && input.length < 10000;
}

export function createTimestamp(): string {
  return new Date().toISOString();
}
`;

  const approved = await approvalManager.requestApproval(
    sessionId,
    "file_write",
    "새 유틸리티 모듈 생성",
    `${workspacePath}/src/utils.ts 작성`
  );

  if (!approved) {
    eventBus.emit({
      type: "session:error",
      sessionId,
      timestamp: Date.now(),
      error: "사용자가 파일 쓰기를 거부했습니다",
      recoverable: true,
    });
    return;
  }

  const writeToolId = uuid();
  eventBus.emit({
    type: "tool:call",
    sessionId,
    timestamp: Date.now(),
    toolName: "Write",
    toolId: writeToolId,
    parameters: {
      file_path: `${workspacePath}/src/utils.ts`,
      content: newFileContent,
    },
  });
  await delay(400);

  eventBus.emit({
    type: "file:write",
    sessionId,
    timestamp: Date.now(),
    filePath: `${workspacePath}/src/utils.ts`,
    content: newFileContent,
  });
  await hookManager.run(sessionId, "post", "file_write", {
    filePath: `${workspacePath}/src/utils.ts`,
  });
  eventBus.emit({
    type: "tool:result",
    sessionId,
    timestamp: Date.now(),
    toolId: writeToolId,
    toolName: "Write",
    result: "파일 생성 완료",
    success: true,
    durationMs: 32,
  });

  await delay(500);
  emitTokens();

  // ─── 파일 수정 (diff) ────────────────────────────────
  emitStage(sessionId, "coding", "메인 엔트리 포인트 수정 중...");

  const updatedFileContent = `import express from 'express';
import { formatResponse, createTimestamp } from './utils';

const app = express();
const PORT = 3000;

app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: createTimestamp(),
    message: formatResponse({ version: '1.0.0' }),
  });
});

app.listen(PORT, () => {
  console.log(\`Server running on port \${PORT}\`);
});
`;

  const editToolId = uuid();
  eventBus.emit({
    type: "tool:call",
    sessionId,
    timestamp: Date.now(),
    toolName: "Edit",
    toolId: editToolId,
    parameters: {
      file_path: `${workspacePath}/src/index.ts`,
      old_string: "import express from 'express';",
      new_string: "import express from 'express';\nimport { formatResponse, createTimestamp } from './utils';",
    },
  });
  await delay(300);

  eventBus.emit({
    type: "file:diff",
    sessionId,
    timestamp: Date.now(),
    filePath: `${workspacePath}/src/index.ts`,
    before: mockFileContent,
    after: updatedFileContent,
    hunks: [
      {
        oldStart: 1,
        oldLines: 3,
        newStart: 1,
        newLines: 4,
        content:
          " import express from 'express';\n+import { formatResponse, createTimestamp } from './utils';\n \n const app = express();",
      },
      {
        oldStart: 6,
        oldLines: 3,
        newStart: 7,
        newLines: 7,
        content:
          " app.get('/', (req, res) => {\n-  res.json({ status: 'ok' });\n+  res.json({\n+    status: 'ok',\n+    timestamp: createTimestamp(),\n+    message: formatResponse({ version: '1.0.0' }),\n+  });\n });",
      },
    ],
  });
  eventBus.emit({
    type: "tool:result",
    sessionId,
    timestamp: Date.now(),
    toolId: editToolId,
    toolName: "Edit",
    result: "파일 수정 완료",
    success: true,
    durationMs: 28,
  });

  await delay(500);
  emitTokens();

  // ─── 명령어 실행 ─────────────────────────────────────
  emitStage(sessionId, "testing", "테스트 실행 중...");

  eventBus.emit({
    type: "test:run",
    sessionId,
    timestamp: Date.now(),
    testSuite: "unit",
    command: "npm test",
  });

  const cmdId = uuid();
  const cmdApproved = await approvalManager.requestApproval(
    sessionId,
    "command_execute",
    "테스트 스위트 실행",
    "npm test"
  );

  if (!cmdApproved) {
    eventBus.emit({
      type: "session:error",
      sessionId,
      timestamp: Date.now(),
      error: "사용자가 명령어 실행을 거부했습니다",
      recoverable: true,
    });
    return;
  }

  eventBus.emit({
    type: "command:execute",
    sessionId,
    timestamp: Date.now(),
    command: "npm test",
    commandId: cmdId,
  });

  await delay(500);

  const outputLines = [
    "\n> my-app@1.0.0 test\n",
    "> jest --verbose\n\n",
    " PASS  src/__tests__/utils.test.ts\n",
    "  formatResponse\n",
    "    ✓ 객체를 JSON으로 포맷팅 (3ms)\n",
    "    ✓ null 입력 처리 (1ms)\n",
    "  validateInput\n",
    "    ✓ 유효한 입력 허용 (1ms)\n",
    "    ✓ 빈 입력 거부 (1ms)\n",
    "  createTimestamp\n",
    "    ✓ ISO 문자열 반환 (2ms)\n\n",
    "Test Suites: 1 passed, 1 total\n",
    "Tests:       5 passed, 5 total\n",
    "Time:        1.234s\n",
  ];

  for (const line of outputLines) {
    eventBus.emit({
      type: "command:output",
      sessionId,
      timestamp: Date.now(),
      commandId: cmdId,
      output: line,
      stream: "stdout",
    });
    await delay(150);
  }

  eventBus.emit({
    type: "command:complete",
    sessionId,
    timestamp: Date.now(),
    commandId: cmdId,
    exitCode: 0,
    durationMs: 2340,
  });

  eventBus.emit({
    type: "test:result",
    sessionId,
    timestamp: Date.now(),
    testSuite: "unit",
    passed: 5,
    failed: 0,
    skipped: 0,
    output: "모든 테스트 통과",
  });

  await delay(300);
  emitTokens();

  // ─── 완료 ────────────────────────────────────────────
  emitStage(sessionId, "completed", "모든 작업이 성공적으로 완료되었습니다");

  const finalChunks = [
    "\n\n구현을 완료했습니다:\n\n",
    "1. **생성** `src/utils.ts` — `formatResponse`, `validateInput`, `createTimestamp` 유틸리티\n",
    "2. **수정** `src/index.ts` — 새 유틸리티를 import하여 사용하도록 업데이트\n",
    "3. **테스트 실행** — 전체 5개 테스트 통과\n\n",
    "변경 사항은 기존 프로젝트 패턴을 따르며 하위 호환성을 유지합니다.",
  ];
  for (const chunk of finalChunks) {
    eventBus.emit({
      type: "agent:response",
      sessionId,
      timestamp: Date.now(),
      content: chunk,
      partial: true,
    });
    await delay(150);
  }
  eventBus.emit({
    type: "agent:response",
    sessionId,
    timestamp: Date.now(),
    content: "",
    partial: false,
  });

  await delay(300);
  emitTokens();

  eventBus.emit({
    type: "session:completed",
    sessionId,
    timestamp: Date.now(),
    summary: "유틸리티 모듈 생성, 엔트리 포인트 업데이트, 모든 테스트 통과",
  });
  await hookManager.run(sessionId, "post", "session_complete", { sessionId });
}
