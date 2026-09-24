// src/rag/groupLoader.js

// Group JSON is fetched at runtime from wherever the app is served, so the
// prefix must come from the build, never from the hostname. This used to be
// `hostname.includes('localhost') ? '/' : '/rv-simulator/'`, which hardcoded
// the GitHub Pages subpath and 404'd on every other host - the catch below
// then returned the Red Velvet fallback, so the cover page silently showed a
// single group on Vercel and Cloudflare.
//
// Vite sets BASE_URL from `base` in vite.config.js: './' in a build, so the
// URL resolves against the page (/rv-simulator/ on Pages, / elsewhere), and
// '/' under the dev server, which serves public/ at the root.
const base = () => import.meta.env.BASE_URL;

/**
 * Load the group index.
 * @returns {Promise<Array>} [{id, name, emoji, members_count, color}]
 */
export async function loadGroupIndex() {
  const url = `${base()}groups/index.json`;

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    console.error("Group index load failed:", error);
    return [{ id: "red_velvet", name: "Red Velvet", emoji: "💗", members_count: 5, color: "#e887b0" }];
  }
}

/**
 * Load a group's RAG config document.
 * @param {string} groupId - group id (matches the folder name)
 * @param {string} language - zh/en/ko
 * @returns {Promise<object>} parsed group config
 */
export async function loadGroupConfig(groupId = "red_velvet", language = "zh") {
  const url = `${base()}groups/${groupId}/${language}.json`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      if (language !== "zh") {
        console.warn(`${groupId}/${language}.json not found, falling back to zh.json`);
        const fallbackUrl = `${base()}groups/${groupId}/zh.json`;
        const fallbackResponse = await fetch(fallbackUrl);
        if (!fallbackResponse.ok) throw new Error(`Failed to load: HTTP ${fallbackResponse.status}`);
        const config = await fallbackResponse.json();
        return parseGroupConfig(config);
      }
      throw new Error(`Failed to load: HTTP ${response.status}`);
    }
    const config = await response.json();
    return parseGroupConfig(config);
  } catch (error) {
    console.error("RAG load failed:", error);
    throw error;
  }
}

/**
 * Parse the group config JSON into the Background the game consumes.
 */
function parseGroupConfig(config) {
  const { group, members, history } = config;

  const parsedMembers = members.map(m => ({
    id: m.id,
    emoji: m.emoji,
    name: m.name,
    name_kr: m.name_kr,
    color: m.color,
    accent: m.accent,
    animal: m.animal,
    mbti: m.mbti,
    role: m.role,
    // The address protocol in buildSystemPrompt derives Korean seniority from
    // this. It was missing from the whitelist, so every member reached the
    // prompt as the "2000-01-01" fallback — one birth year for the whole cast,
    // which made the age line uniform nonsense rather than merely inverted.
    birthday: m.birthday,
    // On the whitelist before any group JSON declares them, and that order is
    // deliberate. `habit` is authored across 27 files in step 5 and `tags` is
    // v1.4.2; adding the field here first means the content arrives working
    // rather than arriving silently dropped, which is exactly how `birthday`
    // was lost. Neither reaches the prompt yet — a `Habit:` line rendered from
    // `undefined` would move the goldens, so the prompt change ships with the
    // content that fills it.
    habit: m.habit || "",
    tags: m.tags || [],
    ig: m.ig || `${m.id}_official`,
    public_image: m.public_image || "",
    private_personality: m.private_personality || "",
    queer_texture: m.queer_texture || "",
    animal_plastic: m.animal_plastic || "",
    hidden_conflict: m.hidden_conflict || "",
  }));

  const groupLore = buildGroupLore(group, parsedMembers, history);

  return {
    group: {
      name: group.name,
      fandom: group.fandom,
      socialPlatforms: group.social_platforms || ["bubble", "instagram", "weverse"],
      privateChat: group.private_chat || "kakaotalk",
    },
    members: parsedMembers,
    groupLore,
  };
}

function buildGroupLore(group, members, history) {
  const parts = [];
  parts.push(`[${group.name} Background]`);
  parts.push(`${group.name} is a ${members.length}-member group. Fandom: ${group.fandom}.`);
  members.forEach(m => {
    parts.push(`${m.emoji} ${m.name}(${m.name_kr}) - ${m.role}, ${m.mbti}, ${m.animal_plastic}`);
    if (m.public_image) parts.push(`  Public: ${m.public_image}`);
    if (m.private_personality) parts.push(`  Private: ${m.private_personality}`);
    if (m.queer_texture) parts.push(`  Queer Texture: ${m.queer_texture}`);
  });
  if (history?.length) {
    parts.push("\n[History]");
    history.forEach(h => parts.push(`- ${h.date}: ${h.event}`));
  }
  return parts.join("\n");
}

export function getNpcMembers(allMembers, mainId, subIds) {
  return allMembers.filter(m => m.id !== mainId && !subIds.includes(m.id));
}