# v1.4.4 additions — plan, 2026-10-20 | | | | | | | |

Source: Yuhan's requests of 2026-10-20 and her original design doc
(`docs/.dating-simulator.txt`, gitignored, private). v1.4.4 is bumped on `dev` and not released;
everything here ships in the same release. **No big new features**: fixes and improvements only.
Player-side social posting (design doc §八) is deferred, see `docs/PROPOSALS.md` §11.

Status:
- **All of P1-P9 are CONFIRMED** (Yuhan, 2026-10-20), including the P1 ladder and given-name
  table, P3's stage tags and the lawyer arc-clause default, and P5's cousin rule.
- Implementation runs in the order of the table below, one commit each. The progress column of
  that table is the authority on what is done.

---

## Decisions taken, 2026-10-20

| Q | Decision |
| --- | --- |
| Q1 | The **whole** chaebol cast is one family, NPC members included. The family takes the **main member's surname** (`裴氏` for Irene). |
| Q2 | In non-idol worlds members go by their **Korean given name** (`珠泫`), not their stage name. Members whose given name cannot be derived get a researched fallback (P1b). |
| Q3 | The P4 clamp numbers are accepted. |
| Q4 | Answered by her new idea: typical events move out of the static background and into the tail, unlocked by stage (P3). |
| — | **Address forms only inside quotation marks.** Narration says `裴珠泫`, never `裴代表nim` (a bug from her play). |
| — | **No named strangers.** Supporting characters outside the cast get no personal name and no detailed description (P9, from her play). |
| — | The hidden feeling basis and the intimacy beat every 4 rounds go to a later version: `docs/PROPOSALS.md` §9 and §10. |

---

## What the analysis found (read the rendered prompt, not the request)

Read against `test/fixtures/chaebol-zh.txt` and the four world files.

- **F1. The new employee calls Irene 欧尼 because the prompt says to.** Each member's Address line
  is computed from birth year alone (`安添 -> "Irene欧尼"`). The work title `代表nim` is one
  sentence in section 6's REGISTER block, far from the member it applies to, and a specific
  per-member line beats a general note. REGISTER also says the age direction "NEVER reverses, at
  any affection level", and that a near-age member "is already casual while the score is still
  low". Both are the opposite of what Yuhan wants.
- **F2. Irene is caring on day one because the background tells her to be.** Every identity
  background lists its `典型事件` in the static prompt from round 1. Yuhan wrote them as beats for
  **later** stages, including the intimate ones, and nothing says so. The `lawyer` background's
  `集团继承人{name}似乎有意或无意地关照你` sits in `[身份背景]` itself, not in the event list.
- **F3. Stage names carry no behaviour.** Section 9 lists names and ranges only. The design doc's
  §九 behaviour per stage and its prohibitions (`禁止让成员无缘无故喜欢上玩家`, `禁止跳过暧昧过程`)
  never reach the prompt.
- **F4. 起承转合 has no labels, no end beats, and no "you are here".** Section 3 prints all four
  phase lines every round. `getChapterByRound` computes the chapter for the stats box, but the
  model is never told it.
- **F5. Affection can outrun the phase.** The main member starts at 12, the clamp is ±8, so
  round 1 can reach 有印象 inside a phase that says "No romantic moves".
- **F6. The chaebol cast is several families in both templates.** `composed` says "a
  **different** chaebol house", and `subset` says "heirs of chaebol houses".
- **F7. Smaller ones:**
  - the new-employee `because` says "heir", where Yuhan means "executive";
  - stage names are used in non-idol worlds;
  - there is no point-of-view rule (design doc: 无上帝视角);
  - there is no appearance rule (design doc §一's core requirement).
- **F8. Address forms leak into narration** (`裴代表nim走了过来`). The SPEAKER CONTRACT already
  says address forms are spoken, but its example of correct narration is the **stage name**
  (`Irene正站在窗边`). In a non-idol world that example contradicts the `NO ONE IN THIS CAST IS AN
  IDOL` rule. So the model had no proper name to narrate with, and reached for a name-shaped title.
  **Hypothesis, unverified.** P1 removes the condition either way.
- **F9. Strangers get names, although the rule forbids it.** Section 3's UNKNOWN CHARACTER RULE
  says only cast members "may appear by name". Read literally, it permits inventing a name for an
  outsider, who then does not "appear by" a cast name.

---

## Proposed changes, one commit each, in this order

| # | Change | Where | Cache | Goldens | Done |
| --- | --- | --- | --- | --- | --- |
| P9 | No named or detailed strangers | section 3 UNKNOWN CHARACTER RULE | static | all 6 move | ✅ 3 mutations RED |
| P5 | Chaebol = one family (the main's surname); positions per world | `chaebol` castLore + `because` | static | `chaebol-zh` moves |
| P1 | Address ladder (age × position × stage), given names, narration names | `mainAgent.js` Address line, REGISTER + SPEAKER CONTRACT rewrite, `given_name` field | static, fixed at setup | all 6 move |
| P2 | Stage behaviour + 起承转合 beats + `[Chapter]` | section 9, world `phases`, tail | rule static, fact in tail | all 6 move |
| P3 | Typical events unlock by stage, carried in the tail | world data `events[]`, `buildDynamicTail` | rule static, events in tail | all 6 move |
| P4 | Affection rate tied to the chapter | `validateAndFixOutput` clamp | none | none |
| P6 | Narrator prologue, round 1 only | `buildTailRules` | none (tail) | none |
| P7 | One atmosphere sentence + appearance + POV | `_registers/*` `prose` | static | all 6 move |
| P8 | Random events by story mode | schema `event`, mode rules, UI block | static schema | all 6 move |

P9 and P5 come first because they are small and P1 builds on P5's family.

**Release notes** (`src/config/releaseNotes.js`, three languages) are written once, after the
last item, so the entry describes what shipped. README gains its bullet in each commit.

### P1. The address ladder: age × position × closeness

**Three inputs, all of which the prompt already has:**
- **age**, from the two birth years (fixed at setup);
- **position**, from the identity's work title and its direction (fixed at setup);
- **closeness**, from her own score in `[Affections]` (in the tail, every round).

The code computes the ladder per member, and her Address line states it outright. The model never
derives a form, it reads one. **Direction stays hard:** only the younger of the two ever says
`欧尼`, and only the junior in position uses the title.

The ladder has three rungs, chosen by **her** stage:

| Rung | Her stage |
| --- | --- |
| R1 distant | 陌生人, 有印象 (0-30) |
| R2 warming | 产生兴趣, 暧昧期 (31-65) |
| R3 close | 确认关系 and above (66+) |

**What the player calls her** (example: Irene, `珠泫`):

| Position | R1 | R2 | R3 |
| --- | --- | --- | --- |
| she is senior (to_cast title, e.g. 新人职员) | title: `代表nim` | in private: `欧尼` if she is older, `珠泫` otherwise. In front of others: still the title | in private: `珠泫`, or a couple's word. In front of others: the R2 public form |
| peers, she is older | `珠泫xi` | `欧尼` / `珠泫欧尼` | `珠泫`, or a couple's word. In front of others: `欧尼` |
| peers, same year or she is younger | `珠泫xi` | `珠泫` | `珠泫`, or a couple's word |
| the player is senior (to_player title) | `珠泫xi` | as peers | as peers |

**What she calls the player** is the mirror image:
- **R1:** the title, if the player holds one (`会长nim`, `老板`, `室长`); otherwise `<player>xi`.
- **R2:** `欧尼` if the player is older; otherwise the player's name. Any title the player holds
  stays in front of others.
- **R3:** the name, or a couple's word.

The rest of the design:

- **A couple's word is the player's language's own**: 宝贝 / 亲爱的, babe / honey, 자기야. It is
  never a Korean term transliterated into Chinese, because nothing in fan vocabulary covers it.
  This is the one place the "transliterate, never localize" rule does not apply. The model picks
  the word, so no Chinese is authored.
- **Each step happens on screen, as a beat.** For example, she says `别叫我代表nim了` or `말 놓을까요?`.
  It never happens silently. Who moves first, and how soon after the score allows, is her Private
  Personality. That is where the old "blend" survives.
- **A rung is never skipped**, and the step never comes before the score allows it.
- **Going back up a rung is allowed only as a deliberate cold move.** For example, after a fight
  one of them returns to `代表nim` or `珠泫xi`, and both of them hear it.
- **Public versus private ties into secrecy.** At R3, in front of anyone else, the earlier public
  form holds. A slip is a secrecy risk the story may use.
- **Age texture stays as texture.** A wide gap keeps a trace of deference even at R3.

**Names: who is called what, and where.**
- **Address forms only inside quotation marks.** That includes titles: `代表nim`, `前辈nim`, `老板`.
- **Narration, idol world:** her stage name (unchanged).
- **Narration, non-idol worlds:** her full name `裴珠泫` or her given name `珠泫`. Never the stage
  name, and never a title. The SPEAKER CONTRACT's narration example follows the world, so it stops
  teaching `Irene` in a chaebol run (F8).
- **Dialogue, non-idol worlds:** the given name, as in the ladder above.

**P1b. Given names.** These are derived from `name_kr` by dropping the surname: the first
character in zh, the part after the space in en, the first syllable in ko. This is the derivation
`membersNamedIn` already uses, factored out so the prompt and the matcher cannot disagree. An
optional `given_name` field (added to the `parseGroupConfig` whitelist) overrides the derivation
where it gives the wrong answer:

| Member | Derivation gives | `given_name` (zh / en / ko) |
| --- | --- | --- |
| Momo, Sana, Mina (Japanese) | 井桃, 纱夏, 井南 | Momo / Momo / 모모, likewise Sana, Mina |
| Rei (Japanese) | 井怜 | Rei / Rei / 레이 |
| Giselle (Japanese-Korean) | 永枝利 | Aeri / Aeri / 애리 |
| Lisa (Thai) | 莉莎·马诺班 | Lisa / Lisa / 리사 |
| Lily (Korean-Australian, 朴珍) | 珍 (one character) | Lily / Lily / 릴리 |
| Ningning (Chinese) | 艺卓 | Ningning / Ningning / 닝닝, the name she is called by in Korea |
| Tzuyu (Taiwanese) | zh 子瑜 is right, ko 우쯔위 is wrong | ko only: 쯔위 |

**Assumed: a member known in Korea by her stage name keeps it as her given name.** The table is
names, not prose, but Layer Z still puts each one in front of Yuhan. Custom members derive from
`name_kr` if it is present, and fall back to `name`. `membersNamedIn` learns `given_name`, so
`[Rounds Absent]` still sees her when the prose writes `Aeri`.

**Deleted, not added beside:**
- REGISTER's "NEVER reverses, at any affection level";
- REGISTER's "already casual while the score is still low";
- the separate "Work override" sentence, now folded into each member's line;
- the stage-name narration example in non-idol worlds.

### P2. Stage behaviour, chapters, beats

- **Section 9:** one behaviour line per stage, in English from the design doc's §九, plus its
  prohibitions: no unearned attraction, no skipped ambiguity, not every round sweet.
- **The world `phases`:** relabelled 起 / 承 / 转 / 合, each with the design doc's end-of-phase
  beat, in English.
- **The tail:** gains `[Chapter] 承 (rounds 7-14)` from `getChapterByRound`.

### P3. Typical events unlock by stage, carried in the tail (replaces "a rule")

Yuhan's idea. It is better than the rule it replaces, because a rule leaves the intimate events
in front of the model from round 1 and asks it not to use them. **A model shown a beat it is
forbidden to use gets primed by it anyway.**

- **Data.** Each identity's `典型事件` list moves out of `background` into
  `events: [{from: <stage>, text}]`, in all three languages, by script.
  - **Not a word of the Chinese changes**, and that is checked by comparing the joined text before
    and after.
  - `background` keeps `[身份背景]`, `优势/劣势` and `[初见]`.
  - The format is uniform enough to split mechanically: `典型事件：` up to `优势：`, separated by
    `；`. The en and ko equivalents get the same treatment. Any identity that does not fit is
    reported, not guessed at.
- **Stage tags.** Each event gets the earliest stage at which it may happen, judged against the
  **main member's** score (the events name `{name}`, the main member). I propose a first tagging
  and Yuhan corrects it, because the tags are design. Examples:

  | Event (`lawyer`) | `from` |
  | --- | --- |
  | 走错董事专属电梯 | 陌生人 |
  | 送来整组的下午茶 | 有印象 |
  | 失误时她帮你解围 | 有印象 |
  | 带你出席财阀圈社交活动 | 产生兴趣 |

- **The tail** gains `[Possible events] (her stage: 有印象)`, listing the events unlocked so far.
  The rule sits in static section 6: these may happen across the run when the story is ready, at
  most one per round; nothing from a later stage exists yet. **Fact in the tail, rule in the
  static part.**
- **Cost:** about 60-150 uncached tail tokens per round. **Calculated** from the event lengths,
  not measured.
- **Tie-in with P8:** outside free mode, a random event may be an unlocked typical event.
- **The `lawyer` arc clause** `集团继承人{name}似乎有意或无意地关照你` describes the relationship's
  arc, and sits in the static `[身份背景]`. **Proposed default:** move that clause verbatim into
  the event list at 有印象. The alternative is that Yuhan rewords it. Either way, a scan of the
  other 27 backgrounds for the same kind of arc sentence comes first, and anything found is listed
  for her rather than moved silently.
- **Layer Z:** the moved strings get new keys, so they show as pending in her review sheet. That
  is the review step for the tags too.

### P4. Affection rate tied to the chapter

| Chapter | Max rise per round |
| --- | --- |
| 起 | +4 |
| 承 | +6 |
| 转 and later | +8 |

Falls stay at -8 in every chapter. Before and after the change, record the round-6 and round-14
scores on 3 runs each with `scripts/analyze-prose.mjs`.

### P5. Positions per world, stated once and checked

| World | Main + subs (+ NPCs) | Player, by identity |
| --- | --- | --- |
| kpop_idol | one idol group | unchanged |
| campus | undergraduates in the same year | junior = a year below; café owner = outside, near campus; TA = staff |
| office | one team at one company | new hire / report = below them; manager = above; contractor, HR = outside the team |
| chaebol | **one family, the house of the main member's surname** (`裴氏`), NPCs included | rival heir = a competing house, against all of them; new employee = they are the company's executives; secretary / bodyguard = employed by the main member; journalist = investigating this family; fallen heir = outside, formerly an equal |

**One Korean-family detail needs a rule, or the model will trip on it.** Korean children take the
father's surname, so 裴珠泫 and 姜涩琪 cannot be sisters. The template therefore says: the house
is `{family}`; a member who shares that surname is a daughter of the house; a member with another
surname is a cousin through one of the house's daughters. The whole-cast restaging already does
this: its live output had `会长长女` beside `副会长次女`. `{family}` is a new template placeholder,
filled from the main member's surname (zh `裴`, en `Bae`, ko `배`).

### P6. Narrator prologue

On round 1 only, the tail asks for a short second-person prologue in the narrator's voice:
- 2-4 sentences: the world, who she is in it, and who these women are to her;
- it ends where the first scene begins;
- it is generated per run, so no Chinese is authored.

### P7. Atmosphere, appearance, point of view

- `openWith`: one sentence of atmosphere, then a person by the second sentence.
- `style`: also asks for the member's outfit, hair, makeup, expression and hands.
- New rule: first-person view only. Never narrate a member's thoughts.

**Risk:** blind read 5 credited the person-first opening with improving the machine-translated
feel, so this change gets a **blind read of 6 rounds** before release.

### P8. Random events, generated rather than pooled

- **Schema:** a new `"event"` field (a string or null), placed after `story` and before `summary`.
- **Rate, set by the story-mode rules:**

  | Mode | Event rate |
  | --- | --- |
  | free | always null |
  | romance | about 1 round in 3 |
  | pressure | about 1 round in 2 |
  | dramatic | about 1 round in 2 |

- **Context:** the event follows from the chapter, the stage and the stats. It may be an unlocked
  typical event from P3.
- **Display:** shown under `【随机事件】`, appended to the history entry, and kept by the export.
- **Grader:** flags an event in free mode.

### P9. No named or detailed strangers

The UNKNOWN CHARACTER RULE is rewritten as an ownership statement, not a permission:
- A character outside MEMBER PROFILES has **no personal name**: no given name, no surname, no
  nickname. She also gets **no description beyond one visible detail**.
- She is her role: `秘书`, `一位董事`, `那个司机`.
- **The substitute:** a recurring outsider is still nameless, and is referred to by role plus that
  one detail. A prohibition with no substitute gets routed around.

**Before writing it,** grep the rendered goldens for anything that hands the model a stranger's
name (an example, a background), and delete it. **Measurement:** read the live runs. A zh name
detector would cry wolf, so it is deliberately not built.

---

## Measurement plan before release

1. **Offline:**
   - smoke, plus mutation-verify every new guard;
   - read all six golden diffs;
   - for P3, compare the joined event text before and after the move.
2. **Live, `deepseek-flash`:** chaebol / zh / new employee, 8 rounds × 3 runs, recording:
   - the address form used per round against her stage;
   - any address form in narration;
   - affection at round 6;
   - the event rate per mode;
   - named strangers, by reading.
3. **Yuhan's blind read** for P7.
