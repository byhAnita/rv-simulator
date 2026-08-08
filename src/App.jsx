import { createInitialStats, executeRound, popPendingSocial, resetPendingSocial } from "./agent/mainAgent";
import { getStageName, getStageColor, getStageIdx } from "./config/stageConfig";
import { useTranslation } from "./i18n";
import { useState, useRef, useEffect } from "react";
import { loadGroupConfig, loadGroupIndex, getNpcMembers } from "./rag/groupLoader";
import { createEmptyMemory, isLegacyMemory } from "./agent/memoryPool";
import { getTopMember } from "./agent/memoryPool";
import { MODEL_CONFIGS } from "./config/modelConfigs";
import { KKT_THRESHOLD, MAIN_INITIAL_AFFECTION, SUB_INITIAL_AFFECTION_MIN, SUB_INITIAL_AFFECTION_MAX } from "./config/constants";
import { STORAGE_KEYS, loadFromStorage, saveToStorage, nowTime } from "./utils";
import { checkRelationshipEvents } from "./config/relationshipEvents";
import { checkAchievement } from "./config/achievements";
import BubbleOverlay from "./platforms/BubbleOverlay";
import InstagramOverlay from "./platforms/InstagramOverlay";
import WeverseOverlay from "./platforms/WeverseOverlay";
import KakaoOverlay from "./platforms/KakaoOverlay";
import SaveOverlay from "./platforms/SaveOverlay";
import HelpOverlay from "./platforms/HelpOverlay";

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

const THEMES = {
  dark: {
    pageBg: "linear-gradient(135deg,#0a0410,#1e0718,#0a0420)",
    pageBgAlt: "linear-gradient(160deg,#0a0410,#1e0718,#0a0420)",
    gameBg: "linear-gradient(180deg,#080310,#120818)",
    outerBg: "#000",
    panelBg: "#110820",
    cardBg: "rgba(255,255,255,.03)",
    statsBg: "rgba(20,8,28,.95)",
    storyBg: "rgba(255,255,255,.03)",
    topBarBg: "rgba(6,2,10,.96)",
    inputBg: "rgba(255,255,255,.05)",
    inputAreaBg: "rgba(6,2,10,.96)",
    optionsBtnBg: "#e887b0" + "10",
    optionsBg: "rgba(6,2,10,.85)",
    modalOverlay: "rgba(0,0,0,.75)",
    achieveOverlay: "rgba(0,0,0,.85)",
    achieveBg: "#1a0a20",
    border: "rgba(232,120,176,.15)",
    borderAccent: "rgba(232,135,176,.3)",
    borderFaint: "rgba(232,120,176,.12)",
    borderSubtle: "rgba(232,120,176,.08)",
    borderDim: "rgba(232,120,176,.18)",
    textPrimary: "#f5e6ef",
    textHeading: "#f8c8d8",
    textSecondary: "#c898b8",
    textMuted: "#f8c8d8",
    textFaint: "#605060",
    textStory: "#f0dce8",
    textStats: "#d0a8c0",
    accent: "#e887b0",
    accentGrad: "linear-gradient(135deg,#e887b0,#c86dd0)",
    guideBg: "rgba(255,255,255,.04)",
    guideText: "#f8c8d8",
    guideBilling: "#e887b0",
    guideHint: "#b090c0",
    guideWarning: "#846875",
    guideMuted: "#907080",
    memberBtnBg: "rgba(255,255,255,.04)",
    memberBtnColor: "#ccc",
    modelCardBg: "rgba(255,255,255,.03)",
    modelCardColor: "#ccc",
    subModelCardBg: "rgba(255,255,255,.03)",
    subModelCardColor: "#bbb",
    scrollCss: `::-webkit-scrollbar{width:2px}::-webkit-scrollbar-thumb{background:rgba(232,120,176,.2)}`,
    setupCss: `.s-l{font-size:11px;color:#c886a8;margin-bottom:6px;margin-top:14px;font-weight:600}.s-c{background:rgba(255,255,255,.04);border:1px solid rgba(232,120,176,.18);border-radius:10px;padding:10px 12px;cursor:pointer;display:flex;align-items:center;gap:8px;margin-bottom:5px;user-select:none}.s-c.sel{border-color:#e887b0;background:rgba(232,135,176,.12)}.s-in{width:100%;padding:9px 11px;border-radius:8px;background:rgba(255,255,255,.05);border:1px solid rgba(232,120,176,.18);color:#f5e6ef;font-size:12px;outline:none;box-sizing:border-box;font-family:inherit}.s-ch{display:inline-block;padding:6px 11px;border-radius:15px;background:rgba(255,255,255,.04);border:1px solid rgba(232,120,176,.18);cursor:pointer;fontSize:11px;margin:2px;user-select:none}.s-ch.sel{background:rgba(232,135,176,.2);border-color:#e887b0;color:#f8c8d8}.s-g2{display:grid;grid-template-columns:1fr 1fr;gap:5px}`,
    notifBarBg: "rgba(255,59,92,.1)",
    notifBarBorder: "rgba(255,59,92,.2)",
    notifBarText: "#ff6b8a",
    keySuccessBg: "rgba(100,200,120,.06)",
    keySuccessBorder: "rgba(100,200,120,.25)",
    keySuccessText: "#90d8a0",
    helpBtnBg: "rgba(160,100,200,.1)",
    helpBtnBorder: "rgba(160,100,200,.3)",
    helpBtnColor: "#a888c8",
    settingsDivider: "rgba(232,120,176,.12)",
    switchLlmBorder: "rgba(98,54,255,.4)",
    switchLlmBg: "rgba(98,54,255,.08)",
    switchLlmColor: "#a898e8",
    warnBg: "rgba(232,80,80,.08)",
    warnBorder: "rgba(232,100,100,.25)",
    warnTitle: "#f0c0b0",
    warnDesc: "#907080",
    reasoningOnBg: "#9b59b6",
    reasoningOnBorder: "#c86dd0",
    reasoningOffBg: "rgba(255,255,255,.1)",
    reasoningOffBorder: "rgba(255,255,255,.2)",
    reasoningKnob: "#907080",
    groupBtnBorder: "rgba(255,255,255,.15)",
    groupBtnBg: "rgba(255,255,255,.04)",
    groupBtnColor: "#aaa",
    langBtnActiveBorder: "#e887b0",
    langBtnActiveBg: "rgba(232,135,176,.15)",
    langBtnActiveColor: "#e887b0",
    langBtnBorder: "rgba(255,255,255,.2)",
    langBtnColor: "#a07090",
    newGameDisabled: "rgba(180,120,160,.3)",
    newGameDisabledColor: "#a07090",
    coverContinueBorder: "rgba(232,120,176,.3)",
    coverContinueColor: "#c898b8",
    coverApiBorder: "rgba(232,120,176,.3)",
    coverApiColor: "#c898b8",
    coverHelpColor: "#605060",
    actionBtnBorder: "rgba(232,120,176,.22)",
    copiedColor: "#6db87a",
    actionColor: "#a07090",
    actionBtnBg: "#e887b0" + "10",
    themeBtnBg: "rgba(255,255,255,.06)",
    themeBtnBorder: "rgba(255,255,255,.15)",
    themeBtnColor: "#c898b8",
    topBarText: "#f8c8d8",
    topBarStatText: "#c898b8",
    topBarIconBg: "rgba(255,255,255,.06)",
    topBarIconBorder: "rgba(232,120,176,.2)",
  },
  light: {
    pageBg: "linear-gradient(135deg,#a08060,#ede6d6,#a08060)",
    pageBgAlt: "linear-gradient(160deg,#a08060,#ede6d6,#a08060)",
    gameBg: "linear-gradient(180deg,#a08060,#f5e8d0)",
    outerBg: "#a08060",
    panelBg: "#e0d2b8",
    cardBg: "rgba(100,70,20,.07)",
    statsBg: "#f5e8d0",
    storyBg: "#f5e8d0",
    topBarBg: "linear-gradient(135deg,#5c3820,#3a2210)",
    inputBg: "#f5e8d0",
    inputAreaBg: "linear-gradient(135deg,#5c3820,#3a2210)",
    optionsBtnBg: "rgba(245, 232, 208, 0.9)",
    optionsBg: "rgba(160,90,20,.1)",
    modalOverlay: "rgba(40,25,5,.55)",
    achieveOverlay: "rgba(40,25,5,.78)",
    achieveBg: "#faf7f0",
    border: "#a08060",
    borderAccent: "#a08060",
    borderFaint: "#a08060",
    borderSubtle: "#a08060",
    borderDim: "#a08060",
    textPrimary: "#8a6840",
    textHeading: "#3a2510",
    textSecondary: "#6b4528",
    textMuted: "#3a2a0e",
    textFaint: "#a8845a",
    textStory: "#1e1408",
    textStats: "#5a3a18",
    accent: "#c8a870",
    accentGrad: "linear-gradient(135deg,#c8a84b,#a0522d)",
    guideBg: "#f5e8d0",
    guideText: "#3a2a0e",
    guideBilling: "#8b6914",
    guideHint: "#7a5c2a",
    guideWarning: "#8b4a14",
    guideMuted: "#9a7c5a",
    memberBtnBg: "rgba(100,65,20,.06)",
    memberBtnColor: "#6b4528",
    modelCardBg: "rgba(100,65,20,.05)",
    modelCardColor: "#6b4528",
    subModelCardBg: "rgba(100,65,20,.05)",
    subModelCardColor: "#7a5030",
    scrollCss: `::-webkit-scrollbar{width:2px}::-webkit-scrollbar-thumb{background:rgba(100,65,20,.25)}`,
    setupCss: `.s-l{font-size:11px;color:#8b6914;margin-bottom:6px;margin-top:14px;font-weight:600}.s-c{background:rgba(100,65,20,.06);border:1px solid #a08060;border-radius:10px;padding:10px 12px;cursor:pointer;display:flex;align-items:center;gap:8px;margin-bottom:5px;user-select:none}.s-c.sel{border-color:#a08060;background:rgba(139,105,20,.15)}.s-in{width:100%;padding:9px 11px;border-radius:8px;background:rgba(100,65,20,.07);border:1px solid #a08060;color:#2c1f0e;font-size:12px;outline:none;box-sizing:border-box;font-family:inherit}.s-ch{display:inline-block;padding:6px 11px;border-radius:15px;background:rgba(100,65,20,.06);border:1px solid #a08060;cursor:pointer;fontSize:11px;margin:2px;user-select:none}.s-ch.sel{background:rgba(139,105,20,.18);border-color:#a08060;color:#3a2a0e}.s-g2{display:grid;grid-template-columns:1fr 1fr;gap:5px}`,
    notifBarBg: "linear-gradient(135deg,#c8a84b,#a0522d)",
    notifBarBorder: "#a08060",
    notifBarText: "#fff",
    keySuccessBg: "rgba(80,140,60,.06)",
    keySuccessBorder: "#a08060",
    keySuccessText: "#3a7a2a",
    helpBtnBg: "rgba(139,105,20,.08)",
    helpBtnBorder: "#a08060",
    helpBtnColor: "#6b4f2a",
    settingsDivider: "rgba(139,105,20,.15)",
    switchLlmBorder: "rgba(139,105,20,.4)",
    switchLlmBg: "rgba(139,105,20,.08)",
    switchLlmColor: "#6b4f2a",
    warnBg: "rgba(180,60,20,.06)",
    warnBorder: "#a08060",
    warnTitle: "#8b3a10",
    warnDesc: "#9a7c5a",
    reasoningOnBg: "#a0522d",
    reasoningOnBorder: "#c8a84b",
    reasoningOffBg: "rgba(139,105,20,.15)",
    reasoningOffBorder: "#a08060",
    reasoningKnob: "#9a7c5a",
    groupBtnBorder: "#a08060",
    groupBtnBg: "rgba(139,105,20,.04)",
    groupBtnColor: "#7a5c2a",
    langBtnActiveBorder: "#8b6914",
    langBtnActiveBg: "rgba(160,90,20,.3)",
    langBtnActiveColor: "#8b6914",
    langBtnBorder: "#a08060",
    langBtnColor: "#9a7c5a",
    newGameDisabled: "rgba(139,105,20,.2)",
    newGameDisabledColor: "#9a7c5a",
    coverContinueBorder: "rgba(139,105,20,.3)",
    coverContinueColor: "#6b4f2a",
    coverApiBorder: "rgba(139,105,20,.3)",
    coverApiColor: "#6b4f2a",
    coverHelpColor: "#9a7c5a",
    actionBtnBorder: "#a08060",
    copiedColor: "#4a7a3a",
    actionColor: "#7a5c2a",
    actionBtnBg: "rgba(160,90,20,.1)",
    themeBtnBg: "rgba(100,65,20,.1)",
    themeBtnBorder: "#a08060",
    themeBtnColor: "#6b4528",
    topBarText: "#f5e8d0",
    topBarStatText: "#c8a870",
    topBarIconBg: "#3a2210",
    topBarIconBorder: "#a08060",
  },
};

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
    `💫${t.stats.mood.label}: ${stats.mood} | 📅${t.stats.week.label} ${stats.week} | 📍${stats.scene}`,
    `🎭: [${stats.chapter || "start"}]`,
    subLines || "",
    "╚══════════════════════════════╝",
  ].join("\n");
}

export default function App() {
  const [language, setLanguage] = useState(() => loadFromStorage("rv_sim_language") || "zh");
  const { t, interpolate } = useTranslation(language);
  const [theme, setTheme] = useState(() => loadFromStorage("rv_sim_theme") || "dark");
  const th = THEMES[theme];
  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    saveToStorage("rv_sim_theme", next);
  };
  const themeIcon = theme === "dark" ? "☀️" : "🌙";

  const [selectedGroup, setSelectedGroup] = useState(() => loadFromStorage("rv_sim_group") || null);
  const [groupList, setGroupList] = useState([]);
  const [phase, setPhase] = useState("cover");
  const [apiKey, setApiKey] = useState(() => loadFromStorage(STORAGE_KEYS.API_KEY) || "");
  const [selectedModel, setSelectedModel] = useState(() => loadFromStorage(STORAGE_KEYS.SELECTED_MODEL) || "qwen");
  const [selectedQwenSubModel, setSelectedQwenSubModel] = useState(() => loadFromStorage("rv_sim_qwen_submodel") || "qwen3.8-max");
  const [form, setForm] = useState({ mainMember: null, subMembers: [], identity: "", customIdentity: "", name: "", nationality: "", age: "", nickname: "", herNickname: "", starLevel: "", pace: "" });
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [groupConfig, setGroupConfig] = useState(null);
  const [members, setMembers] = useState([]);
  const [proposalRound, setProposalRound] = useState(null);
  const [achievement, setAchievement] = useState(null);
  const [specialEvent, setSpecialEvent] = useState(null);
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
  const preRoundSnapshotRef = useRef(null);
  const phaseRef = useRef("cover");
  const [copiedStory, setCopiedStory] = useState(false);
  const [reasoningEnabled, setReasoningEnabled] = useState(() => loadFromStorage(STORAGE_KEYS.REASONING) ?? false);
  const [showSettings, setShowSettings] = useState(false);
  const [confirmDest, setConfirmDest] = useState(null);
  const [keyJustSaved, setKeyJustSaved] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [timeSpeed, setTimeSpeed] = useState(() => loadFromStorage("rv_sim_timespeed") || "default");
  const [fontScale, setFontScale] = useState(() => Number(loadFromStorage("rv_sim_fontscale")) || 1);
  const [exportOpen, setExportOpen] = useState(false);

  const mainMember = members.find(m => m.id === form.mainMember);
  const subMembersList = (form.subMembers || []).map(id => members.find(m => m.id === id)).filter(Boolean);
  const allTargetMembers = [mainMember, ...subMembersList].filter(Boolean);
  const npcMembers = groupConfig ? getNpcMembers(members, form.mainMember, form.subMembers || []) : [];

  useEffect(() => {
    loadGroupIndex().then(list => {
      setGroupList(list);
      if (selectedGroup && !list.find(g => g.id === selectedGroup)) setSelectedGroup(null);
    }).catch(console.error);
  }, []);

  useEffect(() => { phaseRef.current = phase; }, [phase]);

  useEffect(() => {
    if (!selectedGroup) return;
    loadGroupConfig(selectedGroup, language).then(config => {
      setGroupConfig(config);
      setMembers(config.members);
      if (phaseRef.current !== "game") {
        setForm(f => ({ ...f, mainMember: null, subMembers: [] }));
      }
      saveToStorage("rv_sim_group", selectedGroup);
    }).catch(console.error);
  }, [selectedGroup, language]);

  useEffect(() => { if (bottomRef.current) bottomRef.current.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);

  const showNotif = (msg, type = "info") => { setNotification({ msg, type }); setTimeout(() => setNotification(null), 3000); };
  const saveApiKey = (key) => { const k = key.trim(); setApiKey(k); if (k) { saveToStorage(STORAGE_KEYS.API_KEY, k); showNotif("Key saved"); } };
  const handleModelSelect = (id) => { setSelectedModel(id); saveToStorage(STORAGE_KEYS.SELECTED_MODEL, id); showNotif("Switched to " + MODEL_CONFIGS[id]?.name); };
  const handleQwenSubModelSelect = (subId) => { setSelectedQwenSubModel(subId); saveToStorage("rv_sim_qwen_submodel", subId); };

  const hasSaves = () => (loadFromStorage(STORAGE_KEYS.SAVES) || []).length > 0;

  const extractStoryText = () =>
    messages.filter(m => m.role === "assistant" && !m.hidden)
      .map((m, i) => {
        const story = m.content.split("\n\n")
          .filter(p => !p.startsWith("╔") && !/^[A-D]\.\s/.test(p))
          .join("\n\n").trim();
        return `=== Round ${i + 1} ===\n${story}`;
      }).join("\n\n---\n\n");

  const exportClipboard = async () => {
    try { await navigator.clipboard.writeText(extractStoryText()); showNotif("Copied to clipboard"); }
    catch { showNotif("Copy failed", "error"); }
    setConfirmDest(null); setShowSettings(false);
  };

  const exportTxt = () => {
    const blob = new Blob([extractStoryText()], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "story.txt"; a.click();
    URL.revokeObjectURL(url);
    setConfirmDest(null); setShowSettings(false);
  };

  const exportPdf = () => {
    setConfirmDest(null); setShowSettings(false);
    const isLight = theme === "light";
    const pageBg     = isLight ? "#a08060"  : "#000";
    const cardBg     = isLight ? "#f5e8d0"  : "rgba(255,255,255,.03)";
    const cardBorder = isLight ? "#a08060"  : "rgba(232,120,176,.15)";
    const cardSolid  = isLight ? "#a08060"  : "#2a1035";
    const textColor  = isLight ? "#1e1408"  : "#f0dce8";
    const headColor  = isLight ? "#3a2510"  : "#f8c8d8";
    const headBg     = isLight ? "linear-gradient(135deg,#5c3820,#3a2210)" : "linear-gradient(135deg,#1e0820,#2d0a2e)";
    const font = "'Georgia','Noto Serif SC',serif";

    const rounds = messages
      .filter(m => m.role === "assistant" && !m.hidden)
      .map((m, i) => {
        const text = m.content.split("\n\n")
          .filter(p => !p.startsWith("╔") && !/^[A-D]\.\s/.test(p))
          .join("\n\n").trim();
        return { n: i + 1, text };
      });

    const cards = rounds.map(r => `
      <div class="card">
        <div class="card-head">Round ${r.n}</div>
        <div class="card-body">${r.text.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\n\n/g,"</p><p>").replace(/\n/g,"<br>")}</div>
      </div>`).join("");

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Story Export</title><style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{background:${pageBg};font-family:${font};padding:28px 20px;min-height:100vh}
      .card{background:${cardBg};border:1px solid ${cardSolid};border-radius:0 14px 14px 14px;margin-bottom:20px;overflow:hidden;page-break-inside:avoid}
      .card-head{background:${headBg};color:#f8c8d8;font-size:11px;font-weight:700;padding:6px 14px;letter-spacing:.08em}
      .card-body{color:${textColor};font-size:13px;line-height:1.85;padding:14px 16px}
      .card-body p{margin-bottom:.9em}
      .card-body p:last-child{margin-bottom:0}
      *{-webkit-print-color-adjust:exact;print-color-adjust:exact}
      @media print{body{padding:14px 12px}@page{margin:12mm}}
    </style></head><body>${cards}</body></html>`;

    const iframe = document.createElement("iframe");
    iframe.style.cssText = "position:fixed;top:-9999px;left:-9999px;width:210mm;height:297mm;border:none;visibility:hidden";
    document.body.appendChild(iframe);
    const idoc = iframe.contentDocument || iframe.contentWindow.document;
    idoc.open(); idoc.write(html); idoc.close();
    iframe.contentWindow.onafterprint = () => document.body.removeChild(iframe);
    setTimeout(() => iframe.contentWindow.print(), 300);
  };

  const startNewGame = async () => {
    if (!apiKey?.trim()) { showNotif("Please set API Key", "error"); return; }
    if (!form.mainMember) { showNotif("Please select main member", "error"); return; }
    const mainId = form.mainMember;
    const subIds = form.subMembers || [];
    setMessages([]); setCurrentOptions([]); setActiveNotifications([]);
    setKktUnlocked({}); setKktMessages({}); setAchievement(null); setSpecialEvent(null);
    setTriggeredAchievements(new Set());
    statsRef.current = null;
    memoryRef.current = createEmptyMemory();
    setPhase("game"); setLoading(true);
    const initialStats = createInitialStats(mainId, subIds);
    statsRef.current = initialStats;
    setStats({ ...initialStats });
    const mem = createEmptyMemory();
    mem.playerStats = { selfId: initialStats.selfId, secrecy: initialStats.secrecy, mood: initialStats.mood, week: initialStats.week, scene: initialStats.scene, chapter: initialStats.chapter };
    mem.affections = { [mainId]: initialStats.affection, ...initialStats.multiAff };
    memoryRef.current = mem;
    const initFeeds = {};
    allTargetMembers.forEach(m => { initFeeds[m.id] = { bubble: [], instagram: null, weverse: null, timestamp: Date.now(), lastUpdate: Date.now() }; });
    setSocialFeeds(initFeeds);
    setTopMember(mainMember);
    try {
      const prevSocial = popPendingSocial();
      if (prevSocial?.feeds) {
        setSocialFeeds(p => {
          const updated = { ...p };
          for (const [mid, feed] of Object.entries(prevSocial.feeds)) {
            updated[mid] = { ...(p[mid] || {}), bubble: feed.bubble?.length ? feed.bubble : (p[mid]?.bubble || []), instagram: feed.instagram || p[mid]?.instagram || null, weverse: feed.weverse || p[mid]?.weverse || null, timestamp: feed.timestamp || Date.now(), lastUpdate: Date.now() };
          }
          return updated;
        });
      }
      if (prevSocial?.notifs?.length) setActiveNotifications(prevSocial.notifs);
      preRoundSnapshotRef.current = { stats: { ...initialStats }, memory: JSON.parse(JSON.stringify(mem)), kktUnlocked: {}, kktMessages: {}, triggeredAchievements: new Set(), playerChoice: "Game start" };
      const result = await executeRound({
        playerChoice: "Game start", stats: initialStats, memory: mem,
        form: { ...form, identity: form.identity === "H" ? (form.customIdentity || "Custom") : (IDENTITIES.find(i => i.id === form.identity)?.label || form.identity) },
        members, mainId, subIds, groupConfig, apiKey, selectedModel, kktUnlocked: {}, language,
        qwenSubModel: selectedModel === "qwen" ? selectedQwenSubModel : null, timeSpeed,
      });
      statsRef.current = result.newStats;
      setStats({ ...result.newStats });
      memoryRef.current = result.updatedMemory;
      setKktMessages(p => ({ ...p, ...Object.fromEntries(Object.entries(result.kktUpdate || {}).map(([k, v]) => [k, [...(p[k] || []), ...(Array.isArray(v) ? v : [])].slice(-20)])) }));
      setKktUnlocked(result.newKktUnlocked);
      setTopMember(result.topMember);
      const statsBox = buildStatsBox(result.newStats, members, mainId, subIds, t);
      setCurrentOptions(result.options);
      setMessages(p => [...p, { role: "assistant", content: statsBox + "\n\n" + result.storyContent }]);
    } catch (e) {
      console.error("Start failed:", e);
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
    const savedMemory = save.memory || createEmptyMemory();
    if (isLegacyMemory(savedMemory)) {
      console.warn("[loadSave] Legacy memory shape detected, resetting memory");
      memoryRef.current = createEmptyMemory();
    } else {
      memoryRef.current = savedMemory;
    }
    setSocialFeeds(save.socialFeeds || {});
    setKktMessages(save.kktMessages || {});
    setKktUnlocked(save.kktUnlocked || {});
    setCurrentOptions(save.currentOptions || []);
    setActiveNotifications([]);
    setTriggeredAchievements(new Set(save.triggeredAchievements || []));
    setPhase("game");
    showNotif("Save loaded");
  };

  const sendMessage = async (text) => {
    if (!text.trim() || loading) return;
    const cleanText = text.replace(/——/g, '--').replace(/[【】「」『』]/g, '').replace(/[""〝〞]/g, '"').replace(/​/g, '').replace(/[\x00-\x1F\x7F]/g, '').trim().substring(0, 300);
    const um = { role: "user", content: cleanText }, nh = [...messages, um];
    setMessages(nh); setInput(""); setLoading(true);
    try {
      const prevSocial = popPendingSocial();
      if (prevSocial?.feeds) {
        setSocialFeeds(p => {
          const updated = { ...p };
          for (const [mid, feed] of Object.entries(prevSocial.feeds)) {
            updated[mid] = { ...(p[mid] || {}), bubble: feed.bubble?.length ? feed.bubble : (p[mid]?.bubble || []), instagram: feed.instagram || p[mid]?.instagram || null, weverse: feed.weverse || p[mid]?.weverse || null, timestamp: feed.timestamp || Date.now(), lastUpdate: Date.now() };
          }
          return updated;
        });
      }
      if (prevSocial?.notifs?.length) setActiveNotifications(prevSocial.notifs);
      preRoundSnapshotRef.current = { stats: { ...statsRef.current }, memory: JSON.parse(JSON.stringify(memoryRef.current)), kktUnlocked: { ...kktUnlocked }, kktMessages: JSON.parse(JSON.stringify(kktMessages)), triggeredAchievements: new Set(triggeredAchievements), playerChoice: cleanText };
      const result = await executeRound({
        playerChoice: text, stats: statsRef.current, memory: memoryRef.current,
        form: { ...form, identity: form.identity === "H" ? (form.customIdentity || "Custom") : (IDENTITIES.find(i => i.id === form.identity)?.label || form.identity) },
        members, mainId: form.mainMember, subIds: form.subMembers || [],
        groupConfig, apiKey, selectedModel, kktUnlocked, language, reasoningEnabled,
        qwenSubModel: selectedModel === "qwen" ? selectedQwenSubModel : null, timeSpeed,
      });
      const prevAff = { ...statsRef.current.multiAff, [form.mainMember]: statsRef.current.affection };
      const newStats = { ...result.newStats, _prevAffections: prevAff };
      statsRef.current = newStats;
      setStats({ ...newStats });
      memoryRef.current = result.updatedMemory;
      setKktMessages(p => ({ ...p, ...Object.fromEntries(Object.entries(result.kktUpdate || {}).map(([k, v]) => [k, [...(p[k] || []), ...(Array.isArray(v) ? v : [])].slice(-20)])) }));
      setKktUnlocked(result.newKktUnlocked);
      setTopMember(result.topMember);
      if (result.specialEvent) setSpecialEvent(result.specialEvent);
      else if (result.relationshipEvent) showNotif(result.relationshipEvent.title + ": " + result.relationshipEvent.description);
      if (result.achievement && !triggeredAchievements.has(result.achievement.id)) {
        setAchievement(result.achievement);
        setTriggeredAchievements(prev => new Set([...prev, result.achievement.id]));
      }
      const statsBox = buildStatsBox(newStats, members, form.mainMember, form.subMembers || [], t);
      setCurrentOptions(result.options);
      setMessages(p => [...p, { role: "assistant", content: statsBox + "\n\n" + result.storyContent }]);
    } catch (e) {
      setMessages(p => [...p, { role: "assistant", content: "Error: " + e.message }]);
    }
    setLoading(false);
  };

  const copyStory = (content) => {
    const sb = content.match(/╔[\s\S]*?╚[═─]+╝/);
    let text = sb ? content.slice(content.indexOf(sb[0]) + sb[0].length) : content;
    text = text.replace(/\n?[ABCD][.、．]\s*.+/g, '').trim();
    navigator.clipboard.writeText(text).then(() => { setCopiedStory(true); setTimeout(() => setCopiedStory(false), 2000); });
  };

  const regenerateRound = async () => {
    const snap = preRoundSnapshotRef.current;
    if (!snap || loading) return;
    statsRef.current = { ...snap.stats };
    setStats({ ...snap.stats });
    memoryRef.current = JSON.parse(JSON.stringify(snap.memory));
    setKktMessages(JSON.parse(JSON.stringify(snap.kktMessages)));
    setKktUnlocked({ ...snap.kktUnlocked });
    setTriggeredAchievements(new Set(snap.triggeredAchievements));
    setAchievement(null); setSpecialEvent(null);
    setMessages(prev => {
      const idx = [...prev].map((m, i) => ({ m, i })).filter(({ m }) => m.role === "assistant" && !m.hidden).at(-1)?.i;
      return idx != null ? prev.filter((_, i) => i !== idx) : prev;
    });
    resetPendingSocial();
    setLoading(true);
    try {
      const result = await executeRound({
        playerChoice: snap.playerChoice, stats: snap.stats, memory: JSON.parse(JSON.stringify(snap.memory)),
        form: { ...form, identity: form.identity === "H" ? (form.customIdentity || "Custom") : (IDENTITIES.find(i => i.id === form.identity)?.label || form.identity) },
        members, mainId: form.mainMember, subIds: form.subMembers || [],
        groupConfig, apiKey, selectedModel, kktUnlocked: snap.kktUnlocked, language, reasoningEnabled,
        qwenSubModel: selectedModel === "qwen" ? selectedQwenSubModel : null, timeSpeed,
      });
      const prevAff = { ...snap.stats.multiAff, [form.mainMember]: snap.stats.affection };
      const newStats = { ...result.newStats, _prevAffections: prevAff };
      statsRef.current = newStats;
      setStats({ ...newStats });
      memoryRef.current = result.updatedMemory;
      const newKkt = { ...snap.kktMessages };
      for (const [k, v] of Object.entries(result.kktUpdate || {})) {
        newKkt[k] = [...(snap.kktMessages[k] || []), ...(Array.isArray(v) ? v : [])].slice(-20);
      }
      setKktMessages(newKkt);
      setKktUnlocked(result.newKktUnlocked);
      setTopMember(result.topMember);
      if (result.specialEvent) setSpecialEvent(result.specialEvent);
      else if (result.relationshipEvent) showNotif(result.relationshipEvent.title + ": " + result.relationshipEvent.description);
      if (result.achievement && !snap.triggeredAchievements.has(result.achievement.id)) {
        setAchievement(result.achievement);
        setTriggeredAchievements(prev => new Set([...prev, result.achievement.id]));
      }
      const statsBox = buildStatsBox(newStats, members, form.mainMember, form.subMembers || [], t);
      setCurrentOptions(result.options);
      setMessages(p => [...p, { role: "assistant", content: statsBox + "\n\n" + result.storyContent }]);
    } catch (e) {
      setMessages(p => [...p, { role: "assistant", content: "Regenerate failed: " + e.message }]);
    }
    setLoading(false);
  };

  const openSocialPlatform = (platform, memberId = null) => setOverlay({ type: platform, memberId: memberId || form.mainMember });
  const getAffection = (mid) => mid === form.mainMember ? (stats?.affection || 0) : (stats?.multiAff?.[mid] || 0);
  const getStage = (aff) => ({ label: getStageName(aff), color: getStageColor(aff) });
  const quickOptions = currentOptions.map((opt, i) => {
    const letter = String.fromCharCode(65 + i);
    const text = opt.replace(/^[ABCD][.、．]\s*/, '');
    return { letter, text };
  });
  const hasNotifDot = (platform) => activeNotifications.some(n => n.platform === platform);
  const displayTopMember = topMember || mainMember;
  const topAff = displayTopMember ? getAffection(displayTopMember.id) : 0;
  const stageIdx = getStageIdx(topAff);
  const stageColor = getStageColor(topAff);
  const stageLabel = t.stageNames[stageIdx];
  const [triggeredAchievements, setTriggeredAchievements] = useState(new Set());

  const NotificationBar = () => notification ? (
    <div style={{ position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)", background: notification.type === "error" ? "rgba(220,50,50,.92)" : "rgba(50,180,100,.92)", color: "#fff", padding: "8px 20px", borderRadius: 20, fontSize: 12, fontWeight: 600, zIndex: 9999, pointerEvents: "none" }}>{notification.msg}</div>
  ) : null;

  // ── Cover Page ──
  if (phase === "cover") {
    const coverTexts = {
      zh: { subtitle: "嫂嫂模拟器", desc: "LLM文游·女团恋爱养成·v1.3.1", newGame: "✨ 开始新游戏", continue: "💾 继续游戏 (读档)", apiKey: "🔑 修改API Key/切换模型" },
      en: { subtitle: "Idol Dating Simulator", desc: "LLM Text Adventure · Idol Dating Sim · v1.3.1", newGame: "✨ New Game", continue: "💾 Continue (Load Save)", apiKey: "🔑 API Key / Model" },
      ko: { subtitle: "아이돌 데이트 시뮬레이터", desc: "LLM 텍스트 어드벤처 · 유리 데이트 시뮬레이터 · v1.3.1", newGame: "✨ 새 게임", continue: "💾 이어하기 (불러오기)", apiKey: "🔑 API 키 / 모델" },
    };
    const ct = coverTexts[language] || coverTexts.zh;
    const titleGrad = theme === "dark"
      ? "linear-gradient(90deg,#f8c8d8,#e887b0,#c86dd0,#e887b0,#f8c8d8)"
      : "linear-gradient(90deg,#c8a84b,#8b6914,#a0522d,#8b6914,#c8a84b)";

    return (
      <div style={{ height: "100vh", display: "flex", justifyContent: "center", alignItems: "center", background: th.pageBg }}>
        <div style={{ width: "100%", maxWidth: 390, height: "100vh", maxHeight: 844, background: th.pageBg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "'Georgia','Noto Serif SC',serif", color: th.textPrimary, padding: 20, borderRadius: 20, boxShadow: "0 0 40px rgba(0,0,0,.3)", overflow: "hidden" }}>
          <NotificationBar />
          <div style={{ fontSize: 44, marginBottom: 14 }}>💗</div>
          <h1 style={{ fontSize: "clamp(24px,6vw,44px)", fontWeight: 700, background: titleGrad, backgroundSize: "200% auto", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", animation: "shimmerCover 4s linear infinite", marginBottom: 4 }}>Idol Dating</h1>
          <h2 style={{ fontSize: "clamp(13px,2.5vw,20px)", letterSpacing: ".3em", color: th.textSecondary, marginBottom: 4 }}>{ct.subtitle}</h2>
          <p style={{ fontSize: 10, color: th.textMuted, letterSpacing: ".1em", marginBottom: 16 }}>{ct.desc}</p>

          {/* Group Selection */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5, justifyContent: "center", marginBottom: 16 }}>
            {groupList.map(g => (
              <button key={g.id} onClick={() => setSelectedGroup(g.id)}
                style={{ display: "flex", alignItems: "center", gap: 3, padding: "4px 9px", borderRadius: 12, border: `1px solid ${selectedGroup === g.id ? (g.color || th.accent) : th.groupBtnBorder}`, background: selectedGroup === g.id ? th.langBtnActiveBg : th.groupBtnBg, color: selectedGroup === g.id ? (theme === "dark" ? "#fff" : "#2c1f0e") : th.groupBtnColor, fontSize: 10, cursor: "pointer", whiteSpace: "nowrap" }}>
                <span style={{ fontSize: 12 }}>{g.emoji}</span>
                <span style={{ fontWeight: selectedGroup === g.id ? 700 : 400 }}>{g.name}</span>
              </button>
            ))}
          </div>

          {/* Language + Theme row */}
          <div style={{ display: "flex", gap: 8, marginBottom: 20, alignItems: "center" }}>
            {[{ code: "zh", label: "中" }, { code: "en", label: "EN" }, { code: "ko", label: "한" }].map(lang => (
              <button key={lang.code} onClick={() => { setLanguage(lang.code); saveToStorage("rv_sim_language", lang.code); }}
                style={{ padding: "6px 14px", borderRadius: 16, border: `1px solid ${language === lang.code ? th.langBtnActiveBorder : th.langBtnBorder}`, background: language === lang.code ? th.langBtnActiveBg : "transparent", color: language === lang.code ? th.langBtnActiveColor : th.langBtnColor, fontSize: 11, cursor: "pointer" }}>
                {lang.label}
              </button>
            ))}
            <button onClick={toggleTheme}
              style={{ padding: "6px 10px", borderRadius: 16, border: `1px solid ${th.themeBtnBorder}`, background: th.themeBtnBg, color: th.themeBtnColor, fontSize: 13, cursor: "pointer" }}
              title={theme === "dark" ? "Switch to Day Mode" : "Switch to Night Mode"}>
              {themeIcon}
            </button>
          </div>

          <button
            onClick={() => {
              if (!selectedGroup) { showNotif(language === "ko" ? "그룹을 선택해주세요" : language === "en" ? "Please select a group" : "请先选择团体", "error"); return; }
              if (apiKey?.trim()) setPhase("setup"); else setPhase("keyInput");
            }}
            style={{ padding: "14px 48px", borderRadius: 40, border: "none", cursor: selectedGroup ? "pointer" : "default", background: selectedGroup ? th.accentGrad : th.newGameDisabled, color: selectedGroup ? "#fff" : th.newGameDisabledColor, fontSize: 15, fontWeight: 700, marginBottom: 10 }}>
            {ct.newGame}
          </button>
          {hasSaves() && (
            <button onClick={() => setOverlay({ type: "save" })}
              style={{ padding: "10px 32px", borderRadius: 40, border: `1px solid ${th.coverContinueBorder}`, background: "transparent", color: th.coverContinueColor, fontSize: 13, cursor: "pointer", marginBottom: 10 }}>
              {ct.continue}
            </button>
          )}
          <button onClick={() => setPhase("keyInput")}
            style={{ background: "none", border: `1px solid ${th.coverApiBorder}`, borderRadius: 16, padding: "6px 16px", color: th.coverApiColor, fontSize: 11, cursor: "pointer" }}>
            {ct.apiKey}
          </button>
          <button onClick={() => setShowHelp(true)}
            style={{ background: "none", border: "none", color: th.coverHelpColor, fontSize: 11, cursor: "pointer", marginTop: 8, textDecoration: "underline" }}>
            {language === "zh" ? "📖 帮助 / 常见问题" : language === "ko" ? "📖 도움말 / 자주 묻는 질문" : "📖 Help / FAQ"}
          </button>
        </div>
        {overlay?.type === "save" && <SaveOverlay theme={theme} t={t} stats={stats} member={displayTopMember} form={form} messages={messages} socialFeeds={socialFeeds} kktMessages={kktMessages} kktUnlocked={kktUnlocked} memory={memoryRef.current} triggeredAchievements={triggeredAchievements} onLoad={loadSave} onClose={() => setOverlay(null)} />}
        {showHelp && <HelpOverlay language={language} theme={theme} onClose={() => setShowHelp(false)} />}
      </div>
    );
  }

  // ── Key Input Page ──
  if (phase === "keyInput") {
    const currentPlatformName = MODEL_CONFIGS[selectedModel]?.keyHelp?.includes("deepseek") ? "platform.deepseek.com"
      : MODEL_CONFIGS[selectedModel]?.keyHelp?.includes("qianwenai") ? "platform.qianwenai.com"
      : MODEL_CONFIGS[selectedModel]?.keyHelp?.includes("openai") ? "platform.openai.com"
      : MODEL_CONFIGS[selectedModel]?.keyHelp?.includes("google") ? "aistudio.google.com"
      : null;
    const platformUrl = currentPlatformName ? `https://${currentPlatformName}` : null;

    const renderGuideStep = (step, i) => {
      if (i === 1 && MODEL_CONFIGS[selectedModel]?.hasFreeCredits && t.guide?.freeStep2) step = t.guide.freeStep2;
      step = step.replace('{prefix}', MODEL_CONFIGS[selectedModel]?.keyPrefix || 'sk-');
      if (step.includes('{platform}') && platformUrl) {
        const [before, after] = step.split('{platform}');
        return (
          <p key={i} style={{ fontSize: 11, color: th.guideText, marginBottom: 2, lineHeight: 2 }}>
            {before}<a href={platformUrl} target="_blank" rel="noopener noreferrer" style={{ color: th.accent, textDecoration: "underline" }}>{currentPlatformName}</a>{after}
          </p>
        );
      }
      return <p key={i} style={{ fontSize: 11, color: th.guideText, marginBottom: 2, lineHeight: 2 }}>{step}</p>;
    };

    return (
      <>
      <div style={{ height: "100vh", display: "flex", justifyContent: "center", alignItems: "center", background: th.pageBgAlt }}>
        <div style={{ width: "100%", maxWidth: 390, height: "100vh", maxHeight: 844, background: th.pageBgAlt, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start", fontFamily: "'Georgia','Noto Serif SC',serif", color: th.textPrimary, padding: "20px 20px 30px", borderRadius: 20, boxShadow: "0 0 40px rgba(0,0,0,.3)", overflowY: "auto" }}>
          <NotificationBar />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", width: "100%", marginBottom: 2 }}>
            <div style={{ flex: 1 }} />
            <div style={{ fontSize: 36, marginBottom: 6 }}>🔑</div>
            <div style={{ flex: 1, display: "flex", justifyContent: "flex-end", paddingTop: 6, gap: 6 }}>
              <button onClick={toggleTheme}
                style={{ background: th.themeBtnBg, border: `1px solid ${th.themeBtnBorder}`, borderRadius: 8, color: th.themeBtnColor, fontSize: 13, cursor: "pointer", padding: "3px 8px" }}>
                {themeIcon}
              </button>
              <button onClick={() => setShowHelp(true)}
                style={{ background: th.helpBtnBg, border: `1px solid ${th.helpBtnBorder}`, borderRadius: 8, color: th.helpBtnColor, fontSize: 11, cursor: "pointer", padding: "3px 9px" }}>
                📖 {language === "zh" ? "帮助" : language === "ko" ? "도움말" : "Help"}
              </button>
            </div>
          </div>
          <h2 style={{ fontSize: 18, color: th.textHeading, marginBottom: 4 }}>{t.keyInput.title}</h2>
          <p style={{ fontSize: 11, color: th.textMuted, marginBottom: 4, textAlign: "center" }}>{t.keyInput.desc}</p>
          <p style={{ fontSize: 9, color: th.textFaint, marginBottom: 12, textAlign: "center" }}>💡 {MODEL_CONFIGS[selectedModel]?.keyHelp}</p>

          {/* Model Selector */}
          <div style={{ width: "100%", marginBottom: 12 }}>
            <p style={{ fontSize: 11, color: th.textMuted, marginBottom: 6, textAlign: "center" }}>{t.keyInput.selectModel}</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5 }}>
              {Object.values(MODEL_CONFIGS).map(c => (
                <div key={c.id} onClick={() => handleModelSelect(c.id)}
                  style={{ padding: "7px 9px", borderRadius: 10, border: `1px solid ${selectedModel === c.id ? c.color : th.border}`, background: selectedModel === c.id ? th.langBtnActiveBg : th.modelCardBg, cursor: "pointer", userSelect: "none" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: selectedModel === c.id ? c.color : th.modelCardColor }}>{c.emoji} {c.name}</div>
                  <div style={{ fontSize: 8, color: th.guideText, marginTop: 1 }}>{c.desc?.[language]}</div>
                </div>
              ))}
            </div>
            {selectedModel === "qwen" && (
              <div style={{ marginTop: 8 }}>
                <p style={{ fontSize: 10, color: th.textMuted, marginBottom: 4, textAlign: "center" }}>
                  {language === "zh" ? "选择 Qwen 版本" : language === "ko" ? "Qwen 버전 선택" : "Select Qwen version"}
                </p>
                <div style={{ display: "flex", gap: 5 }}>
                  {(MODEL_CONFIGS.qwen.subModels || []).map(sub => (
                    <div key={sub.id} onClick={() => handleQwenSubModelSelect(sub.id)}
                      style={{ flex: 1, padding: "6px 8px", borderRadius: 8, textAlign: "center", border: `1px solid ${selectedQwenSubModel === sub.id ? MODEL_CONFIGS.qwen.color : th.border}`, background: selectedQwenSubModel === sub.id ? th.langBtnActiveBg : th.subModelCardBg, cursor: "pointer", userSelect: "none" }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: selectedQwenSubModel === sub.id ? MODEL_CONFIGS.qwen.color : th.subModelCardColor }}>{sub.name}</div>
                      <div style={{ fontSize: 8, color: th.textMuted, marginTop: 1 }}>{sub.desc?.[language]}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* API Key Guide */}
          <div style={{ width: "100%", marginBottom: 10, padding: "10px 12px", background: th.guideBg, borderRadius: 12, border: `1px solid ${th.borderDim}` }}>
            <p style={{ fontSize: 11, color: th.guideText, fontWeight: 700, marginBottom: 4 }}>{t.guide?.title}</p>
            {(t.guide?.steps || []).map((step, i) => renderGuideStep(step, i))}
            <p style={{ fontSize: 12, color: th.guideBilling, marginTop: 6, fontWeight: 600 }}>{(t.guide?.billing || "").replace("{gameplay}", (() => {
              if (selectedModel === "qwen") {
                const sub = (MODEL_CONFIGS.qwen.subModels || []).find(s => s.id === selectedQwenSubModel);
                return sub?.gameplay?.[language] || MODEL_CONFIGS.qwen.gameplay?.[language] || "";
              }
              return MODEL_CONFIGS[selectedModel]?.gameplay?.[language] || "";
            })())}</p>
            {selectedModel === "qwen" && t.guide?.qwenSwitchHint && (
              <p style={{ fontSize: 10, color: th.guideHint, marginTop: 4, fontWeight: 500 }}>{t.guide.qwenSwitchHint}</p>
            )}
            <p style={{ fontSize: 9, color: th.guideWarning, marginTop: 3, fontWeight: 450 }}>{t.guide?.warning}</p>
            <p style={{ fontSize: 9, color: th.guideMuted, marginTop: 2, fontWeight: 450 }}>{t.guide?.keyManagement}</p>
            <p style={{ fontSize: 9, color: th.guideMuted, marginTop: 2, fontWeight: 450 }}>{t.guide?.moreModels}</p>
            <p style={{ fontSize: 9, color: th.guideMuted, marginTop: 2, fontWeight: 450 }}>{t.guide?.noProfit}</p>
          </div>

          {/* Key Input */}
          <input type="password" placeholder={(MODEL_CONFIGS[selectedModel]?.keyPrefix || "sk-") + "..."} value={apiKey} onChange={e => setApiKey(e.target.value)} autoFocus
            style={{ width: "100%", padding: "11px 14px", borderRadius: 12, background: th.inputBg, border: `1px solid ${MODEL_CONFIGS[selectedModel]?.color || th.accent}`, color: th.textPrimary, fontSize: 13, outline: "none", boxSizing: "border-box", fontFamily: "'Courier New',monospace", marginBottom: 14 }} />

          {!keyJustSaved ? (
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => { if (apiKey?.trim()) { saveApiKey(apiKey); setKeyJustSaved(true); } else showNotif(t.common?.enterKey || "Please enter API Key", "error"); }} disabled={!apiKey?.trim()}
                style={{ padding: "10px 28px", borderRadius: 40, border: "none", cursor: apiKey?.trim() ? "pointer" : "not-allowed", background: apiKey?.trim() ? th.accentGrad : th.newGameDisabled, color: "#fff", fontSize: 14, fontWeight: 600 }}>
                {t.keyInput.confirm}
              </button>
              <button onClick={() => { setKeyJustSaved(false); setPhase("cover"); }}
                style={{ padding: "10px 20px", borderRadius: 40, border: `1px solid ${th.coverContinueBorder}`, background: "transparent", color: th.coverContinueColor, fontSize: 13, cursor: "pointer" }}>
                {t.keyInput.back}
              </button>
            </div>
          ) : (
            <div style={{ width: "100%", background: th.keySuccessBg, border: `1px solid ${th.keySuccessBorder}`, borderRadius: 14, padding: "14px 16px", textAlign: "center" }}>
              <div style={{ fontSize: 13, color: th.keySuccessText, fontWeight: 600, marginBottom: 10 }}>
                {language === "zh" ? "✅ Key 已保存！选择下一步" : language === "ko" ? "✅ Key 저장 완료! 다음을 선택하세요" : "✅ Key saved! What's next?"}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => { setKeyJustSaved(false); if (!selectedGroup) setPhase("cover"); else setPhase("setup"); }}
                  style={{ flex: 1, padding: "10px 0", borderRadius: 12, border: "none", background: th.accentGrad, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                  {language === "zh" ? "✨ 开始新游戏" : language === "ko" ? "✨ 새 게임" : "✨ New Game"}
                </button>
                <button onClick={() => { setKeyJustSaved(false); setPhase("cover"); setOverlay({ type: "save" }); }}
                  style={{ flex: 1, padding: "10px 0", borderRadius: 12, border: `1px solid ${th.coverContinueBorder}`, background: th.cardBg, color: th.coverContinueColor, fontSize: 13, cursor: "pointer" }}>
                  {language === "zh" ? "💾 读取存档" : language === "ko" ? "💾 불러오기" : "💾 Load Save"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      {showHelp && <HelpOverlay language={language} theme={theme} onClose={() => setShowHelp(false)} />}
      </>
    );
  }

  // ── Setup Page ──
  if (phase === "setup") {
    const canStart = form.mainMember && form.name && form.age && form.identity && form.pace;
    return (
      <div style={{ height: "100vh", display: "flex", justifyContent: "center", alignItems: "center", background: th.pageBgAlt }}>
        <div style={{ width: "100%", maxWidth: 390, height: "100vh", maxHeight: 844, background: th.pageBgAlt, fontFamily: "'Georgia','Noto Serif SC',serif", color: th.textPrimary, padding: "12px 10px 40px", overflowY: "auto", borderRadius: 20, boxShadow: "0 0 40px rgba(0,0,0,.3)" }}>
          <NotificationBar />
          <style>{th.setupCss}</style>
          <div style={{ textAlign: "center", padding: "10px 0 2px" }}>
            <h2 style={{ fontSize: 18, color: th.textHeading, marginBottom: 2 }}>{language === "zh" ? "创建角色" : language === "ko" ? "캐릭터 생성" : "Character Creation"}</h2>
            <p style={{ fontSize: 10, color: th.textMuted }}>{language === "zh" ? "已加载组合: " : language === "ko" ? "그룹 로드됨: " : "Group loaded: "}{groupConfig?.group?.name || "Loading..."}</p>
            <div style={{ marginTop: 6, fontSize: 10, color: apiKey ? "#6d9b6d" : "#d07070", display: "flex", alignItems: "center", justifyContent: "center", gap: 4, flexWrap: "wrap" }}>
              <span>{apiKey ? language === "zh" ? "密钥已配置" : language === "ko" ? "키 설정됨" : "Key configured" : language === "zh" ? "密钥缺失" : language === "ko" ? "키 누락" : "Key missing"}</span>
              <span style={{ color: th.textMuted }}>{MODEL_CONFIGS[selectedModel]?.emoji} {MODEL_CONFIGS[selectedModel]?.name}</span>
              <button onClick={() => setPhase("keyInput")} style={{ background: "none", border: `1px solid ${th.border}`, borderRadius: 6, padding: "2px 6px", color: th.textSecondary, fontSize: 9, cursor: "pointer" }}>{language === "zh" ? "切换模型" : language === "ko" ? "모델 전환" : "Change Model"}</button>
            </div>
          </div>

          <div className="s-l">{t.setup.mainMember(MAIN_INITIAL_AFFECTION)}</div>
          {members.length === 0 ? (
            <div style={{ textAlign: "center", color: th.textMuted, padding: 20, fontSize: 12 }}>{t.setup.loading}</div>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 6 }}>
              {members.map(m => (
                <button key={m.id} onClick={() => setForm(f => ({ ...f, mainMember: m.id, subMembers: (f.subMembers || []).filter(id => id !== m.id) }))}
                  style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 10px", borderRadius: 14, border: `1px solid ${form.mainMember === m.id ? m.accent : th.groupBtnBorder}`, background: form.mainMember === m.id ? m.accent + "18" : th.memberBtnBg, color: form.mainMember === m.id ? (theme === "dark" ? "#fff" : "#2c1f0e") : th.memberBtnColor, fontSize: 12, cursor: "pointer", whiteSpace: "nowrap" }}>
                  <span style={{ fontSize: 16 }}>{m.emoji}</span>
                  <span style={{ fontWeight: form.mainMember === m.id ? 700 : 400 }}>{m.name_kr}</span>
                </button>
              ))}
            </div>
          )}

          <div className="s-l">{t.setup.subMember(SUB_INITIAL_AFFECTION_MIN, SUB_INITIAL_AFFECTION_MAX, members.length - 1)}</div>
          {members.length === 0 ? (
            <div style={{ textAlign: "center", color: th.textMuted, padding: 10, fontSize: 11 }}>Loading...</div>
          ) : (
            <>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 6 }}>
                {members.filter(m => m.id !== form.mainMember).map(m => {
                  const sel = (form.subMembers || []).includes(m.id);
                  return (
                    <button key={m.id} onClick={() => setForm(f => ({ ...f, subMembers: sel ? f.subMembers.filter(x => x !== m.id) : [...(f.subMembers || []), m.id].slice(0, members.length - 1) }))}
                      style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 10px", borderRadius: 14, border: `1px solid ${sel ? (m.accent || th.accent) : th.groupBtnBorder}`, background: sel ? (m.accent || th.accent) + "18" : th.memberBtnBg, color: sel ? (theme === "dark" ? "#fff" : "#2c1f0e") : th.memberBtnColor, fontSize: 12, cursor: "pointer", whiteSpace: "nowrap" }}>
                      <span style={{ fontSize: 16 }}>{m.emoji}</span>
                      <span style={{ fontWeight: sel ? 700 : 400 }}>{m.name_kr}</span>
                    </button>
                  );
                })}
              </div>
              {members.filter(m => m.id !== form.mainMember && !(form.subMembers || []).includes(m.id)).length > 0 && (
                <p style={{ fontSize: 9, color: th.textFaint, marginBottom: 4 }}>NPC: {members.filter(m => m.id !== form.mainMember && !(form.subMembers || []).includes(m.id)).map(m => m.emoji + m.name_kr).join(", ")}</p>
              )}
            </>
          )}

          <div className="s-l">{t.setup.identity}</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5, marginBottom: 4 }}>
            {IDENTITIES.map(id => (
              <div key={id.id} onClick={() => setForm(f => ({ ...f, identity: id.id }))}
                style={{ padding: "7px 10px", borderRadius: 10, textAlign: "center", border: `1px solid ${form.identity === id.id ? th.notifBarBorder : th.groupBtnBorder}`, background: form.identity === id.id ? th.langBtnActiveBg : th.memberBtnBg, color: form.identity === id.id ? (theme === "dark" ? "#fff" : "#2c1f0e") : th.memberBtnColor, fontSize: 11, cursor: "pointer" }}>
                {t.identities[id.id] || id.label}
              </div>
            ))}
          </div>
          {form.identity === "H" && (
            <input className="s-in" placeholder={t.setup.customIdentity} value={form.customIdentity} onChange={e => setForm(f => ({ ...f, customIdentity: e.target.value }))} style={{ marginTop: 4, marginBottom: 6 }} />
          )}

          <div className="s-l">{language === "zh" ? "角色信息" : language === "ko" ? "캐릭터 정보" : "Character Info"}</div>
          <div style={{ display: "flex", gap: 5, marginBottom: 5 }}>
            <input className="s-in" placeholder={language === "zh" ? "名字" : language === "ko" ? "이름" : "Name"} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={{ flex: 2 }} />
            <input className="s-in" placeholder={language === "zh" ? "年龄" : language === "ko" ? "나이" : "Age"} value={form.age} onChange={e => setForm(f => ({ ...f, age: e.target.value }))} style={{ flex: 1 }} type="number" min="18" />
          </div>

          <div className="s-l">{t.setup.pace}</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5, marginBottom: 4 }}>
            {t.paces.map((p, i) => (
              <div key={PACES[i]} onClick={() => setForm(f => ({ ...f, pace: PACES[i] }))}
                style={{ padding: "7px 10px", borderRadius: 10, textAlign: "center", border: `1px solid ${form.pace === PACES[i] ? th.accent : th.groupBtnBorder}`, background: form.pace === PACES[i] ? th.langBtnActiveBg : th.memberBtnBg, color: form.pace === PACES[i] ? (theme === "dark" ? "#fff" : "#2c1f0e") : th.memberBtnColor, fontSize: 11, cursor: "pointer" }}>
                {p}
              </div>
            ))}
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 22 }}>
            <button onClick={() => setPhase("cover")}
              style={{ padding: "13px 20px", borderRadius: 40, border: `1px solid ${th.groupBtnBorder}`, background: "transparent", color: th.textMuted, fontSize: 13, cursor: "pointer" }}>
              ← {language === "zh" ? "返回" : language === "ko" ? "뒤로" : "Back"}
            </button>
            <button onClick={startNewGame} disabled={!canStart}
              style={{ flex: 1, padding: "13px", borderRadius: 40, border: "none", cursor: canStart ? "pointer" : "not-allowed", background: canStart ? th.accentGrad : th.newGameDisabled, color: "#fff", fontSize: 14, fontWeight: 700 }}>
              {canStart ? `Start with ${mainMember?.name || "..."}` : (language === "zh" ? "请完成所有选项" : language === "ko" ? "모든 옵션을 선택해주세요" : "Please complete all options")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Game Main Screen ──
  if (!groupConfig || !members.length) return <div style={{ height: "100vh", display: "flex", justifyContent: "center", alignItems: "center", background: th.outerBg, color: th.textPrimary }}>Loading...</div>;

  return (
    <div style={{ height: "100vh", display: "flex", justifyContent: "center", alignItems: "center", background: th.outerBg }}>
      <div style={{ width: "100%", maxWidth: 390, height: "100vh", maxHeight: 844, display: "flex", flexDirection: "column", background: th.gameBg, fontFamily: "'Georgia','Noto Serif SC',serif", color: th.textPrimary, position: "relative", overflow: "hidden", borderRadius: 20, boxShadow: "0 0 40px rgba(0,0,0,.4)" }}>
        <NotificationBar />
        <style>{`@media print{body *{visibility:hidden}#rv-story-panel,#rv-story-panel *{visibility:visible}#rv-story-panel{position:fixed;top:0;left:0;right:0;bottom:0;height:auto!important;overflow:visible!important;padding:24px!important;background:#fff!important}}`}</style>
        <style>{`${th.scrollCss}@keyframes blink{0%,100%{opacity:1}50%{opacity:.25}}@keyframes slideUp{from{transform:translateY(6px);opacity:0}to{transform:translateY(0);opacity:1}}.stat-item{cursor:help;transition:all .15s;position:relative}.stat-item:hover{transform:scale(1.05)}.stat-tooltip{position:absolute;bottom:calc(100% + 6px);left:50%;transform:translateX(-50%);background:${th.panelBg};border:1px solid ${th.borderAccent};border-radius:6px;padding:3px 8px;fontSize:9px;color:${th.textHeading};white-space:nowrap;pointer-events:none;z-index:999}.notification-dot{position:absolute;top:-2px;right:-2px;width:7px;height:7px;border-radius:50%;background:#ff3b5c;animation:blink 1s infinite}`}</style>

        {/* Top Bar */}
        <div style={{ background: th.topBarBg, backdropFilter: "blur(12px)", borderBottom: `1px solid ${th.border}`, padding: "5px 8px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0, zIndex: 10, gap: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
            <div style={{ width: 28, height: 28, borderRadius: "50%", background: `linear-gradient(135deg,${displayTopMember?.color || "#f0c8d8"},${displayTopMember?.accent || "#c2185b"})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 }}>{displayTopMember?.emoji || "💗"}</div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: th.topBarText, whiteSpace: "nowrap" }}>{displayTopMember?.name || "RV"}</div>
              <span style={{ fontSize: 8, padding: "1px 5px", borderRadius: 4, background: stageColor + "18", color: stageColor, border: `1px solid ${stageColor}33` }}>{stageLabel}</span>
            </div>
          </div>
          <div style={{ display: "flex", gap: 4, alignItems: "center", fontSize: 10, flexWrap: "wrap", justifyContent: "center", overflow: "visible" }}>
            {stats && [
              { key: "selfId", icon: "🌈", label: "Self Identity", value: stats.selfId },
              { key: "secrecy", icon: "🔒", label: "Secrecy", value: stats.secrecy },
              { key: "mood", icon: "💫", label: "Mood", value: stats.mood },
              { key: "week", icon: "📅", label: "Round", value: stats.week },
            ].map(item => (
              <div key={item.key} className="stat-item" style={{ display: "flex", alignItems: "center", gap: 1, color: th.topBarStatText, position: "relative" }} onMouseEnter={() => setHoveredStat(item.key)} onMouseLeave={() => setHoveredStat(null)}>
                <span style={{ fontSize: 10 }}>{item.icon}</span><span style={{ fontSize: 8 }}>{item.value}</span>
                {hoveredStat === item.key && <div className="stat-tooltip">{item.label}: {item.value}</div>}
              </div>
            ))}
            {allTargetMembers.map(m => {
              const aff = getAffection(m.id);
              return (
                <div key={m.id} className="stat-item" style={{ display: "flex", alignItems: "center", gap: 1, color: th.topBarStatText, position: "relative" }} onMouseEnter={() => setHoveredStat("aff_" + m.id)} onMouseLeave={() => setHoveredStat(null)}>
                  <span style={{ fontSize: 10 }}>{m.emoji}</span><span style={{ fontSize: 8 }}>{aff}</span>
                  {hoveredStat === "aff_" + m.id && <div className="stat-tooltip">{m.name_kr} Affection: {aff} ({getStageName(aff)})</div>}
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
            {[{ icon: "💜", type: "bubble" }, { icon: "📸", type: "instagram" }, { icon: "🌿", type: "weverse" }, { icon: "💬", type: "kakao", locked: !kktUnlocked[form.mainMember] }].map(b => {
              const showDot = hasNotifDot(b.type) && !b.locked;
              return (
                <button key={b.type} onClick={() => openSocialPlatform(b.type)}
                  style={{ position: "relative", background: th.topBarIconBg, border: `1px solid ${b.locked ? th.topBarIconBorder : th.topBarIconBorder}`, borderRadius: 5, padding: "3px 5px", color: b.locked ? th.topBarStatText : th.topBarText, fontSize: 11, cursor: b.locked ? "not-allowed" : "pointer", opacity: b.locked ? .5 : 1 }}>
                  {b.icon}{showDot && <div className="notification-dot" />}
                </button>
              );
            })}
            <button onClick={() => setOverlay({ type: "save" })} style={{ background: th.topBarIconBg, border: `1px solid ${th.topBarIconBorder}`, borderRadius: 5, padding: "3px 5px", color: th.topBarText, fontSize: 11, cursor: "pointer" }}>💾</button>
            <button onClick={() => setShowSettings(true)} style={{ background: th.topBarIconBg, border: `1px solid ${th.topBarIconBorder}`, borderRadius: 5, padding: "3px 5px", color: th.topBarText, fontSize: 11, cursor: "pointer" }}>⚙️</button>
          </div>
        </div>

        {/* Active Notification Strip */}
        {activeNotifications.length > 0 && (
          <div style={{ padding: "3px 8px", background: th.notifBarBg, borderBottom: `1px solid ${th.notifBarBorder}`, display: "flex", gap: 6, overflowX: "auto", flexShrink: 0, fontSize: 9, color: th.notifBarText }}>
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
        <div id="rv-story-panel" style={{ flex: 1, overflowY: "auto", padding: "10px 10px" }}>
          {messages.length === 0 && (
            <div style={{ textAlign: "center", padding: "50px 16px", color: th.textFaint }}>
              <div style={{ fontSize: 32, marginBottom: 10, animation: "blink 2s infinite" }}>💗</div>
              <div style={{ fontSize: 12 }}>Generating opening story...</div>
            </div>
          )}
          {(() => {
            const lastAsstIdx = messages.reduce((acc, m, i) => !m.hidden && m.role === "assistant" ? i : acc, -1);
            const actionBar = (content) => (
              <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", marginTop: 6 }}>
                <button onClick={() => copyStory(content)} title="Copy story"
                  style={{ background: th.actionBtnBg, border: `1px solid ${th.actionBtnBorder}`, borderRadius: 8, width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", color: copiedStory ? th.copiedColor : th.actionColor, fontSize: 16, fontWeight: 700, cursor: "pointer", lineHeight: 1 }}>
                  {copiedStory ? "✓" : "⎘"}
                </button>
                {preRoundSnapshotRef.current && (
                  <button onClick={regenerateRound} title="Retry this round"
                    style={{ background: th.actionBtnBg, border: `1px solid ${th.actionBtnBorder}`, borderRadius: 8, width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", color: th.actionColor, fontSize: 18, fontWeight: 700, cursor: "pointer", lineHeight: 1 }}>
                    ↺
                  </button>
                )}
              </div>
            );
            return messages.map((msg, i) => {
              if (msg.hidden) return null;
              if (msg.role === "user") return (
                <div key={i} style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
                  <div style={{ background: th.accentGrad, color: "#fff", padding: "8px 14px", borderRadius: "14px 14px 3px 14px", maxWidth: "80%", fontSize: 12, lineHeight: 1.6, wordBreak: "break-word" }}>{msg.content}</div>
                </div>
              );
              const isLast = i === lastAsstIdx && !loading;
              const sb = msg.content.match(/╔[\s\S]*?╚[═─]+╝/);
              if (sb) {
                let af = msg.content.slice(msg.content.indexOf(sb[0]) + sb[0].length);
                af = af.replace(/\n?[ABCD][.、．]\s*.+/g, '').trim();
                return (
                  <div key={i} style={{ marginBottom: 14 }}>
                    <div style={{ background: th.statsBg, border: `1px solid ${th.borderAccent}`, borderRadius: 10, padding: "10px 12px", marginBottom: 8, fontFamily: "'Courier New',monospace", fontSize: 10, color: th.textStats, lineHeight: 1.8, whiteSpace: "pre-wrap" }}>{sb[0]}</div>
                    {af && <div style={{ background: th.storyBg, border: `1px solid ${th.border}`, borderRadius: "14px 14px 14px 14px", padding: "12px 14px", fontSize: Math.round(13 * fontScale), lineHeight: 1.8, whiteSpace: "pre-wrap", color: th.textStory }}>{af}</div>}
                    {isLast && actionBar(msg.content)}
                  </div>
                );
              }
              return (
                <div key={i} style={{ marginBottom: 14 }}>
                  <div style={{ background: th.storyBg, border: `1px solid ${th.border}`, borderRadius: "3px 14px 14px 14px", padding: "12px 14px", fontSize: Math.round(13 * fontScale), lineHeight: 1.8, whiteSpace: "pre-wrap", color: th.textStory }}>{msg.content}</div>
                  {isLast && actionBar(msg.content)}
                </div>
              );
            });
          })()}
          {loading && (
            <div style={{ display: "flex", gap: 4, padding: 8, alignItems: "center" }}>
              {[0, 1, 2].map(i => <div key={i} style={{ width: 4, height: 4, borderRadius: "50%", background: th.accent, animation: `blink 1.2s ${i * .2}s infinite` }} />)}
              <span style={{ fontSize: 10, color: th.textMuted, marginLeft: 2 }}>Story progressing...</span>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Options */}
        {quickOptions.length > 0 && !loading && (
          <div style={{ padding: "5px 8px", display: "flex", flexWrap: "wrap", gap: 4, borderTop: `1px solid ${th.borderSubtle}`, background: th.optionsBg, flexShrink: 0 }}>
            {quickOptions.map(opt => (
              <button key={opt.letter}
                onClick={() => {
                  if (opt.text && (opt.text.includes("Return to Cover Page") || opt.text.includes("返回封面页") || opt.text.includes("돌아가기"))) {
                    setPhase("cover");
                  } else {
                    sendMessage(opt.letter + ". " + opt.text);
                  }
                }}
                style={{ padding: "5px 10px", borderRadius: 12, border: `1px solid ${th.borderAccent}`, background: th.optionsBtnBg, color: th.textStory, fontSize: Math.round(11 * fontScale), cursor: "pointer", animation: "slideUp .25s ease", textAlign: "left" }}>
                <span style={{ color: th.accent, fontWeight: 700 }}>{opt.letter}.</span> {opt.text}
              </button>
            ))}
          </div>
        )}

        {/* Input */}
        <div style={{ padding: "6px 8px", background: th.inputAreaBg, borderTop: `1px solid ${th.borderFaint}`, display: "flex", gap: 5, alignItems: "flex-end", flexShrink: 0 }}>
          <textarea ref={inputRef} value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); } }}
            placeholder={language === "zh" ? "输入你的选择..." : language === "ko" ? "선택 사항 입력..." : "Type your choice..."}
            disabled={loading} rows={1} maxLength={300}
            style={{ flex: 1, padding: "8px 12px", borderRadius: 12, background: th.inputBg, border: `1px solid ${th.borderDim}`, color: th.textPrimary, fontSize: 12, outline: "none", resize: "none", fontFamily: "inherit", lineHeight: 1.4, maxHeight: 70, overflowY: "auto" }} />
          <button onClick={() => sendMessage(input)} disabled={!input.trim() || loading}
            style={{ width: 34, height: 34, borderRadius: "50%", border: th.border, background: input.trim() && !loading ? th.accentGrad : th.newGameDisabled, color: "#fff", fontSize: 14, cursor: input.trim() && !loading ? "pointer" : "not-allowed", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>↑</button>
        </div>

        {/* Overlays */}
        {overlay?.type === "save" && <SaveOverlay theme={theme} t={t} stats={stats} member={displayTopMember} form={form} messages={messages} currentOptions={currentOptions} socialFeeds={socialFeeds} kktMessages={kktMessages} kktUnlocked={kktUnlocked} memory={memoryRef.current} triggeredAchievements={triggeredAchievements} onLoad={loadSave} onClose={() => setOverlay(null)} />}
        {showHelp && <HelpOverlay language={language} theme={theme} onClose={() => setShowHelp(false)} />}

        {/* Settings Overlay */}
        {showSettings && (
          <div style={{ position: "absolute", inset: 0, zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", background: th.modalOverlay, backdropFilter: "blur(6px)" }}
            onClick={e => { if (e.target === e.currentTarget) { setShowSettings(false); setConfirmDest(null); } }}>
            <div style={{ width: "88%", maxWidth: 320, maxHeight: "88vh", overflowY: "auto", background: th.panelBg, border: `1px solid ${th.borderAccent}`, borderRadius: 18, padding: "24px 20px", boxShadow: "0 20px 60px rgba(0,0,0,.4)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: th.textHeading }}>{t.settings?.title}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <button onClick={toggleTheme}
                    style={{ background: th.themeBtnBg, border: `1px solid ${th.themeBtnBorder}`, borderRadius: 8, color: th.themeBtnColor, fontSize: 14, cursor: "pointer", width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center" }}
                    title={theme === "dark" ? "Switch to Day Mode" : "Switch to Night Mode"}>
                    {themeIcon}
                  </button>
                  <button onClick={() => { const v = fontScale === 1 ? 1.25 : 1; setFontScale(v); saveToStorage("rv_sim_fontscale", v); }}
                    style={{ background: th.themeBtnBg, border: `1px solid ${th.themeBtnBorder}`, borderRadius: 8, color: th.themeBtnColor, fontSize: fontScale === 1 ? 13 : 11, fontWeight: 700, cursor: "pointer", width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center" }}
                    title={fontScale === 1 ? "Switch to Large Text" : "Switch to Standard Text"}>
                    {fontScale === 1 ? "A+" : "A"}
                  </button>
                  <button onClick={() => { setShowSettings(false); setShowHelp(true); }}
                    style={{ background: th.helpBtnBg, border: `1px solid ${th.helpBtnBorder}`, borderRadius: 8, color: th.helpBtnColor, fontSize: 11, cursor: "pointer", height: 28, padding: "0 9px", display: "flex", alignItems: "center" }}>
                    📖 {language === "zh" ? "帮助" : language === "ko" ? "도움말" : "Help"}
                  </button>
                  <button onClick={() => { setShowSettings(false); setConfirmDest(null); }}
                    style={{ background: "none", border: "none", color: th.textMuted, fontSize: 18, cursor: "pointer", lineHeight: 1 }}>✕</button>
                </div>
              </div>

              {/* Reasoning toggle */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <div style={{ fontSize: 13, color: th.textPrimary, fontWeight: 600 }}>{t.settings?.reasoningTitle}</div>
                  <div onClick={() => { const v = !reasoningEnabled; setReasoningEnabled(v); saveToStorage(STORAGE_KEYS.REASONING, v); }}
                    style={{ width: 42, height: 24, borderRadius: 12, background: reasoningEnabled ? th.reasoningOnBg : th.reasoningOffBg, border: `1px solid ${reasoningEnabled ? th.reasoningOnBorder : th.reasoningOffBorder}`, cursor: "pointer", position: "relative", transition: "all .2s" }}>
                    <div style={{ position: "absolute", top: 3, left: reasoningEnabled ? 20 : 3, width: 16, height: 16, borderRadius: "50%", background: reasoningEnabled ? "#fff" : th.reasoningKnob, transition: "left .2s" }} />
                  </div>
                </div>
                <div style={{ fontSize: 10, color: th.textMuted, lineHeight: 1.5 }}>
                  {reasoningEnabled ? t.settings?.reasoningOn : t.settings?.reasoningOff}
                </div>
              </div>

              {/* Time Speed */}
              {(() => {
                const speeds = ['slow', 'default', 'fast'];
                const speedIdx = speeds.indexOf(timeSpeed);
                const knobLeft = speedIdx === 0 ? 3 : speedIdx === 1 ? 24 : 45;
                const cycleSpeed = () => { const next = speeds[(speedIdx + 1) % 3]; setTimeSpeed(next); saveToStorage('rv_sim_timespeed', next); };
                const speedDesc = timeSpeed === 'slow'
                  ? (language === 'zh' ? '🐌 慢 — 留在这一刻' : language === 'ko' ? '🐌 느림 — 현재 순간에 머무름' : '🐌 Slow — Stay in this moment')
                  : timeSpeed === 'fast'
                  ? (language === 'zh' ? '⚡ 快 — 快进到下一次约会' : language === 'ko' ? '⚡ 빠름 — 다음 주요 이벤트로 이동' : '⚡ Fast — Skip to the next dating')
                  : (language === 'zh' ? '🕛 正常 — 默认叙事节奏' : language === 'ko' ? '🕛 보통 — 기본 서사 속도' : '🕛 Normal — Default narrative pacing');
                return (
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <div style={{ fontSize: 13, color: th.textPrimary, fontWeight: 600 }}>
                        {language === 'zh' ? '⏳ 时间流速' : language === 'ko' ? '⏳ 시간 속도' : '⏳ Time Speed'}
                      </div>
                      <div onClick={cycleSpeed}
                        style={{ width: 64, height: 24, borderRadius: 12, background: timeSpeed === 'fast' ? th.reasoningOnBg : th.reasoningOffBg, border: `1px solid ${timeSpeed === 'fast' ? th.reasoningOnBorder : th.reasoningOffBorder}`, cursor: 'pointer', position: 'relative', transition: 'all .2s', flexShrink: 0 }}>
                        <div style={{ position: 'absolute', top: 3, left: knobLeft, width: 16, height: 16, borderRadius: '50%', background: timeSpeed === 'fast' ? '#fff' : th.reasoningKnob, transition: 'left .2s' }} />
                      </div>
                    </div>
                    <div style={{ fontSize: 10, color: th.textMuted, lineHeight: 1.5 }}>{speedDesc}</div>
                  </div>
                );
              })()}

              <div style={{ height: 1, background: th.settingsDivider, marginBottom: 20 }} />

              {/* Nav buttons / popups */}
              {confirmDest === null ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <button onClick={() => setConfirmDest("export")}
                    style={{ width: "100%", padding: "10px 0", borderRadius: 12, border: `1px solid ${th.border}`, background: th.cardBg, color: th.textSecondary, fontSize: 13, cursor: "pointer" }}>
                    {language === "zh" ? "📖 导出完整故事" : language === "ko" ? "📖 전체 스토리 내보내기" : "📖 Export Full Story"}
                  </button>
                  <button onClick={() => setConfirmDest("keyInput")}
                    style={{ width: "100%", padding: "10px 0", borderRadius: 12, border: `1px solid ${th.switchLlmBorder}`, background: th.switchLlmBg, color: th.switchLlmColor, fontSize: 13, cursor: "pointer" }}>
                    {language === "zh" ? "🔑 切换模型 / API Key" : language === "ko" ? "🔑 모델 / API Key 전환" : "🔑 Switch Model / API Key"}
                  </button>
                  <button onClick={() => setConfirmDest("cover")}
                    style={{ width: "100%", padding: "10px 0", borderRadius: 12, border: `1px solid ${th.coverContinueBorder}`, background: th.cardBg, color: th.coverContinueColor, fontSize: 13, cursor: "pointer" }}>
                    {t.settings?.backToCover}
                  </button>
                </div>
              ) : confirmDest === "export" ? (
                <div style={{ background: th.cardBg, border: `1px solid ${th.border}`, borderRadius: 12, padding: "14px 14px" }}>
                  <div style={{ fontSize: 12, color: th.textHeading, fontWeight: 600, marginBottom: 4 }}>
                    {language === "zh" ? "选择导出格式" : language === "ko" ? "내보내기 형식 선택" : "Choose export format"}
                  </div>
                  {messages.filter(m => m.role === "assistant" && !m.hidden).length === 0 ? (
                    <div style={{ fontSize: 11, color: th.textFaint, margin: "10px 0" }}>
                      {language === "zh" ? "暂无故事内容" : language === "ko" ? "스토리 없음" : "No story yet"}
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
                      <button onClick={exportClipboard}
                        style={{ width: "100%", padding: "9px 0", borderRadius: 10, border: `1px solid ${th.border}`, background: "transparent", color: th.textPrimary, fontSize: 12, cursor: "pointer" }}>
                        📋 {language === "zh" ? "复制到剪贴板" : language === "ko" ? "클립보드에 복사" : "Copy to Clipboard"}
                      </button>
                      <button onClick={exportTxt}
                        style={{ width: "100%", padding: "9px 0", borderRadius: 10, border: `1px solid ${th.border}`, background: "transparent", color: th.textPrimary, fontSize: 12, cursor: "pointer" }}>
                        📄 {language === "zh" ? "下载 .txt 文件" : language === "ko" ? ".txt 파일 다운로드" : "Download .txt File"}
                      </button>
                      <button onClick={exportPdf}
                        style={{ width: "100%", padding: "9px 0", borderRadius: 10, border: `1px solid ${th.border}`, background: "transparent", color: th.textPrimary, fontSize: 12, cursor: "pointer" }}>
                        🖨️ {language === "zh" ? "打印 / 存为 PDF" : language === "ko" ? "인쇄 / PDF 저장" : "Print / Save as PDF"}
                      </button>
                    </div>
                  )}
                  <button onClick={() => setConfirmDest(null)}
                    style={{ width: "100%", padding: "7px 0", borderRadius: 10, border: `1px solid ${th.border}`, background: "transparent", color: th.textMuted, fontSize: 11, cursor: "pointer", marginTop: 10 }}>
                    {language === "zh" ? "取消" : language === "ko" ? "취소" : "Cancel"}
                  </button>
                </div>
              ) : (
                <div style={{ background: th.warnBg, border: `1px solid ${th.warnBorder}`, borderRadius: 12, padding: "14px 14px" }}>
                  <div style={{ fontSize: 12, color: th.warnTitle, fontWeight: 600, marginBottom: 4 }}>{t.settings?.saveWarningTitle}</div>
                  <div style={{ fontSize: 11, color: th.warnDesc, marginBottom: 12, lineHeight: 1.5 }}>{t.settings?.saveWarningDesc}</div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => { setOverlay({ type: "save" }); setShowSettings(false); setConfirmDest(null); }}
                      style={{ flex: 1, padding: "8px 0", borderRadius: 10, border: "none", background: th.accentGrad, color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                      {t.settings?.saveNow}
                    </button>
                    <button onClick={() => { setShowSettings(false); setConfirmDest(null); setKeyJustSaved(false); setPhase(confirmDest); }}
                      style={{ flex: 1, padding: "8px 0", borderRadius: 10, border: `1px solid ${th.border}`, background: "transparent", color: th.textMuted, fontSize: 12, cursor: "pointer" }}>
                      {t.settings?.leaveAnyway}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Achievement Modal */}
        {achievement && (
          <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", background: th.achieveOverlay, backdropFilter: "blur(8px)" }}>
            <div style={{ width: "90%", maxWidth: 340, background: th.achieveBg, border: `1px solid ${th.borderAccent}`, borderRadius: 20, padding: "28px 20px", textAlign: "center", boxShadow: "0 20px 60px rgba(0,0,0,.3)" }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>{achievement.icon}</div>
              <div style={{ color: th.textHeading, fontSize: 18, fontWeight: 700, marginBottom: 8 }}>{achievement.title}</div>
              <div style={{ color: th.textSecondary, fontSize: 13, lineHeight: 1.7, marginBottom: 20 }}>{achievement.description}</div>
              <button onClick={() => setAchievement(null)} style={{ padding: "10px 32px", borderRadius: 24, background: th.accentGrad, border: "none", color: "#fff", fontSize: 14, cursor: "pointer" }}>
                {language === "zh" ? "继续游戏" : language === "ko" ? "계속하기" : "Continue"}
              </button>
            </div>
          </div>
        )}

        {/* Special Event Modal */}
        {specialEvent && (
          <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", background: th.achieveOverlay, backdropFilter: "blur(8px)" }}>
            <div style={{ width: "90%", maxWidth: 340, background: th.achieveBg, border: `1px solid ${th.borderAccent}`, borderRadius: 20, padding: "28px 20px", textAlign: "center", boxShadow: "0 20px 60px rgba(0,0,0,.3)" }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>{specialEvent.icon || "💍"}</div>
              <div style={{ color: th.textHeading, fontSize: 18, fontWeight: 700, marginBottom: 8 }}>{specialEvent.title}</div>
              <div style={{ color: th.textSecondary, fontSize: 13, lineHeight: 1.7, marginBottom: 20 }}>{specialEvent.description}</div>
              <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
                <button onClick={async () => {
                  setSpecialEvent(null); setLoading(true);
                  try {
                    const epilogue = await executeRound({
                      playerChoice: `Generate an epilogue: ${specialEvent.title}. A short story set after this event. 150 words in a warm, literary style. Return ONLY valid JSON.`,
                      stats: statsRef.current, memory: memoryRef.current,
                      form: { ...form, identity: IDENTITIES.find(i => i.id === form.identity)?.label || form.identity },
                      members, mainId: form.mainMember, subIds: form.subMembers || [],
                      groupConfig, apiKey, selectedModel, kktUnlocked, language, reasoningEnabled,
                      qwenSubModel: selectedModel === "qwen" ? selectedQwenSubModel : null,
                    });
                    const epStats = epilogue.newStats || statsRef.current;
                    const statsBox = buildStatsBox(epStats, members, form.mainMember, form.subMembers || [], t);
                    setMessages(p => [...p, { role: "assistant", content: "=== EPILOGUE ===\n\n" + statsBox + "\n\n" + (epilogue.storyContent || "The end.") }]);
                    const backLabel = language === "zh" ? "A. 返回封面页" : language === "ko" ? "A. 커버 페이지로 돌아가기" : "A. Return to Cover Page";
                    setCurrentOptions([backLabel]);
                  } catch (e) {
                    setMessages(p => [...p, { role: "assistant", content: "Epilogue generation failed." }]);
                    const backLabel = language === "zh" ? "A. 返回封面页" : language === "ko" ? "A. 커버 페이지로 돌아가기" : "A. Return to Cover Page";
                    setCurrentOptions([backLabel]);
                  }
                  setLoading(false);
                }} style={{ padding: "10px 20px", borderRadius: 24, background: th.accentGrad, border: "none", color: "#fff", fontSize: 13, cursor: "pointer" }}>
                  {language === "zh" ? "结束游戏并查看番外" : language === "ko" ? "게임 종료 및 에필로그 보기" : "End Game & View Epilogue"}
                </button>
                <button onClick={() => setSpecialEvent(null)}
                  style={{ padding: "10px 20px", borderRadius: 24, border: `1px solid ${th.border}`, background: "transparent", color: th.textSecondary, fontSize: 13, cursor: "pointer" }}>
                  {language === "zh" ? "继续游戏" : language === "ko" ? "게임 계속하기" : "Continue Playing"}
                </button>
              </div>
            </div>
          </div>
        )}

        {overlay?.type === "bubble" && <BubbleOverlay theme={theme} fontScale={fontScale} t={t} memberId={overlay.memberId} members={members} socialFeeds={socialFeeds} allTargetMembers={allTargetMembers} kktUnlocked={kktUnlocked} onClose={() => setOverlay(null)} />}
        {overlay?.type === "instagram" && <InstagramOverlay theme={theme} t={t} memberId={overlay.memberId} members={members} socialFeeds={socialFeeds} allTargetMembers={allTargetMembers} onClose={() => setOverlay(null)} />}
        {overlay?.type === "weverse" && <WeverseOverlay theme={theme} t={t} memberId={overlay.memberId} members={members} socialFeeds={socialFeeds} allTargetMembers={allTargetMembers} onClose={() => setOverlay(null)} />}
        {overlay?.type === "kakao" && <KakaoOverlay theme={theme} fontScale={fontScale} t={t} memberId={overlay.memberId} members={members} kktMessages={kktMessages} kktUnlocked={kktUnlocked} allTargetMembers={allTargetMembers} onClose={() => setOverlay(null)} />}
      </div>
    </div>
  );
}
