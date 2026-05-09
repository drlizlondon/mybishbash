const TWENTY_MINUTES = 20 * 60 * 1000;
const THREE_HOURS = 3 * 60 * 60 * 1000;
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
    description: "Gentle scripture-based BishBashes for the day.",
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
    };
  }

  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
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
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 18) return "day";
  if (hour >= 18 && hour < 23) return "evening";
  return "night";
}

export function isEligible(card, date = new Date(), timeZone) {
  const todayKey = getTodayKey(date, timeZone);
  const isPackCard = Boolean(card.sourcePackId);
  if (card.paused) return false;
  if (card.disliked) return false;
  if (card.deletedAt) return false;
  if (!isPackCard && (card.doneDate === todayKey || card.statusToday === "doneToday")) return false;
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
  const windows = card.timingWindows ?? ["morning", "day", "evening"];
  if (!windows.includes(getCurrentWindow(date, timeZone))) return false;
  return true;
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

  if (card.paused) {
    return { badge: "paused", detail: "hidden for now" };
  }

  if (!isPackCard && (card.doneDate === todayKey || card.statusToday === "doneToday")) {
    return { badge: "done", detail: "see you tomorrow" };
  }

  if (!isPackCard && card.notYetUntil && new Date(card.notYetUntil).getTime() > date.getTime()) {
    return {
      badge: "pending",
      detail: `returns in ${formatTimeRemaining(new Date(card.notYetUntil).getTime() - date.getTime())}`,
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
    updated.notYetUntil = new Date(date.getTime() + THREE_HOURS).toISOString();
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

  return `bishbash-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
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
