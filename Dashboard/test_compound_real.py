"""
복합 도구(ExecutePlan) 실제 실행 테스트
편집장 에이전트와 동일한 지시 + 복합 도구 + 실제 도구 실행
"""
import requests
import json
import time
import subprocess
import os

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
- COMBINE multiple operations into ONE execute_plan call with multiple steps
- Do NOT call execute_plan with only 1 step when you can batch more

## Paperclip API
- Inbox: curl -s -H "Authorization: Bearer $PAPERCLIP_API_KEY" $PAPERCLIP_API_URL/api/agents/me/inbox-lite
- Issue detail: curl -s -H "Authorization: Bearer $PAPERCLIP_API_KEY" $PAPERCLIP_API_URL/api/issues/<id>
- Mark done: curl -s -X PATCH $PAPERCLIP_API_URL/api/issues/<id> -H "Authorization: Bearer $PAPERCLIP_API_KEY" -H "X-Paperclip-Run-Id: $PAPERCLIP_RUN_ID" -H "Content-Type: application/json" -d '{"status":"done","comment":"완료"}'

## Writer's workspace
Writer files are at: /home/yooha/.paperclip/instances/default/workspaces/5275a5b9-183e-4888-bcfa-f5035d6cd19e/
Your workspace: /home/yooha/.paperclip/instances/default/workspaces/f2700bf1-d7d0-4a12-82e8-c95c39f5a274/
"""

USER_PROMPT = """You are agent f2700bf1-d7d0-4a12-82e8-c95c39f5a274 (편집장). Continue your Paperclip work.

IMPORTANT: Use execute_plan with MULTIPLE steps in ONE call. For example, your first call should include inbox check AND listing writer files AND reading writer files - all in one execute_plan call."""

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "execute_plan",
            "description": "Execute multiple steps at once. You MUST include multiple steps per call. Combine ALL independent operations.",
            "parameters": {
                "type": "object",
                "properties": {
                    "steps": {
                        "type": "array",
                        "description": "List of steps to execute. Include as many as possible per call.",
                        "items": {
                            "type": "object",
                            "properties": {
                                "type": {
                                    "type": "string",
                                    "enum": ["bash", "read", "write"],
                                },
                                "command": {
                                    "type": "string",
                                    "description": "bash: command to run. read: file path. write: file path."
                                },
                                "content": {
                                    "type": "string",
                                    "description": "For write: file content"
                                },
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


def execute_step(step):
    """실제로 도구 실행"""
    stype = step.get("type", "")
    command = step.get("command", "")
    content = step.get("content", "")

    try:
        if stype == "bash":
            result = subprocess.run(
                command, shell=True, capture_output=True, text=True,
                timeout=30, cwd="/home/yooha/.paperclip/instances/default/workspaces/f2700bf1-d7d0-4a12-82e8-c95c39f5a274"
            )
            output = result.stdout
            if result.stderr:
                output += "\nSTDERR: " + result.stderr
            if result.returncode != 0:
                output += f"\nExit code: {result.returncode}"
            # 너무 긴 출력 제한
            if len(output) > 5000:
                output = output[:5000] + f"\n... (truncated, total {len(output)} chars)"
            return output or "(no output)"

        elif stype == "read":
            filepath = command
            if os.path.exists(filepath):
                with open(filepath, 'r') as f:
                    text = f.read()
                if len(text) > 8000:
                    text = text[:8000] + f"\n... (truncated, total {len(text)} chars)"
                return text
            else:
                return f"Error: file not found: {filepath}"

        elif stype == "write":
            filepath = command
            os.makedirs(os.path.dirname(filepath), exist_ok=True)
            with open(filepath, 'w') as f:
                f.write(content)
            return f"Written {len(content)} chars to {filepath}"

        else:
            return f"Unknown step type: {stype}"

    except subprocess.TimeoutExpired:
        return "Error: command timed out (30s)"
    except Exception as e:
        return f"Error: {str(e)}"


def call_lm_studio(messages, tools=None):
    payload = {
        "model": MODEL,
        "messages": messages,
        "temperature": 0.3,
        "max_tokens": 8192,
    }
    if tools:
        payload["tools"] = tools
        payload["tool_choice"] = "auto"

    start = time.time()
    resp = requests.post(LM_STUDIO_URL, json=payload, timeout=180)
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

    print("=" * 70)
    print("복합 도구 실제 실행 테스트: 편집장 에이전트")
    print("=" * 70)
    print()

    total_prompt_tokens = 0
    total_completion_tokens = 0
    total_time = 0
    turn = 0

    while turn < 10:  # 최대 10턴
        turn += 1
        print(f"{'='*70}")
        print(f"턴 {turn}")
        print(f"{'='*70}")

        result = call_lm_studio(messages, TOOLS)
        msg = result["message"]
        total_prompt_tokens += result["prompt_tokens"]
        total_completion_tokens += result["completion_tokens"]
        total_time += result["elapsed"]

        print(f"소요: {result['elapsed']:.1f}s | 입력: {result['prompt_tokens']} | 출력: {result['completion_tokens']} 토큰")
        print(f"finish_reason: {result['finish_reason']}")

        tool_calls = msg.get("tool_calls", [])

        if tool_calls:
            for tc in tool_calls:
                func = tc["function"]
                print(f"\n📦 execute_plan 호출:")

                try:
                    args = json.loads(func["arguments"])
                    steps = args.get("steps", [])
                    print(f"   스텝 수: {len(steps)}")

                    # 실제 실행
                    step_results = []
                    for si, step in enumerate(steps):
                        stype = step.get("type", "?")
                        cmd = step.get("command", "")
                        cmd_preview = cmd[:100] + ("..." if len(cmd) > 100 else "")

                        print(f"\n   [{si}] {stype}: {cmd_preview}")

                        output = execute_step(step)
                        step_results.append({
                            "step_index": si,
                            "type": stype,
                            "command": cmd[:200],
                            "output": output
                        })

                        # 출력 미리보기
                        output_preview = output[:200].replace('\n', ' ')
                        print(f"       → {output_preview}")

                except json.JSONDecodeError:
                    print(f"   JSON 파싱 실패: {func['arguments'][:300]}")
                    step_results = [{"error": "JSON parse failed", "raw": func["arguments"][:500]}]

            # 메시지에 추가
            messages.append(msg)
            messages.append({
                "role": "tool",
                "tool_call_id": tool_calls[0]["id"],
                "content": json.dumps(step_results, ensure_ascii=False)[:10000],
            })

        else:
            # 텍스트 응답 (최종)
            content = msg.get("content", "")
            reasoning = msg.get("reasoning", "")
            if reasoning:
                print(f"\n💭 Thinking: {reasoning[:500]}")
            if content:
                print(f"\n💬 최종 응답:\n{content[:1000]}")
            break

        print()

    print()
    print("=" * 70)
    print("결과 요약")
    print("=" * 70)
    print(f"총 턴:          {turn}")
    print(f"총 입력 토큰:    {total_prompt_tokens:,}")
    print(f"총 출력 토큰:    {total_completion_tokens:,}")
    print(f"총 토큰:        {total_prompt_tokens + total_completion_tokens:,}")
    print(f"총 소요 시간:    {total_time:.1f}s ({total_time/60:.1f}분)")
    print()
    print("비교 (원본 편집장 51턴):")
    print(f"  원본: 51턴, 2,700,000 토큰, ~15분")
    print(f"  복합: {turn}턴, {total_prompt_tokens + total_completion_tokens:,} 토큰, {total_time:.1f}s")
    ratio = 2700000 / max(total_prompt_tokens + total_completion_tokens, 1)
    print(f"  토큰 절감: {ratio:.0f}배")


if __name__ == "__main__":
    main()
