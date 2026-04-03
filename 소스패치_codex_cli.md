# Codex CLI turn_id 패치 정리

작성일: 2026-04-03

## 목적

Codex의 병렬 turn 환경에서 다음 문제가 있었습니다.

- 세션 저장 JSONL에서 일부 이벤트만 `turn_id`를 가짐
- `agent_message`, `user_message`, `web_search`, `function_call` 계열을 프론트가 휴리스틱으로 turn에 귀속해야 했음
- `codex exec --json` stdout에는 `turn_id`가 없어서 실시간 turn 추적이 불가능했음

이번 패치의 목표는 다음이었습니다.

1. 세션 저장 JSONL에 turn 귀속 정보를 충분히 남긴다
2. 대시보드가 `entry.turnId` 기준으로 정확히 turn을 그룹핑하게 만든다
3. `codex exec --json` stdout에도 `turn_id`를 넣어 실시간 추적이 가능하게 만든다
4. `/usr/bin/codex`, `/usr/local/bin/codex`, `codex` 등 실제 호출 경로 전체에서 patched binary를 사용하게 만든다

## 수정한 코드

### 1. Codex 프로토콜 / 저장 포맷

패치 대상 소스:

- `/home/yooha/JOB_FOLD/LLM_test/LMStudio_JOB/_codex_upstream/codex-rs/protocol/src/protocol.rs`
- `/home/yooha/JOB_FOLD/LLM_test/LMStudio_JOB/_codex_upstream/codex-rs/protocol/src/items.rs`
- `/home/yooha/JOB_FOLD/LLM_test/LMStudio_JOB/_codex_upstream/codex-rs/protocol/src/models.rs`

핵심 변경:

- `AgentMessageEvent`에 optional `turn_id` 추가
- `UserMessageEvent`에 optional `turn_id` 추가
- `WebSearchBeginEvent`, `WebSearchEndEvent`에 optional `turn_id` 추가
- raw `response_item` 레벨의 `web_search_call`, `function_call`, `function_call_output`에도 `turn_id` 영속화

### 2. Codex core / rollout 기록

패치 대상 소스:

- `/home/yooha/JOB_FOLD/LLM_test/LMStudio_JOB/_codex_upstream/codex-rs/core/src/codex.rs`

핵심 변경:

- conversation item을 persisted item으로 만들 때 현재 turn id를 함께 기록
- rollout JSONL 저장 시 `response_item`에도 `turn_id` 포함

### 3. thread 복원 로직

패치 대상 소스:

- `/home/yooha/JOB_FOLD/LLM_test/LMStudio_JOB/_codex_upstream/codex-rs/app-server-protocol/src/protocol/thread_history.rs`

핵심 변경:

- `turn_id`가 있으면 휴리스틱이 아니라 해당 turn으로 직접 귀속
- 늦게 도착한 `answer`, `commentary`, `web_search`, `function_call`, `function_output`도 자기 turn으로 복원 가능

### 4. exec JSONL stdout

패치 대상 소스:

- `/home/yooha/JOB_FOLD/LLM_test/LMStudio_JOB/_codex_upstream/codex-rs/exec/src/exec_events.rs`
- `/home/yooha/JOB_FOLD/LLM_test/LMStudio_JOB/_codex_upstream/codex-rs/exec/src/event_processor_with_jsonl_output.rs`
- `/home/yooha/JOB_FOLD/LLM_test/LMStudio_JOB/_codex_upstream/codex-rs/exec/src/event_processor_with_jsonl_output_tests.rs`

핵심 변경:

- `turn.started`에 `turn_id` 포함
- `turn.completed`에 `turn_id` 포함
- `item.started`에 `turn_id` 포함
- `item.completed`에 `turn_id` 포함
- `item.updated`에 `turn_id` 포함
- warning/error처럼 turn 범위가 없는 항목은 `turn_id: ""`로 출력

결과:

- `agent-runner.py`가 `codex exec --json` stdout만 읽어도 실시간 turn 추적 가능

### 5. Dashboard 백엔드 파서

패치 대상 소스:

- `/home/yooha/JOB_FOLD/LLM_test/LMStudio_JOB/Dashboard/src/lib/codex-session-client.ts`

핵심 변경:

- 파싱된 `entries[]`에 `turnId` 필드 추가
- `task_started`, `task_complete`, `turn_aborted`뿐 아니라
  `user_query`, `answer`, `commentary`, `web_search`, `function_call`, `function_output`에도 `turnId` 전달

### 6. Dashboard 프론트 그룹핑

패치 대상 소스:

- `/home/yooha/JOB_FOLD/LLM_test/LMStudio_JOB/Dashboard/src/app/codex-sessions/page.tsx`

핵심 변경:

- `entry.turnId`를 1순위 기준으로 turn 그룹핑
- turn 순서는 `task_started` 등장 순서 기준으로 유지
- `turn_aborted`는 해당 turn 상태만 표시
- 오래된 로그만 fallback heuristic 사용

## 설치 / 적용 경로

패치된 binary:

- `/home/yooha/.local/opt/codex-patched/bin/codex`

패치된 실행 경로:

- `/home/yooha/.local/bin/codex`
- `/usr/bin/codex`
- `/usr/local/bin/codex`
- `/bin/codex`

전역 wrapper 수정:

- `/usr/lib/node_modules/@openai/codex/bin/codex.js`
  - vendor binary 대신 patched binary를 우선 실행하도록 수정
- `/usr/local/bin/codex`
  - patched binary를 우선 실행하도록 수정
  - `exec` 서브커맨드에서 새 binary와 맞는 플래그로 정리

## 백업 파일

롤백용 백업:

- `/home/yooha/.local/bin/codex.before-turn-id-patch`
- `/usr/lib/node_modules/@openai/codex/bin/codex.js.before-turn-id-patch`
- `/usr/local/bin/codex.before-turn-id-patch`

## 재적용용 패치 파일

- `/home/yooha/JOB_FOLD/LLM_test/LMStudio_JOB/codex-turn-id.patch`

용도:

- upstream 소스를 다시 받을 때 turn_id 관련 변경을 재적용하는 기준 patch

## 검증 결과

### 세션 저장 JSONL

확인 결과:

- `event_msg.task_started`에 `turn_id` 존재
- `event_msg.turn_context`에 `turn_id` 존재
- `event_msg.task_complete`에 `turn_id` 존재
- `event_msg.user_message`에 `turn_id` 존재
- `event_msg.agent_message`에 `turn_id` 존재
- `response_item.web_search_call`에 `turn_id` 존재
- `response_item.function_call`에 `turn_id` 존재
- `response_item.function_call_output`에 `turn_id` 존재

### Dashboard

확인 결과:

- `entries[].turnId`가 내려옴
- 대시보드가 `turnId` 기준으로 turn을 나눔
- 병렬 turn에서 늦게 도착한 응답도 올바른 turn에 귀속됨

### exec stdout (`--json`)

실제 확인한 경로:

- `/usr/bin/codex exec --json ...`
- `/usr/local/bin/codex exec --json ...`

확인 결과:

- `thread.started`는 기존대로 `thread_id`만 가짐
- `turn.started`에 `turn_id` 출력
- `item.started`에 `turn_id` 출력
- `item.completed`에 `turn_id` 출력
- `turn.completed`에 `turn_id` 출력
- `web_search` 아이템에도 동일한 `turn_id` 출력

주의:

- `rg`나 `head`로 stdout을 잘라서 보면 마지막에 `Broken pipe (os error 32)`가 보일 수 있음
- 이건 출력 소비 측이 먼저 닫혀서 생기는 현상이고 기능 문제는 아님

## 빌드 / 테스트 상태

완료:

- `cargo +1.93.0 check -p codex-exec -p codex-cli`
- release binary 빌드
- patched binary 설치
- 실 런타임 검증
- `Dashboard` 빌드

남은 정리:

- `codex-exec`의 기존 기대값 기반 테스트 파일이 아직 새 `turn_id` 포맷을 전부 반영하지 못함
- 즉 런타임 패치와 실제 적용은 완료됐고, 테스트 기대값 정리만 후속 작업으로 남아 있음

## 운영 메모

앞으로 중요 원칙:

1. turn 그룹핑은 프론트 휴리스틱이 아니라 `entry.turnId`를 기준으로 해야 함
2. `codex exec --json`을 읽는 실시간 러너도 stdout의 `turn_id`를 그대로 사용해야 함
3. Codex 업데이트 후에는 upstream 변경으로 전역 wrapper 또는 binary가 덮어써질 수 있으므로 재적용 확인이 필요함

## 한 줄 결론

이제 turn_id 패치는 세션 저장, 대시보드 복원, 실시간 `--json` stdout, 시스템 전역 실행 경로까지 모두 적용된 상태다.
