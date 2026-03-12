# AI Coding Console

AI 코딩 에이전트의 작업 과정을 실시간으로 관찰하는 데스크톱 앱.

Claude / Codex 에이전트가 파일을 읽고, 수정하고, 명령어를 실행하는 모든 과정을 시각화합니다.

## Features

- **실시간 스트리밍** — 에이전트 응답, 파일 변경, 명령어 실행을 WebSocket으로 실시간 표시
- **멀티 프로바이더** — Claude / Codex 프로바이더 전환 지원 (세션 컨텍스트 핸드오프 포함)
- **3중 연결 모드** — CLI 우선 → SDK fallback → Mock 모드 자동 전환
- **데이터 분석** — CSV/Excel/TXT 파일 업로드 → AI 분석 → Plotly 차트 시각화 (11종)
- **Diff 뷰어** — Monaco 에디터 기반 파일 변경 사항 비교
- **토큰 대시보드** — 입출력 토큰, 캐시, 비용, 컨텍스트 예산 실시간 표시
- **승인 모드** — 파일 쓰기/명령어 실행 전 사용자 승인 요청
- **Electron 데스크톱 앱** — macOS 네이티브 앱으로 실행

## Architecture

```
┌─────────────────────────────────────────────┐
│              Electron Shell                 │
│  ┌─────────────┐      ┌──────────────────┐  │
│  │  Frontend    │ ←WS→ │    Backend       │  │
│  │  Next.js     │      │    Express + ws  │  │
│  │  :3000       │      │    :3001         │  │
│  └─────────────┘      └───────┬──────────┘  │
│                               │              │
│                    ┌──────────┴──────────┐   │
│                    │   Provider Layer    │   │
│                    ├─────────┬──────────┤   │
│                    │ Claude  │  Codex   │   │
│                    │ CLI/SDK │  CLI/SDK │   │
│                    └─────────┴──────────┘   │
└─────────────────────────────────────────────┘
```

## Tech Stack

| Layer | Stack |
|-------|-------|
| Frontend | Next.js 15, React 19, TypeScript, Tailwind CSS, Zustand, Monaco Editor, Plotly.js |
| Backend | Node.js, Express, ws (WebSocket), TypeScript (ESM) |
| Shared | TypeScript 타입 패키지 (이벤트 스키마, 도메인 타입) |
| Desktop | Electron 33 |
| AI | Claude Agent SDK, Anthropic SDK, OpenAI SDK |

## Quick Start

### Prerequisites

- **Node.js** 22+
- **npm** 9+ (workspaces 지원)

### 설치 & 실행

```bash
# 의존성 설치
npm install

# 전체 빌드 (shared → backend → frontend)
npm run build

# 개발 모드 (백엔드 + 프론트엔드 동시 실행)
npm run dev

# Electron 앱으로 실행
npm run app
```

### 환경 변수

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | No | Claude API 키. SDK fallback에 사용 |
| `OPENAI_API_KEY` | No | Codex/OpenAI API 키. SDK fallback에 사용 |
| `PORT` | No | 백엔드 포트 (기본: 3001) |

### 연결 모드

앱은 다음 순서로 자동 연결을 시도합니다:

1. **CLI 모드** — `claude` / `codex` CLI가 설치되어 있으면 CLI를 직접 실행
2. **SDK 모드** — CLI 없이 API 키만 있으면 SDK로 직접 연결
3. **Mock 모드** — 둘 다 없으면 시뮬레이션 모드로 실행 (개발/데모용)

## Project Structure

```
my-ai-coding-console/
├── shared/src/
│   ├── events.ts            # WebSocket 이벤트 타입 정의
│   ├── types.ts             # 도메인 타입 (세션, 도구 등)
│   ├── analysis-events.ts   # 데이터 분석 이벤트 타입
│   └── index.ts             # Public API
├── backend/src/
│   ├── index.ts             # Express + HTTP 서버 진입점
│   ├── ws-server.ts         # WebSocket 서버 + 메시지 라우팅
│   ├── session-manager.ts   # 세션 생명주기 + 영속화 + 핸드오프
│   ├── claude-client.ts     # Claude CLI 클라이언트
│   ├── claude-sdk-client.ts # Claude Agent SDK 클라이언트
│   ├── codex-client.ts      # Codex CLI 클라이언트
│   ├── openai-sdk-client.ts # OpenAI SDK 클라이언트
│   ├── sdk-tools.ts         # SDK용 도구 실행기 (파일 R/W, 명령어)
│   ├── mock-mode.ts         # 시뮬레이션 모드
│   ├── data-analysis-manager.ts  # 파일 파싱 + 차트 데이터 준비
│   ├── data-analysis-ai.ts  # AI 데이터 분석 (Claude/OpenAI)
│   ├── data-analysis-routes.ts   # 데이터 분석 REST API
│   ├── event-bus.ts         # 내부 이벤트 발행/구독
│   ├── hooks.ts             # 훅 시스템
│   └── approval.ts          # 승인 게이팅
├── frontend/src/
│   ├── app/                 # Next.js App Router
│   ├── components/
│   │   ├── layout/          # Sidebar, CenterPanel, RightPanel, BottomPanel
│   │   ├── prompt/          # PromptInput
│   │   ├── stream/          # LiveStream (이벤트 타임라인)
│   │   ├── console/         # ConsoleTabs (멀티 콘솔)
│   │   ├── diff/            # DiffViewer (Monaco diff)
│   │   ├── files/           # FileViewer (Monaco)
│   │   ├── terminal/        # TerminalPanel
│   │   ├── reasoning/       # ReasoningSummary
│   │   ├── tokens/          # TokenDashboard
│   │   ├── approval/        # ApprovalDialog
│   │   ├── timeline/        # FileTimeline
│   │   ├── hooks-panel/     # HooksPanel
│   │   └── analysis/        # 데이터 분석 (업로드, 차트, AI 요약)
│   ├── hooks/               # React 훅 (useWebSocket)
│   ├── store/               # Zustand 상태 관리
│   └── lib/                 # 유틸리티
├── electron/
│   ├── main.cjs             # Electron 메인 프로세스
│   ├── preload.cjs          # IPC 브릿지
│   ├── loading.html         # 로딩 화면
│   └── icon.icns            # 앱 아이콘
└── package.json             # npm workspaces 루트
```

## Data Analysis

CSV, Excel(.xlsx/.xls), TXT/TSV 파일을 업로드하면:

1. **파싱** — 자동 구분자 감지, 스키마 추론 (타입, null 비율)
2. **AI 분석** — 컬럼 설명, 통계량, 데이터 품질 노트, 추천 차트 생성
3. **시각화** — 11종 차트 지원:
   - Scatter, Bar, Line, Histogram, Box, Violin
   - Pie, Heatmap, Correlation Matrix
   - Scatter 3D, Bubble

## License

MIT
