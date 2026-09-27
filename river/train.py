"""Train the owned judge on River: LoRA SFT on teacher verdicts, then label the
certification set from the saved checkpoint.

    pip install river-client transformers
    export RIVER_API_KEY=rv_...
    python river/train.py --steps 60            # train + save checkpoint
    python river/train.py --label-only CKPT     # label certify.jsonl from a checkpoint

API calls follow docs.river.ai (Your first SFT run, river-client 0.11.0).
"""
import argparse, json, os, random, sys, time
from concurrent.futures import ThreadPoolExecutor

import river_client as river
from transformers import AutoTokenizer

BASE = os.environ.get("RIVER_BASE", "Qwen/Qwen3.5-9B")
HERE = os.path.dirname(os.path.abspath(__file__))

ap = argparse.ArgumentParser()
ap.add_argument("--steps", type=int, default=60)
ap.add_argument("--batch", type=int, default=16)
ap.add_argument("--lr", type=float, default=2e-4)
ap.add_argument("--rank", type=int, default=32)
ap.add_argument("--label-n", type=int, default=2000)
ap.add_argument("--label-only", default=None, help="checkpoint path to label from")
ap.add_argument("--base-only", action="store_true", help="label with the untrained base model (baseline)")
ap.add_argument("--draw", type=int, default=0, help="draw index; >0 writes a separate file for floor measurement")
args = ap.parse_args()

tok = AutoTokenizer.from_pretrained(BASE)
EOS = tok.eos_token_id


def render(prompt: str) -> str:
    msgs = [{"role": "user", "content": prompt}]
    try:  # Qwen chat template, thinking off: teacher traces carry no thinking.
        return tok.apply_chat_template(msgs, tokenize=False, add_generation_prompt=True, enable_thinking=False)
    except TypeError:
        return tok.apply_chat_template(msgs, tokenize=False, add_generation_prompt=True)


def load(name):
    with open(os.path.join(HERE, "data", name)) as f:
        return [json.loads(l) for l in f if l.strip()]


def datum(r):
    p = tok(render(r["prompt"]), add_special_tokens=False)["input_ids"]
    c = tok(r["completion"], add_special_tokens=False)["input_ids"] + [EOS]
    ids = p + c
    return {"input_ids": ids, "target_tokens": ids[1:] + [EOS],
            "weights": [0.0] * (len(p) - 1) + [1.0] * (len(c) + 1)}


def mean_normalize(batch):
    # River's cross_entropy is summed over weighted tokens; normalize to a mean
    # so long prompts do not inflate the effective learning rate.
    n = sum(sum(d["weights"]) for d in batch)
    return [{**d, "weights": [w / n for w in d["weights"]]} for d in batch]


client = river.Client(api_key=os.environ["RIVER_API_KEY"])
out_path = os.path.join(HERE, "data", ("base" if args.base_only else "owned") + ("-labels.jsonl" if args.draw == 0 else f"-labels-d{args.draw}.jsonl"))


def label(session, ckpt):
    rows = load("certify.jsonl")[: args.label_n]
    done = set()
    if os.path.exists(out_path):
        done = {json.loads(l)["pair_id"] for l in open(out_path) if l.strip()}
    todo = [r for r in rows if r["pair_id"] not in done]
    print(f"labeling {len(todo)} cells ({len(done)} already done) -> {out_path}")

    def one(r):
        t0 = time.time()
        kw = dict(base_model=BASE, max_tokens=200, temperature=0.0)
        if ckpt is not None:
            kw["checkpoint"] = ckpt
        s = session.sample(render(r["prompt"]), **kw)
        return {"pair_id": r["pair_id"], "text": s[0][0].text, "latency_ms": int((time.time() - t0) * 1000)}

    with open(out_path, "a") as f, ThreadPoolExecutor(max_workers=int(os.environ.get("RIVER_CONCURRENCY", 16))) as ex:
        for i, rec in enumerate(ex.map(one, todo)):
            f.write(json.dumps(rec) + "\n")
            if i % 100 == 0:
                print(f"  {i}/{len(todo)}", flush=True)


with client.session(project="certified-brain") as session:
    if args.base_only:
        label(session, None)
        sys.exit(0)
    if args.label_only:
        label(session, args.label_only)
        sys.exit(0)

    train = [datum(r) for r in load("train.jsonl")]
    print(f"train examples: {len(train)}; base {BASE}; rank {args.rank}; lr {args.lr}")
    model = session.create_model(base_model=BASE, lora=river.LoraConfig(rank=args.rank))
    random.seed(0)
    t0 = time.time()
    for step in range(args.steps):
        batch = mean_normalize(random.sample(train, args.batch))
        fb = model.forward_backward(batch, loss_fn="cross_entropy")
        model.optim_step(lr=args.lr, grad_clip_norm=1.0)
        print(f"step {model.step:3d}  loss={fb.metrics['loss']:.4f}  {time.time() - t0:.0f}s", flush=True)
    ckpt = model.save_weights("owned-judge", mode="inference")
    print("checkpoint:", ckpt.path, flush=True)
    with open(os.path.join(HERE, "data", "checkpoint.txt"), "w") as f:
        f.write(ckpt.path)
    label(session, ckpt)
