export interface Track {
  id: string;
  title: string;
  // S3 object key — app fetches a signed URL at play time
  audioKey: string;
}

export const tracks: Track[] = [
  {
    id: "1",
    title: "Adam's Pink Underwear",
    audioKey: "Adam's Pink Underwear.mp3",
  },
  {
    id: "2",
    title: "Aim the Ramp 1",
    audioKey: "Aim the Ramp 1.mp3",
  },
  {
    id: "3",
    title: "Aim the Ramp 2",
    audioKey: "Aim the Ramp 2.mp3",
  },
  {
    id: "4",
    title: "Aim the Ramp 3",
    audioKey: "Aim the Ramp 3.mp3",
  },
  {
    id: "5",
    title: "Aim the Ramp 4",
    audioKey: "Aim the Ramp 4.mp3",
  },
  {
    id: "6",
    title: "Cage Drop",
    audioKey: "Cage Drop.mp3",
  },
  {
    id: "7",
    title: "Collapse the Fog 1",
    audioKey: "Collapse the Fog 1.mp3",
  },
  {
    id: "8",
    title: "Collapse the Fog 2",
    audioKey: "Collapse the Fog 2.mp3",
  },
  {
    id: "9",
    title: "Comedy Clothing Set • 260404",
    audioKey: "Comedy Clothing Set • 260404.mp3",
  },
  {
    id: "10",
    title: "Confirmation Day 2",
    audioKey: "Confirmation Day 2.mp3",
  },
  {
    id: "11",
    title: "Confirmation Day V2B",
    audioKey: "Confirmation Day V2B.mp3",
  },
  {
    id: "12",
    title: "Confirmation Day",
    audioKey: "Confirmation Day.mp3",
  },
  {
    id: "13",
    title: "Cooking V4",
    audioKey: "Cooking V4.mp3",
  },
  {
    id: "14",
    title: "Danger Chords - House 1",
    audioKey: "Danger Chords - House 1.mp3",
  },
  {
    id: "15",
    title: "Daniel's Month of AI",
    audioKey: "Daniel's Month of AI.mp3",
  },
  {
    id: "16",
    title: "Discover Discord 1",
    audioKey: "Discover Discord 1.mp3",
  },
  {
    id: "17",
    title: "Discover Discord 2",
    audioKey: "Discover Discord 2.mp3",
  },
  {
    id: "18",
    title: "Don't Think About The Thing (Beyond The Thing) 1",
    audioKey: "Don't Think About The Thing (Beyond The Thing) 1.mp3",
  },
  {
    id: "19",
    title: "Don't Think About The Thing (Beyond The Thing) 2",
    audioKey: "Don't Think About The Thing (Beyond The Thing) 2.mp3",
  },
  {
    id: "20",
    title: "Don't Think About The Thing (Beyond The Thing) 3",
    audioKey: "Don't Think About The Thing (Beyond The Thing) 3.mp3",
  },
  {
    id: "21",
    title: "Don't Think About The Thing (Beyond The Thing) 4",
    audioKey: "Don't Think About The Thing (Beyond The Thing) 4.mp3",
  },
  {
    id: "22",
    title: "Early Motion 1",
    audioKey: "Early Motion 1.mp3",
  },
  {
    id: "23",
    title: "Early Motion 2",
    audioKey: "Early Motion 2.mp3",
  },
  {
    id: "24",
    title: "Easter Roast 2",
    audioKey: "Easter Roast 2.mp3",
  },
  {
    id: "25",
    title: "Easter Roast",
    audioKey: "Easter Roast.mp3",
  },
  {
    id: "26",
    title: "Five-Minute Run",
    audioKey: "Five-Minute Run.mp3",
  },
  {
    id: "27",
    title: "Get Set, Don't Let Set Get You 2",
    audioKey: "Get Set, Don't Let Set Get You 2.mp3",
  },
  {
    id: "28",
    title: "Hold the Night (Edit)",
    audioKey: "Hold the Night (Edit).mp3",
  },
  {
    id: "29",
    title: "I ALREADY KNEW YOUR NAME 2",
    audioKey: "I ALREADY KNEW YOUR NAME 2.mp3",
  },
  {
    id: "30",
    title: "I ALREADY KNEW YOUR NAME",
    audioKey: "I ALREADY KNEW YOUR NAME.mp3",
  },
  {
    id: "31",
    title: "I Understand 1",
    audioKey: "I Understand 1.mp3",
  },
  {
    id: "32",
    title: "Introducing RTHMIC (Edit) (Edit)",
    audioKey: "Introducing RTHMIC (Edit) (Edit).mp3",
  },
  {
    id: "33",
    title: "Introducing RTHMIC V3",
    audioKey: "Introducing RTHMIC V3.mp3",
  },
  {
    id: "34",
    title: "Introducing RTHMIC",
    audioKey: "Introducing RTHMIC.mp3",
  },
  {
    id: "35",
    title: "Make a new RTHM 1",
    audioKey: "Make a new RTHM 1.mp3",
  },
  {
    id: "36",
    title: "Make a new RTHM 2",
    audioKey: "Make a new RTHM 2.mp3",
  },
  {
    id: "37",
    title: "Morning Menus 2",
    audioKey: "Morning Menus 2.mp3",
  },
  {
    id: "38",
    title: "Morning Menus 260321",
    audioKey: "Morning Menus 260321.mp3",
  },
  {
    id: "39",
    title: "Morning Menus 260321B",
    audioKey: "Morning Menus 260321B.mp3",
  },
  {
    id: "40",
    title: "Morning Menus 3",
    audioKey: "Morning Menus 3.mp3",
  },
  {
    id: "41",
    title: "Morning Menus • 260316",
    audioKey: "Morning Menus • 260316.mp3",
  },
  {
    id: "42",
    title: "Morning Menus • 260404 • Select",
    audioKey: "Morning Menus • 260404 • Select.mp3",
  },
  {
    id: "43",
    title: "Morning Menus • 260404A",
    audioKey: "Morning Menus • 260404A.mp3",
  },
  {
    id: "44",
    title: "Morning Menus • 260404B",
    audioKey: "Morning Menus • 260404B.mp3",
  },
  {
    id: "45",
    title: "Morning Menus",
    audioKey: "Morning Menus.mp3",
  },
  {
    id: "46",
    title: "Outcome Candidates 2",
    audioKey: "Outcome Candidates 2.mp3",
  },
  {
    id: "47",
    title: "Outcome Candidates",
    audioKey: "Outcome Candidates.mp3",
  },
  {
    id: "48",
    title: "Prepare a Standup Set 1",
    audioKey: "Prepare a Standup Set 1.mp3",
  },
  {
    id: "49",
    title: "Prepare a Standup Set 2",
    audioKey: "Prepare a Standup Set 2.mp3",
  },
  {
    id: "50",
    title: "Preshow 260305 • Select",
    audioKey: "Preshow 260305 • Select.mp3",
  },
  {
    id: "51",
    title: "Preshow 260325A",
    audioKey: "Preshow 260325A.mp3",
  },
  {
    id: "52",
    title: "Preshow 260325B",
    audioKey: "Preshow 260325B.mp3",
  },
  {
    id: "53",
    title: "Preshow 260325C",
    audioKey: "Preshow 260325C.mp3",
  },
  {
    id: "54",
    title: "Preshow 260325D",
    audioKey: "Preshow 260325D.mp3",
  },
  {
    id: "55",
    title: "RSA Encryption",
    audioKey: "RSA Encryption.mp3",
  },
  {
    id: "56",
    title: "Restaurant Licence 3",
    audioKey: "Restaurant Licence 3.mp3",
  },
  {
    id: "57",
    title: "Run the Room",
    audioKey: "Run the Room.mp3",
  },
  {
    id: "58",
    title: "Seven-Lucky Teacup",
    audioKey: "Seven-Lucky Teacup.mp3",
  },
  {
    id: "59",
    title: "Shopping list • 260323A",
    audioKey: "Shopping list • 260323A.mp3",
  },
  {
    id: "60",
    title: "Shopping list • 260323B",
    audioKey: "Shopping list • 260323B.mp3",
  },
  {
    id: "61",
    title: "Show Prep A",
    audioKey: "Show Prep A.mp3",
  },
  {
    id: "62",
    title: "Show Prep B",
    audioKey: "Show Prep B.mp3",
  },
  {
    id: "63",
    title: "Show Prep C",
    audioKey: "Show Prep C.mp3",
  },
  {
    id: "64",
    title: "The Afternoon Menu • 260324A",
    audioKey: "The Afternoon Menu • 260324A.mp3",
  },
  {
    id: "65",
    title: "The Afternoon Menu • 260324B",
    audioKey: "The Afternoon Menu • 260324B.mp3",
  },
  {
    id: "66",
    title: "The Art of Approaching A Dragon • Before Thought • 1",
    audioKey: "The Art of Approaching A Dragon • Before Thought • 1.mp3",
  },
  {
    id: "67",
    title: "The Art of Approaching A Dragon • Before Thought • 2",
    audioKey: "The Art of Approaching A Dragon • Before Thought • 2.mp3",
  },
  {
    id: "68",
    title: "The Children of Brendan",
    audioKey: "The Children of Brendan.mp3",
  },
  {
    id: "69",
    title: "The Menues Before Bed • 260308",
    audioKey: "The Menues Before Bed • 260308.mp3",
  },
  {
    id: "70",
    title: "The Menues Before Bed • 260321A",
    audioKey: "The Menues Before Bed • 260321A.mp3",
  },
  {
    id: "71",
    title: "The Menues Before Bed • 260321B",
    audioKey: "The Menues Before Bed • 260321B.mp3",
  },
  {
    id: "72",
    title: "The Minimum of the Minimum Microhouse Version 1",
    audioKey: "The Minimum of the Minimum Microhouse Version 1.mp3",
  },
  {
    id: "73",
    title: "The Minimum of the Minimum Microhouse Version 2",
    audioKey: "The Minimum of the Minimum Microhouse Version 2.mp3",
  },
  {
    id: "74",
    title: "The Minimum of the Minimum Musical Version 1",
    audioKey: "The Minimum of the Minimum Musical Version 1.mp3",
  },
  {
    id: "75",
    title: "The Minimum of the Minimum Musical Version 2",
    audioKey: "The Minimum of the Minimum Musical Version 2.mp3",
  },
  {
    id: "76",
    title: "The Starting Song 11",
    audioKey: "The Starting Song 11.mp3",
  },
  {
    id: "77",
    title: "The Starting Song 12",
    audioKey: "The Starting Song 12.mp3",
  },
  {
    id: "78",
    title: "The Vacuum of The Inbetween Moment 1",
    audioKey: "The Vacuum of The Inbetween Moment 1.mp3",
  },
  {
    id: "79",
    title: "Therapy • 260323A",
    audioKey: "Therapy • 260323A.mp3",
  },
  {
    id: "80",
    title: "Therapy • 260323B",
    audioKey: "Therapy • 260323B.mp3",
  },
  {
    id: "81",
    title: "This is not about forcing it - 2",
    audioKey: "This is not about forcing it - 2.mp3",
  },
  {
    id: "82",
    title: "This is not about forcing it 3",
    audioKey: "This is not about forcing it 3.mp3",
  },
  {
    id: "83",
    title: "This is not about forcing it 4",
    audioKey: "This is not about forcing it 4.mp3",
  },
  {
    id: "84",
    title: "This is not about forcing it. - 1",
    audioKey: "This is not about forcing it. - 1.mp3",
  },
  {
    id: "85",
    title: "This menu is a little different.",
    audioKey: "This menu is a little different..mp3",
  },
  {
    id: "86",
    title: "Unmedicated 2",
    audioKey: "Unmedicated 2.mp3",
  },
  {
    id: "87",
    title: "Unmedicated",
    audioKey: "Unmedicated.mp3",
  },
  {
    id: "88",
    title: "You already know the seven - 2",
    audioKey: "You already know the seven - 2.mp3",
  },
  {
    id: "89",
    title: "You already know the seven. - 1",
    audioKey: "You already know the seven. - 1.mp3",
  },
  {
    id: "90",
    title: "You're Don't Know It Yet - But You're Going To Be Late B",
    audioKey: "You're Don't Know It Yet - But You're Going To Be Late B.mp3",
  },
  {
    id: "91",
    title: "You're Don't Know It Yet - But You're Going To Be Late Musical A",
    audioKey: "You're Don't Know It Yet - But You're Going To Be Late Musical A.mp3",
  },
  {
    id: "92",
    title: "You're Don't Know It Yet - But You're Going To Be Late",
    audioKey: "You're Don't Know It Yet - But You're Going To Be Late.mp3",
  },
  {
    id: "93",
    title: "ruth's-number-v2",
    audioKey: "ruth’s-number-v2.mp3",
  },
  {
    id: "94",
    title: "therapy",
    audioKey: "therapy.mp3",
  },
  {
    id: "95",
    title: "your-already-held",
    audioKey: "your-already-held.mp3",
  },
];
