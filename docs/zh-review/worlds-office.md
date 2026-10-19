# worlds/office (zh)

Edit the text between the `~~~~` lines. Tick `[x]` to approve the text as it stands
after your edit; an unticked edit is kept as a draft and changes nothing.
Then run `node scripts/zh-review.mjs sync`. See docs/ZH_REVIEW.md.
Generated: do not edit the `<!-- zh-review ... -->` lines.

### world.name
<!-- zh-review key="worlds/office#world.name" base="cb24c17f5739" -->
- [ ] pending - Claude 4c8e1f8 2026-09-29
~~~~
职场
~~~~

### country.name
<!-- zh-review key="worlds/office#country.name" base="963cd7300454" -->
- [ ] pending - Claude 4c8e1f8 2026-09-29
~~~~
韩国
~~~~

### setting
<!-- zh-review key="worlds/office#setting" base="0587ba2e6ff3" -->
- [ ] pending - Claude 4c8e1f8 2026-09-29
~~~~
故事发生在当代首尔的一家公司。工位、会议室、茶水间、电梯里那短短的十五秒，以及下班后没人真的想去的会食，构成她们的日常。这里的约束是写下来的：人事规定、汇报线、年末考核。恋爱不被禁止，但它一旦被写进任何一张表格，就不再只是两个人的事——而公司里没有一件事是不被写下来的。
~~~~

### castLore.orgNoun
<!-- zh-review key="worlds/office#castLore.orgNoun" base="e06ff957ed48" -->
- [ ] pending - Claude 4c8e1f8 2026-09-29
~~~~
公司
~~~~

### castLore.orgHint
<!-- zh-review key="worlds/office#castLore.orgHint" base="23e3c5694cb6" -->
- [ ] pending - Claude 4c8e1f8 2026-09-29
~~~~
这些成员是同一家公司、同一个组的同事。公司：{org}
~~~~

### identities[peer_colleague].name
<!-- zh-review key="worlds/office#identities[peer_colleague].name" base="6ae62af4619f" -->
- [ ] pending - Claude 4c8e1f8 2026-09-29
~~~~
同事
~~~~

### identities[peer_colleague].background
<!-- zh-review key="worlds/office#identities[peer_colleague].background" base="da5c7ff58f73" -->
- [ ] pending - Claude 49713f1 2026-10-01
~~~~
[身份背景] 你和{name}是同一个组、同一个级别的同事，工位隔着一块挡板。 典型事件：同一个项目通宵改方案，凌晨在便利店买第三罐咖啡； 她替你挡下了本该你背的那个锅； 会食散场你们顺路，走了很长一段夜路； 年末考核出来，你们的名次挨在一起。 优势：平级、同组，待在一起不需要任何理由。劣势：也正因为如此，整个组都在同一个视野里，任何变化都由同一批人看见。 [初见] 故事从你们第一次见面开始：第一回合之前，你和{name}没有真正见过面，彼此只是听过名字、照过面。你是最近新来这个位置上的——刚到任、刚入学、刚接手、或刚被介绍给她。所以这段关系从零开始：第一回合写的是初次碰面的距离感与试探，之后每一回合好感才一点点发展。
~~~~

### identities[manager_of_cast].name
<!-- zh-review key="worlds/office#identities[manager_of_cast].name" base="c182421398c0" -->
- [ ] pending - Claude 4c8e1f8 2026-09-29
~~~~
组长
~~~~

### identities[manager_of_cast].background
<!-- zh-review key="worlds/office#identities[manager_of_cast].background" base="b5ec4119d025" -->
- [ ] pending - Claude 49713f1 2026-10-01
~~~~
[身份背景] 你是这个组的组长，{name}是你的组员。 典型事件：你把最难的那个客户留给自己，而不是分给她； 一对一面谈的二十分钟里，你们有十分钟没在谈工作； 她的方案被上面打回来，你在会上说那是你的决定； 年末评价你必须给全组排序，而你知道自己犹豫了多久。 优势：你决定她做什么、跟谁做、做多久——这是这栋楼里最接近照顾的东西。劣势：你也决定她的考核，所以她对你说的任何一句话，都可能不是她真想说的那句。 [初见] 故事从你们第一次见面开始：第一回合之前，你和{name}没有真正见过面，彼此只是听过名字、照过面。你是最近新来这个位置上的——刚到任、刚入学、刚接手、或刚被介绍给她。所以这段关系从零开始：第一回合写的是初次碰面的距离感与试探，之后每一回合好感才一点点发展。
~~~~

### identities[manager_of_cast].workTitle.form
<!-- zh-review key="worlds/office#identities[manager_of_cast].workTitle.form" base="374530c29ed1" -->
- [ ] pending - Claude 4c8e1f8 2026-09-29
~~~~
组长nim
~~~~

### identities[report_to_cast].name
<!-- zh-review key="worlds/office#identities[report_to_cast].name" base="986608686c50" -->
- [ ] pending - Claude 4c8e1f8 2026-09-29
~~~~
组员
~~~~

### identities[report_to_cast].background
<!-- zh-review key="worlds/office#identities[report_to_cast].background" base="0c0df8423652" -->
- [ ] pending - Claude 49713f1 2026-10-01
~~~~
[身份背景] {name}是你的组长，你直接向她汇报。 典型事件：你交上去的东西被她改得面目全非，附一句“下次你自己就能做到”； 她把你从一个要不到结果的会议里捞出来； 你加班到很晚，她的工位灯也还亮着； 考核面谈，她给你的分数比你预想的高，你没敢问为什么。 优势：你们每天有必须说话的理由，而且是最私下的那种。劣势：你无法分辨她的照顾里有多少是职务，也无法让她分辨你的努力里有多少是别的。 [初见] 故事从你们第一次见面开始：第一回合之前，你和{name}没有真正见过面，彼此只是听过名字、照过面。你是最近新来这个位置上的——刚到任、刚入学、刚接手、或刚被介绍给她。所以这段关系从零开始：第一回合写的是初次碰面的距离感与试探，之后每一回合好感才一点点发展。
~~~~

### identities[report_to_cast].workTitle.form
<!-- zh-review key="worlds/office#identities[report_to_cast].workTitle.form" base="374530c29ed1" -->
- [ ] pending - Claude 4c8e1f8 2026-09-29
~~~~
组长nim
~~~~

### identities[new_hire].name
<!-- zh-review key="worlds/office#identities[new_hire].name" base="e87070afef32" -->
- [ ] pending - Claude 4c8e1f8 2026-09-29
~~~~
新人
~~~~

### identities[new_hire].background
<!-- zh-review key="worlds/office#identities[new_hire].background" base="b4d1f32c9fb8" -->
- [ ] pending - Claude 49713f1 2026-10-01
~~~~
[身份背景] 你是这个组最新来的人，这里所有人都是你的前辈。 典型事件：第一周你把会议室订错了时间，是她去道的歉； 她把自己的模板文件夹整个共享给了你； 会食上有人一直给你倒酒，她把杯子拿开了； 三个月试用期结束那天，她只说了一句“留下来吧”。 优势：向前辈请教是最自然的接近方式，没有人会觉得奇怪。劣势：你还没有任何位置——她照顾你是本分，你多想一点就是你的问题。 [初见] 故事从你们第一次见面开始：第一回合之前，你和{name}没有真正见过面，彼此只是听过名字、照过面。你是最近新来这个位置上的——刚到任、刚入学、刚接手、或刚被介绍给她。所以这段关系从零开始：第一回合写的是初次碰面的距离感与试探，之后每一回合好感才一点点发展。
~~~~

### identities[new_hire].workTitle.form
<!-- zh-review key="worlds/office#identities[new_hire].workTitle.form" base="9228325b78f3" -->
- [ ] pending - Claude 4c8e1f8 2026-09-29
~~~~
前辈nim
~~~~

### identities[contractor].name
<!-- zh-review key="worlds/office#identities[contractor].name" base="261bbe800a1f" -->
- [ ] pending - Claude 4c8e1f8 2026-09-29
~~~~
外部合作方
~~~~

### identities[contractor].background
<!-- zh-review key="worlds/office#identities[contractor].background" base="b8f806dcbc52" -->
- [ ] pending - Claude 49713f1 2026-10-01
~~~~
[身份背景] 你不是这家公司的人。你是供应商、顾问或者外包方的对接人，有门禁卡，但没有工号。 典型事件：你在她们的会议上没有座位，只能站在投影旁边； 项目结束的庆功宴，有人问你“你是哪边的”； 她在电梯里叫住你，问的不是工作； 合同到期前一周，你们都没有提下一份。 优势：你不在任何一条汇报线上，公司的规定管不到你们两个。劣势：也正因为如此，你随时会消失——合同结束就是结束，没有人需要给你一个交代。 [初见] 故事从你们第一次见面开始：第一回合之前，你和{name}没有真正见过面，彼此只是听过名字、照过面。你是最近新来这个位置上的——刚到任、刚入学、刚接手、或刚被介绍给她。所以这段关系从零开始：第一回合写的是初次碰面的距离感与试探，之后每一回合好感才一点点发展。
~~~~

### identities[hr].name
<!-- zh-review key="worlds/office#identities[hr].name" base="6ac380cbd716" -->
- [ ] pending - Claude 4c8e1f8 2026-09-29
~~~~
人事
~~~~

### identities[hr].background
<!-- zh-review key="worlds/office#identities[hr].background" base="e32b2df34543" -->
- [ ] pending - Claude 49713f1 2026-10-01
~~~~
[身份背景] 你在人事部。入职、考核、投诉、离职——所有关于这些人的文件，最后都经过你的手。 典型事件：她的入职档案是你办的，你记得上面每一行； 有人来投诉她的组，你必须把两边的话都听完； 公司出台新的内部关系申报规定，起草的人是你； 她来问一件“替朋友问的”事，你们都知道不是。 优势：你比任何人都清楚这栋楼里谁和谁之间有什么，规则是你写的。劣势：规则是你写的——所以你比任何人都清楚，如果被发现，第一个要被处理的是你。 [初见] 故事从你们第一次见面开始：第一回合之前，你和{name}没有真正见过面，彼此只是听过名字、照过面。你是最近新来这个位置上的——刚到任、刚入学、刚接手、或刚被介绍给她。所以这段关系从零开始：第一回合写的是初次碰面的距离感与试探，之后每一回合好感才一点点发展。
~~~~

### identities[主线成员前女友].name
<!-- zh-review key="worlds/office#identities[主线成员前女友].name" base="99b912dc8eba" -->
- [ ] pending - Claude 4c8e1f8 2026-09-29
~~~~
主线成员前女友
~~~~

### identities[主线成员前女友].background
<!-- zh-review key="worlds/office#identities[主线成员前女友].background" base="02635084c239" -->
- [ ] pending - Claude 4c8e1f8 2026-09-29
~~~~
[特殊身份背景-主线成员前女友]
- 你和{name}曾是恋人，几年前因{reason}分手
- 你至今保留着{keepsake}
- 现在一次组织调整把你们放进了同一个组：尴尬、心情复杂、未说出口的话。初期互动刻意保持距离、眼神闪躲、礼貌但疏离
- 其他同事可能知道或不知道你们的过去。随着游戏推进，可能复合也可能各自前行
~~~~

### identities[主线成员前女友].variants.reason[0]
<!-- zh-review key="worlds/office#identities[主线成员前女友].variants.reason[0]" base="f9ddf131f4b1" -->
- [ ] pending - Claude 4c8e1f8 2026-09-29
~~~~
她接了外派的职位
~~~~

### identities[主线成员前女友].variants.reason[1]
<!-- zh-review key="worlds/office#identities[主线成员前女友].variants.reason[1]" base="55c5c818f792" -->
- [ ] pending - Claude 4c8e1f8 2026-09-29
~~~~
那次升职
~~~~

### identities[主线成员前女友].variants.reason[2]
<!-- zh-review key="worlds/office#identities[主线成员前女友].variants.reason[2]" base="c68bcec78e39" -->
- [ ] pending - Claude 4c8e1f8 2026-09-29
~~~~
两个人都太累了
~~~~

### identities[主线成员前女友].variants.reason[3]
<!-- zh-review key="worlds/office#identities[主线成员前女友].variants.reason[3]" base="1b63103a654c" -->
- [ ] pending - Claude 4c8e1f8 2026-09-29
~~~~
她的婚约
~~~~

### identities[主线成员前女友].variants.keepsake[0]
<!-- zh-review key="worlds/office#identities[主线成员前女友].variants.keepsake[0]" base="0e511bd586cf" -->
- [ ] pending - Claude 4c8e1f8 2026-09-29
~~~~
她留下的那支笔
~~~~

### identities[主线成员前女友].variants.keepsake[1]
<!-- zh-review key="worlds/office#identities[主线成员前女友].variants.keepsake[1]" base="3e406f5c11a9" -->
- [ ] pending - Claude 4c8e1f8 2026-09-29
~~~~
工牌背面你们的合照
~~~~

### identities[主线成员前女友].variants.keepsake[2]
<!-- zh-review key="worlds/office#identities[主线成员前女友].variants.keepsake[2]" base="3f8978ab062e" -->
- [ ] pending - Claude 4c8e1f8 2026-09-29
~~~~
她贴在你显示器上的便利贴
~~~~

### identities[主线成员前女友].variants.keepsake[3]
<!-- zh-review key="worlds/office#identities[主线成员前女友].variants.keepsake[3]" base="3ad865cd1e3b" -->
- [ ] pending - Claude 4c8e1f8 2026-09-29
~~~~
你们一起加班那晚的收据
~~~~

### places[open_floor].name
<!-- zh-review key="worlds/office#places[open_floor].name" base="b25fd391b04d" -->
- [ ] pending - Claude 4c8e1f8 2026-09-29
~~~~
开放办公区
~~~~

### places[meeting_room].name
<!-- zh-review key="worlds/office#places[meeting_room].name" base="423bba6b21af" -->
- [ ] pending - Claude 4c8e1f8 2026-09-29
~~~~
会议室
~~~~

### places[pantry].name
<!-- zh-review key="worlds/office#places[pantry].name" base="805469960dd8" -->
- [ ] pending - Claude 4c8e1f8 2026-09-29
~~~~
茶水间
~~~~

### places[elevator].name
<!-- zh-review key="worlds/office#places[elevator].name" base="c4d0aea9e2da" -->
- [ ] pending - Claude 4c8e1f8 2026-09-29
~~~~
电梯
~~~~

### places[rooftop].name
<!-- zh-review key="worlds/office#places[rooftop].name" base="10bdab2b8029" -->
- [ ] pending - Claude 4c8e1f8 2026-09-29
~~~~
天台
~~~~

### places[hoesik].name
<!-- zh-review key="worlds/office#places[hoesik].name" base="f2b8d0298cfb" -->
- [ ] pending - Claude 4c8e1f8 2026-09-29
~~~~
会食的餐厅
~~~~

### places[stairwell].name
<!-- zh-review key="worlds/office#places[stairwell].name" base="36a25b377239" -->
- [ ] pending - Claude 4c8e1f8 2026-09-29
~~~~
安全通道
~~~~

### places[archive_room].name
<!-- zh-review key="worlds/office#places[archive_room].name" base="6c1154a9ee16" -->
- [ ] pending - Claude 4c8e1f8 2026-09-29
~~~~
资料室
~~~~

### places[taxi].name
<!-- zh-review key="worlds/office#places[taxi].name" base="dadb5d2d7f56" -->
- [ ] pending - Claude 4c8e1f8 2026-09-29
~~~~
深夜的出租车
~~~~

### places[convenience_store].name
<!-- zh-review key="worlds/office#places[convenience_store].name" base="52e09afbe0d0" -->
- [ ] pending - Claude 4c8e1f8 2026-09-29
~~~~
楼下便利店
~~~~
