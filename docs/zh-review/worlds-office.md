# worlds/office (zh)

Edit the text between the `~~~~` lines. Tick `[x]` to approve the text as it stands
after your edit; an unticked edit is kept as a draft and changes nothing.
Then run `node scripts/zh-review.mjs sync`. See docs/ZH_REVIEW.md.
Generated: do not edit the `<!-- zh-review ... -->` lines.

### world.name
<!-- zh-review key="worlds/office#world.name" base="cb24c17f5739" -->
- [x] approved - Claude 4c8e1f8 2026-09-29
~~~~
职场
~~~~

### country.name
<!-- zh-review key="worlds/office#country.name" base="963cd7300454" -->
- [x] approved - Claude 4c8e1f8 2026-09-29
~~~~
韩国
~~~~

### setting
<!-- zh-review key="worlds/office#setting" base="8d583a0b63dd" -->
- [x] approved - Claude 5bbebce 2026-10-20
~~~~
故事发生在平行世界首尔的一家公司，故事日常围绕白领工作日常、职场恋爱、职场升职等。韩国前后辈关系带来的距离感、工作和情感的边界是整个故事的张力所在。
~~~~

### castLore.orgNoun
<!-- zh-review key="worlds/office#castLore.orgNoun" base="e06ff957ed48" -->
- [x] approved - Claude 4c8e1f8 2026-09-29
~~~~
公司
~~~~

### castLore.orgHint
<!-- zh-review key="worlds/office#castLore.orgHint" base="23e3c5694cb6" -->
- [x] approved - Claude 4c8e1f8 2026-09-29
~~~~
这些成员是同一家公司、同一个组的同事。公司：{org}
~~~~

### identities[peer_colleague].name
<!-- zh-review key="worlds/office#identities[peer_colleague].name" base="6ae62af4619f" -->
- [x] approved - Claude 4c8e1f8 2026-09-29
~~~~
同事
~~~~

### identities[peer_colleague].background
<!-- zh-review key="worlds/office#identities[peer_colleague].background" base="63c1a18045e2" -->
- [x] approved - uncommitted
~~~~
[身份背景] 你是刚被调入和成员们同一个组、同一个级别的同事，工位只隔着一块挡板，在工作中自然接触。 优势：平级、同组，待在一起不需要任何理由。劣势：难以分辨互动里有多少是职务，接近有多少是工作之外 [初见] 故事从你们第一次见面开始：第一回合之前，你和{name}没有真正见过面，彼此只是听过名字、照过面。所以这段关系从零开始：第一回合写的是初次碰面的距离感与试探，之后每一回合好感才一点点发展。
~~~~

### identities[manager_of_cast].name
<!-- zh-review key="worlds/office#identities[manager_of_cast].name" base="c182421398c0" -->
- [x] approved - Claude 4c8e1f8 2026-09-29
~~~~
组长
~~~~

### identities[manager_of_cast].background
<!-- zh-review key="worlds/office#identities[manager_of_cast].background" base="248102e08997" -->
- [x] approved - Claude 77a086d 2026-10-21
~~~~
[身份背景] 你是刚被调来成员们这个组的新组长，你负责分配她们的工作，她们直接向你汇报。 优势：你决定她做什么、工作难度、做多久，在工作安排中藏着照顾的私心。劣势：她难以分辨你的照顾里有多少是职务，接近有多少是工作之外 [初见] 故事从你们第一次见面开始：第一回合之前，你和{name}没有真正见过面，彼此只是听过名字、照过面。所以这段关系从零开始：第一回合写的是初次碰面的距离感与试探，之后每一回合好感才一点点发展。
~~~~

### identities[manager_of_cast].workTitle.form
<!-- zh-review key="worlds/office#identities[manager_of_cast].workTitle.form" base="374530c29ed1" -->
- [x] approved - Claude 4c8e1f8 2026-09-29
~~~~
组长nim
~~~~

### identities[report_to_cast].name
<!-- zh-review key="worlds/office#identities[report_to_cast].name" base="986608686c50" -->
- [x] approved - Claude 4c8e1f8 2026-09-29
~~~~
组员
~~~~

### identities[report_to_cast].background
<!-- zh-review key="worlds/office#identities[report_to_cast].background" base="8d74d5b7fbcf" -->
- [x] approved - Claude 77a086d 2026-10-21
~~~~
[身份背景] {name}是被调来的你的新组长，负责安排你的工作，你直接向她汇报。 优势：自然的工作接触。劣势：你无法分辨她的照顾里有多少是工作，也无法分辨接近有多少是工作之外 [初见] 故事从你们第一次见面开始：第一回合之前，你和{name}没有真正见过面，彼此只是听过名字、照过面。所以这段关系从零开始：第一回合写的是初次碰面的距离感与试探，之后每一回合好感才一点点发展。
~~~~

### identities[report_to_cast].workTitle.form
<!-- zh-review key="worlds/office#identities[report_to_cast].workTitle.form" base="374530c29ed1" -->
- [x] approved - Claude 4c8e1f8 2026-09-29
~~~~
组长nim
~~~~

### identities[new_hire].name
<!-- zh-review key="worlds/office#identities[new_hire].name" base="e87070afef32" -->
- [x] approved - Claude 4c8e1f8 2026-09-29
~~~~
新人
~~~~

### identities[new_hire].background
<!-- zh-review key="worlds/office#identities[new_hire].background" base="0c8f52692ccf" -->
- [x] approved - Claude 77a086d 2026-10-21
~~~~
[身份背景] 你是新加入这个组的新职员，成员们都是你的前辈。 优势：向前辈请教是最自然的接近方式，没有人会觉得奇怪。劣势：你无法分辨她的照顾里有多少是职务，也无法让她分辨你的接近有多少是工作之外  [初见] 故事从你们第一次见面开始：第一回合之前，你和{name}没有真正见过面，彼此只是听过名字、照过面。所以这段关系从零开始：第一回合写的是初次碰面的距离感与试探，之后每一回合好感才一点点发展。
~~~~

### identities[new_hire].workTitle.form
<!-- zh-review key="worlds/office#identities[new_hire].workTitle.form" base="9228325b78f3" -->
- [x] approved - Claude 4c8e1f8 2026-09-29
~~~~
前辈nim
~~~~

### identities[contractor].name
<!-- zh-review key="worlds/office#identities[contractor].name" base="261bbe800a1f" -->
- [x] approved - Claude 4c8e1f8 2026-09-29
~~~~
外部合作方
~~~~

### identities[contractor].background
<!-- zh-review key="worlds/office#identities[contractor].background" base="2f81f1d347e3" -->
- [x] approved - uncommitted
~~~~
[身份背景] 你是其他公司的员工，因与成员们所在公司的一个合作项目相识。 优势：你不在她们公司的体系里，同事的舆论不影响恋情。劣势：项目结束意味着你们工作交集的结束。 [初见] 故事从你们第一次见面开始：第一回合之前，你和{name}没有真正见过面，彼此只是听过名字、照过面。所以这段关系从零开始：第一回合写的是初次碰面的距离感与试探，之后每一回合好感才一点点发展。
~~~~

### identities[hr].name
<!-- zh-review key="worlds/office#identities[hr].name" base="6ac380cbd716" -->
- [x] approved - Claude 4c8e1f8 2026-09-29
~~~~
人事
~~~~

### identities[hr].background
<!-- zh-review key="worlds/office#identities[hr].background" base="838e11f99c13" -->
- [x] approved - uncommitted
~~~~
[身份背景] 你是人事部的职工，成员们的考核、投诉、奖金、假期等事务，都经过你的手。 优势：你比任何人都清楚她的信息。劣势：你清楚办公室恋情曝光的舆论代价  [初见] 故事从你们第一次见面开始：第一回合之前，你和{name}没有真正见过面，彼此只是听过名字、照过面。所以这段关系从零开始：第一回合写的是初次碰面的距离感与试探，之后每一回合好感才一点点发展。
~~~~

### identities[主线成员前女友].name
<!-- zh-review key="worlds/office#identities[主线成员前女友].name" base="99b912dc8eba" -->
- [x] approved - Claude 4c8e1f8 2026-09-29
~~~~
主线成员前女友
~~~~

### identities[主线成员前女友].background
<!-- zh-review key="worlds/office#identities[主线成员前女友].background" base="fbeade7e887a" -->
- [x] approved - Claude 5bbebce 2026-10-20
~~~~
[特殊身份背景-主线成员前女友]
- 你和{name}曾是恋人，几年前因{reason}分手
- 你至今保留着{keepsake}
- 现在一次组织调整把你们调到了同一个组：尴尬、心情复杂、未说出口的话。初期互动刻意保持距离、眼神闪躲、礼貌但疏离
- 其他同事可能知道或不知道你们的过去。随着游戏推进，可能复合也可能各自前行
~~~~

### identities[主线成员前女友].variants.reason[0]
<!-- zh-review key="worlds/office#identities[主线成员前女友].variants.reason[0]" base="f9ddf131f4b1" -->
- [x] approved - Claude 4c8e1f8 2026-09-29
~~~~
她接了外派的职位
~~~~

### identities[主线成员前女友].variants.reason[1]
<!-- zh-review key="worlds/office#identities[主线成员前女友].variants.reason[1]" base="55c5c818f792" -->
- [x] approved - Claude 4c8e1f8 2026-09-29
~~~~
那次升职
~~~~

### identities[主线成员前女友].variants.reason[2]
<!-- zh-review key="worlds/office#identities[主线成员前女友].variants.reason[2]" base="c68bcec78e39" -->
- [x] approved - Claude 4c8e1f8 2026-09-29
~~~~
两个人都太累了
~~~~

### identities[主线成员前女友].variants.reason[3]
<!-- zh-review key="worlds/office#identities[主线成员前女友].variants.reason[3]" base="9796a801ed9c" -->
- [x] approved - Claude 5bbebce 2026-10-20
~~~~
年少不懂事
~~~~

### identities[主线成员前女友].variants.keepsake[0]
<!-- zh-review key="worlds/office#identities[主线成员前女友].variants.keepsake[0]" base="0e511bd586cf" -->
- [x] approved - Claude 4c8e1f8 2026-09-29
~~~~
她留下的那支笔
~~~~

### identities[主线成员前女友].variants.keepsake[1]
<!-- zh-review key="worlds/office#identities[主线成员前女友].variants.keepsake[1]" base="2503b0881d62" -->
- [x] approved - Claude 5bbebce 2026-10-20
~~~~
钱包里你们的合照
~~~~

### identities[主线成员前女友].variants.keepsake[2]
<!-- zh-review key="worlds/office#identities[主线成员前女友].variants.keepsake[2]" base="3f8978ab062e" -->
- [x] approved - Claude 4c8e1f8 2026-09-29
~~~~
她贴在你显示器上的便利贴
~~~~

### identities[主线成员前女友].variants.keepsake[3]
<!-- zh-review key="worlds/office#identities[主线成员前女友].variants.keepsake[3]" base="58e247566c92" -->
- [x] approved - Claude 5bbebce 2026-10-20
~~~~
她送给你的领带
~~~~

### places[open_floor].name
<!-- zh-review key="worlds/office#places[open_floor].name" base="b25fd391b04d" -->
- [x] approved - Claude 4c8e1f8 2026-09-29
~~~~
开放办公区
~~~~

### places[meeting_room].name
<!-- zh-review key="worlds/office#places[meeting_room].name" base="423bba6b21af" -->
- [x] approved - Claude 4c8e1f8 2026-09-29
~~~~
会议室
~~~~

### places[pantry].name
<!-- zh-review key="worlds/office#places[pantry].name" base="805469960dd8" -->
- [x] approved - Claude 4c8e1f8 2026-09-29
~~~~
茶水间
~~~~

### places[elevator].name
<!-- zh-review key="worlds/office#places[elevator].name" base="c4d0aea9e2da" -->
- [x] approved - Claude 4c8e1f8 2026-09-29
~~~~
电梯
~~~~

### places[rooftop].name
<!-- zh-review key="worlds/office#places[rooftop].name" base="10bdab2b8029" -->
- [x] approved - Claude 4c8e1f8 2026-09-29
~~~~
天台
~~~~

### places[hoesik].name
<!-- zh-review key="worlds/office#places[hoesik].name" base="23b84dac4859" -->
- [x] approved - Claude 5bbebce 2026-10-20
~~~~
公司食堂
~~~~

### places[stairwell].name
<!-- zh-review key="worlds/office#places[stairwell].name" base="36a25b377239" -->
- [x] approved - Claude 4c8e1f8 2026-09-29
~~~~
安全通道
~~~~

### places[archive_room].name
<!-- zh-review key="worlds/office#places[archive_room].name" base="6c1154a9ee16" -->
- [x] approved - Claude 4c8e1f8 2026-09-29
~~~~
资料室
~~~~

### places[taxi].name
<!-- zh-review key="worlds/office#places[taxi].name" base="dadb5d2d7f56" -->
- [x] approved - Claude 4c8e1f8 2026-09-29
~~~~
深夜的出租车
~~~~

### places[convenience_store].name
<!-- zh-review key="worlds/office#places[convenience_store].name" base="52e09afbe0d0" -->
- [x] approved - Claude 4c8e1f8 2026-09-29
~~~~
楼下便利店
~~~~
