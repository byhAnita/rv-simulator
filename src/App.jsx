import BubbleOverlay from "./platforms/BubbleOverlay";
import InstagramOverlay from "./platforms/InstagramOverlay";
import WeverseOverlay from "./platforms/WeverseOverlay";
import KakaoOverlay from "./platforms/KakaoOverlay";
import SaveOverlay from "./platforms/SaveOverlay";

import { useState, useRef, useEffect, useCallback } from "react";
import { loadGroupConfig, buildMemberDetails, getNpcMembers } from "./rag/groupLoader";
import { createEmptyMemory } from "./agent/memoryPool";
import { getTopMember } from "./agent/memoryPool";
import { createInitialStats, executeRound } from "./agent/mainAgent";
import { getStageName, getStageColor } from "./config/stageConfig";
import { MODEL_CONFIGS } from "./config/modelConfigs";
import { KKT_THRESHOLD, MEMORY_ROUNDS, MAIN_INITIAL_AFFECTION, SUB_INITIAL_AFFECTION_MIN, SUB_INITIAL_AFFECTION_MAX } from "./config/constants";
import { STORAGE_KEYS, loadFromStorage, saveToStorage, nowTime } from "./utils";

// ============================================================
// 身份列表 (v11.0: "前女友" → "主线成员前女友")
// ============================================================
const IDENTITIES = [
  { id: "SM练习生", label: "SM练习生" },
  { id: "SM职员", label: "SM职员" },
  { id: "韩娱艺人", label: "韩娱艺人" },
  { id: "粉丝", label: "粉丝" },
  { id: "艺术留学生", label: "艺术留学生" },
  { id: "财阀独女", label: "财阀独女" },
  { id: "主线成员前女友", label: "主线成员前女友" },
  { id: "H", label: "【自定义】" },
];
const STAR_LEVELS = ["资深粉丝", "普通韩娱瓜众", "纯路人", "已脱粉"];
const PACES = ["慢热现实向", "浪漫情感向", "高压舆论向", "修罗海王向"];

// ============================================================
// 主组件
// ============================================================
export default function App() {
  const [phase, setPhase] = useState("cover"); // cover | keyInput | setup | game
  const [apiKey, setApiKey] = useState(() => loadFromStorage(STORAGE_KEYS.API_KEY) || "");
  const [selectedModel, setSelectedModel] = useState(() => loadFromStorage(STORAGE_KEYS.SELECTED_MODEL) || "deepseek");
  const [form, setForm] = useState({ mainMember: null, subMembers: [], identity: "", customIdentity: "", name: "", nationality: "韩国", age: "", nickname: "", herNickname: "", starLevel: "", pace: "" });
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  // RAG 加载的团设定
  const [groupConfig, setGroupConfig] = useState(null);
  const [members, setMembers] = useState([]);

  // 游戏状态
  const statsRef = useRef(null);
  const [stats, setStats] = useState(null);
  const memoryRef = useRef(createEmptyMemory());
  const [socialFeeds, setSocialFeeds] = useState({});
  const [kktUnlocked, setKktUnlocked] = useState({});
  const [kktMessages, setKktMessages] = useState({});
  const [activeNotifications, setActiveNotifications] = useState([]);
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

  // 初始化 RAG
  useEffect(() => {
    loadGroupConfig("red_velvet").then(config => {
      setGroupConfig(config);
      setMembers(config.members);
    }).catch(console.error);
  }, []);

  useEffect(() => { if (bottomRef.current) bottomRef.current.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);

  const showNotif = (msg, type = "info") => { setNotification({ msg, type }); setTimeout(() => setNotification(null), 3000); };
  const saveApiKey = (key) => { const t = key.trim(); setApiKey(t); if (t) { saveToStorage(STORAGE_KEYS.API_KEY, t); showNotif("✅ Key已保存"); } };
  const handleModelSelect = (id) => { setSelectedModel(id); saveToStorage(STORAGE_KEYS.SELECTED_MODEL, id); showNotif("✅ 切换至" + MODEL_CONFIGS[id]?.name); };

  // 检查是否有存档
  const hasSaves = () => {
    const saves = loadFromStorage(STORAGE_KEYS.SAVES) || [];
    return saves.length > 0;
  };

  // 开始新游戏
  const startNewGame = async () => {
    if (!apiKey?.trim()) { showNotif("❌ 请设置API Key", "error"); return; }
    if (!form.mainMember) { showNotif("❌ 请选择主线成员", "error"); return; }

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

    // 初始社媒
    const initFeeds = {};
    allTargetMembers.forEach(m => { initFeeds[m.id] = { bubble: [{ content: "今天也加油💪", hasPhoto: false }], instagram: { caption: "✨", likes: 800000 }, weverse: { content: "大家好~", likes: 2000, comments: 100 }, timestamp: Date.now(), lastUpdate: Date.now() }; });
    setSocialFeeds(initFeeds);
    setActiveNotifications([]);
    setKktUnlocked({});
    setKktMessages({});
    setTopMember(mainMember);

    try {
      // 开局第一轮
      const result = await executeRound({
        playerChoice: "游戏开局",
        stats: initialStats,
        memory: mem,
        form: { ...form, identity: IDENTITIES.find(i => i.id === form.identity)?.label || form.identity },
        members,
        mainId,
        subIds,
        groupConfig,
        apiKey,
        selectedModel,
        kktUnlocked: {},
      });

      statsRef.current = result.newStats;
      setStats({ ...result.newStats });
      memoryRef.current = result.updatedMemory;
      setActiveNotifications(result.roundNotifs);
      setSocialFeeds(p => ({ ...p, ...Object.fromEntries(Object.entries(result.socialUpdates || {}).map(([k, v]) => [k, { ...(p[k] || {}), ...v, lastUpdate: Date.now() }])) }));
      setKktMessages(p => ({ ...p, ...Object.fromEntries(Object.entries(result.kktUpdates || {}).map(([k, v]) => [k, [...(p[k] || []), ...v].slice(-20)])) }));
      setKktUnlocked(result.newKktUnlocked);
      setTopMember(result.topMember);
      setMessages([{ role: "user", content: "start", hidden: true }, { role: "assistant", content: result.storyContent }]);
    } catch (e) {
      setMessages([{ role: "assistant", content: "❌ 启动失败: " + e.message }]);
    }
    setLoading(false);
  };

  // 读取存档
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
    setActiveNotifications([]);
    setPhase("game");
    showNotif("✅ 读档成功");
  };

  // 发送消息（每轮循环）
  const sendMessage = async (text) => {
    if (!text.trim() || loading) return;
    const um = { role: "user", content: text }, nh = [...messages, um];
    setMessages(nh); setInput(""); setLoading(true);

    try {
      const result = await executeRound({
        playerChoice: text,
        stats: statsRef.current,
        memory: memoryRef.current,
        form: { ...form, identity: IDENTITIES.find(i => i.id === form.identity)?.label || form.identity },
        members,
        mainId: form.mainMember,
        subIds: form.subMembers || [],
        groupConfig,
        apiKey,
        selectedModel,
        kktUnlocked,
      });

      statsRef.current = result.newStats;
      setStats({ ...result.newStats });
      memoryRef.current = result.updatedMemory;
      setActiveNotifications(result.roundNotifs);
      setSocialFeeds(p => ({ ...p, ...Object.fromEntries(Object.entries(result.socialUpdates || {}).map(([k, v]) => [k, { ...(p[k] || {}), ...v, lastUpdate: Date.now() }])) }));
      setKktMessages(p => ({ ...p, ...Object.fromEntries(Object.entries(result.kktUpdates || {}).map(([k, v]) => [k, [...(p[k] || []), ...v].slice(-20)])) }));
      setKktUnlocked(result.newKktUnlocked);
      setTopMember(result.topMember);
      setMessages(p => [...p, { role: "assistant", content: result.storyContent }]);
    } catch (e) {
      setMessages(p => [...p, { role: "assistant", content: "❌ 出错: " + e.message }]);
    }
    setLoading(false);
  };

  const openSocialPlatform = (platform, memberId = null) => {
    setOverlay({ type: platform, memberId: memberId || form.mainMember });
  };

  const getAffection = (mid) => mid === form.mainMember ? (stats?.affection || 0) : (stats?.multiAff?.[mid] || 0);

  const getStage = (aff) => ({ label: getStageName(aff), color: getStageColor(aff) });
  const lastAssistant = [...messages].reverse().find(m => m.role === "assistant");
  const quickOptions = [];
  if (lastAssistant?.role === "assistant") { const re = /^([ABCD])[.、．]\s*(.+)/gm; let m; while ((m = re.exec(lastAssistant.content)) !== null) quickOptions.push({ letter: m[1], text: m[2].trim() }); }

  const hasNotifDot = (platform) => activeNotifications.some(n => n.platform === platform);
  const displayTopMember = topMember || mainMember;
  const stage = getStage(displayTopMember ? getAffection(displayTopMember.id) : 0);

  const NotificationBar = () => notification ? <div style={{ position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)", background: notification.type === "error" ? "rgba(220,50,50,.92)" : "rgba(50,180,100,.92)", color: "#fff", padding: "8px 20px", borderRadius: 20, fontSize: 12, fontWeight: 600, zIndex: 9999, pointerEvents: "none" }}>{notification.msg}</div> : null;

  // ── 封面页 ──
  if (phase === "cover") return (
    <div style={{ height: "100vh", display: "flex", justifyContent: "center", alignItems: "center", background: "linear-gradient(135deg,#0a0410,#1e0718,#0a0420)" }}>
      <div style={{ width: "100%", maxWidth: 390, height: "100vh", maxHeight: 844, background: "linear-gradient(135deg,#0a0410,#1e0718,#0a0420)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "'Georgia','Noto Serif SC',serif", color: "#f5e6ef", padding: 20, borderRadius: 20, boxShadow: "0 0 40px rgba(0,0,0,.5)", overflow: "hidden" }}>
        <NotificationBar />
        <div style={{ fontSize: 44, marginBottom: 14 }}>💗</div>
        <h1 style={{ fontSize: "clamp(24px,6vw,44px)", fontWeight: 700, background: "linear-gradient(90deg,#f8c8d8,#e887b0,#c86dd0,#e887b0,#f8c8d8)", backgroundSize: "200% auto", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", animation: "shimmerCover 4s linear infinite", marginBottom: 4 }}>Red Velvet</h1>
        <h2 style={{ fontSize: "clamp(13px,2.5vw,20px)", letterSpacing: ".3em", color: "#d898b8", marginBottom: 4 }}>嫂子模拟器</h2>
        <p style={{ fontSize: 10, color: "#806070", letterSpacing: ".1em", marginBottom: 28 }}>AI文游·女女恋爱养成·v11.0 RAG</p>
        <button onClick={() => { if (apiKey?.trim()) setPhase("setup"); else setPhase("keyInput"); }} style={{ padding: "14px 48px", borderRadius: 40, border: "none", cursor: "pointer", background: "linear-gradient(135deg,#e887b0,#c86dd0)", color: "#fff", fontSize: 15, fontWeight: 700, marginBottom: 10 }}>✨ 开始新游戏</button>
        {hasSaves() && <button onClick={() => { setOverlay({ type: "save" }); }} style={{ padding: "10px 32px", borderRadius: 40, border: "1px solid rgba(232,120,176,.3)", background: "transparent", color: "#c898b8", fontSize: 13, cursor: "pointer", marginBottom: 10 }}>💾 继续游戏 (读档)</button>}
        <button onClick={() => setPhase("keyInput")} style={{ background: "none", border: "1px solid rgba(232,120,176,.3)", borderRadius: 16, padding: "6px 16px", color: "#c898b8", fontSize: 11, cursor: "pointer" }}>🔑 修改API Key/切换模型</button>
      </div>
    </div>
  );

  // ── Key输入页 ──
  if (phase === "keyInput") return (
    <div style={{ height: "100vh", display: "flex", justifyContent: "center", alignItems: "center", background: "linear-gradient(160deg,#0a0410,#1e0718,#0a0420)" }}>
      <div style={{ width: "100%", maxWidth: 390, height: "100vh", maxHeight: 844, background: "linear-gradient(160deg,#0a0410,#1e0718,#0a0420)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start", fontFamily: "'Georgia','Noto Serif SC',serif", color: "#f5e6ef", padding: "30px 20px", borderRadius: 20, boxShadow: "0 0 40px rgba(0,0,0,.5)", overflowY: "auto" }}>
        <NotificationBar />
        <div style={{ fontSize: 36, marginBottom: 14 }}>🔑</div>
        <h2 style={{ fontSize: 18, color: "#f8c8d8", marginBottom: 6 }}>设置API Key & 模型</h2>
        <p style={{ fontSize: 11, color: "#907080", marginBottom: 6, textAlign: "center" }}>Key仅存储于本机，不上传</p>
        <p style={{ fontSize: 9, color: "#605060", marginBottom: 16, textAlign: "center" }}>💡 {MODEL_CONFIGS[selectedModel]?.keyHelp}</p>
        <div style={{ width: "100%", marginBottom: 14 }}>
          <p style={{ fontSize: 11, color: "#907080", marginBottom: 8, textAlign: "center" }}>🤖 选择AI模型</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            {Object.values(MODEL_CONFIGS).map(c => <div key={c.id} onClick={() => handleModelSelect(c.id)} style={{ padding: "8px 10px", borderRadius: 10, border: `1px solid ${selectedModel === c.id ? c.color : "rgba(255,255,255,.1)"}`, background: selectedModel === c.id ? c.color + "15" : "rgba(255,255,255,.03)", cursor: "pointer", userSelect: "none" }}><div style={{ fontSize: 12, fontWeight: 700, color: selectedModel === c.id ? c.color : "#ccc" }}>{c.emoji} {c.name}</div><div style={{ fontSize: 9, color: "#807080", marginTop: 2 }}>{c.desc}</div></div>)}
          </div>
        </div>
        <input type="password" placeholder={(MODEL_CONFIGS[selectedModel]?.keyPrefix || "sk-") + "..."} value={apiKey} onChange={e => setApiKey(e.target.value)} autoFocus style={{ width: "100%", padding: "12px 16px", borderRadius: 12, background: "rgba(255,255,255,.06)", border: `1px solid ${MODEL_CONFIGS[selectedModel]?.color || "rgba(232,120,176,.3)"}`, color: "#f5e6ef", fontSize: 13, outline: "none", boxSizing: "border-box", fontFamily: "'Courier New',monospace", marginBottom: 18 }} />
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => { if (apiKey?.trim()) { saveApiKey(apiKey); setPhase("setup"); } else showNotif("❌ 请输入API Key", "error"); }} disabled={!apiKey?.trim()} style={{ padding: "11px 32px", borderRadius: 40, border: "none", cursor: apiKey?.trim() ? "pointer" : "not-allowed", background: apiKey?.trim() ? `linear-gradient(135deg,${MODEL_CONFIGS[selectedModel]?.color || "#e887b0"},#c86dd0)` : "rgba(255,255,255,.08)", color: "#fff", fontSize: 14, fontWeight: 600 }}>确认 →</button>
          <button onClick={() => setPhase("cover")} style={{ padding: "11px 20px", borderRadius: 40, border: "1px solid rgba(232,120,176,.3)", background: "transparent", color: "#c898b8", fontSize: 13, cursor: "pointer" }}>返回</button>
        </div>
      </div>
    </div>
  );

  // ── 角色创建页 (新流程: ①主线 ②支线 ③身份 ④基础信息) ──
  if (phase === "setup") {
    const canStart = form.mainMember && form.name && form.age && form.identity && form.starLevel && form.pace;
    return (
      <div style={{ height: "100vh", display: "flex", justifyContent: "center", alignItems: "center", background: "linear-gradient(160deg,#0a0410,#1e0718,#0a0420)" }}>
        <div style={{ width: "100%", maxWidth: 390, height: "100vh", maxHeight: 844, background: "linear-gradient(160deg,#0a0410,#1e0718,#0a0420)", fontFamily: "'Georgia','Noto Serif SC',serif", color: "#f5e6ef", padding: "12px 10px 40px", overflowY: "auto", borderRadius: 20, boxShadow: "0 0 40px rgba(0,0,0,.5)" }}>
          <NotificationBar />
          <style>{`.s-l{font-size:11px;color:#c886a8;margin-bottom:6px;margin-top:14px;font-weight:600}.s-c{background:rgba(255,255,255,.04);border:1px solid rgba(232,120,176,.18);border-radius:10px;padding:10px 12px;cursor:pointer;display:flex;align-items:center;gap:8px;margin-bottom:5px;user-select:none}.s-c.sel{border-color:#e887b0;background:rgba(232,135,176,.12)}.s-in{width:100%;padding:9px 11px;border-radius:8px;background:rgba(255,255,255,.05);border:1px solid rgba(232,120,176,.18);color:#f5e6ef;font-size:12px;outline:none;box-sizing:border-box;font-family:inherit}.s-ch{display:inline-block;padding:6px 11px;border-radius:15px;background:rgba(255,255,255,.04);border:1px solid rgba(232,120,176,.18);cursor:pointer;fontSize:11px;margin:2px;user-select:none}.s-ch.sel{background:rgba(232,135,176,.2);border-color:#e887b0;color:#f8c8d8}.s-g2{display:grid;grid-template-columns:1fr 1fr;gap:5px}`}</style>
          <div style={{ textAlign: "center", padding: "10px 0 2px" }}>
            <h2 style={{ fontSize: 18, color: "#f8c8d8", marginBottom: 2 }}>💗 角色创建</h2>
            <p style={{ fontSize: 10, color: "#906070" }}>RAG加载: {groupConfig?.group?.name || "加载中..."}</p>
            <div style={{ marginTop: 6, fontSize: 10, color: apiKey ? "#6d9b6d" : "#d07070", display: "flex", alignItems: "center", justifyContent: "center", gap: 4, flexWrap: "wrap" }}>
              <span>{apiKey ? "🔑 Key已配置" : "⚠️ Key未配置"}</span>
              <span style={{ color: "#907080" }}>· {MODEL_CONFIGS[selectedModel]?.emoji} {MODEL_CONFIGS[selectedModel]?.name}</span>
              <button onClick={() => setPhase("keyInput")} style={{ background: "none", border: "1px solid rgba(232,120,176,.2)", borderRadius: 6, padding: "2px 6px", color: "#c898b8", fontSize: 9, cursor: "pointer" }}>修改</button>
            </div>
          </div>

          {/* ① 主线成员 */}
          <div className="s-l">🌸 主线成员 (初始好感{MAIN_INITIAL_AFFECTION})</div>
          <div className="s-g2">{members.map(m => <div key={m.id} className={`s-c${form.mainMember === m.id ? " sel" : ""}`} onClick={() => setForm(f => ({ ...f, mainMember: m.id, subMembers: (f.subMembers || []).filter(id => id !== m.id) }))} style={{ borderColor: form.mainMember === m.id ? m.accent : undefined }}><span style={{ fontSize: 18 }}>{m.emoji}</span><div><div style={{ fontSize: 12, fontWeight: 700 }}>{m.name}</div><div style={{ fontSize: 9, color: "#a07090" }}>{m.name_kr} · {m.role}</div></div></div>)}</div>

          {/* ② 支线成员 */}
          <div className="s-l">🌿 支线成员 (可选0~4位，初始好感{SUB_INITIAL_AFFECTION_MIN}~{SUB_INITIAL_AFFECTION_MAX})</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 4 }}>
            {members.filter(m => m.id !== form.mainMember).map(m => {
              const sel = (form.subMembers || []).includes(m.id);
              return <span key={m.id} className={`s-ch${sel ? " sel" : ""}`} onClick={() => setForm(f => ({ ...f, subMembers: sel ? f.subMembers.filter(x => x !== m.id) : [...(f.subMembers || []), m.id].slice(0, 4) }))}>{m.emoji} {m.name}</span>;
            })}
          </div>
          {members.filter(m => m.id !== form.mainMember && !(form.subMembers || []).includes(m.id)).length > 0 && <p style={{ fontSize: 9, color: "#605060", marginBottom: 4 }}>🤝 NPC成员 (必须出场): {members.filter(m => m.id !== form.mainMember && !(form.subMembers || []).includes(m.id)).map(m => m.emoji + m.name).join("、")}</p>}

          {/* ③ 身份 */}
          <div className="s-l">💼 身份</div>
          {IDENTITIES.map(id => <div key={id.id} className={`s-c${form.identity === id.id ? " sel" : ""}`} onClick={() => setForm(f => ({ ...f, identity: id.id }))}><span style={{ fontSize: 10, fontWeight: 800, color: "#e887b0", minWidth: 16 }}>{id.id === "H" ? "H" : ""}</span><span style={{ fontSize: 11 }}>{id.label}</span></div>)}
          {form.identity === "H" && <input className="s-in" placeholder="自定义身份..." value={form.customIdentity} onChange={e => setForm(f => ({ ...f, customIdentity: e.target.value }))} style={{ marginTop: 4 }} />}

          {/* ④ 基础信息 */}
          <div className="s-l">📝 基础信息</div>
          <div style={{ display: "flex", gap: 5, marginBottom: 5 }}><input className="s-in" placeholder="名字" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={{ flex: 2 }} /><input className="s-in" placeholder="年龄" value={form.age} onChange={e => setForm(f => ({ ...f, age: e.target.value }))} style={{ flex: 1 }} type="number" min="18" /></div>
          <input className="s-in" placeholder="国籍(默认韩国)" value={form.nationality} onChange={e => setForm(f => ({ ...f, nationality: e.target.value }))} style={{ marginBottom: 5 }} />
          <div style={{ display: "flex", gap: 5 }}><input className="s-in" placeholder={`对${mainMember?.name || "她"}的爱称`} value={form.nickname} onChange={e => setForm(f => ({ ...f, nickname: e.target.value }))} /><input className="s-in" placeholder="她对我的爱称" value={form.herNickname} onChange={e => setForm(f => ({ ...f, herNickname: e.target.value }))} /></div>
          <div className="s-l">⭐ 追星程度</div>
          <div>{STAR_LEVELS.map(s => <span key={s} className={`s-ch${form.starLevel === s ? " sel" : ""}`} onClick={() => setForm(f => ({ ...f, starLevel: s }))}>{s}</span>)}</div>
          <div className="s-l">🎬 剧情节奏</div>
          <div>{PACES.map(p => <span key={p} className={`s-ch${form.pace === p ? " sel" : ""}`} onClick={() => setForm(f => ({ ...f, pace: p }))}>{p}</span>)}</div>
          <button onClick={startNewGame} disabled={!canStart} style={{ width: "100%", marginTop: 22, padding: 13, borderRadius: 40, border: "none", cursor: canStart ? "pointer" : "not-allowed", background: canStart ? "linear-gradient(135deg,#e887b0,#c86dd0)" : "rgba(255,255,255,.08)", color: "#fff", fontSize: 14, fontWeight: 700 }}>{canStart ? `✨ 与${mainMember?.name || "..."}开始故事` : "请填写完整信息"}</button>
        </div>
      </div>
    );
  }

  // ── 游戏主界面 ──
  if (!groupConfig || !members.length) return <div style={{ height: "100vh", display: "flex", justifyContent: "center", alignItems: "center", background: "#000", color: "#fff" }}>加载中...</div>;

  return (
    <div style={{ height: "100vh", display: "flex", justifyContent: "center", alignItems: "center", background: "#000" }}>
      <div style={{ width: "100%", maxWidth: 390, height: "100vh", maxHeight: 844, display: "flex", flexDirection: "column", background: "linear-gradient(180deg,#080310,#120818)", fontFamily: "'Georgia','Noto Serif SC',serif", color: "#f5e6ef", position: "relative", overflow: "hidden", borderRadius: 20, boxShadow: "0 0 40px rgba(0,0,0,.6)" }}>
        <NotificationBar />
        <style>{`::-webkit-scrollbar{width:2px}::-webkit-scrollbar-thumb{background:rgba(232,120,176,.2)}@keyframes blink{0%,100%{opacity:1}50%{opacity:.25}}@keyframes slideUp{from{transform:translateY(6px);opacity:0}to{transform:translateY(0);opacity:1}}.stat-item{cursor:help;transition:all .15s;position:relative}.stat-item:hover{transform:scale(1.05)}.stat-tooltip{position:absolute;top:calc(100% + 6px);left:50%;transform:translateX(-50%);background:rgba(30,5,40,.96);border:1px solid rgba(232,135,176,.5);border-radius:6px;padding:3px 8px;fontSize:9px;color:#f8c8d8;white-space:nowrap;pointer-events:none;z-index:50}.notification-dot{position:absolute;top:-2px;right:-2px;width:7px;height:7px;border-radius:50%;background:#ff3b5c;animation:blink 1s infinite}`}</style>

        {/* 顶栏 */}
        <div style={{ background: "rgba(6,2,10,.96)", backdropFilter: "blur(12px)", borderBottom: "1px solid rgba(232,120,176,.18)", padding: "5px 8px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0, zIndex: 10, gap: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
            <div style={{ width: 28, height: 28, borderRadius: "50%", background: `linear-gradient(135deg,${displayTopMember?.color || "#f0c8d8"},${displayTopMember?.accent || "#c2185b"})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 }}>{displayTopMember?.emoji || "💗"}</div>
            <div><div style={{ fontSize: 12, fontWeight: 700, color: "#f8c8d8", whiteSpace: "nowrap" }}>{displayTopMember?.name || "RV"}</div><span style={{ fontSize: 8, padding: "1px 5px", borderRadius: 4, background: stage.color + "18", color: stage.color, border: `1px solid ${stage.color}33` }}>{stage.label}</span></div>
          </div>
          <div style={{ display: "flex", gap: 4, alignItems: "center", fontSize: 10, flexWrap: "wrap", justifyContent: "center", overflow: "hidden" }}>
            {stats && [{ key: "selfId", icon: "🌈", label: "自我认同", value: stats.selfId }, { key: "secrecy", icon: "🔒", label: "保密度", value: stats.secrecy }, { key: "alert", icon: "👁", label: "公司警觉", value: stats.alert }, { key: "pressure", icon: "📊", label: "事业压力", value: stats.pressure }, { key: "mood", icon: "💫", label: "心情", value: stats.mood }, { key: "week", icon: "📅", label: "回合", value: stats.week }].map(item => <div key={item.key} className="stat-item" style={{ display: "flex", alignItems: "center", gap: 1, color: "#c898b8", position: "relative" }} onMouseEnter={() => setHoveredStat(item.key)} onMouseLeave={() => setHoveredStat(null)}><span style={{ fontSize: 10 }}>{item.icon}</span><span style={{ fontSize: 8 }}>{item.value}</span>{hoveredStat === item.key && <div className="stat-tooltip">{item.label}: {item.value}</div>}</div>)}
            {allTargetMembers.map(m => { const aff = getAffection(m.id); return <div key={m.id} className="stat-item" style={{ display: "flex", alignItems: "center", gap: 1, color: "#c898b8", position: "relative" }} onMouseEnter={() => setHoveredStat("aff_" + m.id)} onMouseLeave={() => setHoveredStat(null)}><span style={{ fontSize: 10 }}>{m.emoji}</span><span style={{ fontSize: 8 }}>{aff}</span>{hoveredStat === "aff_" + m.id && <div className="stat-tooltip">{m.name}好感: {aff} ({getStageName(aff)})</div>}</div>})}
          </div>
          <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
            {[{ icon: "💜", type: "bubble" }, { icon: "📸", type: "instagram" }, { icon: "🌿", type: "weverse" }, { icon: "💬", type: "kakao", locked: !kktUnlocked[form.mainMember] }].map(b => { const showDot = hasNotifDot(b.type) && !b.locked; return <button key={b.type} onClick={() => openSocialPlatform(b.type)} style={{ position: "relative", background: b.locked ? "rgba(255,255,255,.03)" : "rgba(255,255,255,.06)", border: `1px solid ${b.locked ? "rgba(255,255,255,.1)" : "rgba(232,120,176,.15)"}`, borderRadius: 5, padding: "3px 5px", color: b.locked ? "#555" : "#d0a8c0", fontSize: 11, cursor: b.locked ? "not-allowed" : "pointer", opacity: b.locked ? .5 : 1 }}>{b.icon}{showDot && <div className="notification-dot" />}</button>; })}
            <button onClick={() => setOverlay({ type: "save" })} style={{ background: "rgba(255,255,255,.06)", border: "1px solid rgba(232,120,176,.15)", borderRadius: 5, padding: "3px 5px", color: "#d0a8c0", fontSize: 11, cursor: "pointer" }}>💾</button>
          </div>
        </div>

        {/* 通知栏 */}
        {activeNotifications.length > 0 && <div style={{ padding: "3px 8px", background: "rgba(255,59,92,.1)", borderBottom: "1px solid rgba(255,59,92,.2)", display: "flex", gap: 6, overflowX: "auto", flexShrink: 0, fontSize: 9, color: "#ff6b8a" }}>{activeNotifications.map((n, i) => { const m = members.find(mb => mb.id === n.memberId), pn = { bubble: "bubble", instagram: "INS", weverse: "Weverse", kakao: "KKT" }; return <span key={i} onClick={() => openSocialPlatform(n.platform, n.memberId)} style={{ cursor: "pointer", whiteSpace: "nowrap" }}>📱 {m?.name} 更新了{pn[n.platform] || n.platform}</span>; })}</div>}

        {/* 故事区 */}
        <div style={{ flex: 1, overflowY: "auto", padding: "10px 10px" }}>
          {messages.length === 0 && <div style={{ textAlign: "center", padding: "50px 16px", color: "#503050" }}><div style={{ fontSize: 32, marginBottom: 10, animation: "blink 2s infinite" }}>💗</div><div style={{ fontSize: 12 }}>生成开局剧情...</div></div>}
          {messages.map((msg, i) => {
            if (msg.hidden) return null;
            if (msg.role === "user") return <div key={i} style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}><div style={{ background: "linear-gradient(135deg,#e887b0,#c86dd0)", color: "#fff", padding: "8px 14px", borderRadius: "14px 14px 3px 14px", maxWidth: "80%", fontSize: 12, lineHeight: 1.6, wordBreak: "break-word" }}>{msg.content}</div></div>;
            const sb = msg.content.match(/╔[\s\S]*?╚[═─]+╝/);
            if (sb) { let af = msg.content.slice(msg.content.indexOf(sb[0]) + sb[0].length); af = af.replace(/\n?[ABCD][.、．]\s*.+/g, '').trim(); return <div key={i} style={{ marginBottom: 14 }}><div style={{ background: "rgba(20,8,28,.95)", border: "1px solid rgba(232,135,176,.3)", borderRadius: 10, padding: "10px 12px", marginBottom: 8, fontFamily: "'Courier New',monospace", fontSize: 10, color: "#d0a8c0", lineHeight: 1.8, whiteSpace: "pre-wrap" }}>{sb[0]}</div>{af && <div style={{ background: "rgba(255,255,255,.03)", border: "1px solid rgba(232,120,176,.15)", borderRadius: "3px 14px 14px 14px", padding: "12px 14px", fontSize: 13, lineHeight: 1.8, whiteSpace: "pre-wrap", color: "#f0dce8" }}>{af}</div>}</div>; }
            return <div key={i} style={{ marginBottom: 14 }}><div style={{ background: "rgba(255,255,255,.03)", border: "1px solid rgba(232,120,176,.15)", borderRadius: "3px 14px 14px 14px", padding: "12px 14px", fontSize: 13, lineHeight: 1.8, whiteSpace: "pre-wrap", color: "#f0dce8" }}>{msg.content}</div></div>;
          })}
          {loading && <div style={{ display: "flex", gap: 4, padding: 8, alignItems: "center" }}>{[0, 1, 2].map(i => <div key={i} style={{ width: 4, height: 4, borderRadius: "50%", background: "#e887b0", animation: `blink 1.2s ${i * .2}s infinite` }} />)}<span style={{ fontSize: 10, color: "#a07090", marginLeft: 2 }}>剧情推进中...</span></div>}
          <div ref={bottomRef} />
        </div>

        {/* 选项区 */}
        {quickOptions.length > 0 && !loading && <div style={{ padding: "5px 8px", display: "flex", flexWrap: "wrap", gap: 4, borderTop: "1px solid rgba(232,120,176,.08)", background: "rgba(6,2,10,.85)", flexShrink: 0 }}>{quickOptions.map(opt => <button key={opt.letter} onClick={() => sendMessage(opt.letter + ". " + opt.text)} style={{ padding: "5px 10px", borderRadius: 12, border: "1px solid rgba(232,120,176,.25)", background: "rgba(232,135,176,.08)", color: "#f0dce8", fontSize: 11, cursor: "pointer", animation: "slideUp .25s ease", textAlign: "left" }}><span style={{ color: "#e887b0", fontWeight: 700 }}>{opt.letter}.</span> {opt.text}</button>)}</div>}

        {/* 输入区 */}
        <div style={{ padding: "6px 8px", background: "rgba(6,2,10,.96)", borderTop: "1px solid rgba(232,120,176,.12)", display: "flex", gap: 5, alignItems: "flex-end", flexShrink: 0 }}>
          <textarea ref={inputRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); } }} placeholder="输入行动或对话...(Enter发送)" disabled={loading} rows={1} style={{ flex: 1, padding: "8px 12px", borderRadius: 12, background: "rgba(255,255,255,.05)", border: "1px solid rgba(232,120,176,.18)", color: "#f5e6ef", fontSize: 12, outline: "none", resize: "none", fontFamily: "inherit", lineHeight: 1.4, maxHeight: 70, overflowY: "auto" }} />
          <button onClick={() => sendMessage(input)} disabled={!input.trim() || loading} style={{ width: 34, height: 34, borderRadius: "50%", border: "none", background: input.trim() && !loading ? "linear-gradient(135deg,#e887b0,#c86dd0)" : "rgba(255,255,255,.08)", color: "#fff", fontSize: 14, cursor: input.trim() && !loading ? "pointer" : "not-allowed", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>↑</button>
        </div>

        {/* 覆盖层：存档管理 */}
        {overlay?.type === "save" && <SaveOverlay stats={stats} member={displayTopMember} form={form} messages={messages} socialFeeds={socialFeeds} kktMessages={kktMessages} kktUnlocked={kktUnlocked} memory={memoryRef.current} onLoad={loadSave} onClose={() => setOverlay(null)} />}

        {/* 社媒覆盖层 (占位，保持原有组件) */}
        {overlay?.type === "bubble" && <BubbleOverlay memberId={overlay.memberId} members={members} socialFeeds={socialFeeds} allTargetMembers={allTargetMembers} kktUnlocked={kktUnlocked} onClose={() => setOverlay(null)} />}
        {overlay?.type === "instagram" && <InstagramOverlay memberId={overlay.memberId} members={members} socialFeeds={socialFeeds} allTargetMembers={allTargetMembers} onClose={() => setOverlay(null)} />}
        {overlay?.type === "weverse" && <WeverseOverlay memberId={overlay.memberId} members={members} socialFeeds={socialFeeds} allTargetMembers={allTargetMembers} onClose={() => setOverlay(null)} />}
        {overlay?.type === "kakao" && <KakaoOverlay memberId={overlay.memberId} members={members} kktMessages={kktMessages} kktUnlocked={kktUnlocked} allTargetMembers={allTargetMembers} onClose={() => setOverlay(null)} />}
      </div>
    </div>
  );
}

// ============================================================
// 存档覆盖层 (含覆盖保存 + 删除) SaveOverlay
// ============================================================

// ============================================================
// 社媒覆盖层 (Platforms)
// ============================================================