// src/tools/socialMediaTool.js
// 社媒内容生成 Tool

import { callLLM } from "./llmTool";
import { nowTime } from "../utils";

/**
 * 为指定成员生成社媒内容
 * @returns {Promise<{feed: object, notifs: Array}>}
 */
export async function generateSocialContent(memberId, member, memoryContext, systemPrompt, apiKey, modelId) {
  const notifs = [];
  let feed = {
    bubble: [{ content: "今天也辛苦了💜", hasPhoto: false }],
    instagram: { caption: "✨", likes: 800000 },
    weverse: { content: "大家好~", likes: 2000, comments: 100 },
    timestamp: Date.now(),
  };

  try {
    const prompt = `【社媒生成】基于记忆池为${member?.name}生成社交动态。格式JSON:{"bubble":[{"content":"...","hasPhoto":false}],"instagram":{"caption":"...","likes":800000},"weverse":{"content":"...","likes":2000,"comments":100}}。风格：bubble对粉丝日常1-3条(中文含少量韩语)、INS配图短文+emoji、Weverse社区互动。基于近期故事。`;
    const reply = await callLLM(prompt, [], `${systemPrompt}\n${memoryContext}`, apiKey, modelId);

    try {
      const json = JSON.parse(reply.match(/\{[\s\S]*\}/)?.[0] || "{}");
      feed = {
        bubble: json.bubble || [{ content: "今天也辛苦了💜", hasPhoto: false }],
        instagram: json.instagram || { caption: "✨", likes: 800000 },
        weverse: json.weverse || { content: "大家好~", likes: 2000, comments: 100 },
        timestamp: Date.now(),
      };

      if (json.bubble?.length) notifs.push({ platform: "bubble", memberId });
      if (json.instagram) notifs.push({ platform: "instagram", memberId });
      if (json.weverse) notifs.push({ platform: "weverse", memberId });
    } catch {
      notifs.push({ platform: "bubble", memberId });
    }
  } catch {
    notifs.push({ platform: "bubble", memberId });
  }

  return { feed, notifs };
}