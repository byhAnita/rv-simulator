// src/config/identityConfig.js
// Dual identity system: career identity + emotional identity
// All $random_ values are hardcoded candidate pools, picked once at game init and fixed.

export const CAREER_IDENTITIES = [
  { id: "trainee",  labelZh: "练习生",   labelEn: "Trainee",       labelKo: "연습생" },
  { id: "manager",  labelZh: "经纪人",   labelEn: "Manager",       labelKo: "매니저" },
  { id: "ceo",      labelZh: "公司会长",   labelEn: "CEO",           labelKo: "여회장" },
  { id: "artist",   labelZh: "韩娱艺人", labelEn: "K-pop Artist",  labelKo: "케이팝 아티스트" },
  { id: "fan",      labelZh: "粉丝",     labelEn: "Fan",           labelKo: "팬" },
  { id: "custom",   labelZh: "[自定义]", labelEn: "[Custom]",      labelKo: "[커스텀]" },
];

export const EMOTIONAL_IDENTITIES = [
  { id: "none",           labelZh: "无特殊情感设定",  labelEn: "No special background", labelKo: "특별한 감정 설정 없음" },
  { id: "secret_crush",   labelZh: "暗恋对象",        labelEn: "Secret Crush",          labelKo: "짝사랑 상대" },
  { id: "ex_gf",          labelZh: "前女友",          labelEn: "Ex-Girlfriend",         labelKo: "전 여자친구" },
  { id: "fate_encounter", labelZh: "命运偶遇",        labelEn: "Fate Encounter",        labelKo: "운명의 만남" },
  { id: "custom",         labelZh: "[自定义]",        labelEn: "[Custom]",              labelKo: "[커스텀]" },
];

// ─────────────────────────────────────────────────────────────
// $random_ candidate pools (5-8 options each)
// ─────────────────────────────────────────────────────────────
export const RANDOM_POOLS = {
  // secret_crush: how they first met
  meet: {
    zh: [
      "雨天图书馆你借给她一把伞",
      "深夜排练室门口撞见你一个人练习",
      "便利店结账你帮她找了零钱",
      "食堂你眼疾手快接住了快要滑落的餐盘",
      "地铁里你让了座位给她旁边的老奶奶",
      "在楼梯间你捡起了她掉落的耳机",
    ],
    en: [
      "you lent her your umbrella at the library on a rainy day",
      "she caught you practicing alone outside the rehearsal room late at night",
      "you helped her find exact change at a convenience store",
      "you caught her tray before it slid off the cafeteria table",
      "you gave up your subway seat for the elderly woman next to her",
      "you picked up her earphones when she dropped them on the stairwell",
    ],
    ko: [
      "비 오는 날 도서관에서 우산을 빌려줬어요",
      "늦은 밤 연습실 앞에서 혼자 연습하는 걸 봤어요",
      "편의점에서 거스름돈 찾는 걸 도와줬어요",
      "식당에서 미끄러지려는 쟁반을 잡아줬어요",
      "지하철에서 옆 어르신께 자리를 양보했어요",
      "계단에서 떨어진 이어폰을 주워줬어요",
    ],
  },

  // secret_crush: the moment she fell
  flipped: {
    zh: [
      "阳光落在你笑颜上的那一刻",
      "你在观众席为她鼓掌时眼神里的那份专注",
      "排练结束你独自走廊哼歌的背影",
      "你皱眉思考时认真的侧脸",
      "你仰头等雨的那一瞬间",
      "你低头看手机然后忽然抬眼正好对上她视线的那一刻",
    ],
    en: [
      "the moment sunlight caught your smile",
      "the focused look in your eyes applauding her from the audience",
      "your back in the empty hallway humming softly after rehearsal",
      "your serious profile when you frowned over something",
      "the instant you tilted your face up waiting for the rain to stop",
      "the second you looked up from your phone and met her eyes by accident",
    ],
    ko: [
      "햇빛이 당신 미소에 닿던 순간",
      "객석에서 박수를 치는 당신의 집중된 눈빛",
      "연습 후 빈 복도에서 혼자 흥얼거리는 뒷모습",
      "무언가를 고민할 때 진지한 옆모습",
      "비를 기다리며 하늘을 올려다보던 순간",
      "휴대폰에서 고개를 들었다가 눈이 마주친 그 순간",
    ],
  },

  // secret_crush: quiet care gesture she never spoke about
  hiddencare: {
    zh: [
      "偷偷记住了你喜欢的饮料，悄悄在休息室备上",
      "每次活动结束后默默确认你安全回家",
      "在你看起来疲惫的那天偷偷在你座位放了止痛药",
      "暗中帮你处理了一件你不知道的麻烦",
      "问了共同朋友你的生日，准备了一份没署名的礼物",
      "看到你的朋友圈在难过，发了一条话可以套用在你身上的限时动态",
    ],
    en: [
      "quietly memorized your drink order and kept it stocked in the break room",
      "checked in with a mutual friend every time to make sure you got home safe",
      "left painkillers on your seat on a day you seemed exhausted",
      "quietly handled a problem on your behalf that you never found out about",
      "asked a mutual friend your birthday and left an unsigned gift",
      "posted a cryptic story that fit exactly what you'd written you were feeling",
    ],
    ko: [
      "음료 취향을 외워 몰래 휴게실에 비치해뒀어요",
      "공통 친구에게 물어봐서 매번 귀가를 확인했어요",
      "지쳐 보이던 날 자리에 진통제를 몰래 올려뒀어요",
      "당신이 모르는 사이 문제를 조용히 해결해줬어요",
      "공통 친구에게 생일을 물어보고 이름 없는 선물을 줬어요",
      "당신의 감정에 딱 맞는 암호 같은 스토리를 올렸어요",
    ],
  },

  // ex_gf: reason they broke up
  breakup: {
    zh: [
      "事业规划不同，各自走向了不同的城市",
      "家庭压力让彼此都无法坚持",
      "那年太年轻，一次误会没能及时解释",
      "行程太满，聚少离多，最终无声散场",
      "她觉得自己给不了你想要的生活",
    ],
    en: [
      "different career paths pulled you to different cities",
      "family pressure made it impossible for either of you to hold on",
      "you were both too young — a misunderstanding that never got explained in time",
      "packed schedules and distance slowly faded into silence",
      "she felt she couldn't give you the life you deserved",
    ],
    ko: [
      "서로 다른 진로로 다른 도시에 가게 됐어요",
      "가족의 압박으로 둘 다 버티지 못했어요",
      "너무 어렸고 오해가 제때 풀리지 않았어요",
      "바쁜 일정과 거리가 결국 침묵으로 이어졌어요",
      "그녀는 당신이 원하는 삶을 줄 수 없다고 느꼈어요",
    ],
  },

  // ex_gf: thing the player still keeps
  exstuff: {
    zh: [
      "她送的一条细银链",
      "两个人一起拍的拍立得照片",
      "她手写的最后一封信",
      "你们共同听过无数遍的那张CD",
      "她的一件旧卫衣，洗了很多次还留着",
      "一张她画给你的随手素描",
    ],
    en: [
      "a thin silver chain she gave you",
      "a polaroid you took together",
      "the last letter she wrote by hand",
      "the CD you listened to together too many times to count",
      "an old hoodie of hers, washed so many times you kept it anyway",
      "a quick sketch she drew of you on a whim",
    ],
    ko: [
      "그녀가 준 얇은 은 체인",
      "함께 찍은 폴라로이드 사진",
      "그녀가 손으로 쓴 마지막 편지",
      "함께 셀 수 없이 들었던 CD",
      "그녀의 오래된 후드티, 여러 번 빨았어도 버리지 못한",
      "그녀가 즉흥적으로 그려준 스케치",
    ],
  },

  // ex_gf: habit the player remembers about her
  excustom: {
    zh: [
      "紧张的时候会咬下嘴唇",
      "睡前一定要喝热牛奶",
      "难过时不说话，只是安静发呆",
      "开心时会用手背遮住嘴角笑",
      "疲惫时总是先揉左眼",
      "撒谎的时候会摸自己的右耳",
    ],
    en: [
      "biting her lower lip when nervous",
      "always drinking warm milk before bed",
      "going quiet and staring when she's sad",
      "covering her smile with the back of her hand when happy",
      "rubbing her left eye first when tired",
      "touching her right ear when she's not being fully honest",
    ],
    ko: [
      "긴장하면 아랫입술을 깨무는 버릇",
      "자기 전 꼭 따뜻한 우유를 마시는 습관",
      "슬플 때 말 없이 멍하니 있는 것",
      "기쁠 때 손등으로 웃음을 가리는 것",
      "피곤할 때 왼쪽 눈부터 비비는 것",
      "솔직하지 못할 때 오른쪽 귀를 만지는 것",
    ],
  },
};

// ─────────────────────────────────────────────────────────────
// Init: pick all random values once at game start, freeze them
// ─────────────────────────────────────────────────────────────
function pickFrom(pool, language) {
  const arr = pool[language] || pool.zh;
  return arr[Math.floor(Math.random() * arr.length)];
}

export function initIdentityRandoms(emotionalId, language) {
  const r = {};
  if (emotionalId === "secret_crush") {
    r.meet       = pickFrom(RANDOM_POOLS.meet,       language);
    r.flipped    = pickFrom(RANDOM_POOLS.flipped,    language);
    r.hiddencare = pickFrom(RANDOM_POOLS.hiddencare, language);
  }
  if (emotionalId === "ex_gf") {
    r.breakup  = pickFrom(RANDOM_POOLS.breakup,  language);
    r.exstuff  = pickFrom(RANDOM_POOLS.exstuff,  language);
    r.excustom = pickFrom(RANDOM_POOLS.excustom, language);
  }
  return r;
}

// ─────────────────────────────────────────────────────────────
// Background builders — called inside buildSystemPrompt
// ─────────────────────────────────────────────────────────────
export function buildCareerBackground(careerId, company, memberName, customCareerText, language) {
  const n = memberName || "her";
  const c = company || "the company";

  const bg = {
    zh: {
      //典型事件：向${n}请教舞台发声和舞蹈技巧；被选入公司综艺后辈特辑与${n}共同出镜；\ 深夜训练室两人练到最后，独享安静的相处时光；\ 无意中模仿${n}的标志性台风被她当场发现；在公司走廊偶遇时${n}顺手帮你整理了一下发型。\
      trainee: `[职业身份：练习生] 你是${c}的练习生后辈，与${n}训练中自然接触。\ 
优势：接触自然，有共同训练记忆。劣势：公司内规严格，身份曝光影响双方前途。`,

      //典型事件：新专辑销量突破预期你带全队庆功；被质疑"专辑方向失误"时你出面化解舆论危机；\ 帮成员谈判年度代言合约；行程撞车时紧急协调让${n}赶上演出；\ 陪${n}录制深夜节目一起等设备调试到天亮。\
      manager: `[职业身份：经纪人] 你是${n}所在女团的新任经纪人，负责打歌行程、商务代言谈判与事业规划。\
优势：近身工作，了解真实台下状态。劣势：职场边界明确，暧昧被发现可能被认定失职。\
（舆论事件存在但非主线，玩家选择高压舆论节奏时会放大。）`,

      //典型事件：与${n}们开回归企划讨论会，${n}提出新想法令你刮目相看；\ 去练习室探班给全组带奶茶，${n}对此感到意外且有些受宠若惊；\ 为${n}争取到某时装周品牌合作机会；重要发布会上${n}当众感谢"让我们做喜欢的音乐";\
      ceo: `[职业身份：公司会长] 你是${c}新任年轻女会长，主导${n}所在女团的事业走向。\
优势：资源充足，可影响${n}的事业路径。劣势：权力关系复杂，感情曝光面临巨大压力。`,

      //典型事件：你和${n}的打歌舞台互动被粉丝截图疯狂分析；\ 你和${n}的双人采访配合默契引发大量CP粉兴奋, 你和${n}的综艺同框被剪辑成暧昧视频广泛流传。\ ${n}粉丝里的毒唯开始针对你，同时你的毒唯也攻击${n};\
      artist: `[职业身份：韩娱艺人] 你是其他公司的kpop女idol,与${n}有合作机会。\
优势：身份平等，无权力关系。劣势：公众关注度极高，任何互动都会被粉丝解读。`,

      //典型事件：签售会上你说的一句话让${n}笑了很久，后来直播里隐晦提起；\ 粉丝见面会你抢到最近的位置，${n}的眼神在你身上多停留了一秒；\ 在首尔街头偶遇便装买咖啡的${n}，两人心跳加速互装没事人；\ ${n}某天深夜发了条奇怪的社媒，你是第一个看出弦外之音并留言的；\ 你在粉丝群发帖说${n}的某个舞台手势像什么，${n}下次见面会上突然提起。\
      fan: `[职业身份：粉丝] 你是${n}的粉丝，粉丝活动中她似乎对你有超过其他粉丝的特殊对应。\
优势：对${n}有深度了解。劣势：粉丝身份极其敏感，私下联系曝光即被粉圈审判。`,

      custom: customCareerText
        ? `[自定义职业身份] ${customCareerText}`
        : "",
    },

    en: {
      //Key events: asking ${n} for tips on vocal projection and choreography; being selected for a company variety junior special alongside ${n}; \ the two of you being the last ones in the practice room late at night; getting caught imitating ${n}'s signature stage moves; \ ${n} casually fixing your hair when you passed each other in the hallway. \
      trainee: `[Career: Trainee] You are a junior trainee at ${c}, where you met ${n} naturally through training. \
Advantage: natural daily contact, shared training memories. Disadvantage: strict company rules — exposure affects both your futures.`,

      //Key events: new album exceeds sales targets and you take the whole team to celebrate; \ you handle the PR when a "bad album direction" controversy surfaces; negotiating an annual brand endorsement for a member; \ an emergency schedule conflict you resolve so ${n} makes it to the stage; \ sitting together through a dead-of-night equipment wait on a late recording. \
      manager: `[Career: Manager] You manage ${n}'s group, handling promotions, endorsement negotiations, and career planning. \
Advantage: close daily access, insight into the real off-stage ${n}. \
Disadvantage: clear professional boundaries — any ambiguity discovered = misconduct. \
(Media events exist but are background noise unless player selects PR Crisis pace.)`,

      //Key events: a comeback planning meeting where ${n} dismisses your proposal with "too boring" and you find yourself unexpectedly impressed; \ showing up at a late shoot with snacks for the whole team — ${n} looks genuinely surprised and pleased; \ securing ${n} a major fashion week brand collaboration; \ ${n} publicly thanking you at a press event for "letting us make the music we love"; \ a late-night conversation where you confide the company's financial pressure and ${n} stays in your office until dawn. \
      ceo: `[Career: CEO] You are the young new female CEO of ${c}, shaping ${n}'s group career direction. \
Advantage: resource power, direct influence over ${n}'s career path. Disadvantage: power imbalance makes feelings complicated once they surface.`,

      //Key events: extensive rehearsal time that creates natural closeness; \ a candid backstage eye-contact moment gets screenshotted and dissected by fans; \ a joint interview where your chemistry sparks excitement in the CP community; \ ${n}'s antis targeting you and your antis going after ${n}; \ variety show moments edited into an ambiguous fan-cut that goes viral. \
      artist: `[Career: K-pop Artist] You are a K-pop idol at another company who met ${n} through a collaboration. \
Advantage: equal status, no power imbalance. Disadvantage: every public interaction gets analyzed by fans.`,

      //Key events: something you said at a fan signing made ${n} laugh for a long time — she hinted at it on a later livestream; \ you got a front-row spot at a fan meet and ${n}'s gaze landed on you a beat longer than usual; \ an accidental street encounter in Seoul while she was off-duty buying coffee — both of you pretended nothing was happening; \ a cryptic late-night post ${n} made that you were the first to decode and reply to; \ you posted about one of ${n}'s stage gestures and she brought it up herself at the next fan meet. \
      fan: `[Career: Fan] You are ${n}'s fan who caught her attention through a special moment, establishing contact ordinary fans never get. \
Advantage: deep knowledge of ${n}. Disadvantage: fan identity is hypersensitive — private contact discovered = public trial by the fanbase.`,

      custom: customCareerText
        ? `[Custom Career Identity] ${customCareerText}`
        : "",
    },

    ko: {
      //주요 사건: 발성과 안무에 대해 ${n}에게 조언을 구함; 회사 예능 후배 특집에 ${n}과 함께 출연; \ 늦은 밤 연습실에 둘만 남음; ${n}의 시그니처 무대 동작을 따라하다 들킴; \ 복도에서 마주쳤을 때 ${n}이 아무렇지 않게 머리를 정리해줌. \
      trainee: `[직업 신분: 연습생] 당신은 ${c}의 연습생 후배로, 훈련을 통해 ${n}과 자연스럽게 알게 됐습니다. \
장점: 자연스러운 일상 접촉, 공유된 훈련 기억. 단점: 엄격한 회사 규정, 노출 시 양쪽 미래에 영향.`,

      //주요 사건: 새 앨범 판매량 초과 달성 후 팀 전체 축하; 앨범 방향성 논란 발생 시 직접 대응; \ 브랜드 연간 광고 계약 협상; 긴급 일정 조정으로 ${n}이 무대에 오를 수 있도록 함; \ 늦은 녹화 중 장비 점검을 함께 기다림. \ 장점: 밀착 접촉, 진짜 사생활 파악 가능. 단점: 명확한 직장 경계. \
      manager: `[직업 신분: 매니저] 당신은 ${n} 소속 그룹의 매니저로 활동, 광고 계약 협상, 커리어 관리를 담당합니다. \
(미디어 이벤트는 존재하지만 배경 정도이며, 고압 여론 페이스 선택 시 강화됩니다.)`,

      //주요 사건: 컴백 기획 회의에서 ${n}이 "너무 지루해요"로 제안을 일축해 오히려 감탄함; \ 늦은 촬영 현장에 간식을 들고 나타나 ${n}이 뜻밖이라는 표정을 지음; \ ${n}에게 패션위크 브랜드 협업 기회를 따냄; 기자간담회에서 ${n}이 "하고 싶은 음악을 하게 해줬다"며 공개 감사; \ 회사 자금 압박을 ${n}에게 털어놓고 새벽까지 함께 있음. \
      ceo: `[직업 신분: 여회장] 당신은 ${c}의 새로운 젊은 여성 회장으로 ${n} 그룹의 방향을 결정합니다. \
장점: 풍부한 자원. 단점: 권력 관계가 감정을 복잡하게 만듦.`,

      //주요 사건: 무대 리허설 중 많은 시간을 자연스럽게 함께함; 시상식 백스테이지 눈빛 교환이 팬들에게 캡처되어 분석됨; \ 공동 인터뷰 케미가 CP팬들을 흥분시킴; ${n}의 악성 팬이 당신을 공격하고 당신 측도 ${n}을 공격함; \ 예능 동반 출연 영상이 편집되어 바이럴 됨. \
      artist: `[직업 신분: 케이팝 아티스트] 당신은 다른 회사 소속 케이팝 아이돌로, 협업을 통해 ${n}과 알게 됐습니다. \
장점: 동등한 지위. 단점: 모든 상호작용이 팬들의 분석 대상.`,

      //주요 사건: 사인회에서 한 말이 ${n}을 오래 웃게 했고 이후 라이브에서 넌지시 언급됨; \ 팬미팅에서 가장 앞줄을 잡아 ${n}의 시선이 한 박자 더 머뭄; \ 서울 거리에서 사복 차림의 ${n}과 우연히 마주쳐 서로 모른 척함; \ ${n}의 수상한 새벽 게시물을 가장 먼저 해독하고 답글을 남김; \ ${n}의 무대 제스처에 대한 글을 올렸더니 다음 팬미팅에서 ${n}이 직접 언급함. \
      fan: `[직업 신분: 팬] 당신은 ${n}의 팬으로, 특별한 순간을 통해 그녀에게 기억되어 일반 팬은 가질 수 없는 개인적인 연락을 트게 됐습니다. \
장점: ${n}에 대한 깊은 이해. 단점: 팬 신분은 극도로 민감함.`,

      custom: customCareerText
        ? `[커스텀 직업 신분] ${customCareerText}`
        : "",
    },
  };

  return (bg[language] || bg.zh)[careerId] || "";
}

export function buildEmotionalBackground(emotionalId, memberName, customEmotionalText, language, randoms = {}) {
  if (!emotionalId || emotionalId === "none") return "";
  const n = memberName || "her";

  const bg = {
    zh: {
      secret_crush: `[情感身份：暗恋对象] ${n}曾在过去某段时光深深暗恋你，而你对此知之甚少。\
现在你们在完全不同的情境下重逢——她心里清楚这意味着什么，却从未开口说过一个字。\
初期互动中她偶尔会出现细小破绽：那是她以为已被自己掩埋的习惯。`,

      ex_gf: `[情感身份：前女友] 你和${n}曾是恋人，因故分手，如今重逢于完全不同的处境。\
初期刻意保持距离，眼神闪躲，礼貌但疏离。\
其他成员可能知道或不知道你们的过去。随着故事推进，复合与各自前行都是可能的结局。`,

      fate_encounter: `[情感身份：命运偶遇] 某个夜晚，你和${n}阴差阳错成为了彼此的一夜情对象。\
再次相遇，双方都刻意装作陌生，却难忘那晚的记忆。\
眼神相遇时的心虚，以及那无法忽视的潜在张力——初期互动：表面正常，内心暗流涌动。`,

      custom: customEmotionalText
        ? `[自定义情感身份] ${customEmotionalText}`
        : "",
    },

    en: {
      secret_crush: `[Emotional Background: Secret Crush] ${n} once quietly fell for you — a chapter you knew almost nothing about.\
Now you've met again in a completely different context. She knows exactly what this means; you don't.\
Early interactions carry small tells — habits she thought she had buried.`,

      ex_gf: `[Emotional Background: Ex-Girlfriend] You and ${n} were once together; circumstances ended it. Reunited now in a different context: awkwardness, unresolved feelings, words left unsaid.\
Early interactions: deliberate distance, averted glances, polite coldness.\
Others may or may not know your history. Reconciliation or moving on — both remain open.`,

      fate_encounter: `[Emotional Background: Fate Encounter] One night, you and ${n} ended up as each other's unexpected one-night encounter.\
Running into each other again brings studied awkwardness and forced unfamiliarity —\
yet neither can fully erase that night's charged closeness. Early interactions: surface normal, an undercurrent that can't quite be ignored.`,

      custom: customEmotionalText
        ? `[Custom Emotional Background] ${customEmotionalText}`
        : "",
    },

    ko: {
      secret_crush: `[감정 신분: 짝사랑 상대] ${n}은 과거 한때 당신을 몰래 좋아했지만, 당신은 그 사실을 거의 모릅니다.\
이제 전혀 다른 상황에서 재회한 지금, 그녀는 이 만남이 무엇을 의미하는지 누구보다 잘 알지만 끝내 말하지 못했습니다.\
초기 상호작용에서 그녀는 가끔 작은 실수를 보입니다 — 묻어뒀다고 생각했던 습관들이 드러나는 것입니다.`,

      ex_gf: `[감정 신분: 전 여자친구] 당신과 ${n}은 연인이었고, 사정이 생겨 헤어졌습니다. 이제 전혀 다른 상황에서 재회: 어색함, 복잡한 감정, 하지 못한 말들.\
초기에는 의도적 거리두기, 눈길 회피, 예의 바르지만 차가운 태도.\
다른 멤버들은 과거를 알 수도 모를 수도 있습니다. 게임이 진행되며 복합 또는 각자의 길이 모두 가능합니다.`,

      fate_encounter: `[감정 신분: 운명의 만남] 어느 날 밤, 당신과 ${n}은 뜻밖에 하룻밤을 함께하게 됐습니다.\
다시 만났을 때 서로 어색하게 모르는 척하지만, 그날 밤의 기억은 지울 수 없습니다.\
눈이 마주치는 순간의 익숙함, 그리고 무시할 수 없는 긴장감 — 초기 상호작용: 겉으로는 평범하지만 내면은 복잡합니다.`,

      custom: customEmotionalText
        ? `[커스텀 감정 신분] ${customEmotionalText}`
        : "",
    },
  };

  return (bg[language] || bg.zh)[emotionalId] || "";
}
