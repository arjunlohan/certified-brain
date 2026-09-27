"""One chat completion from a River checkpoint (owned, trained weights). Reads
{"prompt": ...} on stdin, prints the completion text. Thinking is off so Qwen
spends its tokens on the answer.

    echo '{"prompt":"hi"}' | python river/chat_ckpt.py river://.../spec-9b Qwen/Qwen3.5-9B
"""
import json, os, sys

import river_client as river

ckpt, base = sys.argv[1], sys.argv[2]
prompt = json.load(sys.stdin)["prompt"]
client = river.Client(api_key=os.environ["RIVER_API_KEY"])
res = client.chat_complete_from_checkpoint(
    [{"role": "user", "content": prompt}], checkpoint_path=ckpt, base_model=base,
    max_tokens=2000, temperature=0.0, chat_template_kwargs={"enable_thinking": False})
j = res.response_json if isinstance(res.response_json, dict) else json.loads(res.response_json)
sys.stdout.write(j["choices"][0]["message"].get("content") or "")
