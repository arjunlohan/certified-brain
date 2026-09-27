import { PageHeader } from "@/components/page-header";
import { type Config, type Floor, readData } from "@/lib/data";
import { ReuseReplay } from "./replay";

export const dynamic = "force-dynamic";

export default function ReusePage() {
  const configs = readData<{ results: Config[] }>("report.json").results.filter((c) => c.stratifier === "value");
  const floors = ["floor-pinned.json", "floor-unpinned.json", "floor-owned-dsv4.json", "floor-owned.json"].map((f) => readData<Floor>(f));
  return (
    <>
      <PageHeader crumb="Certified reuse" kicker="Reuse, but verify · on GBrain's verdict cache" title={<>Change the judge. <span className="text-signal">Keep the cache</span> you can prove.</>}>
        GBrain caches an AI verdict for every pair of notes. Change the judge and it throws them all away. We check a sample and keep what still holds.
      </PageHeader>
      <ReuseReplay configs={configs} floors={floors} />
    </>
  );
}
