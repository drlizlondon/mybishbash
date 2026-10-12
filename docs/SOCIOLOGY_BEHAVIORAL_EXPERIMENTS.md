# Sociology & Behavioral Psychology Architecture: Driving Real Behavior Change

*Created 2026-10-08 for myBishBash.*  
*Authored by 👑 COORDINATOR with Lizzie (Founder).*

---

## 1. Executive Summary: The Core Challenge of Habit Interception

Most habit-tracking apps fail because they operate on an idealistic model of human willpower: they assume the user opens the app in a calm, rational, reflective state (Kahneman's **System 2**).

In reality, when someone unlocks their phone and reaches for a doomscroll app (Instagram, TikTok, Twitter, Safari), they are operating in **System 1**:
- An unconscious, dopamine-primed, muscle-memory autopilot loop.
- The finger navigates to the app icon before executive attention even registers the decision.

When `myBishBash` presents an interception card, it places itself directly across the dopamine highway. This creates an immediate cognitive battle between **automatic habit loop execution** and **conscious reflection**.

---

## 2. The Behavioral Data Architecture: Measuring Attention & Retention

To change behavior, we cannot treat a "skip" as a single monolithic metric. An ignored card can mean two completely different psychological states:

```
                               Card Rendered
                                     │
                    ┌────────────────┴────────────────┐
                    ▼                                 ▼
           Dwell < 1.5 seconds               Dwell 1.5s – 8.0s
            "Reflex Skip"                   "Considered Skip"
                    │                                 │
         Unconscious Bypass                Conscious Rejection
     • Muscle memory reflex             • Prefrontal cortex engaged
     • Brain filtered out visual card   • Card read and understood
     • Habituation / sensory gating     • Friction / timing mismatch
                    │                                 │
            Solution Needed:                  Solution Needed:
        Break sensory adaptation          Lower activation energy
       (Salience / Color Shift)             ("Shrink the Action")
```

### The New Retention Telemetry Schema

Every card event (`bash_done`, `bash_not_done`, `intercept_continue_to_app`, `action_card_skipped`) now records:
- `dwell_ms`: The exact duration in milliseconds the card remained on screen prior to action.
- `dwell_bucket`:
  - Skips:
    - `reflex_skip`: `< 1,500ms` (Bypassed before cognitive absorption).
    - `considered_skip`: `1,500ms – 8,000ms` (Read and deliberated, but passed).
    - `pondered_skip`: `> 8,000ms` (High hesitation before choosing the app).
  - Completions:
    - `quick_complete`: `< 2,000ms` (Instant enthusiasm).
    - `considered_complete`: `2,000ms – 8,000ms` (Thoughtful follow-through).
    - `deep_complete`: `> 8,000ms` (Took time, completed before proceeding).

---

## 3. Experiment Spec 1: Dynamic Salience & Color Shift ("The Spiced Card Test")

### Psychological Mechanism: Sensory Habituation & Neural Gating
In sensory neuroscience, when the brain encounters a recurring stimulus with invariant visual features (same oatmeal background, same typography, same button placement), the **Reticular Activating System (RAS)** down-regulates neural firing. The stimulus is classified as "predictable background noise" and filtered out before reaching working memory.

When a card is ignored multiple times in a row, the user is often not rejecting the habit—**they literally stopped seeing it**.

### The Intervention ("Spice It Up"):
1. **Trigger Condition:**
   - Any card with $\ge 3$ consecutive skips, or an ignore rate $\ge 60\%$ over $\ge 3$ exposures.
2. **Visual Salience Shift:**
   - Background shifts from default calming oatmeal (`#F6F1EA`) to a warm terracotta/amber gradient:
     `linear-gradient(180deg, #FDF3E7 0%, #FCE7D8 50%, #F8D8C5 100%)`.
   - Contrasting terracotta accent border: `2px solid rgba(217, 101, 76, 0.35)`.
   - Card icon gently scales up ($1.08\times$) with subtle warm drop-shadow.
   - Dynamic salience badge: `🌶️ Spiced for Attention`.
   - Subtitle copy pivots from passive nudge to active interruption:
     *"Spicing this one up for you — a fresh look to catch your eye."*
3. **Hypothesis:**
   - By breaking the visual pattern, the spiced card forces an **orienting reflex**, increasing dwell time from $<1.2\text{s}$ (reflex) to $>3.0\text{s}$ (considered), resulting in a $>25\%$ lift in follow-through.

---

## 4. Experiment Spec 2: The Cognitive Friction Fork ("Shrink It")

### Psychological Mechanism: BJ Fogg Behavior Model ($B = MAP$)
A behavior occurs only when **Motivation**, **Ability**, and a **Prompt** converge at the same moment.
- If a card has high dwell time ($>2.5\text{s}$) but is consistently skipped, motivation is moderate (they stopped and read it), but **Ability is inadequate** (perceived effort is too high for the immediate context).
- Example: "Stretch for 10 minutes" shown when the user is rushing to check a train ticket will fail 100% of the time.

### The Intervention:
1. When a card has average dwell $> 2.0\text{s}$ and $\ge 2$ skips:
2. Offer a 1-tap **Micro-Alternative**:
   - Instead of binary "Done" vs "Later", offer:
     `[ ⚡ 20-Second Micro Version ]`
   - Example: "Can't do a full stretch right now? Just roll your shoulders 3 times."
3. **Hypothesis:**
   - Shrinking the activation energy converts $>35\%$ of considered skips into immediate wins without requiring the user to abort their day.

---

## 5. Experiment Spec 3: The 14-Day Honest Mirror & Zero-Guilt Action Forks

### Psychological Mechanism: Elimination of Ostrich Effect & Guilt Defeatism
Traditional habit apps use red badges, broken streaks, and guilt triggers ("You broke your 12-day streak!"). In behavioral economics, this triggers the **Ostrich Effect**: users experience ego threat, avoid looking at their stats, and ultimately uninstall the app.

`myBishBash` uses **The Honest Mirror**: radical clarity paired with zero guilt.

### The 14-Day Review Matrix:
- Compact, clean dot trail:
  - 🟢 **Emerald Green Dot:** Completed (Turned intention into real life).
  - ⚪ **Soft Sand/Grey Dot:** Skipped or quiet day (Empathetic observation, not failure).
- Toggle between **14 Days** (acute tactical view) and **30 Days** (strategic habit evolution).

### The Two-Fork Coaching Action Choice:
For every card identified in The Honest Mirror as frequently bypassed, the user is presented with two explicit, dignified choices:
1. `[ 🎯 Make it a Commitment ]`
   - Upgrades the card into a hard daily commitment with scheduled morning/evening check-in anchors.
   - For habits the user genuinely values and wants accountability for.
2. `[ ⏸️ Pause for this Season ]`
   - Sets `card.paused = true` immediately with zero penalty.
   - Empathetic copy: *"Habits exist to serve your life, not to grade you. If this isn't right for this season of your life, let it rest."*

---

## 6. Telemetry & Success Metrics Dashboard

| Metric | Target | Measurement Method |
| :--- | :--- | :--- |
| **Reflex Skip Ratio** | Reduce from $>50\%$ to $<25\%$ | Events where `dwell_ms < 1500` divided by total skips |
| **Spiced Card Dwell Lift** | $\ge +1.8\text{s}$ increase in glance duration | Difference in `avgDwellIgnoredMs` before vs after `isSpiced` activation |
| **Spiced Card Conversion** | $\ge +20\%$ completion rate | Win rate of cards after entering spiced state |
| **Honest Mirror Resolution** | $\ge 40\%$ of avoided cards resolved | Avoided cards either upgraded to Commitment or paused |
| **Doomscroll Minutes Saved** | $>15\text{ mins/day}$ | Total doorway completions $\times$ 5 minutes saved |

---

*This specification represents the active behavioral architecture implemented in `mybishbash`.*
