export interface Track {
  id: string;
  title: string;
  // S3 object key — app fetches a signed URL at play time
  audioKey: string;
}

export const tracks: Track[] = [
  {
    id: "1",
    title: "your-already-held",
    audioKey: "your-already-held.mp3",
  },
  {
    id: "2",
    title: "Cage Drop",
    audioKey: "Cage Drop.mp3",
  },
  {
    id: "3",
    title: "Danger Chords - House 1",
    audioKey: "Danger Chords - House 1.mp3",
  },
  {
    id: "4",
    title: "Don't Think About The Thing (Beyond The Thing) 1",
    audioKey: "Don't Think About The Thing (Beyond The Thing) 1.mp3",
  },
  {
    id: "5",
    title: "Early Motion 2",
    audioKey: "Early Motion 2.mp3",
  },
  {
    id: "6",
    title: "Get Set, Don't Let Set Get You 2",
    audioKey: "Get Set, Don't Let Set Get You 2.mp3",
  },
  {
    id: "7",
    title: "Hold the Night (Edit)",
    audioKey: "Hold the Night (Edit).mp3",
  },
  {
    id: "8",
    title: "I ALREADY KNEW YOUR NAME 2",
    audioKey: "I ALREADY KNEW YOUR NAME 2.mp3",
  },
  {
    id: "9",
    title: "I Understand 1",
    audioKey: "I Understand 1.mp3",
  },
  {
    id: "10",
    title: "Introducing RTHMIC (Edit) (Edit)",
    audioKey: "Introducing RTHMIC (Edit) (Edit).mp3",
  },
  {
    id: "11",
    title: "Morning Menus • 260404A",
    audioKey: "Morning Menus • 260404A.mp3",
  },
  {
    id: "12",
    title: "Outcome Candidates",
    audioKey: "Outcome Candidates.mp3",
  },
  {
    id: "13",
    title: "The Afternoon Menu • 260324A",
    audioKey: "The Afternoon Menu • 260324A.mp3",
  },
  {
    id: "14",
    title: "The Menues Before Bed • 260308",
    audioKey: "The Menues Before Bed • 260308.mp3",
  },
  {
    id: "15",
    title: "The Minimum of the Minimum Microhouse Version 1",
    audioKey: "The Minimum of the Minimum Microhouse Version 1.mp3",
  },
  {
    id: "16",
    title: "The Vacuum of The Inbetween Moment 1",
    audioKey: "The Vacuum of The Inbetween Moment 1.mp3",
  },
  {
    id: "17",
    title: "therapy",
    audioKey: "therapy.mp3",
  },
  {
    id: "18",
    title: "Unmedicated 2",
    audioKey: "Unmedicated 2.mp3",
  },
  {
    id: "19",
    title: "You already know the seven. - 1",
    audioKey: "You already know the seven. - 1.mp3",
  },
  {
    id: "20",
    title: "You're Don't Know It Yet - But You're Going To Be Late B",
    audioKey: "You're Don't Know It Yet - But You're Going To Be Late B.mp3",
  },
];
