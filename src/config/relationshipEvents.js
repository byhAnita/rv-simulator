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
  }
};

/**
 * 检测关系变化事件
 * @returns {object|null} 事件对象或 null
 */
export function checkRelationshipEvents(stats, affections, allTargetIds, roundNum, members, language = "zh") {
  // 排序取 Top 2
  const sorted = allTargetIds
    .map(id => ({ id, aff: affections[id] || 0 }))
    .sort((a, b) => b.aff - a.aff);

  const top1 = sorted[0];
  const top2 = sorted[1];

  // 1. 修罗场：Top 2 好感接近（差 < 15）且都 > 40
  if (top2 && top1.aff > 40 && top2.aff > 40 && Math.abs(top1.aff - top2.aff) < 15) {
    const m1 = members.find(m => m.id === top1.id);
    const m2 = members.find(m => m.id === top2.id);
    const msg = eventMessages.love_triangle;
    return {
      type: "love_triangle",
      title: msg.titles[language] || msg.titles.zh,
      description: (msg.descs[language] || msg.descs.zh)(m1, m2),
      members: [top1.id, top2.id],
    };
  }

  // 2. 求婚：Top 1 好感 ≥ 95，确认关系，回合 ≥ 35，自我认同 > 95，且不在修罗场
  if (top1) {
    const [topId, topAff] = [top1.id, top1.aff];
    const stage = getStageIdx(topAff);
    const isConfirmed = stage >= 4;

    // 不在修罗场 = Top 2 不存在或 Top 1 和 Top 2 差距 ≥ 15
    const notInTriangle = !top2 || top2.aff <= 40 || Math.abs(top1.aff - top2.aff) >= 15;

    if (topAff >= 95 && isConfirmed && roundNum >= 35 && stats.selfId > 95 && notInTriangle) {
      const m = members.find(mb => mb.id === topId);
      const msg = eventMessages.proposal_ready;
      return {
        type: "proposal_ready",
        title: msg.titles[language] || msg.titles.zh,
        description: (msg.descs[language] || msg.descs.zh)(m),
        memberId: topId,
      };
    }

    // 3. 分手预警：Top 1 好感下降 ≥ 10，确认关系中
    const prevTopAff = stats._prevAffections?.[topId];
    if (prevTopAff && prevTopAff - topAff >= 10 && isConfirmed) {
      const m = members.find(mb => mb.id === topId);
      const msg = eventMessages.breakup_warning;
      return {
        type: "breakup_warning",
        title: msg.titles[language] || msg.titles.zh,
        description: (msg.descs[language] || msg.descs.zh)(m),
        memberId: topId,
      };
    }
  }

  return null;
}