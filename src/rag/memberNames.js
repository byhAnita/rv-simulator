// src/rag/memberNames.js
//
// The two halves of a member's real name, derived ONCE so every reader agrees.
//
// `name_kr` is the localized legal name (zh `裴珠泫`, en `Bae Ju-hyun`, ko `배주현`).
// The derivation is the one `membersNamedIn` has always used: a name with a
// space splits there (en, and the ko spelling of a Japanese name, `히라이 모모`);
// a name without one is a one-syllable surname plus the rest (zh, ko).
//
// That rule is wrong for a known handful of members - a two-character Japanese
// surname in zh (`平井桃`), a Thai name (`拉莉莎·马诺班`), a two-syllable Chinese
// surname in ko (`저우쯔위`), a member known in Korea by her stage name (Lily,
// Ningning). Those carry `family_name` / `given_name` in their group file, which
// wins over the derivation. The overrides are facts, not prose, so they sit beside
// `name_kr` outside the zh review (docs/ZH_REVIEW.md).
//
// Both return "" when there is nothing to derive from - a custom member with no
// `name_kr` - and every caller treats "" as "say nothing", never as a name.

function split(m) {
  const nk = String(m?.name_kr || "").trim();
  if (!nk) return { family: "", given: "" };
  const i = nk.search(/\s/);
  if (i > 0) return { family: nk.slice(0, i), given: nk.slice(i).trim() };
  return { family: nk.slice(0, 1), given: nk.slice(1) };
}

export function familyNameOf(m) {
  return String(m?.family_name || "").trim() || split(m).family;
}

// What she is called by her given name: the address ladder's name in a non-idol
// world (v1.4.4 P1) and one of the forms `membersNamedIn` looks for in the prose.
// One function for both, so the name the prompt teaches is the name the matcher sees.
export function givenNameOf(m) {
  return String(m?.given_name || "").trim() || split(m).given;
}

// The name narration uses for her (v1.4.4 P1, Q2). In the idol world her stage
// name is her name; in every other world no one in the cast is an idol, so she is
// her real name, falling back to `name` for a member without one (a custom member
// with no `name_kr`). Identity backgrounds and their typical events are narration
// about her, so they render through this too - they used to print the stage name
// in every world (`集团继承人Irene`), against the narration rule two sections on.
export function narrationNameOf(m, idolWorld) {
  return (idolWorld ? m?.name : (String(m?.name_kr || "").trim() || m?.name)) || "";
}
