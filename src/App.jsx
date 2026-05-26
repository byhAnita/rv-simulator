import { createInitialStats, executeRound, popPendingSocial } from "./agent/mainAgent";
import { getStageName, getStageColor, getStageIdx } from "./config/stageConfig";
import { useTranslation } from "./i18n";
import { useState, useRef, useEffect, useCallback } from "react";
import { loadGroupConfig, loadGroupIndex, getNpcMembers } from "./rag/groupLoader";
import { createEmptyMemory } from "./agent/memoryPool";
import { getTopMember } from "./agent/memoryPool";
import { MODEL_CONFIGS } from "./config/modelConfigs";
import { KKT_THRESHOLD, MEMORY_ROUNDS, MAIN_INITIAL_AFFECTION, SUB_INITIAL_AFFECTION_MIN, SUB_INITIAL_AFFECTION_MAX } from "./config/constants";
import { STORAGE_KEYS, loadFromStorage, saveToStorage, nowTime } from "./utils";
import { checkRelationshipEvents } from "./config/relationshipEvents";
import { checkAchievement } from "./config/achievements";
import BubbleOverlay from "./platforms/BubbleOverlay";
import InstagramOverlay from "./platforms/InstagramOverlay";
import WeverseOverlay from "./platforms/WeverseOverlay";
import KakaoOverlay from "./platforms/KakaoOverlay";
import SaveOverlay from "./platforms/SaveOverlay";


const IDENTITIES = [
  { id: "练习生", label: "练习生" },
  { id: "Staff", label: "Staff" },
  { id: "韩娱艺人", label: "韩娱艺人" },
  { id: "粉丝", label: "粉丝" },
  { id: "留学生", label: "留学生" },
  { id: "财阀", label: "财阀" },
  { id: "主线成员前女友", label: "主线成员前女友" },
  { id: "H", label: "[自定义]" },
];
const STAR_LEVELS = ["资深粉丝", "普通韩娱瓜众", "纯路人", "已脱粉"];
const PACES = ["慢热现实向", "浪漫情感向", "高压舆论向", "修罗海王向"];

function buildStatsBox(stats, members, mainId, subIds, t) {
  const mainMember = members.find(m => m.id === mainId);
  const subLines = subIds.map(id => {
    const m = members.find(mb => mb.id === id);
    return `${m?.emoji}${m?.name}: ${stats.multiAff?.[id] || 0}/100`;
  }).join(" | ");
  
  return [
    "╔══════════════════════════════╗",
    `💗 ${mainMember?.emoji}${mainMember?.name}: ${stats.affection}/100`,
    `🌈${t.stats.selfId.label}: ${stats.selfId} | 🔒${t.stats.secrecy.label}: ${stats.secrecy}`,
    `👁${t.stats.alert.label}: ${stats.alert} | 📊${t.stats.pressure.label}: ${stats.pressure}`,
    `💫${t.stats.mood.label}: ${stats.mood} | 📅${t.stats.week.label} ${stats.week} | 📍${stats.scene}`,
    `🎭: [${stats.chapter || "start"}]`,
    subLines || "",
    "╚══════════════════════════════╝",
  ].join("\n");
}

export default function App() {
  const [language, setLanguage] = useState(() => loadFromStorage("rv_sim_language") || "zh");  // ← language 先声明
  const { t, interpolate } = useTranslation(language);  // ← 然后 useTranslation
  const [selectedGroup, setSelectedGroup] = useState(() => loadFromStorage("rv_sim_group") || "red_velvet");
  const [groupList, setGroupList] = useState([]);
  const [phase, setPhase] = useState("cover");
  const [apiKey, setApiKey] = useState(() => loadFromStorage(STORAGE_KEYS.API_KEY) || "");
  const [selectedModel, setSelectedModel] = useState(() => loadFromStorage(STORAGE_KEYS.SELECTED_MODEL) || "deepseek");
  const [form, setForm] = useState({ mainMember: null, subMembers: [], identity: "", customIdentity: "", name: "", nationality: "", age: "", nickname: "", herNickname: "", starLevel: "", pace: "" });
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [groupConfig, setGroupConfig] = useState(null);
  const [members, setMembers] = useState([]);
  const [proposalRound, setProposalRound] = useState(null);
  const [achievement, setAchievement] = useState(null);
  const statsRef = useRef(null);
  const [stats, setStats] = useState(null);
  const memoryRef = useRef(createEmptyMemory());
  const [socialFeeds, setSocialFeeds] = useState({});
  const [kktUnlocked, setKktUnlocked] = useState({});
  const [kktMessages, setKktMessages] = useState({});
  const [activeNotifications, setActiveNotifications] = useState([]);
  const [currentOptions, setCurrentOptions] = useState([]);
  const [overlay, setOverlay] = useState(null);
  const [notification, setNotification] = useState(null);
  const [hoveredStat, setHoveredStat] = useState(null);
  const [topMember, setTopMember] = useState(null);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  const mainMember = members.find(m => m.id === form.mainMember);
  const subMembersList = (form.subMembers || []).map(id => members.find(m => m.id === id)).filter(Boolean);
  const allTargetMembers = [mainMember, ...subMembersList].filter(Boolean);
  const npcMembers = groupConfig ? getNpcMembers(members, form.mainMember, form.subMembers || []) : [];

  // 在 useEffect 中加载组合列表：
  useEffect(() => {
    loadGroupIndex().then(list => {
      setGroupList(list);
      if (!list.find(g => g.id === selectedGroup)) {
        setSelectedGroup(list[0]?.id || "red_velvet");
      }
    }).catch(console.error);
  }, []);

  // 当 selectedGroup 变化时，重新加载 RAG：
  useEffect(() => {
    loadGroupConfig(selectedGroup, language).then(config => {
      setGroupConfig(config);
      setMembers(config.members);
      setForm(f => ({ ...f, mainMember: null, subMembers: [] }));
      saveToStorage("rv_sim_group", selectedGroup);
    }).catch(console.error);
  }, [selectedGroup, language]);

  useEffect(() => { if (bottomRef.current) bottomRef.current.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);

  const showNotif = (msg, type = "info") => { setNotification({ msg, type }); setTimeout(() => setNotification(null), 3000); };
  const saveApiKey = (key) => { const t = key.trim(); setApiKey(t); if (t) { saveToStorage(STORAGE_KEYS.API_KEY, t); showNotif("Key saved"); } };
  const handleModelSelect = (id) => { setSelectedModel(id); saveToStorage(STORAGE_KEYS.SELECTED_MODEL, id); showNotif("Switched to " + MODEL_CONFIGS[id]?.name); };

  const hasSaves = () => {
    const saves = loadFromStorage(STORAGE_KEYS.SAVES) || [];
    return saves.length > 0;
  };

  const startNewGame = async () => {
    if (!apiKey?.trim()) { showNotif("Please set API Key", "error"); return; }
    if (!form.mainMember) { showNotif("Please select main member", "error"); return; }
    setPhase("game"); setLoading(true);
    const mainId = form.mainMember;
    const subIds = form.subMembers || [];
    const initialStats = createInitialStats(mainId, subIds);
    statsRef.current = initialStats;
    setStats({ ...initialStats });
    const mem = createEmptyMemory();
    mem.playerStats = { selfId: initialStats.selfId, secrecy: initialStats.secrecy, alert: initialStats.alert, pressure: initialStats.pressure, mood: initialStats.mood, week: initialStats.week, scene: initialStats.scene, chapter: initialStats.chapter };
    mem.affections = { [mainId]: initialStats.affection, ...initialStats.multiAff };
    memoryRef.current = mem;
    
    const initFeeds = {};
    allTargetMembers.forEach(m => { initFeeds[m.id] = { bubble: [], instagram: null, weverse: null, timestamp: Date.now(), lastUpdate: Date.now() }; });

    setSocialFeeds(initFeeds);
    setActiveNotifications([]);
    setKktUnlocked({});
    setKktMessages({});
    setTopMember(mainMember);
    try {
      // 立刻弹出上一轮社媒（玩家等待时查看）
      const prevSocial = popPendingSocial();
      if (prevSocial?.feeds) {
        setSocialFeeds(p => {
          const updated = { ...p };
          for (const [mid, feed] of Object.entries(prevSocial.feeds)) {
            updated[mid] = {
              ...(p[mid] || {}),
              bubble: feed.bubble?.length ? feed.bubble : (p[mid]?.bubble || []),
              instagram: feed.instagram || p[mid]?.instagram || null,
              weverse: feed.weverse || p[mid]?.weverse || null,
              timestamp: feed.timestamp || Date.now(),
              lastUpdate: Date.now(),
            };
          }
          return updated;
        });
      }
      if (prevSocial?.notifs?.length) {
        setActiveNotifications(prevSocial.notifs);
      }
      
      const result = await executeRound({
        playerChoice: "Game start",
        stats: initialStats,
        memory: mem,
        form: { ...form, identity: form.identity === "H" ? (form.customIdentity || "Custom") : (IDENTITIES.find(i => i.id === form.identity)?.label || form.identity) },
        members, mainId, subIds, groupConfig, apiKey, selectedModel,
        kktUnlocked: {}, language,
      });
      statsRef.current = result.newStats;
      setStats({ ...result.newStats });
      memoryRef.current = result.updatedMemory;

      // KKT updates from current round context
      setKktMessages(p => ({ ...p, ...Object.fromEntries(Object.entries(result.kktUpdate || {}).map(([k, v]) => [k, [...(p[k] || []), ...(Array.isArray(v) ? v : [])].slice(-20)])) }));
      setKktUnlocked(result.newKktUnlocked);
      setTopMember(result.topMember);
      const statsBox = buildStatsBox(result.newStats, members, mainId, subIds, t);
      setCurrentOptions(result.options);
      setMessages(p => [...p, { role: "assistant", content: statsBox + "\n\n" + result.storyContent }]);
    } catch (e) {
      setMessages([{ role: "assistant", content: "Start failed: " + e.message }]);
    }
    setLoading(false);
  };

  const loadSave = (save) => {
    if (!save) return;
    setForm(save.form);
    setMessages(save.messages);
    statsRef.current = save.stats;
    setStats({ ...save.stats });
    memoryRef.current = save.memory || createEmptyMemory();
    setSocialFeeds(save.socialFeeds || {});
    setKktMessages(save.kktMessages || {});
    setKktUnlocked(save.kktUnlocked || {});
    setCurrentOptions(save.currentOptions || []);
    setActiveNotifications([]);
    setPhase("game");
    showNotif("Save loaded");
  };

  const sendMessage = async (text) => {
    if (!text.trim() || loading) return;

    // 清理文本：限制长度 + 移除可能破坏 JSON 的特殊字符
    const cleanText = text
      .replace(/——/g, '--')       // 中文破折号转英文双连字符
      .replace(/[【】「」『』]/g, '') // 移除特殊括号
      .replace(/\u200B/g, '')     // 移除零宽空格
      .trim()
      .substring(0, 300);         // 限制最大长度

    const um = { role: "user", content: cleanText }, nh = [...messages, um];

    setMessages(nh); setInput(""); setLoading(true);
    try {
      // 立刻弹出上一轮社媒（玩家等待时查看）
      const prevSocial = popPendingSocial();
      if (prevSocial?.feeds) {
        setSocialFeeds(p => {
          const updated = { ...p };
          for (const [mid, feed] of Object.entries(prevSocial.feeds)) {
            updated[mid] = {
              ...(p[mid] || {}),
              bubble: feed.bubble?.length ? feed.bubble : (p[mid]?.bubble || []),
              instagram: feed.instagram || p[mid]?.instagram || null,
              weverse: feed.weverse || p[mid]?.weverse || null,
              timestamp: feed.timestamp || Date.now(),
              lastUpdate: Date.now(),
            };
          }
          return updated;
        });
      }
      if (prevSocial?.notifs?.length) {
        setActiveNotifications(prevSocial.notifs);
      }

      const result = await executeRound({
        playerChoice: text,
        stats: statsRef.current,
        memory: memoryRef.current,
        form: { ...form, identity: form.identity === "H" ? (form.customIdentity || "Custom") : (IDENTITIES.find(i => i.id === form.identity)?.label || form.identity) },
        members, mainId: form.mainMember, subIds: form.subMembers || [],
        groupConfig, apiKey, selectedModel, kktUnlocked, language,
      });
      const prevAff = { ...statsRef.current.multiAff, [form.mainMember]: statsRef.current.affection };
      const newStats = { ...result.newStats, _prevAffections: prevAff };
      statsRef.current = newStats;
      setStats({ ...newStats });
      memoryRef.current = result.updatedMemory;
      setKktMessages(p => ({ ...p, ...Object.fromEntries(Object.entries(result.kktUpdate || {}).map(([k, v]) => [k, [...(p[k] || []), ...(Array.isArray(v) ? v : [])].slice(-20)])) }));
      setKktUnlocked(result.newKktUnlocked);
      setTopMember(result.topMember);
      if (result.relationshipEvent) {
        showNotif(result.relationshipEvent.title + ": " + result.relationshipEvent.description);
      }
      if (result.achievement) {
        setAchievement(result.achievement);
      }
      const statsBox = buildStatsBox(newStats, members, form.mainMember, form.subMembers || [], t);
      setCurrentOptions(result.options);
      setMessages(p => [...p, { role: "assistant", content: statsBox + "\n\n" + result.storyContent }]);
    } catch (e) {
      setMessages(p => [...p, { role: "assistant", content: "Error: " + e.message }]);
    }
    setLoading(false);
  };

  const openSocialPlatform = (platform, memberId = null) => {
    setOverlay({ type: platform, memberId: memberId || form.mainMember });
  };

  const getAffection = (mid) => mid === form.mainMember ? (stats?.affection || 0) : (stats?.multiAff?.[mid] || 0);
  const getStage = (aff) => ({ label: getStageName(aff), color: getStageColor(aff) });
  const quickOptions = currentOptions.map((opt, i) => {
  const letter = String.fromCharCode(65 + i); // A, B, C, D
  const text = opt.replace(/^[ABCD][.、．]\s*/, '');
  return { letter, text };
  });
  
  const hasNotifDot = (platform) => activeNotifications.some(n => n.platform === platform);
  const displayTopMember = topMember || mainMember;
  const topAff = displayTopMember ? getAffection(displayTopMember.id) : 0;
  const stageIdx = getStageIdx(topAff);
  const stageColor = getStageColor(topAff);
  const stageLabel = t.stageNames[stageIdx];

  const NotificationBar = () => notification ? <div style={{ position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)", background: notification.type === "error" ? "rgba(220,50,50,.92)" : "rgba(50,180,100,.92)", color: "#fff", padding: "8px 20px", borderRadius: 20, fontSize: 12, fontWeight: 600, zIndex: 9999, pointerEvents: "none" }}>{notification.msg}</div> : null;

  // ── Cover Page ──
  if (phase === "cover") {
    const coverTexts = {
      zh: { subtitle: "嫂嫂模拟器", desc: "AI文游·女团恋爱养成·v11.1 RAG", newGame: "✨ 开始新游戏", continue: "💾 继续游戏 (读档)", apiKey: "🔑 修改API Key/切换模型" },
      en: { subtitle: "Idol Dating Simulator", desc: "AI Text Adventure · Idol Dating Sim · v11.1 RAG", newGame: "✨ New Game", continue: "💾 Continue (Load Save)", apiKey: "🔑 API Key / Model" },
      ko: { subtitle: "처형 시뮬레이터", desc: "AI 텍스트 어드벤처 · 여성 연애 시뮬레이션 · v11.1 RAG", newGame: "✨ 새 게임", continue: "💾 이어하기 (불러오기)", apiKey: "🔑 API 키 / 모델" },
    };
    const ct = coverTexts[language] || coverTexts.zh;

    return (
    <div style={{ height: "100vh", display: "flex", justifyContent: "center", alignItems: "center", background: "linear-gradient(135deg,#0a0410,#1e0718,#0a0420)" }}>
      <div style={{ width: "100%", maxWidth: 390, height: "100vh", maxHeight: 844, background: "linear-gradient(135deg,#0a0410,#1e0718,#0a0420)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "'Georgia','Noto Serif SC',serif", color: "#f5e6ef", padding: 20, borderRadius: 20, boxShadow: "0 0 40px rgba(0,0,0,.5)", overflow: "hidden" }}>
        <NotificationBar />
        <div style={{ fontSize: 44, marginBottom: 14 }}>💗</div>
        <h1 style={{ fontSize: "clamp(24px,6vw,44px)", fontWeight: 700, background: "linear-gradient(90deg,#f8c8d8,#e887b0,#c86dd0,#e887b0,#f8c8d8)", backgroundSize: "200% auto", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", animation: "shimmerCover 4s linear infinite", marginBottom: 4 }}>Idol Dating</h1>
        <h2 style={{ fontSize: "clamp(13px,2.5vw,20px)", letterSpacing: ".3em", color: "#d898b8", marginBottom: 4 }}>{ct.subtitle}</h2>
        <p style={{ fontSize: 10, color: "#806070", letterSpacing: ".1em", marginBottom: 16 }}>{ct.desc}</p>

        {/* Group Selection */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, justifyContent: "center", marginBottom: 16 }}>
          {groupList.map(g => (
            <button key={g.id}
              onClick={() => setSelectedGroup(g.id)}
              style={{
                display: "flex", alignItems: "center", gap: 3,
                padding: "4px 9px", borderRadius: 12,
                border: `1px solid ${selectedGroup === g.id ? (g.color || "#e887b0") : "rgba(255,255,255,.15)"}`,
                background: selectedGroup === g.id ? (g.color || "#e887b0") + "18" : "rgba(255,255,255,.04)",
                color: selectedGroup === g.id ? "#fff" : "#aaa",
                fontSize: 10, cursor: "pointer", whiteSpace: "nowrap",
              }}>
              <span style={{ fontSize: 12 }}>{g.emoji}</span>
              <span style={{ fontWeight: selectedGroup === g.id ? 700 : 400 }}>{g.name}</span>
            </button>
          ))}
        </div>

        {/* Language Selection */}
        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          {[
            { code: "zh", label: "中" },
            { code: "en", label: "EN" },
            { code: "ko", label: "한" },
          ].map(lang => (
            <button key={lang.code} onClick={() => { setLanguage(lang.code); saveToStorage("rv_sim_language", lang.code); }}
              style={{
                padding: "6px 14px", borderRadius: 16,
                border: `1px solid ${language === lang.code ? "#e887b0" : "rgba(255,255,255,.2)"}`,
                background: language === lang.code ? "rgba(232,135,176,.15)" : "transparent",
                color: language === lang.code ? "#e887b0" : "#a07090",
                fontSize: 11, cursor: "pointer",
              }}
            >
              {lang.label}
            </button>
          ))}
        </div>

        <button onClick={() => { if (apiKey?.trim()) setPhase("setup"); else setPhase("keyInput"); }} style={{ padding: "14px 48px", borderRadius: 40, border: "none", cursor: "pointer", background: "linear-gradient(135deg,#e887b0,#c86dd0)", color: "#fff", fontSize: 15, fontWeight: 700, marginBottom: 10 }}>{ct.newGame}</button>
        {hasSaves() && <button onClick={() => { setOverlay({ type: "save" }); }} style={{ padding: "10px 32px", borderRadius: 40, border: "1px solid rgba(232,120,176,.3)", background: "transparent", color: "#c898b8", fontSize: 13, cursor: "pointer", marginBottom: 10 }}>{ct.continue}</button>}
        <button onClick={() => setPhase("keyInput")} style={{ background: "none", border: "1px solid rgba(232,120,176,.3)", borderRadius: 16, padding: "6px 16px", color: "#c898b8", fontSize: 11, cursor: "pointer" }}>{ct.apiKey}</button>
      </div>
      {overlay?.type === "save" && <SaveOverlay t={t} stats={stats} member={displayTopMember} form={form} messages={messages} socialFeeds={socialFeeds} kktMessages={kktMessages} kktUnlocked={kktUnlocked} memory={memoryRef.current} onLoad={loadSave} onClose={() => setOverlay(null)} />}
    </div>
    );
  }

  // ── Key Input Page ──
  if (phase === "keyInput") {
    const currentPlatformName = MODEL_CONFIGS[selectedModel]?.keyHelp?.includes("deepseek") ? "platform.deepseek.com"
      : MODEL_CONFIGS[selectedModel]?.keyHelp?.includes("google") ? "aistudio.google.com"
      : MODEL_CONFIGS[selectedModel]?.keyHelp?.includes("anthropic") ? "console.anthropic.com"
      : MODEL_CONFIGS[selectedModel]?.keyHelp?.includes("openai") ? "platform.openai.com"
      : "the platform's website";

    return (
      <div style={{ height: "100vh", display: "flex", justifyContent: "center", alignItems: "center", background: "linear-gradient(160deg,#0a0410,#1e0718,#0a0420)" }}>
        <div style={{ width: "100%", maxWidth: 390, height: "100vh", maxHeight: 844, background: "linear-gradient(160deg,#0a0410,#1e0718,#0a0420)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start", fontFamily: "'Georgia','Noto Serif SC',serif", color: "#f5e6ef", padding: "20px 20px 30px", borderRadius: 20, boxShadow: "0 0 40px rgba(0,0,0,.5)", overflowY: "auto" }}>
          <NotificationBar />
          <div style={{ fontSize: 36, marginBottom: 10 }}>🔑</div>
          <h2 style={{ fontSize: 18, color: "#f8c8d8", marginBottom: 4 }}>{t.keyInput.title}</h2>
          <p style={{ fontSize: 11, color: "#907080", marginBottom: 4, textAlign: "center" }}>{t.keyInput.desc}</p>
          <p style={{ fontSize: 9, color: "#605060", marginBottom: 12, textAlign: "center" }}>💡 {MODEL_CONFIGS[selectedModel]?.keyHelp}</p>

          {/* Model Selector */}
          <div style={{ width: "100%", marginBottom: 12 }}>
            <p style={{ fontSize: 11, color: "#907080", marginBottom: 6, textAlign: "center" }}>{t.keyInput.selectModel}</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5 }}>
              {Object.values(MODEL_CONFIGS).map(c => (
                <div key={c.id} onClick={() => handleModelSelect(c.id)}
                  style={{
                    padding: "7px 9px", borderRadius: 10,
                    border: `1px solid ${selectedModel === c.id ? c.color : "rgba(255,255,255,.1)"}`,
                    background: selectedModel === c.id ? c.color + "15" : "rgba(255,255,255,.03)",
                    cursor: "pointer", userSelect: "none",
                  }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: selectedModel === c.id ? c.color : "#ccc" }}>{c.emoji} {c.name}</div>
                  <div style={{ fontSize: 8, color: "#807080", marginTop: 1 }}>{c.desc}</div>
                </div>
              ))}
            </div>
          </div>

          {/* API Key Guide */}
          <div style={{
            width: "100%", marginBottom: 10, padding: "10px 12px",
            background: "rgba(255,255,255,.04)", borderRadius: 12,
            border: "1px solid rgba(232,120,176,.15)",
          }}>
            <p style={{ fontSize: 11, color: "#f8c8d8", fontWeight: 700, marginBottom: 4 }}>{t.guide?.title}</p>
            <p style={{ fontSize: 9, color: "#c898b8", marginBottom: 6, lineHeight: 1.5 }}>{t.guide?.intro}</p>
            {(t.guide?.steps || []).map((step, i) => (
              <p key={i} style={{ fontSize: 9, color: "#c898b8", marginBottom: 2, lineHeight: 1.5 }}>
                {step.replace('{platform}', currentPlatformName).replace('{prefix}', MODEL_CONFIGS[selectedModel]?.keyPrefix || 'sk-')}
              </p>
            ))}
            <p style={{ fontSize: 9, color: "#e887b0", marginTop: 6, fontWeight: 600 }}>{t.guide?.warning}</p>
            <p style={{ fontSize: 8, color: "#907080", marginTop: 3 }}>{t.guide?.keyManagement}</p>
            <p style={{ fontSize: 8, color: "#907080", marginTop: 2 }}>{t.guide?.billing}</p>
            <p style={{ fontSize: 8, color: "#907080", marginTop: 2 }}>{t.guide?.moreModels}</p>
            <p style={{ fontSize: 8, color: "#907080", marginTop: 2 }}>{t.guide?.noProfit}</p>
          </div>

          {/* Key Input */}
          <input type="password" placeholder={(MODEL_CONFIGS[selectedModel]?.keyPrefix || "sk-") + "..."} value={apiKey} onChange={e => setApiKey(e.target.value)} autoFocus
            style={{ width: "100%", padding: "11px 14px", borderRadius: 12, background: "rgba(255,255,255,.06)", border: `1px solid ${MODEL_CONFIGS[selectedModel]?.color || "rgba(232,120,176,.3)"}`, color: "#f5e6ef", fontSize: 13, outline: "none", boxSizing: "border-box", fontFamily: "'Courier New',monospace", marginBottom: 14 }} />

          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => { if (apiKey?.trim()) { saveApiKey(apiKey); setPhase("setup"); } else showNotif(t.common?.enterKey || "Please enter API Key", "error"); }} disabled={!apiKey?.trim()}
              style={{ padding: "10px 28px", borderRadius: 40, border: "none", cursor: apiKey?.trim() ? "pointer" : "not-allowed", background: apiKey?.trim() ? `linear-gradient(135deg,${MODEL_CONFIGS[selectedModel]?.color || "#e887b0"},#c86dd0)` : "rgba(255,255,255,.08)", color: "#fff", fontSize: 14, fontWeight: 600 }}>
              {t.keyInput.confirm}
            </button>
            <button onClick={() => setPhase("cover")}
              style={{ padding: "10px 20px", borderRadius: 40, border: "1px solid rgba(232,120,176,.3)", background: "transparent", color: "#c898b8", fontSize: 13, cursor: "pointer" }}>
              {t.keyInput.back}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Setup Page ──
  if (phase === "setup") {
    const canStart = form.mainMember && form.name && form.age && form.identity && form.starLevel && form.pace;
    return (
      <div style={{ height: "100vh", display: "flex", justifyContent: "center", alignItems: "center", background: "linear-gradient(160deg,#0a0410,#1e0718,#0a0420)" }}>
        <div style={{ width: "100%", maxWidth: 390, height: "100vh", maxHeight: 844, background: "linear-gradient(160deg,#0a0410,#1e0718,#0a0420)", fontFamily: "'Georgia','Noto Serif SC',serif", color: "#f5e6ef", padding: "12px 10px 40px", overflowY: "auto", borderRadius: 20, boxShadow: "0 0 40px rgba(0,0,0,.5)" }}>
          <NotificationBar />
          <style>{`.s-l{font-size:11px;color:#c886a8;margin-bottom:6px;margin-top:14px;font-weight:600}.s-c{background:rgba(255,255,255,.04);border:1px solid rgba(232,120,176,.18);border-radius:10px;padding:10px 12px;cursor:pointer;display:flex;align-items:center;gap:8px;margin-bottom:5px;user-select:none}.s-c.sel{border-color:#e887b0;background:rgba(232,135,176,.12)}.s-in{width:100%;padding:9px 11px;border-radius:8px;background:rgba(255,255,255,.05);border:1px solid rgba(232,120,176,.18);color:#f5e6ef;font-size:12px;outline:none;box-sizing:border-box;font-family:inherit}.s-ch{display:inline-block;padding:6px 11px;border-radius:15px;background:rgba(255,255,255,.04);border:1px solid rgba(232,120,176,.18);cursor:pointer;fontSize:11px;margin:2px;user-select:none}.s-ch.sel{background:rgba(232,135,176,.2);border-color:#e887b0;color:#f8c8d8}.s-g2{display:grid;grid-template-columns:1fr 1fr;gap:5px}`}</style>
          <div style={{ textAlign: "center", padding: "10px 0 2px" }}>
            <h2 style={{ fontSize: 18, color: "#f8c8d8", marginBottom: 2 }}>Character Creation</h2>
            <p style={{ fontSize: 10, color: "#906070" }}>RAG loaded: {groupConfig?.group?.name || "Loading..."}</p>
            <div style={{ marginTop: 6, fontSize: 10, color: apiKey ? "#6d9b6d" : "#d07070", display: "flex", alignItems: "center", justifyContent: "center", gap: 4, flexWrap: "wrap" }}>
              <span>{apiKey ? "Key configured" : "Key missing"}</span>
              <span style={{ color: "#907080" }}>{MODEL_CONFIGS[selectedModel]?.emoji} {MODEL_CONFIGS[selectedModel]?.name}</span>
              <button onClick={() => setPhase("keyInput")} style={{ background: "none", border: "1px solid rgba(232,120,176,.2)", borderRadius: 6, padding: "2px 6px", color: "#c898b8", fontSize: 9, cursor: "pointer" }}>Change</button>
            </div>
          </div>

          {/* ① Main Member */}
          <div className="s-l">{t.setup.mainMember(MAIN_INITIAL_AFFECTION)}</div>
          {members.length === 0 ? (
            <div style={{textAlign:"center",color:"#907080",padding:20,fontSize:12}}>{t.setup.loading}</div>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 6 }}>
              {members.map(m => (
                <button key={m.id}
                  onClick={() => setForm(f => ({ ...f, mainMember: m.id, subMembers: (f.subMembers || []).filter(id => id !== m.id) }))}
                  style={{
                    display: "flex", alignItems: "center", gap: 4, padding: "6px 10px",
                    borderRadius: 14, border: `1px solid ${form.mainMember === m.id ? m.accent : "rgba(255,255,255,.15)"}`,
                    background: form.mainMember === m.id ? m.accent + "18" : "rgba(255,255,255,.04)",
                    color: form.mainMember === m.id ? "#fff" : "#ccc",
                    fontSize: 12, cursor: "pointer", whiteSpace: "nowrap",
                  }}>
                  <span style={{ fontSize: 16 }}>{m.emoji}</span>
                  <span style={{ fontWeight: form.mainMember === m.id ? 700 : 400 }}>{m.name_kr}</span>
                </button>
              ))}
            </div>
          )}

          {/* Sub Members */}
          <div className="s-l">{t.setup.subMember(SUB_INITIAL_AFFECTION_MIN, SUB_INITIAL_AFFECTION_MAX, members.length - 1)}</div>
          {members.length === 0 ? (
            <div style={{ textAlign: "center", color: "#907080", padding: 10, fontSize: 11 }}>Loading...</div>
          ) : (
            <>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 4 }}>
                {members.filter(m => m.id !== form.mainMember).map(m => {
                  const sel = (form.subMembers || []).includes(m.id);
                  return <span key={m.id} className={`s-ch${sel ? " sel" : ""}`} onClick={() => setForm(f => ({ ...f, subMembers: sel ? f.subMembers.filter(x => x !== m.id) : [...(f.subMembers || []), m.id].slice(0, members.length - 1) }))}>{m.emoji} {m.name_kr}</span>;
                })}
              </div>
              {members.filter(m => m.id !== form.mainMember && !(form.subMembers || []).includes(m.id)).length > 0 && <p style={{ fontSize: 9, color: "#605060", marginBottom: 4 }}>NPC Members: {members.filter(m => m.id !== form.mainMember && !(form.subMembers || []).includes(m.id)).map(m => m.emoji + m.name_kr).join(", ")}</p>}
            </>
          )}

          {/* Identity */}
          <div className="s-l">{t.setup.identity}</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5, marginBottom: 4 }}>
            {IDENTITIES.map(id => (
              <div key={id.id}
                onClick={() => setForm(f => ({ ...f, identity: id.id }))}
                style={{
                  padding: "7px 10px", borderRadius: 10, textAlign: "center",
                  border: `1px solid ${form.identity === id.id ? "#e887b0" : "rgba(255,255,255,.15)"}`,
                  background: form.identity === id.id ? "rgba(232,135,176,.15)" : "rgba(255,255,255,.04)",
                  color: form.identity === id.id ? "#fff" : "#ccc",
                  fontSize: 11, cursor: "pointer",
                }}>
                {t.identities[id.id] || id.label}
              </div>
            ))}
          </div>
          {form.identity === "H" && (
            <input className="s-in" placeholder={t.setup.customIdentity} value={form.customIdentity}
              onChange={e => setForm(f => ({ ...f, customIdentity: e.target.value }))}
              style={{ marginTop: 4, marginBottom: 6 }} />
          )}


          {/* Basic Info */}
          <div className="s-l">Basic Info</div>
          <div style={{ display: "flex", gap: 5, marginBottom: 5 }}><input className="s-in" placeholder="Name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={{ flex: 2 }} /><input className="s-in" placeholder="Age" value={form.age} onChange={e => setForm(f => ({ ...f, age: e.target.value }))} style={{ flex: 1 }} type="number" min="18" /></div>
          <input className="s-in" placeholder="Nationality (default: Korea)" value={form.nationality} onChange={e => setForm(f => ({ ...f, nationality: e.target.value }))} style={{ marginBottom: 5 }} />
          <div style={{ display: "flex", gap: 5 }}><input className="s-in" placeholder={`Nickname for ${mainMember?.name || "her"}`} value={form.nickname} onChange={e => setForm(f => ({ ...f, nickname: e.target.value }))} /><input className="s-in" placeholder="Her nickname for you" value={form.herNickname} onChange={e => setForm(f => ({ ...f, herNickname: e.target.value }))} /></div>
          
          <div className="s-l">{t.setup.fanLevel}</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5, marginBottom: 4 }}>
            {t.starLevels.map((s, i) => (
              <div key={STAR_LEVELS[i]}
                onClick={() => setForm(f => ({ ...f, starLevel: STAR_LEVELS[i] }))}
                style={{
                  padding: "7px 10px", borderRadius: 10, textAlign: "center",
                  border: `1px solid ${form.starLevel === STAR_LEVELS[i] ? "#e887b0" : "rgba(255,255,255,.15)"}`,
                  background: form.starLevel === STAR_LEVELS[i] ? "rgba(232,135,176,.15)" : "rgba(255,255,255,.04)",
                  color: form.starLevel === STAR_LEVELS[i] ? "#fff" : "#ccc",
                  fontSize: 11, cursor: "pointer",
                }}>
                {s}
              </div>
            ))}
          </div>

          <div className="s-l">{t.setup.pace}</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5, marginBottom: 4 }}>
            {t.paces.map((p, i) => (
              <div key={PACES[i]}
                onClick={() => setForm(f => ({ ...f, pace: PACES[i] }))}
                style={{
                  padding: "7px 10px", borderRadius: 10, textAlign: "center",
                  border: `1px solid ${form.pace === PACES[i] ? "#e887b0" : "rgba(255,255,255,.15)"}`,
                  background: form.pace === PACES[i] ? "rgba(232,135,176,.15)" : "rgba(255,255,255,.04)",
                  color: form.pace === PACES[i] ? "#fff" : "#ccc",
                  fontSize: 11, cursor: "pointer",
                }}>
                {p}
              </div>
            ))}
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 22 }}>
            <button onClick={() => setPhase("cover")}
              style={{
                padding: "13px 20px", borderRadius: 40,
                border: "1px solid rgba(255,255,255,.15)", background: "transparent",
                color: "#a07090", fontSize: 13, cursor: "pointer",
              }}>
              ← {language === "zh" ? "返回" : language === "ko" ? "뒤로" : "Back"}
            </button>
            <button onClick={startNewGame} disabled={!canStart}
              style={{
                flex: 1, padding: "13px", borderRadius: 40, border: "none",
                cursor: canStart ? "pointer" : "not-allowed",
                background: canStart ? "linear-gradient(135deg,#e887b0,#c86dd0)" : "rgba(255,255,255,.08)",
                color: "#fff", fontSize: 14, fontWeight: 700,
              }}>
              {canStart ? `Start with ${mainMember?.name || "..."}` : "Please complete all fields"}
            </button>
        </div>

        </div>
      </div>
    );
  }

  // ── Game Main Screen ──
  if (!groupConfig || !members.length) return <div style={{ height: "100vh", display: "flex", justifyContent: "center", alignItems: "center", background: "#000", color: "#fff" }}>Loading...</div>;

  return (
    <div style={{ height: "100vh", display: "flex", justifyContent: "center", alignItems: "center", background: "#000" }}>
      <div style={{ width: "100%", maxWidth: 390, height: "100vh", maxHeight: 844, display: "flex", flexDirection: "column", background: "linear-gradient(180deg,#080310,#120818)", fontFamily: "'Georgia','Noto Serif SC',serif", color: "#f5e6ef", position: "relative", overflow: "overflow", borderRadius: 20, boxShadow: "0 0 40px rgba(0,0,0,.6)" }}>
        <NotificationBar />
        <style>{`::-webkit-scrollbar{width:2px}::-webkit-scrollbar-thumb{background:rgba(232,120,176,.2)}@keyframes blink{0%,100%{opacity:1}50%{opacity:.25}}@keyframes slideUp{from{transform:translateY(6px);opacity:0}to{transform:translateY(0);opacity:1}}.stat-item{cursor:help;transition:all .15s;position:relative}.stat-item:hover{transform:scale(1.05)}.stat-tooltip{position:absolute;bottom:calc(100% + 6px);left:50%;transform:translateX(-50%);background:rgba(30,5,40,.96);border:1px solid rgba(232,135,176,.5);border-radius:6px;padding:3px 8px;fontSize:9px;color:#f8c8d8;white-space:nowrap;pointer-events:none;z-index:999}.notification-dot{position:absolute;top:-2px;right:-2px;width:7px;height:7px;border-radius:50%;background:#ff3b5c;animation:blink 1s infinite}`}</style>
        
        {/* Top Bar */}
        <div style={{ background: "rgba(6,2,10,.96)", backdropFilter: "blur(12px)", borderBottom: "1px solid rgba(232,120,176,.18)", padding: "5px 8px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0, zIndex: 10, gap: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
            <div style={{ width: 28, height: 28, borderRadius: "50%", background: `linear-gradient(135deg,${displayTopMember?.color || "#f0c8d8"},${displayTopMember?.accent || "#c2185b"})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 }}>{displayTopMember?.emoji || "💗"}</div>
            <div><div style={{ fontSize: 12, fontWeight: 700, color: "#f8c8d8", whiteSpace: "nowrap" }}>{displayTopMember?.name || "RV"}</div><span style={{ fontSize: 8, padding: "1px 5px", borderRadius: 4, background: stageColor + "18", color: stageColor, border: `1px solid ${stageColor}33` }}>{stageLabel}</span></div>
          </div>
          <div style={{ display: "flex", gap: 4, alignItems: "center", fontSize: 10, flexWrap: "wrap", justifyContent: "center", overflow: "visible" }}>
            {stats && [{ key: "selfId", icon: "🌈", label: "Self Identity", value: stats.selfId }, { key: "secrecy", icon: "🔒", label: "Secrecy", value: stats.secrecy }, { key: "alert", icon: "👁", label: "Company Alert", value: stats.alert }, { key: "pressure", icon: "📊", label: "Work Pressure", value: stats.pressure }, { key: "mood", icon: "💫", label: "Mood", value: stats.mood }, { key: "week", icon: "📅", label: "Round", value: stats.week }].map(item => <div key={item.key} className="stat-item" style={{ display: "flex", alignItems: "center", gap: 1, color: "#c898b8", position: "relative" }} onMouseEnter={() => setHoveredStat(item.key)} onMouseLeave={() => setHoveredStat(null)}><span style={{ fontSize: 10 }}>{item.icon}</span><span style={{ fontSize: 8 }}>{item.value}</span>{hoveredStat === item.key && <div className="stat-tooltip">{item.label}: {item.value}</div>}</div>)}
            {allTargetMembers.map(m => { const aff = getAffection(m.id); return <div key={m.id} className="stat-item" style={{ display: "flex", alignItems: "center", gap: 1, color: "#c898b8", position: "relative" }} onMouseEnter={() => setHoveredStat("aff_" + m.id)} onMouseLeave={() => setHoveredStat(null)}><span style={{ fontSize: 10 }}>{m.emoji}</span><span style={{ fontSize: 8 }}>{aff}</span>{hoveredStat === "aff_" + m.id && <div className="stat-tooltip">{m.name_kr} Affection: {aff} ({getStageName(aff)})</div>}</div>})}
          </div>
          <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
            {[{ icon: "💜", type: "bubble" }, { icon: "📸", type: "instagram" }, { icon: "🌿", type: "weverse" }, { icon: "💬", type: "kakao", locked: !kktUnlocked[form.mainMember] }].map(b => { const showDot = hasNotifDot(b.type) && !b.locked; return <button key={b.type} onClick={() => openSocialPlatform(b.type)} style={{ position: "relative", background: b.locked ? "rgba(255,255,255,.03)" : "rgba(255,255,255,.06)", border: `1px solid ${b.locked ? "rgba(255,255,255,.1)" : "rgba(232,120,176,.15)"}`, borderRadius: 5, padding: "3px 5px", color: b.locked ? "#555" : "#d0a8c0", fontSize: 11, cursor: b.locked ? "not-allowed" : "pointer", opacity: b.locked ? .5 : 1 }}>{b.icon}{showDot && <div className="notification-dot" />}</button>; })}
            <button onClick={() => setOverlay({ type: "save" })} style={{ background: "rgba(255,255,255,.06)", border: "1px solid rgba(232,120,176,.15)", borderRadius: 5, padding: "3px 5px", color: "#d0a8c0", fontSize: 11, cursor: "pointer" }}>💾</button>
          </div>
        </div>

        {/* Notification Bar */}
        {activeNotifications.length > 0 && (
  <div style={{ padding: "3px 8px", background: "rgba(255,59,92,.1)", borderBottom: "1px solid rgba(255,59,92,.2)", display: "flex", gap: 6, overflowX: "auto", flexShrink: 0, fontSize: 9, color: "#ff6b8a" }}>
    {activeNotifications.map((n, i) => {
      const m = members.find(mb => mb.id === n.memberId);
      const pn = { bubble: "bubble", instagram: "IG", weverse: "Weverse", kakao: "KKT" };
      return (
        <span key={i} onClick={() => openSocialPlatform(n.platform, n.memberId)} style={{ cursor: "pointer", whiteSpace: "nowrap" }}>
          {m?.name_kr || m?.name} {t.notif.updated} {pn[n.platform] || n.platform}
        </span>
      );
    })}
  </div>
)}
        {/* Story Area */}
        <div style={{ flex: 1, overflowY: "auto", padding: "10px 10px" }}>
          {messages.length === 0 && <div style={{ textAlign: "center", padding: "50px 16px", color: "#503050" }}><div style={{ fontSize: 32, marginBottom: 10, animation: "blink 2s infinite" }}>💗</div><div style={{ fontSize: 12 }}>Generating opening story...</div></div>}
          {messages.map((msg, i) => {
            if (msg.hidden) return null;
            if (msg.role === "user") return <div key={i} style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}><div style={{ background: "linear-gradient(135deg,#e887b0,#c86dd0)", color: "#fff", padding: "8px 14px", borderRadius: "14px 14px 3px 14px", maxWidth: "80%", fontSize: 12, lineHeight: 1.6, wordBreak: "break-word" }}>{msg.content}</div></div>;
            const sb = msg.content.match(/╔[\s\S]*?╚[═─]+╝/);
            if (sb) { let af = msg.content.slice(msg.content.indexOf(sb[0]) + sb[0].length); af = af.replace(/\n?[ABCD][.、．]\s*.+/g, '').trim(); return <div key={i} style={{ marginBottom: 14 }}><div style={{ background: "rgba(20,8,28,.95)", border: "1px solid rgba(232,135,176,.3)", borderRadius: 10, padding: "10px 12px", marginBottom: 8, fontFamily: "'Courier New',monospace", fontSize: 10, color: "#d0a8c0", lineHeight: 1.8, whiteSpace: "pre-wrap" }}>{sb[0]}</div>{af && <div style={{ background: "rgba(255,255,255,.03)", border: "1px solid rgba(232,120,176,.15)", borderRadius: "3px 14px 14px 14px", padding: "12px 14px", fontSize: 13, lineHeight: 1.8, whiteSpace: "pre-wrap", color: "#f0dce8" }}>{af}</div>}</div>; }
            return <div key={i} style={{ marginBottom: 14 }}><div style={{ background: "rgba(255,255,255,.03)", border: "1px solid rgba(232,120,176,.15)", borderRadius: "3px 14px 14px 14px", padding: "12px 14px", fontSize: 13, lineHeight: 1.8, whiteSpace: "pre-wrap", color: "#f0dce8" }}>{msg.content}</div></div>;
          })}
          {loading && <div style={{ display: "flex", gap: 4, padding: 8, alignItems: "center" }}>{[0, 1, 2].map(i => <div key={i} style={{ width: 4, height: 4, borderRadius: "50%", background: "#e887b0", animation: `blink 1.2s ${i * .2}s infinite` }} />)}<span style={{ fontSize: 10, color: "#a07090", marginLeft: 2 }}>Story progressing...</span></div>}
          <div ref={bottomRef} />
        </div>

        {/* Options */}
        {quickOptions.length > 0 && !loading && (
          <div style={{ padding: "5px 8px", display: "flex", flexWrap: "wrap", gap: 4, borderTop: "1px solid rgba(232,120,176,.08)", background: "rgba(6,2,10,.85)", flexShrink: 0 }}>
            {quickOptions.map(opt => (
              <button key={opt.letter}
                onClick={() => sendMessage(opt.letter)}  // 只发字母，不发完整文本
                style={{ padding: "5px 10px", borderRadius: 12, border: "1px solid rgba(232,120,176,.25)", background: "rgba(232,135,176,.08)", color: "#f0dce8", fontSize: 11, cursor: "pointer", animation: "slideUp .25s ease", textAlign: "left" }}
              >
                <span style={{ color: "#e887b0", fontWeight: 700 }}>{opt.letter}.</span> {opt.text}
              </button>
            ))}
          </div>
        )}

        {/* Input */}
        <div style={{ padding: "6px 8px", background: "rgba(6,2,10,.96)", borderTop: "1px solid rgba(232,120,176,.12)", display: "flex", gap: 5, alignItems: "flex-end", flexShrink: 0 }}>
          <textarea ref={inputRef} value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); } }}
            placeholder="Type your action or dialogue... (Enter to send)"
            disabled={loading} rows={1}
            maxLength={300}
            style={{ flex: 1, padding: "8px 12px", borderRadius: 12, background: "rgba(255,255,255,.05)", border: "1px solid rgba(232,120,176,.18)", color: "#f5e6ef", fontSize: 12, outline: "none", resize: "none", fontFamily: "inherit", lineHeight: 1.4, maxHeight: 70, overflowY: "auto" }} />
          <button onClick={() => sendMessage(input)} disabled={!input.trim() || loading}
            style={{ width: 34, height: 34, borderRadius: "50%", border: "none", background: input.trim() && !loading ? "linear-gradient(135deg,#e887b0,#c86dd0)" : "rgba(255,255,255,.08)", color: "#fff", fontSize: 14, cursor: input.trim() && !loading ? "pointer" : "not-allowed", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>↑</button>
        </div>

        {/* Overlays */}
        {overlay?.type === "save" && <SaveOverlay t={t} stats={stats} member={displayTopMember} form={form} messages={messages} currentOptions={currentOptions} socialFeeds={socialFeeds} kktMessages={kktMessages} kktUnlocked={kktUnlocked} memory={memoryRef.current} onLoad={loadSave} onClose={() => setOverlay(null)} />}
        {achievement && (
          <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,.85)", backdropFilter: "blur(8px)" }}>
            <div style={{ width: "90%", maxWidth: 340, background: "#1a0a20", border: "1px solid rgba(232,135,176,.5)", borderRadius: 20, padding: "28px 20px", textAlign: "center", boxShadow: "0 20px 60px rgba(232,135,176,.3)" }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>{achievement.icon}</div>
              <div style={{ color: "#f8c8d8", fontSize: 18, fontWeight: 700, marginBottom: 8 }}>{achievement.title}</div>
              <div style={{ color: "#c898b8", fontSize: 13, lineHeight: 1.7, marginBottom: 20 }}>{achievement.description}</div>
              <button onClick={() => setAchievement(null)} style={{ padding: "10px 32px", borderRadius: 24, background: "linear-gradient(135deg,#e887b0,#c86dd0)", border: "none", color: "#fff", fontSize: 14, cursor: "pointer" }}>Continue</button>
            </div>
          </div>
        )}
        {overlay?.type === "bubble" && <BubbleOverlay t={t} memberId={overlay.memberId} members={members} socialFeeds={socialFeeds} allTargetMembers={allTargetMembers} kktUnlocked={kktUnlocked} onClose={() => setOverlay(null)} />}
        {overlay?.type === "instagram" && <InstagramOverlay t={t} memberId={overlay.memberId} members={members} socialFeeds={socialFeeds} allTargetMembers={allTargetMembers} onClose={() => setOverlay(null)} />}
        {overlay?.type === "weverse" && <WeverseOverlay t={t} memberId={overlay.memberId} members={members} socialFeeds={socialFeeds} allTargetMembers={allTargetMembers} onClose={() => setOverlay(null)} />}
        {overlay?.type === "kakao" && <KakaoOverlay t={t} memberId={overlay.memberId} members={members} kktMessages={kktMessages} kktUnlocked={kktUnlocked} allTargetMembers={allTargetMembers} onClose={() => setOverlay(null)} />}
      </div>
    </div>
  );
}