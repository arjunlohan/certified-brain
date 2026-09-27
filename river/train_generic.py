"""LoRA SFT for any River base model using River's own renderer (so the training
template matches serving), then label the certification set from the checkpoint
through the OpenAI-style checkpoint endpoint.

    python river/train_generic.py --base deepseek-ai/DeepSeek-V4-Flash-0731 --tag dsv4-sft --steps 30
"""
import argparse, json, os, random, time
from concurrent.futures import ThreadPoolExecutor

import river_client as river
from river_client.renderers import get_renderer

HERE = os.path.dirname(os.path.abspath(__file__))
ap = argparse.ArgumentParser()
ap.add_argument("--base", required=True)
ap.add_argument("--tag", required=True)
ap.add_argument("--steps", type=int, default=30)
ap.add_argument("--batch", type=int, default=16)
ap.add_argument("--lr", type=float, default=1e-4)
ap.add_argument("--rank", type=int, default=32)
ap.add_argument("--label-n", type=int, default=2000)
ap.add_argument("--concurrency", type=int, default=32)
ap.add_argument("--train", default="train.jsonl")
ap.add_argument("--eval", default="certify.jsonl")
ap.add_argument("--max-tokens", type=int, default=300)
ap.add_argument("--base-eval", action="store_true", help="also label the eval set with the untrained base model")
args = ap.parse_args()


def load(name):
    return [json.loads(l) for l in open(os.path.join(HERE, "data", name)) if l.strip()]


renderer = get_renderer(args.base, thinking=False)
train = [
    renderer.build_training_example(
        [{"role": "user", "content": r["prompt"]}, {"role": "assistant", "content": r["completion"]}]
    ).to_dict()
    for r in load(args.train)
]
print(f"train examples: {len(train)}; base {args.base}; rank {args.rank}; lr {args.lr}", flush=True)

client = river.Client(api_key=os.environ["RIVER_API_KEY"])
with client.session(project="certified-brain") as session:
    model = session.create_model(base_model=args.base, lora=river.LoraConfig(rank=args.rank))
    random.seed(0)
    t0 = time.time()
    for _ in range(args.steps):
        fb = model.forward_backward(random.sample(train, args.batch), loss_fn="cross_entropy")
        model.optim_step(lr=args.lr, grad_clip_norm=1.0)
        print(f"step {model.step:3d}  loss={fb.metrics['loss']:.4f}  {time.time() - t0:.0f}s", flush=True)
    ckpt = model.save_weights(args.tag, mode="inference")
    print("checkpoint:", ckpt.path, flush=True)

rows = load(args.eval)[: args.label_n]
for r in rows:
    r.setdefault("pair_id", f"{r.get('entity')}|{r.get('variant')}")
out = os.path.join(HERE, "data", f"{args.tag}-labels.jsonl")
print(f"labeling {len(rows)} cells -> {out}", flush=True)


def one(r):
    t = time.time()
    for attempt in range(5):
        try:
            res = client.chat_complete_from_checkpoint(
                [{"role": "user", "content": r["prompt"]}], checkpoint_path=ckpt.path, base_model=args.base,
                max_tokens=args.max_tokens, temperature=0.0, chat_template_kwargs={"enable_thinking": False})
            j = res.response_json if isinstance(res.response_json, dict) else json.loads(res.response_json)
            return {"pair_id": r["pair_id"], "text": j["choices"][0]["message"].get("content") or "",
                    "latency_ms": int((time.time() - t) * 1000)}
        except Exception as e:
            err = str(e)
            time.sleep(2 * (attempt + 1))
    return {"pair_id": r["pair_id"], "text": "", "error": err, "latency_ms": int((time.time() - t) * 1000)}


with open(out, "w") as f, ThreadPoolExecutor(max_workers=args.concurrency) as ex:
    for i, rec in enumerate(ex.map(one, rows)):
        f.write(json.dumps(rec) + "\n")
        f.flush()
        if i % 200 == 0:
            print(f"  {i}/{len(rows)}", flush=True)
if args.base_eval:
    out_b = os.path.join(HERE, "data", f"{args.tag}-base-labels.jsonl")
    def base(r):
        res = client.chat_complete([{"role": "user", "content": r["prompt"]}], base_model=args.base,
                                   max_tokens=args.max_tokens, temperature=0.0,
                                   chat_template_kwargs={"enable_thinking": False})
        j = res.response_json if isinstance(res.response_json, dict) else json.loads(res.response_json)
        return {"pair_id": r["pair_id"], "text": j["choices"][0]["message"].get("content") or ""}
    with open(out_b, "w") as f, ThreadPoolExecutor(max_workers=args.concurrency) as ex:
        for rec in ex.map(base, rows):
            f.write(json.dumps(rec) + "\n")
print("done", flush=True)
