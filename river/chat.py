"""One chat completion from a River base model. Reads {"prompt": ...} on stdin,
prints the completion text. Used by scripts/infographic.ts so the infographic
spec is written by a model you own.

    echo '{"prompt":"hi"}' | python river/chat.py deepseek-ai/DeepSeek-V4-Flash-0731
"""
import json, os, sys

import river_client as river

model = sys.argv[1] if len(sys.argv) > 1 else "deepseek-ai/DeepSeek-V4-Flash-0731"
prompt = json.load(sys.stdin)["prompt"]
client = river.Client(api_key=os.environ["RIVER_API_KEY"])
res = client.chat_complete([{"role": "user", "content": prompt}], base_model=model, max_tokens=2500, temperature=0.2)
j = res.response_json if isinstance(res.response_json, dict) else json.loads(res.response_json)
sys.stdout.write(j["choices"][0]["message"].get("content") or "")
