// src/tools/kktTool.js
// KKT 私聊消息生成 Tool

import { callLLM } from "./llmTool";
import { nowTime } from "../utils";

/**
 * 为指定成员生成 KKT 私聊消息
 * @returns {Promise<{msgs: Array, notifs: Array}>}
 */
export async function generateKktMessages(memberId, member, affection, memoryContext, systemPrompt, apiKey, modelId) {
  const notifs = [];
  const msgs = [];

  try {
    const prompt = `【KKT私聊】${member?.name}好感${affection}，阶段突破。基于记忆池生成1-3条她发给玩家的私聊(中文含少量韩语)。格式:["消息1","消息2"]`;
    const reply = await callLLM(prompt, [], `${systemPrompt}\n${memoryContext}`, apiKey, modelId);

    try {
      const arr = JSON.parse(reply.match(/\[[\s\S]*\]/)?.[0] || "[]");
      arr.forEach(t => msgs.push({ from: "member", content: t, time: nowTime() }));
    } catch {
      msgs.push({ from: "member", content: reply.substring(0, 100), time: nowTime() });
    }

    if (msgs.length > 0) notifs.push({ platform: "kakao", memberId });
  } catch {
    msgs.push({ from: "member", content: "안녕~ 你好呀", time: nowTime() });
    notifs.push({ platform: "kakao", memberId });
  }

  return { msgs, notifs };
}