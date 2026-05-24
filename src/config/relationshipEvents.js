// src/config/relationshipEvents.js
// 关系变化硬编码触发条件

import { getStageIdx } from "./stageConfig";

const eventMessages = {
  love_triangle: {
    titles: { zh: "⚡ 修罗场", en: "⚡ Love Triangle", ko: "⚡ 삼각관계" },
    descs: {
      zh: (m1, m2) => `${m1?.emoji}${m1?.name} 和 ${m2?.emoji}${m2?.name} 对你的好感越来越接近了...`,
      en: (m1, m2) => `${m1?.emoji}${m1?.name} and ${m2?.emoji}${m2?.name} are both getting closer to you...`,
      ko: (m1, m2) => `${m1?.emoji}${m1?.name}와(과) ${m2?.emoji}${m2?.name}의 호감도가 점점 가까워지고 있습니다...`,
    },
  },
  proposal_ready: {
    titles: { zh: "💍 求婚时机", en: "💍 Time to Propose", ko: "💍 프로포즈 타이밍" },
    descs: {
      zh: (m) => `${m?.emoji}${m?.name} 对你的感情已经非常深厚了。或许，是时候考虑更进一步了...`,
      en: (m) => `${m?.emoji}${m?.name}'s feelings for you run deep. Maybe it's time to take the next step...`,
      ko: (m) => `${m?.emoji}${m?.name}의 감정이 매우 깊어졌습니다. 다음 단계를 고려할 때인 것 같습니다...`,
    },
  },
  breakup_warning: {
    titles: { zh: "💔 感情危机", en: "💔 Relationship Crisis", ko: "💔 관계의 위기" },
    descs: {
      zh: (m) => `${m?.emoji}${m?.name} 对你的态度似乎变冷淡了...`,
      en: (m) => `${m?.emoji}${m?.name} seems to be growing distant...`,
      ko: (m) => `${m?.emoji}${m?.name}의 태도가 차가워진 것 같습니다...`,
    },
  },
  pressure_warning: {
    titles: { zh: "⚠️ 关系压力", en: "⚠️ Relationship Pressure", ko: "⚠️ 관계의 압박" },
    descs: {
      zh: (m) => `公司对${m?.emoji}${m?.name}的私生活越来越关注，这给你们的关系带来了巨大压力...`,
      en: (m) => `The company is paying more attention to ${m?.emoji}${m?.name}'s private life, putting pressure on your relationship...`,
      ko: (m) => `회사가 ${m?.emoji}${m?.name}의 사생활에 점점 더 주목하면서 관계에 큰 압박이 오고 있습니다...`,
    },
  },
};

/**
 * 检测关系变化事件
 * @returns {object|null} 事件对象或 null
 */
export function checkRelationshipEvents(stats, affections, allTargetIds, roundNum, members, language = "zh") {
  // 1. 修罗场
  if (allTargetIds.length >= 2) {
    const candidates = allTargetIds
      .map(id => ({ id, aff: affections[id] || 0 }))
      .filter(c => c.aff > 40)
      .sort((a, b) => b.aff - a.aff);

    if (candidates.length >= 2) {
      const diff = candidates[0].aff - candidates[1].aff;
      if (Math.abs(diff) < 10) {
        const m1 = members.find(m => m.id === candidates[0].id);
        const m2 = members.find(m => m.id === candidates[1].id);
        const msg = eventMessages.love_triangle;
        return {
          type: "love_triangle",
          title: msg.titles[language] || msg.titles.zh,
          description: (msg.descs[language] || msg.descs.zh)(m1, m2),
          members: [candidates[0].id, candidates[1].id],
        };
      }
    }
  }

  // 2. 求婚 + 分手
  const topEntry = Object.entries(affections).sort((a, b) => b[1] - a[1])[0];
  if (topEntry) {
    const [topId, topAff] = topEntry;
    const stage = getStageIdx(topAff);
    const isConfirmed = stage >= 4;

    if (topAff >= 85 && isConfirmed && roundNum >= 30 && stats.secrecy < 50) {
      const m = members.find(mb => mb.id === topId);
      const msg = eventMessages.proposal_ready;
      return {
        type: "proposal_ready",
        title: msg.titles[language] || msg.titles.zh,
        description: (msg.descs[language] || msg.descs.zh)(m),
        memberId: topId,
      };
    }

    const prevAff = stats._prevAffections?.[topId];
    if (prevAff && prevAff - topAff > 20 && stage >= 4) {
      const m = members.find(mb => mb.id === topId);
      const msg = eventMessages.breakup_warning;
      return {
        type: "breakup_warning",
        title: msg.titles[language] || msg.titles.zh,
        description: (msg.descs[language] || msg.descs.zh)(m),
        memberId: topId,
      };
    }
    if (stats.alert > 80 && stage >= 4) {
      const m = members.find(mb => mb.id === topId);
      const msg = eventMessages.pressure_warning;
      return {
        type: "pressure_warning",
        title: msg.titles[language] || msg.titles.zh,
        description: (msg.descs[language] || msg.descs.zh)(m),
        memberId: topId,
      };
    }
  }

  return null;
}