// GET /api/suggestions?pillar=<pillar>
// Generates 6 fresh topic suggestions via Claude Haiku, guided by the
// user's existing library so it avoids repeats but stays on-theme.

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { requireUserId } from "@/app/lib/auth";
import { REDIS_AVAILABLE, withRedis } from "@/app/lib/redis";
import { libraryKey, readSavedRhythms } from "@/app/lib/rhythmStorage";

export const maxDuration = 20;

async function getPastTitles(uid: string, pillar: string): Promise<string[]> {
  if (!REDIS_AVAILABLE) return [];
  return withRedis(async (client) => {
    const rhythms = await readSavedRhythms(client, libraryKey(uid));
    return rhythms
      .filter((r) => r.pillar?.toLowerCase() === pillar.toLowerCase() && r.status !== "deleted")
      .map((r) => r.title)
      .slice(0, 30); // cap context to avoid huge prompts
  });
}

const CHALLENGE_STARTERS: Record<string, string[]> = {
  memory: [
    "My spouse's phone number",
    "Names from a networking event",
    "Strings on a musical instrument",
    "Six Croatian words",
    "A short speech",
    "A process sequence",
    "A passcode I keep forgetting",
    "The order of a checklist",
    "Key client names",
    "Exam definitions",
    "A route with turns",
    "Parts of a diagram",
  ],
  mindset: [
    "I have two hours to finish",
    "I'm walking into a party alone",
    "I'm going for a job interview",
    "I'm going on a date",
    "I'm about to give a speech",
    "I'm making an important purchase",
    "I'm entering a difficult meeting",
    "I'm starting a negotiation",
    "I'm about to make a sales call",
    "I'm going to a medical appointment",
    "I'm sitting an exam today",
    "I'm asking for something important",
  ],
  mode: [
    "I just had an awkward confrontation",
    "I'm anxious about last night",
    "I'm resenting something",
    "I'm replaying what I said",
    "I'm stuck in a shame spiral",
    "I feel defensive and tense",
    "I can't stop overthinking it",
    "I'm carrying Sunday dread",
    "I feel socially hungover",
    "I'm irritated and can't drop it",
    "I feel embarrassed about earlier",
    "I'm bracing for bad news",
  ],
  movement: [
    "I've been avoiding this task",
    "I don't know where to start",
    "This never reaches my to-do list",
    "I need to open the email",
    "The room is too messy",
    "I've delayed this for weeks",
    "I need to start the application",
    "The admin pile is growing",
    "I keep postponing the workout",
    "I need to clear the kitchen",
    "The project needs a restart",
    "I feel overwhelmed by options",
  ],
};

const BOOK_STARTERS = [
  "The Warmth of Other Suns",
  "The Immortal Life of Henrietta Lacks",
  "The Emperor of All Maladies",
  "Braiding Sweetgrass",
  "The Sixth Extinction",
  "An Immense World",
  "Entangled Life",
  "Other Minds",
  "The Hidden Life of Trees",
  "Silent Spring",
  "Cosmos",
  "The Information",
  "The Order of Time",
  "A Brief History of Time",
  "The Selfish Gene",
  "The Gene",
  "Godel, Escher, Bach",
  "The Dawn of Everything",
  "The Silk Roads",
  "SPQR",
  "King Leopold's Ghost",
  "The Wretched of the Earth",
  "Orientalism",
  "The Right Stuff",
  "The Making of the Atomic Bomb",
  "The Devil in the White City",
  "Say Nothing",
  "The Jakarta Method",
  "The Big Short",
  "Debt",
  "Poor Economics",
  "Capital in the Twenty-First Century",
  "The Shock Doctrine",
  "The Righteous Mind",
  "Manufacturing Consent",
  "The Man Who Mistook His Wife for a Hat",
  "The Undoing Project",
  "Stumbling on Happiness",
  "Flow",
  "Influence",
  "Man's Search for Meaning",
  "Meditations",
  "The Myth of Sisyphus",
  "Discipline and Punish",
  "Thinking in Systems",
  "Ways of Seeing",
  "The Creative Act",
  "Bird by Bird",
  "A Swim in a Pond in the Rain",
  "How Fiction Works",
  "The Art of Travel",
  "Educated",
  "Born a Crime",
  "The Year of Magical Thinking",
  "H Is for Hawk",
  "Just Kids",
  "Kitchen Confidential",
  "The Argonauts",
  "The Hare with Amber Eyes",
  "The Lonely City",
  "A Room of One's Own",
  "Why We Sleep",
  "The Body Keeps the Score",
  "The Overstory",
  "Zen and the Art of Motorcycle Maintenance",
  "The Hero with a Thousand Faces",
  "Mythos",
  "The Fire Next Time",
  "Notes of a Native Son",
  "Trick Mirror",
  "The Age of Surveillance Capitalism",
  "Four Thousand Weeks",
  "Range",
  "Antifragile",
  "Deep Work",
  "Sapiens",
  "Thinking, Fast and Slow",
  "Atomic Habits",
  "A People's History of the United States",
  "The Invention of Nature",
  "The Guns of August",
  "The Sleepwalkers",
  "Bury My Heart at Wounded Knee",
  "Caste",
  "Empire of Pain",
  "Bad Blood",
  "The New Jim Crow",
  "Evicted",
  "Nickel and Dimed",
  "Invisible Women",
  "Data Feminism",
  "Weapons of Math Destruction",
  "The Design of Everyday Things",
  "The Death and Life of Great American Cities",
  "The Omnivore's Dilemma",
  "Salt, Fat, Acid, Heat",
  "Ultra-Processed People",
  "The Rise and Fall of the Dinosaurs",
  "Your Inner Fish",
  "I Contain Multitudes",
  "The Botany of Desire",
  "Finding the Mother Tree",
  "Underland",
  "The Peregrine",
  "Pilgrim at Tinker Creek",
  "Ducks",
  "Maus",
  "Persepolis",
  "Fun Home",
  "Citizen",
  "Bluets",
  "On Photography",
  "The Story of Art",
  "The Poetics of Space",
  "Steal Like an Artist",
  "Show Your Work",
  "The War of Art",
  "Big Magic",
  "Letters to a Young Poet",
  "The Writing Life",
  "The Anthropocene Reviewed",
  "The Mushroom at the End of the World",
  "Seeing Like a State",
  "The Road to Serfdom",
  "The Communist Manifesto",
  "The Prince",
  "Leviathan",
  "The Second Sex",
  "The Ethics of Ambiguity",
  "The Souls of Black Folk",
  "Pedagogy of the Oppressed",
  "The Presentation of Self in Everyday Life",
  "Bowling Alone",
  "The Tipping Point",
  "Outliers",
  "Moneyball",
  "Liar's Poker",
  "Barbarians at the Gate",
  "Creativity, Inc.",
  "Shoe Dog",
  "The Everything Store",
  "No Logo",
  "This Changes Everything",
  "How to Hide an Empire",
  "Prisoners of Geography",
  "The Revenge of Geography",
  "1491",
  "1493",
  "The Columbian Exchange",
  "The Great Influenza",
  "The Hot Zone",
  "And the Band Played On",
  "Being Mortal",
  "When Breath Becomes Air",
  "The Spirit Catches You and You Fall Down",
  "Mountains Beyond Mountains",
  "The Color of Law",
  "The Sum of Us",
  "Between the World and Me",
  "Men Explain Things to Me",
  "Consider the Lobster",
  "A Supposedly Fun Thing I'll Never Do Again",
  "Slouching Towards Bethlehem",
  "The White Album",
  "The Electric Kool-Aid Acid Test",
  "Hell's Angels",
  "In Cold Blood",
  "The Journalist and the Murderer",
  "Into Thin Air",
  "Into the Wild",
  "Wild",
  "The Old Ways",
  "The Lost City of Z",
  "Endurance",
  "The Worst Journey in the World",
  "Longitude",
  "Cod",
  "Salt",
  "The Code Book",
  "The Innovators",
  "Steve Jobs",
  "The Soul of a New Machine",
  "Hackers",
  "Chaos",
  "The Elegant Universe",
  "The Fabric of the Cosmos",
  "Reality Is Not What It Seems",
  "Seven Brief Lessons on Physics",
  "The Blind Watchmaker",
  "The Extended Phenotype",
  "The Language Instinct",
  "Behave",
  "Determined",
  "The Blank Slate",
  "The Better Angels of Our Nature",
  "Factfulness",
  "Enlightenment Now",
  "The Demon-Haunted World",
  "Pale Blue Dot",
  "The Varieties of Scientific Experience",
  "Surely You're Joking, Mr. Feynman!",
  "What I Talk About When I Talk About Running",
  "Crying in H Mart",
  "Stay True",
  "Heavy",
  "In the Dream House",
  "The Chronology of Water",
  "Know My Name",
  "I Know Why the Caged Bird Sings",
  "The Autobiography of Malcolm X",
  "Long Walk to Freedom",
  "Narrative of the Life of Frederick Douglass",
  "The Diary of a Young Girl",
  "Night",
  "If This Is a Man",
  "The Periodic Table",
  "Lab Girl",
  "Hidden Figures",
  "The Glass Castle",
  "Angela's Ashes",
  "A Heartbreaking Work of Staggering Genius",
  "The Diving Bell and the Butterfly",
];

function normalizeSuggestion(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function uniqueSuggestions(items: string[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const normalized = normalizeSuggestion(item);
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

function parseDismissed(value: string | null) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    return value.split(",");
  }
  return [];
}

function parseCount(value: string | null) {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) return 6;
  return Math.min(Math.max(parsed, 1), 18);
}

function takeFresh(pool: string[], blocked: Set<string>, count = 6) {
  const available = uniqueSuggestions(pool).filter((item) => !blocked.has(normalizeSuggestion(item)));
  return available.sort(() => Math.random() - 0.5).slice(0, count);
}

function sampleStarters(pillar: string, past: string[], dismissed: string[], excluded: string[], count: number) {
  const starters = CHALLENGE_STARTERS[pillar];
  if (!starters) return null;
  const blocked = new Set([...past, ...dismissed, ...excluded].map(normalizeSuggestion));
  return takeFresh(starters, blocked, count);
}

function buildPrompt(pillar: string, past: string[], dismissed: string[], excluded: string[], count: number): string {
  const hasPast = past.length > 0;
  const pastList = hasPast ? past.map((t) => `- ${t}`).join("\n") : "";
  const dismissedList = dismissed.length ? dismissed.map((t) => `- ${t}`).join("\n") : "";
  const excludedList = excluded.length ? excluded.map((t) => `- ${t}`).join("\n") : "";
  const dismissedInstruction = dismissed.length
    ? `\nNever suggest these dismissed items again:\n${dismissedList}\n`
    : "";
  const shuffleInstruction = excluded.length
    ? `\nFor this shuffle, do not suggest anything currently visible:\n${excludedList}\n`
    : "";

  if (pillar === "booksummary") {
    return hasPast
      ? `You are suggesting books for someone who turns book summaries into personalised music Rthms.
They have already made Rthms from these books:
${pastList}
${dismissedInstruction}
${shuffleInstruction}

Suggest ${count} books that would make great Rthms next. Be guided by their taste, but do not repeat any book they have already done, dismissed, or currently see. Vary widely across history, science, biography, memoir, philosophy, culture, politics, nature writing, creativity, economics, literary criticism, graphic memoir, reportage, travel, food, design, technology, medicine, and big-idea fiction. Avoid letting self-help dominate.

Return ONLY a valid JSON array of ${count} book titles. No explanation, no markdown, no extra text.`
      : `You are suggesting books for someone who turns book summaries into personalised music Rthms.${dismissedInstruction}
${shuffleInstruction}
Suggest ${count} books that would make great personalised music Rthms. Include a varied mix across history, science, biography, memoir, philosophy, culture, politics, nature writing, creativity, economics, literary criticism, graphic memoir, reportage, travel, food, design, technology, medicine, and big-idea fiction. Popular and accessible, not too obscure. Avoid letting self-help dominate.

Return ONLY a valid JSON array of ${count} book titles. No explanation, no markdown, no extra text.`;
  }

  if (pillar === "explain") {
    return hasPast
      ? `You are suggesting concepts for someone who turns concept explanations into personalised music Rthms.
They have already made Rthms explaining these concepts:
${pastList}
${dismissedInstruction}
${shuffleInstruction}

Suggest ${count} fascinating concepts to explain next. Be guided by their intellectual interests — adjacent ideas, related fields — but do not repeat anything they have already covered. Keep concepts crisp and nameable (2–5 words max each).

Return ONLY a valid JSON array of ${count} concept names. No explanation, no markdown, no extra text.`
      : `Suggest ${count} fascinating concepts that would make great personalised music Rthms. Mix mental models, science, psychology, economics, and philosophy. Keep each concept crisp and nameable (2–5 words max).
${dismissedInstruction}
${shuffleInstruction}

Return ONLY a valid JSON array of ${count} concept names. No explanation, no markdown, no extra text.`;
  }

  const pillarBriefs: Record<string, string> = {
    memory: "concrete lists, sequences, names, numbers, phrases, or labels the user needs to memorise accurately",
    menus: "daily menus that are options to consider, not to-do lists",
    mindset: "upcoming situations, events, or decisions the user is about to walk into and wants the right mindset for",
    mode: "unhelpful states the user is already in and wants to shake off, reset, or move through",
    movement: "avoided, stalled, overwhelming, or repeatedly postponed tasks the user needs help starting",
    journal: "moments from the day worth capturing as a personal song",
    epiphany: "fresh realisations, ideas, or insights worth preserving",
    bridge: "personal messages made for someone else",
    invite: "specific people to invite into RTHMIC through a song",
  };
  const brief = pillarBriefs[pillar] ?? "useful personalised Rthm starting points";

  const extraGuidance: Record<string, string> = {
    memory: "Return things like phone numbers, names from a networking event, musical instrument strings, speeches, passcodes, language words, process steps, checklist orders, formulas, or labelled parts. Do NOT suggest emotional states or abstract recovery phrases.",
    mindset: "Return first-person upcoming situations like job interview, first date, important purchase, giving a speech, difficult meeting, performance review, sales call, medical appointment, negotiation, or exam. Do NOT return advice phrases.",
    mode: "Return first-person current states to shift out of, such as awkward confrontation aftermath, anxiety about last night, resentment, shame spiral, post-argument replay, Sunday dread, social hangover, or feeling defensive. Do NOT return aspirational modes like deep focus.",
    movement: "Return stuck-task situations, such as avoiding admin, overwhelmed and don't know where to start, task never reaches the top of the list, messy room, unopened email, delayed application, postponed workout, or project restart.",
  };
  const guidance = extraGuidance[pillar] ? `\n${extraGuidance[pillar]}` : "";

  return hasPast
    ? `You are suggesting starting points for the ${pillar} pillar in RTHMIC.
This pillar is about ${brief}.
The user has already made these Rthms:
${pastList}
${dismissedInstruction}
${shuffleInstruction}

Suggest ${count} concise starting points they might want to make next. Avoid repeats. Make them practical, specific, and immediately speakable. Keep each item under 8 words.${guidance}

Return ONLY a valid JSON array of ${count} strings. No explanation, no markdown, no extra text.`
    : `Suggest ${count} concise starting points for the ${pillar} pillar in RTHMIC.
This pillar is about ${brief}.
Make them practical, specific, and immediately speakable. Keep each item under 8 words.${guidance}
${dismissedInstruction}
${shuffleInstruction}

Return ONLY a valid JSON array of ${count} strings. No explanation, no markdown, no extra text.`;
}

export async function GET(req: NextRequest) {
  const uid = requireUserId(req);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const pillar = req.nextUrl.searchParams.get("pillar") ?? "";
  const allowed = new Set(["memory", "menus", "mindset", "mode", "movement", "journal", "epiphany", "explain", "booksummary", "bridge", "invite"]);
  if (!allowed.has(pillar)) {
    return NextResponse.json({ error: "Invalid pillar" }, { status: 400 });
  }

  const dismissed = parseDismissed(req.nextUrl.searchParams.get("dismissed")).slice(0, 100);
  const excluded = parseDismissed(req.nextUrl.searchParams.get("exclude")).slice(0, 50);
  const count = parseCount(req.nextUrl.searchParams.get("count"));
  const blocked = new Set([...dismissed, ...excluded].map(normalizeSuggestion));
  const past = await getPastTitles(uid, pillar);
  past.forEach((title) => blocked.add(normalizeSuggestion(title)));

  const curated = sampleStarters(pillar, past, dismissed, excluded, count);
  if (curated) {
    return NextResponse.json({ suggestions: curated }, { headers: { "Cache-Control": "no-store" } });
  }

  const prompt = buildPrompt(pillar, past, dismissed, excluded, count);

  let suggestions: string[] = [];
  try {
    const anthropic = new Anthropic();
    const msg = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: pillar === "booksummary" ? 512 : 320,
      messages: [{ role: "user", content: prompt }],
    });

    const text = msg.content.find((b) => b.type === "text")?.text ?? "[]";
    const start = text.indexOf("[");
    const end = text.lastIndexOf("]");
    if (start !== -1 && end > start) {
      suggestions = JSON.parse(text.slice(start, end + 1));
    }
  } catch {
    suggestions = [];
  }

  suggestions = uniqueSuggestions(suggestions)
    .filter((item) => !blocked.has(normalizeSuggestion(item)))
    .slice(0, count);

  // Fallback: never return empty
  if (suggestions.length < count) {
    const fallback: Record<string, string[]> = {
      booksummary: BOOK_STARTERS,
      explain: ["Compound interest", "Cognitive dissonance", "First principles thinking", "The Pareto principle", "Neuroplasticity", "Occam's razor"],
      mindset: CHALLENGE_STARTERS.mindset.slice(0, 6),
      menus: ["Morning menu", "Airport packing menu", "End of workday", "Before bed", "Leaving the house", "Room reset"],
      memory: CHALLENGE_STARTERS.memory.slice(0, 6),
      mode: CHALLENGE_STARTERS.mode.slice(0, 6),
      movement: CHALLENGE_STARTERS.movement.slice(0, 6),
      journal: ["Today in one scene", "A strange good moment", "What I learned today", "A thing worth keeping", "A hard day ending", "Small wins"],
      epiphany: ["The new idea", "What finally clicked", "A better frame", "Something I realised", "The missing link", "A useful metaphor"],
      bridge: ["Encourage a friend", "Thank a collaborator", "Repair a moment", "Celebrate someone", "Explain how you feel", "Send reassurance"],
      invite: ["Invite a founder", "Invite a coach", "Invite a musician", "Invite a teacher", "Invite a friend", "Invite an early tester"],
    };
    const fillers = takeFresh(fallback[pillar] ?? ["Clear the surface", "Start the next thing", "Find the simple path", "Reset the room", "Make it concrete", "Move one step"], blocked, count);
    suggestions = uniqueSuggestions([...suggestions, ...fillers])
      .filter((item) => !blocked.has(normalizeSuggestion(item)))
      .slice(0, count);
  }

  return NextResponse.json({ suggestions }, { headers: { "Cache-Control": "no-store" } });
}
