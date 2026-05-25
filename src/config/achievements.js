// src/config/achievements.js
// 成就系统 (40回合后触发，不结束游戏)

const achievementDefs = {
  he_hidden_love: {
    id: "he_hidden_love",
    icon: "💗",
    titles: { zh: "🏆 HE: 隐秘而稳定的爱", en: "🏆 HE: Hidden Love, Stable Hearts", ko: "🏆 HE: 숨겨진 사랑, 안정된 마음" },
    descs: {
      zh: "你们在无人知晓的角落里，守护着这份珍贵的感情。不被看见，却无比真实。",
      en: "In a corner no one knows, you've protected this precious love. Unseen, yet utterly real.",
      ko: "아무도 모르는 구석에서, 당신들은 이 소중한 감정을 지켜왔습니다. 보이지 않아도, 너무나 진실되게.",
    },
    condition: (stats, topAff) => stats.secrecy > 80 && topAff > 80,
  },
  se_public_love: {
    id: "se_public_love",
    icon: "✨",
    titles: { zh: "🌟 SE: 公开恋爱", en: "🌟 SE: Public Love", ko: "🌟 SE: 공개 연애" },
    descs: {
      zh: "你们选择不再躲藏。舆论并不温柔，但终于不用假装陌生人了。",
      en: "You chose to stop hiding. Public opinion isn't gentle, but you no longer have to pretend to be strangers.",
      ko: "당신들은 더 이상 숨지 않기로 했습니다. 여론은 부드럽지 않지만, 더 이상 남인 척하지 않아도 됩니다.",
    },
    condition: (stats, topAff) => stats.secrecy < 30 && topAff > 70,
  },
  be_exposed_separation: {
    id: "be_exposed_separation",
    icon: "💔",
    titles: { zh: "💔 BE: 曝光后的分离", en: "💔 BE: Separation After Exposure", ko: "💔 BE: 노출 후의 이별" },
    descs: {
      zh: "舆论的压力、公司的施压、粉丝的反对...最终，你们被迫分开了。",
      en: "Media pressure, company demands, fan backlash... In the end, you were forced apart.",
      ko: "언론의 압박, 회사의 요구, 팬들의 반발... 결국, 당신들은 헤어질 수밖에 없었습니다.",
    },
    condition: (stats, topAff) => stats.pressure > 80 && topAff < 50,
  },
  oe_unspoken_waiting: {
    id: "oe_unspoken_waiting",
    icon: "🌙",
    titles: { zh: "🌙 OE: 未公开的等待", en: "🌙 OE: Unspoken Waiting", ko: "🌙 OE: 말하지 못한 기다림" },
    descs: {
      zh: "你们仍然相爱，却被现实隔开。或许有一天...但不是现在。",
      en: "You still love each other, but reality keeps you apart. Maybe someday... but not now.",
      ko: "여전히 서로 사랑하지만, 현실이 둘을 갈라놓았습니다. 언젠가는... 하지만 지금은 아닙니다.",
    },
    condition: (stats, topAff) => stats.selfId < 30 && topAff > 60,
  },
  be_you_left: {
    id: "be_you_left",
    icon: "🚶",
    titles: { zh: "🚶 BE: 你选择离开", en: "🚶 BE: You Chose to Leave", ko: "🚶 BE: 당신이 떠나기로 했습니다" },
    descs: {
      zh: "你决定退出这个光圈。重新建立自己的生活，也是一种勇敢。",
      en: "You decided to step out of the spotlight. Building a new life is its own kind of courage.",
      ko: "당신은 이 스포트라이트에서 물러나기로 했습니다. 새로운 삶을 시작하는 것도 용기의 한 형태입니다.",
    },
    condition: (stats, topAff) => stats.mood < 20 && topAff < 40,
  },
};

/**
 * 检测成就触发
 * @param {object} stats - 玩家状态
 * @param {object} affections - 各成员好感
 * @param {number} roundNum - 当前回合
 * @param {string} language - 语言
 * @returns {object|null} 成就对象或 null
 */
export function checkAchievement(stats, affections, roundNum, language = "zh") {
  if (roundNum < 40) return null;

  const topEntry = Object.entries(affections).sort((a, b) => b[1] - a[1])[0];
  if (!topEntry) return null;
  const [, topAff] = topEntry;

  for (const def of Object.values(achievementDefs)) {
    if (def.condition(stats, topAff)) {
      return {
        id: def.id,
        title: def.titles[language] || def.titles.zh,
        description: def.descs[language] || def.descs.zh,
        icon: def.icon,
      };
    }
  }

  return null;
}