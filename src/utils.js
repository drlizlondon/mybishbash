const TWENTY_MINUTES = 20 * 60 * 1000;
const ONE_HOUR = 60 * 60 * 1000;
const THIRTY_MINUTES = 30 * 60 * 1000;

export const THEMES = [
  "Minimal",
  "Pop Art",
  "Soft Bloom",
  "Rainbow",
  "Starry Sky",
];

export const PACKS = [
  {
    id: "encouraging-bible-verses",
    title: "Bible Verse",
    description: "Gentle scripture-based MyBishBashes for the day.",
    theme: "Soft Bloom",
    icon: "book",
    entries: [
      {
        promptText: "Be still, and know that I am God.",
        attribution: "Psalm 46:10",
      },
      {
        promptText: "Cast all your anxiety on him because he cares for you.",
        attribution: "1 Peter 5:7",
      },
      {
        promptText: "Come to me, all you who are weary and burdened, and I will give you rest.",
        attribution: "Matthew 11:28",
      },
      {
        promptText: "The Lord will fight for you; you need only to be still.",
        attribution: "Exodus 14:14",
      },
      {
        promptText: "Let the peace of Christ rule in your hearts.",
        attribution: "Colossians 3:15",
      },
    ],
  },
  {
    id: "motivational-quotes",
    title: "Motivational Quote",
    description: "Soft little pushes when energy dips.",
    theme: "Pop Art",
    icon: "quote",
    entries: [
      {
        promptText: "Start where you are. Use what you have. Do what you can.",
        attribution: "Arthur Ashe",
      },
      {
        promptText: "Great things are done by a series of small things brought together.",
        attribution: "Vincent van Gogh",
      },
      {
        promptText: "It always seems impossible until it’s done.",
        attribution: "Nelson Mandela",
      },
      {
        promptText: "Small deeds done are better than great deeds planned.",
        attribution: "Peter Marshall",
      },
      {
        promptText: "Action is a great restorer and builder of confidence.",
        attribution: "Norman Vincent Peale",
      },
    ],
  },
  {
    id: "commitment-starters",
    title: "Commitment Starters",
    description: "Simple commitment templates you can make your own.",
    theme: "Minimal",
    icon: "star",
    contentType: "commitments",
    entries: [
      {
        id: "walk-today",
        promptText: "go for a walk today",
        attribution: "A small reset for body and mind.",
        commitmentDefaults: {
          commitmentReason: "A small reset for body and mind.",
          commitmentTimingMode: "day",
        },
      },
      {
        id: "no-snacks-after-dinner",
        promptText: "not eat snacks after dinner",
        attribution: "Evening routines feel easier when they are decided in advance.",
        commitmentDefaults: {
          commitmentReason: "Evening routines feel easier when they are decided in advance.",
          commitmentTimingMode: "evening",
          commitmentCheckInEnabled: true,
          commitmentCheckInTime: "20:30",
        },
      },
      {
        id: "patient-with-children",
        promptText: "be patient with the children",
        attribution: "A cue for steadiness when the house gets loud.",
        commitmentDefaults: {
          commitmentReason: "A cue for steadiness when the house gets loud.",
          commitmentTimingMode: "anytime",
        },
      },
    ],
  },
  {
    id: "healthier-daily-basics",
    title: "Healthier Daily Basics",
    description: "Practical reminders for water, food, movement and basic care.",
    theme: "Minimal",
    icon: "heart",
    entries: [
      { promptText: "Have you drunk a glass of water today?" },
      { promptText: "Have you eaten vegetables today?" },
      { promptText: "Have you moved your body today?" },
      { promptText: "Have you taken your vitamins today?" },
      { promptText: "Have you been outside today?" },
    ],
  },
  {
    id: "better-bedtime",
    title: "Better Bedtime",
    description: "A setup for winding down before your phone keeps you up.",
    theme: "Starry Sky",
    icon: "moon",
    entries: [
      { promptText: "Have you started winding down?" },
      { promptText: "Have you put your phone away for bedtime?" },
      { promptText: "Have you brushed your teeth before getting too tired?" },
      { promptText: "Have you charged your phone away from the bed?" },
      { promptText: "Have you got into bed on time?" },
    ],
  },
  {
    id: "stop-being-late",
    title: "Stop Being Late",
    description: "Small phone cues for leaving on time and reducing morning scramble.",
    theme: "Pop Art",
    icon: "star",
    entries: [
      { promptText: "Have you checked what time you need to leave?" },
      { promptText: "Have you packed your bag?" },
      { promptText: "Have you put your keys somewhere obvious?" },
      { promptText: "Have you checked the route?" },
      { promptText: "Have you left 10 minutes earlier than usual?" },
    ],
  },
  {
    id: "more-present-with-my-people",
    title: "More Present With My People",
    description: "Cues for giving attention to the people in front of you.",
    theme: "Soft Bloom",
    icon: "heart",
    entries: [
      { promptText: "Have you put your phone down during dinner?" },
      { promptText: "Have you given someone your full attention today?" },
      { promptText: "Have you messaged someone you care about?" },
      { promptText: "Have you told your partner you love them today?" },
      { promptText: "Have you had a proper conversation today?" },
    ],
  },
  {
    id: "be-more-confident",
    title: "Be More Confident",
    description: "Concrete reminders for posture, voice and small brave actions.",
    theme: "Rainbow",
    icon: "star",
    entries: [
      { promptText: "Have you stood up straight today?" },
      { promptText: "Have you spoken clearly today?" },
      { promptText: "Have you said what you actually think?" },
      { promptText: "Have you worn something that makes you feel good?" },
      { promptText: "Have you done one small brave thing today?" },
    ],
  },
  {
    id: "faith-and-steadiness",
    title: "Faith and Steadiness",
    description: "A faith-centred setup for prayer, scripture and steadier reactions.",
    theme: "Minimal",
    icon: "book",
    entries: [
      { promptText: "Have you prayed today?" },
      { promptText: "Have you read your Bible today?" },
      { promptText: "Have you had a quiet moment with God today?" },
      { promptText: "Have you listened to something uplifting today?" },
      { promptText: "Have you reflected before reacting?" },
    ],
  },
  {
    id: "feel-more-put-together",
    title: "Feel More Put Together",
    description: "Useful prompts for the small standards that help you feel ready.",
    theme: "Soft Bloom",
    icon: "heart",
    entries: [
      { promptText: "Have you washed your face today?" },
      { promptText: "Have you moisturised today?" },
      { promptText: "Have you put SPF on today?" },
      { promptText: "Have you flossed today?" },
      { promptText: "Have you put on something that makes you feel good?" },
    ],
  },
  {
    id: "phone-use-reality-check",
    title: "Phone Use Reality Check",
    description: "A practical check before your phone use turns automatic.",
    theme: "Minimal",
    icon: "star",
    entries: [
      { promptText: "Do you actually want to open this app right now?" },
      { promptText: "Are you opening this app for a reason?" },
      { promptText: "Could this wait until later?" },
      { promptText: "Are you choosing this, or did your thumb just take you here?" },
      { promptText: "Is this helping what you meant to do?" },
    ],
  },
  {
    id: "extraordinary-lives",
    title: "Extraordinary Lives",
    description: "Real lives, real sources, small moments that widen the day.",
    theme: "Soft Bloom",
    icon: "star",
    entries: [
      {
        promptText: "The best and most beautiful things in the world cannot be seen nor even touched, but just felt in the heart.",
        attribution: "Helen Keller",
        sourceTitle: "The Story of My Life",
        sourceUrl: "https://www.gutenberg.org/cache/epub/2397/pg2397-images.html",
      },
      {
        promptText: "One can never consent to creep when one feels an impulse to soar.",
        attribution: "Helen Keller",
        sourceTitle: "The Story of My Life",
        sourceUrl: "https://www.gutenberg.org/files/2397/2397-h/2397-h.htm",
      },
      {
        promptText: "There was no light in my soul. This wonderful world with all its sunlight and beauty was hidden from me.",
        attribution: "Helen Keller",
        sourceTitle: "The Story of My Life",
        sourceUrl: "https://www.gutenberg.org/cache/epub/2397/pg2397-images.html",
      },
    ],
  },
  {
    id: "missionary-stories",
    title: "Missionary Stories",
    description: "True fragments of distance, service, doubt, and resolve.",
    entries: [],
    theme: "Starry Sky",
    comingSoon: true,
  },
  {
    id: "letters-from-another-era",
    title: "Letters From Another Era",
    description: "Short, sourced voices carried forward from older worlds.",
    theme: "Minimal",
    icon: "quote",
    entries: [
      {
        promptText: "Nothing ever becomes real till it is experienced.",
        attribution: "John Keats",
        sourceTitle: "Letters of John Keats to His Family and Friends",
        sourceUrl: "https://www.gutenberg.org/ebooks/35698.html.images",
      },
      {
        promptText: "I am certain of nothing but of the holiness of the Heart's affections, and the truth of Imagination.",
        attribution: "John Keats",
        sourceTitle: "Letters of John Keats to His Family and Friends",
        sourceUrl: "https://www.gutenberg.org/ebooks/35698.html.images",
      },
      {
        promptText: "O for a life of sensations rather than of thoughts!",
        attribution: "John Keats",
        sourceTitle: "Letters of John Keats to His Family and Friends",
        sourceUrl: "https://www.gutenberg.org/ebooks/35698.html.images",
      },
    ],
  },
  {
    id: "human-courage",
    title: "Human Courage",
    description: "Documented moments of steadiness under pressure.",
    entries: [],
    theme: "Pop Art",
    comingSoon: true,
  },
  {
    id: "last-words-and-final-reflections",
    title: "Last Words & Final Reflections",
    description: "Carefully sourced final statements and closing thoughts.",
    entries: [],
    theme: "Soft Bloom",
    comingSoon: true,
  },
  {
    id: "monastery-mind",
    title: "Monastery Mind",
    description: "Monastic writing, silence, order, and interior attention.",
    theme: "Minimal",
    icon: "leaf",
    entries: [
      {
        promptText: "The time of business does not with me differ from the time of prayer.",
        attribution: "Brother Lawrence",
        sourceTitle: "The Practice of the Presence of God",
        sourceUrl: "https://www.gutenberg.org/ebooks/13871.html.images",
      },
      {
        promptText: "We need only to recognize God intimately present with us and address ourselves to Him every moment.",
        attribution: "Brother Lawrence",
        sourceTitle: "The Practice of the Presence of God",
        sourceUrl: "https://www.gutenberg.org/ebooks/13871.html.images",
      },
      {
        promptText: "I made this my business... every hour, every minute, even in the height of my work.",
        attribution: "Brother Lawrence",
        sourceTitle: "The Practice of the Presence of God",
        sourceUrl: "https://www.gutenberg.org/ebooks/13871.html.images",
      },
    ],
  },
  {
    id: "tiny-awe",
    title: "Tiny Awe",
    description: "Verified facts and moments that make the world feel larger.",
    theme: "Rainbow",
    icon: "star",
    entries: [
      {
        promptText: "The Moon is slowly moving away from Earth, getting about an inch farther away each year.",
        attribution: "NASA",
        sourceTitle: "Earth's Moon: In Depth",
        sourceUrl: "https://solarsystem.nasa.gov/moons/earths-moon/in-depth.amp",
      },
      {
        promptText: "Our galaxy sits in a Local Group of more than 20 galaxies.",
        attribution: "NASA",
        sourceTitle: "Hubble's Galaxies",
        sourceUrl: "https://science.nasa.gov/mission/hubble/science/universe-uncovered/hubble-galaxies/",
      },
      {
        promptText: "The Moon's far side gets as much sunlight as its near side.",
        attribution: "NASA",
        sourceTitle: "Earth's Moon",
        sourceUrl: "https://science.nasa.gov/moon/",
      },
    ],
  },
  {
    id: "the-weight-of-time",
    title: "The Weight of Time",
    description: "Historically grounded reminders of scale, age, and passing.",
    entries: [],
    theme: "Soft Bloom",
    comingSoon: true,
  },
  {
    id: "before-smartphones",
    title: "Before Smartphones",
    description: "Everyday life before constant notification, told from sources.",
    entries: [],
    theme: "Pop Art",
    comingSoon: true,
  },
  {
    id: "soft-convictions",
    title: "Soft Convictions",
    description: "Firm but gentle voices from letters, essays, and memoirs.",
    theme: "Minimal",
    icon: "quote",
    entries: [
      {
        promptText: "I most sincerely wish that some more liberal plan might be laid and executed for the benefit of the rising generation.",
        attribution: "Abigail Adams",
        sourceTitle: "Familiar Letters of John Adams and His Wife Abigail Adams During the Revolution",
        sourceUrl: "https://www.gutenberg.org/ebooks/34123.html.images",
      },
      {
        promptText: "Do not put such unlimited power into the hands of the husbands.",
        attribution: "Abigail Adams",
        sourceTitle: "Familiar Letters of John Adams and His Wife Abigail Adams During the Revolution",
        sourceUrl: "https://www.gutenberg.org/ebooks/34123.html.images",
      },
      {
        promptText: "I long earnestly for a Saturday evening.",
        attribution: "Abigail Adams",
        sourceTitle: "Familiar Letters of John Adams and His Wife Abigail Adams During the Revolution",
        sourceUrl: "https://www.gutenberg.org/ebooks/34123.html.images",
      },
    ],
  },
  {
    id: "motherhood-through-time",
    title: "Motherhood Through Time",
    description: "Sourced glimpses of care, strain, love, and endurance.",
    entries: [],
    theme: "Soft Bloom",
    comingSoon: true,
  },
];

export const TIME_WINDOWS = [
  { id: "morning", label: "Morning" },
  { id: "day", label: "During the day" },
  { id: "evening", label: "Evening" },
  { id: "night", label: "At night" },
];

/** Default hour boundaries for each time window (24-hour, inclusive start, exclusive end). */
export const DEFAULT_WINDOW_DEFS = [
  { id: "morning", label: "Morning",       start: 5,  end: 12 },
  { id: "day",     label: "During the day", start: 12, end: 18 },
  { id: "evening", label: "Evening",       start: 18, end: 23 },
  { id: "night",   label: "At night",      start: 23, end: 5  }, // wraps midnight
];

/**
 * Validates a window-defs array.  Returns true only when the value is an array
 * of exactly 4 items each with a matching id, numeric start/end in [0,23].
 */
export function isValidWindowDefs(defs) {
  const REQUIRED_IDS = ["morning", "day", "evening", "night"];
  if (!Array.isArray(defs) || defs.length !== 4) return false;
  return defs.every(
    (d, i) =>
      d &&
      d.id === REQUIRED_IDS[i] &&
      typeof d.start === "number" &&
      typeof d.end === "number" &&
      d.start >= 0 && d.start <= 23 &&
      d.end >= 0 && d.end <= 23 &&
      d.start !== d.end,
  );
}

// Module-level singleton — set once on boot and updated whenever the user saves prefs.
let _activeWindowDefs = DEFAULT_WINDOW_DEFS;

/** Replace the active window definitions used by getCurrentWindow. */
export function setWindowDefs(defs) {
  _activeWindowDefs = isValidWindowDefs(defs) ? defs : DEFAULT_WINDOW_DEFS;
}

/** Return the current active window definitions. */
export function getWindowDefs() {
  return _activeWindowDefs;
}

export const FREQUENCY_OPTIONS = [
  { id: "once_daily", label: "Once a day" },
  { id: "multi_daily", label: "More than once a day" },
];

export const ICON_OPTIONS = [
  { id: "heart", label: "Heart" },
  { id: "water", label: "Water" },
  { id: "moon", label: "Moon" },
  { id: "flower", label: "Flower" },
  { id: "leaf", label: "Leaf" },
  { id: "book", label: "Book" },
  { id: "quote", label: "Quote" },
  { id: "star", label: "Star" },
];

export const COMPLETION_PHRASES = [
  "nice one",
  "good choice",
  "love that",
  "done",
  "see you tomorrow",
];

function getDateContext(date = new Date(), timeZone) {
  if (!timeZone) {
    return {
      year: date.getFullYear(),
      month: date.getMonth() + 1,
    day: date.getDate(),
    hour: date.getHours(),
    minute: date.getMinutes(),
  };
  }

  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
  };
}

export function getTodayKey(date = new Date(), timeZone) {
  const context = getDateContext(date, timeZone);
  const year = context.year;
  const month = String(context.month).padStart(2, "0");
  const day = String(context.day).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getGreeting(date = new Date(), timeZone) {
  const { hour } = getDateContext(date, timeZone);
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 18) return "Good afternoon";
  if (hour >= 18 && hour < 24) return "Good evening";
  return "Still awake?";
}

export function getCurrentWindow(date = new Date(), timeZone) {
  const { hour } = getDateContext(date, timeZone);
  for (const def of _activeWindowDefs) {
    if (def.start < def.end) {
      // Normal window (e.g. morning 5–12)
      if (hour >= def.start && hour < def.end) return def.id;
    } else {
      // Midnight-crossing window (e.g. night 23–5)
      if (hour >= def.start || hour < def.end) return def.id;
    }
  }
  // Fallback — should never occur if defs form a complete 24-hour partition.
  return _activeWindowDefs[_activeWindowDefs.length - 1].id;
}

function getTimeOfDayMinutes(date = new Date(), timeZone) {
  const context = getDateContext(date, timeZone);
  return context.hour * 60 + context.minute;
}

export function parseTimeStringToMinutes(value) {
  if (typeof value !== "string") return null;
  const match = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return hour * 60 + minute;
}

export function getCommitmentCheckInId(card, date = new Date(), timeZone) {
  return `checkin:${card.id}:${getTodayKey(date, timeZone)}`;
}

export function getCommitmentEncouragementId(card, date = new Date(), timeZone) {
  return `encouragement:${card.id}:${getTodayKey(date, timeZone)}`;
}

export function getCommitmentReviewId(card, date = new Date(), timeZone) {
  return `review:${card.id}:${getTodayKey(date, timeZone)}`;
}

export function isCommitmentCheckInCard(card) {
  return card?.cardKind === "commitment_check_in";
}

export function isCommitmentEncouragementCard(card) {
  return card?.cardKind === "commitment_encouragement";
}

export function isCommitmentReviewCard(card) {
  return card?.cardKind === "commitment_review";
}

const COMMITMENT_DASHBOARD_TITLE = "Today’s Commitment";
const COMMITMENT_COMPATIBILITY_FIELDS = [
  "commitmentReason",
  "commitmentTimingMode",
  "commitmentStartWindow",
  "commitmentCustomStartTime",
  "commitmentCustomEndTime",
  "commitmentCheckInEnabled",
  "commitmentCheckInTime",
  "commitmentStatusToday",
  "commitmentDecisionDate",
  "commitmentDecisionAt",
  "commitmentLifecycleStatus",
  "commitmentCheckInShownDate",
  "commitmentEncouragementRequestedDate",
  "commitmentEncouragementCompletedDate",
  "commitmentClosedEarlyDate",
  "commitmentReviewDueDate",
  "commitmentReviewResponse",
  "commitmentReviewResponseDate",
  "commitmentFinalOutcome",
];

export function isCommitmentLikeCard(card) {
  if (!card || card.sourcePackId) return false;
  if (card.cardKind === "commitment") return true;
  if (card.dashboardTitle === COMMITMENT_DASHBOARD_TITLE) return true;
  return COMMITMENT_COMPATIBILITY_FIELDS.some((field) => Object.prototype.hasOwnProperty.call(card, field));
}

export function isCommitmentCheckInEligible(card, date = new Date(), timeZone) {
  if (!card || card.sourcePackId) return false;
  if (!isCommitmentLikeCard(card)) return false;
  if (card.paused || card.disliked || card.deletedAt) return false;
  if (!card.commitmentCheckInEnabled || !card.commitmentCheckInTime) return false;

  const todayKey = getTodayKey(date, timeZone);
  if (card.commitmentStatusToday !== "made" || card.commitmentDecisionDate !== todayKey) return false;
  if (card.commitmentLifecycleStatus === "closed_early" || card.commitmentLifecycleStatus === "reviewed") return false;
  if (card.commitmentCheckInResponseDate === todayKey) return false;
  if (card.commitmentCheckInShownDate === todayKey) return false;

  const checkInMinutes = parseTimeStringToMinutes(card.commitmentCheckInTime);
  if (checkInMinutes == null) return false;
  return getTimeOfDayMinutes(date, timeZone) >= checkInMinutes;
}

export function buildCommitmentCheckInCard(card, date = new Date(), timeZone) {
  return {
    id: getCommitmentCheckInId(card, date, timeZone),
    cardKind: "commitment_check_in",
    parentCommitmentCardId: card.id,
    promptText: card.promptText,
    dashboardTitle: "Check-in",
    theme: card.theme,
    icon: card.icon ?? "heart",
    statusToday: "fresh",
    createdAt: card.commitmentDecisionAt ?? card.createdAt,
    updatedAt: card.updatedAt,
    lastShownAt: null,
    notYetUntil: null,
    doneDate: null,
    frequency: "once_daily",
    timingWindows: ["morning", "day", "evening", "night"],
    paused: false,
    disliked: false,
    deletedAt: null,
    sourcePackId: null,
  };
}

export function isCommitmentEncouragementEligible(card, date = new Date(), timeZone) {
  if (!card || card.sourcePackId) return false;
  if (!isCommitmentLikeCard(card)) return false;
  if (card.paused || card.disliked || card.deletedAt) return false;
  const todayKey = getTodayKey(date, timeZone);
  return (
    card.commitmentStatusToday === "made" &&
    card.commitmentDecisionDate === todayKey &&
    card.commitmentCheckInResponseDate === todayKey &&
    card.commitmentCheckInResponse === "somewhat_on_track" &&
    card.commitmentEncouragementRequestedDate === todayKey &&
    card.commitmentEncouragementCompletedDate !== todayKey &&
    card.commitmentLifecycleStatus !== "closed_early" &&
    card.commitmentLifecycleStatus !== "reviewed"
  );
}

export function buildCommitmentEncouragementCard(card, date = new Date(), timeZone) {
  return {
    id: getCommitmentEncouragementId(card, date, timeZone),
    cardKind: "commitment_encouragement",
    parentCommitmentCardId: card.id,
    promptText: "You said you wanted to do this.",
    dashboardTitle: "Commitment reminder",
    commitmentText: card.promptText,
    theme: card.theme,
    icon: card.icon ?? "heart",
    statusToday: "fresh",
    createdAt: card.commitmentCheckInResponseAt ?? card.updatedAt,
    updatedAt: card.updatedAt,
    lastShownAt: null,
    notYetUntil: null,
    doneDate: null,
    frequency: "once_daily",
    timingWindows: ["morning", "day", "evening", "night"],
    paused: false,
    disliked: false,
    deletedAt: null,
    sourcePackId: null,
  };
}

export function isCommitmentReviewEligible(card, date = new Date(), timeZone) {
  if (!card || card.sourcePackId) return false;
  if (!isCommitmentLikeCard(card)) return false;
  if (card.paused || card.disliked || card.deletedAt) return false;
  const todayKey = getTodayKey(date, timeZone);
  return (
    card.commitmentStatusToday === "made" &&
    card.commitmentDecisionDate === todayKey &&
    card.commitmentCheckInResponseDate === todayKey &&
    card.commitmentReviewDueDate === todayKey &&
    card.commitmentReviewResponseDate !== todayKey &&
    card.commitmentLifecycleStatus !== "closed_early" &&
    card.commitmentLifecycleStatus !== "reviewed" &&
    (!card.commitmentEncouragementRequestedDate || card.commitmentEncouragementCompletedDate === todayKey)
  );
}

export function buildCommitmentReviewCard(card, date = new Date(), timeZone) {
  return {
    id: getCommitmentReviewId(card, date, timeZone),
    cardKind: "commitment_review",
    parentCommitmentCardId: card.id,
    promptText: card.promptText,
    dashboardTitle: "Commitment review",
    theme: card.theme,
    icon: card.icon ?? "heart",
    statusToday: "fresh",
    createdAt: card.commitmentDecisionAt ?? card.createdAt,
    updatedAt: card.updatedAt,
    lastShownAt: null,
    notYetUntil: null,
    doneDate: null,
    frequency: "once_daily",
    timingWindows: ["morning", "day", "evening", "night"],
    paused: false,
    disliked: false,
    deletedAt: null,
    sourcePackId: null,
  };
}

export function buildEligibleCommitmentLifecycleCards(cards = [], date = new Date(), timeZone) {
  return [
    ...cards
      .filter((card) => isCommitmentEncouragementEligible(card, date, timeZone))
      .map((card) => buildCommitmentEncouragementCard(card, date, timeZone)),
    ...cards
      .filter((card) => isCommitmentReviewEligible(card, date, timeZone))
      .map((card) => buildCommitmentReviewCard(card, date, timeZone)),
    ...cards
      .filter((card) => isCommitmentCheckInEligible(card, date, timeZone))
      .map((card) => buildCommitmentCheckInCard(card, date, timeZone)),
  ];
}

export function buildEligibleCommitmentCheckInCards(cards = [], date = new Date(), timeZone) {
  return buildEligibleCommitmentLifecycleCards(cards, date, timeZone)
    .filter((card) => isCommitmentCheckInCard(card));
}

function isWithinCustomTimeWindow(card, date = new Date(), timeZone) {
  if (card.commitmentTimingMode !== "custom") return true;
  const start = parseTimeStringToMinutes(card.commitmentCustomStartTime);
  const end = parseTimeStringToMinutes(card.commitmentCustomEndTime);
  if (start == null || end == null) return false;
  const current = getTimeOfDayMinutes(date, timeZone);
  if (start === end) return true;
  if (start < end) return current >= start && current <= end;
  return current >= start || current <= end;
}

function wasCardDoneToday(card, todayKey) {
  if (card.doneDate === todayKey) return true;
  if (card.doneDate && card.doneDate !== todayKey) return false;
  return card.statusToday === "doneToday";
}

export function isEligible(card, date = new Date(), timeZone) {
  const todayKey = getTodayKey(date, timeZone);
  const isPackCard = Boolean(card.sourcePackId);
  const isCommitmentCard = isCommitmentLikeCard(card);
  if (card.paused) return false;
  if (card.disliked) return false;
  if (card.deletedAt) return false;
  if (!isPackCard && isCommitmentCard && card.commitmentDecisionDate === todayKey) return false;
  if (!isPackCard && wasCardDoneToday(card, todayKey)) return false;
  if (
    !isPackCard &&
    card.lastShownAt &&
    new Date(card.lastShownAt).getTime() + THIRTY_MINUTES > date.getTime()
  ) {
    return false;
  }
  if (!isPackCard && card.notYetUntil && new Date(card.notYetUntil).getTime() > date.getTime()) {
    return false;
  }
  if (!isPackCard && isCommitmentCard && !isWithinCustomTimeWindow(card, date, timeZone)) return false;
  const windows = card.timingWindows ?? ["morning", "day", "evening"];
  if (!windows.includes(getCurrentWindow(date, timeZone))) return false;
  return true;
}

export function isPackCardAvailable(card) {
  return Boolean(card?.sourcePackId) && !card.deletedAt && !card.paused && !card.disliked && !card.hidden;
}

export function normalizeCards(cards, date = new Date(), timeZone) {
  const todayKey = getTodayKey(date, timeZone);

  return cards.map((card) => {
    const next = { ...card };

    if (!next.createdAt) {
      next.createdAt = new Date().toISOString();
    }

    if (!next.updatedAt) {
      next.updatedAt = next.createdAt;
    }

    if (!("deletedAt" in next)) {
      next.deletedAt = null;
    }

    if (!Array.isArray(next.timingWindows) || next.timingWindows.length === 0) {
      next.timingWindows = ["morning", "day", "evening"];
    }
    if (!next.frequency) {
      next.frequency = "once_daily";
    }
    if (isCommitmentLikeCard(next)) {
      next.cardKind = "commitment";
      next.dashboardTitle = COMMITMENT_DASHBOARD_TITLE;
      next.commitmentReason = next.commitmentReason ?? "";
      next.commitmentTimingMode = next.commitmentTimingMode ?? "anytime";
      next.commitmentStartWindow = next.commitmentStartWindow ?? next.commitmentTimingMode ?? "anytime";
      next.commitmentCustomStartTime = next.commitmentCustomStartTime ?? "";
      next.commitmentCustomEndTime = next.commitmentCustomEndTime ?? "";
      next.commitmentCheckInEnabled = Boolean(next.commitmentCheckInEnabled);
      next.commitmentCheckInTime = next.commitmentCheckInTime ?? "";
      next.commitmentCheckInPendingDate = next.commitmentCheckInPendingDate ?? null;
      next.commitmentCheckInResponse = next.commitmentCheckInResponse ?? null;
      next.commitmentCheckInResponseDate = next.commitmentCheckInResponseDate ?? null;
      next.commitmentCheckInResponseAt = next.commitmentCheckInResponseAt ?? null;
      if (next.commitmentDecisionDate !== todayKey) {
        next.commitmentStatusToday = null;
      }
      if (next.commitmentCheckInPendingDate !== todayKey) {
        next.commitmentCheckInPendingDate = null;
      }
      if (next.commitmentCheckInResponseDate !== todayKey) {
        next.commitmentCheckInResponse = null;
        next.commitmentCheckInResponseDate = null;
        next.commitmentCheckInResponseAt = null;
      }
    }
    if (typeof next.disliked !== "boolean") {
      next.disliked = false;
    }
    if (next.deleted === true && !next.deletedAt) {
      next.deletedAt = next.updatedAt || new Date().toISOString();
    }
    delete next.deleted;
    if (next.doneDate !== todayKey && next.statusToday === "doneToday") {
      next.statusToday = "fresh";
    }
    if (next.notYetUntil && new Date(next.notYetUntil).getTime() <= date.getTime()) {
      next.notYetUntil = null;
      if (next.statusToday === "pending") {
        next.statusToday = "fresh";
      }
    }
    return next;
  });
}

export function pickRandomEligible(cards, date = new Date()) {
  const eligible = cards.filter((card) => isEligible(card, date));
  if (eligible.length === 0) return null;
  const index = Math.floor(Math.random() * eligible.length);
  return eligible[index];
}

export function getStatusMeta(card, date = new Date(), timeZone) {
  const todayKey = getTodayKey(date, timeZone);
  const currentWindow = getCurrentWindow(date, timeZone);
  const windows = card.timingWindows ?? ["morning", "day", "evening"];
  const isPackCard = Boolean(card.sourcePackId);
  const isCommitmentCard = isCommitmentLikeCard(card);

  if (card.paused) {
    return { badge: "paused", detail: "hidden for now" };
  }

  if (isPackCard && (card.deletedAt || card.disliked)) {
    return { badge: "paused", detail: "hidden for now" };
  }

  if (!isPackCard && isCommitmentCard && card.commitmentDecisionDate === todayKey) {
    return card.commitmentStatusToday === "declined"
      ? { badge: "done", detail: "not committed today" }
      : { badge: "done", detail: "committed today" };
  }

  if (!isPackCard && wasCardDoneToday(card, todayKey)) {
    return { badge: "done", detail: "see you tomorrow" };
  }

  if (!isPackCard && card.notYetUntil && new Date(card.notYetUntil).getTime() > date.getTime()) {
    return {
      badge: "pending",
      detail: `returns in ${formatTimeRemaining(new Date(card.notYetUntil).getTime() - date.getTime())}`,
    };
  }

  if (isPackCard) {
    return { badge: "ready", detail: "available from active pack" };
  }

  if (!isPackCard && isCommitmentCard && !isWithinCustomTimeWindow(card, date, timeZone)) {
    return {
      badge: "upcoming",
      detail: "waits for custom time",
    };
  }

  if (!windows.includes(currentWindow)) {
    return {
      badge: "upcoming",
      detail: `waits for ${formatWindowList(windows)}`,
    };
  }

  return { badge: "ready", detail: "may appear today" };
}

export function getHomeSortRank(card) {
  const windows = card.timingWindows ?? ["morning", "day", "evening"];
  const hasMorning = windows.includes("morning");
  const hasDay = windows.includes("day");
  const hasEvening = windows.includes("evening");
  const hasNight = windows.includes("night");

  if (card.frequency === "multi_daily" && hasMorning && hasEvening && !hasNight) {
    return 0;
  }

  if (card.frequency === "once_daily" && hasMorning && !hasDay && !hasEvening) {
    return 1;
  }

  if (card.frequency === "once_daily" && hasDay && !hasMorning && !hasEvening) {
    return 2;
  }

  if (card.frequency === "once_daily" && hasEvening && !hasMorning && !hasDay) {
    return 3;
  }

  return 4;
}

export function applyCardAction(card, action, date = new Date(), timeZone) {
  const updated = {
    ...card,
    lastShownAt: date.toISOString(),
    updatedAt: date.toISOString(),
  };

  if (action === "now") {
    updated.statusToday = "pending";
    updated.notYetUntil = new Date(date.getTime() + TWENTY_MINUTES).toISOString();
    return updated;
  }

  if (action === "later") {
    updated.statusToday = "pending";
    updated.notYetUntil = new Date(date.getTime() + ONE_HOUR).toISOString();
    return updated;
  }

  updated.statusToday = "doneToday";
  updated.notYetUntil = null;
  updated.doneDate = getTodayKey(date, timeZone);
  return updated;
}

export function formatTimeRemaining(ms) {
  const minutes = Math.max(1, Math.round(ms / 60000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (remainder === 0) return `${hours}h`;
  return `${hours}h ${remainder}m`;
}

export function getThemeClass(theme) {
  if (theme === "Paper Cut") return "soft-bloom";
  return theme.toLowerCase().replace(/\s+/g, "-");
}

export function createId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `mybishbash-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function formatWindowList(windows) {
  const labels = windows.map((windowId) => TIME_WINDOWS.find((item) => item.id === windowId)?.label ?? windowId);
  return labels.join(", ");
}

export function buildCardsFromPack(pack) {
  const now = new Date().toISOString();
  return pack.entries.map((entry) => ({
    id: createId(),
    promptText: entry.promptText,
    attribution: entry.attribution,
    dashboardTitle: pack.title,
    theme: pack.theme,
    icon: pack.icon ?? "heart",
    statusToday: "fresh",
    createdAt: now,
    updatedAt: now,
    lastShownAt: null,
    notYetUntil: null,
    doneDate: null,
    frequency: "once_daily",
    timingWindows: ["morning", "day", "evening"],
    paused: false,
    disliked: false,
    deletedAt: null,
    sourcePackId: pack.id,
  }));
}
