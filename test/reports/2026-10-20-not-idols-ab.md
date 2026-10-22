# The world-level "no one in this cast is an idol" rule - A/B, 2026-10-20

**Question.** In a non-idol world, does the model bring a member's real idol past into the
prose (trainee years, dance practice, a stage), and does the world-level rule added in
`bf0cc4e` stop it?

**Found by** one run before the fix: chaebol / zh / `lawyer`, all five members restaged, Seulgi
said 「这家的牛骨汤，我练习生时候常吃」 and 「我练舞练到凌晨」 and carried 乐谱. None of it was in
the prompt.

## Method

- `node test/playthrough.mjs --world chaebol --identity lawyer --lang zh --rounds 8`,
  `deepseek-flash` (DeepSeek Official), restaging on (5/5 members restaged every run).
- **Treatment:** the build at `cd4da85`. **Control:** the same build with ONE line changed -
  `const notIdols = true ? "" : ...` - so the only difference is whether the rule renders.
  Restored from a file copy after every control run; md5 checked after each batch.
- 8 runs per arm back to back, then 22 more per arm **alternating T, C, T, C**, because the
  first control leaks were clustered in time.
- Scanner: a zh word list over the **prose only** (练习生, 练舞, 练习室, 出道, 舞台, 舞蹈, 编舞,
  乐谱, 粉丝, 偶像, 录音, ...). It was first run against the original leaking report and found
  5 of 5. **Every hit was read by hand**; run-level verdicts below are from the reading, not
  the count.

## Result

| arm | runs | rounds | runs with an idol fact in the prose |
| --- | --- | --- | --- |
| rule ON | 30 | 240 | **1** - and ambiguous: 「我、我先走了，要赶回去练习。」 (practice what is not said) |
| rule OFF | 30 | 240 | **7** |

Control leaks, read: a 舞蹈指导室 and 新编舞的试排 in the family company; 「练舞练到半夜」 and
「练舞练到凌晨」 (Seulgi, the original sentence nearly verbatim); 「公司楼上练舞的人」 with a
练习室 key; 「从练习室回来」; 「舞台上那个精确到呼吸的全能ACE」 with 排练走位图; 「像刚从练习室
还是什么地方赶回来」; 「舞蹈室的钥匙」.

False positives excluded from both arms: 录音 / 录音笔 (meeting recordings, 4 hits) and
「水晶灯把每一张圆桌都照得像舞台」 (a simile).

**Fisher exact, run level:** 7/30 vs 1/30 -> p = 0.026 one-sided, 0.052 two-sided.
Counting the ambiguous run as clean, 7/30 vs 0/30 -> p = 0.011 two-sided.

**Reading:** the rule cuts the leak from about one run in four to about one in thirty. It is a
measurement on one world, one identity, one language and one model, and Seulgi is the member
who leaks almost every time - so "the rule works" is supported for this configuration and not
established beyond it.

## Social posts and Kakao - a second, smaller A/B, same day

The harness now stores every round's social post and Kakao text (`transcript.socialText`,
`transcript.kktText`). 8 more runs per arm, alternating, same command and model:

| arm | runs | posts + Kakao scanned | runs leaking in posts/Kakao | runs leaking anywhere |
| --- | --- | --- | --- | --- |
| rule ON | 8 | 139 | **0** | **0** |
| rule OFF | 8 | 128 | **2** | **4** |

Control posts, both Seulgi: 「今天的练习室阳光很好，压腿压到怀疑人生」, 「今天也是在练习室泡到天黑
的一天」. The one treatment prose hit was a false positive (「动作利落得像是练习过很多次」).
Small n; it says the rule reaches the posts too, not by how much.

## Not measured

- en and ko: the word list is zh. The ko runs that night were 6/6 clean on the graders and were
  read for positions, not for idol facts.

## Same night, same harness

- **7 of 64 rounds in the first control batch were total parse failures** (one stray `}`), all
  complete responses. Fixed in `cd4da85`. In the 44 alternating runs after it, 0 rounds fell
  back **and 0 retries fired** - the failures did not recur, so the retry path is verified
  offline (against the verbatim response) and **has not been observed firing live**.
- One control round flagged `kkt-transcribed-in-story` - the known open issue in CLAUDE.md,
  unrelated to either arm.
- The player-role block in the restaging prompt **framed** the cast on its first wording
  (board secretary 3 of 5 runs vs 0 of 5 without it). Reworded in `cd4da85`, re-measured: 1
  secretary in 25 positions, family framing back.
