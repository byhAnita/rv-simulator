import { createInitialStats, executeRound, popPendingSocial, resetPendingSocial } from "./agent/mainAgent";
import { stageNameIn, getStageColor, getStageIdx } from "./config/stageConfig";
import { useTranslation } from "./i18n";
import { useState, useRef, useEffect } from "react";
import { loadGroupConfig, loadGroupIndex } from "./rag/groupLoader";
import { loadWorld, loadWorldIndex, DEFAULT_WORLD_ID, MODE_IDS, resolveStoryMode, resolveKoreanParticles } from "./rag/worldLoader";
import { resolveRoster, buildClassicRoster, DEFAULT_CAST_NAME, orgNameFor } from "./rag/rosterResolver";
import { migrateSave, correctBirthYear } from "./rag/saveMigrator";
import { createEmptyMemory, isLegacyMemory } from "./agent/memoryPool";
import { getTopMember } from "./agent/memoryPool";
import { MODEL_CONFIGS, ALIYUN_PAID_MODELS, ALIYUN_TOKEN_PLAN_SUPPORTED, ALIYUN_TOKEN_PLAN_URL } from "./config/modelConfigs";
import { getFreeRouteStatus, resolvePaidModel, resetFreeRoute } from "./tools/aliyunRoute";
import { KKT_THRESHOLD, MAIN_INITIAL_AFFECTION, SUB_INITIAL_AFFECTION_MIN, SUB_INITIAL_AFFECTION_MAX, GAME_YEAR, PLAYER_BIRTH_YEAR_MIN, PLAYER_BIRTH_YEAR_MAX, validPlayerBirthYear } from "./config/constants";
import { STORAGE_KEYS, loadFromStorage, saveToStorage, nowTime } from "./utils";
import { checkRelationshipEvents } from "./config/relationshipEvents";
import { checkAchievement } from "./config/achievements";
import BubbleOverlay from "./platforms/BubbleOverlay";
import InstagramOverlay from "./platforms/InstagramOverlay";
import WeverseOverlay from "./platforms/WeverseOverlay";
import KakaoOverlay from "./platforms/KakaoOverlay";
import SaveOverlay from "./platforms/SaveOverlay";
import MapOverlay from "./platforms/MapOverlay";
import { platformsOf } from "./config/platformConfig";
import HelpOverlay from "./platforms/HelpOverlay";
import UsagePanel from "./platforms/UsagePanel";
import RosterBuilder from "./platforms/RosterBuilder";
import DebugPanel from "./platforms/DebugPanel";
import MemberFace from "./platforms/memberFace";
import YearWheel, { DEFAULT_YEAR } from "./platforms/YearWheel";
import { loadPhotos, loadWalls } from "./utils/imageStore";
import { debugEnabled } from "./tools/debugConsole";

// Normalises a player choice before it reaches the prompt: fullwidth dashes and
// brackets confuse the JSON schema, control characters break it outright.
// Shared by typing a choice and editing one, so both behave identically.
const sanitizeChoice = (text) =>
  text.replace(/——/g, '--').replace(/[【】「」『』]/g, '').replace(/[“”〝〞]/g, '"')
    .replace(/​/g, '').replace(/[\x00-\x1F\x7F]/g, '').trim().substring(0, 300);

// The story prose inside an assistant message, without the stats box or any
// trailing option lines — i.e. exactly what the player sees, which is what the
// editor must be seeded with and what gets written back.
const STATS_BOX_RE = /╔[\s\S]*?╚[═─]+╝/;
const storyPartOf = (content) => {
  const sb = content.match(STATS_BOX_RE);
  const body = sb ? content.slice(content.indexOf(sb[0]) + sb[0].length) : content;
  return body.replace(/\n?[ABCD][.、．]\s*.+/g, "").trim();
};

// The identity list is the WORLD's (`world.identities`), plus this one id. `H` is
// the app's escape hatch — the player typing her own — so no world declares it and
// every world has it; `formForRound` branches on the literal.
//
// `IDENTITIES` used to live here: eight `{id, label}` rows whose label equalled its
// id, which read as an id-to-label mapping and was an identity function. Localizing
// those labels is the obvious next edit and would have emptied the identity
// background and the work title out of every real game, because
// `getIdentity(world, "Chaebol")` finds nothing. Deleted in v1.4.1 step 3 rather
// than guarded — the second coupling this release deletes after `PACES`.
const CUSTOM_IDENTITY_ID = "H";
const STAR_LEVELS = ["资深粉丝", "普通韩娱瓜众", "纯路人", "已脱粉"];

// The rule itself is `resolveStoryMode` in worldLoader.js, pure and tested. This
// is the one place that reads the key, so the two callers - App init and loadSave
// - cannot drift into two different answers about where the value comes from.
const seededStoryMode = (legacyPace) =>
  resolveStoryMode(loadFromStorage("rv_sim_story_mode"), legacyPace);

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
    // `chapter` is an internal token — start / develop / climax / resolve — and it
    // was rendered raw, so a Chinese player read `🎭: [start]` in the box she sees
    // every single round, beside four fields that all carry a localized label.
    `🎭: [${t.stats.chapters?.[stats.chapter] || t.stats.chapters?.start || stats.chapter || "start"}]`,
    subLines,
    "╚══════════════════════════════╝",
  ].filter(Boolean).join("\n");
  // `filter(Boolean)` is load-bearing twice over. A solo run has no sub members, and
  // the empty string left in its place put a BLANK LINE inside the box — which split
  // the box into two `\n\n` paragraphs, and `extractStoryText` only drops paragraphs
  // beginning with `╔`. So every exported round of a solo game carried a stray
  // `╚══════════════════════════════╝`. Same class as the blank line in section 6
  // of the prompt: an absent value rendered as an empty line rather than as nothing.
}

// The player's birth year, its bounds and its one validator now live in
// config/constants.js: the year is written in two places — at Setup, and by the
// in-game correction a migrated save needs — and a second copy of the range is
// how the two start disagreeing about what a legal year is.
const validBirthYear = validPlayerBirthYear;

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
  const [aliyunMode, setAliyunMode] = useState(() => loadFromStorage(STORAGE_KEYS.ALIYUN_MODE) === "paid" ? "paid" : "free");
  // rv_sim_qwen_submodel is the legacy 3-sub-model key; read once to seed the paid pick.
  const [aliyunPaidModel, setAliyunPaidModel] = useState(() => resolvePaidModel(loadFromStorage(STORAGE_KEYS.ALIYUN_PAID_MODEL) || loadFromStorage("rv_sim_qwen_submodel")));
  const [form, setForm] = useState({ mainMember: null, subMembers: [], identity: "", customIdentity: "", name: "", nationality: "", birthYear: "", age: "", nickname: "", herNickname: "", starLevel: "", pace: "" });
  const [messages, setMessages] = useState([]);
  // Index of the message being edited (choice or story), and its draft text.
  // Bumped after resetFreeRoute so the key page re-reads route state.
  const [routeVersion, setRouteVersion] = useState(0);
  const [paidListOpen, setPaidListOpen] = useState(false);
  const [editingIdx, setEditingIdx] = useState(null);
  const [editDraft, setEditDraft] = useState("");
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [groupConfig, setGroupConfig] = useState(null);
  // The setting the cast lives in: identities, story-mode rules, phase beats,
  // places and the address register. Chosen on Setup since v1.4.1 step 3, and
  // recorded on the roster — which is what lets a save be loaded back into the
  // world it was played in rather than whichever one is selected now.
  const [world, setWorld] = useState(null);
  // The picker's rows. `index.json` is the lazy-load boundary: no world document
  // is fetched until one is chosen, so adding three worlds in step 7 adds three
  // rows and no code.
  const [worldList, setWorldList] = useState([]);
  const [selectedWorld, setSelectedWorld] = useState(() =>
    loadFromStorage("rv_sim_world") || DEFAULT_WORLD_ID);
  // Who is in THIS run, and in what slot. Set when a game starts and when one
  // is loaded; it is the thing a save records, and from v1.4.1 the thing the
  // roster builder produces directly. Null outside a game: at Setup there is no
  // main member yet, so `members` there is the palette to choose from rather
  // than a cast that has been chosen.
  const [roster, setRoster] = useState(null);
  // Which door the player came through. Session state, never persisted: the
  // classic door is the default every time the app opens, and a remembered
  // "custom" would drop a returning player into a builder they did not ask for.
  const [door, setDoor] = useState("classic");
  // The roster the builder produced, before a game exists. It is what makes the
  // custom door reach Setup with a cast already chosen, so Setup asks only for
  // identity, name, birth year and pace — the main/sub pickers are the builder's
  // job and are hidden there. Null on the classic door, where startNewGame
  // composes a roster from the group and the form instead.
  const [pendingRoster, setPendingRoster] = useState(null);
  // What the custom cast is called. Kept OUT of pendingRoster on purpose: the
  // effect that resolves that roster depends on it, so folding the name in would
  // re-resolve the whole cast on every keystroke. It is applied once, when the
  // game starts, which is also the last moment it can change without moving the
  // static prompt under a game in progress.
  const [castName, setCastName] = useState("");
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
  // Her face, in the game. The store shipped in step 6 and NOTHING HERE READ IT
  // for a whole step: the uploader worked, the roster builder showed the result,
  // and every surface in the running game still drew `emoji` over a gradient.
  // A feature finished on one side of a boundary and connected to nothing on the
  // other reads as a broken control, which is how it was reported.
  //
  // Re-read on entering the game rather than only at mount: the roster builder
  // writes to localStorage synchronously, so a photo added while choosing the
  // cast must be on screen in the game that starts immediately after.
  const [castPhotos, setCastPhotos] = useState(() => loadPhotos());
  const [castWalls, setCastWalls] = useState(() => loadWalls());
  const refreshCastImages = () => { setCastPhotos(loadPhotos()); setCastWalls(loadWalls()); };
  // On the phase rather than in startNewGame and loadSave, because that is a
  // two-entry list somebody has to remember to extend. Every route into the game
  // passes through here.
  useEffect(() => { if (phase === "game") refreshCastImages(); }, [phase]);
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
  // The on-device console. Enabled by ?debug=1 and then persisted, so a PWA
  // launched from the home screen - which has no address bar to retype a query
  // string into - keeps it across reloads. Read once: it must not flip
  // mid-session and unmount the panel someone is reading.
  const [debugOn] = useState(() => debugEnabled());
  const [showDebug, setShowDebug] = useState(false);
  const [timeSpeed, setTimeSpeed] = useState(() => loadFromStorage("rv_sim_timespeed") || "default");
  // Seeded from the newest save slot's pace so the panel shows something true
  // before anything is loaded; loadSave re-seeds from the slot actually being
  // played and persists it, which is the point at which "she has never set one"
  // stops being true. Same shape as rv_sim_qwen_submodel seeding the paid model:
  // read the legacy value, write the new key, never write the legacy one again.
  const [storyMode, setStoryMode] = useState(() =>
    seededStoryMode(loadFromStorage(STORAGE_KEYS.SAVES)?.[0]?.form?.pace));
  const [fontScale, setFontScale] = useState(() => Number(loadFromStorage("rv_sim_fontscale")) || 1);
  const [exportOpen, setExportOpen] = useState(false);

  const mainMember = members.find(m => m.id === form.mainMember);
  const subMembersList = (form.subMembers || []).map(id => members.find(m => m.id === id)).filter(Boolean);
  const allTargetMembers = [mainMember, ...subMembersList].filter(Boolean);
  // `npcMembers` stood here, deriving "everyone not chosen" into a local that
  // nothing read — dead since before the roster existed. NPC identity now comes
  // from the roster: buildSystemPrompt takes `members` minus main minus subs,
  // and under a roster `members` IS the roster's cast, in its order, so the
  // slots it names are the slots the prompt renders. getNpcMembers survives in
  // groupLoader as the equivalence anchor smoke measures migration against.

  // `age` is written here and never again. It is not a second source of truth —
  // the prompt renders the age from the birth year — but backstorySeed hashes
  // it, and that seed must stay frozen for the life of a save or the identity
  // backstory re-rolls under a player mid-game — the drift that seed exists to
  // stop. (No version string in this comment on purpose: `npm run bump`
  // rewrites every `v<x.y.z>` in this file and smoke Layer C counts them.)
  const setBirthYear = (v) => setForm(f => ({
    ...f, birthYear: v, age: validBirthYear(v) ? String(GAME_YEAR - parseInt(v)) : "",
  }));

  // The correction, mid-run, for a save whose birth year was never stated —
  // migration derives it as GAME_YEAR - age and that is wrong for about half of
  // all legacy saves. Deliberately NOT setBirthYear: `correctBirthYear` leaves
  // `age` alone, for the reason written above it.
  //
  // `birthYearEstimated` is session state and not a save field. loadSave knows
  // something the migrated save no longer does — whether the year was present
  // before the migration filled it — and that is worth one line of explanation
  // in the panel, not a field that would then have to be cleared.
  const [birthYearDraft, setBirthYearDraft] = useState("");
  const [birthYearEstimated, setBirthYearEstimated] = useState(false);
  const birthYearDraftValid = validBirthYear(birthYearDraft);
  const applyBirthYearCorrection = () => {
    if (!birthYearDraftValid) return;
    const next = correctBirthYear(form, birthYearDraft);
    // Identity means the year did not move, so nothing was invalidated and
    // there is nothing to announce. She has still stated it, which is what
    // retires the estimate notice.
    if (next !== form) {
      setForm(next);
      showNotif(t.settings?.birthYearSaved || "Birth year updated");
    }
    setBirthYearEstimated(false);
  };

  useEffect(() => {
    loadGroupIndex().then(list => {
      setGroupList(list);
      if (selectedGroup && !list.find(g => g.id === selectedGroup)) setSelectedGroup(null);
    }).catch(console.error);
  }, []);

  // Same shape as the group index, and the same correction: a remembered id that
  // the index no longer carries falls back to the default rather than being left
  // pointing at a world that cannot be fetched.
  useEffect(() => {
    loadWorldIndex().then(list => {
      setWorldList(list);
      if (!list.find(w => w.id === selectedWorld)) setSelectedWorld(DEFAULT_WORLD_ID);
    }).catch(console.error);
  }, []);

  useEffect(() => { phaseRef.current = phase; }, [phase]);

  // Reloads on language change, like the group config: the world file is
  // per-language and carries the identity backgrounds the prompt renders.
  //
  // A world SWITCH drops the loaded world first, because the identity grid is its
  // option list and Setup's gate needs `world` — so the player is offered nothing
  // to start with rather than the previous world's identities while the new file
  // is in flight. In game the effect only ever re-fetches the SAME world in a new
  // language, and dropping it there would hand `executeRound` a null world if she
  // tapped an option inside that window.
  useEffect(() => {
    let live = true;
    if (phaseRef.current !== "game") setWorld(w => (w && w.id !== selectedWorld ? null : w));
    loadWorld(selectedWorld, language).then(w => {
      if (!live) return;   // a second switch already won; a stale world must not land
      setWorld(w);
      saveToStorage("rv_sim_world", selectedWorld);
    }).catch(console.error);
    return () => { live = false; };
  }, [selectedWorld, language]);

  // A world owns its identity list, so a switch can leave `form.identity` holding
  // an id the new world never declares — which renders no background and no work
  // title while still looking chosen, the empty-value class of defect.
  //
  // Keyed on the world that actually LOADED, not on the picker's click: the file is
  // what declares the list, so the file is what decides. And cleared only when the
  // id is genuinely absent, which is the whole point of `主线成员前女友` keeping
  // one id across every world — a route every world has must survive the switch.
  useEffect(() => {
    if (!world || phaseRef.current === "game") return;
    setForm(f => (!f.identity || f.identity === CUSTOM_IDENTITY_ID
      || world.identities.some(i => i.id === f.identity)
      ? f
      : { ...f, identity: "", customIdentity: "" }));
  }, [world]);

  // Two doors, one engine. At Setup this loads a group as a PALETTE to choose
  // from; in game the roster is authoritative and says who was actually chosen,
  // which from v1.4.1 can span groups in a way a single group load cannot
  // express. Language is what changes underneath either, so both paths re-fetch
  // rather than leaving the cast in the previous language.
  //
  // `roster` is deliberately not a dependency. It is set in the same batch as
  // `selectedGroup` when a save is loaded, so this already sees it; adding it
  // would additionally re-resolve on every new game, for a cast startNewGame
  // has in hand.
  // `world` is a dependency because section 4's cast framing is the world's since
  // v1.4.1 step 4 - `castLore`, `useGroupLore` and `useRole` all decide what the
  // resolved `groupConfig.groupLore` says. It can be null for the width of a world
  // fetch, and resolving against a missing world would throw rather than compose.
  useEffect(() => {
    if (!world) return;
    if (phaseRef.current === "game" && roster) {
      resolveRoster(roster, language, world).then(r => {
        setGroupConfig(r.groupConfig);
        setMembers(r.members);
      }).catch(console.error);
      return;
    }
    // The custom door owns `members` before the game starts, and this effect
    // would otherwise overwrite the builder's cast with whichever group happens
    // to still be selected from a previous classic run. The group id is kept
    // written through, because it is what the cover's classic door restores.
    if (pendingRoster) {
      if (selectedGroup) saveToStorage("rv_sim_group", selectedGroup);
      return;
    }
    if (!selectedGroup) return;
    loadGroupConfig(selectedGroup, language).then(config => {
      setGroupConfig(config);
      setMembers(config.members);
      if (phaseRef.current !== "game") {
        setForm(f => ({ ...f, mainMember: null, subMembers: [] }));
      }
      saveToStorage("rv_sim_group", selectedGroup);
    }).catch(console.error);
  }, [selectedGroup, language, pendingRoster, world]);

  // The custom door, resolved once so Setup sees exactly the `members` shape the
  // classic door gets from a group load. Deriving form.mainMember/subMembers from
  // the roster's own slots is what lets everything downstream — mainMember,
  // allTargetMembers, createInitialStats, the stats bar — stay untouched: they
  // read the form, and the form now agrees with the builder.
  useEffect(() => {
    if (!pendingRoster || phaseRef.current === "game" || !world) return;
    resolveRoster(pendingRoster, language, world).then(r => {
      setGroupConfig(r.groupConfig);
      setMembers(r.members);
      setForm(f => ({ ...f, mainMember: r.mainId, subMembers: r.subIds }));
    }).catch(e => {
      // A roster that cannot be resolved must say so rather than fall back to a
      // default cast — the v1.3.5 lesson, where loadGroupIndex's catch returning
      // a hardcoded Red Velvet entry hid a path bug for a whole release.
      console.error("roster resolve failed:", e);
      setPendingRoster(null);
      setPhase("cover");
      showNotif(t.common.startFailed + " " + (e?.message || ""), "error");
    });
  }, [pendingRoster, language, world]);

  useEffect(() => { if (bottomRef.current) bottomRef.current.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);

  const showNotif = (msg, type = "info") => { setNotification({ msg, type }); setTimeout(() => setNotification(null), 3000); };
  const saveApiKey = (key) => {
    const k = key.trim();
    if (selectedModel === "qwen" && k.startsWith("sk-sp-")) { showNotif(t.errors.token_plan_key, "error"); return false; }
    setApiKey(k);
    if (k) { saveToStorage(STORAGE_KEYS.API_KEY, k); showNotif("Key saved"); }
    return !!k;
  };
  const handleModelSelect = (id) => { setSelectedModel(id); saveToStorage(STORAGE_KEYS.SELECTED_MODEL, id); showNotif("Switched to " + MODEL_CONFIGS[id]?.name); };
  const handleAliyunModeSelect = (mode) => { setAliyunMode(mode); saveToStorage(STORAGE_KEYS.ALIYUN_MODE, mode); };
  const handleAliyunPaidModelSelect = (id) => { setAliyunPaidModel(id); saveToStorage(STORAGE_KEYS.ALIYUN_PAID_MODEL, id); };
  // The form as `executeRound` must receive it. `form.identity` holds a stored id,
  // and "H" is the escape hatch meaning "the player typed her own" — so the id has
  // to be resolved before the prompt sees it.
  //
  // This is ONE function because it used to be four copies of one expression, and
  // the fourth had drifted: the epilogue call site omitted the "H" branch, so a
  // player who wrote her own identity reached the ending — the single round the whole
  // run builds toward — with the literal placeholder "[自定义]" where her words
  // should be. Smoke now counts executeRound call sites against uses of this helper.
  const formForRound = () => ({
    ...form,
    identity: form.identity === CUSTOM_IDENTITY_ID
      ? (form.customIdentity || "Custom")
      : form.identity,
  });

  const aliyunOptions = () => selectedModel === "qwen"
    ? {
      mode: aliyunMode, paidModel: aliyunPaidModel,
      onModelSwitch: ({ to }) => showNotif(t.aliyun.switched.replace("{model}", to)),
      // Fires before each attempt after the first, so a walk is visible rather
      // than looking like the game has hung.
      onRouteStep: ({ model }) => showNotif(t.aliyun.trying.replace("{model}", model)),
    }
    : null;
  // One short localized line for the story panel; raw details stay in the console.
  const llmErrorNotice = (e) => {
    console.error("[round] failed:", e?.kind, e?.code, e?.message, e);
    return t.errors?.[e?.kind] || t.errors?.unknown || String(e?.message);
  };

  const hasSaves = () => (loadFromStorage(STORAGE_KEYS.SAVES) || []).length > 0;

  // Error notices are tagged `error: true` so they never land in an exported
  // story or a save slot — they are UI feedback, not narrative.
  const storyMessages = (list) => list.filter(m => !m.error);

  // The exportable story, once. This was TWO copies of the same filter — one here for
  // clipboard and TXT, one inside exportPdf — and they had already drifted apart:
  //
  //   - the PDF copy filtered only `!m.hidden`, so it carried error notices into the
  //     exported story, which the comment three lines above says never happens;
  //   - and it numbered its rounds off a different filter, so a run containing one
  //     error notice numbered the same round differently in TXT and in PDF;
  //   - and the `╚` fix below reached one of the two.
  //
  // The guard in smoke.mjs was written against this copy and could not see any of it.
  //
  // `╚` as well as `╔`: the box is one paragraph only while it contains no blank line,
  // and a solo run's box contained one for as long as the sub-member line was rendered
  // empty — so the bottom border survived into every exported round. That is fixed at
  // the source in buildStatsBox; this stays because the filter is the thing that
  // breaks silently when the box format moves.
  const storyRounds = () => messages
    .filter(m => m.role === "assistant" && !m.hidden && !m.error)
    .map((m, i) => ({
      n: i + 1,
      text: m.content.split("\n\n")
        .filter(p => !p.startsWith("╔") && !p.startsWith("╚") && !/^[A-D]\.\s/.test(p))
        .join("\n\n").trim(),
    }));

  const extractStoryText = () =>
    storyRounds().map(r => `=== Round ${r.n} ===\n${r.text}`).join("\n\n---\n\n");

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

    const rounds = storyRounds();

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
    // Two doors, one roster. The custom door already built one and it is
    // authoritative — rebuilding it from the form would throw away the NPC slots
    // the player assigned and flatten a cross-group cast into a single group.
    // The classic door composes one here instead: member order comes from the
    // loaded group because that is the order profiles appear in the prompt, and
    // the same cast in a different order is the same game and a total cache miss.
    // Built rather than resolved, because `members` is already the answer
    // resolveRoster would fetch, and smoke asserts the two doors agree byte for
    // byte.
    setRoster((pendingRoster && { ...pendingRoster, name: castName.trim() || DEFAULT_CAST_NAME })
      || buildClassicRoster(
      selectedGroup, mainId, subIds, members.map(m => m.id), world?.id || DEFAULT_WORLD_ID));
    setMessages([]); setCurrentOptions([]); setActiveNotifications([]);
    // A new game states its birth year at Setup, so nothing here is an estimate.
    setBirthYearEstimated(false);
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
        form: formForRound(),
        members, mainId, subIds, groupConfig, world, apiKey, selectedModel, kktUnlocked: {}, language,
        aliyun: aliyunOptions(), timeSpeed, storyMode,
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
      setMessages([{ role: "assistant", content: llmErrorNotice(e), error: true }]);
    }
    setLoading(false);
  };

  const loadSave = async (save) => {
    if (!save) return;

    // Everything that can fail happens BEFORE any state is set. A save slot
    // carries no group id before v1.4.0, so identifying its cast means fetching
    // the library — and a half-applied load would leave the player in a game
    // assembled from two different saves.
    // The save's OWN world is fetched here rather than read off `world` state,
    // which still holds the world the player was last looking at - and since
    // v1.4.1 step 4 the world decides what section 4 says about this cast, so
    // resolving a chaebol save against the idol world would describe a family
    // compound as a group under an Entertainment agency. It is a fetch, so it can
    // fail, which is exactly why it belongs inside this try: every fallible step
    // completes before the first setter runs.
    let migrated, resolved, saveWorld;
    try {
      migrated = await migrateSave(save, language, { preferGroupId: selectedGroup });
      saveWorld = await loadWorld(migrated.worldId, language);
      resolved = await resolveRoster(migrated.roster, language, saveWorld);
      if (!resolved.members.length) throw new Error("roster resolved to an empty cast");
    } catch (e) {
      // Loudly, and without touching the current game. A roster that cannot be
      // resolved must say so: loadGroupIndex's catch returns a hardcoded Red
      // Velvet entry, and falling into it here would silently recast somebody's
      // save. See docs/V140_PLAN.md §9.3.
      console.error("[loadSave] could not resolve this save's cast:", e);
      showNotif("This save's cast could not be loaded", "error");
      return;
    }

    // Drop the previous game's pre-round snapshot. Without this, ↺ Retry and the
    // ✎ edit controls would appear straight away on the loaded save's last
    // message and restore the *other* game's stats and memory into it. It also
    // gives the intended gating: no retry or edit until a round is played here.
    preRoundSnapshotRef.current = null;
    resetPendingSocial();

    // The pace this save was built with becomes its story mode, once, for a
    // player who has never set one. It is a live SETTING and not a save field,
    // so this is a seed rather than a migration: persisting it here is what
    // makes "never set one" false from now on, and Settings owns it afterwards.
    const seeded = seededStoryMode(migrated.form?.pace);
    setStoryMode(seeded);
    saveToStorage("rv_sim_story_mode", seeded);

    // Set before setSelectedGroup, and deliberately not through setPhase: the
    // effect that mirrors phase into phaseRef has not run yet, and the group
    // effect reads phaseRef to decide whether to clear the chosen members. From
    // the cover page it would still read "cover" and wipe the cast we just
    // resolved.
    phaseRef.current = "game";
    // The pre-existing bug this closes: loadSave never set the group, so
    // loading a TWICE save while Red Velvet was selected produced Red Velvet's
    // config with TWICE member ids in `form` — no crash, just a prompt whose
    // main member was undefined.
    setSelectedGroup(migrated.groupId);
    // ...and the world, for exactly the reason one line up. A save records its
    // `worldId`, and playing it in whichever world happens to be selected would
    // hand it another world's identities, phase beats and address register — the
    // same bug as a TWICE save loaded under Red Velvet's config, one field over.
    // After `phaseRef` is pinned to "game", so the identity effect cannot clear an
    // identity this save legitimately holds.
    setSelectedWorld(migrated.worldId);
    // ...and the already-fetched object is applied directly, not left to the load
    // effect. That effect keeps the PREVIOUS world in place while it fetches when
    // the phase is "game", so a round played in the gap would be built against the
    // world the player was last looking at. It cost a fetch above; spending it is
    // the whole reason it was made fallible there rather than here.
    setWorld(saveWorld);
    // A save carries its own roster and that one is authoritative. Leaving the
    // builder's behind would make a later New Game silently prefer it over the
    // group the player picked.
    setPendingRoster(null); setDoor("classic");
    setRoster(migrated.roster);
    setGroupConfig(resolved.groupConfig);
    setMembers(resolved.members);
    setForm(migrated.form);
    // Read BEFORE the migrated form replaces it: a slot that carried no birth
    // year of its own is now carrying one derived from age, which is wrong for
    // about half of those saves and cannot be recovered from the save. The
    // settings panel says so until she states a year. See saveMigrator.js.
    setBirthYearEstimated(!save.form?.birthYear && Boolean(migrated.form?.birthYear));
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

  // Tapping a place submits an ordinary choice, which is what makes the picker free:
  // no schema field, no tail entry, no second input per round (docs/V140_PLAN.md 7.1).
  // The sentence is a per-language TEMPLATE from i18n, and ko's carries the 으로/로 pair
  // for resolveKoreanParticles to pick - the word in front of a Korean particle is a
  // variable here, which is the whole reason that function exists. It is inert on zh
  // and en, which carry no pair.
  const placeChoiceText = (place) =>
    resolveKoreanParticles(t.map.go.replace("{place}", place));

  const sendMessage = async (text) => {
    if (!text.trim() || loading) return;
    // An open editor indexes into `messages`; appending to it would leave the
    // draft pointing at the wrong turn.
    cancelEdit();
    const cleanText = sanitizeChoice(text);
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
        form: formForRound(),
        members, mainId: form.mainMember, subIds: form.subMembers || [],
        groupConfig, world, apiKey, selectedModel, kktUnlocked, language, reasoningEnabled,
        aliyun: aliyunOptions(), timeSpeed, storyMode,
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
      setMessages(p => [...p, { role: "assistant", content: llmErrorNotice(e), error: true }]);
    }
    setLoading(false);
  };

  const copyStory = (content) => {
    const sb = content.match(/╔[\s\S]*?╚[═─]+╝/);
    let text = sb ? content.slice(content.indexOf(sb[0]) + sb[0].length) : content;
    text = text.replace(/\n?[ABCD][.、．]\s*.+/g, '').trim();
    navigator.clipboard.writeText(text).then(() => { setCopiedStory(true); setTimeout(() => setCopiedStory(false), 2000); });
  };

  // --- Edit controls -------------------------------------------------------
  // Only the newest turn is editable, and only once a round has been generated
  // in this session (preRoundSnapshotRef). After loading a save there is nothing
  // to edit until the player plays, which keeps edits away from history entries
  // this session did not create.
  const MAX_STORY_EDIT_CHARS = 4000;

  const beginEdit = (idx, text) => { setEditingIdx(idx); setEditDraft(text); };
  const cancelEdit = () => { setEditingIdx(null); setEditDraft(""); };

  // Replacing the choice re-runs the round; there is no branch history, the old
  // selection is simply gone.
  const saveChoiceEdit = async () => {
    const text = editDraft.trim();
    const idx = editingIdx;
    cancelEdit();
    if (!text || idx == null) return;
    const cleanText = sanitizeChoice(text);
    setMessages(p => p.map((m, i) => (i === idx ? { ...m, content: cleanText } : m)));
    await regenerateRound(cleanText);
  };

  // Editing the story rewrites what the player sees AND what the model will read
  // next round. Both writes are required or the two silently diverge.
  const saveStoryEdit = () => {
    const idx = editingIdx;
    const edited = editDraft.trim().slice(0, MAX_STORY_EDIT_CHARS);
    cancelEdit();
    if (!edited || idx == null) return;
    setMessages(p => p.map((m, i) => {
      if (i !== idx) return m;
      const sb = m.content.match(/╔[\s\S]*?╚[═─]+╝/);
      return { ...m, content: sb ? `${sb[0]}\n\n${edited}` : edited };
    }));
    const entry = memoryRef.current?.history?.at(-1);
    // Keep the original English summary: it is the collapse target, and a
    // truncated slice of the edited text would be a worse one. keepFull is what
    // makes that safe — the next round's collapse runs before the ledger is
    // built, so without it an edit made on every third round was replaced by
    // the stale summary and never reached the model at all.
    if (entry && entry.type === "full") { entry.text = edited; entry.keepFull = true; }
    showNotif(t.editSaved || "Saved");
  };

  // No argument = ↺ Retry (same choice). With one = the player edited their
  // choice, so it replaces the snapshot's too, keeping a later ↺ consistent.
  const regenerateRound = async (overrideChoice = null) => {
    const snap = preRoundSnapshotRef.current;
    if (!snap || loading) return;
    if (overrideChoice != null) snap.playerChoice = overrideChoice;
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
        form: formForRound(),
        members, mainId: form.mainMember, subIds: form.subMembers || [],
        groupConfig, world, apiKey, selectedModel, kktUnlocked: snap.kktUnlocked, language, reasoningEnabled,
        aliyun: aliyunOptions(), timeSpeed, storyMode,
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
      setMessages(p => [...p, { role: "assistant", content: llmErrorNotice(e), error: true }]);
    }
    setLoading(false);
  };

  const openSocialPlatform = (platform, memberId = null) => setOverlay({ type: platform, memberId: memberId || form.mainMember });
  const getAffection = (mid) => mid === form.mainMember ? (stats?.affection || 0) : (stats?.multiAff?.[mid] || 0);
  const getStage = (aff) => ({ label: stageNameIn(aff, language), color: getStageColor(aff) });
  const quickOptions = currentOptions.map((opt, i) => {
    const letter = String.fromCharCode(65 + i);
    const text = opt.replace(/^[ABCD][.、．]\s*/, '');
    return { letter, text };
  });
  const hasNotifDot = (platform) => activeNotifications.some(n => n.platform === platform);
  // The top bar's icons are the world's declared platforms, in the world's own order, with
  // the private channel last and gated on the main member's KKT unlock. This was four
  // literals in the JSX, so a world declaring two would still have drawn four buttons - two
  // of them opening an overlay for a platform its story never uses. The world is the SAVE's
  // world (loadSave sets it from migrated.worldId), so a run keeps the platforms it started
  // with even if another world is selected afterwards.
  const platformBar = (() => {
    const { social, private: priv } = platformsOf(world);
    return [
      ...social.map((p) => ({ icon: p.icon, type: p.ui, badge: p.badge, locked: false })),
      ...(priv ? [{ icon: priv.icon, type: priv.ui, badge: priv.badge, locked: !kktUnlocked[form.mainMember] }] : []),
    ];
  })();
  const displayTopMember = topMember || mainMember;
  const topAff = displayTopMember ? getAffection(displayTopMember.id) : 0;
  const stageIdx = getStageIdx(topAff);
  const stageColor = getStageColor(topAff);
  const stageLabel = t.stageNames[stageIdx];
  const [triggeredAchievements, setTriggeredAchievements] = useState(new Set());

  // The fixed chrome: the toast, and the debug console launcher when it is on.
  // Both live here because this is the one element every phase renders — the five
  // pages each return their own tree, so anything that must be reachable from all
  // of them either goes in here or gets pasted five times.
  const NotificationBar = () => (
    <>
      {notification && (
        <div style={{ position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)", background: notification.type === "error" ? "rgba(220,50,50,.92)" : "rgba(50,180,100,.92)", color: "#fff", padding: "8px 20px", borderRadius: 20, fontSize: 12, fontWeight: 600, zIndex: 9999, pointerEvents: "none" }}>{notification.msg}</div>
      )}
      {debugOn && !showDebug && (
        // Bottom-left, above the iOS home indicator and away from every primary
        // action in the app, which all sit bottom-right or centre.
        <button onClick={() => setShowDebug(true)} aria-label="debug console"
          style={{ position: "fixed", left: 10, bottom: "calc(10px + env(safe-area-inset-bottom))", zIndex: 9998, width: 34, height: 34, borderRadius: 17, border: "1px solid rgba(232,135,176,.4)", background: "rgba(20,8,18,.72)", color: "#f8c8d8", fontSize: 14, cursor: "pointer", padding: 0 }}>
          {"⌗"}
        </button>
      )}
      {debugOn && showDebug && (
        <DebugPanel theme={theme} onClose={() => setShowDebug(false)}
          extra={{ phase, language, model: selectedModel, group: selectedGroup,
                   door, hasRoster: Boolean(roster), pendingRoster: Boolean(pendingRoster),
                   members: members.length, round: stats?.week ?? null }} />
      )}
    </>
  );

  // ── Cover Page ──
  if (phase === "cover") {
    const coverTexts = {
      zh: { subtitle: "嫂嫂模拟器", desc: "LLM文游·女团恋爱养成·v1.4.1", newGame: "✨ 开始新游戏", continue: "💾 继续游戏 (读档)", apiKey: "🔑 修改API Key/切换模型" },
      en: { subtitle: "Idol Dating Simulator", desc: "LLM Text Adventure · Idol Dating Sim · v1.4.1", newGame: "✨ New Game", continue: "💾 Continue (Load Save)", apiKey: "🔑 API Key / Model" },
      ko: { subtitle: "아이돌 데이트 시뮬레이터", desc: "LLM 텍스트 어드벤처 · 유리 데이트 시뮬레이터 · v1.4.1", newGame: "✨ 새 게임", continue: "💾 이어하기 (불러오기)", apiKey: "🔑 API 키 / 모델" },
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

          {/* Two doors, one engine (docs/V140_PLAN.md §14.1). Classic is exactly
              today's flow and stays the primary button; the custom door leads to
              the roster builder. Both end at Setup with a roster, so nothing
              downstream knows which one was used. */}
          <button
            onClick={() => {
              if (!selectedGroup) { showNotif(language === "ko" ? "그룹을 선택해주세요" : language === "en" ? "Please select a group" : "请先选择团体", "error"); return; }
              // Leaving a builder roster in place would silently override the
              // group just picked, since startNewGame prefers it.
              setDoor("classic"); setPendingRoster(null);
              if (apiKey?.trim()) setPhase("setup"); else setPhase("keyInput");
            }}
            style={{ padding: "14px 48px", borderRadius: 40, border: "none", cursor: selectedGroup ? "pointer" : "default", background: selectedGroup ? th.accentGrad : th.newGameDisabled, color: selectedGroup ? "#fff" : th.newGameDisabledColor, fontSize: 15, fontWeight: 700, marginBottom: 10 }}>
            {ct.newGame}
          </button>
          <button
            onClick={() => {
              setDoor("custom");
              // The builder's Generate button spends the player's key, so the key
              // page comes first when there is none — §4.5 assumes it exists.
              if (apiKey?.trim()) setPhase("roster"); else setPhase("keyInput");
            }}
            style={{ padding: "11px 30px", borderRadius: 40, border: `1px solid ${th.coverContinueBorder}`, background: "transparent", color: th.coverContinueColor, fontSize: 13, cursor: "pointer", marginBottom: 10 }}>
            {t.cast.customTitle}
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
        {overlay?.type === "save" && <SaveOverlay theme={theme} t={t} stats={stats} member={displayTopMember} form={form} groupId={selectedGroup} roster={roster} messages={storyMessages(messages)} socialFeeds={socialFeeds} kktMessages={kktMessages} kktUnlocked={kktUnlocked} memory={memoryRef.current} triggeredAchievements={triggeredAchievements} onLoad={loadSave} onClose={() => setOverlay(null)} />}
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
      if (i === 1 && MODEL_CONFIGS[selectedModel]?.hasFreeCredits && aliyunMode === "free" && t.guide?.freeStep2) step = t.guide.freeStep2;
      step = step.replace('{prefix}', MODEL_CONFIGS[selectedModel]?.keyPrefix || 'sk-');
      if (step.includes('{platform}') && platformUrl) {
        const [before, after] = step.split('{platform}');
        return (
          <p key={i} style={{ fontSize: 11, color: th.guideText, marginBottom: 2, lineHeight: 1.7 }}>
            {before}<a href={platformUrl} target="_blank" rel="noopener noreferrer" style={{ color: th.accent, textDecoration: "underline" }}>{currentPlatformName}</a>{after}
          </p>
        );
      }
      return <p key={i} style={{ fontSize: 11, color: th.guideText, marginBottom: 2, lineHeight: 1.7 }}>{step}</p>;
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
            {/* One line per provider: the description of whichever is selected
                is shown once below, instead of four descriptions competing. */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5 }}>
              {Object.values(MODEL_CONFIGS).map(c => (
                <div key={c.id} onClick={() => handleModelSelect(c.id)}
                  style={{ padding: "8px 9px", borderRadius: 10, border: `1px solid ${selectedModel === c.id ? c.color : th.border}`, background: selectedModel === c.id ? th.langBtnActiveBg : th.modelCardBg, cursor: "pointer", userSelect: "none", display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
                  <span style={{ fontSize: 13, flexShrink: 0 }}>{c.emoji}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: selectedModel === c.id ? c.color : th.modelCardColor, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</span>
                </div>
              ))}
            </div>
            <p style={{ fontSize: 9, color: th.guideText, marginTop: 5, textAlign: "center" }}>
              {MODEL_CONFIGS[selectedModel]?.desc?.[language]}
            </p>
            {selectedModel === "qwen" && (() => {
              const qc = MODEL_CONFIGS.qwen.color;
              void routeVersion;   // re-read after a manual reset
              const routeStatus = getFreeRouteStatus(apiKey);
              const paid = ALIYUN_PAID_MODELS.find(m => m.id === aliyunPaidModel) || ALIYUN_PAID_MODELS[0];
              return (
                <div style={{ marginTop: 8 }}>
                  {/* Mode switch */}
                  {/* Segmented control: one line each, description below. */}
                  <div style={{ display: "flex", gap: 5 }}>
                    {["free", "paid"].map(mode => (
                      <div key={mode} onClick={() => handleAliyunModeSelect(mode)}
                        style={{ flex: 1, padding: "7px 8px", borderRadius: 8, textAlign: "center", border: `1px solid ${aliyunMode === mode ? qc : th.border}`, background: aliyunMode === mode ? th.langBtnActiveBg : th.subModelCardBg, cursor: "pointer", userSelect: "none" }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: aliyunMode === mode ? qc : th.subModelCardColor }}>{t.aliyun[mode].title}</div>
                      </div>
                    ))}
                  </div>

                  {aliyunMode === "free" ? (
                    <div style={{ marginTop: 6, fontSize: 9, lineHeight: 1.6 }}>
                      {/* Status and reset share a row: the reset must be findable
                          before anything is used up, not only after. */}
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <p style={{ color: th.guideText, flex: 1 }}>{t.aliyun.free.status.replace("{model}", routeStatus.current || "—").replace("{available}", routeStatus.available).replace("{total}", routeStatus.total)}</p>
                        <span onClick={() => { resetFreeRoute(apiKey); setRouteVersion(v => v + 1); showNotif(t.aliyun.resetDone); }}
                          title={t.aliyun.resetHint}
                          style={{ flexShrink: 0, padding: "3px 7px", borderRadius: 7, border: `1px solid ${routeStatus.available < routeStatus.total ? qc : th.border}`, background: th.subModelCardBg, color: routeStatus.available < routeStatus.total ? qc : th.textMuted, fontWeight: 700, cursor: "pointer", userSelect: "none" }}>
                          {t.aliyun.resetBtn}
                        </span>
                      </div>
                      {/* An empty route is a dead end unless we say what to do about it. */}
                      {routeStatus.available === 0 && (
                        <p style={{ color: th.guideWarning, fontWeight: 600, marginTop: 3 }}>{t.aliyun.allUsedUp}</p>
                      )}
                      <p style={{ color: th.guideWarning, fontWeight: 600, marginTop: 3 }}>{t.aliyun.free.stopWarning}</p>
                      {reasoningEnabled && <p style={{ color: th.guideHint }}>{t.aliyun.free.thinkingWarning}</p>}
                    </div>
                  ) : (
                    <div style={{ marginTop: 6 }}>
                      {/* Collapsed to one row; opens into a scrollable panel so
                          nine models cannot push the key field off screen. */}
                      <div onClick={() => setPaidListOpen(o => !o)}
                        style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 10px", borderRadius: 8, border: `1px solid ${paidListOpen ? qc : th.border}`, background: th.subModelCardBg, cursor: "pointer", userSelect: "none" }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: qc, whiteSpace: "nowrap" }}>{paid.name}</span>
                        <span style={{ fontSize: 8, color: th.textMuted, marginLeft: "auto", textAlign: "right", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{paid.desc?.[language]}</span>
                        <span style={{ fontSize: 9, color: th.textMuted, flexShrink: 0, transform: paidListOpen ? "rotate(180deg)" : "none" }}>▾</span>
                      </div>
                      {paidListOpen && (
                        <div style={{ marginTop: 4, border: `1px solid ${th.border}`, borderRadius: 8, overflowY: "auto", maxHeight: 168 }}>
                          {ALIYUN_PAID_MODELS.map((m, i) => {
                            const active = m.id === paid.id;
                            return (
                              <div key={m.id} onClick={() => { handleAliyunPaidModelSelect(m.id); setPaidListOpen(false); }}
                                style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", borderTop: i ? `1px solid ${th.borderDim}` : "none", background: active ? th.langBtnActiveBg : th.subModelCardBg, cursor: "pointer", userSelect: "none" }}>
                                <span style={{ fontSize: 9, color: active ? qc : th.textFaint }}>{active ? "●" : "○"}</span>
                                <span style={{ fontSize: 10, fontWeight: 700, color: active ? qc : th.subModelCardColor, whiteSpace: "nowrap" }}>{m.name}</span>
                                <span style={{ fontSize: 8, color: th.textMuted, marginLeft: "auto", textAlign: "right" }}>{m.desc?.[language]}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      {/* Cost guide for the selected model */}
                      <div style={{ marginTop: 6, padding: "6px 10px", borderRadius: 8, background: th.guideBg, border: `1px solid ${th.borderDim}`, fontSize: 9, lineHeight: 1.6 }}>
                        <p style={{ color: th.guideBilling, fontWeight: 600, fontSize: 11 }}>💰 {paid.name}: {paid.gameplay?.[language]}</p>
                        {paid.peakPricing && <p style={{ color: th.guideHint }}>{t.aliyun.paid.peakNote}</p>}
                        {ALIYUN_TOKEN_PLAN_SUPPORTED && (
                          <p style={{ color: th.guideText }}>{t.aliyun.paid.tokenPlanHint} <a href={ALIYUN_TOKEN_PLAN_URL} target="_blank" rel="noopener noreferrer" style={{ color: th.accent, textDecoration: "underline" }}>Token Plan →</a></p>
                        )}
                        <p style={{ color: th.guideMuted }}>{t.aliyun.paid.keyNote}</p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>

          {/* API Key Guide */}
          <div style={{ width: "100%", marginBottom: 10, padding: "10px 12px", background: th.guideBg, borderRadius: 12, border: `1px solid ${th.borderDim}` }}>
            <p style={{ fontSize: 11, color: th.guideText, fontWeight: 700, marginBottom: 4 }}>{t.guide?.title}</p>
            {(t.guide?.steps || []).map((step, i) => renderGuideStep(step, i))}
            {selectedModel !== "qwen" ? (
              <p style={{ fontSize: 12, color: th.guideBilling, marginTop: 6, fontWeight: 600 }}>{(t.guide?.billing || "").replace("{gameplay}", MODEL_CONFIGS[selectedModel]?.gameplay?.[language] || "")}</p>
            ) : aliyunMode === "free" && (
              // Paid mode shows its cost guide under the model list instead.
              <p style={{ fontSize: 12, color: th.guideBilling, marginTop: 6, fontWeight: 600 }}>{t.aliyun.free.billing}</p>
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
              <button onClick={() => { if (apiKey?.trim()) { if (saveApiKey(apiKey)) setKeyJustSaved(true); } else showNotif(t.common?.enterKey || "Please enter API Key", "error"); }} disabled={!apiKey?.trim()}
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
                <button onClick={() => { setKeyJustSaved(false); if (door === "custom") setPhase("roster"); else if (!selectedGroup) setPhase("cover"); else setPhase("setup"); }}
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
  // ── Roster Builder (the custom door) ──
  if (phase === "roster") {
    return (
      <>
        <RosterBuilder
          language={language} theme={theme} t={t} world={world}
          fontScale={fontScale}
          apiKey={apiKey} modelId={selectedModel}
          aliyun={selectedModel === "qwen" ? { mode: aliyunMode, paidModel: aliyunPaidModel } : null}
          onStart={(r) => { setPendingRoster(r); setPhase("setup"); }}
          onBack={() => { setPendingRoster(null); setDoor("classic"); setPhase("cover"); }}
          notify={showNotif}
        />
        <NotificationBar />
      </>
    );
  }

  if (phase === "setup") {
    // `world` is in the gate because buildSystemPrompt cannot run without it.
    // It is fetched on mount and the player cannot reach this screen faster
    // than that, but a start with no world would throw rather than degrade.
    const canStart = form.mainMember && form.name && validBirthYear(form.birthYear) && form.identity && world;
    // ...and since step 3 the page RENDERS from it too: the identity grid is the
    // world's list and the cast field's label is the world's noun. A world switch
    // nulls it for the length of one fetch, so this is a real state and not only
    // the first paint.
    if (!world) return (
      <div style={{ height: "100vh", display: "flex", justifyContent: "center", alignItems: "center", background: th.pageBgAlt, color: th.textMuted, fontSize: 12 }}>Loading...</div>
    );
    return (
      <div style={{ height: "100vh", display: "flex", justifyContent: "center", alignItems: "center", background: th.pageBgAlt }}>
        <div style={{ width: "100%", maxWidth: 390, height: "100vh", maxHeight: 844, background: th.pageBgAlt, fontFamily: "'Georgia','Noto Serif SC',serif", color: th.textPrimary, padding: "12px 10px 40px", overflowY: "auto", borderRadius: 20, boxShadow: "0 0 40px rgba(0,0,0,.3)" }}>
          <NotificationBar />
          <style>{th.setupCss}</style>
          <div style={{ textAlign: "center", padding: "10px 0 2px" }}>
            <h2 style={{ fontSize: 18, color: th.textHeading, marginBottom: 2 }}>{language === "zh" ? "创建角色" : language === "ko" ? "캐릭터 생성" : "Character Creation"}</h2>
            {/* The noun is the world's too. This line said "Group loaded" in all
                three languages, which is the cast's kind and not a fixed word. */}
            <p style={{ fontSize: 10, color: th.textMuted }}>{t.cast.orgLoaded(world.castLore.orgNoun)}{pendingRoster ? (castName.trim() || DEFAULT_CAST_NAME) : (groupConfig?.group?.name || "Loading...")}</p>
            <div style={{ marginTop: 6, fontSize: 10, color: apiKey ? "#6d9b6d" : "#d07070", display: "flex", alignItems: "center", justifyContent: "center", gap: 4, flexWrap: "wrap" }}>
              <span>{apiKey ? language === "zh" ? "密钥已配置" : language === "ko" ? "키 설정됨" : "Key configured" : language === "zh" ? "密钥缺失" : language === "ko" ? "키 누락" : "Key missing"}</span>
              <span style={{ color: th.textMuted }}>{MODEL_CONFIGS[selectedModel]?.emoji} {MODEL_CONFIGS[selectedModel]?.name}{selectedModel === "qwen" ? ` · ${aliyunMode === "free" ? t.aliyun.free.title : resolvePaidModel(aliyunPaidModel)}` : ""}</span>
              <button onClick={() => setPhase("keyInput")} style={{ background: "none", border: `1px solid ${th.border}`, borderRadius: 6, padding: "2px 6px", color: th.textSecondary, fontSize: 9, cursor: "pointer" }}>{language === "zh" ? "切换模型" : language === "ko" ? "모델 전환" : "Change Model"}</button>
            </div>
          </div>

          {/* The custom door already chose the cast AND the slots, so Setup shows
              it rather than asking again. This is what keeps this page short on
              that path: identity, name, birth year and pace, and nothing else. */}
          {pendingRoster ? (
            <>
              <div className="s-l">{t.cast.castLabel}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 6, alignItems: "center" }}>
                {members.map(m => {
                  const slot = m.id === form.mainMember ? "★"
                    : (form.subMembers || []).includes(m.id) ? "●" : "○";
                  return (
                    <span key={m.id} style={{ display: "flex", alignItems: "center", gap: 3, padding: "5px 9px", borderRadius: 14, border: `1px solid ${th.groupBtnBorder}`, background: th.memberBtnBg, color: th.memberBtnColor, fontSize: 11, whiteSpace: "nowrap" }}>
                      <span style={{ fontSize: 14 }}>{m.emoji}</span>
                      <span>{m.name}</span>
                      <span style={{ color: th.textMuted, fontSize: 10 }}>{slot}</span>
                    </span>
                  );
                })}
                <button onClick={() => setPhase("roster")}
                  style={{ padding: "5px 10px", borderRadius: 14, border: `1px dashed ${th.groupBtnBorder}`, background: "transparent", color: th.textMuted, fontSize: 10, cursor: "pointer" }}>
                  {t.cast.changeCast}
                </button>
              </div>
              {/* The cast belongs to something, so it needs a name — and naming the
                  organisation after it is what stops the model inventing one. A
                  cross-group cast was previously described as the main member's
                  group, which is how a BLACKPINK main produced "YG".

                  WHAT that organisation is comes from the world, not from here:
                  an idol agency, a university, a company, a family firm. The world
                  supplies one noun and the sentence around it, because "they debut
                  as one group" is a different claim from "they study here" rather
                  than the same sentence with a different word in it. */}
              <div className="s-l">{t.cast.orgName(world.castLore.orgNoun)}</div>
              <input className="s-in" value={castName} maxLength={24}
                onChange={e => setCastName(e.target.value)}
                placeholder={DEFAULT_CAST_NAME} style={{ marginBottom: 3 }} />
              <p style={{ fontSize: 9, color: th.textFaint, marginBottom: 6 }}>
                {world.castLore.orgHint.replace("{org}",
                  orgNameFor(castName.trim(), world.castLore.orgSuffix))}
              </p>
            </>
          ) : (
          <>
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
          </>
          )}

          {/* THE IDENTITY PICKER MOVED BELOW THE WORLD PICKER — v1.4.1 step 3.
              An identity is a position inside a world, so the list means nothing
              until the world is chosen: Setup now reads name / birth year / world
              / identity. */}

          {/* THE YEAR CAPTION LIVES IN THE SECTION LABEL, not above the wheel —
              second hand test. A caption inside the wheel's own column pushes
              the wheel down by its own height, so the name field and the
              selected year sat on two different lines and the pair read as two
              rows of one control each. With the captions lifted out, the row
              below holds exactly two boxes and `alignItems: center` puts the
              38px field's centre on the 104px wheel's centre — which is the
              selected year, since the band sits at the middle row by
              construction (`pad = ROW_H`). */}
          <div style={{ display: "flex", gap: 5, alignItems: "baseline" }}>
            <div className="s-l" style={{ flex: 2, marginBottom: 6 }}>{language === "zh" ? "角色信息" : language === "ko" ? "캐릭터 정보" : "Character Info"}</div>
            <div className="s-l" style={{ flex: 1, minWidth: 88, marginBottom: 6, textAlign: "center", fontSize: 9.5 }}>
              {language === "zh" ? "出生年份" : language === "ko" ? "출생 연도" : "Birth year"}
            </div>
          </div>
          <div style={{ display: "flex", gap: 5, marginBottom: 5, alignItems: "center" }}>
            <input className="s-in" placeholder={language === "zh" ? "名字" : language === "ko" ? "이름" : "Name"} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={{ flex: 2 }} />
            {/* A wheel, not a field — step 8. The year is one of 63 ordered
                values, which is a picker; a text box invites a keyboard that on
                iOS covers the box it is filling, and it can hold "19", which is
                a year the address protocol must never see. The wheel cannot
                produce a partial or out-of-range year at all. */}
            <div style={{ flex: 1, minWidth: 88 }}>
              <YearWheel value={form.birthYear || DEFAULT_YEAR} onChange={setBirthYear}
                min={PLAYER_BIRTH_YEAR_MIN} max={PLAYER_BIRTH_YEAR_MAX} fontScale={fontScale}
                ariaLabel={language === "zh" ? "出生年份" : language === "ko" ? "출생 연도" : "Birth year"}
                colors={{ text: th.textPrimary, textDim: th.textMuted, accent: th.textHeading, tint: th.langBtnActiveBg, border: th.notifBarBorder, fieldBg: th.memberBtnBg }} />
            </div>
          </div>

          {/* The pace picker used to sit here. v1.4.1 step 2 moved it into
              Settings as the four-way story mode, because a choice frozen at
              character setup cannot be a choice about how the story is driven -
              and the tail is where a live one costs nothing. Step 3 put the
              WORLD picker in this slot, which is why both cover doors get worlds
              without the entry merge: they both pass through this page.

              One row per world from `index.json`, so step 7 ships three worlds
              as data. Only the SELECTED world's blurb renders: four blurbs at
              390px is a wall of text under a control, and the blurb's job is to
              say what the choice she has made means. */}
          <div className="s-l">{t.setup.world}</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5, marginBottom: 3 }}>
            {worldList.map(w => (
              <div key={w.id} onClick={() => setSelectedWorld(w.id)}
                style={{ padding: "7px 8px", borderRadius: 10, textAlign: "center", border: `1px solid ${selectedWorld === w.id ? th.notifBarBorder : th.groupBtnBorder}`, background: selectedWorld === w.id ? th.langBtnActiveBg : th.memberBtnBg, color: selectedWorld === w.id ? (theme === "dark" ? "#fff" : "#2c1f0e") : th.memberBtnColor, fontSize: 11, cursor: "pointer" }}>
                {w.emoji} {w.name?.[language] || w.name?.zh || w.id}
              </div>
            ))}
          </div>
          <p style={{ fontSize: 9, color: th.textFaint, marginBottom: 6 }}>
            {worldList.find(w => w.id === selectedWorld)?.blurb?.[language]
              || worldList.find(w => w.id === selectedWorld)?.blurb?.zh || ""}
          </p>

          {/* The world's own identities, plus the custom escape hatch. Not a list
              in this file: `world.identities` is where they are declared, and the
              copy that used to live here read as an id-to-label mapping that was
              an identity function. The label is the world's `name`, which is the
              same string section 6 of the prompt prints — one copy, so the two
              cannot disagree about what the player picked. */}
          <div className="s-l">{t.setup.identity}</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5, marginBottom: 4 }}>
            {[...world.identities.map(i => ({ id: i.id, label: i.name || i.id })),
              { id: CUSTOM_IDENTITY_ID, label: t.setup.customIdentityOption }].map(it => (
              <div key={it.id} onClick={() => setForm(f => ({ ...f, identity: it.id }))}
                style={{ padding: "7px 10px", borderRadius: 10, textAlign: "center", border: `1px solid ${form.identity === it.id ? th.notifBarBorder : th.groupBtnBorder}`, background: form.identity === it.id ? th.langBtnActiveBg : th.memberBtnBg, color: form.identity === it.id ? (theme === "dark" ? "#fff" : "#2c1f0e") : th.memberBtnColor, fontSize: 11, cursor: "pointer" }}>
                {it.label}
              </div>
            ))}
          </div>
          {form.identity === CUSTOM_IDENTITY_ID && (
            <input className="s-in" placeholder={t.setup.customIdentity} value={form.customIdentity} onChange={e => setForm(f => ({ ...f, customIdentity: e.target.value }))} style={{ marginTop: 4, marginBottom: 6 }} />
          )}

          <div style={{ display: "flex", gap: 8, marginTop: 22 }}>
            {/* Back goes one step, not all the way out: on the custom door the
                previous step is the builder, and dropping the player at the cover
                would discard a cast they may have spent real time assembling. */}
            <button onClick={() => setPhase(pendingRoster ? "roster" : "cover")}
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
            {/* The most-affected member, as her photo. Her gradient stays under
                it as the fallback — see memberFace.jsx, which is the one
                definition all six of these surfaces share. */}
            <MemberFace member={displayTopMember} photo={castPhotos[displayTopMember?.id]} size={28} />
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
                  {hoveredStat === "aff_" + m.id && <div className="stat-tooltip">{m.name_kr} Affection: {aff} ({stageNameIn(aff, language)})</div>}
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
            {platformBar.map(b => {
              const showDot = hasNotifDot(b.type) && !b.locked;
              return (
                <button key={b.type} onClick={() => openSocialPlatform(b.type)}
                  style={{ position: "relative", background: th.topBarIconBg, border: `1px solid ${b.locked ? th.topBarIconBorder : th.topBarIconBorder}`, borderRadius: 5, padding: "3px 5px", color: b.locked ? th.topBarStatText : th.topBarText, fontSize: 11, cursor: b.locked ? "not-allowed" : "pointer", opacity: b.locked ? .5 : 1 }}>
                  {b.icon}{showDot && <div className="notification-dot" />}
                </button>
              );
            })}
            <button onClick={() => setOverlay({ type: "save" })} style={{ background: th.topBarIconBg, border: `1px solid ${th.topBarIconBorder}`, borderRadius: 5, padding: "3px 5px", color: th.topBarText, fontSize: 11, cursor: "pointer" }}>💾</button>
            <button onClick={() => { setBirthYearDraft(form.birthYear || ""); setShowSettings(true); }} style={{ background: th.topBarIconBg, border: `1px solid ${th.topBarIconBorder}`, borderRadius: 5, padding: "3px 5px", color: th.topBarText, fontSize: 11, cursor: "pointer" }}>⚙️</button>
          </div>
        </div>

        {/* Active Notification Strip */}
        {activeNotifications.length > 0 && (
          <div style={{ padding: "3px 8px", background: th.notifBarBg, borderBottom: `1px solid ${th.notifBarBorder}`, display: "flex", gap: 6, overflowX: "auto", flexShrink: 0, fontSize: 9, color: th.notifBarText }}>
            {activeNotifications.map((n, i) => {
              const m = members.find(mb => mb.id === n.memberId);
              // The badge comes from the catalog rather than a second list of four here.
              return (
                <span key={i} onClick={() => openSocialPlatform(n.platform, n.memberId)} style={{ cursor: "pointer", whiteSpace: "nowrap" }}>
                  {m?.name_kr || m?.name} {t.notif.updated} {platformBar.find(b => b.type === n.platform)?.badge || n.platform}
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
            const lastUserIdx = messages.reduce((acc, m, i) => !m.hidden && m.role === "user" ? i : acc, -1);
            // Every edit/retry control needs a snapshot from this session.
            const canEdit = !!preRoundSnapshotRef.current && !loading;
            const btn = { background: th.actionBtnBg, border: `1px solid ${th.actionBtnBorder}`, borderRadius: 8, width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", color: th.actionColor, fontWeight: 700, cursor: "pointer", lineHeight: 1 };

            // Shared inline editor for both the choice bubble and the story.
            // A story runs 600-2,400 characters, so a fixed box means scrolling
            // to read your own text. Grow to fit the content, capped so the
            // save/cancel row stays reachable on a 390x844 screen.
            const autoGrow = (el) => {
              if (!el) return;
              el.style.height = "auto";
              el.style.height = `${Math.min(el.scrollHeight, Math.round(window.innerHeight * 0.66))}px`;
            };
            const editor = (onSave, maxLength) => (
              <div style={{ marginTop: 6 }}>
                <textarea value={editDraft} maxLength={maxLength} autoFocus
                  ref={autoGrow}
                  onChange={(e) => { setEditDraft(e.target.value); autoGrow(e.target); }}
                  style={{ width: "100%", minHeight: 220, boxSizing: "border-box", background: th.storyBg, color: th.textStory, border: `1px solid ${th.borderAccent}`, borderRadius: 10, padding: "10px 12px", fontSize: Math.round(13 * fontScale), lineHeight: 1.8, fontFamily: "inherit", resize: "vertical", overflowY: "auto" }} />
                <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", marginTop: 6, alignItems: "center" }}>
                  <span style={{ fontSize: 9, color: th.textFaint, marginRight: "auto" }}>{editDraft.length}/{maxLength}</span>
                  <button onClick={cancelEdit} title={t.editCancel} style={{ ...btn, fontSize: 15 }}>✕</button>
                  <button onClick={onSave} title={t.editSave} style={{ ...btn, fontSize: 15, color: th.copiedColor }}>✓</button>
                </div>
              </div>
            );

            const actionBar = (content, idx) => (
              <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", marginTop: 6 }}>
                <button onClick={() => copyStory(content)} title="Copy story"
                  style={{ ...btn, fontSize: 16, color: copiedStory ? th.copiedColor : th.actionColor }}>
                  {copiedStory ? "✓" : "⎘"}
                </button>
                {canEdit && (
                  <button onClick={() => beginEdit(idx, storyPartOf(content))} title={t.editStory} style={{ ...btn, fontSize: 14 }}>
                    ✎
                  </button>
                )}
                {preRoundSnapshotRef.current && (
                  <button onClick={() => regenerateRound()} title="Retry this round" style={{ ...btn, fontSize: 18 }}>
                    ↺
                  </button>
                )}
              </div>
            );
            return messages.map((msg, i) => {
              if (msg.hidden) return null;
              if (msg.role === "user") {
                if (editingIdx === i) return <div key={i}>{editor(saveChoiceEdit, 300)}</div>;
                return (
                  <div key={i} style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 6, marginBottom: 10 }}>
                    {i === lastUserIdx && canEdit && (
                      <button onClick={() => beginEdit(i, msg.content)} title={t.editChoice}
                        style={{ ...btn, width: 24, height: 24, fontSize: 12, flexShrink: 0 }}>✎</button>
                    )}
                    <div style={{ background: th.accentGrad, color: "#fff", padding: "8px 14px", borderRadius: "14px 14px 3px 14px", maxWidth: "80%", fontSize: 12, lineHeight: 1.6, wordBreak: "break-word" }}>{msg.content}</div>
                  </div>
                );
              }
              const isLast = i === lastAsstIdx && !loading;
              const sb = msg.content.match(/╔[\s\S]*?╚[═─]+╝/);
              if (sb) {
                let af = msg.content.slice(msg.content.indexOf(sb[0]) + sb[0].length);
                af = af.replace(/\n?[ABCD][.、．]\s*.+/g, '').trim();
                return (
                  <div key={i} style={{ marginBottom: 14 }}>
                    <div style={{ background: th.statsBg, border: `1px solid ${th.borderAccent}`, borderRadius: 10, padding: "10px 12px", marginBottom: 8, fontFamily: "'Courier New',monospace", fontSize: 10, color: th.textStats, lineHeight: 1.8, whiteSpace: "pre-wrap" }}>{sb[0]}</div>
                    {editingIdx === i
                      ? editor(saveStoryEdit, MAX_STORY_EDIT_CHARS)
                      : af && <div style={{ background: th.storyBg, border: `1px solid ${th.border}`, borderRadius: "14px 14px 14px 14px", padding: "12px 14px", fontSize: Math.round(13 * fontScale), lineHeight: 1.8, whiteSpace: "pre-wrap", color: th.textStory }}>{af}</div>}
                    {isLast && editingIdx !== i && actionBar(msg.content, i)}
                  </div>
                );
              }
              return (
                <div key={i} style={{ marginBottom: 14 }}>
                  {editingIdx === i
                    ? editor(saveStoryEdit, MAX_STORY_EDIT_CHARS)
                    : <div style={{ background: th.storyBg, border: `1px solid ${th.border}`, borderRadius: "3px 14px 14px 14px", padding: "12px 14px", fontSize: Math.round(13 * fontScale), lineHeight: 1.8, whiteSpace: "pre-wrap", color: th.textStory }}>{msg.content}</div>}
                  {isLast && editingIdx !== i && actionBar(msg.content, i)}
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
        {quickOptions.length > 0 && !loading && editingIdx === null && (
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

        {/* Input — hidden while editing, like the option bar: sending a message
            would append a turn and leave the open draft on the wrong index. */}
        {editingIdx === null && (
        <div style={{ padding: "6px 8px", background: th.inputAreaBg, borderTop: `1px solid ${th.borderFaint}`, display: "flex", gap: 5, alignItems: "flex-end", flexShrink: 0 }}>
          {/* The map SUPPLEMENTS the four options rather than replacing them: the options
              are generated per round and this list is the same every round, so making them
              exclusive would hide a round's own options behind a fixture. Disabled rather
              than hidden while the world loads, so the row does not change shape. */}
          <button onClick={() => setOverlay({ type: "map" })} disabled={loading || !world}
            aria-label={t.map.title} title={t.map.title}
            style={{ width: 34, height: 34, borderRadius: "50%", border: `1px solid ${th.borderDim}`, background: th.inputBg, color: th.textPrimary, fontSize: 15, cursor: loading || !world ? "not-allowed" : "pointer", opacity: loading || !world ? .45 : 1, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, padding: 0 }}>📍</button>
          <textarea ref={inputRef} value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); } }}
            placeholder={language === "zh" ? "输入你的选择..." : language === "ko" ? "선택 사항 입력..." : "Type your choice..."}
            disabled={loading} rows={1} maxLength={300}
            style={{ flex: 1, padding: "8px 12px", borderRadius: 12, background: th.inputBg, border: `1px solid ${th.borderDim}`, color: th.textPrimary, fontSize: 12, outline: "none", resize: "none", fontFamily: "inherit", lineHeight: 1.4, maxHeight: 70, overflowY: "auto" }} />
          <button onClick={() => sendMessage(input)} disabled={!input.trim() || loading}
            style={{ width: 34, height: 34, borderRadius: "50%", border: th.border, background: input.trim() && !loading ? th.accentGrad : th.newGameDisabled, color: "#fff", fontSize: 14, cursor: input.trim() && !loading ? "pointer" : "not-allowed", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>↑</button>
        </div>
        )}

        {/* Overlays */}
        {overlay?.type === "save" && <SaveOverlay theme={theme} t={t} stats={stats} member={displayTopMember} form={form} groupId={selectedGroup} roster={roster} messages={storyMessages(messages)} currentOptions={currentOptions} socialFeeds={socialFeeds} kktMessages={kktMessages} kktUnlocked={kktUnlocked} memory={memoryRef.current} triggeredAchievements={triggeredAchievements} onLoad={loadSave} onClose={() => setOverlay(null)} />}
        {showHelp && <HelpOverlay language={language} theme={theme} onClose={() => setShowHelp(false)} />}
        {overlay?.type === "map" && (
          <MapOverlay theme={theme} t={t} fontScale={fontScale}
            canon={world?.places || []}
            discovered={memoryRef.current?.places || []}
            onPick={(name) => { setOverlay(null); sendMessage(placeChoiceText(name)); }}
            onClose={() => setOverlay(null)} />
        )}

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

              {/* Story Mode - four-way, the same control shape as Time Speed
                  below it, and deliberately beside it: both are live pacing
                  dials that ride in the dynamic tail, so toggling either
                  mid-run costs nothing in cache terms.

                  The knob geometry is derived from the number of modes rather
                  than written out, because MODE_IDS is the authority on how
                  many there are and a hardcoded fourth position would go wrong
                  the moment a fifth mode is added. 16px knob, 3px inset, 21px
                  step - the same numbers Time Speed uses for three. */}
              {(() => {
                const idx = Math.max(0, MODE_IDS.indexOf(storyMode));
                const width = 6 + 16 + (MODE_IDS.length - 1) * 21;
                const cycle = () => {
                  const next = MODE_IDS[(idx + 1) % MODE_IDS.length];
                  setStoryMode(next);
                  saveToStorage('rv_sim_story_mode', next);
                };
                // `free` reads as the off position: no authored events. The other
                // three all add something, so they all read as on.
                const on = storyMode !== 'free';
                return (
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <div style={{ fontSize: 13, color: th.textPrimary, fontWeight: 600 }}>{t.settings?.storyModeTitle}</div>
                      <div onClick={cycle}
                        style={{ width, height: 24, borderRadius: 12, background: on ? th.reasoningOnBg : th.reasoningOffBg, border: `1px solid ${on ? th.reasoningOnBorder : th.reasoningOffBorder}`, cursor: 'pointer', position: 'relative', transition: 'all .2s', flexShrink: 0 }}>
                        <div style={{ position: 'absolute', top: 3, left: 3 + idx * 21, width: 16, height: 16, borderRadius: '50%', background: on ? '#fff' : th.reasoningKnob, transition: 'left .2s' }} />
                      </div>
                    </div>
                    <div style={{ fontSize: 10, color: th.textMuted, lineHeight: 1.5 }}>{t.modes?.[MODE_IDS[idx]]}</div>
                  </div>
                );
              })()}

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

              {/* Player birth year — ONLY for a save whose year was never stated.
                  Step 8 narrowed this from "always visible", and the narrowing
                  is the point rather than a tidy-up.

                  The year is set once at Setup and then fixed for the life of
                  the playthrough. It decides which way every address form points
                  — Korean seniority is a hard year boundary — so changing it
                  mid-run re-points the whole cast's honorifics under the player,
                  and it sits in the static system prompt, so a change also costs
                  the entire ~5,500-token cached prefix. Neither is a price for a
                  control that mostly invites fiddling.

                  It stays for the one case it was built for: a pre-v1.4.0 save
                  whose year the migration REPRODUCED from `age`, deliberately
                  and wrongly, for about half of those saves and unrecoverably.
                  `birthYearEstimated` is exactly "the year was filled in for
                  her", so it is the gate. An unchanged year still costs nothing,
                  which correctBirthYear guarantees by returning the same object.

                  Nothing is deleted: correctBirthYear, its guards and its
                  translations all stand, and a new game simply never shows the
                  row because a new game's year was stated by the player. */}
              {birthYearEstimated && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4, gap: 8 }}>
                  <div style={{ fontSize: 13, color: th.textPrimary, fontWeight: 600 }}>{t.settings?.birthYearTitle}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                    {/* Not type="number": on iOS it fights a 4-digit field, and
                        the member editor lost a whole field to that in step 6.
                        Digits are filtered here instead, so the input holds
                        exactly what the player typed. */}
                    <input value={birthYearDraft} type="text" inputMode="numeric" pattern="[0-9]*" maxLength={4}
                      onChange={e => setBirthYearDraft(e.target.value.replace(/\D/g, "").slice(0, 4))}
                      placeholder={String(PLAYER_BIRTH_YEAR_MAX)}
                      style={{ width: 54, padding: "5px 4px", borderRadius: 8, textAlign: "center", fontSize: 13, outline: "none", background: th.cardBg, color: th.textPrimary, border: `1px solid ${!birthYearDraft || birthYearDraftValid ? th.border : th.warnTitle}` }} />
                    <button onClick={applyBirthYearCorrection} disabled={!birthYearDraftValid}
                      style={{ padding: "5px 10px", borderRadius: 8, fontSize: 12, cursor: birthYearDraftValid ? "pointer" : "default", background: birthYearDraftValid ? th.switchLlmBg : th.cardBg, border: `1px solid ${birthYearDraftValid ? th.switchLlmBorder : th.border}`, color: birthYearDraftValid ? th.switchLlmColor : th.textFaint }}>
                      {t.settings?.birthYearApply}
                    </button>
                  </div>
                </div>
                <div style={{ fontSize: 10, lineHeight: 1.5, color: birthYearEstimated && birthYearDraftValid ? th.warnTitle : th.textMuted }}>
                  {birthYearDraft && !birthYearDraftValid
                    ? t.settings?.birthYearRange?.(PLAYER_BIRTH_YEAR_MIN, PLAYER_BIRTH_YEAR_MAX)
                    : birthYearEstimated ? t.settings?.birthYearEstimated : t.settings?.birthYearHint}
                </div>
              </div>
              )}

              {/* Session usage. Reads the meter at render time, which is enough:
                  the overlay is mounted fresh on every open and the numbers only
                  change while a round is generating, which is when it is shut. */}
              <UsagePanel language={language} th={th} />

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
                      form: formForRound(),
                      members, mainId: form.mainMember, subIds: form.subMembers || [],
                      groupConfig, world, apiKey, selectedModel, kktUnlocked, language, reasoningEnabled,
                      aliyun: aliyunOptions(), timeSpeed, storyMode,
                    });
                    const epStats = epilogue.newStats || statsRef.current;
                    const statsBox = buildStatsBox(epStats, members, form.mainMember, form.subMembers || [], t);
                    setMessages(p => [...p, { role: "assistant", content: "=== EPILOGUE ===\n\n" + statsBox + "\n\n" + (epilogue.storyContent || "The end.") }]);
                    const backLabel = language === "zh" ? "A. 返回封面页" : language === "ko" ? "A. 커버 페이지로 돌아가기" : "A. Return to Cover Page";
                    setCurrentOptions([backLabel]);
                  } catch (e) {
                    setMessages(p => [...p, { role: "assistant", content: llmErrorNotice(e), error: true }]);
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

        {overlay?.type === "bubble" && <BubbleOverlay theme={theme} fontScale={fontScale} t={t} photos={castPhotos} walls={castWalls} memberId={overlay.memberId} members={members} socialFeeds={socialFeeds} allTargetMembers={allTargetMembers} kktUnlocked={kktUnlocked} onClose={() => setOverlay(null)} />}
        {overlay?.type === "instagram" && <InstagramOverlay theme={theme} t={t} photos={castPhotos} walls={castWalls} memberId={overlay.memberId} members={members} socialFeeds={socialFeeds} allTargetMembers={allTargetMembers} onClose={() => setOverlay(null)} />}
        {overlay?.type === "weverse" && <WeverseOverlay theme={theme} t={t} photos={castPhotos} walls={castWalls} memberId={overlay.memberId} members={members} socialFeeds={socialFeeds} allTargetMembers={allTargetMembers} onClose={() => setOverlay(null)} />}
        {overlay?.type === "kakao" && <KakaoOverlay theme={theme} fontScale={fontScale} t={t} photos={castPhotos} walls={castWalls} memberId={overlay.memberId} members={members} kktMessages={kktMessages} kktUnlocked={kktUnlocked} allTargetMembers={allTargetMembers} onClose={() => setOverlay(null)} />}
      </div>
    </div>
  );
}
