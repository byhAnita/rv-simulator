# Prompt localization — the prose rules are English and the prose is not

**Status: Tier 1 PLUMBING IS BUILT and uncommitted. Tier 1 CONTENT is Yuhan's to write.**
**Tier 2 is not started.**

The wiring is in and renders byte-identically: all eight rules now come from
`public/worlds/_registers/<lang>.json`, every file currently holds the English text verbatim, and
**all six goldens are unmoved** — which is the gate that says the plumbing changed nothing but the
plumbing. Smoke **1721 -> 1725**, **5 mutations, 5 RED**, build clean at 441.74 kB / gzip 155.17.

**What Yuhan does next: open `public/worlds/_registers/zh.json` and replace the eight English
values under `prose` with Chinese.** Nothing else has to change for it to take effect — the code
already reads them. Then `node scripts/update-golden.mjs` and read the diff.

This document holds the English source text for every prompt block that should be authored
per language, and says exactly where each one goes. Yuhan writes the `zh` column as a native
speaker; `ko` follows from a reviewer. The English column is the `en` value *and* the
specification the other two answer — not a string to translate literally. For the one block
that is about Chinese specifically (`voice`), the English column is a checklist of what the
Chinese must assert, because a translated anti-translationese rule is worth nothing.

---

## Why

Measured on the rendered zh golden, `v1.3.9` against `v1.4.2`, same cast and same door:

| | v1.3.9 | v1.4.2 |
| --- | --- | --- |
| static prompt | 15,813 chars / ~5,435 tok | 21,682 chars / ~7,259 tok |
| sections | 10 | 11 |
| bullet rules | 59 | 68 |
| **Chinese share of characters** | **18.4%** | **16.2%** |

The prompt grew **+37%** and **~4,000 of those ~5,900 new characters are English rules**. Every
rule that governs how the prose *sounds* — `Style: Literary, emotional, sensory details`,
`Tone: 60% sweet, 30% realistic pressure`, `warm, cute, casual`, the opening-sentence rule, the
`story:` and `scene:` rules — is an English sentence describing Chinese writing abstractly. That
is the condition that produces translationese, and it bites hardest on the weakest model in a
route, not on the strongest.

**It is not a reproduction of the reported defect.** On `deepseek-flash` the current build
produced 8/8 clean rounds of genuinely natural Chinese — see *What was measured*, below. This
change is worth making because the prompt is wrong in a way that will keep costing register on
weak models, not because it is the proven cause of one report.

---

## Hard constraints — read before writing a single string

These are not style preferences; each one is a defect avoided.

1. **NEVER localize the JSON schema, the key names, or the type rules.** `scene`, `statChanges`,
   `affectionChanges`, `story`, `summary`, `socialContent`, `kktMessages`, `options`,
   `selfId`, `secrecy`, `mood`, `bubble`, `instagram`, `weverse`, `hasPhoto`, `photoDesc`,
   `likes`, `comments` and every `MUST be an ARRAY like [...]` line stay exactly as they are. A
   model shown a translated key emits a translated key, and `parseLLMOutput` has no level that
   recovers from that.
2. **`summary` stays English, and its rule stays English.** It is the collapse target: it
   *becomes* the history ledger entry three rounds later. Localizing it would put the player's
   language into the cached prefix at ~130 chars per round and change what every later round
   reads.
3. **Never rename a tail label.** `[Player Status]`, `[Affections]`, `[Stage Changes]`,
   `[Rounds Absent]`, `[KKT Channels]`, `[KKT Messages]`, `[Story Mode: ...]`, `[Time Speed]`.
   The static prompt points at these **by name** in five places, and `buildDynamicTail` emits
   them in English. A localized rule naming a translated label is a rule pointing at nothing —
   the `[NPC Appearances]` failure, which is the one this file keeps recording.
4. **Never renumber or rename a section.** Five rules cross-reference sections by number
   (*"Section 6 SPEAKER CONTRACT is binding"*, *"section 7"*, *"the one section 4 names"*,
   *"section 11's canon list"*). Smoke derives the headings and asserts 1..11 in order.
5. **One copy of every string.** The localized value **replaces** the English literal in
   `mainAgent.js`; it does not sit beside it. *A prompt is not append-only* — two rules about one
   thing is how they come to disagree, and this file records five instances.
6. **The static prompt must stay a pure function of the save.** The language is already an input,
   so this is safe — but the lookup must be a plain table read, with no `Date.now()`, no
   `Math.random()`, and no iteration over an unordered object. Smoke Layer J builds each prompt
   twice and asserts byte-equality across all 8 identities x 3 languages.

---

## Where the text lives

**`public/worlds/_registers/<lang>.json`**, under a new top-level `prose` key, beside the
existing `korea` register.

That file is already the one per-language, non-world, fetched, mirrored document in the repo:
`loadWorld` fetches it, `parseWorld` resolves it onto `world.addressForms`, it is covered by
`.nojekyll`, Layer C already mirrors it to the repo root, and `verify-mirrors.mjs` already
fetches all three copies from all three hosts. Nothing new has to be built.

```
public/worlds/_registers/zh.json
{
  "prose": { "style": "...", "voice": "...", ... },   <- NEW, this document
  "korea": { "tokens": { ... }, "guide": "..." }      <- unchanged
}
```

**Why not the alternatives**, so this is not re-litigated later:

- **Not the world files.** These are facts about a *language*, not about a setting. Four worlds x
  three languages is twelve copies of one paragraph with nothing keeping them in step — the
  `social_platforms` failure.
- **Not `src/i18n/<lang>.js`.** Those are bundled, so all three languages would ship to every
  player. v1.4.0 step 3 deliberately moved the identity prose *out* of the bundle for exactly
  this reason (324.73 -> 317.51 KB), and this is ~3 KB per language.
- **Not a new `public/lang/` tree.** It would need a new mirror copy, a new Layer C entry, and a
  new line in `verify-mirrors.mjs`, to hold one document per language that an existing
  per-language document already holds.

**Templating reuses `renderCastLore`, never a second templater.** It already drops a line whose
value is absent and **throws on an unknown placeholder** — which is what stops a typo reaching the
model as a literal `{playr}`. Placeholders available to these strings:

| placeholder | value |
| --- | --- |
| `{player}` | the player's name |
| `{lang}` | `Chinese (Simplified)` / `English` / `Korean` |
| `{archetypes}` | the world's NPC archetype list |
| `{recentBeat}` | `world.castLife.recentBeat` |
| `{theirs}` | `world.castLife.theirs` |
| `{notHers}` | `world.castLife.notHers` |
| `{sceneExample}` | `world.castLife.sceneExample` |

---

## Tier 1 — the blocks that decide how it sounds

These are the ones worth doing first. If only this tier ships, the change has paid for itself.

### `prose.voice` — NEW. This block does not exist today.

There is currently **no instruction anywhere in the prompt about what good prose in the player's
language looks like.** This is the gap that matters, and it is the one block where the English
column is a specification rather than a source string.

What the `zh` value must assert, in Chinese, in roughly 60-100 characters:

- Write as a Chinese author writes, not as a translator renders. The sentence rhythm is Chinese.
- **Drop the pronouns Chinese drops.** Subject omission across clauses in one scene is correct;
  repeating 她 in every sentence is the single loudest translationese marker.
- **No stacked attributives before a noun.** `那个穿着白色衬衫的安静的女孩` is translated English;
  split it.
- **No `当……的时候` where a bare clause works.** Same for `之一`, for `被` where an active verb is
  natural, and for a `的` chain three deep.
- Prefer concrete verbs over `进行` / `造成` / `使得`.
- Four-character phrases where they land naturally; never as decoration.

`en` value: the equivalent statement for English — plain declaratives, no adjective pile-ups, no
constructions that read as translated from Chinese.

`ko` value: for the reviewer. The two markers worth naming are over-explicit subject particles
where Korean drops the subject, and `~것이다` / `~에 대해` constructions where a plain verb works.

**Placement:** `mainAgent.js` section 3, immediately **after** the `- Style:` line and before
`- Open with`. It belongs in section 3 because that is the section about writing the story, and it
must sit above the phase rules so it is read before the content rules.

### `prose.style` — replaces §3's `- Style:` line

> Literary, emotional, sensory details (sight/sound/touch/smell).

**Placement:** `mainAgent.js` section 3, the `- Style:` line. Keep the leading `- Style: ` label
in English so the bullet still scans with its neighbours; only the value is localized.

### `prose.openWith` — replaces §3's opening-sentence rule

> Open with 1-2 sentences establishing scene atmosphere

**Placement:** `mainAgent.js` section 3, directly below `prose.voice`.

### `prose.length` — replaces §3's length line

> Story length: 350 - 450 words in {lang}

**This one needs a decision, not a translation.** "350-450 words" is meaningless in Chinese and
Korean, and `analyze-prose.mjs` measured zh prose running at roughly double the intended length —
the run below came back at 662-904 characters per round. The zh value should state a **character**
count. My recommendation, from the measured rounds that read well: **600-800 characters**. The en
value keeps words. Separately, README's cost table assumes ~800 output tokens per round and
`PROPOSALS.md` §2 records the real figure at 1.4-2.1x that, so pinning this is also the first
honest step on that item — and it should be measured, not assumed.

### `prose.tone` — replaces §9's `- Tone:` line

> 60% sweet, 30% realistic pressure, 10% youthful regret.

**Placement:** `mainAgent.js` section 9, the `- Tone:` line.

### `prose.socialFreshness` — replaces §7's freshness rule

> ALL of it comes out of THIS round. A member posts about the day she has just had —
> {recentBeat}, the weather she just walked through, the thing that just made her laugh. Nothing
> here is filler written about no particular day, and nothing here says outright what the story
> kept unspoken.

**Placement:** `mainAgent.js` section 7, the second bullet.

### `prose.platformStyles` — replaces the style adjectives in `platformConfig.js`

> Bubble: warm, cute, casual. Instagram: aesthetic, short caption + emoji. Weverse: friendly,
> natural. KakaoTalk: flirty / caring / casual.

**Placement:** this is the one Tier 1 item that is **not** in `mainAgent.js`.
`src/config/platformConfig.js` says what each platform *is*, and that split is deliberate and
stays: the world declares *which* platforms exist, the catalog says what they are. Only the
**style adjective** localizes; the shape, the schema fragment and the `ui` key do not. The
catalog is the single source for five renderings of that list, so the localized value has to be
read at the point each of those five renders — not copied into them.

### `prose.profileCritical` — replaces §5's `CRITICAL: ★` line

> Public Image / Private Personality / Queer Texture are the PRIMARY differentiators for every
> scene. The same event must feel distinct depending on which member is present — her voice, body
> language, reactions, and subtext should all reflect her personality. Never flatten members into
> a generic type.

**Placement:** `mainAgent.js` section 5, the `CRITICAL: ★` line. **Append the §22.1 interim
caveat to the localized string exactly as it is appended today** — it is the empty string when
`castLore.useRole` is true, and it is appended rather than placed on a line of its own
specifically so that no newline moves for an idol run.

### `prose.sceneRule` — replaces the `- scene:` line in RULES

> ONE SHORT PHRASE — a place and a time, nothing else: "{sceneExample}". It is printed inside a
> one-line status box on a phone screen, so a sentence will not fit there and a paragraph is
> worse. Change it when the story moves, and never repeat the previous round's scene word for
> word. Take the place from section 11's canon list unless the story genuinely needed somewhere
> that list does not have. The only organisation that exists in this story is the one section 4
> names; never write another one's name anywhere.

**Placement:** the `RULES:` block, `- scene:`. Keep `- scene: ` in English — it names a JSON key.

### `prose.storyRule` — replaces the `- story:` line in RULES

> PURE story text. NO stat bars, NO options embedded, NO repeated "story" keys.

**Placement:** the `RULES:` block, `- story:`. Keep `- story: ` in English. **The `NO repeated
"story" keys` clause stays English** — it names a key.

---

## Tier 2 — the reasoning rules, localized second

Worth doing, and lower risk once Tier 1 is proven. Each is a block of rules the model applies
*while* writing prose, so a native-language statement is followed more reliably — but none of
them is about register, so none of them is the reported defect.

| key | replaces | placement |
| --- | --- | --- |
| `prose.pronounRule` | §3 `- PRONOUN RULE:` | section 3 |
| `prose.unknownCharacter` | §3 `- UNKNOWN CHARACTER RULE:` | section 3 |
| `prose.noSocialInStory` | §3 `- NO SOCIAL MEDIA IN STORY:` | section 3 |
| `prose.phoneOwnership` | §3 `- HER PHONE BELONGS TO THE APP` | section 3 |
| `prose.speakerContract` | §6 SPEAKER CONTRACT, 6 bullets | section 6 |
| `prose.roleContract` | §6 ROLE CONTRACT, 3 bullets | section 6 |
| `prose.registerPreamble` | §6 `-- REGISTER: blend these --` prose | section 6 |
| `prose.whereSheIs` | §11 `WHERE SHE IS DECIDES WHO IS THERE` | section 11 |
| `prose.phases` | §3's four phase lines | section 3 |

**Two cautions specific to Tier 2.**

`prose.phoneOwnership` names three substitutes by example — *a note pushed under the door, food in
the fridge, a jacket over the back of her chair*. **An example is an instruction**, which this repo
has paid for twice (`scene: "SM Practice Room, 10PM"` handed every cast SM's name; `hasPhoto:
false` in the example pinned no photos). Three named substitutes will become three recurring beats.
The localized version should say what the substitute *is* — she leaves a physical trace somewhere
she knows the player will reach — and give at most one example, or none.

`prose.speakerContract` and `prose.registerPreamble` sit next to the address token table, which is
**already** per-language in the same file. Localizing the prose around it is the smaller half of
the job; the tokens are done.

---

## Not localized, deliberately

| | why |
| --- | --- |
| §2 JSON OUTPUT, the JSON SCHEMA block, all type rules | constraint 1 |
| the `- summary:` rule and the `summary` schema line | constraint 2 — it is the ledger collapse target |
| every tail label, and `[Story Mode: ...]` | constraint 3 |
| §8 NPC RULES | mechanical: counts and a cooldown |
| §10 STAT SYSTEM and `world.statNotes` | they decide **numbers**, not prose, and `statNotes` is deliberately one language-invariant English string in all three world files |
| `world.castLife`, `world.addressContext` | same — language-invariant by design, and shared by the ROLE CONTRACT |
| §4 GROUP BACKGROUND | the group files' `groupLore` is **already** per-language authored content |
| §11's canon place list and `scenario` | already per-language in each world file |

---

## The gate

- **All six goldens move**, and that is the point rather than a problem: `node
  scripts/update-golden.mjs`, then **read the diff**. It is the review artifact. A diff that
  shows an English line still standing beside its localized replacement is constraint 5 broken.
- **One full cache miss, once, for every player in flight.** The static prefix changes, so the
  round after the deploy pays ~7,300 tokens. One round, and then it caches as before. There is no
  way to avoid it and no reason to try.
- **Smoke:** Layer J's byte-equality across 8 identities x 3 languages must stay green; add a
  guard that every `prose.*` key exists in all three register files (a missing key is invisible
  until a Korean player opens the game — the `releaseNotes.js` lesson), and a guard that no
  localized string contains a tail label or a JSON key name.
- **Mutation-verify every new guard.** Roughly a third of new assertions pass against broken code
  on the first attempt.
- **Live, and this is the only measurement that counts:** `node test/playthrough.mjs --lang zh
  --group red_velvet --identity 韩娱艺人 --subs 2 --mode free --rounds 8`, then **read the eight
  stories**. The graders returned `8/8 clean · 0 issues` on prose that had not changed, which is
  precisely why the verdict line is not the instrument. Run one arm before and one after, and
  read both.
- **One change at a time.** Tier 1 is one commit, Tier 2 another. Two changes in one run means
  the next measurement means nothing.

---

## What the plumbing commit actually did

| | |
| --- | --- |
| `public/worlds/_registers/{zh,en,ko}.json` | new top-level `prose` block, 8 keys, English verbatim in all three |
| `worlds/_registers/{zh,en,ko}.json` | the root mirror, copied in the same change |
| `src/rag/worldLoader.js` | `PROSE_KEYS`, `renderProse`, validation in `parseWorld`, `world.prose` |
| `src/agent/mainAgent.js` | one `P(key)` helper; the 8 literals replaced |
| `test/smoke.mjs` | 4 guards, each mutation-verified |

**`renderProse` is deliberately not `renderCastLore`.** That one *drops* a line whose value is
missing, which is right for `Fandom: {fandom}.` and wrong here: a prose rule that vanishes because
a placeholder was empty is a prompt that silently stops asking for something. Both an unknown
placeholder and an empty value throw.

**Three guards were written and deleted** — one per language, asserting the file carries every key.
Removing a key makes `parseWorld` throw on load, so the mutation *crashed* the suite instead of
reddening the check: they duplicated the validator and could not fail. The throw is the protection
and it names the key and the language. Third time this repo has deleted a check for that reason.

**And one guard was green against broken code on the first attempt.** *"The rendered prompt takes
its prose rules from the register file"* set a sentinel on two keys and asked whether **either**
appeared — so putting one rule back as a literal left it passing. It now asserts **every** key
reaches the prompt, and is mutation-verified against two different keys, because a guard that only
catches `style` is a guard pinned to one instance of the class it is about.

---

## What was measured, 2026-10-01

`node test/playthrough.mjs --lang zh --group red_velvet --identity 韩娱艺人 --subs 2 --mode free
--rounds 8`, `deepseek-flash`:

**8/8 clean, 0 issues, 0 static-prompt drifts across 8 rounds, 2 collapses with 0 ledger prefix
breaks, 89.6% cache, `direct` parse 8/8, median 6,186ms, 662-904 characters per story.**

**The prose read well** — natural literary Chinese, each member's `habit` staged rather than
stated, and a genuine callback three paragraphs after its setup (`你后来才想起来，练习室楼层根本没有
饮水机`). So the reported degradation **did not reproduce on this provider**, and the next thing to
establish is which model served the rounds that read badly: the app's default provider is the
Aliyun free route, which walks 28 models of very different sizes, and a prompt that grew 37% in
one release is exactly the change that costs a small model its instruction-following first. The
usage panel in Settings names the served model, and `?debug=1` logs it per call.
