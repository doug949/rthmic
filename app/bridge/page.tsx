import { DedicatedCollectionHub } from "@/app/components/DedicatedCollectionHub";
import { PaperPlaneIcon } from "@/app/components/PaperPlaneIcon";

export default function BridgePage() {
  return (
    <DedicatedCollectionHub
      kind="bridge"
      title="Rthmic Bridge"
      eyebrow="For someone else"
      intro="Create and manage Rthms made to reach another person. Bridges stay separate from your main library so they feel more like messages than personal tracks."
      createLabel="Create a Bridge"
      libraryLabel="Bridge Library"
      emptyCopy="Bridge songs you create will appear here."
      icon={<PaperPlaneIcon size={28} />}
      accent="rgba(180,160,140,0.9)"
    />
  );
}
