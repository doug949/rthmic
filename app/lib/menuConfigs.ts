export type MenuGroupId = "daily" | "situational";

export type MenuConfig = {
  slug: string;
  group: MenuGroupId;
  label: string;
  menuTitle: string;
  description: string;
  seed: string;
  emptyHeadline: string;
  emptyIntro: string;
  emptyPrompts: string[];
  emptyCta: string;
};

export const MENU_GROUPS: { id: MenuGroupId; label: string; intro: string }[] = [
  {
    id: "daily",
    label: "Daily Contexts",
    intro: "Loops for moments that come around most days.",
  },
  {
    id: "situational",
    label: "Situational Contexts",
    intro: "Loops for moments that happen when a context begins.",
  },
];

export const MENU_CONFIGS: MenuConfig[] = [
  {
    slug: "morning",
    group: "daily",
    label: "Morning Menu",
    menuTitle: "The Morning Menu",
    description: "A wash of options for easing into the day.",
    seed: "My morning menu — a gentle field of options to consider as I start the day, not a to-do list",
    emptyHeadline: "What might a good morning include?",
    emptyIntro: "This becomes a loop of options, not a list to finish. Add the moves that help the day begin well.",
    emptyPrompts: [
      "What do you often want to remember in the first hour of the day?",
      "What small things help the day feel started?",
      "What would be useful to hear on repeat while you move around?",
    ],
    emptyCta: "Speak your morning menu",
  },
  {
    slug: "start-the-day",
    group: "daily",
    label: "Start the Day",
    menuTitle: "Start the Day Menu",
    description: "Options for the session ahead.",
    seed: "My start-the-day menu — priorities, intentions, and possible moves for the session ahead, not a to-do list",
    emptyHeadline: "What belongs in today's opening loop?",
    emptyIntro: "Name the things that could matter today. RTHMIC will keep them available without making them compulsory.",
    emptyPrompts: [
      "What deserves to stay in view today?",
      "What could make the day feel meaningfully started?",
      "What might future-you be glad you noticed early?",
    ],
    emptyCta: "Speak today's menu",
  },
  {
    slug: "afternoon",
    group: "daily",
    label: "Afternoon",
    menuTitle: "Afternoon Menu",
    description: "A steady reset for the middle of the day.",
    seed: "My afternoon menu — remaining options, resets, and gentle next moves for the middle of the day",
    emptyHeadline: "What might still be useful this afternoon?",
    emptyIntro: "The afternoon menu helps options bubble back up without turning the day into a checklist.",
    emptyPrompts: [
      "What tends to slip away after lunch?",
      "What could help the day close more cleanly later?",
      "What would be good to hear while you get moving again?",
    ],
    emptyCta: "Speak your afternoon menu",
  },
  {
    slug: "end-of-day",
    group: "daily",
    label: "End of Day",
    menuTitle: "End of Day Menu",
    description: "A closing loop for work, home, or the day itself.",
    seed: "My end-of-day menu — possible closing actions, loose ends, and things to set down before the day ends",
    emptyHeadline: "What helps a day close well?",
    emptyIntro: "Add the options that make the day feel landed. Nothing has to be completed for the menu to be useful.",
    emptyPrompts: [
      "What do you like to close before tomorrow begins?",
      "What loose ends are worth gently surfacing?",
      "What helps you feel that enough has been done?",
    ],
    emptyCta: "Speak your end-of-day menu",
  },
  {
    slug: "before-bed",
    group: "daily",
    label: "Before Bed",
    menuTitle: "Before Bed Menu",
    description: "A low-pressure loop for winding down.",
    seed: "My before-bed menu — small options for winding down, preparing rest, and making tomorrow easier",
    emptyHeadline: "What could bedtime offer?",
    emptyIntro: "This is for soft reminders, not pressure. Add what you want to keep gently in circulation.",
    emptyPrompts: [
      "What small things help sleep feel easier?",
      "What might morning-you appreciate?",
      "What belongs in a calm loop at the end of the day?",
    ],
    emptyCta: "Speak your before-bed menu",
  },
  {
    slug: "leaving-the-house",
    group: "situational",
    label: "Leaving the House",
    menuTitle: "Leaving the House Menu",
    description: "Keys, wallet, water, lights, doors, and the easy-to-miss bits.",
    seed: "My leaving-the-house menu — options to consider before walking out, like keys, wallet, phone, water, bags, pets, lights, doors, and anything waiting by the door",
    emptyHeadline: "What helps you leave cleanly?",
    emptyIntro: "Build a loop for the doorway moment. It can repeat while you move, check, and decide when enough is enough.",
    emptyPrompts: [
      "What do you most often forget when leaving?",
      "What belongs by the door or in your bag?",
      "What needs a quick glance before the door closes?",
    ],
    emptyCta: "Speak your leaving menu",
  },
  {
    slug: "airport-packing",
    group: "situational",
    label: "Airport / Packing",
    menuTitle: "Airport Packing Menu",
    description: "A travel loop for packing and getting out the door.",
    seed: "My airport packing menu — possible things to gather, charge, check, pack, print, download, and remember before travelling",
    emptyHeadline: "What belongs in the travel loop?",
    emptyIntro: "This menu keeps travel options moving past you while you pack, rather than pinning you to one rigid list.",
    emptyPrompts: [
      "What do you always want checked before airport travel?",
      "What devices, documents, clothes, or medicines need to surface?",
      "What helps the trip feel calmly underway?",
    ],
    emptyCta: "Speak your travel menu",
  },
  {
    slug: "room-reset",
    group: "situational",
    label: "Room Reset",
    menuTitle: "Room Reset Menu",
    description: "A loop for surfaces, dishes, laundry, bins, and returning the room to usable.",
    seed: "My room reset menu — possible moves for resetting a room, like dishes, surfaces, laundry, bins, floors, water, light, and putting things back",
    emptyHeadline: "What could reset the room?",
    emptyIntro: "Use this when the room needs movement, not a lecture. The loop can keep options surfacing until the space feels usable again.",
    emptyPrompts: [
      "What changes the room fastest?",
      "What tends to be invisible until it is named?",
      "What would make the space feel usable again?",
    ],
    emptyCta: "Speak your room reset menu",
  },
];

export function getMenuConfig(slug: string): MenuConfig | undefined {
  return MENU_CONFIGS.find((menu) => menu.slug === slug);
}
