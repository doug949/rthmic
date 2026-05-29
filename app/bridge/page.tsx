import { DedicatedCollectionHub } from "@/app/components/DedicatedCollectionHub";

export default function BridgePage() {
  return (
    <DedicatedCollectionHub
      kind="bridge"
      title="RTHMIC Bridge"
      eyebrow="For someone else"
      intro="Create and manage Rthms made to reach another person. Bridges stay separate from your main library so they feel more like messages than personal tracks."
      createLabel="Create a Bridge"
      libraryLabel="Bridge Library"
      emptyCopy="Bridge songs you create will appear here."
      icon={<BridgeIcon />}
      accent="rgba(180,160,140,0.9)"
    />
  );
}

function BridgeIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
      <path d="M4 15c2.2-4 4.9-6 8-6s5.8 2 8 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M7 15v-3M12 15V9M17 15v-3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M4 16h16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M7 7.8c1.4-1.6 3-2.4 5-2.4s3.6.8 5 2.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" opacity="0.65" />
    </svg>
  );
}

