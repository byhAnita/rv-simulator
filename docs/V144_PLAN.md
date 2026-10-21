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
| P5 | Chaebol = one family (the main's surname); positions per world | `chaebol` castLore + `because` | static | `chaebol-zh` moves | ✅ 6 mutations RED; `orgHint` one family in zh/en/ko (Yuhan ticked the zh draft 2026-10-21) |
| P1 | Address ladder (age × position × stage), given names, narration names | `mainAgent.js` Address line, REGISTER + SPEAKER CONTRACT rewrite, `given_name` field | static, fixed at setup | all 6 move | ✅ 17 mutations RED; not yet played live |
| P2 | Stage behaviour + 起承转合 beats + `[Chapter]` | section 9, world `phases`, tail | rule static, fact in tail | all 6 move | ✅ 18 mutations RED; not yet played live |
| P3 | Typical events unlock by stage, carried in the tail | world data `events[]`, `buildEventsLine` | rule static, events in tail | 4 of 6 move (the ex-girlfriend fixtures have no events) | ✅ 18 mutations RED; Layer Z red: 105 strings await Yuhan's ticks |
| P4 | Affection rate tied to the chapter | `capAffectionRise` in `executeRound` | none | all 6 move (one RULES line) | ✅ 9 mutations RED; measured live |
| P6 | Narrator prologue, round 1 only | `buildPrologueLine`, tail | none (tail) | none | ✅ 9 mutations RED; 4 of 4 live round 1s carry it, 0 of 4 round 2s |
| P7 | One atmosphere sentence + appearance + POV | `_registers/*` `prose` | static | all 6 move | ✅ 10 mutations RED; live 9 of 9 rounds open on one atmosphere sentence; **Yuhan's blind read owed** |
| P8 | Random events by story mode | schema `event`, mode rules, UI block | static schema | all 6 move |
| P10 | A new round scrolls to its own top, not to the end | `App.jsx` story panel, `src/utils/storyScroll.js` | none (UI) | none | ✅ 7 mutations RED |
| P11 | The romance rule names a stage in English in every language | world `modes.romance`, 12 files | none (tail) | none | ✅ 4 mutations RED |
| P12 | One round number for the model, and `R1` means one thing | `buildHistoryLedger`, `[Player Status]` | ledger moves once | none | ✅ 6 mutations RED |

P9 and P5 come first because they are small and P1 builds on P5's family. P10 was added by
Yuhan on 2026-10-20 and is independent of the rest, so it is done next, before P1.

**P11 and P12 were found while building P2 and added on 2026-10-21, Yuhan's call; the order is
mine.** They go **after P2 and before P3**: both are small, both touch only the tail and the
ledger, and P3 adds another tail line that names her stage and reads the round, so the stage
vocabulary and the round number should be settled before it lands. Order from here: **P11, P12,
P3, P4, P6, P7, P8.**

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

**As built (2026-10-21).** One deviation from the bullets above, and it is a list deleted rather
than a list added:
- **The chapters live once, in code** (`src/config/chapters.js`): id, label `起承转合`, round range,
  the design doc's goal and end beat. They are the same in every world, so putting them in twelve
  world files would be twelve copies of four sentences. `getChapterByRound` (the stats box) and the
  `[Chapter]` tail line both read it, so the box and the model cannot disagree about the chapter.
- **The world keeps only its texture**, and `phases` becomes a map **keyed by chapter id**, like
  `modes`. The round ranges leave the world files: they were a second copy of the boundaries
  `getChapterByRound` hardcoded, tied together by nothing. `parseWorld` throws on a missing id.
- **Phase 4's "Established relationship" is deleted** from all four worlds. It told the model the
  relationship exists by round 25 whatever the scores say, which is what the stage rules forbid.
- **The stage behaviour lives in `stageConfig.js`** beside the stage names, one line per stage.
- `[Chapter]` names the round being generated (`stats.week + 1`), which is also what
  `getChapterByRound` is given. `[Player Status] Round:` prints the last COMPLETED round and is
  therefore one behind; that is pre-existing and left alone here, and `[Chapter]` says "this is
  round N" so the model is not left to reconcile them.

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

#### P3 proposed tagging - Yuhan corrects before any code (2026-10-21)

Scanned with a script over all four worlds x three languages. **23 of 28 identities carry an
event list, with the same count in zh, en and ko for every one.** `from` is judged against the
**main member's** stage. Change any cell; a tag is the earliest stage, so an event stays available
after it unlocks.

| identity | event (zh, verbatim) | proposed `from` |
| --- | --- | --- |
| kpop 练习生 | 在练习室与成员一起排练，向成员请教唱歌和舞蹈技巧 | 陌生人 |
| | 在组合宿舍厨房客厅互动 | 有印象 |
| | 深夜疲惫时互相袒露心声 | 产生兴趣 |
| | 作为组合新成员与成员们一起参与打歌舞台签售会活动等 | 陌生人 |
| kpop Staff | 去练习室探班关心成员们带下午茶…受宠若惊 | 陌生人 |
| | 深夜开车送{name}下班回宿舍，接纳她的脆弱疲惫关心她 | 产生兴趣 |
| | 签售打歌后台关心{name}状态督促她吃饭等 | 有印象 |
| kpop 韩娱艺人 | 你和{name}两人私下排练合作舞台，逐渐熟悉和默契 | 有印象 |
| | 你和{name}在音乐银行合作打歌舞台, 互动被CP粉截图疯狂分析 | 陌生人 |
| | 你和{name}的综艺同框被剪辑成暧昧视频广泛流传等 | 有印象 |
| kpop 粉丝 | 打歌舞台你抢到前排，{name}的眼神似乎在你身上多停留了一秒 | 陌生人 |
| | 签售会{name}注意到你换了发型/装扮/风格主动提及 | 有印象 |
| | 你在{name}的bubble粉丝留言板发了条普通的消息… | 有印象 |
| | 粉丝活动你和{name}拍双人拍立得时{name}凑近搭上了你的肩 | 产生兴趣 |
| kpop 财阀 | 与{name}所在女团开回归企划讨论会… | 陌生人 |
| | 借关心成员们的名义亲自去探班制造和{name}相处机会 | 有印象 |
| | 你心疼{name}辛苦于是让秘书给整个组合带薪放假、发奖金等 | 产生兴趣 |
| campus 咖啡馆老板 | 早上她们来买咖啡，你暗自记下了{name}的口味 | 陌生人 |
| | 周末她们来咖啡馆聚会玩游戏，{name}邀请你加入一起 | 有印象 |
| | {name}点单时你和她闲聊了解她的生活 | 有印象 |
| campus 同届学生 | 被分到同一个小组作业，一起喝咖啡熬通宵完成 | 陌生人 |
| | 上课时她在旁边的座位上睡着，头一点一点地靠过来 | 有印象 |
| | 考试结束那天，全系都在庆祝，你们却先走了 | 产生兴趣 |
| campus 学姐 | 成员们作为新生报道，你被派去引导 | 陌生人 |
| | 她拿着选课表来问玩家哪门课值得选 | 陌生人 |
| | 社团聚餐结束，玩家送她回宿舍 | 有印象 |
| | 她第一次做展示紧张到手抖，玩家给她鼓励 | 有印象 |
| campus 学妹 | 她把自己的笔记毫无保留给了你 | 有印象 |
| | 社团里她替你挡下了不该你做的杂事 | 有印象 |
| | 聚餐时你被灌酒，她把杯子拿走了 | 产生兴趣 |
| | 你熬夜赶作业，她在自习室陪到最后 | 产生兴趣 |
| campus 助教 | 你在她的报告边上写了比普通评语更长的一段话 | 有印象 |
| | 答疑时间只剩你们两个人，话题早就与课程无关 | 产生兴趣 |
| | 她把作业拖到最后一刻交，你没有追问 | 有印象 |
| | 你批改作业时一眼认出了她的笔迹 | 有印象 |
| campus 交换生 | 小组讨论你跟不上语速，她放慢了语速并帮玩家翻译理解 | 陌生人 |
| | 她带你去只有本地学生才知道的那家店 | 有印象 |
| | 你把一个词说错，她笑了很久，然后教正确的说法 | 有印象 |
| | 你们聊到你什么时候走，两个人都换了话题 | 暧昧期 |
| office 同事 | 深夜在工位你们一同通宵改项目方案，一起吃夜宵 | 有印象 |
| | 组里工作出现失误，她替你挡下了本该你背的那个锅 | 产生兴趣 |
| | 聚餐散场你们顺路，走了很长一段夜路 | 产生兴趣 |
| office 组长 | 你把最难的那个客户留给自己，而不是分给她 | 陌生人 |
| | 一对一面谈的二十分钟里，你们有十分钟没在谈工作 | 产生兴趣 |
| | 她的方案被上面打回来，你在会上支持她 | 有印象 |
| | 年末评价你必须给全组排序，而你知道自己犹豫了多久 | 产生兴趣 |
| office 组员 | 你交上去的东西被她打回修改，她留下比普通批注更长的修改指导 | 陌生人 |
| | 她知道你的一个客户很难对接，她主动接手你那个最难的客户 | 有印象 |
| | 你加班到很晚，她的工位灯也还亮着 | 有印象 |
| | 考核面谈，她在工作问题中夹杂了几个私人问题 | 产生兴趣 |
| office 新人 | 第一周你把会议室订错了，是她去道的歉 | 陌生人 |
| | 她把自己的模板文件夹整个共享给了你 | 有印象 |
| | 聚餐上有人一直给你倒酒，她把杯子拿开了 | 产生兴趣 |
| | 她知道你的一个客户很难对接，她主动接手你那个最难的客户 | 有印象 |
| office 外部合作方 | 你在她们的食堂不能刷卡，她帮你买饭买水 | 陌生人 |
| | 她在电梯里叫住你，问的不是工作 | 产生兴趣 |
| | 项目即将结束，大家喜悦之余也意味着工作交集走到尾声 | 产生兴趣 |
| office 人事 | 客户不满她们组的工作，你从中调解 | 陌生人 |
| | 一对一面谈登记个人信息，你在公司的问题中夹杂了几个私人问题 | 有印象 |
| chaebol 对家继承人 | 同一场宴会上你们被安排在相邻的位置，全场都在看你们说什么 | 陌生人 |
| | 两家在同一个项目上竞标，你在会议室对面看着她 | 陌生人 |
| | 记者问你对她家的评价，你说了一句滴水不漏的话 | 有印象 |
| | 散场后她在停车场等你，问的不是生意 | 产生兴趣 |
| chaebol 落魄名门之女 | 宴会上有人记得你的名字，语气里带着同情 | 陌生人 |
| | 你穿着两季以前的衣服，她什么都没说，只是站得离你近了一点 | 有印象 |
| | 有人当着你的面谈起你家族当年的事，她换了话题 | 有印象 |
| | 你需要一份工作，而能给的人就坐在对面 | 有印象 |
| chaebol 新人职员 (`lawyer`) | 你走错了董事专属电梯，电梯门打开她正站在里面 | 陌生人 |
| | 下午你在工位工作，总裁办员工送来了整组的下午茶 | 有印象 |
| | 你因缺少职场经验在工作中失误，她帮你解围 | 有印象 |
| | 她带你出席财阀圈社交活动 | 产生兴趣 |
| | *(moved from `[身份背景]`)* 集团继承人{name}似乎有意或无意地关照你 | 有印象 |
| chaebol 室长 | 深夜的保姆车上只有你们两个，你在后视镜里看见她卸下面具后的疲惫脆弱 | 有印象 |
| | 她在商业上遇到困难，你越过工作的界限关心帮她一起解决 | 产生兴趣 |
| | 她带你一起去她的私下行程 | 暧昧期 |
| chaebol 贴身保镖 | 宴会后你脱下西装外套披上她身上单薄的礼服裙 | 有印象 |
| | 她的正式行程，你提前准备了平底鞋在她累时让她换下高跟鞋 | 有印象 |
| | 她甩掉行程一个人跑出去，你默契地找到她，却没有上报 | 产生兴趣 |
| | 凌晨送她回家，她在车里问你累不累——这是第一次有人问 | 产生兴趣 |
| chaebol 记者 | 你混进财阀圈宴会，她一眼认出你不属于这里 | 陌生人 |
| | 你在与她的接触中逐渐得知了她家不为人知地信息 | 有印象 |
| | 她知道你是谁之后没有叫保镖，而是坐下来问你想知道什么 | 产生兴趣 |
| | 截稿日一天天近了，你开始删自己写下的内容 | 暧昧期 |

**No event is tagged past 暧昧期.** These are the beats that build a relationship, and nothing in
any list describes one already confirmed. The tail therefore shows the whole list from 暧昧期 on.

#### Found by the scan, listed for Yuhan rather than changed

- **Two more arc sentences in a `[身份背景]`, the same kind as `lawyer`'s.**
  - kpop `粉丝`: *粉丝活动中她似乎对你有超过其他粉丝的特殊对应* - it tells the model she already
    treats the player specially, from round 1.
  - kpop `留学生`: *后作为成员的素人朋友自然接触* - it says the friendship happens. This identity
    has no event list at all, so the clause has nowhere to move to.
  - Proposed: move the 粉丝 clause into its list at 有印象, as `lawyer`'s is, and leave 留学生's
    alone. Yuhan decides both.
- **The four `主线成员前女友` backgrounds** carry *随着游戏推进，可能复合也可能各自前行*. That is
  the premise of the identity, not an arc the score has to earn, so it stays.
- **kpop `韩娱艺人` (zh) uses ASCII `:` and `;`** where every other identity uses `：` and
  `；`. The splitter accepts both rather than the text being normalised, because normalising is
  editing Chinese.
- **`学姐` and `交换生` (zh) say `玩家` inside events** (*问玩家哪门课值得选*, *帮玩家翻译理解*)
  where every other event says `你`. In the tail they read as a third person. Yuhan's text, so
  not changed.
- **`office/new_hire` event 4 is word for word `office/report_to_cast` event 2.**
- **`chaebol/journalist` event 2 has `不为人知地信息`**, where `的` is meant.

#### P3 as built (2026-10-21)

**Yuhan's decisions, 2026-10-21:** no corrections to the tags; the 粉丝 clause is **removed**, not
moved; fix the 玩家 and 的 items and the duplicate. Applied, in all three languages where the
text exists:

- 粉丝: *粉丝活动中她似乎对你有超过其他粉丝的特殊对应* deleted from `[身份背景]` (en/ko likewise).
- `lawyer`: the arc clause moved verbatim into the list at 有印象, as proposed.
- `学姐` x3 and `交换生` x1: 玩家 -> 你 inside events. **One more of the same kind, found while
  splitting:** `交换生`'s own `[身份背景]` said *玩家对韩语和韩国不熟悉*, and with the events gone it
  ran straight into 优势 with no punctuation. Now *你对韩语和韩国不熟悉。*
- `journalist`: 不为人知地 -> 不为人知的.
- `new_hire`: the duplicate fourth event dropped, so it has three. The script checked it was the
  duplicate in every language before dropping it.

**Built:**

- `events: [{from, text}]` on 23 identities in four worlds, x3 languages, both mirrors. **`from`
  is a stage INDEX** (0 = 陌生人), so one number means the same stage in every language.
  `parseWorld` refuses a `from` outside 0-6, a missing text, or an empty list.
- The split was a one-off script, not hand editing, and it is not committed. It proved no text was lost:
  deleting each extracted event, in order, from the removed slice must leave only the marker,
  separators and punctuation. The ASCII-punctuated `韩娱艺人` splits with the rest.
- **Tail:** `[Possible events] (Irene's stage: 有印象)` and one `- event` line per unlocked
  event, rendered through the same substitution as the background (`{name}`, ko particles). It is
  judged by the **main** member's affection and is absent for an identity with no events (留学生,
  the ex-girlfriend, a custom identity).
- **Static rule** in section 6, only for an identity with events: at most one per round, when
  the story is ready, written its own way; nothing outside the line has happened.
- **Goldens:** 4 moved by two lines each (the background loses its list, the rule appears); the
  two ex-girlfriend fixtures did not move. Diff read.
- **Layer Z is RED on purpose: 105 strings await Yuhan.** 23 backgrounds show `CHANGED` and 82
  events show `NEW`, all in the four world sheets. Every one is text she has already approved
  inside a background, except the five edits above. Ticking them is the review step.
- **Two bugs in `zh-review.mjs sync`, found by this move and fixed:** it re-stamped every
  approved string's date on each sync, and on a conflict it kept an UNEDITED block's old text as
  a draft (23 drafts offering the old events list back for a tick). See `docs/ZH_REVIEW.md`.
- 18 mutations RED (14 for P3, 4 for the sync fixes).

**Found, then FIXED 2026-10-21 on Yuhan's call (it joins v1.4.4):** identity text rendered `{name}` as the **stage** name in
every world (`集团继承人Irene`), while P1's Q2 rule says a non-idol world narrates her **real**
name. Pre-existing for the backgrounds since v1.4.1, and now true of the events too. The fix is
passing the real name in non-idol worlds. **As built:** `narrationNameOf(m, idolWorld)` in
`memberNames.js` - stage name in the idol world, `name_kr` elsewhere, `name` for a member with
none - feeds both the background and the events. The three non-idol goldens moved by one name
each (`강슬기는` resolves its particle now, being Hangul), diff read; 4 mutations RED. The
`[Possible events]` header keeps the stage name, because it is a key that must match
`[Affections]`, not narration.

**Not verified:** no live round. Whether a model holds the intimate events back until they
appear, and uses at most one per round, needs a playthrough. The tail's ~60-150 tokens is
calculated.

#### P3 live check, and what it found (2026-10-21)

Yuhan's questions: is an event removed once used, can an early-stage event come back at an
intimate stage, and does the list make stories alike? **Answers from the code:** nothing is ever
removed. The line is recomputed every round as every event with `from <= stage`, so a used event
stays offered, and a stage-0 first-meeting beat is still offered at Confirmed. Nothing records
that an event happened.

**Measured:** two 14-round zh runs on `deepseek-flash`, romance mode: chaebol `journalist`
(`test/.out/playthrough-1792562329430.json`) and office `new_hire` (`-1792562421700.json`).
Both 14/14 clean, 0 drifts, 0 prefix breaks, 90-91% cache. Read against the offered line each
round (scratchpad `events-report.mjs`):

- **An event is used the round it unlocks.** Event 0 in R1 and event 1 in R2, in both runs. Stage 1
  unlocks after one round (12 -> 16), so the stage-1 event fires in R2 every time. That is the
  "checklist" reading the rule was written against.
- **A used event echoes for rounds.** new_hire's template folder (event 1, R2) is in the prose of
  **R2-R7, six rounds running**. The journalist's family secret runs R3-R4.
- **Not every event is forced.** new_hire's drinking-party event was offered R6-R14 and never used.
  The journalist's stage-3 event (deleting the draft) landed in R13, four rounds after it unlocked.
  Both are the intended behaviour.
- **No early event came back late in these runs.** It is still offered, so the risk is real and
  unmeasured at n=2.
- **The bigger sameness is not the events.** A member leaving food or a note (`汤 / 饭 / 便签`)
  appears in 11 of 14 rounds of each run. That beat is the Kakao rule's substitute (*"she leaves
  something: a note under the door, food in the fridge"*), so the prompt's own example is being
  reused every round. Seulgi's jealousy closes almost every round too.
- **Affection runs fast:** about +4-5 per round, so Flirting comes by R9-R11 and Confirmed by
  R12-R14. P4 is the fix for that, and it also slows how fast events unlock.

**Proposals, not built; Yuhan decides:**

1. **A window, not a floor.** Offer an event only while the stage is in `[from, from + 1]`. A
   first-meeting beat then cannot be offered at Confirmed. Pure tail logic, no data change.
2. **Record use.** Number the items in the line (`E1.`). Add one schema key, `"event": number |
   null`, placed after `summary`. Keep `memory.eventsUsed` and drop used ones from the line. This
   is the only way to stop an exact repeat, and it also makes the usage rate measurable. It is a
   tail-only fact, so it costs no cache. The price is one more schema key, and a key-order change
   needs the `parseLevel` check that the KKT reorder had.
3. **A cooldown, and no use on the unlock round.** Send no line in the round a stage is reached,
   or for 3 rounds after an event is used. That breaks the "unlocked -> used at once" pattern and
   caps events at about one in four rounds.
4. **Rule wording:** *"Most rounds use none. Once used, an event is history: refer back to it at
   most, never stage it again."*
5. **Separate from P3:** vary or trim the Kakao substitute's examples, which a static prompt
   carries as a template. This is a register question, so it needs Yuhan's read.

**Measurement that settles 1-3:** with proposal 2 in place, the harness reports the unlock round
and use round of each event, plus any repeat. Re-run the same two configs and compare echo length
(template folder: 6 rounds) and use-on-unlock (4 of 4 here).

#### P3b. Yuhan's decision and the design (2026-10-21)

**Build 1-4 now, before P4; 5 stays hers.** And her question goes further than the proposals:
the events were added as **examples of a direction**, not a plot. Moving them from the static
prompt to the tail puts them at the **end** of the context, one at a time, which may make the
model lean on them harder than when they sat in a background paragraph. So the fix ships with a
**three-arm comparison**, and one arm has no events at all. If that arm is no worse, the events
are not earning their place and are better removed.

**Design, all tail-side except one schema key:**

- `src/agent/eventSchedule.js`, pure: `planEvents(events, stageIdx, state, round)` returns
  `{due, offered}` and `recordEvents(state, due, used, round)` returns the next state.
  `memory.events = {seen: {idx: round}, used: {idx: round}}`, written only by `updateMemory`.
  An old save has none, which reads as empty; there is no migration.
- **Window:** an event is due while her stage is in `[from, from + 1]`.
- **Not on the round it first comes due:** it is offered from the round after it is first seen,
  which also means round 1 opens on `[初见]` alone.
- **Cooldown:** no line for 3 rounds after an event is staged.
- **Used once:** a staged event is never offered again.
- **Numbering is stable:** `E<n>` is the event's position in the identity's list, so the number
  the model reports maps back without a per-round table.
- **Schema:** `"event"` comes after `summary`, so it is written after the prose and cannot bleed
  into it. It renders only for an identity with events, like `EVENTS_RULE`. A reported number is
  untrusted text: it counts only if it was offered this round.
- **Rule:** the events are examples of the kind of beat, not a plot. Most rounds stage none, an
  absent line means none, and once staged an event is history: the story may refer back to it but
  never stages it again or keeps returning to its object.

**The comparison**, harness-only (`playthrough.mjs --events tail|static|none`); the app always
plays `tail`:

| arm | what the model sees |
| --- | --- |
| `tail` | the design above |
| `static` | the v1.4.3 shape: every event in the background paragraph from round 1, with no rule and no schema key |
| `none` | no events anywhere |

Run on the same two configs as the live check (chaebol `journalist`, office `new_hire`; zh,
romance, `deepseek-flash`, 14 rounds), **3 replicates per arm**, because two runs of identical
code have differed by more than any arm gap on this harness. That is 18 runs.

**What is measured, with no verdict line:** per round, which authored event (if any) the story
stages, read from the English summaries; exact repeats; a first-meeting beat after Interest;
echo length; and **cross-run sameness**, meaning how alike two games of the same identity are
(character 4-gram overlap between replicates, plus the plot beats read side by side). That
last one is her "many similar stories" question, and it is the number the `none` arm can
answer too. Whether the `none` arm drifts aimlessly is a reading, not a number, and is reported
as one.

#### P3b results (2026-10-21): the events are not earning their place

18 runs, 252 rounds, all clean, cache 90.5-91.5%, built from `d6b1b68`. The log of runs and
the analysis script are scratchpad files: `arms.log` and `arms-report.mjs`. Event mentions are
keyword proxies on the zh prose; staging is the model's own report (tail arm only). The plot
reading is mine, from the English summaries. It is a plot-level read, **not a register
judgement**.

| per config, mean of 3 | cross-run 4-gram overlap | same, rounds 1-3 | food/note rounds of 14 | distinct scenes |
| --- | --- | --- | --- | --- |
| journalist tail | 0.049 | 0.020 | 7.3 | 12.0 |
| journalist static | 0.046 | 0.021 | 5.7 | 12.7 |
| journalist none | 0.045 | 0.022 | 3.0 | 12.0 |
| new_hire tail | 0.048 | 0.022 | 9.0 | 12.3 |
| new_hire static | 0.053 | 0.024 | 7.7 | 11.7 |
| new_hire none | 0.049 | 0.021 | 7.7 | 12.7 |

- **Sameness across games does not move with the events.** Two games of one identity overlap
  about as much with the events as without them (0.045-0.053, no arm separated). What makes two
  journalist games alike is the identity premise: archive, draft, "read it before you publish".
  That premise is there in all three arms.
- **The `none` arm is not aimless.** Every `none` run reads as a directed story: an
  investigation and a promise about the draft (journalist), and a client visit plus a rival
  senior's insecurity (new_hire). The background, `[Chapter]` and the stage rules give the
  direction. Several first-meeting beats appear with no event asking for them: the banquet in
  2 of 3 journalist runs, because it is the chaebol world's natural opening.
- **`static` front-loads, as Yuhan suspected of a list in plain view.** new_hire stages the
  template folder in **round 1 in 3 of 3** runs, twice together with the meeting-room apology.
  Journalist opens on the banquet event 3 of 3.
- **`tail` (fixed) turned the events into a metronome.** 17 stagings in 33 offered rounds. In
  4 of 6 runs every offer was taken the round it appeared, so events landed on R2, R6, R10 and
  R14: a four-round clock set by the cooldown. "Most rounds stage none" held only because most
  rounds now have no line. A line in the tail reads as a cue.
- **Echo is not fixed by retiring the event.** The template folder still appears in about 6
  rounds of each tail run (3.0 in `none`, where it is just office life). The keyword is generic,
  so this number overstates the echo.

**Recommendation: remove the typical events** (the `none` arm). Removing them lost nothing
measurable and nothing visible in the reading. Each way of keeping them has its own shape of
sameness: all-at-once in `static`, on-the-clock in `tail`. A middle course, such as offering
an event with a probability, adds machinery for a benefit nobody has shown. **Yuhan decides.**
The events are her design, and her register read is the instrument this cannot replace.

**Not shown:** n=3 per arm, one model, zh only, 14 rounds, so nothing past 承. The keyword
proxies are crude. No blind read was done.

**Found on the way, not fixed:**
- **The summary came back in Chinese in 5 of 252 rounds** (2%), against "summary is always in
  English". It is still a usable collapse target, so it is harmless to the ledger. It is
  recorded rather than tuned on n=5.
- **P4 baseline:** main member R6 = 33-43 (mean 39), R14 = 64-83 (mean 75), over 18 runs. 17
  of 18 reach Confirmed (66+) by R14 (corrected from 16: one run ends at exactly 66).

#### P3 removed (2026-10-21)

**Yuhan's decision: remove the typical events.** Everything P3 and P3b added for them is gone:
`identity.events` in all twelve world files (82 strings, pruned from the zh-review ledger by
`sync`), `renderIdentityEvents`, `buildEventsLine` and the `[Possible events]` tail line,
`EVENTS_RULE`, the schema's `event` key and its RULES line, `src/agent/eventSchedule.js`,
`memory.events`, and the harness's `--events` lever. The four goldens that P3b moved by three
lines move back.

- **`parseWorld` now throws on an `events` field**, rather than ignoring it, so the data cannot
  come back without a reader. A smoke guard feeds a sentinel event into a world and asserts it
  reaches none of the three prompt messages.
- **Kept from P3:** the background split (`[身份背景]`, 优势/劣势, `[初见]`), and identity text
  naming her through `narrationNameOf`.
- **Kept as the record:** P3, P3b and their results above. The comparison is the evidence for
  this removal, and the next person to propose "give the model some example beats" should read
  it first.
- **Verified:** the four goldens lost exactly the rule, the key and its RULES line; smoke
  **1807 -> 1789** (20 P3/P3b checks out, 2 in); **6 mutations, 6 RED**, two of them reachable
  only by the sentinel guard, because no data on disk carries events any more.
- **P8 still plans a schema `event` field**, a generated random event. That is a different
  mechanism (a rate set by the story mode, no authored pool), and it no longer draws on P3.

### P4. Affection rate tied to the chapter

| Chapter | Max rise per round |
| --- | --- |
| 起 | +4 |
| 承 | +6 |
| 转 and later | +8 |

Falls stay at -8 in every chapter. Before and after the change, record the round-6 and round-14
scores on 3 runs each with `scripts/analyze-prose.mjs`.

**Design (2026-10-21):**
- `maxRise` goes on each entry of `CHAPTERS` (`src/config/chapters.js`). That table is the one
  place a chapter's numbers live, and the stats box and `[Chapter]` already read it.
- `executeRound` clamps each positive delta to the cap of the chapter being generated, after
  `validateAndFixOutput`'s ±8. Negative deltas are untouched.
- The fact goes in the tail: `[Chapter]` gains *"affection rises at most +4 a round in this
  chapter"*. The rule goes in the static part: the RULES line keeps *+/-1 to +/-10* and adds
  *"never above the rise [Chapter] allows"*. So the rule points at the fact, and two numbers for
  one quantity never sit side by side. That one static line moves all six goldens.
- **Baseline:** P3b's 18 comparison runs are the "before". Each records the main member's score
  every round, and nothing in P3b touches affection. The "after" is 3 runs per config with the
  same flags.
- **Corrected 2026-10-21, after the events were removed:** the comparable "before" is the six
  `none`-arm runs (3 x journalist, 3 x new_hire), because the app now plays exactly that arm.
  All 18 are reported beside it as context. Same flags: `--world chaebol --identity journalist`
  and `--world office --identity new_hire`, `--lang zh --rounds 14 --mode romance`,
  `deepseek-flash`, run sequentially.
- **The clamp is a pure exported function**, `capAffectionRise(changes, round)` in
  `mainAgent.js`, applied in `executeRound` to `parsed.affectionChanges` before the deltas are
  added. `round` is `roundNum + 1`, the same number `[Chapter]` prints, so the cap the model is
  told and the cap applied cannot be two chapters' caps.

#### P4 as built, and measured (2026-10-21)

Built in `055be21`: smoke 1789 -> 1794, 9 mutations RED, six goldens moved by the one RULES
line. One guard drives the real `executeRound` with a stubbed provider. It is the only check
that catches the cap applied one chapter early (`roundNum` instead of `roundNum + 1`).

Live, 6 runs after against the 6 `none`-arm runs before. Same flags, all `deepseek-flash`,
82/84 rounds clean, cache 90.9-91.3%, 0 static-prompt drifts, 0 ledger prefix breaks.

| main member | before (none arm, n=6) | after (P4, n=6) |
| --- | --- | --- |
| round 6 | 33-43, mean 39.5 | **30-35, mean 32.3** |
| round 14 | 64-81, mean 76.0 | **65-74, mean 69.3** |
| Confirmed (66+) by round 14 | 5 of 6 | 5 of 6 |
| mean rise per round, 起 / 承 | 4.6 / 4.6 | **3.4** / 4.6 |
| falls | 0 | 0 |

- **起 works, and not only by clamping.** Every run is at or under the +4 ceiling (max 36 at
  R6), and the mean applied rise is 3.4. That is below the cap, so the model, told the cap in
  `[Chapter]`, also asks for less.
- **承's +6 almost never binds.** The model's own pace there is about +4.6 a round, so the cap
  changes nothing in 承. Round 14 drops only by the 起 deficit carried forward. Confirmed still
  arrives by R14 in 5 of 6 runs. It now lands on R13-14 (65, 66, 67, 70, 74, 74) instead of
  R11-12, but it is still inside 承. The design doc ends 承 with both *beginning to notice*.
- **Yuhan's call: is Confirmed by the end of 承 acceptable?** If not, the lever is 承's cap.
  Calculated, not measured: at +4 in 承, R14 is at most 32 + 8 x 4 = 64, under Confirmed. The
  cost is that the cap then binds most 承 rounds, so the pace becomes the game's number rather
  than the story's.
  **Decided 2026-10-21 (Yuhan): 承 stays at +6.**
- **Not changed by P4, and still open:** 0 falls in 84 rounds (`docs/PROPOSALS.md` §1).
- **Two flags, both read, neither caused by P4:**
  - `kkt-transcribed-in-story`: Irene says three lines aloud in the scene, then the round's Kakao
    repeats them. This is the reverse of the defect the rule targets, a Kakao copying the
    prose. Recorded only (n=1).
  - `real-name-vocative`: in an office run, someone tells Seulgi "姜涩琪，你那份排期表，中午前发我".
    Outside the idol world a real name in dialogue is correct (P1, Q2). So this is most likely
    the grader not knowing the world rule. **Unverified**, and not fixed here.

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

**Design (2026-10-21):**
- **Its own line, `[Prologue]`, from a pure `buildPrologueLine(round)`, not inside
  `buildTailRules`.** It is keyed on the round, like `[Chapter]`, and `buildTailRules` takes
  no round; the two dials stay its only job. `round` is `roundNum + 1`, the number `[Chapter]`
  prints, and every round but 1 returns the empty string.
- **Inside `story`, not a new schema key.** A key would move the static schema and all six
  goldens to carry one round's text. The prologue is the story's first paragraph, then a
  blank line, so the export's paragraph split and the stats box are unaffected.
- **It must not contradict three static rules, so it names them:** the scene after it opens on
  a person (`prose.openWith`); the cast are no closer to her than her identity's `[First
  meeting]` in section 6 says; nobody outside MEMBER PROFILES is named (P9). It counts toward
  the story's length, so round 1 does not grow.
- **This is the one place the lesson of P3 is wanted.** A tail line reads as a cue to act on
  now, and round 1 is exactly when it should be acted on, once.
- A retry of round 1 regenerates from `stats.week` 0 and gets the line again; a loaded save and
  the epilogue never reach round 1.

#### P6 as built, and seen live (2026-10-21)

Smoke 1794 -> 1798, 9 mutations RED (two of them first CRASHED because the heredoc that wrote
the mutation file turned its `\\n` into a raw newline; rewritten with the Write tool, both RED).
No golden moved. One guard drives the real `executeRound` for rounds 1 and 2 and asserts the
line is in round 1's tail only, and that the static prompt is the same in both rounds and never
carries it. Either half alone is vacuous.

Live, 4 runs x 2 rounds, `deepseek-flash`, `--mode romance`: chaebol/zh/`lawyer`,
office/en/`new_hire`, kpop_idol/zh (default identity), campus/ko/`junior_student`. 8/8 rounds
clean, 88.6-91.1% cache, 0 drifts.
- **Round 1 opened with a second-person prologue paragraph in 4 of 4**, then a scene opening on
  a person (dialogue or a member's action) in 4 of 4. **Round 2 had none in 4 of 4.**
- The prologues stayed at a stranger's distance, e.g. en *"You know her name the way you know a
  weather warning."*; ko named the main by her real name, as P1 asks outside the idol world.
- **Not judged:** the register of the zh and ko prologues. The zh chaebol one opens on name and
  age (`你叫林夏，今年三十二岁`), and the kpop one says the trainee has been in the industry
  "too long". Whether either reads well is Yuhan's read, not mine.
- Reports: `test/.out/playthrough-1792572243626.json`, `-262787`, `-276530`, `-304471`.

### P7. Atmosphere, appearance, point of view

- `openWith`: one sentence of atmosphere, then a person by the second sentence.
- `style`: also asks for the member's outfit, hair, makeup, expression and hands.
- New rule: first-person view only. Never narrate a member's thoughts.

**Risk:** blind read 5 credited the person-first opening with improving the machine-translated
feel, so this change gets a **blind read of 6 rounds** before release.

#### P7 design (2026-10-21)

**"First-person view" is read as the PLAYER's point of view, not as narration in 我/I.** The
PRONOUN RULE has always narrated the player as "you", and P6's prologue addresses her the same
way; switching to 我 would rewrite both and nobody asked for that. What the rule adds is the
limit: the narration knows only what she sees, hears and feels. **Assumption, Yuhan's to
correct.**

Three register strings, the same English in all three languages (`style` keeps each file's own
novel tradition):

- **`openWith`** becomes: one short sentence of atmosphere (the light, a sound, the weather or a
  smell, one concrete thing, said plainly, no simile, no tour of the room), then a person doing
  or saying something by the second sentence at the latest. **This is bounded on purpose.** The
  old *"Open with 1-2 sentences establishing scene atmosphere"* is what blind read 5 tied to the
  translationese; one plain concrete sentence is the smallest version of what Yuhan asked for,
  and the blind read is what decides whether it is small enough.
- **`style`** gains: when a member is in the scene, one or two concrete details of how she looks
  today (outfit, hair, makeup, expression, hands), chosen for what they say about her now; never
  a head-to-toe inventory, never the same detail every round. The last clause is there because a
  rule asked of every round is a rule that repeats.
- **`pov`**, a new `PROSE_KEYS` entry placed after `openWith` and before the PRONOUN RULE it
  complements: the narration stays with the player and shows only what she perceives; a
  member's thoughts and feelings are never narrated from inside her, they show in what she says,
  does and how she looks. That is also the substitute: the beat survives as behaviour.

**P6's prologue line is reworded in the same commit.** It said the first scene opens *"on a
person as the style rule says"*, a copy of the rule this commit changes. It now points at the
rule (*"as section 3 says every round opens"*) instead of restating it.

**Guards:** every language sends the new opening (one atmosphere sentence, a person by the
second) and none sends the old *establishing scene atmosphere*; the style asks for appearance
and against an inventory; the POV rule reaches the prompt in every language (the existing
derived check covers a new key); the prologue no longer restates the opening.

#### P7 as built, and seen live (2026-10-21)

Built as designed. All six goldens moved by exactly three lines each (`style`, `openWith`, the
new `pov`), diff read. **10 mutations, 10 RED**, each on its own named check: the old opening
back in one language, `no simile` dropped, the old atmosphere rule put back beside the new one,
the appearance sentence or its inventory bound dropped, the POV substitute dropped, the POV line
not rendered or moved after the PRONOUN RULE, and the prologue restating the opening or losing
its pointer. Smoke **1799 / 0**.

**Live, `deepseek-flash`, `kpop_idol` / zh / 练习生 / romance, 3 rounds a run, 3 runs per arm,
arms alternated.** The control arm is `23c96a3` (pre-P7) exported with `git archive` into the
scratchpad, so this tree was never switched. 18 of 18 rounds clean, 0 drifts, 0 prefix breaks,
both arms served by `deepseek-flash`.

- **The opening:** P7 opened **9 of 9** scenes on one sentence of atmosphere (air-con chill, a
  smell, light on the floor, fog on the mirror, the hum of a vent), and a person (the player or a
  member) acts by sentence 2 in 9 of 9. The control opened on a person or on the player's action
  in 9 of 9, as its rule asks. One P7 atmosphere sentence is figurative
  (`把五个人的影子泡得发软`); the others are plain.
- **Appearance:** P7 rounds name an outfit, hair or a drop of sweat when a member enters
  (`白色长袖睡到手腕，头发低低束在颈后`; `头发重新扎过，比早上紧`). The control does too, less
  often (`白衬衫，发丝一丝不乱`). Not counted, read.
- **POV:** no P7 sentence narrates a member's inner state; the one near-miss is hedged from
  outside (`说完她才像意识到什么`). The control has one plain inner statement
  (`一点也不觉得丢人`). n is far too small to call that a difference.
- **Noticed, not caused by P7 as far as n=3 shows:** every P7 round 1 was set in the morning
  (`清晨七点`, `上午九点`) and every control round 1 at `晚上九点`. Two P7 round 1s open
  `你推门进去`. Recorded only.
- **Not judged: the register.** That is the blind read.

**The blind read is owed, and it gates the release.** Rounds 2 and 3 of each run, 6 per arm, 12
in all, shuffled with a fixed seed, labels hidden: `p7-blind-packet.md` in the session
scratchpad, key in `p7-blind-key.json` beside it. Ratings 自然 / 一般 / 翻译腔 as in reads 3-5,
plus where the stiff sentences sit. Reports: `test/.out/playthrough-1792572903152.json`,
`-946331`, `-988546` (P7) and `test/.out/p7-control/` (control).

### P8. Random events, generated rather than pooled

- **Schema:** a new `"event"` field (a string or null), placed after `story` and before `summary`.
- **Rate, set by the story-mode rules:**

  | Mode | Event rate |
  | --- | --- |
  | free | always null |
  | romance | about 1 round in 3 |
  | pressure | about 1 round in 2 |
  | dramatic | about 1 round in 2 |

- **Context:** the event follows from the chapter, the stage and the stats. (It used to say "it
  may be an unlocked typical event from P3"; the typical events were removed on 2026-10-21. Read
  "P3 removed" before reintroducing any authored pool: a line in the tail reads as a cue.)
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

### P11. The romance rule names a stage in English in every language

Every world's `modes.romance` ends *"Members flirt during Flirting stage."*, the same English in
all three language files. A zh tail prints that stage as `暧昧期` and a ko tail as `썸`, so the tail
names one stage twice in two vocabularies, which is the `[Stage Changes]` id-vs-name shape. It is
also a second copy of a rule section 9 now states, since P2 says what each stage allows.

**The fix deletes the copy and points at the rule:** *"Members flirt once their own stage in
[Affections] allows it (section 9), never before."* No stage is named, so no language can disagree,
and no placeholder machinery is needed. All twelve files, both mirrors. The tail is the always-miss
message, so no golden moves.

**Guard, derived:** across every world, language and mode, a rendered story-mode rule names no
stage from another language's ladder.

### P12. One round number for the model, and `R1` means one thing

The model sees three numberings of one round:
- the **ledger** labels a stored round by its index from 0 (`R0:`, `=== Round 4 ===` for the fifth);
- **`[Player Status] Round:`** prints the rounds completed, one behind the round being written;
- **`[Chapter]`** says *this is round N*, from 1, which is also what the stats box shows the player.

And since P1, **`R1` / `R2` / `R3` are the address ladder's rungs** in section 6, while the ledger
writes a round-1 summary as `R1: ...`. Two quantities under one label.

**The fix:** the ledger renders the player's number (`h.round + 1`) and writes summaries as
`Round N:` like its full entries; `Round:` leaves `[Player Status]`, because `[Chapter]` already
carries the round and one fact belongs in one place. The **stored** `round` values do not change:
`[Rounds Absent]`, `memberAppearances` and the map read them, and they are consistent with each
other.

**Cost:** every existing save's ledger misses the cache once on the first round after the update.
A summary line grows by about one token, up to 45 of them, cached after that. No golden moves,
because goldens are system prompts.

### P10. A new round scrolls to its own top

**Yuhan's report, 2026-10-20.** When a round arrives, the story panel scrolls to the **end** of it,
so the player has to scroll back up to find where the round starts. The new round's stats box
should land at the top of the panel, with the story under it.

**The fix is a rule about when to scroll where**, not a new scroll call. It lives in one pure
function, `storyScrollAction(prev, next)` in `src/utils/storyScroll.js`, so it can be tested
offline:
- **While a round is generating:** scroll to the bottom, as now. The player's choice bubble and the
  loading dots are what she is waiting on.
- **When a round arrives**, meaning loading ended, or the message count changed while not loading
  (a loaded save): scroll the panel so the latest round's top sits at the top.
- **Otherwise, do not move.** Saving an edited story changes the content and nothing else. Today
  that jumps to the end, and it should not.

The panel scrolls itself (`scrollTo` on its own element), measured from the round's
bounding box. A round that errored is an assistant message too, so its notice lands at the top the
same way.

**Not verifiable offline:** whether it feels right on a phone. Smooth scrolling over a long
round is the part a guard cannot see.

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
