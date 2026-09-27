"""Label the certification set with an untrained River base model through the
OpenAI-style chat endpoint (no tokenizer needed).

    python river/label_base.py --model deepseek-ai/DeepSeek-V4-Flash-0731 --tag dsv4 --n 2000
    python river/label_base.py --model deepseek-ai/DeepSeek-V4-Flash-0731 --tag dsv4 --n 300 --draw 1
"""
import argparse, json, os, time
from concurrent.futures import ThreadPoolExecutor

import river_client as river

HERE = os.path.dirname(os.path.abspath(__file__))
ap = argparse.ArgumentParser()
ap.add_argument("--model", required=True)
ap.add_argument("--tag", required=True)
ap.add_argument("--n", type=int, default=2000)
ap.add_argument("--draw", type=int, default=0)
ap.add_argument("--concurrency", type=int, default=32)
args = ap.parse_args()

client = river.Client(api_key=os.environ["RIVER_API_KEY"])
rows = [json.loads(l) for l in open(os.path.join(HERE, "data", "certify.jsonl")) if l.strip()][: args.n]
out = os.path.join(HERE, "data", f"{args.tag}-labels" + ("" if args.draw == 0 else f"-d{args.draw}") + ".jsonl")
done = {json.loads(l)["pair_id"] for l in open(out)} if os.path.exists(out) else set()
todo = [r for r in rows if r["pair_id"] not in done]
print(f"labeling {len(todo)} cells with {args.model} -> {out}", flush=True)


def one(r):
    t0 = time.time()
    for attempt in range(5):
        try:
            res = client.chat_complete([{"role": "user", "content": r["prompt"]}], base_model=args.model,
                                       max_tokens=300, temperature=0.0)
            j = res.response_json if isinstance(res.response_json, dict) else json.loads(res.response_json)
            text = j["choices"][0]["message"].get("content") or ""
            return {"pair_id": r["pair_id"], "text": text, "latency_ms": int((time.time() - t0) * 1000)}
        except Exception as e:  # transient transport errors: back off and retry
            err = str(e)
            time.sleep(2 * (attempt + 1))
    return {"pair_id": r["pair_id"], "text": "", "error": err, "latency_ms": int((time.time() - t0) * 1000)}


with open(out, "a") as f, ThreadPoolExecutor(max_workers=args.concurrency) as ex:
    for i, rec in enumerate(ex.map(one, todo)):
        f.write(json.dumps(rec) + "\n")
        f.flush()
        if i % 200 == 0:
            print(f"  {i}/{len(todo)}", flush=True)
print("done", flush=True)
