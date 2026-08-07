import { useState } from "react";

// ── Shared atoms ─────────────────────────────────────────────────────────
function A({ href, children }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer"
      style={{ color: "#b090e8", textDecoration: "underline", wordBreak: "break-all" }}>
      {children}
    </a>
  );
}

function SH({ children }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 700, color: "#c86dd0", letterSpacing: 0.8,
      borderBottom: "1px solid rgba(200,109,208,.2)", paddingBottom: 6,
      marginBottom: 10, marginTop: 2,
    }}>
      {children}
    </div>
  );
}

function Step({ n, children }) {
  return (
    <div style={{ display: "flex", gap: 8, marginBottom: 7, alignItems: "flex-start" }}>
      <span style={{ color: "#c86dd0", fontWeight: 700, fontSize: 13, lineHeight: 1.5, flexShrink: 0 }}>
        {"①②③④⑤⑥"[n - 1]}
      </span>
      <span style={{ fontSize: 12, color: "#d0c0e0", lineHeight: 1.65 }}>{children}</span>
    </div>
  );
}

function Tip({ children }) {
  return (
    <div style={{ fontSize: 11, color: "#9888b8", lineHeight: 1.75, marginBottom: 6 }}>
      {children}
    </div>
  );
}

function PL({ emoji, name, href }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", borderBottom: "1px solid rgba(255,255,255,.05)", fontSize: 12 }}>
      <span>{emoji}</span>
      <span style={{ color: "#d0b8d8", minWidth: 72 }}>{name}</span>
      <A href={"https://" + href}>{href}</A>
    </div>
  );
}

function IB({ q, children }) {
  return (
    <div style={{ marginBottom: 12, background: "rgba(255,255,255,.02)", border: "1px solid rgba(232,120,176,.1)", borderRadius: 10, padding: "10px 12px" }}>
      <div style={{ fontSize: 12, color: "#f0c0d0", fontWeight: 600, marginBottom: 6 }}>❓ {q}</div>
      <div style={{ fontSize: 11, color: "#9888b8", lineHeight: 1.8 }}>{children}</div>
    </div>
  );
}

function Code({ children }) {
  return (
    <code style={{ color: "#c86dd0", background: "rgba(200,109,208,.12)", padding: "1px 5px", borderRadius: 4, fontFamily: "monospace", fontSize: 11 }}>
      {children}
    </code>
  );
}

function BL() {
  return (
    <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ fontSize: 11 }}>🎮 <A href="https://rv-simulator.pages.dev">rv-simulator.pages.dev</A></div>
      <div style={{ fontSize: 11 }}>🎮 <A href="https://rv-simulator-eta.vercel.app">rv-simulator-eta.vercel.app</A></div>
    </div>
  );
}

function Hi({ children }) {
  return <span style={{ fontWeight: 600, color: "#d0b8d8" }}>{children}</span>;
}

function EmptyState({ children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "44px 20px", textAlign: "center" }}>
      <div style={{ fontSize: 34, marginBottom: 12 }}>🚧</div>
      {children}
    </div>
  );
}

// ── Guide ─────────────────────────────────────────────────────────────────
function GuideEn() {
  return (
    <>
      <SH>🐉 Qwen — Free to Start (Recommended)</SH>
      <Step n={1}>Open <A href="https://platform.qianwenai.com">platform.qianwenai.com</A> — sign up and log in</Step>
      <Step n={2}>New users get free credits — no top-up needed to get started!</Step>
      <Step n={3}>Go to "Get API Keys" → click "Create API Key"</Step>
      <Step n={4}>Copy the key shown (starts with <Code>sk-…</Code>)</Step>
      <Step n={5}>Paste it into the Key field in-game and tap Confirm</Step>
      <Step n={6}>Tip: tap Share → Add to Home Screen in your browser to save this game as an app icon</Step>
      <div style={{ height: 8 }} />
      <Tip>💰 Free credits ≈ 14 hrs of gameplay. Check usage anytime on the platform.</Tip>
      <Tip>💡 Each Qwen version (3.8-Max / 3.7-Max / 3.7-Plus) has ~14 hrs of free credits, valid 90 days after sign-up. When one runs out, switch to another — keep playing for free!</Tip>

      <div style={{ height: 16 }} />
      <SH>Other AI Platforms (small top-up required)</SH>
      <PL emoji="🐋" name="DeepSeek" href="platform.deepseek.com" />
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
      <SH>🐉 通义千问 Qwen — 免费开始（推荐）</SH>
      <Step n={1}>打开 <A href="https://platform.qianwenai.com">platform.qianwenai.com</A>，注册并登录</Step>
      <Step n={2}>新用户即享免费额度，无需充值即可开始游戏！</Step>
      <Step n={3}>进入「获取 API Key」，点击「创建 API Key」</Step>
      <Step n={4}>复制生成的 Key（以 <Code>sk-…</Code> 开头）</Step>
      <Step n={5}>粘贴到游戏中的 Key 输入框，点击确认</Step>
      <Step n={6}>提示：手机浏览器「分享」→「添加到主屏幕」可将游戏保存为桌面图标</Step>
      <div style={{ height: 8 }} />
      <Tip>💰 免费额度 ≈ 14 小时游戏时间。可在平台随时查看用量。</Tip>
      <Tip>💡 每个 Qwen 版本（3.8-Max / 3.7-Max / 3.7-Plus）各有约 14 小时免费额度，注册后 90 天内有效。一个用完后切换到另一个版本，继续免费游玩！</Tip>

      <div style={{ height: 16 }} />
      <SH>其他 AI 平台（需少量充值）</SH>
      <PL emoji="🐋" name="DeepSeek" href="platform.deepseek.com" />
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
      <SH>🐉 Qwen — 무료 시작 (추천)</SH>
      <Step n={1}><A href="https://platform.qianwenai.com">platform.qianwenai.com</A> 접속 후 회원가입 및 로그인</Step>
      <Step n={2}>신규 사용자는 무료 크레딧 제공 — 충전 없이 바로 시작 가능!</Step>
      <Step n={3}>"API Key 발급" 페이지에서 "API Key 생성" 클릭</Step>
      <Step n={4}>생성된 Key 복사 (<Code>sk-…</Code>로 시작)</Step>
      <Step n={5}>게임 내 Key 입력창에 붙여넣기 후 확인 클릭</Step>
      <Step n={6}>팁: 브라우저 공유 → 홈 화면에 추가로 게임을 앱 아이콘으로 저장 가능</Step>
      <div style={{ height: 8 }} />
      <Tip>💰 무료 크레딧 ≈ 14시간 게임 플레이. 플랫폼에서 사용량 확인 가능.</Tip>
      <Tip>💡 각 Qwen 버전 (3.8-Max / 3.7-Max / 3.7-Plus)마다 약 14시간 무료 크레딧 (가입 후 90일 유효). 한 버전 소진 시 다른 버전으로 전환하여 계속 무료 플레이!</Tip>

      <div style={{ height: 16 }} />
      <SH>다른 AI 플랫폼 (소액 충전 필요)</SH>
      <PL emoji="🐋" name="DeepSeek" href="platform.deepseek.com" />
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

      <IB q={`Start failed: "Authentication failed" or API key invalid`}>
        Your key is incorrect, or the key and model don't match.<br />
        → Return to the API Key page and double-check both the model and key.
      </IB>

      <IB q={`Start failed: "Incorrect API key provided"`}>
        Same issue — the key doesn't match the selected model.<br />
        → Make sure you copied the full key from the correct platform.
      </IB>

      <IB q={`Start failed: "Insufficient Balance"`}>
        Your credits on this model's platform are used up.<br />
        → Top up your account, or switch to a model with available credits.
      </IB>

      <IB q="Key lost or leaked?">
        Go to the platform where the key was created, delete the old key, and create a new one. Then update it in the game.
      </IB>

      <IB q="Arrays or raw code appearing in the story panel">
        Happens occasionally due to AI output format glitches.<br />
        → Tap the <span style={{ color: "#e887b0", fontWeight: 600 }}>↺ Retry</span> button below the last message to regenerate.
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

      <IB q="启动失败：Authentication failed / API key invalid">
        Key 填写有误，或 Key 与所选模型不匹配。<br />
        → 返回 API Key 设置页面，重新核对模型与 Key 是否一致。
      </IB>

      <IB q="启动失败：Incorrect API key provided">
        与上述问题相同——Key 与模型不匹配。<br />
        → 确认你从正确的平台复制了完整的 Key。
      </IB>

      <IB q="启动失败：Insufficient Balance">
        当前模型所在平台的余额已用完。<br />
        → 前往对应平台充值，或切换到有余额的其他模型。
      </IB>

      <IB q="Key 丢失或泄露？">
        前往创建该 Key 的平台，删除旧 Key 并重新创建。然后在游戏中更新新的 Key。
      </IB>

      <IB q="故事面板出现大量方括号 / 原始代码">
        偶发现象，由 AI 输出格式异常引起。<br />
        → 点击最后一条消息下方的 <span style={{ color: "#e887b0", fontWeight: 600 }}>↺ 重新生成</span> 按钮重试。
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

      <IB q={`시작 실패: "Authentication failed" 또는 API 키 오류`}>
        키가 올바르지 않거나, 키와 모델이 일치하지 않습니다.<br />
        → API Key 설정 페이지로 돌아가 모델과 키를 다시 확인하세요.
      </IB>

      <IB q={`시작 실패: "Incorrect API key provided"`}>
        동일한 문제 — 키와 선택한 모델이 일치하지 않습니다.<br />
        → 올바른 플랫폼에서 전체 키를 복사했는지 확인하세요.
      </IB>

      <IB q={`시작 실패: "Insufficient Balance"`}>
        현재 모델 플랫폼의 크레딧이 모두 소진되었습니다.<br />
        → 해당 플랫폼에서 충전하거나, 크레딧이 남은 다른 모델로 전환하세요.
      </IB>

      <IB q="키 분실 또는 유출 시">
        키를 생성한 플랫폼에서 기존 키를 삭제하고 새로 생성하세요. 그런 다음 게임에서 새 키로 업데이트하세요.
      </IB>

      <IB q="스토리 패널에 배열 / 코드가 표시될 때">
        AI 출력 형식 오류로 가끔 발생합니다.<br />
        → 마지막 메시지 아래의 <span style={{ color: "#e887b0", fontWeight: 600 }}>↺ 다시 시도</span> 버튼을 클릭하여 재생성하세요.
      </IB>

      <IB q="상단 바가 잘리거나 불완전하게 표시될 때">
        전체 화면 모드 전환:<br />
        1. 브라우저에서 공유 → 홈 화면에 추가, 해당 아이콘으로 게임 실행<br />
        2. 브라우저 설정에서 툴바 숨기기 / 전체 화면 모드 활성화
      </IB>
    </>
  );
}

// ── Error Codes (placeholder) ─────────────────────────────────────────────
function ErrorsEn() {
  return (
    <EmptyState>
      <div style={{ fontSize: 13, color: "#c898b8", fontWeight: 600, marginBottom: 8 }}>Coming Soon</div>
      <div style={{ fontSize: 11, color: "#605060", lineHeight: 1.75 }}>
        Error code documentation is being written.<br />
        For now, check the <span style={{ color: "#c86dd0" }}>Issues</span> tab for common error messages.
      </div>
    </EmptyState>
  );
}

function ErrorsZh() {
  return (
    <EmptyState>
      <div style={{ fontSize: 13, color: "#c898b8", fontWeight: 600, marginBottom: 8 }}>建设中</div>
      <div style={{ fontSize: 11, color: "#605060", lineHeight: 1.75 }}>
        错误代码文档正在撰写中。<br />
        目前请参考「<span style={{ color: "#c86dd0" }}>常见问题</span>」标签页中的常见报错信息。
      </div>
    </EmptyState>
  );
}

function ErrorsKo() {
  return (
    <EmptyState>
      <div style={{ fontSize: 13, color: "#c898b8", fontWeight: 600, marginBottom: 8 }}>준비 중</div>
      <div style={{ fontSize: 11, color: "#605060", lineHeight: 1.75 }}>
        오류 코드 문서를 작성 중입니다.<br />
        현재는 <span style={{ color: "#c86dd0" }}>문제 해결</span> 탭에서 일반적인 오류 메시지를 확인하세요.
      </div>
    </EmptyState>
  );
}

// ── Contact ───────────────────────────────────────────────────────────────
function ContactEn() {
  return (
    <>
      <SH>Get in Touch</SH>
      <Tip>
        📹 <A href="https://weibo.com/7465627856/5302472459682465">Video guide & bug reports</A> — 🧣 <span style={{ color: "#d0c0e0" }}>@小饼养猫中zzZ</span> on Weibo
      </Tip>
      <Tip>
        📧 <A href="mailto:yuhan_b@outlook.com">yuhan_b@outlook.com</A>
      </Tip>
      <Tip>
        👩‍💻 <A href="https://github.com/byhAnita/rv-simulator">Game source code & documentation</A> on GitHub
        {" — "}<A href="https://github.com/byhAnita/rv-simulator">⭐ leave a star if you like it!</A>
      </Tip>
      <div style={{ height: 16 }} />
      <div style={{ fontSize: 11, color: "#504050", lineHeight: 1.8, padding: "12px 14px", background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.06)", borderRadius: 10 }}>
        💡 This is a fan-made, non-profit game. Any credits you add go directly to the AI platform — not to the developer. All idol content is fictional parallel-universe creation and does not represent real artists. Thank you for playing! 💗
      </div>
    </>
  );
}

function ContactZh() {
  return (
    <>
      <SH>联系方式</SH>
      <Tip>
        📹 <A href="https://weibo.com/7465627856/5302472459682465">视频攻略 & 问题反馈</A> — 🧣 <span style={{ color: "#d0c0e0" }}>@小饼养猫中zzZ</span>（微博）
      </Tip>
      <Tip>
        📧 <A href="mailto:yuhan_b@outlook.com">yuhan_b@outlook.com</A>
      </Tip>
      <Tip>
        👩‍💻 <A href="https://github.com/byhAnita/rv-simulator">游戏源码 & 文档</A>（GitHub）
        {" — "}<A href="https://github.com/byhAnita/rv-simulator">⭐ 喜欢的话点个 Star！</A>
      </Tip>
      <div style={{ height: 16 }} />
      <div style={{ fontSize: 11, color: "#504050", lineHeight: 1.8, padding: "12px 14px", background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.06)", borderRadius: 10 }}>
        💡 本游戏为无盈利粉丝向作品。充值金额直接存入对应 AI 平台账户，不经过开发者。所有偶像内容均为虚构的平行宇宙创作，并不代表现实中的艺人。感谢游玩！💗
      </div>
    </>
  );
}

function ContactKo() {
  return (
    <>
      <SH>문의하기</SH>
      <Tip>
        📹 <A href="https://weibo.com/7465627856/5302472459682465">영상 가이드 & 버그 제보</A> — 🧣 <span style={{ color: "#d0c0e0" }}>@小饼养猫中zzZ</span> (웨이보)
      </Tip>
      <Tip>
        📧 <A href="mailto:yuhan_b@outlook.com">yuhan_b@outlook.com</A>
      </Tip>
      <Tip>
        👩‍💻 <A href="https://github.com/byhAnita/rv-simulator">게임 소스 코드 & 문서</A> (GitHub)
        {" — "}<A href="https://github.com/byhAnita/rv-simulator">⭐ 마음에 드셨다면 Star를!</A>
      </Tip>
      <div style={{ height: 16 }} />
      <div style={{ fontSize: 11, color: "#504050", lineHeight: 1.8, padding: "12px 14px", background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.06)", borderRadius: 10 }}>
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
export default function HelpOverlay({ language = "en", onClose }) {
  const [tab, setTab] = useState(0);
  const lang = TABS[language] ? language : "en";
  const tabs = TABS[lang];
  const TabContent = CONTENTS[lang][tab];

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 500, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,.82)", backdropFilter: "blur(8px)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        width: "92%", maxWidth: 368,
        maxHeight: "86vh",
        background: "#0e061a",
        border: "1px solid rgba(200,109,208,.35)",
        borderRadius: 20,
        boxShadow: "0 24px 64px rgba(0,0,0,.75)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "15px 18px 11px", borderBottom: "1px solid rgba(200,109,208,.15)", flexShrink: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#f8c8d8" }}>📖 {TITLES[lang]}</div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#907080", fontSize: 20, cursor: "pointer", lineHeight: 1, padding: "2px 4px" }}>✕</button>
        </div>

        {/* Tab bar */}
        <div style={{ display: "flex", padding: "8px 10px 0", gap: 2, borderBottom: "1px solid rgba(200,109,208,.1)", flexShrink: 0 }}>
          {tabs.map((label, i) => (
            <button key={i} onClick={() => setTab(i)}
              style={{
                flex: 1, padding: "7px 4px",
                borderRadius: "8px 8px 0 0",
                border: "none",
                background: tab === i ? "rgba(200,109,208,.15)" : "transparent",
                color: tab === i ? "#e8b8f0" : "#605060",
                fontSize: 11, fontWeight: tab === i ? 700 : 400,
                cursor: "pointer", whiteSpace: "nowrap",
                borderBottom: tab === i ? "2px solid #c86dd0" : "2px solid transparent",
                transition: "all .15s",
              }}>
              {label}
            </button>
          ))}
        </div>

        {/* Scrollable content */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 16px 24px" }}>
          <TabContent />
        </div>
      </div>
    </div>
  );
}
