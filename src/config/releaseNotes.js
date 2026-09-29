// src/config/releaseNotes.js
//
// What changed, in the player's words, newest first.
//
// README carries the full release notes, and a player does not read the README.
// She opens the game. So the same history lives here in one or two sentences per
// release, and the Help Center's More Info tab renders it above the contact
// details — which is where someone who wants the long version will find the
// repository link anyway.
//
// ONE array, three languages side by side, because the alternative is three
// copies in `src/i18n/*.js` where a missing translation is invisible until a
// Korean player opens the tab. Smoke asserts every entry carries all three.
//
// A version number here is HISTORY, not state — the same rule as README's
// "What's New in vX" headings and CLAUDE.md's post-mortems. `npm run bump` only
// rewrites a `src/` line containing `desc:`, so nothing in this file moves when
// the version does. What the bump DOES force is the entry itself: smoke fails
// until the newest entry's version matches package.json, so a release cannot
// ship without telling the player what is in it.
//
// Keep each entry to one or two sentences, and write what the player can SEE.
// "The prompt cache survives between rounds" belongs here; "buildSystemPrompt is
// a pure function of the save" does not.

export const RELEASE_NOTES = [
  {
    version: "1.4.1",
    zh: "修复了角色设定页无法开始游戏的问题：出生年份滚轮显示着年份，却没有真的填进去，所以直接点「开始」会一直提示「请完成所有选项」。现在滚轮显示的年份就是已填写的年份，滑动即可修改。",
    en: "Fixed a bug that could stop a new game from starting: the birth-year wheel showed you a year without actually filling the field in, so Start kept refusing with \"please complete all options\" even though every box looked answered. The year the wheel shows is now the year that is stored, and scrolling changes it.",
    ko: "새 게임을 시작할 수 없던 문제를 고쳤습니다. 출생 연도 휠이 연도를 보여주면서도 실제로 값을 채우지 않아, 모든 항목을 채운 것처럼 보여도 시작 버튼이 \"모든 옵션을 선택해주세요\"라며 거부했습니다. 이제 휠에 보이는 연도가 저장된 연도이며, 스크롤로 바꿀 수 있습니다.",
  },
  {
    version: "1.4.0",
    zh: "现在可以自己组建卡司：从任意一个或多个团里挑主线、副线和背景成员，也可以用一句话描述、让 AI 生成一位并不存在的成员。任何成员都能上传头像和壁纸，裁剪由你决定，并会跟着她出现在游戏和四个社交面板里；角色设定改为直接选择出生年份，第十一个存档也不会再顶掉第一个。",
    en: "You can now build your own cast — pick a main, subs and background faces from one group or several, or describe a member who does not exist in one line and let the model write her card. Anyone can be given a photo and a wallpaper, cropped the way you choose, which follow her into the game and all four social panels; setup asks for your birth year directly, and the eleventh save no longer deletes the first.",
    ko: "이제 출연진을 직접 구성할 수 있습니다. 한 그룹 또는 여러 그룹에서 메인·서브·배경 멤버를 고르거나, 한 줄 설명만으로 존재하지 않는 멤버를 만들어낼 수도 있습니다. 모든 멤버에게 직접 자른 사진과 배경화면을 줄 수 있고 게임과 네 개의 소셜 패널에 그대로 따라옵니다. 캐릭터 설정은 출생 연도를 직접 고르는 방식으로 바뀌었고, 열한 번째 저장이 첫 번째를 지우는 일도 없어졌습니다.",
  },
  {
    version: "1.3.9",
    zh: "设置里新增用量面板：本次游玩的 token、缓存命中率、生成速度和估算花费一目了然。好感度每回合最多变动 8 点，剧情不会再因为换了模型而忽快忽慢。",
    en: "Settings now shows what this session has cost: tokens, cache-hit rate, generation speed and an estimated price. Affection changes are capped at 8 points a round, so the story no longer speeds up or slows down depending on which model served it.",
    ko: "설정에 사용량 패널이 생겼습니다. 이번 플레이의 토큰, 캐시 적중률, 생성 속도와 예상 비용을 볼 수 있습니다. 호감도는 한 라운드에 최대 8점까지만 움직이므로, 어떤 모델이 응답했는지에 따라 전개 속도가 달라지지 않습니다.",
  },
  {
    version: "1.3.8",
    zh: "GPT 线路换成 GPT-6 Luna：按钮没变，模型更新，每回合成本约为原来的 1/4.5。",
    en: "GPT-6 Luna replaces GPT-5.6 Luna — same button, newer model, about 4.5x cheaper per round.",
    ko: "GPT 제공자가 GPT-6 Luna로 교체되었습니다. 버튼은 그대로이고 모델만 새것이며, 라운드당 비용은 약 4.5배 저렴합니다.",
  },
  {
    version: "1.3.7",
    zh: "成员终于会按真实年龄差来称呼你。v1.3.6 的敬语修复此前一直没有生效，因为生日数据在送进模型前就被丢掉了。",
    en: "Members finally address you by your real age difference. The honorific fix in v1.3.6 had been doing nothing, because birthdays were dropped before they ever reached the model.",
    ko: "이제 멤버들이 실제 나이 차이에 맞춰 호칭을 씁니다. v1.3.6의 존칭 수정은 생일 정보가 모델에 닿기 전에 버려지고 있어 그동안 아무 효과가 없었습니다.",
  },
  {
    version: "1.3.6",
    zh: "写作质量修复：成员不再搞混“我”和“你”，欧尼只会往一个方向叫，好感度不够的成员不会再发来根本不存在的 Kakao，你改过的剧情也真的会被模型读到。",
    en: "A writing-quality release: members stop mixing up \"I\" and \"you\", unnie only ever points one way, a member below the affection threshold no longer texts you a Kakao that never arrives, and the story edits you make actually reach the model.",
    ko: "문장 품질 개선: 멤버가 '나'와 '너'를 헷갈리지 않고, 언니 호칭이 한 방향으로만 향하며, 호감도가 낮은 멤버가 오지도 않은 카톡을 보냈다고 말하는 일이 없어졌습니다. 직접 수정한 이야기도 이제 모델에 제대로 전달됩니다.",
  },
  {
    version: "1.3.5",
    zh: "所有镜像站都能正常加载全部九个团，从任意镜像添加到主屏幕也能正常启动。",
    en: "All nine groups load on every mirror again, and install-to-home-screen works from whichever mirror you used.",
    ko: "모든 미러에서 아홉 개 그룹이 다시 정상적으로 불러와지고, 어느 미러에서 홈 화면에 추가해도 정상 실행됩니다.",
  },
  {
    version: "1.3.4",
    zh: "维护更新：帮助中心里的两个游玩链接都已更新到当前地址。",
    en: "A maintenance release: both play links in the Help Center now point at the current addresses.",
    ko: "유지보수 업데이트: 도움말의 플레이 링크 두 개가 모두 현재 주소로 갱신되었습니다.",
  },
  {
    version: "1.3.3",
    zh: "维护更新：镜像站改为从源码构建，修复一次即可同步到所有站点。",
    en: "A maintenance release: the mirrors build from source, so one fix reaches all of them in a single step.",
    ko: "유지보수 업데이트: 미러가 소스에서 빌드되도록 바뀌어, 한 번의 수정이 모든 사이트에 반영됩니다.",
  },
  {
    version: "1.3.2",
    zh: "阿里云免费额度自动路由（28 个模型用完自动换），付费模型选择器和费用说明，全部报错都有中英韩可读提示，还能修改或重玩刚刚那一回合。",
    en: "Aliyun free-credit auto-routing across 28 models, a paid model picker with a cost guide, readable localized errors for every provider, and the ability to edit or replay the round you just played.",
    ko: "알리윤 무료 크레딧 자동 라우팅(28개 모델), 비용 안내가 있는 유료 모델 선택기, 모든 제공자의 오류를 읽을 수 있는 안내로 번역, 그리고 방금 플레이한 라운드를 수정하거나 다시 돌릴 수 있는 기능이 추가되었습니다.",
  },
  {
    version: "1.3.1",
    zh: "Qwen 成为默认线路，深度思考可以关闭，另外新增时间流速、日夜模式、字号调节、剧情导出和这个帮助中心。",
    en: "Qwen becomes the default provider, Deep Thinking can be switched off, and Time Speed, day/night mode, text size, story export and this Help Center all arrive.",
    ko: "Qwen이 기본 제공자가 되고 딥 씽킹을 끌 수 있게 되었으며, 시간 흐름 속도, 주야간 모드, 글자 크기, 이야기 내보내기와 이 도움말이 추가되었습니다.",
  },
  {
    version: "1.3.0",
    zh: "记忆改为只追加的历史账本，让提示缓存能在回合之间保留下来；所有模型也统一走同一套接口。",
    en: "Memory was rebuilt as an append-only ledger so the prompt cache survives between rounds, and every provider now goes through one shared API layer.",
    ko: "메모리가 덧붙이기 전용 기록으로 재구성되어 라운드 사이에도 프롬프트 캐시가 유지되며, 모든 제공자가 하나의 공통 API 계층을 거칩니다.",
  },
  {
    version: "1.2.0",
    zh: "每回合的生成时间从两分钟降到 30 秒以内，token 消耗也只有原来的一小部分。",
    en: "Rounds generate in under 30 seconds instead of two minutes, at a fraction of the token cost.",
    ko: "한 라운드 생성 시간이 2분에서 30초 이내로 줄었고, 토큰 소모도 이전의 일부 수준입니다.",
  },
];

/** The version the player is running, per this file. */
export const LATEST_VERSION = RELEASE_NOTES[0].version;
