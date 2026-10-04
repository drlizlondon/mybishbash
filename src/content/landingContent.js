// Local Edit Mode can save directly back to this file in development.
// The edit panel can also copy the current JSON as a manual fallback.
import { FREE_PRICE_DISPLAY, PLUS_PRICE_DISPLAY } from "./pricingConfig.js";

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
    "primary": "Join the waitlist",
    "secondary": "See how it works",
    "waitlist": "Join the Plus waitlist"
  },
  "hero": {
    "eyebrow": "The intentional-phone app",
    "headline": [
      "Your phone",
      "shapes your",
      "attention.",
      "myBishBash helps"
    ],
    "gold": "shape it intentionally.",
    "copy": [
      "myBishBash places helpful reminders and prompts in front of the apps that you use, directing your attention to the things you actually mean to do. Your choices, with a little more intention."
    ],
    "anchor": "Free during early access. Join with an invite code, or ask for one."
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
      "title": "Commitments you mark done",
      "copy": "Set one promise for the day. We check you kept it."
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
  copy: "Many screen-time tools rely on blockers and timers. They treat your attention as something to lock away. So the second willpower dips or the timer runs out, the pull is right there waiting.",
  points: [
    {
      title: "Endless loops",
      copy: "Feeds are tuned to keep you scrolling well past the point you meant to stop.",
    },
    {
      title: "Blunt blockers",
      copy: "Hard limits can feel like punishment, and they're easy to switch off.",
    },
    {
      title: "Lost intentions",
      copy: "The things you genuinely meant to do fall off the end of the day.",
    },
  ],
};

export const supportedApps = {
  eyebrow: "Connected apps",
  heading: "Live on your phone today.",
  copy: "Pause rabbit holes before you scroll, or turn everyday doorways like Safari into gentle nudges for real life. Tap any app below to install its doorway.",
};

export const howItWorks = {
  eyebrow: "How it works",
  heading: "Three steps to a phone that works for you.",
  copy: "myBishBash sits between you and the apps you choose, right on your Home Screen.",
  steps: [
    {
      key: "open",
      label: "01",
      title: "Choose your doorways",
      copy: "Pick the apps that swallow your time (like Instagram) and the everyday apps you open all day (like Safari). myBishBash gives each one its own Home Screen icon.",
    },
    {
      key: "pause",
      label: "02",
      title: "A pause or an everyday nudge",
      copy: "Before Instagram, get a quick pause to break the scroll reflex. Before Safari, catch a 1-second reminder for the things you care about.",
    },
    {
      key: "choose",
      label: "03",
      title: "You follow through in real life",
      copy: "Carry on if you mean to, water the plants, or let a reminder point you somewhere better. No blockers, no guilt.",
    },
  ],
};

export const mechanics = {
  eyebrow: "Examples",
  heading: "Four mechanics. One phone that's finally on your side.",
  copy: "Each does one job well. Together, they add up.",
  items: [
    {
      key: "pause",
      label: "Pause",
      title: "Pause before you scroll",
      copy: "Open Instagram from your myBishBash icon and you get a quick check-in first, before the app built to keep you.",
    },
    {
      key: "personal",
      label: "Everyday Nudges",
      title: "Reminders from future you",
      copy: "Put them before everyday apps like Safari. See 'water the plants' 15 times a day so you actually do it.",
    },
    {
      key: "commitment",
      label: "Commitment Cards",
      title: "Make one promise, keep it",
      copy: "Set a single intention for the day. We check in later so you can mark it done.",
    },
    {
      key: "packs",
      label: "Packs",
      title: "Packs that shift your mindset",
      copy: "Ready-made sets of quotes and affirmations that show up before your chosen apps, nudging you towards who you want to be.",
    },
  ],
};

export const packs = {
  eyebrow: "Packs",
  heading: "Think like the person you're becoming.",
  copy: "Packs are ready-made sets of quotes and affirmations we craft at myBishBash. Install one and its words show up before the apps you choose, pulling your head towards who you want to be, not adding chores to your day.",
  themes: [
    { name: "Confidence", line: "“You've handled harder than this.”" },
    { name: "Calm", line: "“Nothing in that feed is urgent.”" },
    { name: "Focus", line: "“The work that matters is rarely the loudest.”" },
    { name: "Motivation", line: "“It always seems impossible until it's done.”" },
  ],
  goals: ["Confidence", "Focus", "Calm", "Create", "Health", "Relationships"],
  note: "Packs are mindset nudges: quotes and affirmations, not checklists. Install once and they appear wherever you've chosen.",
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
    { title: "You stay in control", copy: "You choose what appears, where and when, and change it whenever." },
  ],
};

export const pricing = {
  eyebrow: "Pricing",
  heading: "Start free. Upgrade when it pays off.",
  copy: "Straightforward plans that scale with how seriously you want your time back.",
  plans: [
    {
      name: "Free",
      price: FREE_PRICE_DISPLAY,
      cadence: "forever",
      tagline: "Everything you need to start.",
      features: [
        "myBishBash core experience",
        "Pause before one connected app",
        "Up to 5 Personal Cards",
        "Commitment Cards",
      ],
      cta: "Join the waitlist",
      kind: "free",
    },
    {
      name: "Plus",
      price: PLUS_PRICE_DISPLAY,
      cadence: "per month",
      tagline: "For a phone that's fully yours.",
      featured: true,
      features: [
        "Pause before unlimited apps",
        "Up to 20 Personal Cards",
        "Every Pack, including new releases",
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
        "Help setting up your group",
        "Onboarding for your group",
        "Tell us what your group needs",
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
  copy: "Want it for a household, a classroom or a team? Talk to us.",
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
      a: "No. There are no hard lock-outs or timers. We add a check-in and a moment of choice before the apps you pick. You can always continue.",
    },
    {
      q: "How is this different from screen-time settings?",
      a: "Screen-time tools measure and restrict after the fact. myBishBash acts in the moment, helping you choose on purpose rather than reporting on damage that's already done.",
    },
    {
      q: "What are Personal Cards and Commitment Cards?",
      a: "Personal Cards are short recurring reminders you write yourself, answerable in a tap. Commitment Cards are a single daily intention that myBishBash checks in on, so you can mark it done.",
    },
    {
      q: "What's in a Pack?",
      a: "Packs are ready-made sets of quotes and affirmations (think confidence, calm or motivation) that appear before your chosen apps. They nudge how you think and who you're becoming, not a list of chores.",
    },
    {
      q: "Is my data private?",
      a: "Yes. myBishBash is private by design. Your reminders and choices stay yours. We don't sell them, and there's no advertising.",
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
  copy: "Invite-only for now. Join the waitlist and we'll invite people in batches.",
  primary: "Join the waitlist",
  secondary: "Join the Plus waitlist",
};
