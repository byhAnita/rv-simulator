// The platform catalog. `world.platforms` names ids and nothing else; everything a
// platform IS lives here.
//
// This is the opposite split from `castLore`, which is world data, and the difference is
// what the text describes. `castLore` says what THIS world's organisation is called, so
// three worlds genuinely need three wordings. A platform's behaviour is the platform's:
// Instagram is "aesthetic, short caption + emoji" in a lecture hall exactly as it is in a
// practice room, so putting these rules in world files would be four copies of one
// sentence with nothing keeping them in step.
//
// A world declaring an id that is not here THROWS in `parseWorld` -- a top-bar button
// that opens nothing is worse than a load failure, and an unknown address register is
// already governed by that rule. A MODEL naming one is the opposite case and is dropped
// silently by `filterSocialByPlatforms`: authored data fails loudly, untrusted output is
// filtered. docs/V140_PLAN.md step 6, decisions 1 and 3.
//
// `promptName` is the name the PROMPT uses and `badge` the one the notification strip
// shows. They are not one string and must not be folded together: the per-platform i18n
// blocks carry a `title` too, and the private channel is titled in Hangul there because
// that is the overlay header. Reading the strip off it would retitle the strip in all
// three languages for no reason anyone asked for. Both are brand names, so neither is
// translated - which is also what the hardcoded map they replace did.
//
// `ui` is the overlay type and the i18n key, which equal the id for every social platform
// and differ for the private one: the world calls it `kakaotalk` and the app has always
// called that overlay `kakao`.

export const PLATFORMS = {
  bubble: {
    id: "bubble",
    ui: "bubble",
    icon: "\u{1F49C}",
    promptName: "bubble",
    badge: "bubble",
    schema: `"bubble":[{"content":"msg","hasPhoto":false,"photoDesc":""}]`,
    rules: () => [
      `- Bubble: member-to-fan daily sharing. 1-3 posts. Style: warm, cute, casual. A post may carry a photo.`,
    ],
    formatRules: () => [
      `- socialContent.bubble: MUST be an ARRAY like [{"content":"...","hasPhoto":false,"photoDesc":""}], NOT a string. Set hasPhoto true only when she would really attach a picture, and then photoDesc is a short phrase naming what is in it; otherwise hasPhoto is false and photoDesc is "".`,
    ],
  },

  instagram: {
    id: "instagram",
    ui: "instagram",
    icon: "\u{1F4F8}",
    promptName: "instagram",
    badge: "IG",
    schema: `"instagram":null`,
    rules: () => [
      `- Instagram: Photo social. Style: aesthetic, short caption + emoji.`,
    ],
    // The SHAPE is Instagram's and the MAGNITUDE is the world's. A schema example is
    // an instruction, so a hardcoded 800000 told a campus world that a student's post
    // gets eight hundred thousand likes - a number the player then reads in the
    // overlay. `socialReach` is the one thing about this platform that is not the same
    // in a practice room and a lecture hall.
    formatRules: ({ socialReach }) => [
      `- socialContent.instagram: MUST be an object {"caption":"...","likes":${socialReach}} or null.`,
    ],
  },

  weverse: {
    id: "weverse",
    ui: "weverse",
    icon: "\u{1F33F}",
    promptName: "weverse",
    badge: "Weverse",
    schema: `"weverse":null`,
    rules: () => [
      `- Weverse: Fan community. Style: friendly, natural.`,
    ],
    formatRules: () => [
      `- socialContent.weverse: MUST be an object {"content":"...","likes":2000,"comments":100} or null.`,
    ],
  },

  // The private channel. It is not part of `socialContent` at all -- it has its own
  // top-level `kktMessages` key, its own affection gate, and its own tail line -- so it
  // carries no `schema` fragment and is never in the social list.
  kakaotalk: {
    id: "kakaotalk",
    ui: "kakao",
    icon: "\u{1F4AC}",
    promptName: "KKT",
    badge: "KKT",
    private: true,
    schema: null,
    rules: ({ playerName }) => [
      `- KKT (KakaoTalk): Private chat, member-to-player. Style: flirty/caring/casual.`,
      `- KKT IS DELIVERED BY THE APP, NEVER BY THE STORY. Whatever you put in kktMessages is shown to ${playerName} in her own Kakao window after this round. The story therefore NEVER contains a Kakao message, a chat transcript, a phone screen lighting up, or a notification — for EVERY member, the unlocked ones included. Writing the message into the prose delivers it twice, in the wrong voice, before she has looked at her phone.`,
      `- KKT IS A LOCKED CHANNEL. [KKT Channels] in CURRENT STATE lists every member as unlocked or LOCKED. A LOCKED member has no private line to ${playerName} yet: output [] for her id. Those messages do not exist, and narrating one produces a scene about a message the player never receives.`,
    ],
    formatRules: () => [
      `- kktMessages: Object with member IDs, each value is an ARRAY of strings or empty array []. Members marked LOCKED in [KKT Channels] MUST be [].`,
    ],
  },
};

// Derived, not listed twice. A fifth platform added above joins the right set by declaring
// `private` or not, which is the only thing that distinguishes them.
export const SOCIAL_PLATFORM_IDS = Object.keys(PLATFORMS).filter((id) => !PLATFORMS[id].private);
export const PRIVATE_PLATFORM_IDS = Object.keys(PLATFORMS).filter((id) => PLATFORMS[id].private);

// Resolves a world's declaration into the catalog entries the renderers and the top bar
// consume. Order is the world's, because prompt order is a cache boundary and two answers
// to "what order" is one too many -- the same rule `rosterFromPicks` follows for chips.
export function platformsOf(world) {
  const social = (world?.platforms?.social || []).map((id) => PLATFORMS[id]).filter(Boolean);
  const priv = PLATFORMS[world?.platforms?.private] || null;
  return { social, private: priv };
}

// Drops every platform the world did not declare, per member. The model's output is
// untrusted text, so an undeclared `weverse` is data to discard and never an error: it
// must not break the round. A DECLARED platform that is absent stays absent -- filling it
// with an empty object would render a post nobody wrote.
//
// Pure and exported so it is unit-tested directly rather than only through a live round,
// the same reason `addSaveSlot` and `membersNamedIn` are.
export function filterSocialByPlatforms(socialContent, socialIds) {
  const allowed = new Set(Array.isArray(socialIds) ? socialIds : []);
  const out = {};
  for (const [mid, platforms] of Object.entries(socialContent || {})) {
    if (!platforms || typeof platforms !== "object") continue;
    const kept = {};
    for (const [pid, value] of Object.entries(platforms)) {
      if (allowed.has(pid)) kept[pid] = value;
    }
    out[mid] = kept;
  }
  return out;
}
