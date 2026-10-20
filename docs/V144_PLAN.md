# v1.4.4 additions — plan, 2026-10-20

Source: Yuhan's requests of 2026-10-20 and her original design doc
(`docs/.dating-simulator.txt`, gitignored, private). v1.4.4 is bumped on `dev` and not released;
everything here ships in the same release. **No big new features**: fixes and improvements only.
Player-side social posting (design doc §八) is deferred.

Status: **PROPOSED, waiting for Yuhan's confirmation.** Nothing below is implemented.

---

## What the analysis found (read the rendered prompt, not the request)

Read against `test/fixtures/chaebol-zh.txt` and the four world files.

### F1. The new employee calls Irene 欧尼 because the prompt says to, twice as loudly

Each member's **Address** line is computed from birth year alone:
`安添 -> "Irene欧尼"`. The work title (`代表nim`) is one sentence in section 6's REGISTER block,
labelled "Work override", far from the member it applies to. A specific per-member line beats a
general note somewhere else; this repo has seen that failure five times. REGISTER also says the
age direction "NEVER reverses, at any affection level" and that a near-age member "is already
casual while the score is still low", which is the opposite of what Yuhan wants.

### F2. Irene is caring on day one because the background tells her to be

The `lawyer` (新人职员) background, which Yuhan approved on 2026-10-20, says
`集团继承人{name}似乎有意或无意地关照你` and lists typical events: afternoon tea sent to your
desk, she covers for your mistake, she takes you to a society event. Nothing says those happen
**later**. Most other backgrounds list "typical events" the same way, so this is a general
defect, not just this identity's. **The Chinese is Yuhan's.** The fix proposed is an English
rule (P3), not an edit to her text. She may also want to reword the line.

### F3. Stage names mean nothing to the model's behaviour

Section 9 lists `0-15 陌生人 … 91-100 考验期` as names and ranges only. The design doc's §九 gives
each stage a **behaviour** ("陌生人: only politeness, brief help, work contact"), plus the
prohibitions "禁止让成员无缘无故喜欢上玩家" and "禁止跳过暧昧过程". None of that reaches the
prompt.

### F4. 起承转合 is in the prompt, but unlabelled, with no beats and no "you are here"

Section 3 prints all four phase lines every round. The model has to work out which one applies
from `Round:` in the tail. The design doc's end-of-phase beats ("成员第一次主动记住玩家的名字",
"一次小危机") are missing. `getChapterByRound` already computes the chapter and shows it in the
stats box, but **never tells the model**.

### F5. Affection can outrun the phase

The main member starts at 12 (Stranger ends at 15), the prompt asks for ±1..±10 per round, and
the clamp is ±8. So round 1 can already reach 有印象 and round 3 产生兴趣, inside a phase that
says "No romantic moves". Nothing ties the rate to the phase.

### F6. The chaebol cast is several families, in both templates

`castLore.composed`: "each of them an heir of a **different** chaebol house". `castLore.subset`
(the classic door): "heirs of chaebol houses". This is the blur Yuhan sees.

### F7. Smaller ones found on the way

- **The new-employee `because`** says "every member of the circle is an heir she is expected to
  defer to". Per Yuhan, they are the company's **executives**.
- **Stage names in non-idol worlds.** Yuhan's example address is `珠泫xi`, a Korean given name,
  but every Address line uses the stage name (`Irene`). A chaebol daughter named "Winter" reads
  oddly. See open question Q2.
- **No point-of-view rule.** The design doc forbids showing other characters' inner thoughts
  (无上帝视角). The prompt does not say this.
- **No appearance rule.** The design doc's core requirement is that every round renders the
  member's outfit, hair, makeup, expression and gestures. The current style line only says
  "sensory details".

---

## Proposed changes, one commit each

| # | Change | Where | Cache | Goldens |
| --- | --- | --- | --- | --- |
| P1 | Address ladder by affection stage | `mainAgent.js` Address line + REGISTER rewrite | static, fixed at setup | all 6 move |
| P2 | Stage behaviour + 起承转合 beats | section 9, world `phases` (English), tail `[Chapter]` | rule static, fact in tail | all 6 move |
| P3 | "Typical events are spread across the run" rule | section 6 ROLE CONTRACT | static | all 6 move |
| P4 | Affection rate tied to the phase | `validateAndFixOutput` clamp, by chapter | none | none |
| P5 | Chaebol = one family; per-world cast/player positions | `chaebol` castLore (en text), `because` | static | `chaebol-zh` moves |
| P6 | Opening narrator prologue, round 1 only | `buildTailRules` (tail) | none (tail) | none |
| P7 | One atmosphere sentence + appearance + POV rules | `_registers/*` `prose.openWith` / `style` | static | all 6 move |
| P8 | Random events by story mode | schema `event` field, mode rules, UI block | static schema | all 6 move |

### P1. The address ladder

The Address line states three rungs, chosen by the stage `[Affections]` already reports each round
(fact in the tail, rule in the static part):

| Stages | Player -> older member | Player -> same-age / younger member |
| --- | --- | --- |
| 陌生人, 有印象 (0-30) | work title if the identity has one (`代表nim`), else `<given name>xi` | `<given name>xi` |
| 产生兴趣, 暧昧期 (31-65) | `欧尼` | given name |
| 确认关系 and up (66+) | given name | given name |

The member's address to the player uses the same ladder in mirror image. What stays hard is the
**direction**: a younger member never calls the player 欧尼. The REGISTER block is rewritten
rather than appended to (the two current sentences that contradict this are deleted), and the
Private Personality blend survives as *how fast* she moves between rungs. It no longer decides
*which* rung she starts on. A `to_player` work title (`会长nim`, `经纪人nim`, `组长nim`) is rung 1
of the member's side.

### P2. Stage behaviour, chapters, beats

- Section 9 gets one behaviour line per stage, written in English from the design doc's §九. It
  also gets the prohibitions: no unearned attraction, no skipped ambiguity, not every round sweet.
- The world `phases` lines are renamed 起 / 承 / 转 / 合 and gain the design doc's end-of-phase
  beat, in English. These are world data in all four worlds and three languages, and the rule
  text is English, so no Chinese is authored.
- The tail gains `[Chapter] 承 (rounds 7-14)`, from `getChapterByRound`. This is the fact the
  phase rule needs. The tail is the always-miss message, so it adds no cache cost.

### P3. Typical events are a menu for the whole run

This is one English line beside the ROLE CONTRACT: "the typical events in her identity background
are things that may happen across the run, as the relationship stage allows. They are never
round 1's premise, and a member at 陌生人 does not single her out." It fixes F2 for every identity
without touching Yuhan's Chinese.

### P4. Affection rate tied to the phase

The clamp becomes per chapter, for example +4 in 起, +6 in 承 and +8 from 转, with falls
unrestricted at -8. This follows the existing ±8 reasoning: pacing belongs to the game, not the
model. **Measure first.** `scripts/analyze-prose.mjs` already reports affection pacing, so record
round-6 and round-14 scores on 3 runs before and after. The exact numbers are Yuhan's call.

### P5. Positions per world, stated once and checked

| World | Main + subs (+ NPCs) | Player, by identity |
| --- | --- | --- |
| kpop_idol | one idol group | unchanged |
| campus | undergraduates in the same year | junior = a year below; café owner = outside, near campus; TA = staff |
| office | one team at one company | new hire / report = below them; manager = above; contractor, HR = outside the team |
| chaebol | **daughters of one chaebol family**, the house the org name names | rival heir = a competing house, against all of them; new employee = they are the company's executives; secretary / bodyguard = employed by the main member; journalist = investigating this family; fallen heir = outside, formerly an equal |

The chaebol `composed` and `subset` templates are rewritten in English. Families have ranks, so
the restaging ladder already in place (birth year → eldest first) gives 장녀/차녀 naturally. Each
identity is checked against this table; F7's `because` is the one known mismatch so far.

### P6. Narrator prologue

On round 1 only, the tail tells the model to open with a short second-person prologue in the
narrator's voice. It is 2-4 sentences covering the world, who she is in it, and who these women
are to her, and ends at the moment the first scene begins. It sits in the tail because a round-1
rule in the static prompt would change the cached prefix on round 2. It is generated per run
rather than authored, so there is no Chinese for Yuhan to write.

### P7. Atmosphere, appearance, point of view

- `openWith`: "Open with ONE sentence of atmosphere — light, weather, sound, the time of day —
  then a person doing or saying something by the second sentence."
- `style`: adds "every round shows the member's appearance: what she is wearing, her hair, her
  makeup, her expression and hands".
- New: "First-person view only. Never narrate a member's thoughts. The player learns what she
  sees and hears."

**Risk, stated plainly.** Blind read 5 measured the person-first opening improving 翻译腔 from 6 to
3 of 12. The deleted Chinese place blurbs were the other half of that fix. Yuhan's reading is
that the blurbs were the cause, and she is the instrument. The verdict should still come from a
**blind read of 6 rounds**, comparing this change against the current build, before release.

### P8. Random events, generated rather than pooled

- The schema gains `"event"` after `story` and before `summary`: a string or null. If present, it
  is a short scene that happens to her this round. It follows from the world, the chapter, the
  stage and the stats, and the four options respond to it.
- The story-mode rules (tail, no cache cost) set the rate. `free`: always null. `romance`: about
  1 round in 3, light. `pressure`: about 1 round in 2, press and obligation. `dramatic`: about 1
  round in 2, rivalry and comedy.
- The client renders it below the story under a `【随机事件】` header (an i18n string). It is
  appended to the history entry so the model remembers it. Export keeps it as a paragraph.
- Generated rather than pooled, as Yuhan suggested. A pool is Chinese prose she would have to
  write, and it repeats. Generated events can read the state, which a pool cannot.
- Grader: `playthrough.mjs` flags an event in free mode, and a mode whose event rate is 0 over 8
  rounds.

---

## Open questions for Yuhan

- **Q1. Does the whole chaebol cast form one family, including the NPC members?** Assumed yes,
  because one family is simpler and NPCs then have a reason to be at the table.
- **Q2. In non-idol worlds, do members go by their Korean given name** (`珠泫`, `涩琪`) in
  dialogue and narration? The idol world would keep stage names. This affects every non-idol
  run. Non-Korean members (宁艺卓, 内永枝利, the TWICE Japanese members) need a rule too. The
  proposal is: their given name from `name_kr` if it parses, otherwise the stage name.
- **Q3. The P4 clamp numbers.**
- **Q4. The `lawyer` background's `关照你` line**: keep it with P3 governing it, or reword it?

## Measurement plan before release

1. Offline: smoke plus mutation-verify every new guard. Read all six golden diffs.
2. Live, `deepseek-flash`: chaebol / zh / new employee, 8 rounds × 3 runs, recording:
   - the address form used per round against the stage;
   - affection at round 6;
   - the event rate per mode.
3. Yuhan's blind read for P7.
