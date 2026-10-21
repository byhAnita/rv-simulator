# worlds/campus (zh)

Edit the text between the `~~~~` lines. Tick `[x]` to approve the text as it stands
after your edit; an unticked edit is kept as a draft and changes nothing.
Then run `node scripts/zh-review.mjs sync`. See docs/ZH_REVIEW.md.
Generated: do not edit the `<!-- zh-review ... -->` lines.

### world.name
<!-- zh-review key="worlds/campus#world.name" base="cf3e1046a3c3" -->
- [x] approved - Claude 4c8e1f8 2026-09-29
~~~~
校园
~~~~

### country.name
<!-- zh-review key="worlds/campus#country.name" base="963cd7300454" -->
- [x] approved - Claude 4c8e1f8 2026-09-29
~~~~
韩国
~~~~

### setting
<!-- zh-review key="worlds/campus#setting" base="bd0469297963" -->
- [x] approved - Claude 5bbebce 2026-10-20
~~~~
故事发生在当代首尔的一所大学。故事日常围绕青涩好感、社团活动、学业日常、24小时便利店等。玩家和成员在韩国前后辈关系带来的距离感、青涩的情感试探是整个故事的张力所在。
~~~~

### castLore.orgNoun
<!-- zh-review key="worlds/campus#castLore.orgNoun" base="4513bba5432d" -->
- [x] approved - Claude 5bbebce 2026-10-20
~~~~
大学
~~~~

### castLore.orgHint
<!-- zh-review key="worlds/campus#castLore.orgHint" base="ff2655b4bd4f" -->
- [x] approved - Claude 5bbebce 2026-10-20
~~~~
这些成员是同一所大学的学生。大学：{org}
~~~~

### identities[prof_of_cast].name
<!-- zh-review key="worlds/campus#identities[prof_of_cast].name" base="801602ae6458" -->
- [x] approved - Claude d2c0c84 2026-10-20
~~~~
咖啡馆老板
~~~~

### identities[prof_of_cast].background
<!-- zh-review key="worlds/campus#identities[prof_of_cast].background" base="f9e4b42697e8" -->
- [ ] CHANGED SINCE YOUR LAST REVIEW - uncommitted
~~~~
[身份背景] 你是{name}所在大学的咖啡店老板，她们经常来你的咖啡馆买咖啡/自习/小组讨论/聚会。 优势：你与她们有自然的日常接触机会。劣势：你总是只能在咖啡店等她来，缺少主动见她的理由。 [初见] 故事从你们第一次见面开始：第一回合之前，你和{name}没有真正见过面，彼此只是听过名字、照过面。所以这段关系从零开始：第一回合写的是初次碰面的距离感与试探，之后每一回合好感才一点点发展。
~~~~

### identities[prof_of_cast].events[0].text
<!-- zh-review key="worlds/campus#identities[prof_of_cast].events[0].text" base="e1cac57e4356" -->
- [ ] NEW - never reviewed - uncommitted
~~~~
早上她们来买咖啡，你暗自记下了{name}的口味
~~~~

### identities[prof_of_cast].events[1].text
<!-- zh-review key="worlds/campus#identities[prof_of_cast].events[1].text" base="37b1be919727" -->
- [ ] NEW - never reviewed - uncommitted
~~~~
周末她们来咖啡馆聚会玩游戏，{name}邀请你加入一起
~~~~

### identities[prof_of_cast].events[2].text
<!-- zh-review key="worlds/campus#identities[prof_of_cast].events[2].text" base="dbf8157b8655" -->
- [ ] NEW - never reviewed - uncommitted
~~~~
{name}点单时你和她闲聊了解她的生活
~~~~

### identities[prof_of_cast].workTitle.form
<!-- zh-review key="worlds/campus#identities[prof_of_cast].workTitle.form" base="04060a0dcdb9" -->
- [x] approved - Claude d7bfc82 2026-10-20
~~~~
老板
~~~~

### identities[peer_student].name
<!-- zh-review key="worlds/campus#identities[peer_student].name" base="19eb1b2d68ad" -->
- [x] approved - Claude 4c8e1f8 2026-09-29
~~~~
同届学生
~~~~

### identities[peer_student].background
<!-- zh-review key="worlds/campus#identities[peer_student].background" base="b3d8a49baac1" -->
- [ ] CHANGED SINCE YOUR LAST REVIEW - uncommitted
~~~~
[身份背景] 你和{name}是成员们同一届、同一个系的学生，入学自然相识。 优势：距离最近，见面理由最多。劣势：也正因为如此，爱情和友情的界限模糊   [初见] 故事从你们第一次见面开始：第一回合之前，你和{name}没有真正见过面，彼此只是听过名字、照过面。所以这段关系从零开始：第一回合写的是初次碰面的距离感与试探，之后每一回合好感才一点点发展。
~~~~

### identities[peer_student].events[0].text
<!-- zh-review key="worlds/campus#identities[peer_student].events[0].text" base="30fc75f96a6a" -->
- [ ] NEW - never reviewed - uncommitted
~~~~
被分到同一个小组作业，一起喝咖啡熬通宵完成
~~~~

### identities[peer_student].events[1].text
<!-- zh-review key="worlds/campus#identities[peer_student].events[1].text" base="34c821d44c97" -->
- [ ] NEW - never reviewed - uncommitted
~~~~
上课时她在旁边的座位上睡着，头一点一点地靠过来
~~~~

### identities[peer_student].events[2].text
<!-- zh-review key="worlds/campus#identities[peer_student].events[2].text" base="934bd64fdeac" -->
- [ ] NEW - never reviewed - uncommitted
~~~~
考试结束那天，全系都在庆祝，你们却先走了
~~~~

### identities[senior_student].name
<!-- zh-review key="worlds/campus#identities[senior_student].name" base="f7a51a50f497" -->
- [x] approved - Claude 4c8e1f8 2026-09-29
~~~~
学姐
~~~~

### identities[senior_student].background
<!-- zh-review key="worlds/campus#identities[senior_student].background" base="d001fbed0ec5" -->
- [ ] CHANGED SINCE YOUR LAST REVIEW - uncommitted
~~~~
[身份背景] 你是比成员们高一届，同一个系的mentor学姐，成员作为新生入学时自然相识。优势：天然的互动理由，前辈的身份让照顾她显得理所当然。劣势：也正因为如此，前后辈的身份让情感越线小心翼翼。 [初见] 故事从你们第一次见面开始：第一回合之前，你和{name}没有真正见过面，彼此只是听过名字、照过面。所以这段关系从零开始：第一回合写的是初次碰面的距离感与试探，之后每一回合好感才一点点发展。
~~~~

### identities[senior_student].events[0].text
<!-- zh-review key="worlds/campus#identities[senior_student].events[0].text" base="cdfd4a745ea2" -->
- [ ] NEW - never reviewed - uncommitted
~~~~
成员们作为新生报道，你被派去引导
~~~~

### identities[senior_student].events[1].text
<!-- zh-review key="worlds/campus#identities[senior_student].events[1].text" base="c199c82486c5" -->
- [ ] NEW - never reviewed - uncommitted
~~~~
她拿着选课表来问你哪门课值得选
~~~~

### identities[senior_student].events[2].text
<!-- zh-review key="worlds/campus#identities[senior_student].events[2].text" base="5eeb72793a61" -->
- [ ] NEW - never reviewed - uncommitted
~~~~
社团聚餐结束，你送她回宿舍
~~~~

### identities[senior_student].events[3].text
<!-- zh-review key="worlds/campus#identities[senior_student].events[3].text" base="ff0d470cb3fa" -->
- [ ] NEW - never reviewed - uncommitted
~~~~
她第一次做展示紧张到手抖，你给她鼓励
~~~~

### identities[senior_student].workTitle.form
<!-- zh-review key="worlds/campus#identities[senior_student].workTitle.form" base="9228325b78f3" -->
- [x] approved - Claude 4c8e1f8 2026-09-29
~~~~
前辈nim
~~~~

### identities[junior_student].name
<!-- zh-review key="worlds/campus#identities[junior_student].name" base="5b9d02367edf" -->
- [x] approved - Claude 4c8e1f8 2026-09-29
~~~~
学妹
~~~~

### identities[junior_student].background
<!-- zh-review key="worlds/campus#identities[junior_student].background" base="f5674b88d1db" -->
- [ ] CHANGED SINCE YOUR LAST REVIEW - uncommitted
~~~~
[身份背景] 你是比成员们低一届的学妹，你新生入学时自然相识，她是系里你最先记住名字的前辈。 优势：向前辈求助是最自然的接近方式 劣势：也正因为如此，前后辈的身份让情感越线小心翼翼   [初见] 故事从你们第一次见面开始：第一回合之前，你和{name}没有真正见过面，彼此只是听过名字、照过面。所以这段关系从零开始：第一回合写的是初次碰面的距离感与试探，之后每一回合好感才一点点发展。
~~~~

### identities[junior_student].events[0].text
<!-- zh-review key="worlds/campus#identities[junior_student].events[0].text" base="d467b7f9a5d9" -->
- [ ] NEW - never reviewed - uncommitted
~~~~
她把自己的笔记毫无保留给了你
~~~~

### identities[junior_student].events[1].text
<!-- zh-review key="worlds/campus#identities[junior_student].events[1].text" base="438402b733fb" -->
- [ ] NEW - never reviewed - uncommitted
~~~~
社团里她替你挡下了不该你做的杂事
~~~~

### identities[junior_student].events[2].text
<!-- zh-review key="worlds/campus#identities[junior_student].events[2].text" base="e65d6aec7b42" -->
- [ ] NEW - never reviewed - uncommitted
~~~~
聚餐时你被灌酒，她把杯子拿走了
~~~~

### identities[junior_student].events[3].text
<!-- zh-review key="worlds/campus#identities[junior_student].events[3].text" base="7b806d10f542" -->
- [ ] NEW - never reviewed - uncommitted
~~~~
你熬夜赶作业，她在自习室陪到最后
~~~~

### identities[junior_student].workTitle.form
<!-- zh-review key="worlds/campus#identities[junior_student].workTitle.form" base="9228325b78f3" -->
- [x] approved - Claude 4c8e1f8 2026-09-29
~~~~
前辈nim
~~~~

### identities[ta].name
<!-- zh-review key="worlds/campus#identities[ta].name" base="8c5ac79b144a" -->
- [x] approved - Claude 4c8e1f8 2026-09-29
~~~~
助教
~~~~

### identities[ta].background
<!-- zh-review key="worlds/campus#identities[ta].background" base="4a5d83c88340" -->
- [ ] CHANGED SINCE YOUR LAST REVIEW - uncommitted
~~~~
[身份背景] 你是成员们这学期新课的助教，你指导成员们课程项目、课后答疑、作业批改等，在课程中自然相识。优势：位置暧昧——你有一点权力并可以提供帮助，接近她变得容易。劣势：作为助教的公正不偏袒的规则   [初见] 故事从你们第一次见面开始：第一回合之前，你和{name}没有真正见过面，彼此只是听过名字、照过面。所以这段关系从零开始：第一回合写的是初次碰面的距离感与试探，之后每一回合好感才一点点发展。
~~~~

### identities[ta].events[0].text
<!-- zh-review key="worlds/campus#identities[ta].events[0].text" base="d7a73b0a81e6" -->
- [ ] NEW - never reviewed - uncommitted
~~~~
你在她的报告边上写了比普通评语更长的一段话
~~~~

### identities[ta].events[1].text
<!-- zh-review key="worlds/campus#identities[ta].events[1].text" base="38f443eb6013" -->
- [ ] NEW - never reviewed - uncommitted
~~~~
答疑时间只剩你们两个人，话题早就与课程无关
~~~~

### identities[ta].events[2].text
<!-- zh-review key="worlds/campus#identities[ta].events[2].text" base="2fa635510ace" -->
- [ ] NEW - never reviewed - uncommitted
~~~~
她把作业拖到最后一刻交，你没有追问
~~~~

### identities[ta].events[3].text
<!-- zh-review key="worlds/campus#identities[ta].events[3].text" base="b0f21abbe0be" -->
- [ ] NEW - never reviewed - uncommitted
~~~~
你批改作业时一眼认出了她的笔迹
~~~~

### identities[exchange_student].name
<!-- zh-review key="worlds/campus#identities[exchange_student].name" base="17b1e9d112e2" -->
- [x] approved - Claude 4c8e1f8 2026-09-29
~~~~
交换生
~~~~

### identities[exchange_student].background
<!-- zh-review key="worlds/campus#identities[exchange_student].background" base="6d8650f6c60c" -->
- [ ] CHANGED SINCE YOUR LAST REVIEW - uncommitted
~~~~
[身份背景] 你是刚来大学交换一学期的留学生，成为成员们同一届、同一个系的交换生同学，你对韩语和韩国不熟悉。优势：留学生的身份让这段关系关注度低 舆论压力小 劣势：所有人都知道你会走，包括她——这件事从第一天起就是你们都知道的前提 [初见] 故事从你们第一次见面开始：第一回合之前，你和{name}没有真正见过面，彼此只是听过名字、照过面。所以这段关系从零开始：第一回合写的是初次碰面的距离感与试探，之后每一回合好感才一点点发展。
~~~~

### identities[exchange_student].events[0].text
<!-- zh-review key="worlds/campus#identities[exchange_student].events[0].text" base="7a7b5ea0ee03" -->
- [ ] NEW - never reviewed - uncommitted
~~~~
小组讨论你跟不上语速，她放慢了语速并帮你翻译理解
~~~~

### identities[exchange_student].events[1].text
<!-- zh-review key="worlds/campus#identities[exchange_student].events[1].text" base="54908115e7ce" -->
- [ ] NEW - never reviewed - uncommitted
~~~~
她带你去只有本地学生才知道的那家店
~~~~

### identities[exchange_student].events[2].text
<!-- zh-review key="worlds/campus#identities[exchange_student].events[2].text" base="a3c1f585c562" -->
- [ ] NEW - never reviewed - uncommitted
~~~~
你把一个词说错，她笑了很久，然后教正确的说法
~~~~

### identities[exchange_student].events[3].text
<!-- zh-review key="worlds/campus#identities[exchange_student].events[3].text" base="4b1c6471a5ef" -->
- [ ] NEW - never reviewed - uncommitted
~~~~
你们聊到你什么时候走，两个人都换了话题
~~~~

### identities[主线成员前女友].name
<!-- zh-review key="worlds/campus#identities[主线成员前女友].name" base="99b912dc8eba" -->
- [x] approved - Claude 4c8e1f8 2026-09-29
~~~~
主线成员前女友
~~~~

### identities[主线成员前女友].background
<!-- zh-review key="worlds/campus#identities[主线成员前女友].background" base="c2b1e7dda978" -->
- [x] approved - Claude 5bbebce 2026-10-20
~~~~
[特殊身份背景-主线成员前女友]
- 你和{name}曾是恋人，几年前因{reason}分手
- 你至今保留着{keepsake}
- 现在因升学和她进入了同一所大学成为同学重逢：尴尬、心情复杂、未说出口的话。初期互动刻意保持距离、眼神闪躲、礼貌但疏离
- 其他人可能知道或不知道你们的过去。随着游戏推进，可能复合也可能各自前行
~~~~

### identities[主线成员前女友].variants.reason[0]
<!-- zh-review key="worlds/campus#identities[主线成员前女友].variants.reason[0]" base="0bc661621ca7" -->
- [x] approved - Claude 4c8e1f8 2026-09-29
~~~~
毕业后的打算不同
~~~~

### identities[主线成员前女友].variants.reason[1]
<!-- zh-review key="worlds/campus#identities[主线成员前女友].variants.reason[1]" base="f2891de8322e" -->
- [x] approved - Claude 4c8e1f8 2026-09-29
~~~~
她家里的反对
~~~~

### identities[主线成员前女友].variants.reason[2]
<!-- zh-review key="worlds/campus#identities[主线成员前女友].variants.reason[2]" base="b5174ec5a579" -->
- [x] approved - Claude 4c8e1f8 2026-09-29
~~~~
那时候太年轻
~~~~

### identities[主线成员前女友].variants.reason[3]
<!-- zh-review key="worlds/campus#identities[主线成员前女友].variants.reason[3]" base="c519b68be415" -->
- [x] approved - Claude 4c8e1f8 2026-09-29
~~~~
她转学去了别的城市
~~~~

### identities[主线成员前女友].variants.keepsake[0]
<!-- zh-review key="worlds/campus#identities[主线成员前女友].variants.keepsake[0]" base="2427c666bde0" -->
- [x] approved - Claude 4c8e1f8 2026-09-29
~~~~
她借给你的那本书
~~~~

### identities[主线成员前女友].variants.keepsake[1]
<!-- zh-review key="worlds/campus#identities[主线成员前女友].variants.keepsake[1]" base="9e274f52b413" -->
- [x] approved - Claude 5bbebce 2026-10-20
~~~~
一起拍的人生四格
~~~~

### identities[主线成员前女友].variants.keepsake[2]
<!-- zh-review key="worlds/campus#identities[主线成员前女友].variants.keepsake[2]" base="6f9f8096ef13" -->
- [x] approved - Claude 5bbebce 2026-10-20
~~~~
她写在讲义背面的笔记
~~~~

### identities[主线成员前女友].variants.keepsake[3]
<!-- zh-review key="worlds/campus#identities[主线成员前女友].variants.keepsake[3]" base="1722f92fd17c" -->
- [x] approved - Claude 4c8e1f8 2026-09-29
~~~~
你们共用过的那副耳机
~~~~

### places[lecture_hall].name
<!-- zh-review key="worlds/campus#places[lecture_hall].name" base="d612fb01e913" -->
- [x] approved - Claude 4c8e1f8 2026-09-29
~~~~
阶梯教室
~~~~

### places[library].name
<!-- zh-review key="worlds/campus#places[library].name" base="266e6cb77079" -->
- [x] approved - Claude 4c8e1f8 2026-09-29
~~~~
图书馆
~~~~

### places[seminar_room].name
<!-- zh-review key="worlds/campus#places[seminar_room].name" base="520678b1d971" -->
- [x] approved - Claude 5bbebce 2026-10-20
~~~~
讨论室
~~~~

### places[club_room].name
<!-- zh-review key="worlds/campus#places[club_room].name" base="dd3f7d04bf98" -->
- [x] approved - Claude 4c8e1f8 2026-09-29
~~~~
社团活动室
~~~~

### places[campus_cafe].name
<!-- zh-review key="worlds/campus#places[campus_cafe].name" base="0c20d83a16c3" -->
- [x] approved - Claude 4c8e1f8 2026-09-29
~~~~
校内咖啡厅
~~~~

### places[dorm_room].name
<!-- zh-review key="worlds/campus#places[dorm_room].name" base="3a74de9a9014" -->
- [x] approved - Claude 4c8e1f8 2026-09-29
~~~~
宿舍
~~~~

### places[track_field].name
<!-- zh-review key="worlds/campus#places[track_field].name" base="0f20f29891dd" -->
- [x] approved - Claude 4c8e1f8 2026-09-29
~~~~
操场
~~~~

### places[quad].name
<!-- zh-review key="worlds/campus#places[quad].name" base="c387a55dc782" -->
- [x] approved - Claude 4c8e1f8 2026-09-29
~~~~
中央草坪
~~~~

### places[convenience_store].name
<!-- zh-review key="worlds/campus#places[convenience_store].name" base="bd4437f208a8" -->
- [x] approved - Claude 4c8e1f8 2026-09-29
~~~~
校门口便利店
~~~~

### places[night_study].name
<!-- zh-review key="worlds/campus#places[night_study].name" base="c2e16cbc63a8" -->
- [x] approved - Claude 4c8e1f8 2026-09-29
~~~~
通宵自习室
~~~~
