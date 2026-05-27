// src/agent/probabilityEngine.js
// 多成员概率引擎：计算每位可攻略成员的出场概率

/**
 * 计算单个成员的出场概率
 * @param {string} memberId - 成员 ID
 * @param {string[]} allTargetIds - 所有可攻略成员 ID 列表
 * @param {object} affections - {memberId: affection}
 * @param {object} memory - 记忆池 (含 memberAppearances)
 * @returns {number} 概率 (0-1)
 */
export function calculateProbability(memberId, allTargetIds, affections, memory) {
  if (!allTargetIds.includes(memberId)) return 0;
  if (allTargetIds.length === 1) return 1;

  const aff = affections[memberId] || 0;

  // 其他成员平均好感
  const otherIds = allTargetIds.filter(id => id !== memberId);
  const otherAffAvg = otherIds.length > 0
    ? otherIds.reduce((s, id) => s + (affections[id] || 0), 0) / otherIds.length
    : 0;

  // 近期出场次数
  const appearances = memory.memberAppearances?.[memberId] || [];
  const lastRound = memory.storyRounds?.length > 0
    ? memory.storyRounds[memory.storyRounds.length - 1]?.round
    : 0;
  const recentCount = appearances.filter(r => r >= lastRound - 3).length;

  const affWeight = (aff / 100) * 0.4;  // main member affection weight 0.4
  const balanceWeight = (1 - otherAffAvg / 100) * 0.3; // sub member balance weight 0.3
  const recencyPenalty = Math.max(0, 0.2 - recentCount * 0.06); // recency penalty up to 0.2, -0.06 per recent appearance
  const randomFactor = Math.random() * 0.1;
  // 如果该成员近 4 轮从未出场，直接给最低 30% 概率
  if (recentCount === 0) {
    return Math.max(0.3, affWeight + balanceWeight + recencyPenalty + randomFactor);
  }
  return Math.min(0.7, affWeight + balanceWeight + recencyPenalty + randomFactor);
}

/**
 * 按概率抽选本轮主要互动成员
 * @returns {string} 成员 ID
 */
export function pickPrimaryMember(allTargetIds, affections, memory) {
  if (allTargetIds.length <= 1) return allTargetIds[0];

  const probs = allTargetIds.map(id => ({
    id,
    prob: calculateProbability(id, allTargetIds, affections, memory),
  }));

  const total = probs.reduce((s, p) => s + p.prob, 0) || 1;
  let r = Math.random() * total;
  for (const p of probs) {
    r -= p.prob;
    if (r <= 0) return p.id;
  }
  return probs[probs.length - 1].id;
}