# LM Studio 모니터링 웹 대시보드 계획

## Context
LM Studio 0.4.x에서 Paperclip 멀티에이전트가 돌아가는 중, 대화 내용 모니터링 + 기록 관리가 필요. `lms log stream`, conversations 파일, REST API, nvidia-smi를 통합하는 대시보드.

## 기술 스택
- Next.js 15 (App Router) + TailwindCSS + shadcn/ui
- SSE (Server-Sent Events) — 실시간 로그 (WebSocket 불필요, 단방향이므로)
- Recharts — 차트
- 포트: 3333

## UI 디자인: Google Stitch MCP
- Phase 1 완료 후 Stitch로 대시보드 UI 디자인 생성
- `generate_screen_from_text` → HTML 추출 → Next.js 컴포넌트 분리
- 주의: "전체 페이지 하나로" 프롬프트 필수

## 데이터 소스

| 소스 | 엔드포인트/경로 | 용도 |
|------|-----------------|------|
| LM Studio REST | GET `/api/v1/models` | 상세 모델 정보 |
| LM Studio REST | GET `/v1/models` | 모델 목록 (OpenAI 호환) |
| LM Studio REST | POST `/api/v1/chat` | Stateful Chat (store, response_id) |
| CLI | `lms ps` | 로드된 모델 상태 |
| CLI | `lms log stream --json` | 실시간 입출력 로그 |
| 파일 | `~/.lmstudio/conversations/*.json` | GUI 대화 기록 (26개) |
| 파일 | `~/.lmstudio/server-logs/` | 서버 로그 파일 |
| CLI | `nvidia-smi` | GPU VRAM/온도/사용률 |

## 아키텍처

```
Browser (:3333)
  ↕ HTTP / SSE
Next.js API Routes (프록시)
  ├── /api/gpu          → nvidia-smi (child_process)
  ├── /api/models       → localhost:1234/api/v1/models
  ├── /api/models/loaded → lms ps (child_process)
  ├── /api/conversations → ~/.lmstudio/conversations/ (fs)
  ├── /api/conversations/[id] → GET/DELETE 개별 대화
  ├── /api/logs/stream  → lms log stream --json (SSE)
  └── /api/logs/files   → ~/.lmstudio/server-logs/ (fs)
```

---

## Phase 1: 프로젝트 스캐폴딩 + 핵심 라이브러리

### 목표
Next.js 15 프로젝트 생성, API 클라이언트 라이브러리, 타입 정의

### 생성 파일
```
Dashboard/
  .env.local                    # LM_STUDIO_HOST, CONVERSATIONS_DIR 등
  src/lib/
    types.ts                    # ConversationFile, GpuInfo, LoadedModel 등
    constants.ts                # API URL, 경로, 폴링 간격
    lmstudio-client.ts          # LM Studio API 래퍼 (서버 전용)
    gpu-client.ts               # nvidia-smi 파서
    conversation-client.ts      # conversations JSON 읽기/삭제
    utils.ts                    # cn() 헬퍼, 포맷터
```

### 핵심 타입
```typescript
interface ConversationFile {
  name: string; createdAt: number; tokenCount: number;
  lastUsedModel: { identifier: string };
  systemPrompt: string; messages: ConversationMessage[];
}
interface GpuInfo {
  index: number; name: string;
  memoryUsedMiB: number; memoryTotalMiB: number;
  utilizationPercent: number; temperatureC: number;
}
```

### 설치
```bash
npx create-next-app@latest Dashboard --typescript --tailwind --app --src-dir
cd Dashboard
npm install recharts lucide-react clsx tailwind-merge
npx shadcn@latest init
npx shadcn@latest add card table badge tabs button input dialog alert-dialog scroll-area
```

---

## Phase 2: 대시보드 메인 + 모델/GPU 상태

### 목표
GPU 5장 상태, 로드된 모델, 시스템 요약을 한눈에

### 생성 파일
```
src/app/
  layout.tsx                    # 사이드바 네비게이션, 다크 테마
  page.tsx                      # 대시보드 오버뷰 (서버 컴포넌트)
  _components/
    gpu-cards.tsx               # GPU 카드 5개 (VRAM 바, 온도, 사용률)
    gpu-cards-client.tsx        # 3초 폴링 클라이언트 래퍼
    loaded-models-table.tsx     # 로드 모델 테이블
    system-summary.tsx          # 총 VRAM, 활성 모델 수
src/app/api/
  gpu/route.ts                  # nvidia-smi → GpuInfo[]
  models/route.ts               # /api/v1/models 프록시
  models/loaded/route.ts        # lms ps 파싱
```

### 폴링 전략
- GPU: 3초 (`setInterval` + `startTransition`)
- 모델: 10초
- Suspense boundary 개별 적용 (각 섹션 독립 로딩)

---

## Phase 3: 대화 히스토리 관리

### 목표
대화 목록, 상세 보기 (채팅 버블), 삭제

### 생성 파일
```
src/app/conversations/
  page.tsx                      # 대화 목록
  [id]/page.tsx                 # 대화 상세 (채팅 UI)
  _components/
    conversation-list.tsx       # 정렬/검색 가능 테이블
    conversation-detail.tsx     # 채팅 버블 뷰
    conversation-actions.tsx    # 삭제 다이얼로그
    message-renderer.tsx        # 마크다운 렌더링
    gen-info-badge.tsx          # tok/s, 토큰 수 배지
src/app/api/conversations/
  route.ts                      # GET: 전체 목록 (요약)
  [id]/route.ts                 # GET: 상세, DELETE: 삭제
```

### 대화 JSON 파싱
- `messages[n].versions[currentlySelected]` 사용
- singleStep(user): `content[].text` 추출
- multiStep(assistant): `steps[].content[].text` + `genInfo.stats` 추출
- 파일명 = epoch timestamp (ID로 사용)

### 삭제
- `~/.lmstudio/settings.json`의 `moveDeletedItemsToTrash` 확인
- true면 `.trash/`로 이동, false면 `fs.unlinkSync`

---

## Phase 4: 실시간 로그 모니터링

### 목표
`lms log stream --json` → SSE → 브라우저 실시간 표시

### 생성 파일
```
src/app/logs/
  page.tsx                      # 로그 뷰어
  _components/
    live-log-viewer.tsx         # SSE 실시간 로그 (client)
    log-entry.tsx               # 로그 엔트리 렌더러
    log-filters.tsx             # 모델/타입 필터
    server-log-browser.tsx      # 과거 로그 파일 뷰어
src/app/api/logs/
  stream/route.ts               # SSE: lms log stream --json spawn
  files/route.ts                # 로그 파일 목록
  files/[...path]/route.ts      # 로그 파일 내용 (페이지네이션)
src/lib/
  log-stream-manager.ts         # 싱글톤: child_process 관리
src/hooks/
  use-sse.ts                    # SSE 연결 훅 (자동 재접속)
  use-polling.ts                # 범용 폴링 훅
```

### SSE 구현
```typescript
// /api/logs/stream/route.ts
// spawn('lms', ['log', 'stream', '--json'])
// stdout line → SSE event로 브로드캐스트
// 클라이언트 0명이면 30초 후 프로세스 종료
```

### 로그 스트림 JSON 형식 (확인됨)
```json
{
  "timestamp": 1774978710970,
  "data": {
    "type": "llm.prediction.input" | "llm.prediction.output",
    "input": "...",  // input 타입
    "output": "...", // output 타입
    "stats": { "tokensPerSecond": 106.29, ... },
    "modelIdentifier": "nvme-raid/gpt-oss-120b"
  }
}
```

### 클라이언트
- 링 버퍼 1000개 (오래된 것 자동 삭제)
- 자동 스크롤 + 일시정지 버튼
- 색상: input=파란색, output=초록색, error=빨간색
- 필터: 모델명, 타입 (input/output)

---

## Phase 5: 마무리

### 생성 파일
```
src/app/error.tsx               # 글로벌 에러 바운더리
src/app/loading.tsx             # 글로벌 로딩 스켈레톤
scripts/start.sh                # PORT=3333 npm run start
```

### 성능 최적화
- Suspense 경계: 각 섹션 독립 로딩
- `next/dynamic`: live-log-viewer는 `ssr: false`
- 대화 파일: LRU 캐시 (최대 50개)
- 로그 파일: offset/limit 페이지네이션 (500줄 단위)

### 에러 처리
- LM Studio 오프라인: "Server Unreachable" 배너 + 재시도
- nvidia-smi 실패: GPU 패널 숨김
- 대화 파일 손상: 목록에 "Corrupted" 표시, 건너뛰기
- SSE 끊김: 지수 백오프 재접속 (1s→2s→4s, 최대 30s)

---

## 파일 트리 전체

```
Dashboard/
  .env.local
  next.config.ts
  package.json
  scripts/start.sh
  src/
    app/
      layout.tsx, page.tsx, loading.tsx, error.tsx, globals.css
      _components/
        gpu-cards.tsx, gpu-cards-client.tsx
        loaded-models-table.tsx, system-summary.tsx
      conversations/
        page.tsx
        [id]/page.tsx
        _components/
          conversation-list.tsx, conversation-detail.tsx
          conversation-actions.tsx, message-renderer.tsx
      logs/
        page.tsx
        _components/
          live-log-viewer.tsx, log-entry.tsx, log-filters.tsx
          server-log-browser.tsx
      api/
        gpu/route.ts
        models/route.ts
        models/loaded/route.ts
        conversations/route.ts
        conversations/[id]/route.ts
        logs/stream/route.ts
        logs/files/route.ts
        logs/files/[...path]/route.ts
    lib/
      types.ts, constants.ts, utils.ts
      lmstudio-client.ts, gpu-client.ts
      conversation-client.ts, log-stream-manager.ts
    hooks/
      use-sse.ts, use-polling.ts
    components/ui/  # shadcn/ui
```

## 검증 방법
1. `npm run dev` → localhost:3333 접속
2. GPU 카드 5개 표시 + 3초마다 갱신 확인
3. 로드된 모델 테이블 확인
4. `/conversations` → 26개 대화 목록 표시
5. 대화 클릭 → 채팅 버블 + tok/s 배지 확인
6. 대화 삭제 → 파일 제거 확인
7. `/logs` → 실시간 로그 스트리밍 확인 (lms log stream)
8. 로그 필터 (모델, input/output) 동작 확인
