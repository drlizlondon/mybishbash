// Local Edit Mode can save directly back to this file in development.
// The edit panel can also copy the current JSON as a manual fallback.
//
// Structural sections (how-it-works, mechanics, packs, comparison, pricing,
// faq, etc.) are rendered from the static export below — they are intentionally
// not wired into the inline EditableText system, which only covers the hero,
// proof strip, statement and footer.
export const landingContent = {
  "brand": {
    "name": "myBishBash"
  },
  "nav": [
    "How it works",
    "Examples",
    "Pricing",
    "FAQ"
  ],
  "ctas": {
    "primary": "Get myBishBash",
    "secondary": "See how it works"
  },
  "hero": {
    "eyebrow": "The intentional-phone app",
    "headline": [
      "Your phone shapes",
      "your attention."
    ],
    "gold": "Take it back.",
    "copy": [
      "myBishBash drops a check-in in front of the apps that eat your time, and resurfaces the things you actually meant to do — so your hours go where you want them. No blockers. No guilt-trips."
    ]
  },
  "proof": [
    {
      "title": "A check-in before the scroll",
      "copy": "A quick prompt lands before the apps built to keep you."
    },
    {
      "title": "Reminders that resurface",
      "copy": "Your own prompts come back exactly when they count."
    },
    {
      "title": "Commitments, on the record",
      "copy": "Set one promise for the day — we check you kept it."
    },
    {
      "title": "You stay in control",
      "copy": "Private by default. You decide what shows up, and when."
    }
  ],
  "statement": "We won't lock your phone away. We'll help you use it like you mean it.",
  "footer": {
    "tagline": "The intentional-phone app. Built in the UK by people who got tired of losing the day to a feed.",
    "links": [
      "Privacy",
      "Contact"
    ]
  }
};

// ---------------------------------------------------------------------------
// Structural copy for the launch sections. Plain data, rendered statically.
// ---------------------------------------------------------------------------

export const problem = {
  eyebrow: "The problem",
  heading: "The apps are built to keep you.",
  copy: "Most screen-time tools fight you with blockers, timers and guilt. They treat your attention as something to lock away — so the second willpower dips or the timer runs out, the pull is right there waiting.",
  points: [
    {
      title: "Endless loops",
      copy: "Feeds are tuned to keep you scrolling well past the point you meant to stop.",
    },
    {
      title: "Blunt blockers",
      copy: "Hard limits feel like punishment, so most people just switch them off.",
    },
    {
      title: "Lost intentions",
      copy: "The things you genuinely meant to do fall off the end of the day.",
    },
  ],
};

export const howItWorks = {
  eyebrow: "How it works",
  heading: "Three steps to a phone that works for you.",
  copy: "myBishBash sits between you and the apps you already open, turning automatic taps into decisions you actually make.",
  steps: [
    {
      key: "open",
      label: "01",
      title: "You open an app",
      copy: "Pick the apps that tend to swallow your time. Tap to open one and myBishBash gets there first.",
    },
    {
      key: "pause",
      label: "02",
      title: "We step in first",
      copy: "A quick prompt asks whether this is really how you want the next ten minutes to go. No countdowns, no lock-outs.",
    },
    {
      key: "choose",
      label: "03",
      title: "You choose, on purpose",
      copy: "Carry on if you mean to — or let a reminder, a commitment or a pack point you somewhere better.",
    },
  ],
};

export const mechanics = {
  eyebrow: "Examples",
  heading: "Four mechanics. One phone that's finally on your side.",
  copy: "Each does one job well — and together they add up.",
  items: [
    {
      key: "pause",
      label: "Pause",
      title: "Pause before you scroll",
      copy: "Open Instagram and myBishBash gets there first — a check-in before the apps built to keep you.",
    },
    {
      key: "personal",
      label: "Personal Cards",
      title: "Reminders from future you",
      copy: "Short prompts you write yourself, answerable in a tap, resurfaced right when they matter.",
    },
    {
      key: "commitment",
      label: "Commitment Cards",
      title: "Make one promise, keep it",
      copy: "Set a single intention for the day. We check in later, so following through is on the record.",
    },
    {
      key: "packs",
      label: "Packs",
      title: "Packs for the headspace you want",
      copy: "Ready-made prompt sets — from Better Bedtime to Motivational Quotes — that show up before your chosen apps.",
    },
  ],
};

export const packs = {
  eyebrow: "Packs",
  heading: "Borrow a mindset, skip the busywork.",
  copy: "Packs are ready-made prompt sets we craft at myBishBash. Install one and its messages show up before the apps you choose — shaping how you think, not adding chores to your day.",
  themes: [
    { name: "Better Bedtime", line: "“Put your phone away for bedtime?”" },
    { name: "Stop Being Late", line: "“Checked what time you need to leave?”" },
    { name: "Motivational Quote", line: "“It always seems impossible until it's done.”" },
    { name: "Healthier Daily Basics", line: "“Have you moved your body today?”" },
  ],
  goals: ["Confidence", "Focus", "Calm", "Create", "Health", "Relationships"],
  note: "Packs are mindset and habit prompts — not checklists. Install once and they appear wherever you've chosen.",
};

export const comparison = {
  eyebrow: "Why myBishBash is different",
  heading: "A different approach, not another blocker.",
  copy: "Most tools restrict you. myBishBash works with your intentions instead of fighting them.",
  columns: ["App blockers", "Screen-time tools", "Habit trackers", "myBishBash"],
  rows: [
    { label: "Core idea", values: ["Block access", "Measure usage", "Track streaks", "Choose on purpose"] },
    { label: "How it feels", values: ["Restrictive", "Passive", "Demanding", "On your side"] },
    { label: "When it acts", values: ["After a limit", "After the fact", "End of day", "In the moment"] },
    { label: "What it asks", values: ["Stay out", "Look at a chart", "Don't break the chain", "Is this on purpose?"] },
    { label: "Who's in control", values: ["The app", "Nobody", "The streak", "You"] },
  ],
};

export const trust = {
  eyebrow: "Built properly",
  heading: "Serious about your trust.",
  items: [
    { title: "Private by design", copy: "Your reminders and choices stay yours. We don't sell or share them." },
    { title: "No advertising", copy: "No feeds, no ads, no dark patterns pulling at your attention." },
    { title: "You stay in control", copy: "You choose what appears, where and when — and change it whenever." },
    { title: "Built with intent", copy: "We sweat the details, because a tool about intention should be intentional too." },
  ],
};

export const pricing = {
  eyebrow: "Pricing",
  heading: "Start free. Upgrade when it pays off.",
  copy: "Straightforward plans that scale with how seriously you want your time back.",
  plans: [
    {
      name: "Free",
      price: "£0",
      cadence: "forever",
      tagline: "Everything you need to start.",
      features: [
        "myBishBash core experience",
        "Pause before one connected app",
        "Unlimited Personal Cards",
        "One Commitment Card at a time",
      ],
      cta: "Get started",
      kind: "free",
    },
    {
      name: "Plus",
      price: "£3.99",
      cadence: "per month",
      tagline: "For a phone that's fully yours.",
      featured: true,
      features: [
        "Pause before unlimited apps",
        "Every Pack, including new releases",
        "Unlimited Commitment Cards",
        "Insights into the time you reclaim",
      ],
      cta: "Join early access",
      kind: "plus",
    },
    {
      name: "Team",
      price: "Let's talk",
      cadence: "",
      tagline: "For families, schools and workplaces.",
      features: [
        "Shared Packs and themes",
        "Onboarding for your group",
        "Volume pricing",
        "A real person to help you set up",
      ],
      cta: "Contact us",
      kind: "team",
    },
  ],
};

export const partnerships = {
  eyebrow: "For groups",
  heading: "Good for one. Better together.",
  copy: "myBishBash works for a household, a classroom or a whole team just as well as it does for one person.",
  audiences: ["Individuals", "Families", "Workplaces", "Schools"],
  cta: "Talk to us about partnerships",
};

export const faq = {
  eyebrow: "FAQ",
  heading: "Questions, answered.",
  items: [
    {
      q: "What is myBishBash?",
      a: "myBishBash is an intentional-phone app. It adds a check-in before the apps that eat your time and resurfaces the things you meant to do, so you spend your attention on purpose. It's built for professionals, students and anyone after better habits or real accountability.",
    },
    {
      q: "Does myBishBash block my apps?",
      a: "No. There are no hard lock-outs or timers. We add a check-in and a moment of choice before the apps you pick — you can always continue.",
    },
    {
      q: "How is this different from screen-time settings?",
      a: "Screen-time tools measure and restrict after the fact. myBishBash acts in the moment, helping you choose on purpose rather than reporting on damage that's already done.",
    },
    {
      q: "What are Personal Cards and Commitment Cards?",
      a: "Personal Cards are short recurring reminders you write yourself, answerable in a tap. Commitment Cards are a single daily intention that myBishBash checks in on, so following through is on the record.",
    },
    {
      q: "What's in a Pack?",
      a: "Packs are ready-made prompt sets — from Better Bedtime to Motivational Quotes to Healthier Daily Basics — that show up before your chosen apps. They shape how you think, not a list of chores.",
    },
    {
      q: "Is my data private?",
      a: "Yes. myBishBash is private by design. Your reminders and choices stay yours — we don't sell them, and there's no advertising.",
    },
    {
      q: "Is there a team behind it?",
      a: "Yes. We're a UK-based team building myBishBash because we were tired of losing hours to apps designed to keep us. Say hello any time at hello@mybishbash.app.",
    },
  ],
};

export const finalCta = {
  eyebrow: "Early access",
  heading: "Use your phone like you mean it.",
  copy: "Join early access and be among the first to put your attention back where you want it.",
  primary: "Get myBishBash",
  secondary: "Join early access",
};
