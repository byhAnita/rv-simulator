import { useState, createContext, useContext } from "react";
import { getTranslations } from "../i18n";

// ── Per-theme color tokens ────────────────────────────────────────────────
const DARK = {
  overlay: "rgba(0,0,0,.82)",
  panelBg: "#0e061a",
  panelBorder: "rgba(200,109,208,.35)",
  headerBorder: "rgba(200,109,208,.15)",
  title: "#f8c8d8",
  closeBtn: "#907080",
  tabActiveBg: "rgba(200,109,208,.15)",
  tabActiveColor: "#e8b8f0",
  tabInactiveColor: "#605060",
  tabActiveLine: "#c86dd0",
  scrollThumb: "rgba(200,109,208,.2)",
  link: "#b090e8",
  shColor: "#c86dd0",
  shBorder: "rgba(200,109,208,.2)",
  stepNum: "#c86dd0",
  stepText: "#d0c0e0",
  tip: "#9888b8",
  plBorder: "rgba(255,255,255,.05)",
  plName: "#d0b8d8",
  ibBg: "rgba(255,255,255,.02)",
  ibBorder: "rgba(232,120,176,.1)",
  ibQ: "#f0c0d0",
  ibA: "#9888b8",
  hi: "#d0b8d8",
  codeFg: "#c86dd0",
  codeBg: "rgba(200,109,208,.12)",
  emptyTitle: "#c898b8",
  emptyBody: "#605060",
  emptyAccent: "#c86dd0",
  disclaimerBg: "rgba(255,255,255,.02)",
  disclaimerBorder: "rgba(255,255,255,.06)",
  disclaimerColor: "#504050",
  weiboName: "#d0c0e0",
  retryAccent: "#e887b0",
};

const LIGHT = {
  overlay: "rgba(60,40,10,.55)",
  panelBg: "#f0ead8",
  panelBorder: "rgba(139,105,20,.35)",
  headerBorder: "rgba(139,105,20,.18)",
  title: "#3a2510",
  closeBtn: "#9a7c5a",
  tabActiveBg: "rgba(139,105,20,.12)",
  tabActiveColor: "#3a2510",
  tabInactiveColor: "#b8a080",
  tabActiveLine: "#8b6914",
  scrollThumb: "rgba(139,105,20,.2)",
  link: "#6b3a10",
  shColor: "#8b6914",
  shBorder: "rgba(139,105,20,.2)",
  stepNum: "#a0522d",
  stepText: "#3a2510",
  tip: "#6b4f2a",
  plBorder: "rgba(139,105,20,.1)",
  plName: "#3a2510",
  ibBg: "rgba(139,105,20,.04)",
  ibBorder: "rgba(139,105,20,.15)",
  ibQ: "#3a2510",
  ibA: "#6b4f2a",
  hi: "#2c1f0e",
  codeFg: "#a0522d",
  codeBg: "rgba(160,82,45,.1)",
  emptyTitle: "#6b4f2a",
  emptyBody: "#9a7c5a",
  emptyAccent: "#8b6914",
  disclaimerBg: "rgba(139,105,20,.04)",
  disclaimerBorder: "rgba(139,105,20,.08)",
  disclaimerColor: "#9a7c5a",
  weiboName: "#3a2510",
  retryAccent: "#8b6914",
};

const HT = createContext(DARK);

// ── Shared atoms ─────────────────────────────────────────────────────────
function A({ href, children }) {
  const c = useContext(HT);
  return (
    <a href={href} target="_blank" rel="noopener noreferrer"
      style={{ color: c.link, textDecoration: "underline", wordBreak: "break-all" }}>
      {children}
    </a>
  );
}

function SH({ children }) {
  const c = useContext(HT);
  return (
    <div style={{
      fontSize: 10, fontWeight: 700, color: c.shColor, letterSpacing: 0.8,
      borderBottom: `1px solid ${c.shBorder}`, paddingBottom: 6,
      marginBottom: 10, marginTop: 2,
    }}>
      {children}
    </div>
  );
}

function Step({ n, children }) {
  const c = useContext(HT);
  return (
    <div style={{ display: "flex", gap: 8, marginBottom: 7, alignItems: "flex-start" }}>
      <span style={{ color: c.stepNum, fontWeight: 700, fontSize: 13, lineHeight: 1.5, flexShrink: 0 }}>
        {"①②③④⑤⑥"[n - 1]}
      </span>
      <span style={{ fontSize: 12, color: c.stepText, lineHeight: 1.65 }}>{children}</span>
    </div>
  );
}

function Tip({ children }) {
  const c = useContext(HT);
  return (
    <div style={{ fontSize: 11, color: c.tip, lineHeight: 1.75, marginBottom: 6 }}>
      {children}
    </div>
  );
}

function PL({ emoji, name, href }) {
  const c = useContext(HT);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", borderBottom: `1px solid ${c.plBorder}`, fontSize: 12 }}>
      <span>{emoji}</span>
      <span style={{ color: c.plName, minWidth: 72 }}>{name}</span>
      <A href={"https://" + href}>{href}</A>
    </div>
  );
}

function IB({ q, children }) {
  const c = useContext(HT);
  return (
    <div style={{ marginBottom: 12, background: c.ibBg, border: `1px solid ${c.ibBorder}`, borderRadius: 10, padding: "10px 12px" }}>
      <div style={{ fontSize: 12, color: c.ibQ, fontWeight: 600, marginBottom: 6 }}>❓ {q}</div>
      <div style={{ fontSize: 11, color: c.ibA, lineHeight: 1.8 }}>{children}</div>
    </div>
  );
}

function Code({ children }) {
  const c = useContext(HT);
  return (
    <code style={{ color: c.codeFg, background: c.codeBg, padding: "1px 5px", borderRadius: 4, fontFamily: "monospace", fontSize: 11 }}>
      {children}
    </code>
  );
}

function BL() {
  return (
    <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ fontSize: 11 }}>🎮 <A href="https://idol-dating-sim.pages.dev/">idol-dating-sim.pages.dev</A></div>
      <div style={{ fontSize: 11 }}>🎮 <A href="https://idol-dating-sim.vercel.app/">idol-dating-sim.vercel.app</A></div>
    </div>
  );
}

function Hi({ children }) {
  const c = useContext(HT);
  return <span style={{ fontWeight: 600, color: c.hi }}>{children}</span>;
}


// ── Guide ─────────────────────────────────────────────────────────────────
function GuideEn() {
  return (
    <>
      <SH>🐉 Aliyun — Free to Start (Recommended)</SH>
      <Step n={1}>Open <A href="https://platform.qianwenai.com">platform.qianwenai.com</A> — sign up and log in</Step>
      <Step n={2}>New users get ~1M free tokens on each of 30 models — no top-up needed!</Step>
      <Step n={3}>In the console, turn <Hi>ON</Hi> "Stop when free quota is used up" so you're never billed by surprise</Step>
      <Step n={4}>Go to "API Keys" → "Create API Key" and copy it (starts with <Code>sk-ws-…</Code>)</Step>
      <Step n={5}>Paste it in-game, choose Aliyun → 🎁 Free credits, and tap Confirm</Step>
      <Step n={6}>Tip: tap Share → Add to Home Screen in your browser to save this game as an app icon</Step>
      <div style={{ height: 8 }} />
      <Tip>🎁 Free credits mode moves to the next model automatically when one runs out — about 100 rounds per model. Credits are valid 90 days after sign-up.</Tip>
      <Tip>💳 Paid mode: pick a model yourself; the API Key page shows its cost. Token Plan keys (<Code>sk-sp-</Code>) don't work in-game yet — use a general <Code>sk-ws-</Code> key.</Tip>

      <div style={{ height: 16 }} />
      <SH>Other AI Platforms (small top-up required)</SH>
      <PL emoji="🐋" name="DeepSeek Official" href="platform.deepseek.com" />
      <PL emoji="⚡" name="ChatGPT" href="platform.openai.com" />
      <PL emoji="💎" name="Gemini" href="aistudio.google.com" />
      <div style={{ height: 6 }} />
      <Tip>After topping up: go to "API Keys" on the platform, create a key, and paste it in the game.</Tip>

      <div style={{ height: 16 }} />
      <SH>Security Tips</SH>
      <Tip>⚠️ Never share your API key with others — it grants full access to your credits.</Tip>
      <Tip>🔑 Key lost or leaked? Delete it on the platform and create a new one.</Tip>
      <Tip>🚧 Model not responding? Switch to another model and use that platform's key.</Tip>
      <Tip>💡 This is a fan-made, non-profit game. Any credits you add go directly to the AI platform — not to the developer. All idol content is fictional parallel-universe creation and does not represent real artists.</Tip>
    </>
  );
}

function GuideZh() {
  return (
    <>
      <SH>🐉 阿里云 Aliyun — 免费开始（推荐）</SH>
      <Step n={1}>打开 <A href="https://platform.qianwenai.com">platform.qianwenai.com</A>，注册并登录</Step>
      <Step n={2}>新用户在 30 个模型上各享约 100 万 Token 免费额度，无需充值！</Step>
      <Step n={3}>在控制台<Hi>开启</Hi>「免费额度用完即停」，避免额度用完后被自动扣费</Step>
      <Step n={4}>进入「API Key」页面创建 Key 并复制（以 <Code>sk-ws-…</Code> 开头）</Step>
      <Step n={5}>粘贴到游戏中，选择 Aliyun → 🎁 新用户免费额度，点击确认</Step>
      <Step n={6}>提示：手机浏览器「分享」→「添加到主屏幕」可将游戏保存为桌面图标</Step>
      <div style={{ height: 8 }} />
      <Tip>🎁 免费额度模式会在一个模型额度用完后自动切换到下一个，每个模型约可玩 100 回合。额度在注册后 90 天内有效。</Tip>
      <Tip>💳 付费模式：自行选择模型，API Key 页面会显示对应费用。Token Plan 专属 Key（<Code>sk-sp-</Code>）暂不支持，请使用通用 <Code>sk-ws-</Code> Key。</Tip>

      <div style={{ height: 16 }} />
      <SH>其他 AI 平台（需少量充值）</SH>
      <PL emoji="🐋" name="DeepSeek Official" href="platform.deepseek.com" />
      <PL emoji="⚡" name="ChatGPT" href="platform.openai.com" />
      <PL emoji="💎" name="Gemini" href="aistudio.google.com" />
      <div style={{ height: 6 }} />
      <Tip>充值后，在对应平台的「API Keys」页面创建密钥，粘贴到游戏中即可。</Tip>

      <div style={{ height: 16 }} />
      <SH>安全提示</SH>
      <Tip>⚠️ 请勿将 Key 分享给任何人，否则余额可能被盗用。</Tip>
      <Tip>🔑 Key 丢失或泄露？在平台删除旧 Key，重新创建一个。</Tip>
      <Tip>🚧 模型无响应？切换其他模型，并使用对应平台的 Key。</Tip>
      <Tip>💡 本游戏为无盈利粉丝向作品。充值金额直接存入对应 AI 平台账户，不经过开发者。所有偶像内容均为虚构的平行宇宙创作，并不代表现实中的艺人。</Tip>
    </>
  );
}

function GuideKo() {
  return (
    <>
      <SH>🐉 알리윈 Aliyun — 무료 시작 (추천)</SH>
      <Step n={1}><A href="https://platform.qianwenai.com">platform.qianwenai.com</A> 접속 후 회원가입 및 로그인</Step>
      <Step n={2}>신규 사용자는 30개 모델마다 약 100만 토큰 무료 — 충전 없이 시작!</Step>
      <Step n={3}>콘솔에서 '무료 할당량 소진 시 중지'를 <Hi>켜서</Hi> 예상치 못한 과금을 막으세요</Step>
      <Step n={4}>"API Key" 페이지에서 키를 생성하고 복사 (<Code>sk-ws-…</Code>로 시작)</Step>
      <Step n={5}>게임에 붙여넣고 Aliyun → 🎁 무료 크레딧 선택 후 확인</Step>
      <Step n={6}>팁: 브라우저 공유 → 홈 화면에 추가로 게임을 앱 아이콘으로 저장 가능</Step>
      <div style={{ height: 8 }} />
      <Tip>🎁 무료 크레딧 모드는 한 모델이 소진되면 자동으로 다음 모델로 전환합니다. 모델당 약 100라운드, 가입 후 90일 유효.</Tip>
      <Tip>💳 유료 모드: 모델을 직접 선택하며 API Key 페이지에 비용이 표시됩니다. Token Plan 전용 키(<Code>sk-sp-</Code>)는 아직 지원되지 않으니 일반 <Code>sk-ws-</Code> 키를 사용하세요.</Tip>

      <div style={{ height: 16 }} />
      <SH>다른 AI 플랫폼 (소액 충전 필요)</SH>
      <PL emoji="🐋" name="DeepSeek Official" href="platform.deepseek.com" />
      <PL emoji="⚡" name="ChatGPT" href="platform.openai.com" />
      <PL emoji="💎" name="Gemini" href="aistudio.google.com" />
      <div style={{ height: 6 }} />
      <Tip>충전 후 해당 플랫폼의 "API Keys" 페이지에서 키를 생성하여 게임에 붙여넣으세요.</Tip>

      <div style={{ height: 16 }} />
      <SH>보안 주의사항</SH>
      <Tip>⚠️ API 키를 절대 타인과 공유하지 마세요 — 크레딧이 도용될 수 있습니다.</Tip>
      <Tip>🔑 키 분실 또는 유출 시: 플랫폼에서 기존 키 삭제 후 새로 생성하세요.</Tip>
      <Tip>🚧 모델이 응답하지 않으면 다른 모델로 전환하고 해당 플랫폼의 키를 사용하세요.</Tip>
      <Tip>💡 본 게임은 비영리 팬메이드 작품입니다. 충전한 금액은 AI 플랫폼으로 직접 입금되며 개발자에게 전달되지 않습니다. 모든 아이돌 콘텐츠는 가상의 평행세계 창작물이며 실제 아티스트를 대표하지 않습니다.</Tip>
    </>
  );
}

// ── Common Issues ─────────────────────────────────────────────────────────
function IssuesEn() {
  const c = useContext(HT);
  return (
    <>
      <IB q="Game website won't load">
        <Hi>3 fixes to try:</Hi><br />
        1. Switch browser — Android: Chrome, Edge / iPhone: Safari, Chrome, Edge<br />
        2. Switch network — toggle between Wi-Fi and mobile data<br />
        3. Try a backup site (saves are not shared across sites or browsers)
        <BL />
      </IB>
      <IB q="Game loads incompletely (only Red Velvet on cover / members fail to load)">
        <Hi>Force-refresh the page:</Hi><br />
        1. Phone: add <Code>?v=11</Code> to the end of the URL, then reload<br />
        &nbsp;&nbsp;&nbsp;PC: <Hi>Ctrl+Shift+R</Hi> (Win) / <Hi>Cmd+Shift+R</Hi> (Mac)<br />
        2. Switch to a different browser<br />
        3. Open in Incognito / Private mode
      </IB>
      <IB q="An error notice appears instead of the story">
        Each notice names the cause (key invalid, credits used up, server busy…).<br />
        → See the <Hi>Errors</Hi> tab for what each one means and how to fix it.
      </IB>
      <IB q="Can Free-credit mode charge me?">
        Only if Aliyun's <Hi>"Stop when free quota is used up"</Hi> switch is OFF — a verified account then quietly moves to pay-as-you-go.<br />
        → Turn it ON in the Aliyun console before playing.
      </IB>
      <IB q="Key lost or leaked?">
        Go to the platform where the key was created, delete the old key, and create a new one. Then update it in the game.
      </IB>
      <IB q="Arrays or raw code appearing in the story panel">
        Happens occasionally due to AI output format glitches.<br />
        → Tap the <span style={{ color: c.retryAccent, fontWeight: 600 }}>↺ Retry</span> button below the last message to regenerate.
      </IB>
      <IB q="Top bar showing incomplete or cut off">
        Enter full-screen mode to fix this:<br />
        1. Tap Share → Add to Home Screen in your browser, then launch from that icon<br />
        2. In browser settings, hide the toolbar / enable full-screen mode
      </IB>
    </>
  );
}

function IssuesZh() {
  const c = useContext(HT);
  return (
    <>
      <IB q="游戏网页加载失败">
        <Hi>三种解决方式：</Hi><br />
        1. 换浏览器：安卓推荐 Chrome、Edge；iPhone 推荐 Safari、Chrome、Edge<br />
        2. 切换网络：Wi-Fi ↔ 移动数据<br />
        3. 尝试备用网址（不同网址 / 浏览器的存档互不相通）
        <BL />
      </IB>
      <IB q="游戏加载不完整（封面只有 Red Velvet / 成员加载失败）">
        <Hi>强制刷新页面：</Hi><br />
        1. 手机：在网址末尾加上 <Code>?v=11</Code> 后重新加载<br />
        &nbsp;&nbsp;&nbsp;电脑：<Hi>Ctrl+Shift+R</Hi>（Windows）/ <Hi>Cmd+Shift+R</Hi>（Mac）<br />
        2. 更换浏览器<br />
        3. 在无痕 / 隐私模式下打开
      </IB>
      <IB q="故事区域出现报错提示">
        每条提示都会说明原因（Key 无效、额度用完、服务器繁忙等）。<br />
        → 在「<Hi>错误代码</Hi>」标签页查看每条提示的含义与解决方法。
      </IB>
      <IB q="免费额度模式会扣费吗？">
        只有在阿里云「<Hi>免费额度用完即停</Hi>」开关关闭时才会——已实名的账号会在额度用完后自动转为按量付费。<br />
        → 开始游戏前请在阿里云控制台开启该开关。
      </IB>
      <IB q="Key 丢失或泄露？">
        前往创建该 Key 的平台，删除旧 Key 并重新创建。然后在游戏中更新新的 Key。
      </IB>
      <IB q="故事面板出现大量方括号 / 原始代码">
        偶发现象，由 AI 输出格式异常引起。<br />
        → 点击最后一条消息下方的 <span style={{ color: c.retryAccent, fontWeight: 600 }}>↺ 重新生成</span> 按钮重试。
      </IB>
      <IB q="顶栏显示不完整 / 被截断">
        切换到全屏模式：<br />
        1. 在浏览器「分享」→「添加到主屏幕」，通过图标启动游戏<br />
        2. 在浏览器设置中隐藏工具栏 / 启用全屏浏览
      </IB>
    </>
  );
}

function IssuesKo() {
  const c = useContext(HT);
  return (
    <>
      <IB q="게임 웹사이트 로딩 실패">
        <Hi>3가지 해결 방법:</Hi><br />
        1. 브라우저 변경 — 안드로이드: Chrome, Edge / 아이폰: Safari, Chrome, Edge<br />
        2. 네트워크 전환 — Wi-Fi ↔ 모바일 데이터<br />
        3. 백업 사이트 이용 (사이트 / 브라우저마다 저장 데이터 다름)
        <BL />
      </IB>
      <IB q="게임 불완전 로드 (표지에 Red Velvet만 표시 / 멤버 로딩 실패)">
        <Hi>강제 새로고침:</Hi><br />
        1. 휴대폰: URL 끝에 <Code>?v=11</Code> 추가 후 새로고침<br />
        &nbsp;&nbsp;&nbsp;PC: <Hi>Ctrl+Shift+R</Hi> (Windows) / <Hi>Cmd+Shift+R</Hi> (Mac)<br />
        2. 다른 브라우저로 변경<br />
        3. 시크릿 / 프라이빗 모드로 열기
      </IB>
      <IB q="스토리 대신 오류 알림이 표시될 때">
        각 알림에 원인(키 오류, 크레딧 소진, 서버 혼잡 등)이 표시됩니다.<br />
        → <Hi>오류 코드</Hi> 탭에서 의미와 해결 방법을 확인하세요.
      </IB>
      <IB q="무료 크레딧 모드에서 요금이 청구될 수 있나요?">
        알리윈의 <Hi>'무료 할당량 소진 시 중지'</Hi> 스위치가 꺼져 있을 때만 그렇습니다 — 인증된 계정은 소진 후 자동으로 종량제로 전환됩니다.<br />
        → 플레이 전에 알리윈 콘솔에서 스위치를 켜세요.
      </IB>
      <IB q="키 분실 또는 유출 시">
        키를 생성한 플랫폼에서 기존 키를 삭제하고 새로 생성하세요. 그런 다음 게임에서 새 키로 업데이트하세요.
      </IB>
      <IB q="스토리 패널에 배열 / 코드가 표시될 때">
        AI 출력 형식 오류로 가끔 발생합니다.<br />
        → 마지막 메시지 아래의 <span style={{ color: c.retryAccent, fontWeight: 600 }}>↺ 다시 시도</span> 버튼을 클릭하여 재생성하세요.
      </IB>
      <IB q="상단 바가 잘리거나 불완전하게 표시될 때">
        전체 화면 모드 전환:<br />
        1. 브라우저에서 공유 → 홈 화면에 추가, 해당 아이콘으로 게임 실행<br />
        2. 브라우저 설정에서 툴바 숨기기 / 전체 화면 모드 활성화
      </IB>
    </>
  );
}

// ── Error Codes ───────────────────────────────────────────────────────────
// Notice lines come from t.errors, so this tab always matches what the game shows.
const ERROR_ORDER = [
  "free_all_exhausted", "free_exhausted", "balance", "auth", "token_plan_key",
  "rate_limit", "server_busy", "timeout", "network", "bad_response",
  "model_unavailable", "content_blocked", "region", "bad_request", "unknown",
];

function ErrorList({ lang, intro, help }) {
  const c = useContext(HT);
  const notices = getTranslations(lang).errors;
  return (
    <>
      <Tip>{intro}</Tip>
      {ERROR_ORDER.map(kind => (
        <div key={kind} style={{ marginBottom: 10, background: c.ibBg, border: `1px solid ${c.ibBorder}`, borderRadius: 10, padding: "9px 12px" }}>
          <div style={{ fontSize: 12, color: c.ibQ, fontWeight: 600, marginBottom: 4 }}>{notices[kind]}</div>
          <div style={{ fontSize: 11, color: c.ibA, lineHeight: 1.7 }}>{help[kind]}</div>
        </div>
      ))}
    </>
  );
}

const ERROR_HELP_EN = {
  free_all_exhausted: "Every model in the free route has used its new-user credits (or is unavailable). Switch Aliyun to 💳 Paid on the API Key page, or top up.",
  free_exhausted: "Paid mode only: the chosen model's free credits ran out and your console has \"Stop when free quota is used up\" ON. Turn that switch off to continue pay-as-you-go, or go back to 🎁 Free mode.",
  balance: "The account has no balance or an overdue bill (Aliyun Arrearage, DeepSeek 402, OpenAI credit or spend limit). Top up on the platform; the balance can take a few minutes to refresh.",
  auth: "The key is wrong, deleted, or from another platform. Aliyun keys start with sk-ws-, DeepSeek / OpenAI with sk-, Gemini with AIza. Copy the full key again, without spaces.",
  token_plan_key: "Aliyun Token Plan keys (sk-sp-) only work on the Token Plan address, which blocks requests from web pages. Create a general key (sk-ws-) instead.",
  rate_limit: "Too many requests or tokens per minute. The game already waited and retried (Free mode also tried the next model). Wait about a minute.",
  server_busy: "The provider had an internal error or is overloaded. Nothing is wrong with your key — retry shortly.",
  timeout: "No answer within 90 seconds. Common with Deep Thinking on or at peak hours. Retry, or turn Deep Thinking off.",
  network: "The request never reached the provider: offline, unstable Wi-Fi, or a blocked network. Try switching between Wi-Fi and mobile data.",
  model_unavailable: "The model isn't activated for your account or has been retired. Free mode skips it automatically for 24 hours.",
  content_blocked: "Aliyun's safety filter flagged the input or output. Retry, or pick a milder option.",
  region: "The provider doesn't offer this model in your country or region (e.g. the Gemini free tier). Use another provider.",
  bad_request: "The model rejected the request parameters. Free mode skips that model for this session. If it keeps happening, report it with the model name.",
  bad_response: "The model returned a truncated or near-empty story. The game retries automatically, then moves to another model in free mode, so you should rarely see this. If you do, switch model.",
  unknown: "An error the game doesn't recognize. Retry; if it repeats, report it from the Contact tab.",
};

const ERROR_HELP_ZH = {
  free_all_exhausted: "免费路由中所有模型的新用户额度均已用完（或暂不可用）。请在 API Key 页面将 Aliyun 切换为 💳 付费模式，或前往平台充值。",
  free_exhausted: "仅在付费模式出现：所选模型的免费额度已用完，且控制台开启了「免费额度用完即停」。关闭该开关即可按量付费继续，或切回 🎁 免费模式。",
  balance: "账户余额不足或存在欠费（阿里云 Arrearage、DeepSeek 402、OpenAI 额度或消费上限）。请前往平台充值，余额刷新可能有几分钟延迟。",
  auth: "Key 填写错误、已被删除，或属于其他平台。阿里云 Key 以 sk-ws- 开头，DeepSeek / OpenAI 以 sk- 开头，Gemini 以 AIza 开头。请重新完整复制，注意不要带空格。",
  token_plan_key: "阿里云 Token Plan 专属 Key（sk-sp-）只能用于 Token Plan 专属地址，而该地址禁止网页直接访问。请改用通用 Key（sk-ws-）。",
  rate_limit: "每分钟请求数或 Token 数超限。游戏已自动等待并重试（免费模式下还会尝试下一个模型），请等待约 1 分钟。",
  server_busy: "平台内部错误或负载过高，与你的 Key 无关，稍后重试即可。",
  timeout: "90 秒内未返回结果，开启深度思考或高峰时段较常见。请重试，或关闭深度思考。",
  network: "请求未能到达平台：断网、Wi-Fi 不稳定或网络受限。可尝试切换 Wi-Fi / 移动数据。",
  model_unavailable: "该模型未对你的账号开通或已下线。免费模式下游戏会自动跳过它 24 小时。",
  content_blocked: "阿里云内容安全审核拦截了输入或输出。请重试，或选择更温和的选项。",
  region: "该平台在你所在的国家或地区不提供此模型（例如 Gemini 免费层）。请换一个平台。",
  bad_request: "模型不接受本次请求参数。免费模式下游戏会在本次会话中跳过该模型。若反复出现，请附上模型名反馈给开发者。",
  bad_response: "模型返回了被截断或几乎空白的剧情。游戏会自动重试，免费模式下还会换下一个模型，所以你很少会看到它。若出现，请换一个模型。",
  unknown: "游戏无法识别的错误。请重试；若反复出现，请通过「联系作者」反馈。",
};

const ERROR_HELP_KO = {
  free_all_exhausted: "무료 경로의 모든 모델이 신규 사용자 크레딧을 소진했거나 사용할 수 없습니다. API Key 페이지에서 Aliyun을 💳 유료 모드로 바꾸거나 충전하세요.",
  free_exhausted: "유료 모드에서만 표시: 선택한 모델의 무료 크레딧이 소진되었고 콘솔의 '무료 할당량 소진 시 중지'가 켜져 있습니다. 스위치를 끄면 종량제로 계속할 수 있고, 🎁 무료 모드로 돌아갈 수도 있습니다.",
  balance: "잔액 부족 또는 연체 상태입니다(알리윈 Arrearage, DeepSeek 402, OpenAI 크레딧 / 지출 한도). 플랫폼에서 충전하세요. 잔액 반영까지 몇 분 걸릴 수 있습니다.",
  auth: "키가 잘못되었거나 삭제되었거나 다른 플랫폼의 키입니다. 알리윈은 sk-ws-, DeepSeek / OpenAI는 sk-, Gemini는 AIza로 시작합니다. 공백 없이 전체 키를 다시 복사하세요.",
  token_plan_key: "알리윈 Token Plan 전용 키(sk-sp-)는 Token Plan 전용 주소에서만 작동하며, 이 주소는 웹페이지의 요청을 차단합니다. 일반 키(sk-ws-)를 사용하세요.",
  rate_limit: "분당 요청 수 또는 토큰 수 한도를 초과했습니다. 게임이 이미 대기 후 재시도했습니다(무료 모드에서는 다음 모델도 시도). 약 1분 기다리세요.",
  server_busy: "플랫폼 내부 오류 또는 과부하입니다. 키 문제가 아니므로 잠시 후 다시 시도하세요.",
  timeout: "90초 안에 응답이 없었습니다. 딥씽킹 ON이나 피크 시간에 자주 발생합니다. 다시 시도하거나 딥씽킹을 끄세요.",
  network: "요청이 플랫폼에 도달하지 못했습니다: 오프라인, 불안정한 Wi-Fi, 차단된 네트워크. Wi-Fi와 모바일 데이터를 전환해 보세요.",
  model_unavailable: "계정에 개통되지 않았거나 서비스가 종료된 모델입니다. 무료 모드에서는 24시간 동안 자동으로 건너뜁니다.",
  content_blocked: "알리윈 콘텐츠 안전 필터가 입력 또는 출력을 차단했습니다. 다시 시도하거나 더 순한 선택지를 고르세요.",
  region: "해당 플랫폼이 현재 국가 / 지역에서 이 모델을 제공하지 않습니다(예: Gemini 무료 티어). 다른 플랫폼을 사용하세요.",
  bad_request: "모델이 요청 파라미터를 거부했습니다. 무료 모드에서는 이번 세션 동안 해당 모델을 건너뜁니다. 계속 발생하면 모델 이름과 함께 알려주세요.",
  bad_response: "모델이 잘리거나 거의 비어 있는 이야기를 반환했습니다. 게임이 자동으로 재시도하고 무료 모드에서는 다른 모델로 넘어가므로 거의 보이지 않습니다. 보인다면 모델을 바꿔보세요.",
  unknown: "게임이 인식하지 못한 오류입니다. 다시 시도하고, 반복되면 '문의' 탭으로 알려주세요.",
};

function ErrorsEn() {
  return <ErrorList lang="en" help={ERROR_HELP_EN} intro="Every failed round shows one of these notices. Fix the cause, then tap ↺ Retry under the notice." />;
}

function ErrorsZh() {
  return <ErrorList lang="zh" help={ERROR_HELP_ZH} intro="每次生成失败都会显示以下提示之一。解决问题后，点提示下方的 ↺ 重试 即可。" />;
}

function ErrorsKo() {
  return <ErrorList lang="ko" help={ERROR_HELP_KO} intro="생성에 실패하면 아래 알림 중 하나가 표시됩니다. 원인을 해결한 뒤 알림 아래의 ↺ 다시 시도를 누르세요." />;
}

// ── Contact ───────────────────────────────────────────────────────────────
function ContactEn() {
  const c = useContext(HT);
  return (
    <>
      <SH>Get in Touch</SH>
      <Tip>
        📹 Video guide & bug reports — 🧣 <span style={{ color: c.weiboName }}><A href="https://weibo.com/7465627856/5302472459682465">@小饼养猫中zzZ</A></span> on Weibo
      </Tip>
      <Tip>
        📧 <A href="mailto:yuhan_b@outlook.com">yuhan_b@outlook.com</A>
      </Tip>
      <Tip>
        👩‍💻 Game source code & documentation (GitHub)
        {" — "}<A href="https://github.com/byhAnita/rv-simulator">⭐ leave a star if you like it!</A>
      </Tip>
      <div style={{ height: 16 }} />
      <div style={{ fontSize: 11, color: c.disclaimerColor, lineHeight: 1.8, padding: "12px 14px", background: c.disclaimerBg, border: `1px solid ${c.disclaimerBorder}`, borderRadius: 10 }}>
        💡 This is a fan-made, non-profit game. Any credits you add go directly to the AI platform — not to the developer. All idol content is fictional parallel-universe creation and does not represent real artists. Thank you for playing! 💗
      </div>
    </>
  );
}

function ContactZh() {
  const c = useContext(HT);
  return (
    <>
      <SH>联系方式</SH>
      <Tip>
        📹 视频攻略 & 问题反馈 — 🧣 <span style={{ color: c.weiboName }}><A href="https://weibo.com/7465627856/5302472459682465">@小饼养猫中zzZ</A></span>（微博）
      </Tip>
      <Tip>
        📧 <A href="mailto:yuhan_b@outlook.com">yuhan_b@outlook.com</A>
      </Tip>
      <Tip>
        👩‍💻 游戏源码 & 文档（GitHub）
        {" — "}<A href="https://github.com/byhAnita/rv-simulator">⭐ 喜欢的话点个 Star！</A>
      </Tip>
      <div style={{ height: 16 }} />
      <div style={{ fontSize: 11, color: c.disclaimerColor, lineHeight: 1.8, padding: "12px 14px", background: c.disclaimerBg, border: `1px solid ${c.disclaimerBorder}`, borderRadius: 10 }}>
        💡 本游戏为无盈利粉丝向作品。充值金额直接存入对应 AI 平台账户，不经过开发者。所有偶像内容均为虚构的平行宇宙创作，并不代表现实中的艺人。感谢游玩！💗
      </div>
    </>
  );
}

function ContactKo() {
  const c = useContext(HT);
  return (
    <>
      <SH>문의하기</SH>
      <Tip>
        📹 영상 가이드 & 버그 제보 — 🧣 <span style={{ color: c.weiboName }}><A href="https://weibo.com/7465627856/5302472459682465">@小饼养猫中zzZ</A></span> (웨이보)
      </Tip>
      <Tip>
        📧 <A href="mailto:yuhan_b@outlook.com">yuhan_b@outlook.com</A>
      </Tip>
      <Tip>
        👩‍💻 게임 소스 코드 & 문서 (GitHub)
        {" — "}<A href="https://github.com/byhAnita/rv-simulator">⭐ 마음에 드셨다면 Star를!</A>
      </Tip>
      <div style={{ height: 16 }} />
      <div style={{ fontSize: 11, color: c.disclaimerColor, lineHeight: 1.8, padding: "12px 14px", background: c.disclaimerBg, border: `1px solid ${c.disclaimerBorder}`, borderRadius: 10 }}>
        💡 이 게임은 팬이 만든 비영리 게임입니다. 충전한 크레딧은 AI 플랫폼으로 직접 전달되며 개발자에게는 지급되지 않습니다. 모든 아이돌 콘텐츠는 가상의 평행세계 창작물이며 실제 아티스트를 대표하지 않습니다. 즐겁게 플레이해 주세요! 💗
      </div>
    </>
  );
}

// ── Tab config ────────────────────────────────────────────────────────────
const TABS = {
  zh: ["指南", "常见问题", "错误代码", "联系作者"],
  en: ["Guide", "Issues", "Errors", "Contact"],
  ko: ["가이드", "문제 해결", "오류 코드", "문의"],
};
const TITLES = { zh: "帮助中心", en: "Help Center", ko: "도움말" };
const CONTENTS = {
  zh: [GuideZh, IssuesZh, ErrorsZh, ContactZh],
  en: [GuideEn, IssuesEn, ErrorsEn, ContactEn],
  ko: [GuideKo, IssuesKo, ErrorsKo, ContactKo],
};

// ── Main export ───────────────────────────────────────────────────────────
export default function HelpOverlay({ language = "en", theme = "dark", onClose }) {
  const [tab, setTab] = useState(0);
  const lang = TABS[language] ? language : "en";
  const tabs = TABS[lang];
  const TabContent = CONTENTS[lang][tab];
  const c = theme === "light" ? LIGHT : DARK;

  return (
    <HT.Provider value={c}>
      <div
        style={{ position: "fixed", inset: 0, zIndex: 500, display: "flex", alignItems: "center", justifyContent: "center", background: c.overlay, backdropFilter: "blur(8px)" }}
        onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      >
        <div style={{ width: "92%", maxWidth: 368, maxHeight: "86vh", background: c.panelBg, border: `1px solid ${c.panelBorder}`, borderRadius: 20, boxShadow: "0 24px 64px rgba(0,0,0,.5)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "15px 18px 11px", borderBottom: `1px solid ${c.headerBorder}`, flexShrink: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: c.title }}>📖 {TITLES[lang]}</div>
            <button onClick={onClose} style={{ background: "none", border: "none", color: c.closeBtn, fontSize: 20, cursor: "pointer", lineHeight: 1, padding: "2px 4px" }}>✕</button>
          </div>

          {/* Tab bar */}
          <div style={{ display: "flex", padding: "8px 10px 0", gap: 2, borderBottom: `1px solid ${c.headerBorder}`, flexShrink: 0 }}>
            {tabs.map((label, i) => (
              <button key={i} onClick={() => setTab(i)}
                style={{ flex: 1, padding: "7px 4px", borderRadius: "8px 8px 0 0", border: "none", background: tab === i ? c.tabActiveBg : "transparent", color: tab === i ? c.tabActiveColor : c.tabInactiveColor, fontSize: 11, fontWeight: tab === i ? 700 : 400, cursor: "pointer", whiteSpace: "nowrap", borderBottom: `2px solid ${tab === i ? c.tabActiveLine : "transparent"}`, transition: "all .15s" }}>
                {label}
              </button>
            ))}
          </div>

          {/* Scrollable content */}
          <div style={{ flex: 1, overflowY: "auto", padding: "16px 16px 24px" }}>
            <style>{`::-webkit-scrollbar{width:2px}::-webkit-scrollbar-thumb{background:${c.scrollThumb}}`}</style>
            <TabContent />
          </div>
        </div>
      </div>
    </HT.Provider>
  );
}
