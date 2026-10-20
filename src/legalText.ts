/**
 * Placeholder Terms of Use and Privacy Policy shown from Settings > About (RC-16), in plain language (RC-13).
 * The Terms carry the audio-rights statement (RISK-05); the Privacy Policy follows RC-03, RC-04, RC-05 and DD-13.
 */
export type LegalPageId = "terms" | "privacy";

type LegalPage = {
  title: string;
  intro: string;
  sections: { heading: string; body: string }[];
};

export const LEGAL_PAGES: Record<LegalPageId, LegalPage> = {
  terms: {
    title: "Terms of Use",
    intro: "The rules for using Amphion, in plain words.",
    sections: [
      {
        heading: "Use audio you have the right to use",
        body: "You must have the right to use any audio you record or upload to Amphion. That means songs you wrote or played yourself, or recordings you have permission to use.",
      },
      {
        heading: "Your tabs are just for you",
        body: "The tabs you make are private to your account. Amphion has no way to share or publish them.",
      },
      {
        heading: "Tabs are a best guess",
        body: "Amphion listens closely, but it can get notes wrong. A ? marks a note Amphion isn't sure about. Check those by ear and fix them if you need to.",
      },
      {
        heading: "Your account",
        body: "Keep your sign-in details to yourself. You can delete your account at any time in Settings > Account.",
      },
    ],
  },
  privacy: {
    title: "Privacy Policy",
    intro: "What Amphion keeps, and what it doesn't.",
    sections: [
      {
        heading: "Your song audio",
        body: "When you make a tab, your audio is sent to Amphion only so it can work out the notes. As soon as that's done, or if it fails, the audio is deleted from our servers. The guitar and bass parts Amphion picks out of it are never saved either. The copy on your iPhone stays there so you can play the song back.",
      },
      {
        heading: "What we keep",
        body: "We keep only your tab results: the notes with their string and fret, the beats, chord names, song details such as name and artist, and any edits you make. If you pick your own photo as a song's artwork, we keep that too, so it shows on every iPhone you sign in on.",
      },
      {
        heading: "Private to you",
        body: "Your library is private. Nobody else can see your songs or tabs, and Amphion has no sharing features.",
      },
      {
        heading: "Your microphone",
        body: "Amphion uses your microphone only while you're recording: from when you tap Record until you tap Stop or reach the 3-minute limit. It never listens in the background.",
      },
    ],
  },
};
