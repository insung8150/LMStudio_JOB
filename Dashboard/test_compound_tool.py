"""
복합 도구(ExecutePlan) 테스트
편집장 에이전트와 동일한 지시 + 복합 도구 정의로 LM Studio 호출
"""
import requests
import json
import time

LM_STUDIO_URL = "http://localhost:1234/v1/chat/completions"
MODEL = "nvme-raid/gpt-oss-120b"

SYSTEM_PROMPT = """You are ChatGPT, a large language model trained by OpenAI.
Knowledge cutoff: 2024-06
Current date: 2026-04-01

Reasoning: medium"""

DEVELOPER_PROMPT = """You are 편집장. Write the final integrated report.

## Your job
1. Check inbox → find todo issue
2. Read all writer's files
3. Write integrated report .md file (Executive Summary + all sections)
4. Mark issue done

## Rules
- Do NOT create new issues. Do NOT delegate.
- Write the report yourself.
- ONE issue per run

## Available Tools

You have ONE tool: execute_plan. It takes multiple steps and runs them ALL at once.
You MUST use this tool instead of calling individual commands.

IMPORTANT:
- Combine ALL independent operations into ONE execute_plan call
- Do NOT call execute_plan multiple times for things you can batch
- Plan ahead: think about what information you need, then request it all at once

## Paperclip API
- Inbox: curl -s -H "Authorization: Bearer $PAPERCLIP_API_KEY" $PAPERCLIP_API_URL/api/agents/me/inbox-lite
- Issue detail: curl -s -H "Authorization: Bearer $PAPERCLIP_API_KEY" $PAPERCLIP_API_URL/api/issues/<id>
- Mark done: curl -s -X PATCH $PAPERCLIP_API_URL/api/issues/<id> -H "Authorization: Bearer $PAPERCLIP_API_KEY" -H "X-Paperclip-Run-Id: $PAPERCLIP_RUN_ID" -H "Content-Type: application/json" -d '{"status":"done","comment":"완료"}'

## Writer's workspace
Writer files are at: /home/yooha/.paperclip/instances/default/workspaces/5275a5b9-183e-4888-bcfa-f5035d6cd19e/
"""

USER_PROMPT = """You are agent f2700bf1-d7d0-4a12-82e8-c95c39f5a274 (편집장). Continue your Paperclip work.

Remember: Use execute_plan to batch multiple operations in ONE call. Do not make separate calls for each command."""

# OpenAI 호환 tool 정의
TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "execute_plan",
            "description": "Execute multiple steps at once. Combine ALL independent operations into a single call. Each step can be a bash command or file read.",
            "parameters": {
                "type": "object",
                "properties": {
                    "steps": {
                        "type": "array",
                        "description": "List of steps to execute in order",
                        "items": {
                            "type": "object",
                            "properties": {
                                "type": {
                                    "type": "string",
                                    "enum": ["bash", "read", "write"],
                                    "description": "Step type: bash (run command), read (read file), write (write file)"
                                },
                                "command": {
                                    "type": "string",
                                    "description": "For bash: the command to run. For read: file path. For write: file path"
                                },
                                "content": {
                                    "type": "string",
                                    "description": "For write: the file content to write"
                                },
                                "description": {
                                    "type": "string",
                                    "description": "Brief description of what this step does"
                                }
                            },
                            "required": ["type", "command"]
                        }
                    }
                },
                "required": ["steps"]
            }
        }
    }
]

def call_lm_studio(messages, tools=None):
    payload = {
        "model": MODEL,
        "messages": messages,
        "temperature": 0.3,
        "max_tokens": 4096,
    }
    if tools:
        payload["tools"] = tools
        payload["tool_choice"] = "auto"

    start = time.time()
    resp = requests.post(LM_STUDIO_URL, json=payload, timeout=120)
    elapsed = time.time() - start

    data = resp.json()
    choice = data["choices"][0]
    usage = data.get("usage", {})

    return {
        "message": choice["message"],
        "finish_reason": choice["finish_reason"],
        "elapsed": elapsed,
        "prompt_tokens": usage.get("prompt_tokens", 0),
        "completion_tokens": usage.get("completion_tokens", 0),
    }

def main():
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": DEVELOPER_PROMPT + "\n\n" + USER_PROMPT},
    ]

    print("=" * 60)
    print("복합 도구 테스트: 편집장 에이전트")
    print("=" * 60)
    print()

    total_tokens = 0
    turn = 0

    # 최대 5턴만 실행 (무한루프 방지)
    while turn < 5:
        turn += 1
        print(f"--- 턴 {turn} ---")
        print(f"입력 메시지 수: {len(messages)}")

        result = call_lm_studio(messages, TOOLS)
        msg = result["message"]
        total_tokens += result["prompt_tokens"] + result["completion_tokens"]

        print(f"소요: {result['elapsed']:.1f}s | 토큰: {result['prompt_tokens']}+{result['completion_tokens']}")
        print(f"finish_reason: {result['finish_reason']}")

        # 도구 호출 확인
        tool_calls = msg.get("tool_calls", [])

        if tool_calls:
            for tc in tool_calls:
                func = tc["function"]
                print(f"\n도구 호출: {func['name']}")
                try:
                    args = json.loads(func["arguments"])
                    steps = args.get("steps", [])
                    print(f"스텝 수: {len(steps)}")
                    for i, step in enumerate(steps):
                        cmd = step.get("command", "")
                        desc = step.get("description", "")
                        stype = step.get("type", "?")
                        print(f"  [{i}] {stype}: {cmd[:100]}")
                        if desc:
                            print(f"       → {desc}")
                except json.JSONDecodeError:
                    print(f"  (JSON 파싱 실패)")
                    print(f"  raw: {func['arguments'][:300]}")

            # 가짜 도구 결과 추가 (실제 실행은 안 함)
            messages.append(msg)

            fake_result = {
                "steps_results": [
                    {"step": i, "output": f"[시뮬레이션] step {i} 결과 생략"}
                    for i in range(len(steps))
                ]
            }
            messages.append({
                "role": "tool",
                "tool_call_id": tool_calls[0]["id"],
                "content": json.dumps(fake_result, ensure_ascii=False),
            })
        else:
            # 도구 호출 없음 - 텍스트 응답
            content = msg.get("content", "")
            reasoning = msg.get("reasoning", "")
            if reasoning:
                print(f"\nThinking: {reasoning[:300]}...")
            if content:
                print(f"\n응답: {content[:500]}...")
            break

        print()

    print()
    print("=" * 60)
    print(f"총 턴: {turn}")
    print(f"총 토큰: {total_tokens:,}")
    print(f"비교: 원본 51턴 2,700K 토큰")
    print("=" * 60)

if __name__ == "__main__":
    main()
