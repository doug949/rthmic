import { DedicatedCollectionHub } from "@/app/components/DedicatedCollectionHub";

export default function InvitePage() {
  return (
    <DedicatedCollectionHub
      kind="invite"
      title="Rthmic Invite"
      eyebrow="Invite through experience"
      intro="Create and manage Rthms that invite someone into RTHMIC. Invites stay separate from your main library so the act of sending one feels clear and deliberate."
      createLabel="Create an Invite"
      libraryLabel="Invite Library"
      emptyCopy="Invite songs you create will appear here."
      icon={<InviteIcon />}
      accent="rgba(218,185,120,0.95)"
    />
  );
}

function InviteIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
      <path d="M5 8.5h14v9H5v-9Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M5.5 9l6.5 5 6.5-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 4.5v2.2M8.6 5.6 7.4 4M15.4 5.6 16.6 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.7" />
    </svg>
  );
}

