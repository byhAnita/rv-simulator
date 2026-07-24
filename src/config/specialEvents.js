// src/config/specialEvents.js
// Phase 4 + v12: Special event lists, career/emotional events, HE descriptions, epilogue prompts
// Queue system: career mid/late, emotional late, and all rhythm events carry intro:{zh,en,ko}
// Career early and emotional early are auto-injected (no intro needed).

// ---------------------------------------------------------------------------
// ROMANTIC_EVENTS — affection-threshold sub-lists
// ---------------------------------------------------------------------------
export const ROMANTIC_EVENTS = {
  attraction: [
    {
      id: "romantic_attr_1",
      prompt: "Build a scene where you unintentionally help fix her collar or hair — first time this close physically, both freeze for a second before the moment passes.",
      intro: {
        zh: "她领子翻了，你犹豫了一秒，伸出手",
        en: "Her collar is flipped. You hesitate, then reach over to fix it",
        ko: "그녀의 칼라가 뒤집혀 있었다. 잠깐 망설이다 손을 뻗었다",
      },
    },
    {
      id: "romantic_attr_2",
      prompt: "Build a scene of late-night work together that ends with walking her back in comfortable silence — player thinks: I want to hold onto this moment forever, as if it would be fine if this road never ended.",
      intro: {
        zh: "又加班到很晚，你主动说送她走",
        en: "Work runs late again. You offer to walk her back",
        ko: "또 야근이 길어졌다. 바래다주겠다고 먼저 말했다",
      },
    },
    {
      id: "romantic_attr_3",
      prompt: "Build a scene where she turns around in backlight and calls your name — player's heart skips before they can stop it, a private moment of realizing something.",
      intro: {
        zh: "走廊另一头，她回过头来",
        en: "She turns at the end of the corridor and calls your name",
        ko: "복도 반대편에서 그녀가 고개를 돌렸다",
      },
    },
    {
      id: "romantic_attr_4",
      prompt: "Build a scene where she is alone, quietly repeating a single movement or line over and over — player stays without saying anything; when she notices, she just smiles and continues. Some unspoken understanding takes shape in that moment.",
      intro: {
        zh: "排练室还亮着灯，你走过，停了下来",
        en: "The practice room light is still on. You pass by, then stop",
        ko: "연습실에 아직 불이 켜져 있었다. 지나치다 멈췄다",
      },
    },
    {
      id: "romantic_attr_5",
      prompt: "Build a scene where she borrows something of the player's — [a jacket / earphones / a charger] — and returns it carrying a faint trace of her presence. Player doesn't put it away immediately.",
      intro: {
        zh: "她的耳机没电了，看了看你",
        en: "Her earphones just died. She glances at you",
        ko: "이어폰 배터리가 다 됐다며 당신을 쳐다봤다",
      },
    },
  ],
  ambiguous: [
    {
      id: "romantic_amb_1",
      prompt: "Build a scene where she naturally drinks from your bubble tea straw, says it's too sweet — neither of you mentions what just happened.",
      intro: {
        zh: "你顺手买了杯奶茶，走向她",
        en: "You buy a cup of bubble tea and head over to where she is",
        ko: "버블티를 하나 사서 그녀가 있는 쪽으로 걸어갔다",
      },
    },
    {
      id: "romantic_amb_2",
      prompt: "Build a scene where she invites player to the group dorm late at night — when it gets very late she tentatively asks if player wants to stay over in her room, but there's only one double bed; a pillow wall goes up, then disappears sometime in the night — morning is awkward and warm.",
      intro: {
        zh: "聊到很晚，她说外面下雨了",
        en: "You've been talking for hours. She mentions it's raining outside",
        ko: "이야기가 길어졌다. 그녀가 밖에 비가 온다고 했다",
      },
    },
    {
      id: "romantic_amb_3",
      prompt: "Build a scene on rough ground where she reaches for your hand to help; once you're on smooth pavement neither of you lets go — no one says anything.",
      intro: {
        zh: "你们要走的那段路有点不好走",
        en: "The path ahead looks uneven. She's wearing the wrong shoes for it",
        ko: "앞길이 울퉁불퉁했다. 그녀는 걷기 불편한 신발을 신고 있었다",
      },
    },
    {
      id: "romantic_amb_4",
      prompt: "Build a scene of a night walk in the park — she leans close and asks 'are you blushing?' She's watching your face, not the path.",
      intro: {
        zh: "天气好，你提议去公园转转",
        en: "The weather is good. You suggest a walk in the nearby park",
        ko: "날씨가 좋았다. 근처 공원을 걷자고 제안했다",
      },
    },
    {
      id: "romantic_amb_5",
      prompt: "Build a scene of two people and a phone screen — she finds a photo of the two of them in player's album, pauses for two full seconds, then asks: 'Is this your wallpaper?' Her tone is light. Her eyes are not.",
      intro: {
        zh: "她拿过你的手机看你刚拍的照片",
        en: "She picks up your phone to look at the photos you just took",
        ko: "방금 찍은 사진을 보겠다며 폰을 집어 들었다",
      },
    },
    {
      id: "romantic_amb_6",
      prompt: "Build a scene where she asks out of nowhere: 'If we weren't in this kind of relationship, what do you think we'd be?' — silence fills the space between them; neither answers, but neither changes the subject either.",
      intro: {
        zh: "气氛很闲，你们聊到了一个奇怪的假设",
        en: "The mood is easy. The conversation drifts to a strange hypothetical",
        ko: "분위기가 편안했다. 대화가 이상한 가정으로 흘렀다",
      },
    },
  ],
  pre_confession: [
    {
      id: "romantic_pre_1",
      prompt: "Build a scene where player drives her home from a late work night — she falls asleep in the passenger seat; player drives in silence for a long time, hesitating; when she stirs and wakes, player finally says 'I think I like you.'",
      intro: {
        zh: "你开车送她，上了高速她就睡着了",
        en: "You're driving her home. On the highway, she falls asleep",
        ko: "그녀를 태우고 달렸다. 고속도로에서 그녀가 잠들었다",
      },
    },
    {
      id: "romantic_pre_2",
      prompt: "Build a scene watching a film together — she watches the screen, player spends the whole time watching her face and realizes she hasn't absorbed any of the film either.",
      intro: {
        zh: "你们约好一起看一部都没看过的电影",
        en: "You agree to watch a film together — one neither of you has seen",
        ko: "둘 다 아직 보지 않은 영화를 함께 보기로 했다",
      },
    },
    {
      id: "romantic_pre_3",
      prompt: "Build a scene where she is sick and player stays — brings medicine, sits beside her, and somewhere in the quiet of the room it becomes obvious to both of them that this is not a normal thing to do for someone you are only a little fond of.",
      intro: {
        zh: "她说嗓子不舒服，感觉快发烧了",
        en: "She says her throat hurts. She might be running a fever",
        ko: "목이 아프다고 했다. 열이 나는 것 같기도 하다고",
      },
    },
  ],
  together: [
    {
      id: "romantic_tog_1",
      prompt: "Build a scene where she texts at midnight just to say she misses you — no reason, no occasion, just does.",
      intro: {
        zh: "深夜手机亮了，是她发来的消息",
        en: "Your phone lights up past midnight. It's her",
        ko: "한밤중에 폰이 켜졌다. 그녀였다",
      },
    },
    {
      id: "romantic_tog_2",
      prompt: "Build a scene where she calls you to go grocery shopping — you walk the aisles for an hour, nothing really needed, she just wanted to go together.",
      intro: {
        zh: "她说要去超市，问你要不要一起去",
        en: "She says she's heading to the grocery store and asks if you want to come",
        ko: "마트 간다며 같이 갈 거냐고 물었다",
      },
    },
    {
      id: "romantic_tog_3",
      prompt: "Build a scene where without being asked, she quietly untangles your earphone cord from your bag — small, instinctive, completely natural.",
      intro: {
        zh: "你在包里找耳机，一团乱",
        en: "You're digging through your bag for tangled earphones",
        ko: "가방에서 엉킨 이어폰을 꺼내려고 씨름하고 있었다",
      },
    },
    {
      id: "romantic_tog_4",
      prompt: "Build a scene of the first time holding hands in public — neither planned it; she reaches over in a crowd and doesn't let go; they walk a full block before either speaks.",
      intro: {
        zh: "街上很挤，你们走在人群里",
        en: "The street is crowded. You're walking together through it",
        ko: "거리가 붐볐다. 사람들 사이를 함께 걸었다",
      },
    },
  ],
};

// ---------------------------------------------------------------------------
// PR_CRISIS_EVENTS — secrecy-threshold sub-lists
// ---------------------------------------------------------------------------
export const PR_CRISIS_EVENTS = {
  low: [
    {
      id: "pr_low_1",
      prompt: "Build a scene reacting to a vague speculation thread — someone posted a blurry off-stage photo; it trends briefly in shipper fan community; player and the member see it.",
      intro: {
        zh: "有人在论坛发了一张模糊的合照",
        en: "Someone posts a blurry photo of you two on a forum and it starts spreading",
        ko: "누군가 포럼에 흐릿한 사진을 올렸고 퍼지기 시작했다",
      },
    },
    {
      id: "pr_low_2",
      prompt: "Build a scene where a fan clip circulates showing the member smiling differently at player offstage — warmth under pressure as she and player navigate the attention quietly.",
      intro: {
        zh: "粉丝把你们的后台片段截了出来",
        en: "Fans clip a backstage moment of you two and post it",
        ko: "팬들이 무대 뒤 순간을 잘라 올렸다",
      },
    },
    {
      id: "pr_low_3",
      prompt: "Build a scene where her Bubble post is screenshotted and zoomed by fans — something in the background of her selfie is identifiable as belonging to the player. The comments are spiraling. Neither of them posted anything wrong.",
      intro: {
        zh: "她发了条Bubble，评论区开始注意到背景里的东西",
        en: "She posts on Bubble. The comment section notices something in the background",
        ko: "그녀가 버블을 올렸다. 댓글란이 배경 속 무언가를 눈치챘다",
      },
    },
  ],
  medium: [
    {
      id: "pr_med_1",
      prompt: "Build a scene reacting to an intimate Dispatch-style candid photo surfacing — it trends briefly in the fan community then subsides, but the awareness lingers; player and member must decide their next steps.",
      intro: {
        zh: "有媒体拍到了你们在一起的照片",
        en: "A media account posts candid photos of you two together",
        ko: "미디어 계정이 둘이 함께 있는 사진을 올렸다",
      },
    },
    {
      id: "pr_med_2",
      prompt: "Build a scene where the member's fanbase fractures openly — protective fans vs cpf shippers clashing, both sides tagging player; member and player talk privately about what they're willing to risk.",
      intro: {
        zh: "她的粉丝群里出现了争论，有人@了你",
        en: "Her fan community is splitting. Your name starts appearing in the tags",
        ko: "그녀의 팬덤 안에서 갈등이 생겼다. 당신 이름이 태그에 올라오기 시작했다",
      },
    },
    {
      id: "pr_med_3",
      prompt: "Build a scene where a prominent K-pop news account posts a 'not naming names' thread that is very clearly about them — the thread goes viral among fans; player and member watch it grow in real time.",
      intro: {
        zh: "一个大号发了条「不点名」长文，一眼就能看出说的是谁",
        en: "A major account posts a \"not naming names\" thread. It's very clearly about you",
        ko: "유명 계정이 '이름은 언급 안 하겠지만'으로 시작하는 글을 올렸다. 누구 얘긴지 뻔했다",
      },
    },
  ],
  high: [
    {
      id: "pr_high_1",
      prompt: "Build a scene where a dedicated cpf fan shipper account forms around them with thousands of followers — most fans are warm and excited, but a hostile anti faction also emerges publicly; the scale of attention is unavoidable; player and member discuss honestly what they're willing to face together.",
      intro: {
        zh: "专门磕你们的CP账号开始快速涨粉了",
        en: "A CP account dedicated to you two has been growing. Fast",
        ko: "둘의 CP를 파는 계정이 팔로워를 빠르게 모으고 있었다",
      },
    },
    {
      id: "pr_high_2",
      prompt: "Build a scene where a high-follower influencer posts a public 'I support them' statement — it ricochets across platforms overnight; media outlets start covering the fan frenzy itself; player and member have to decide whether to stay quiet or say something.",
      intro: {
        zh: "一位大博主公开发文表示支持你们",
        en: "A major influencer publicly posts their support for you two",
        ko: "팔로워가 많은 인플루언서가 공개적으로 두 사람을 지지하는 글을 올렸다",
      },
    },
  ],
};

// ---------------------------------------------------------------------------
// DRAMA_EVENTS — affection-gap sub-lists (light comedic rivalry tone)
// ---------------------------------------------------------------------------
export const DRAMA_EVENTS = {
  mild: [
    {
      id: "drama_mild_1",
      prompt: "Build a light comedic scene where Member B catches Member A fixing your scarf/collar and makes a pointed 'oh, how close' comment — warm teasing energy, everyone pretends not to notice the subtext.",
      intro: {
        zh: "成员A帮你整理了一下围巾，成员B刚好路过",
        en: "Member A adjusts your scarf. Member B walks by at exactly that moment",
        ko: "멤버 A가 스카프를 정리해 줬다. 멤버 B가 딱 그 타이밍에 지나갔다",
      },
    },
    {
      id: "drama_mild_2",
      prompt: "Build a light comedic scene where you mention you're tired — Member A immediately offers her shoulder, Member B immediately suggests a nearby cafe — player has to pick one while both wait.",
      intro: {
        zh: "你说了句好累，两个人同时转过头来",
        en: "You mention you're tired. Both of them turn to look at you at the same time",
        ko: "피곤하다고 했다. 두 사람이 동시에 고개를 돌렸다",
      },
    },
    {
      id: "drama_mild_3",
      prompt: "Build a light comedic scene where a group chat becomes mysteriously active whenever player posts anything — Members A and B both reply within seconds and then quietly compete for the wittiest response.",
      intro: {
        zh: "你在群里发了条消息，群突然活跃起来",
        en: "You post something in the group chat. The chat suddenly becomes very active",
        ko: "단체 채팅방에 메시지를 하나 올렸다. 채팅이 갑자기 활발해졌다",
      },
    },
    {
      id: "drama_mild_4",
      prompt: "Build a light comedic scene where Member A and Member B both send the player a photo at the same time — different photos, same implicit question: which one looks better? Player realizes neither is actually about the outfit.",
      intro: {
        zh: "手机同时收到两条消息，两张照片",
        en: "Two messages arrive at the exact same moment. Two different photos",
        ko: "정확히 같은 시간에 메시지 두 개가 왔다. 사진 두 장",
      },
    },
    {
      id: "drama_mild_5",
      prompt: "Build a light comedic scene where Member A helps player take a photo and nails it on the first try — Member B walks over, takes the phone, says the angle was wrong, and retakes it. Both versions are actually identical.",
      intro: {
        zh: "成员A帮你拍完照，成员B走过来说角度不对",
        en: "Member A takes your photo. Member B walks over and says the angle was wrong",
        ko: "멤버 A가 사진을 찍어줬다. 멤버 B가 다가오더니 각도가 잘못됐다고 했다",
      },
    },
  ],
  moderate: [
    {
      id: "drama_mod_1",
      prompt: "Build a comedic scene where both members independently bring you breakfast at the same time — they make eye contact over the two sets of food and say absolutely nothing.",
      intro: {
        zh: "你到工作室，桌上摆着两份早餐",
        en: "You arrive at the studio to find two separate breakfasts already waiting",
        ko: "스튜디오에 도착하니 아침이 두 개 놓여 있었다",
      },
    },
    {
      id: "drama_mod_2",
      prompt: "Build a comedic scene where you're walking with Member A and Member B appears from nowhere, cheerfully claiming she 'just happened to be passing by.'",
      intro: {
        zh: "你正和成员A走着，成员B突然出现了",
        en: "You're walking with Member A. Member B appears, very casually",
        ko: "멤버 A와 걷던 중 멤버 B가 갑자기 나타났다. 아주 자연스럽게",
      },
    },
    {
      id: "drama_mod_3",
      prompt: "Build a comedic scene where Member A invites you to dinner — thirty seconds later Member B texts asking if you're free for dinner tonight.",
      intro: {
        zh: "成员A刚约好今晚一起吃饭，手机又响了",
        en: "Member A just suggested dinner. Your phone buzzes. It's Member B",
        ko: "멤버 A와 저녁 약속을 잡자마자 폰이 울렸다. 멤버 B였다",
      },
    },
    {
      id: "drama_mod_4",
      prompt: "Build a comedic scene where player mentions being free next week — by the next morning, Member A and Member B have both independently filled the entire week with plans, with zero overlap and zero coordination.",
      intro: {
        zh: "你随口说下周没什么安排，第二天日历满了",
        en: "You casually mention you're free next week. By morning your calendar is full",
        ko: "다음 주에 별 일정이 없다고 했다. 다음날 아침 일정이 꽉 차 있었다",
      },
    },
  ],
  intense: [
    {
      id: "drama_int_1",
      prompt: "Build a scene where Member B pulls player aside and sincerely asks 'do you like her?' — not accusatory, just quietly needs to know; warm and a little painful.",
      intro: {
        zh: "成员B把你拉到旁边，说想问你一件事",
        en: "Member B pulls you aside. She says she has one thing to ask",
        ko: "멤버 B가 당신을 옆으로 데려갔다. 할 말이 있다고 했다",
      },
    },
    {
      id: "drama_int_2",
      prompt: "Build a scene where Members A and B end up alone together briefly; when player sees them again they're oddly civil and warm with each other — player suspects a quiet conversation happened.",
      intro: {
        zh: "你一转眼，她们两个不知道什么时候聊上了",
        en: "You look away for a moment. When you look back, they're talking quietly together",
        ko: "잠깐 한눈을 팔았다. 돌아보니 두 사람이 조용히 이야기하고 있었다",
      },
    },
    {
      id: "drama_int_3",
      prompt: "Build a scene where Member B says something like: 'I think I knew before you did.' She's not bitter. She's just honest. It leaves player sitting with a feeling they can't name.",
      intro: {
        zh: "成员B在你旁边坐下来，说了句你没想到的话",
        en: "Member B sits down beside you and says something you didn't expect",
        ko: "멤버 B가 옆에 앉더니 예상치 못한 말을 꺼냈다",
      },
    },
  ],
};

// ---------------------------------------------------------------------------
// CAREER_EVENTS — auto-injected at fixed rounds (early) or enter queue (mid/late)
// Early tier: auto-injected, no intro needed.
// Mid/late tiers: enter queue, intro required.
// ---------------------------------------------------------------------------
export const CAREER_EVENTS = {
  trainee: {
    early: [
      {
        id: "career_trainee_e1",
        prompt: "Build a scene where the player, as a junior trainee, nervously approaches ${n} to ask for advice on [stage presence / vocal breathing / a specific dance move] — she is patient and gives more detail than expected; player leaves with a first flutter of genuine admiration.",
      },
      {
        id: "career_trainee_e2",
        prompt: "Build a scene where player watches ${n} run through a routine alone and their eyes meet — she calls player over and casually shows them a small move. The quiet and her calm attention leave an impression.",
      },
      {
        id: "career_trainee_e3",
        prompt: "Build a scene during a company-wide training session where ${n} is paired with player — she corrects player's posture with a light touch and low words, matter-of-fact; player can't stop thinking about it afterward.",
      },
    ],
    mid: [
      {
        id: "career_trainee_m1",
        prompt: "Build a scene where player and ${n} are the last two left late at night — building quiet, lights half-dimmed. They end up sitting together talking about small things. It's the first time player has seen her completely unguarded.",
        intro: {
          zh: "你留下来加练，发现她也还没走",
          en: "You stay late to practice. Turns out she hasn't left either",
          ko: "늦게까지 연습하다 보니, 그녀도 아직 남아 있었다",
        },
      },
      {
        id: "career_trainee_m2",
        prompt: "Build a scene where ${n} quietly saves food from a group meal for player without being asked — slides it over without comment. Later she asks if player is holding up okay. First time she's asked something personal.",
        intro: {
          zh: "你错过了晚饭，想找点吃的",
          en: "You missed dinner and wander off looking for something to eat",
          ko: "저녁을 걸렀다. 뭔가 먹을 것을 찾아 나섰다",
        },
      },
      {
        id: "career_trainee_m3",
        prompt: "Build a scene where player almost quits after a harsh evaluation — ${n} finds them alone, says nothing for a moment, then just sits down beside them. She doesn't give a pep talk. She just stays. Player doesn't quit.",
        intro: {
          zh: "练习不顺，你一个人坐在走廊发呆",
          en: "Practice went badly. You sit alone in the corridor, not ready to go home",
          ko: "연습이 잘 안 됐다. 복도에 혼자 앉아 멍하니 있었다",
        },
      },
    ],
    late: [
      {
        id: "career_trainee_l1",
        prompt: "Build a scene where player is selected for a company variety show junior special — ${n} is the senior guest. On camera they're professionally warm; off camera between takes she [fixes player's mic / brings water / whispers encouragement]. Fans are already clipping the footage.",
        intro: {
          zh: "公司综艺特辑里有你——也有她",
          en: "The company variety special has you on the list. So does she",
          ko: "회사 예능 특집 섭외 명단에 당신이 있었다. 그녀도 함께였다",
        },
      },
      {
        id: "career_trainee_l2",
        prompt: "Build a scene where both end up sharing a car home from a late company event — city lights pass outside. She falls asleep first. Player watches streetlights move across her face and can't look away.",
        intro: {
          zh: "活动结束太晚，你们被安排坐同一辆车回去",
          en: "The event runs late. You end up in the same car home",
          ko: "행사가 너무 늦게 끝났다. 귀가 차가 같아졌다",
        },
      },
    ],
  },

  manager: {
    early: [
      {
        id: "career_manager_e1",
        prompt: "Build a scene where player, as the new manager, brings milk tea to the rehearsal room as a first-day gesture — ${n} looks up from stretching, says 'you didn't have to,' accepts it, and there's a pause where she seems to be deciding something about the player.",
      },
      {
        id: "career_manager_e2",
        prompt: "Build a scene of player's first schedule coordination meeting — ${n} is the one who reads the briefing and asks precise questions. Afterward she lingers and says directly: 'Do you actually know what you're doing?' Not unkind — just honest. Player respects it immediately.",
      },
    ],
    mid: [
      {
        id: "career_manager_m1",
        prompt: "Build a scene during comeback week — back-to-back shows, fan signs, no real sleep. In the van between schedules ${n} leans back and closes her eyes. Player watches the group exhausted alongside them. She notices and says quietly: 'You're working just as hard as we are.'",
        intro: {
          zh: "来回奔波的间隙，你坐进了她们的车",
          en: "Between schedules, you climb into the van with the group",
          ko: "스케줄 사이 틈에 멤버들의 차에 함께 탔다",
        },
      },
      {
        id: "career_manager_m2",
        prompt: "Build a scene where a schedule goes badly — a delay, a missed slot, a PR moment needing real-time handling. Player and ${n} solve it side by side in a back hallway, communicating in shorthand. Afterward she says: 'Good.' Just that.",
        intro: {
          zh: "现场突发状况，你把她拉到走廊商量",
          en: "Something goes wrong on-site. You pull her aside to sort it out",
          ko: "현장에서 예상치 못한 상황이 생겼다. 그녀를 복도로 불러냈다",
        },
      },
    ],
    late: [
      {
        id: "career_manager_l1",
        prompt: "Build a scene where a new album exceeds sales targets or a tour gets a standing ovation night — player organizes a quiet dinner. At the table ${n} raises a glass toward the player specifically and says something in front of everyone. Player didn't expect to be seen that way.",
        intro: {
          zh: "成绩出来了，你订了个小地方请大家吃饭",
          en: "The numbers came in. You book a quiet dinner to mark the moment",
          ko: "성적이 나왔다. 조용한 자리를 만들었다",
        },
      },
      {
        id: "career_manager_l2",
        prompt: "Build a scene at the end of a long promotional cycle — group has one quiet last evening together. ${n} finds player alone and they talk about the months just passed. She mentions things she noticed that no one else saw.",
        intro: {
          zh: "宣传期快收尾了，难得有个空着的晚上",
          en: "The promotional cycle is winding down. One last evening with nothing scheduled",
          ko: "활동 기간이 거의 끝나가는데, 모처럼 비어 있는 저녁이 생겼다",
        },
      },
    ],
  },

  ceo: {
    early: [
      {
        id: "career_ceo_e1",
        prompt: "Build a scene where player, as the new young CEO, holds a first comeback or project planning meeting with the group — ${n} listens then raises one point that reframes the entire proposal. Player is caught off guard. It changes the meeting.",
      },
      {
        id: "career_ceo_e2",
        prompt: "Build a scene where player visits the rehearsal room unexpectedly with snacks one evening — the group doesn't expect a CEO to show up in person. ${n} is the only one who doesn't act differently. She just makes room.",
      },
    ],
    mid: [
      {
        id: "career_ceo_m1",
        prompt: "Build a scene where player is alone working through a difficult company decision — ${n} finds them after hours and sits across without preamble, asks what's actually wrong. First time anyone has asked the player that not because it's their job.",
        intro: {
          zh: "你一个人留在办公室，灯亮到很晚",
          en: "You stay alone in the office well past midnight, lights still on",
          ko: "혼자 사무실에 남았다. 불이 한참 늦게까지 켜져 있었다",
        },
      },
      {
        id: "career_ceo_m2",
        prompt: "Build a scene where player makes a company call the group didn't hope for — ${n} comes to player afterward. She doesn't agree. But she says: 'I think you thought about it more than you're showing.' Player isn't sure whether to feel understood or exposed.",
        intro: {
          zh: "你做了个大家都不太喜欢的决定，办公室很安静",
          en: "You made a call no one was happy about. The building has gone quiet",
          ko: "아무도 좋아하지 않을 결정을 내렸다. 사무실이 조용해졌다",
        },
      },
    ],
    late: [
      {
        id: "career_ceo_l1",
        prompt: "Build a scene at an awards show where the group wins something significant — on stage ${n} thanks the company and pauses. She looks into the camera and says something that isn't quite for fans. Player watching offstage knows it's for them.",
        intro: {
          zh: "你在后台等着，颁奖典礼的直播开着",
          en: "You wait backstage as the awards ceremony streams. She's at the mic",
          ko: "무대 뒤에서 기다렸다. 시상식 생중계가 흘러나왔다",
        },
      },
      {
        id: "career_ceo_l2",
        prompt: "Build a scene where player and ${n} are alone in an empty conference room after a long event — she sits on the table instead of a chair and says: 'You're different from what I expected.' Player asks what she expected. She smiles and doesn't answer directly.",
        intro: {
          zh: "活动结束，大家都走了，你在会议室收尾",
          en: "Everyone's gone. You stay behind to wrap things up in the empty conference room",
          ko: "다들 돌아간 뒤 회의실 마무리를 위해 남았다",
        },
      },
    ],
  },

  artist: {
    early: [
      {
        id: "career_artist_e1",
        prompt: "Build a scene of a private collaborative rehearsal between player and ${n} for a joint stage — just the two of them. They run the choreography, mess up, restart. By the third hour they're running it clean, breathing in sync. She says: 'You're easier to work with than I thought.'",
      },
      {
        id: "career_artist_e2",
        prompt: "Build a scene where player and ${n} are introduced for the first time at a joint showcase — they end up in the same green room. She asks to hear player's part of the song. Player sings a few bars. She tilts her head: 'Again.' Player does. She nods like she's decided something.",
      },
    ],
    mid: [
      {
        id: "career_artist_m1",
        prompt: "Build a scene where the joint stage goes live — one specific moment (a synchronized turn, a lyric handoff, a gaze held a beat too long) gets clipped and posted. CP fan accounts explode. Backstage ${n} shows player the clips on her phone without comment. Both look at the screen for a moment.",
        intro: {
          zh: "有人把你们合舞的片段截了出来发出去了",
          en: "Someone clips the moment from your joint stage and posts it online",
          ko: "합동 무대 영상의 한 장면이 잘려 올라왔다",
        },
      },
      {
        id: "career_artist_m2",
        prompt: "Build a scene at an industry event where player and ${n} are seated together — cameras nearby. She writes something and slides it over. It's a joke about the host. Player tries not to laugh. Someone photographs them at that exact moment. The photo trends.",
        intro: {
          zh: "活动的座位安排让你们挨在了一起",
          en: "The seating chart puts you right next to her at the industry event",
          ko: "행사 좌석 배치가 그녀 바로 옆이었다",
        },
      },
    ],
    late: [
      {
        id: "career_artist_l1",
        prompt: "Build a scene where an old variety show clip of player and ${n} resurfaces — a moment of [accidental closeness / she pulling player back by the sleeve / a long look with no explanation] — the clip goes viral. Both are asked about it in separate interviews. Fan-edited side by side, their answers are not contradictory.",
        intro: {
          zh: "一个很久之前的综艺片段突然上了热搜",
          en: "An old variety clip of the two of you suddenly starts trending",
          ko: "오래전 예능 영상 클립이 갑자기 화제가 됐다",
        },
      },
      {
        id: "career_artist_l2",
        prompt: "Build a scene of a late-night studio session — player is recording, ${n} drops by for unrelated reasons and ends up staying. She sits in the corner, just present. At some point player asks her opinion on a take. She walks into the booth to listen better. They end up very close in a small space.",
        intro: {
          zh: "你在录音棚收工，门开了，是她",
          en: "You're finishing a late studio session when the door opens. It's her",
          ko: "늦은 녹음 세션을 마무리하던 중 문이 열렸다. 그녀였다",
        },
      },
    ],
  },

  fan: {
    early: [
      {
        id: "career_fan_e1",
        prompt: "Build a scene at a fan sign event — ${n} signs the player's album and without looking up adds something small beside her name: [a tiny doodle / a phrase only the player would parse / a sentence that could mean anything]. Player stares at it the whole way home.",
      },
      {
        id: "career_fan_e2",
        prompt: "Build a scene at a fan meet where player gets a front-row seat — ${n}'s gaze crosses the crowd and lands on player for two beats longer than anyone else. Player spends the next hour telling themselves it was just the angle.",
      },
      {
        id: "career_fan_e3",
        prompt: "Build a scene at ${n}'s fan sign event — it's the player's turn for the polaroid shot. Player is nervous and leaves a small gap, making a heart sign without touching ${n}'s hand. The moment the staff clicks the shutter, ${n} shifts her hand over and closes the gap. When the polaroid develops, their hands are pressed together, fingers interleaved in the heart. Player stares at the photo for a long time after leaving.",
      },
    ],
    mid: [
      {
        id: "career_fan_m1",
        prompt: "Build a scene where player posts in ${n}'s Bubble fan board — nothing special, just genuine. ${n} doesn't reply directly. But her next post continues the exact topic, phrased like a response to someone. Fans notice the timing. Player notices the words.",
        intro: {
          zh: "你在她的Bubble留言板上写了点什么",
          en: "You leave a comment on her Bubble fan board — nothing special, just honest",
          ko: "그녀의 버블 팬 게시판에 글을 남겼다. 특별한 건 없었고, 그냥 솔직하게",
        },
      },
      {
        id: "career_fan_m2",
        prompt: "Build a scene of an unexpected street encounter — ${n} is off-duty, [buying coffee / waiting at a crossing / just walking]. She sees player first. She uses player's name. Player doesn't know how she remembered it.",
        intro: {
          zh: "街上，你看到了一个熟悉的背影",
          en: "You spot a familiar silhouette on the street and slow your steps",
          ko: "거리에서 낯익은 뒷모습이 보였다. 발걸음이 느려졌다",
        },
      },
      {
        id: "career_fan_m3",
        prompt: "Build a scene where ${n} does a Q&A and picks a question the player submitted — she reads it, pauses, and gives an unusually personal answer. Afterward player watches the clip three times.",
        intro: {
          zh: "她开了答疑直播，你鬼使神差发了个问题",
          en: "She's doing a live Q&A. You submit a question without overthinking it",
          ko: "그녀가 Q&A 라이브를 켰다. 별생각 없이 질문을 보냈다",
        },
      },
    ],
    late: [
      {
        id: "career_fan_l1",
        prompt: "Build a scene where player attends ${n}'s fan sign in an elaborate disguise — [middle-aged aunt / grandma look: curly wig, old-fashioned glasses, floral blouse], seated third row from the front. When it's player's turn, ${n} looks up and recognition crosses her face a full second before she contains it. She keeps the act going: 'Thank you, auntie, you came so far.' Her voice is steady. Her eyes are not.",
        intro: {
          zh: "你想再去一次签售——换个面孔",
          en: "You want to attend another fan sign. With a different face this time",
          ko: "싸인회에 또 가고 싶었다. 이번엔 다른 얼굴로",
        },
      },
      {
        id: "career_fan_l2",
        prompt: "Build a scene of a date where player wears the same disguise from the fan sign to protect ${n}'s image — at some point during the meal she reaches across and removes player's glasses. 'There's no one here,' she says quietly. Her fingertip grazes player's ear. She puts the glasses in her own pocket. A beat. Then very softly: 'I missed you.'",
        intro: {
          zh: "她说想出去转转，你还穿着那套行头",
          en: "She wants to go out. You're still wearing the disguise",
          ko: "그녀가 나가고 싶다고 했다. 당신은 아직 변장 차림이었다",
        },
      },
    ],
  },
};

// ---------------------------------------------------------------------------
// EMOTIONAL_EVENTS — early tier: auto-injected (no intro). Late tier: enter queue (intro required).
// ---------------------------------------------------------------------------
export const EMOTIONAL_EVENTS = {
  secret_crush: {
    early: [
      {
        id: "emo_crush_e1",
        prompt: "Build a scene where ${n} unknowingly reveals she has memorized a small preference of the player's — she produces [the exact drink player mentioned once in passing / a snack she noticed player always picks / a seat she quietly held]. She doesn't explain how she knew. Player doesn't ask. But something shifts.",
      },
      {
        id: "emo_crush_e2",
        prompt: "Build a scene where ${n} does something tiny that could only be habit — she instinctively [moves out of player's path before player reaches her / reaches for player's cup to refill it / turns the volume down before player asks]. She does it without thinking. So did player, once, for someone they liked.",
      },
    ],
    late: [
      {
        id: "emo_crush_l1",
        prompt: "Build a scene where ${n} quietly tells player about a secret crush she had in the past — how it started: '${randoms.meet}'. The moment she knew: '${randoms.flipped}'. How she never said anything: '${randoms.hiddencare}'. She's calm while telling it, like old news. Player realizes slowly who she's describing.",
        intro: {
          zh: "夜渐深，你们聊起了各自藏过的秘密",
          en: "The night gets late. The conversation drifts to secrets kept",
          ko: "밤이 깊어졌다. 대화가 서로 숨겨온 이야기로 흘렀다",
        },
      },
      {
        id: "emo_crush_l2",
        prompt: "Build a scene where it comes out sideways — ${n} says something like 'I've thought about you longer than you know' without context or finish. She changes the subject. Player sits with it the rest of the day.",
        intro: {
          zh: "你问了一句平时绝对不敢问的话",
          en: "You ask something you'd never normally say out loud",
          ko: "평소라면 절대 하지 않을 말을 꺼냈다",
        },
      },
    ],
  },

  ex_gf: {
    early: [
      {
        id: "emo_ex_e1",
        prompt: "Build a scene of forced proximity — same room, same task, same rhythm. ${n} is deliberate about distance: polite, composed, not cold. But player catches the exact moment she almost does something automatic — almost '${randoms.excustom}' — and stops herself. She's been practicing not being familiar.",
      },
      {
        id: "emo_ex_e2",
        prompt: "Build a scene where ${n} does something professionally courteous that used to be personal — she [brings coffee / holds a door / passes something across] in exactly the way she always did. She doesn't seem to notice. Player notices for both of them.",
      },
    ],
    late: [
      {
        id: "emo_ex_l1",
        prompt: "Build a scene where player shows ${n} something she gave them — '${randoms.exstuff}' — without ceremony. She goes quiet. After a moment: 'I didn't think you still had that.' The conversation finds its way to the reason they ended: '${randoms.breakup}'. Things neither said at the time surface slowly.",
        intro: {
          zh: "你翻出了一件一直没扔的旧东西",
          en: "You come across something old you never got rid of",
          ko: "버리지 못했던 오래된 물건이 눈에 띄었다",
        },
      },
      {
        id: "emo_ex_l2",
        prompt: "Build a scene of a quiet conversation that turns unexpectedly honest — ${n} says: 'I used to think I understood why we stopped. Now I'm not sure I did.' She doesn't ask player to respond. But she's looking at them like the answer matters.",
        intro: {
          zh: "你们第一次在没人的地方聊到了以前的事",
          en: "For the first time, somewhere quiet, the past comes up between you",
          ko: "처음으로 둘만 있는 조용한 곳에서 과거 이야기가 나왔다",
        },
      },
    ],
  },

  fate_encounter: {
    early: [
      {
        id: "emo_fate_e1",
        prompt: "Build a scene where player returns something ${n} left behind that night — a small object, handed over in a normal context. Its presence makes both pause. They don't name what it's from. The thing is back in her hands and both pretend the moment didn't just last three beats too long.",
      },
      {
        id: "emo_fate_e2",
        prompt: "Build a scene of enforced normalcy — same space, both performing total neutrality. When their eyes meet there's a flicker: not embarrassment exactly, more like awareness. Neither breaks it. Neither escapes it. Something from that night lives in the room with them.",
      },
    ],
    late: [
      {
        id: "emo_fate_l1",
        prompt: "Build a scene where they finally talk about that night — and both admit neither was as gone as they pretended. ${n} says: 'I remembered it the next morning. I remembered all of it.' Player asks if she regrets it. She takes a moment. Her answer isn't simple.",
        intro: {
          zh: "那件事从来没被正面提过——直到今晚",
          en: "That thing between you has never been named out loud. Until tonight",
          ko: "그 일은 한 번도 직접 언급된 적 없었다. 오늘 밤까지는",
        },
      },
      {
        id: "emo_fate_l2",
        prompt: "Build a scene where ${n} says quietly: 'I don't think it was an accident. The whole thing.' Not accusing — wondering. Player doesn't disagree. They sit with what that means.",
        intro: {
          zh: "你们聊着聊着，话题滑向了当时的那个晚上",
          en: "The conversation drifts somewhere neither of you planned",
          ko: "대화가 자연스럽게 그날 밤 쪽으로 흘러갔다",
        },
      },
    ],
  },
};

// ---------------------------------------------------------------------------
// Helpers: pick one untriggered event from a career or emotional tier
// ---------------------------------------------------------------------------
export function pickCareerEvent(careerIdentity, tier, triggeredIds) {
  const careerList = CAREER_EVENTS[careerIdentity];
  if (!careerList) return null;
  const tierList = careerList[tier];
  if (!tierList || tierList.length === 0) return null;
  const triggered = new Set(triggeredIds || []);
  const available = tierList.filter(e => !triggered.has(e.id));
  if (available.length === 0) return null;
  return available[Math.floor(Math.random() * available.length)];
}

export function pickEmotionalEvent(emotionalIdentity, tier, triggeredIds) {
  const emotionList = EMOTIONAL_EVENTS[emotionalIdentity];
  if (!emotionList) return null;
  const tierList = emotionList[tier];
  if (!tierList || tierList.length === 0) return null;
  const triggered = new Set(triggeredIds || []);
  const available = tierList.filter(e => !triggered.has(e.id));
  if (available.length === 0) return null;
  return available[Math.floor(Math.random() * available.length)];
}

// ---------------------------------------------------------------------------
// Queue system: pick one untriggered rhythm event for queue entry
// Returns { event, memberId } or null
// ---------------------------------------------------------------------------
export function pickRhythmEventForQueue(rhythm, affections, secrecy, members, triggeredIds) {
  if (rhythm === "free") return null;

  const triggered = new Set(triggeredIds || []);
  const sorted = [...members].sort((a, b) => (affections[b.id] || 0) - (affections[a.id] || 0));
  const topMember = sorted[0];
  const secondMember = sorted[1];
  const topAff = affections[topMember?.id] || 0;
  const gap = topMember && secondMember
    ? topAff - (affections[secondMember.id] || 0)
    : 99;

  let subList = [];
  let targetMemberId = topMember?.id;

  if (rhythm === "romantic") {
    if (topAff >= 90) subList = ROMANTIC_EVENTS.together;
    else if (topAff >= 70) subList = ROMANTIC_EVENTS.pre_confession;
    else if (topAff >= 45) subList = ROMANTIC_EVENTS.ambiguous;
    else if (topAff >= 20) subList = ROMANTIC_EVENTS.attraction;
  } else if (rhythm === "pr_crisis") {
    if (secrecy < 30) subList = PR_CRISIS_EVENTS.high;
    else if (secrecy < 55) subList = PR_CRISIS_EVENTS.medium;
    else if (secrecy < 80) subList = PR_CRISIS_EVENTS.low;
  } else if (rhythm === "drama") {
    if (gap > 40) subList = DRAMA_EVENTS.intense;
    else if (gap >= 10) subList = DRAMA_EVENTS.moderate;
    else subList = DRAMA_EVENTS.mild;
    targetMemberId = secondMember?.id || topMember?.id;
  }

  const available = subList.filter(e => !triggered.has(e.id));
  if (available.length === 0) return null;
  const event = available[Math.floor(Math.random() * available.length)];
  return { event, memberId: targetMemberId };
}

// ---------------------------------------------------------------------------
// HE descriptions — multilingual two-liners
// ---------------------------------------------------------------------------
export const HE_DESCRIPTIONS = {
  romantic: {
    zh: "暧昧褪去，\n浪漫不死 💍",
    en: "Unspoken words, now confessed.\nLove never dies 💍",
    ko: "머뭇거림 너머, 마음이 닿았다.\n사랑은 결코 죽지 않아 💍",
  },
  drama: {
    zh: "吵吵闹闹，\n不如一起胡闹到老 🍻",
    en: "Laughter, tears, beautiful chaos —\nwhy choose one, when the ride is this fun 🍻",
    ko: "웃고, 울고, 질투하고 —\n누굴 고를까? 그냥 우리 다 같이 놀자 🍻",
  },
  pr_crisis: {
    zh: "舆论纷纷扰扰，\n你们始终十指紧扣 👭",
    en: "The world whispered, rumors swirled —\nyet your hands never let go 👭",
    ko: "세상이 떠들어대도,\n두 손은 더 단단히 엮였어 👭",
  },
  free: {
    zh: "命运交错如歌，\n你们牵手相望 💗💛💙💚💜",
    en: "Fate wove every thread into a song —\nhand in hand, eyes locked, here you stand 💗💛💙💚💜",
    ko: "운명이 엮어낸 노래 속에서,\n손 잡고 마주 본 너와 나 💗💛💙💚💜",
  },
};

// ---------------------------------------------------------------------------
// Epilogue prompt builders
// ---------------------------------------------------------------------------
export function buildEpiloguePrompt(rhythm, mainMember, allMembers, affections, summaries, language, playerName) {
  const langNote = `Write in ${language === "zh" ? "Chinese (Simplified)" : language === "ko" ? "Korean" : "English"}.`;
  const genderNote = `IMPORTANT: The player character (${playerName || "the player"}) is a young woman. All members are women. Use female pronouns (she/her) for the player throughout. This is a yuri story.`;
  const recentSummaries = (summaries || []).slice(-3).map(s => s.summary).join("\n");
  const mainAff = affections[mainMember.id] || 0;
  const igHandle = `@${(playerName || "player").toLowerCase().replace(/\s+/g, ".")}`;

  if (rhythm === "romantic") {
    return `${langNote}
${genderNote}
Write a short, warm epilogue scene (~400 words) of a marriage proposal between ${playerName || "the player"} and ${mainMember.name}.
Either ${playerName || "the player"} proposes to ${mainMember.name}, or ${mainMember.name} proposes — choose based on her personality: ${mainMember.private_personality || mainMember.public_image || ""}.
Their affection level is ${mainAff}/100. Recent story context:\n${recentSummaries}
Write immersive second-person prose. No chapter headers. End on a quiet, certain note.`;
  }

  if (rhythm === "pr_crisis") {
    const memberNames = allMembers.map(m => m.name).join(", ");
    return `${langNote}
${genderNote}
Write a short, joyful epilogue scene (~400 words) where ${playerName || "the player"} and ${mainMember.name} officially announce their relationship on social media.
The player's Instagram handle is ${igHandle}. ${mainMember.name}'s handle is @${mainMember.ig || mainMember.id}.
Other group members (${memberNames}) react in a group chat — at least two of them call ${playerName || "the player"} sister-in-law in their own language, with their personalities showing through.
${mainMember.name}'s personality: ${mainMember.private_personality || mainMember.public_image || ""}.
Write as a mix of social media posts and group chat messages. Warm, celebratory, a little chaotic.`;
  }

  if (rhythm === "drama") {
    const memberNames = allMembers.map(m => m.name).join(", ");
    const affLines = allMembers.map(m => `${m.name}: ${affections[m.id] || 0}/100`).join(", ");
    return `${langNote}
${genderNote}
Write a short, comedic epilogue scene (~400 words) of ${playerName || "the player"} and all the members (${memberNames}) on a group trip to Europe.
Affection levels: ${affLines}. Recent story context:\n${recentSummaries}
Include at least one light rivalry moment — warm and funny, not mean-spirited. Write in immersive second-person prose. End with everyone laughing together.`;
  }

  // free mode — hometown trip
  return `${langNote}
${genderNote}
Write a short, tender epilogue scene (~400 words) where ${playerName || "the player"} travels with ${mainMember.name} to her hometown, ${mainMember.birthplace || "her hometown"}.
She shows you places from her past — a street, a view, something small and specific. You learn a quieter version of her.
At the end, she takes your hand and you two promise to walk forward together.
Her personality: ${mainMember.private_personality || mainMember.public_image || ""}.
Recent story context:\n${recentSummaries}
Write in immersive second-person prose. Slow-paced, intimate. No dramatic declarations — just presence.`;
}
