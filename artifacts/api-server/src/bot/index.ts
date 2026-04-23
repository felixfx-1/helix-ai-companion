import { Bot, InlineKeyboard, webhookCallback } from "grammy";
import type { Express } from "express";
import { logger } from "../lib/logger.js";
import * as DB from "./db.js";
import { callOR, callORImage, MODELS, MODEL_ALIASES } from "./openrouter.js";
import { tr, CHANGELOG_VERSION, CHANGELOG_TEXT } from "./i18n.js";
import type { Lang } from "./i18n.js";
import type { ORMessage } from "./openrouter.js";

// ─── Constants ───────────────────────────────────────────────────────────────
const BOT_USERNAME  = "AI_HELIXBoT";
const DEVELOPER_ID  = 6769891933;
const TELEGRAM_API  = "https://api.telegram.org";
const MAX_MSG_LEN   = 3800;

// Telegram 2026 message effects (premium animated stickers on messages)
const EFFECTS = {
  FIRE:    "5104841245755180586",
  LIKE:    "5107584321108051014",
  CONFETTI:"5046509860389126442",
  HEART:   "5044134455711629726",
  POOP:    "5046589136895476101",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function chunk(text: string, max = MAX_MSG_LEN): string[] {
  if (text.length <= max) return [text];
  const out: string[] = [];
  let rem = text;
  while (rem.length > 0) {
    if (rem.length <= max) { out.push(rem); break; }
    let cut = rem.lastIndexOf("\n", max);
    if (cut < max * 0.4) cut = max;
    out.push(rem.slice(0, cut));
    rem = rem.slice(cut).trimStart();
  }
  return out;
}

function parseReminder(text: string): { ms: number; body: string } | null {
  const m = text.match(/^(\d+)\s*(s|m|h|d)\s+(.+)$/is);
  if (!m) return null;
  const n = parseInt(m[1]!);
  const u = m[2]!.toLowerCase();
  const body = m[3]!.trim();
  const map: Record<string, number> = { s: 1e3, m: 6e4, h: 36e5, d: 864e5 };
  const ms = n * (map[u] ?? 6e4);
  if (ms < 5000 || ms > 7 * 864e5) return null;
  return { ms, body };
}

const PERSONAS: Record<string, string> = {
  default:  "Friendly, smart, occasionally playful. Concise for simple, thorough for complex.",
  creative: "Highly creative and imaginative. Use vivid metaphors and express enthusiasm!",
  pro:      "Formal, precise, data-driven. Business professional tone. Minimal emojis.",
  debug:    "Expert developer. Always include working code examples. Think systematically.",
  concise:  "Ultra-concise. Max 3 sentences unless code needed. Zero fluff.",
  teacher:  "Patient teacher. Step-by-step explanations with analogies. Encourage learning.",
};

const PERSONA_EMOJI: Record<string, string> = {
  default: "🤖", creative: "🎨", pro: "💼", debug: "🔧", concise: "⚡", teacher: "📚",
};

// ─── Rate limit (1.5 s per user) ─────────────────────────────────────────────
const rlMap = new Map<number, number>();
function rateLimited(uid: number): boolean {
  const last = rlMap.get(uid) ?? 0;
  if (Date.now() - last < 1500) return true;
  rlMap.set(uid, Date.now());
  return false;
}

// ─── Telegram helpers ─────────────────────────────────────────────────────────
async function tg(token: string, method: string, body: Record<string, unknown>) {
  return fetch(`${TELEGRAM_API}/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => null);
}

async function typing(token: string, chatId: number, action = "typing") {
  await tg(token, "sendChatAction", { chat_id: chatId, action });
}

async function react(token: string, chatId: number, msgId: number, emoji: string) {
  await tg(token, "setMessageReaction", {
    chat_id: chatId, message_id: msgId,
    reaction: [{ type: "emoji", emoji }],
  });
}

/** Send long message, splitting at natural break points */
async function sendLong(
  bot: Bot, chatId: number, text: string,
  extra: Record<string, unknown> = {},
) {
  const parts = chunk(text);
  for (let i = 0; i < parts.length; i++) {
    const isLast = i === parts.length - 1;
    try {
      await bot.api.sendMessage(chatId, parts[i]!, {
        parse_mode: "HTML",
        link_preview_options: { is_disabled: true },
        ...(isLast ? extra : {}),
      } as Parameters<typeof bot.api.sendMessage>[2]);
    } catch {
      // Fallback without HTML if parse failed
      try {
        const plain = parts[i]!.replace(/<[^>]+>/g, "");
        await bot.api.sendMessage(chatId, plain, {
          ...(isLast ? extra : {}),
        } as Parameters<typeof bot.api.sendMessage>[2]);
      } catch (e) {
        logger.error({ err: e }, "sendLong chunk failed");
      }
    }
  }
}

// ─── Keyboards ────────────────────────────────────────────────────────────────
function mainMenu(lang: Lang): InlineKeyboard {
  return new InlineKeyboard()
    .text("🎁 " + (lang === "ar" ? "الهدية اليومية" : "Daily Gift"),     "gift")
    .text("💰 " + (lang === "ar" ? "رصيدي"          : "My Balance"),     "tokens").row()
    .text("🧠 " + (lang === "ar" ? "المواضيع"        : "Topics"),         "topics_list")
    .text("⏰ " + (lang === "ar" ? "التذكيرات"       : "Reminders"),      "reminders_list").row()
    .text("🎭 " + (lang === "ar" ? "شخصية AI"       : "AI Persona"),     "mode_menu")
    .text("📊 " + (lang === "ar" ? "إحصائياتي"      : "My Stats"),       "stats").row()
    .text("📎 " + (lang === "ar" ? "رابط الدعوة"    : "Invite Link"),    "status_link")
    .text("🌐 " + (lang === "ar" ? "اللغة"          : "Language"),       "lang_menu").row()
    .text("🗑 "  + (lang === "ar" ? "مسح المحادثة"  : "Clear Chat"),     "clear_history")
    .text("🆕 " + (lang === "ar" ? "الجديد"         : "What's New"),     "show_updates").row()
    .text("❓ " + (lang === "ar" ? "مساعدة"         : "Help"),           "help");
}

function backBtn(lang: Lang): InlineKeyboard {
  return new InlineKeyboard().text(lang === "ar" ? "🔙 القائمة" : "🔙 Menu", "back_menu");
}

/** 2026 feature: CopyText button — lets user copy AI reply with one tap */
function copyTextBtn(text: string, label?: string): { type: "copy_text"; copy_text: { text: string }; text: string } {
  return { type: "copy_text", copy_text: { text: text.slice(0, 256) }, text: label ?? "📋 نسخ" };
}

function aiResponseKeyboard(lang: Lang, replyText: string): InlineKeyboard {
  const kb = new InlineKeyboard();
  kb.row(
    { text: lang === "ar" ? "📋 نسخ" : "📋 Copy", copy_text: { text: replyText.slice(0, 256) } } as unknown as Parameters<typeof kb.text>[0],
  );
  kb.text(lang === "ar" ? "🔙 القائمة" : "🔙 Menu", "back_menu");
  return kb;
}

// ─── System prompt ─────────────────────────────────────────────────────────────
async function buildSystem(userId: number, langPref: string): Promise<string> {
  const user       = await DB.getUser(userId);
  const prefs      = await DB.getAllPrefs(userId);
  const gh         = await DB.getGithubToken(userId);
  const activeTopic = await DB.getActiveTopic(userId);

  const langRule =
    langPref === "ar" ? "🌐 ALWAYS reply in Arabic regardless of input."
    : langPref === "en" ? "🌐 ALWAYS reply in English regardless of input."
    : "🌐 Reply in the SAME language the user wrote in.";

  const now = new Date();
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Riyadh", weekday: "long", year: "numeric",
    month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(now);

  const prefsStr = prefs.length
    ? "\n\nUser facts:\n" + prefs.map(p => `- ${p.key}: ${p.value}`).join("\n")
    : "";

  const topicCtx = activeTopic ? `\nActive topic: "${activeTopic.name}"` : "";
  const ghCtx    = gh
    ? `GitHub: connected (@${gh.githubUsername})`
    : "GitHub: not connected. If user sends a token starting with ghp_ or github_pat_, connect it automatically via [GH:connect=TOKEN].";

  const devCtx   = userId === DEVELOPER_ID
    ? "\n\n⚡ DEVELOPER: @B_BQ3. Show extra respect. Call him يا بوس or boss. Treat him as the creator."
    : "";

  const mode     = user?.mode ?? "default";
  const persona  = PERSONAS[mode] ?? PERSONAS["default"]!;

  return `You are Helix AI (@${BOT_USERNAME}) — a powerful AI assistant on Telegram, built on OpenRouter and routing between Gemini, Claude, GPT, DeepSeek and Perplexity.

${langRule}
🕒 Time (Riyadh): ${time}${topicCtx}${prefsStr}${devCtx}

${ghCtx}
🎭 Persona: ${mode} — ${persona}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FORMATTING RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Telegram HTML ONLY. Use: <b>bold</b> <i>italic</i> <code>code</code> <pre><code class="language-X">...</code></pre> <blockquote>quote</blockquote>
NEVER use markdown (**, __, ###). NEVER output raw < or > unless inside HTML tags.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
COMMAND SYSTEM (invisible to user)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Emit [CMD:...] at end of reply. System strips them. Never explain them.

MODEL ROUTING — emit BOTH lines:
  [CMD:model=ALIAS]
  [CMD:reroute=QUESTION]
  Aliases: gemini | claude | gpt | chatgpt | deepseek | perplexity | r1

OTHER COMMANDS:
  [CMD:search=QUERY]          → web search (Perplexity)
  [CMD:image=EN description]  → generate image (1 token)
  [CMD:deep=QUESTION]         → deep reasoning (DeepSeek R1 with visible chain)
  [CMD:channel=USERNAME]      → read & summarize public channel
  [CMD:quiz=TOPIC]            → interactive quiz
  [CMD:translate=LANG|TEXT]   → translate
  [CMD:remind=Xh TEXT]        → set reminder (X can be s/m/h/d)
  [CMD:stats]                 → show user stats
  [CMD:menu]                  → show main menu
  [CMD:gift]                  → daily gift
  [CMD:balance]               → token balance
  [CMD:clear]                 → clear history

GITHUB:
  [GH:repos] [GH:create=NAME] [GH:delete=NAME] [GH:files=REPO]
  [GH:read=REPO/PATH] [GH:create_file=REPO/PATH|CONTENT]
  [GH:delete_file=REPO/PATH] [GH:disconnect] [GH:connect=TOKEN]

MEMORY:
  [SAVE_PREF:KEY=VALUE]   → remember user fact
  [FORGET_PREF:KEY]       → forget fact

ROUTING RULES:
• Web/news/current events  → [CMD:model=perplexity][CMD:reroute=...]
• Code/debugging           → [CMD:model=claude][CMD:reroute=...]
• Math/logic/analysis      → [CMD:model=deepseek][CMD:reroute=...]
• Image generation request → [CMD:image=detailed English description]
• Deep reasoning request   → [CMD:deep=question]
• For simple chat          → reply directly, no reroute needed`;
}

// ─── Core AI handler ──────────────────────────────────────────────────────────
async function handleAI(
  bot: Bot, token: string, chatId: number, userId: number,
  text: string, msgId: number | undefined,
): Promise<void> {
  const user    = await DB.getUser(userId);
  const lang    = DB.uiLang(user?.languagePref);
  const topic   = await DB.getActiveTopic(userId);
  const topicId = topic?.id ?? null;

  const history = await DB.getConversationHistory(userId, topicId, 24);
  const system  = await buildSystem(userId, user?.languagePref ?? "auto");

  const msgs: ORMessage[] = [
    { role: "system", content: system },
    ...history.map(h => ({ role: h.role as "user" | "assistant", content: h.content })),
    { role: "user", content: text },
  ];

  if (msgId) void react(token, chatId, msgId, "👀");

  let raw: string;
  try {
    const res = await callOR(MODELS.DEFAULT, msgs);
    raw = res.content || (lang === "ar" ? "لا توجد نتيجة." : "No result.");
  } catch (err) {
    logger.error({ err }, "callOR failed in handleAI");
    const errMsg = lang === "ar"
      ? "⚠️ <b>خطأ مؤقت في AI</b>\n\nجميع مفاتيح OpenRouter مشغولة أو نفذت الحصة. جرّب مرة أخرى بعد ثوانٍ."
      : "⚠️ <b>Temporary AI error</b>\n\nAll OpenRouter keys are busy or quota exceeded. Try again in a few seconds.";
    await sendLong(bot, chatId, errMsg, { reply_markup: backBtn(lang) });
    return;
  }

  // Process memory commands
  for (const m of raw.matchAll(/\[SAVE_PREF:([^=\]]+)=([^\]]+)\]/g))
    await DB.setPref(userId, m[1]!.trim(), m[2]!.trim());
  for (const m of raw.matchAll(/\[FORGET_PREF:([^\]]+)\]/g))
    await DB.deletePref(userId, m[1]!.trim());

  // Extract all CMDs before stripping
  const cmdMatches = [...raw.matchAll(/\[CMD:([^=\]]+)(?:=([^\]]*))?\]/g)];
  const ghMatches  = [...raw.matchAll(/\[GH:([^=\]]+)(?:=([^\]]*))?\]/g)];

  const modelCmd  = cmdMatches.find(m => m[1]?.trim() === "model");
  const rerouteCmd= cmdMatches.find(m => m[1]?.trim() === "reroute");

  // Strip all command tags
  let reply = raw
    .replace(/\[SAVE_PREF:[^\]]+\]/g, "")
    .replace(/\[FORGET_PREF:[^\]]+\]/g, "")
    .replace(/\[CMD:[^\]]+\]/g, "")
    .replace(/\[GH:[^\]]+\]/g, "")
    .trim();

  // Save to history
  await DB.saveMessage(userId, topicId, "user", text);
  await DB.saveMessage(userId, topicId, "assistant", reply, MODELS.DEFAULT);

  // Handle model reroute
  if (modelCmd && rerouteCmd) {
    const alias   = (modelCmd[2] ?? "").trim().toLowerCase();
    const orModel = MODEL_ALIASES[alias];
    const question = (rerouteCmd[2] ?? text).trim();
    if (orModel) {
      await typing(token, chatId);
      try {
        const rerouteMsgs = msgs.slice(0, -1).concat([{ role: "user" as const, content: question }]);
        const res2 = await callOR(orModel, rerouteMsgs);
        const ans  = res2.content || (lang === "ar" ? "لا توجد نتيجة." : "No result.");
        await DB.saveMessage(userId, topicId, "assistant", ans, orModel);
        const label = `🤖 <i>via <b>${alias}</b></i>\n\n`;
        await sendLong(bot, chatId, label + ans, { reply_markup: backBtn(lang) });
        if (msgId) void react(token, chatId, msgId, "✅");
        return;
      } catch {
        // Fall through to send original reply
      }
    }
  }

  // Send reply (with copy button — Telegram v7.10 feature)
  if (reply) {
    const kb = new InlineKeyboard();
    try {
      kb.row({ text: lang === "ar" ? "📋 نسخ" : "📋 Copy", copy_text: { text: reply.replace(/<[^>]+>/g, "").slice(0, 256) } } as unknown as Parameters<typeof kb.text>[0]);
    } catch { /* copy_text may not be supported in older grammy */ }
    kb.text(lang === "ar" ? "🔙 القائمة" : "🔙 Menu", "back_menu");

    await sendLong(bot, chatId, reply, { reply_markup: kb });
  }

  // Execute remaining CMDs
  for (const m of cmdMatches) {
    const action = m[1]?.trim();
    const param  = m[2]?.trim() ?? "";
    if (!action || action === "model" || action === "reroute") continue;
    await execCmd(bot, token, chatId, userId, action, param, lang, msgId);
  }

  // GitHub commands
  for (const m of ghMatches) {
    const action = m[1]?.trim();
    const param  = m[2]?.trim() ?? "";
    if (action) await execGH(bot, chatId, userId, action, param, lang);
  }

  if (msgId) void react(token, chatId, msgId, "✅");
}

// ─── Command executor ─────────────────────────────────────────────────────────
async function execCmd(
  bot: Bot, token: string, chatId: number, userId: number,
  action: string, param: string, lang: Lang, msgId?: number,
): Promise<void> {
  switch (action) {
    case "search": {
      if (!param) return;
      await typing(token, chatId);
      await bot.api.sendMessage(chatId, lang === "ar" ? "🔍 أبحث..." : "🔍 Searching...");
      try {
        const r = await callOR(MODELS.SEARCH, [
          { role: "system", content: "Research assistant. Cite sources as [n]. Use HTML <b>. Same language as user." },
          { role: "user", content: param },
        ]);
        await sendLong(bot, chatId, `🔍 <b>${escHtml(param)}</b>\n\n${r.content}`, { reply_markup: backBtn(lang) });
      } catch {
        await bot.api.sendMessage(chatId, "❌ Search failed. Try again.");
      }
      break;
    }

    case "image":
      if (param) await doImage(bot, token, chatId, userId, param, lang);
      break;

    case "deep":
      if (param) await doDeep(bot, token, chatId, param, lang);
      break;

    case "channel":
      if (param) await doChannel(bot, chatId, param, "", lang);
      break;

    case "topic_new":
      if (param) {
        await DB.createTopic(userId, param);
        await bot.api.sendMessage(chatId, `✅ ${lang === "ar" ? "موضوع جديد:" : "New topic:"} <b>${escHtml(param)}</b>`, { parse_mode: "HTML", reply_markup: backBtn(lang) });
      }
      break;

    case "topic_list":
      await doTopicList(bot, chatId, userId, lang);
      break;

    case "quiz":
      if (param) await doQuiz(bot, token, chatId, param, lang);
      break;

    case "translate":
      if (param) {
        const [tl, ...parts] = param.split("|");
        const txt = parts.join("|").trim();
        if (txt && tl) await doTranslate(bot, token, chatId, tl, txt, lang);
      }
      break;

    case "remind":
      if (param) {
        const p = parseReminder(param);
        if (p) {
          const at = new Date(Date.now() + p.ms);
          await DB.createReminder(userId, p.body, at);
          await bot.api.sendMessage(chatId,
            `⏰ <b>${lang === "ar" ? "تذكير مُضاف" : "Reminder set"}!</b>\n⏱ ${at.toLocaleString("ar-SA", { timeZone: "Asia/Riyadh" })}\n📝 ${escHtml(p.body)}`,
            { parse_mode: "HTML" });
        }
      }
      break;

    case "stats":
      await doStats(bot, chatId, userId, lang);
      break;

    case "menu":
      await bot.api.sendMessage(chatId, lang === "ar" ? "🎛 <b>القائمة الرئيسية</b>" : "🎛 <b>Main Menu</b>", { parse_mode: "HTML", reply_markup: mainMenu(lang) });
      break;

    case "gift":
      await doGift(bot, chatId, userId, lang);
      break;

    case "balance":
      await doBalance(bot, chatId, userId, lang);
      break;

    case "clear":
      await DB.clearHistory(userId);
      await bot.api.sendMessage(chatId, lang === "ar" ? "🗑 تم مسح المحادثة." : "🗑 Chat cleared.", { reply_markup: backBtn(lang) });
      break;

    case "admin":
      if (userId === DEVELOPER_ID) await doAdmin(bot, chatId, lang);
      break;

    case "lang":
      await DB.setUserLang(userId, param);
      const nl = DB.uiLang(param);
      await bot.api.sendMessage(chatId, `✅ ${nl === "ar" ? "اللغة:" : "Language:"} <b>${param}</b>`, { parse_mode: "HTML", reply_markup: backBtn(nl) });
      break;
  }
}

// ─── GitHub executor ──────────────────────────────────────────────────────────
async function execGH(bot: Bot, chatId: number, userId: number, action: string, param: string, lang: Lang): Promise<void> {
  if (action === "connect") {
    if (!param) return;
    const r = await fetch("https://api.github.com/user", {
      headers: { Authorization: `Bearer ${param}`, "User-Agent": "HelixAI-Bot" },
    });
    if (!r.ok) { await bot.api.sendMessage(chatId, "❌ Invalid GitHub token."); return; }
    const u = (await r.json()) as { login: string };
    await DB.setGithubToken(userId, param, u.login);
    await bot.api.sendMessage(chatId, `✅ <b>GitHub connected!</b>\n👤 @${u.login}`, { parse_mode: "HTML", reply_markup: backBtn(lang) });
    return;
  }

  const gh = await DB.getGithubToken(userId);
  if (!gh) { await bot.api.sendMessage(chatId, "❌ GitHub not connected. Paste your token directly."); return; }

  const H = { Authorization: `Bearer ${gh.githubToken}`, "User-Agent": "HelixAI-Bot", Accept: "application/vnd.github.v3+json" };

  try {
    switch (action) {
      case "repos": {
        const r = await fetch("https://api.github.com/user/repos?per_page=15&sort=updated", { headers: H });
        const repos = (await r.json()) as Array<{ name: string; private: boolean; stargazers_count: number; description?: string }>;
        if (!Array.isArray(repos)) { await bot.api.sendMessage(chatId, "❌ GitHub error."); return; }
        const list = repos.map(r =>
          `${r.private ? "🔒" : "🌐"} <b>${r.name}</b> ⭐${r.stargazers_count}${r.description ? `\n   <i>${escHtml(r.description.slice(0, 60))}</i>` : ""}`
        ).join("\n");
        await sendLong(bot, chatId, `🐙 <b>Repos — @${gh.githubUsername}:</b>\n\n${list || "No repos."}`, { reply_markup: backBtn(lang) });
        break;
      }
      case "create": {
        const r = await fetch("https://api.github.com/user/repos", {
          method: "POST", headers: { ...H, "Content-Type": "application/json" },
          body: JSON.stringify({ name: param, auto_init: true }),
        });
        const d = (await r.json()) as { full_name?: string; message?: string };
        await bot.api.sendMessage(chatId, r.ok ? `✅ Created: <b>${d.full_name}</b>` : `❌ ${d.message}`, { parse_mode: "HTML" });
        break;
      }
      case "delete": {
        const r = await fetch(`https://api.github.com/repos/${gh.githubUsername}/${param}`, { method: "DELETE", headers: H });
        await bot.api.sendMessage(chatId, r.status === 204 ? `✅ Deleted: <b>${param}</b>` : `❌ Failed`, { parse_mode: "HTML" });
        break;
      }
      case "files": {
        const r = await fetch(`https://api.github.com/repos/${gh.githubUsername}/${param}/contents`, { headers: H });
        const files = (await r.json()) as Array<{ name: string; type: string; size?: number }>;
        if (!Array.isArray(files)) { await bot.api.sendMessage(chatId, "❌ Not found"); return; }
        const list = files.map(f => `${f.type === "dir" ? "📁" : "📄"} ${f.name}${f.size ? ` (${(f.size / 1024).toFixed(1)}KB)` : ""}`).join("\n");
        await sendLong(bot, chatId, `📂 <b>${param}/</b>\n\n${list}`, { reply_markup: backBtn(lang) });
        break;
      }
      case "read": {
        const [repo, ...ps] = param.split("/"); const path = ps.join("/");
        const r = await fetch(`https://api.github.com/repos/${gh.githubUsername}/${repo}/contents/${path}`, { headers: H });
        const d = (await r.json()) as { content?: string; message?: string };
        if (d.content) {
          const content = Buffer.from(d.content.replace(/\n/g, ""), "base64").toString("utf8").slice(0, 3000);
          await sendLong(bot, chatId, `📄 <b>${param}</b>\n\n<pre><code>${escHtml(content)}</code></pre>`, { reply_markup: backBtn(lang) });
        } else await bot.api.sendMessage(chatId, `❌ ${d.message || "Not found"}`);
        break;
      }
      case "create_file": {
        const [fp, ...cp] = param.split("|"); const content = cp.join("|");
        if (!fp?.includes("/")) return;
        const [repo, ...ps] = fp.split("/"); const path = ps.join("/");
        const r = await fetch(`https://api.github.com/repos/${gh.githubUsername}/${repo}/contents/${path}`, {
          method: "PUT", headers: { ...H, "Content-Type": "application/json" },
          body: JSON.stringify({ message: `Helix AI: create ${path}`, content: Buffer.from(content).toString("base64") }),
        });
        const d = (await r.json()) as { content?: { path: string }; message?: string };
        await bot.api.sendMessage(chatId, r.ok ? `✅ Created: <b>${fp}</b>` : `❌ ${d.message}`, { parse_mode: "HTML" });
        break;
      }
      case "delete_file": {
        const [repo, ...ps] = param.split("/"); const path = ps.join("/");
        const gr = await fetch(`https://api.github.com/repos/${gh.githubUsername}/${repo}/contents/${path}`, { headers: H });
        const gd = (await gr.json()) as { sha?: string };
        if (!gd.sha) { await bot.api.sendMessage(chatId, "❌ Not found"); return; }
        const r = await fetch(`https://api.github.com/repos/${gh.githubUsername}/${repo}/contents/${path}`, {
          method: "DELETE", headers: { ...H, "Content-Type": "application/json" },
          body: JSON.stringify({ message: `Helix AI: delete ${path}`, sha: gd.sha }),
        });
        await bot.api.sendMessage(chatId, r.ok ? `✅ Deleted: <b>${param}</b>` : `❌ Failed`, { parse_mode: "HTML" });
        break;
      }
      case "disconnect":
        await DB.deleteGithubToken(userId);
        await bot.api.sendMessage(chatId, "✅ GitHub disconnected.");
        break;
    }
  } catch {
    await bot.api.sendMessage(chatId, "❌ GitHub error.");
  }
}

// ─── Feature handlers ─────────────────────────────────────────────────────────
async function doGift(bot: Bot, chatId: number, userId: number, lang: Lang) {
  const r = await DB.claimDailyGift(userId);
  if (!r.ok) {
    await bot.api.sendMessage(chatId,
      lang === "ar"
        ? `⏰ استلمت هديتك! حاول بعد <b>${r.hoursLeft ?? 24} ساعة</b>.`
        : `⏰ Already claimed! Try again in <b>${r.hoursLeft ?? 24}h</b>.`,
      { parse_mode: "HTML", reply_markup: backBtn(lang) });
    return;
  }
  await bot.api.sendMessage(chatId,
    lang === "ar"
      ? `🎁 <b>الهدية اليومية!</b>\n\n+5 توكنز ✅\n💰 الرصيد: <b>${r.newBalance}</b>`
      : `🎁 <b>Daily Gift!</b>\n\n+5 tokens ✅\n💰 Balance: <b>${r.newBalance}</b>`,
    { parse_mode: "HTML", reply_markup: backBtn(lang) });
}

async function doBalance(bot: Bot, chatId: number, userId: number, lang: Lang) {
  const user = await DB.getUser(userId);
  const bal = userId === DEVELOPER_ID ? "∞ (DEV)" : `${user?.tokens ?? 0}`;
  const kb = new InlineKeyboard()
    .text(lang === "ar" ? "🎁 الهدية اليومية" : "🎁 Daily Gift", "gift")
    .text(lang === "ar" ? "📎 دعوة صديق" : "📎 Invite", "status_link").row()
    .text(lang === "ar" ? "🔙 القائمة" : "🔙 Menu", "back_menu");
  await bot.api.sendMessage(chatId,
    lang === "ar" ? `💰 <b>رصيدك:</b> <code>${bal}</code> توكن` : `💰 <b>Balance:</b> <code>${bal}</code> tokens`,
    { parse_mode: "HTML", reply_markup: kb });
}

async function doStats(bot: Bot, chatId: number, userId: number, lang: Lang) {
  const s = await DB.getUserStats(userId);
  if (!s) { await bot.api.sendMessage(chatId, "❌ User not found."); return; }
  const { user, messagesSent, topics, referrals } = s;
  const days = Math.floor((Date.now() - new Date(user.createdAt).getTime()) / 86400000);
  await sendLong(bot, chatId,
    `📊 <b>${lang === "ar" ? "إحصائياتك" : "Your Stats"}</b>

👤 <b>${escHtml(user.firstName ?? "N/A")}</b>${user.username ? ` (@${user.username})` : ""}
💰 ${lang === "ar" ? "رصيد" : "Tokens"}: <b>${userId === DEVELOPER_ID ? "∞" : user.tokens}</b>
💬 ${lang === "ar" ? "رسائل" : "Messages"}: <b>${messagesSent}</b>
📝 ${lang === "ar" ? "مواضيع" : "Topics"}: <b>${topics}</b>
👥 ${lang === "ar" ? "دعوات" : "Referrals"}: <b>${referrals}</b>
🎭 ${lang === "ar" ? "الشخصية" : "Mode"}: <b>${PERSONA_EMOJI[user.mode ?? "default"]} ${user.mode ?? "default"}</b>
📅 ${lang === "ar" ? "منذ" : "Member"}: <b>${days} ${lang === "ar" ? "يوم" : "days"}</b>`,
    { reply_markup: backBtn(lang) });
}

async function doTopicList(bot: Bot, chatId: number, userId: number, lang: Lang) {
  const topics = await DB.listTopics(userId);
  if (!topics.length) {
    await bot.api.sendMessage(chatId,
      lang === "ar" ? "📋 لا توجد مواضيع.\n<code>/topic اسم</code> لإنشاء واحد." : "📋 No topics.\n<code>/topic name</code> to create one.",
      { parse_mode: "HTML" });
    return;
  }
  const kb = new InlineKeyboard();
  for (const t of topics)
    kb.text(`${t.isActive ? "🟢" : "⚪"} ${t.name.slice(0, 24)}`, `topic_sw_${t.id}`).row();
  kb.text(lang === "ar" ? "🔙 القائمة" : "🔙 Menu", "back_menu");
  await bot.api.sendMessage(chatId,
    lang === "ar" ? "📋 <b>مواضيعك:</b>" : "📋 <b>Your Topics:</b>",
    { parse_mode: "HTML", reply_markup: kb });
}

async function doImage(bot: Bot, token: string, chatId: number, userId: number, prompt: string, lang: Lang) {
  const user = await DB.getUser(userId);
  if (!user || (user.tokens < 1 && userId !== DEVELOPER_ID)) {
    await bot.api.sendMessage(chatId,
      lang === "ar" ? `❌ <b>رصيد غير كافٍ</b>\n💰 رصيدك: <b>${user?.tokens ?? 0}</b>\n🎁 /gift` : `❌ <b>Insufficient tokens</b>\n💰 Balance: <b>${user?.tokens ?? 0}</b>\n🎁 /gift`,
      { parse_mode: "HTML" });
    return;
  }
  await typing(token, chatId, "upload_photo");
  await bot.api.sendMessage(chatId, lang === "ar" ? "🎨 جاري توليد الصورة..." : "🎨 Generating image...");

  const buf = await callORImage(MODELS.IMAGE, prompt);
  if (!buf) { await bot.api.sendMessage(chatId, "❌ Image generation failed. Try again."); return; }

  if (userId !== DEVELOPER_ID) await DB.deductTokens(userId, 1, "image", { prompt });
  const newBal = userId === DEVELOPER_ID ? "∞" : `${(user.tokens ?? 0) - 1}`;

  try {
    await bot.api.sendPhoto(chatId, new Blob([buf], { type: "image/png" }), {
      caption: `🖼 <b>${escHtml(prompt.slice(0, 500))}</b>\n💰 ${lang === "ar" ? "الرصيد" : "Balance"}: ${newBal}`,
      parse_mode: "HTML",
      show_caption_above_media: true,  // Telegram v7.5+ feature
    });
  } catch { await bot.api.sendMessage(chatId, "❌ Failed to send image."); }
}

async function doDeep(bot: Bot, token: string, chatId: number, question: string, lang: Lang) {
  await typing(token, chatId);
  await bot.api.sendMessage(chatId, lang === "ar" ? "🧠 جاري التفكير العميق..." : "🧠 Deep thinking...");
  try {
    const r = await callOR(MODELS.DEEP, [
      { role: "system", content: `Think rigorously step by step then give a clear final answer. ${lang === "ar" ? "Reply in Arabic." : "Reply in English."}` },
      { role: "user", content: question },
    ], { include_reasoning: true });

    const reasoning = (r.reasoning ?? "").trim();
    const answer    = r.content.trim() || (lang === "ar" ? "تعذّر التفكير العميق." : "Deep thinking failed.");

    if (reasoning) {
      const truncated = reasoning.length > 2500 ? reasoning.slice(0, 2500) + "…" : reasoning;
      await bot.api.sendMessage(chatId,
        `<blockquote expandable>${lang === "ar" ? "💭 سلسلة التفكير" : "💭 Reasoning chain"}:\n${escHtml(truncated)}</blockquote>`,
        { parse_mode: "HTML" }
      ).catch(async () => {
        await bot.api.sendMessage(chatId, `💭 <b>${lang === "ar" ? "التفكير" : "Reasoning"}:</b>\n<pre>${escHtml(truncated.slice(0, 1500))}</pre>`, { parse_mode: "HTML" }).catch(() => {});
      });
    }
    await sendLong(bot, chatId, `🧠 <b>${lang === "ar" ? "الإجابة النهائية:" : "Final Answer:"}</b>\n\n${answer}`, { reply_markup: backBtn(lang) });
  } catch {
    await bot.api.sendMessage(chatId, lang === "ar" ? "❌ فشل التفكير العميق." : "❌ Deep thinking failed.");
  }
}

async function doChannel(bot: Bot, chatId: number, ch: string, q: string, lang: Lang) {
  await bot.api.sendMessage(chatId, `🔎 ${lang === "ar" ? "جاري قراءة" : "Reading"} <b>@${ch}</b>…`, { parse_mode: "HTML" });
  try {
    const res = await fetch(`https://t.me/s/${ch}`, { headers: { "User-Agent": "Mozilla/5.0 HelixAI-Bot" }, signal: AbortSignal.timeout(10000) });
    if (!res.ok) { await bot.api.sendMessage(chatId, "❌ Channel not accessible."); return; }
    const html = await res.text();
    const msgs: string[] = [];
    const rx = /<div class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/g;
    let m;
    while ((m = rx.exec(html)) !== null && msgs.length < 10) {
      const t = m[1]!.replace(/<br\s*\/?>/g, "\n").replace(/<[^>]+>/g, "").trim();
      if (t) msgs.push(t);
    }
    if (!msgs.length) { await bot.api.sendMessage(chatId, "⚠️ No posts found."); return; }
    const content = msgs.slice(-8).join("\n\n---\n\n").slice(0, 8000);
    const r = await callOR(MODELS.DEFAULT, [
      { role: "system", content: "Summarize channel content. Use HTML. Reply in user language." },
      { role: "user", content: `${q ? `Question: ${q}\n\n` : ""}Posts from @${ch}:\n\n${content}` },
    ]);
    const kb = new InlineKeyboard().url(`🔗 @${ch}`, `https://t.me/${ch}`).row().text(lang === "ar" ? "🔙 القائمة" : "🔙 Menu", "back_menu");
    await sendLong(bot, chatId, `📡 <b>@${ch}</b>\n\n${r.content}`, { reply_markup: kb });
  } catch {
    await bot.api.sendMessage(chatId, "❌ Error reading channel.");
  }
}

async function doQuiz(bot: Bot, token: string, chatId: number, topic: string, lang: Lang) {
  await typing(token, chatId);
  await bot.api.sendMessage(chatId, lang === "ar" ? "🎯 جاري إنشاء الاختبار..." : "🎯 Generating quiz...");
  try {
    const r = await callOR(MODELS.DEFAULT, [
      { role: "system", content: `Create a 5-question multiple-choice quiz. Format:\n<b>Q1:</b> question\nA) opt B) opt C) opt D) opt\n✅ Answer: X — explanation\n\nReply in ${lang === "ar" ? "Arabic" : "English"}.` },
      { role: "user", content: `Quiz about: ${topic}` },
    ]);
    await sendLong(bot, chatId, `🎯 <b>Quiz: ${escHtml(topic)}</b>\n\n${r.content}`, { reply_markup: backBtn(lang) });
  } catch {
    await bot.api.sendMessage(chatId, "❌ Quiz generation failed.");
  }
}

async function doTranslate(bot: Bot, token: string, chatId: number, targetLang: string, text: string, lang: Lang) {
  await typing(token, chatId);
  try {
    const r = await callOR(MODELS.DEFAULT, [
      { role: "system", content: `Translate to ${targetLang}. Output ONLY the translation.` },
      { role: "user", content: text },
    ]);
    const kb = new InlineKeyboard();
    try { kb.row({ text: "📋 Copy", copy_text: { text: r.content.slice(0, 256) } } as unknown as Parameters<typeof kb.text>[0]); } catch {}
    kb.text(lang === "ar" ? "🔙 القائمة" : "🔙 Menu", "back_menu");
    await sendLong(bot, chatId, `🌐 <b>${targetLang.toUpperCase()}:</b>\n\n${r.content}`, { reply_markup: kb });
  } catch {
    await bot.api.sendMessage(chatId, "❌ Translation failed.");
  }
}

async function doAdmin(bot: Bot, chatId: number, lang: Lang) {
  const uc = await DB.getUserCount();
  const mc = await DB.getMessageCount();
  const kb = new InlineKeyboard()
    .text("📊 Stats", "admin_stats").text("🏆 Top", "admin_top").row()
    .text("📅 Recent", "admin_recent").text("🔙", "back_menu");
  await bot.api.sendMessage(chatId,
    `👑 <b>Helix Admin</b>\n\n👥 Users: <b>${uc}</b>\n💬 Messages: <b>${mc}</b>\n🔑 Keys: <b>20</b>\n\n<code>/admin_add ID AMT</code>\n<code>/admin_sub ID AMT</code>\n<code>/admin_set ID AMT</code>\n<code>/admin_user ID</code>\n<code>/admin_broadcast TEXT</code>\n<code>/admin_top</code>`,
    { parse_mode: "HTML", reply_markup: kb });
}

async function doMedia(
  bot: Bot, token: string, chatId: number, userId: number,
  msg: { photo?: Array<{ file_id: string }>; document?: { file_id: string; mime_type?: string }; voice?: { file_id: string }; audio?: { file_id: string }; message_id: number },
  caption: string, lang: Lang,
) {
  const isVoice = !!(msg.voice || msg.audio);
  void react(token, chatId, msg.message_id, isVoice ? "🎙" : "🔍");
  await typing(token, chatId);
  await bot.api.sendMessage(chatId, isVoice
    ? (lang === "ar" ? "🎙 جاري تحليل الصوت..." : "🎙 Analyzing voice...")
    : (lang === "ar" ? "🔍 جاري التحليل..." : "🔍 Analyzing..."));

  const fileId = msg.photo?.[msg.photo.length - 1]?.file_id
    ?? msg.document?.file_id ?? msg.voice?.file_id ?? msg.audio?.file_id;
  const mime   = msg.document?.mime_type ?? (msg.photo ? "image/jpeg" : msg.voice ? "audio/ogg" : "audio/mpeg");
  const isImg  = !!(msg.photo || mime.startsWith("image/"));

  if (!fileId) { await bot.api.sendMessage(chatId, "❌ Cannot read file."); return; }

  try {
    const fr  = await fetch(`${TELEGRAM_API}/bot${token}/getFile`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ file_id: fileId }) });
    const fd  = (await fr.json()) as { ok: boolean; result?: { file_path: string } };
    if (!fd.ok || !fd.result) { await bot.api.sendMessage(chatId, "❌ Failed to fetch file."); return; }

    const dl  = await fetch(`${TELEGRAM_API}/file/bot${token}/${fd.result.file_path}`);
    if (!dl.ok) { await bot.api.sendMessage(chatId, "❌ Download failed."); return; }

    const buf = await dl.arrayBuffer();
    const b64 = Buffer.from(buf).toString("base64");
    const q   = caption.trim() || (lang === "ar" ? "حلّل هذا بتفصيل." : "Analyze this in detail.");

    let content: ORMessage["content"];
    if (isVoice) {
      content = [
        { type: "text", text: lang === "ar" ? "افهم هذا الصوت وفسّر محتواه بالعربية." : "Transcribe and analyze this voice message." },
        { type: "image_url", image_url: { url: `data:${mime};base64,${b64}` } },
      ];
    } else if (isImg) {
      content = [
        { type: "text", text: q },
        { type: "image_url", image_url: { url: `data:${mime};base64,${b64}` } },
      ];
    } else {
      const text = new TextDecoder().decode(buf);
      content = `${q}\n\n--- File ---\n${text.slice(0, 50000)}`;
    }

    const r = await callOR(MODELS.VISION, [
      { role: "system", content: `Analyze accurately. Use HTML. ${lang === "ar" ? "Reply in Arabic." : "Reply in English."}` },
      { role: "user", content },
    ]);

    void react(token, chatId, msg.message_id, "✅");
    await sendLong(bot, chatId, r.content || "❌ Analysis failed.", { reply_markup: backBtn(lang) });
  } catch {
    await bot.api.sendMessage(chatId, "❌ Analysis failed.");
  }
}

async function doUrl(bot: Bot, token: string, chatId: number, url: string, q: string, lang: Lang) {
  await typing(token, chatId);
  await bot.api.sendMessage(chatId, lang === "ar" ? "🔗 جاري تحليل الرابط..." : "🔗 Analyzing URL...");
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 HelixAI-Bot/2.0" }, signal: AbortSignal.timeout(10000) });
    if (!res.ok) { await bot.api.sendMessage(chatId, "❌ Cannot fetch URL."); return; }
    const html = await res.text();
    const text = html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 12000);
    const r = await callOR(MODELS.DEFAULT, [
      { role: "system", content: `${q ? "Answer the question about this page." : "Summarize this web page."} Use HTML. ${lang === "ar" ? "Reply in Arabic." : "Reply in English."}` },
      { role: "user", content: `URL: ${url}\n${q ? `Question: ${q}\n` : ""}Content:\n${text}` },
    ]);
    await sendLong(bot, chatId, `🔗 <a href="${url}">${escHtml(url.slice(0, 60))}</a>\n\n${r.content}`, { reply_markup: backBtn(lang) });
  } catch {
    await bot.api.sendMessage(chatId, "❌ Cannot analyze URL.");
  }
}

// ─── buildBot — registers all handlers and returns bot instance ───────────────
async function buildBot(token: string): Promise<Bot> {
  const bot = new Bot(token);

  // Set commands list
  await bot.api.setMyCommands([
    { command: "start",      description: "بدء البوت / Start" },
    { command: "menu",       description: "القائمة الرئيسية / Main menu" },
    { command: "help",       description: "المساعدة / Help" },
    { command: "gift",       description: "🎁 هدية يومية / Daily gift" },
    { command: "tokens",     description: "💰 الرصيد / Balance" },
    { command: "topic",      description: "📝 موضوع جديد / New topic" },
    { command: "topics",     description: "📋 المواضيع / Topics list" },
    { command: "remind",     description: "⏰ تذكير / Reminder: remind 2h text" },
    { command: "reminders",  description: "📋 تذكيراتي / My reminders" },
    { command: "mode",       description: "🎭 شخصية AI / AI persona" },
    { command: "stats",      description: "📊 إحصائياتي / Stats" },
    { command: "quiz",       description: "🎯 اختبار / Quiz: quiz TOPIC" },
    { command: "translate",  description: "🌐 ترجمة / Translate: translate en TEXT" },
    { command: "clear",      description: "🗑 مسح / Clear history" },
    { command: "lang",       description: "🌐 اللغة / Language" },
    { command: "updates",    description: "🆕 الجديد / What's new" },
  ]).catch(() => {});

  // ── /start ────────────────────────────────────────────────────────────────
  bot.command("start", async (ctx) => {
    const uid  = ctx.from!.id;
    const user = await DB.getOrCreateUser(uid, ctx.from!.username, ctx.from!.firstName, ctx.from!.lastName);
    const lang = DB.uiLang(user.languagePref);

    // Handle referral
    const arg = ctx.message!.text.split(" ")[1];
    if (arg?.startsWith("ref_")) {
      const refId = parseInt(arg.replace("ref_", ""));
      if (refId !== uid && !(await DB.checkReferral(uid, refId))) {
        await DB.createReferral(uid, refId);
        await DB.addTokens(refId, 10, "referral", { from: uid });
        bot.api.sendMessage(refId, lang === "ar" ? "🎁 +10 توكنز من دعوتك! 🎉" : "🎁 +10 tokens from your invite! 🎉").catch(() => {});
      }
    }

    const txt = lang === "ar" ? `🌌 <b>أهلاً بك في Helix AI</b> 🤖

<i>ذكاء اصطناعي متكامل يعمل بـ Gemini · Claude · GPT · DeepSeek · Perplexity</i>

✨ <b>قدراتي:</b>
🧠 دردشة ذكية مع ذاكرة كاملة وسياق عميق
🎨 توليد صور احترافية (1 توكن)
🔍 بحث ويب حقيقي مع مصادر
🧠 تفكير عميق مع سلسلة تحليل مرئية
🎙 تحليل رسائل صوتية تلقائياً
🔗 تحليل أي رابط — فقط أرسله
📊 تحليل صور · PDF · ملفات نصية
🐙 تحكم كامل بـ GitHub
⏰ تذكيرات ذكية: <code>/remind 2h اسقي النباتات</code>
🎯 اختبارات تفاعلية: <code>/quiz موضوع</code>
🎭 شخصيات AI: <code>/mode creative</code>

🎁 <b>15 توكن مجاناً + 5 يومياً + 10 لكل دعوة</b>

📎 <b>رابط دعوتك:</b>
<code>https://t.me/${BOT_USERNAME}?start=ref_${uid}</code>

<i>كلّمني طبيعي بأي لغة وسأفهمك 💡</i>` : `🌌 <b>Welcome to Helix AI</b> 🤖

<i>Powered by Gemini · Claude · GPT · DeepSeek · Perplexity</i>

✨ <b>What I can do:</b>
🧠 Smart chat with full memory & deep context
🎨 Professional image generation (1 token)
🔍 Real web search with citations
🧠 Deep thinking with visible reasoning chain
🎙 Voice message analysis automatically
🔗 Analyze any URL — just send it
📊 Analyze images · PDFs · text files
🐙 Full GitHub control
⏰ Smart reminders: <code>/remind 2h water the plants</code>
🎯 Interactive quizzes: <code>/quiz topic</code>
🎭 AI personas: <code>/mode creative</code>

🎁 <b>15 free tokens + 5 daily + 10 per invite</b>

📎 <b>Your invite link:</b>
<code>https://t.me/${BOT_USERNAME}?start=ref_${uid}</code>

<i>Talk to me naturally in any language 💡</i>`;

    await sendLong(bot, ctx.chat.id, txt, { reply_markup: mainMenu(lang) });

    const seen = await DB.getPref(uid, "seen_changelog");
    if (seen !== CHANGELOG_VERSION) {
      await bot.api.sendMessage(ctx.chat.id, `🆕 <b>${lang === "ar" ? "آخر التحديثات" : "What's New"}</b>\n\n${CHANGELOG_TEXT[lang]}`, { parse_mode: "HTML", reply_markup: backBtn(lang) });
      await DB.setPref(uid, "seen_changelog", CHANGELOG_VERSION);
    }
  });

  // ── /menu ─────────────────────────────────────────────────────────────────
  bot.command("menu", async (ctx) => {
    const lang = await DB.getUserLang(ctx.from!.id);
    await ctx.reply(lang === "ar" ? "🎛 <b>القائمة الرئيسية</b>" : "🎛 <b>Main Menu</b>", { parse_mode: "HTML", reply_markup: mainMenu(lang) });
  });

  // ── /help ─────────────────────────────────────────────────────────────────
  bot.command("help", async (ctx) => {
    const uid  = ctx.from!.id;
    const lang = await DB.getUserLang(uid);
    const ar   = lang === "ar";
    await ctx.reply(`📖 <b>Helix AI — ${ar ? "المساعدة" : "Help"}</b>

${ar ? "كلّمني طبيعي بأي لغة ← أفهمك تلقائياً." : "Talk naturally in any language — I understand you."}

🧠 <b>${ar?"دردشة":"Chat"}:</b> ${ar?"أي رسالة":"any message"} ${ar?"(ذاكرة كاملة)":"(full memory)"}
🎨 <b>${ar?"صورة":"Image"}:</b> "${ar?"ارسم...":"draw..."}" ${ar?"(1 توكن)":"(1 token)"}
🔍 <b>${ar?"بحث":"Search"}:</b> "${ar?"ابحث عن...":"search for..."}"
🧠 <b>${ar?"تفكير":"Deep"}:</b> "${ar?"فكر بعمق...":"think deeply..."}"
🎙 <b>${ar?"صوت":"Voice"}:</b> ${ar?"أرسل رسالة صوتية":"send a voice message"}
🔗 <b>${ar?"رابط":"URL"}:</b> ${ar?"أرسل أي رابط":"send any URL"}
🐙 <b>GitHub:</b> ${ar?"أرسل التوكن مباشرة":"paste token directly"}
🎯 <b>/quiz</b> TOPIC
⏰ <b>/remind</b> 2h TEXT
🎭 <b>/mode</b> creative|pro|debug|teacher|concise
🌐 <b>/translate</b> en TEXT
📝 <b>/topic</b> NAME
📊 <b>/stats</b>
🎁 <b>/gift</b>

👨‍💻 @B_BQ3`, { parse_mode: "HTML", reply_markup: backBtn(lang) });
  });

  // ── /gift ─────────────────────────────────────────────────────────────────
  bot.command("gift", async (ctx) => {
    await DB.getOrCreateUser(ctx.from!.id, ctx.from!.username, ctx.from!.firstName);
    const lang = await DB.getUserLang(ctx.from!.id);
    await doGift(bot, ctx.chat.id, ctx.from!.id, lang);
  });

  // ── /tokens ───────────────────────────────────────────────────────────────
  bot.command("tokens", async (ctx) => {
    await DB.getOrCreateUser(ctx.from!.id, ctx.from!.username, ctx.from!.firstName);
    const lang = await DB.getUserLang(ctx.from!.id);
    await doBalance(bot, ctx.chat.id, ctx.from!.id, lang);
  });

  // ── /clear ────────────────────────────────────────────────────────────────
  bot.command(["clear", "reset"], async (ctx) => {
    await DB.clearHistory(ctx.from!.id);
    const lang = await DB.getUserLang(ctx.from!.id);
    await ctx.reply(lang === "ar" ? "🗑 تم مسح المحادثة." : "🗑 Chat cleared.", { reply_markup: backBtn(lang) });
  });

  // ── /lang ─────────────────────────────────────────────────────────────────
  bot.command("lang", async (ctx) => {
    const lang = await DB.getUserLang(ctx.from!.id);
    const kb = new InlineKeyboard()
      .text("🤖 " + (lang === "ar" ? "تلقائي" : "Auto"),       "lang_auto").row()
      .text("🇸🇦 العربية", "lang_ar").text("🇬🇧 English", "lang_en").row()
      .text(lang === "ar" ? "🔙 القائمة" : "🔙 Menu", "back_menu");
    await ctx.reply(lang === "ar" ? "🌐 <b>اختر لغة الواجهة:</b>" : "🌐 <b>Choose language:</b>", { parse_mode: "HTML", reply_markup: kb });
  });

  // ── /topic ────────────────────────────────────────────────────────────────
  bot.command("topic", async (ctx) => {
    const uid  = ctx.from!.id;
    const lang = await DB.getUserLang(uid);
    const name = ctx.message!.text.replace(/^\/topic\s*/i, "").trim();
    if (!name) { await ctx.reply(lang === "ar" ? "⚠️ الاستخدام: <code>/topic اسم</code>" : "⚠️ Usage: <code>/topic name</code>", { parse_mode: "HTML" }); return; }
    await DB.createTopic(uid, name);
    await ctx.reply(`✅ ${lang === "ar" ? "موضوع جديد:" : "New topic:"} <b>${escHtml(name)}</b>`, { parse_mode: "HTML", reply_markup: backBtn(lang) });
  });

  // ── /topics ───────────────────────────────────────────────────────────────
  bot.command("topics", async (ctx) => {
    const lang = await DB.getUserLang(ctx.from!.id);
    await doTopicList(bot, ctx.chat.id, ctx.from!.id, lang);
  });

  // ── /stats ────────────────────────────────────────────────────────────────
  bot.command("stats", async (ctx) => {
    await DB.getOrCreateUser(ctx.from!.id, ctx.from!.username, ctx.from!.firstName);
    const lang = await DB.getUserLang(ctx.from!.id);
    await doStats(bot, ctx.chat.id, ctx.from!.id, lang);
  });

  // ── /updates ──────────────────────────────────────────────────────────────
  bot.command("updates", async (ctx) => {
    const uid  = ctx.from!.id;
    const lang = await DB.getUserLang(uid);
    await ctx.reply(`🆕 <b>${lang === "ar" ? "آخر التحديثات" : "What's New"}</b>\n\n${CHANGELOG_TEXT[lang]}`, { parse_mode: "HTML", reply_markup: backBtn(lang) });
    await DB.setPref(uid, "seen_changelog", CHANGELOG_VERSION);
  });

  // ── /remind ───────────────────────────────────────────────────────────────
  bot.command("remind", async (ctx) => {
    await DB.getOrCreateUser(ctx.from!.id, ctx.from!.username, ctx.from!.firstName);
    const lang = await DB.getUserLang(ctx.from!.id);
    const arg  = ctx.message!.text.replace(/^\/remind\s*/i, "").trim();
    if (!arg) {
      await ctx.reply(
        lang === "ar"
          ? "❓ الاستخدام:\n<code>/remind 2h اسقي النباتات</code>\n<code>/remind 30m خذ دواءك</code>\n<code>/remind 1d راجع العمل</code>"
          : "❓ Usage:\n<code>/remind 2h water the plants</code>\n<code>/remind 30m take medicine</code>",
        { parse_mode: "HTML" }); return;
    }
    const p = parseReminder(arg);
    if (!p) { await ctx.reply(lang === "ar" ? "❌ صيغة خاطئة. مثال: <code>/remind 2h نص</code>" : "❌ Bad format. Example: <code>/remind 2h text</code>", { parse_mode: "HTML" }); return; }
    const at = new Date(Date.now() + p.ms);
    await DB.createReminder(ctx.from!.id, p.body, at);
    await ctx.reply(
      `⏰ <b>${lang === "ar" ? "تذكير مُضاف!" : "Reminder set!"}</b>\n⏱ ${at.toLocaleString("ar-SA", { timeZone: "Asia/Riyadh" })}\n📝 ${escHtml(p.body)}`,
      { parse_mode: "HTML", reply_markup: backBtn(lang) });
  });

  // ── /reminders ────────────────────────────────────────────────────────────
  bot.command("reminders", async (ctx) => {
    const uid  = ctx.from!.id;
    const lang = await DB.getUserLang(uid);
    const list = await DB.getUserReminders(uid);
    if (!list.length) { await ctx.reply(lang === "ar" ? "⏰ لا توجد تذكيرات. أضف: <code>/remind 1h نص</code>" : "⏰ No reminders. Add: <code>/remind 1h text</code>", { parse_mode: "HTML" }); return; }
    const kb = new InlineKeyboard();
    const txt = list.map((r, i) => {
      const t = new Date(r.remindAt).toLocaleString("ar-SA", { timeZone: "Asia/Riyadh" });
      kb.text(`🗑 #${i + 1}`, `del_reminder_${r.id}`).row();
      return `${i + 1}. ⏰ ${t}\n   📝 ${escHtml(r.text)}`;
    }).join("\n\n");
    kb.text(lang === "ar" ? "🔙 القائمة" : "🔙 Menu", "back_menu");
    await ctx.reply(`⏰ <b>${lang === "ar" ? "تذكيراتك:" : "Your reminders:"}</b>\n\n${txt}`, { parse_mode: "HTML", reply_markup: kb });
  });

  // ── /mode ─────────────────────────────────────────────────────────────────
  bot.command("mode", async (ctx) => {
    const uid  = ctx.from!.id;
    const lang = await DB.getUserLang(uid);
    const arg  = ctx.message!.text.replace(/^\/mode\s*/i, "").trim().toLowerCase();
    if (arg && PERSONAS[arg]) {
      await DB.setUserMode(uid, arg);
      await ctx.reply(`🎭 <b>${lang === "ar" ? "الشخصية:" : "Mode:"}</b> ${PERSONA_EMOJI[arg]} <b>${arg}</b>`, { parse_mode: "HTML", reply_markup: backBtn(lang) });
      return;
    }
    const user = await DB.getUser(uid);
    const cur  = user?.mode ?? "default";
    const kb   = new InlineKeyboard();
    for (const [k, e] of Object.entries(PERSONA_EMOJI))
      kb.text(`${e} ${k}${cur === k ? " ✓" : ""}`, `mode_${k}`).row();
    kb.text(lang === "ar" ? "🔙 القائمة" : "🔙 Menu", "back_menu");
    await ctx.reply(lang === "ar" ? "🎭 <b>اختر شخصية AI:</b>" : "🎭 <b>Choose AI persona:</b>", { parse_mode: "HTML", reply_markup: kb });
  });

  // ── /quiz ─────────────────────────────────────────────────────────────────
  bot.command("quiz", async (ctx) => {
    await DB.getOrCreateUser(ctx.from!.id, ctx.from!.username, ctx.from!.firstName);
    const lang  = await DB.getUserLang(ctx.from!.id);
    const topic = ctx.message!.text.replace(/^\/quiz\s*/i, "").trim();
    if (!topic) { await ctx.reply(lang === "ar" ? "❓ استخدام: <code>/quiz موضوع</code>" : "❓ Usage: <code>/quiz topic</code>", { parse_mode: "HTML" }); return; }
    await doQuiz(bot, token, ctx.chat.id, topic, lang);
  });

  // ── /translate ────────────────────────────────────────────────────────────
  bot.command("translate", async (ctx) => {
    await DB.getOrCreateUser(ctx.from!.id, ctx.from!.username, ctx.from!.firstName);
    const lang = await DB.getUserLang(ctx.from!.id);
    const arg  = ctx.message!.text.replace(/^\/translate\s*/i, "").trim();
    if (!arg) { await ctx.reply(lang === "ar" ? "❓ استخدام: <code>/translate en النص</code>" : "❓ Usage: <code>/translate ar text</code>", { parse_mode: "HTML" }); return; }
    const [tl, ...rest] = arg.split(" ");
    const txt = rest.join(" ").trim();
    if (!txt) { await ctx.reply("❓ /translate LANG TEXT"); return; }
    await doTranslate(bot, token, ctx.chat.id, tl ?? "en", txt, lang);
  });

  // ── /admin ────────────────────────────────────────────────────────────────
  bot.command("admin", async (ctx) => {
    if (ctx.from!.id !== DEVELOPER_ID) return;
    const lang = await DB.getUserLang(ctx.from!.id);
    await doAdmin(bot, ctx.chat.id, lang);
  });

  // ── Admin sub-commands ────────────────────────────────────────────────────
  bot.hears(/^\/admin_add\s+(\d+)\s+(\d+)/, async ctx => {
    if (ctx.from!.id !== DEVELOPER_ID) return;
    await DB.addTokens(+ctx.match[1]!, +ctx.match[2]!, "admin_add");
    await ctx.reply(`✅ +${ctx.match[2]} to ${ctx.match[1]}`);
  });
  bot.hears(/^\/admin_sub\s+(\d+)\s+(\d+)/, async ctx => {
    if (ctx.from!.id !== DEVELOPER_ID) return;
    await DB.deductTokens(+ctx.match[1]!, +ctx.match[2]!, "admin_sub");
    await ctx.reply(`✅ -${ctx.match[2]} from ${ctx.match[1]}`);
  });
  bot.hears(/^\/admin_set\s+(\d+)\s+(\d+)/, async ctx => {
    if (ctx.from!.id !== DEVELOPER_ID) return;
    await DB.setTokens(+ctx.match[1]!, +ctx.match[2]!);
    await ctx.reply(`✅ ${ctx.match[1]} = ${ctx.match[2]}`);
  });
  bot.hears(/^\/admin_user\s+(\d+)/, async ctx => {
    if (ctx.from!.id !== DEVELOPER_ID) return;
    const s = await DB.getUserStats(+ctx.match[1]!);
    if (!s) { await ctx.reply("❌ Not found."); return; }
    await ctx.reply(`👤 ${s.user.firstName ?? "N/A"} (@${s.user.username ?? "?"})\n💰 ${s.user.tokens}\n💬 ${s.messagesSent} msgs\n📝 ${s.topics} topics\n👥 ${s.referrals} refs\n🎭 ${s.user.mode}`, { parse_mode: "HTML" });
  });
  bot.hears(/^\/admin_broadcast\s+(.+)/s, async ctx => {
    if (ctx.from!.id !== DEVELOPER_ID) return;
    const msg = ctx.match[1]!.trim();
    const users = await DB.getAllActiveUsers();
    let sent = 0, failed = 0;
    const sm = await ctx.reply(`📢 Sending to ${users.length}…`);
    for (const u of users) {
      try { await bot.api.sendMessage(u.telegramId, `📢 <b>Helix AI</b>\n\n${msg}`, { parse_mode: "HTML" }); sent++; await new Promise(r => setTimeout(r, 50)); }
      catch { failed++; }
    }
    await bot.api.editMessageText(ctx.chat.id, sm.message_id, `✅ Sent: ${sent} | ❌ Failed: ${failed}`);
  });
  bot.hears(/^\/admin_top/, async ctx => {
    if (ctx.from!.id !== DEVELOPER_ID) return;
    const top = await DB.getTopUsersByTokens(10);
    const list = top.map((u, i) => `${i + 1}. <b>${escHtml(u.firstName ?? "N/A")}</b> — <b>${u.tokens}</b> 💰`).join("\n");
    await ctx.reply(`🏆 <b>Top 10:</b>\n\n${list}`, { parse_mode: "HTML" });
  });

  // ── Callback queries ──────────────────────────────────────────────────────
  bot.on("callback_query:data", async ctx => {
    const uid  = ctx.from.id;
    const chat = ctx.chat?.id ?? uid;
    const data = ctx.callbackQuery.data;
    await ctx.answerCallbackQuery().catch(() => {});
    const lang = await DB.getUserLang(uid);

    if (data === "gift")         { await doGift(bot, chat, uid, lang); return; }
    if (data === "tokens")       { await doBalance(bot, chat, uid, lang); return; }
    if (data === "stats")        { await doStats(bot, chat, uid, lang); return; }
    if (data === "back_menu")    { await ctx.reply(lang === "ar" ? "🎛 <b>القائمة</b>" : "🎛 <b>Menu</b>", { parse_mode: "HTML", reply_markup: mainMenu(lang) }); return; }
    if (data === "help")         { await ctx.reply(lang === "ar" ? "❓ /help" : "❓ /help"); return; }
    if (data === "clear_history") {
      await DB.clearHistory(uid);
      await ctx.reply(lang === "ar" ? "🗑 تم مسح المحادثة." : "🗑 Chat cleared.", { reply_markup: backBtn(lang) }); return;
    }
    if (data === "status_link") {
      await ctx.reply(
        `📎 <b>${lang === "ar" ? "رابط دعوتك:" : "Your invite:"}</b>\n\n<code>https://t.me/${BOT_USERNAME}?start=ref_${uid}</code>\n\n${lang === "ar" ? "🎁 10 توكنز لكل دعوة!" : "🎁 10 tokens per invite!"}`,
        { parse_mode: "HTML", reply_markup: backBtn(lang) }); return;
    }
    if (data === "lang_menu") {
      const kb = new InlineKeyboard()
        .text("🤖 " + (lang === "ar" ? "تلقائي" : "Auto"), "lang_auto").row()
        .text("🇸🇦 العربية", "lang_ar").text("🇬🇧 English", "lang_en").row()
        .text(lang === "ar" ? "🔙 القائمة" : "🔙 Menu", "back_menu");
      await ctx.reply(lang === "ar" ? "🌐 <b>اختر اللغة:</b>" : "🌐 <b>Choose language:</b>", { parse_mode: "HTML", reply_markup: kb }); return;
    }
    if (data.startsWith("lang_")) {
      const pref = data.replace("lang_", "");
      await DB.setUserLang(uid, pref);
      const nl = DB.uiLang(pref);
      await ctx.reply(`✅ ${nl === "ar" ? "اللغة:" : "Language:"} <b>${pref}</b>`, { parse_mode: "HTML", reply_markup: backBtn(nl) }); return;
    }
    if (data === "show_updates") {
      await ctx.reply(`🆕 <b>${lang === "ar" ? "آخر التحديثات" : "What's New"}</b>\n\n${CHANGELOG_TEXT[lang]}`, { parse_mode: "HTML", reply_markup: backBtn(lang) });
      await DB.setPref(uid, "seen_changelog", CHANGELOG_VERSION); return;
    }
    if (data === "topics_list")  { await doTopicList(bot, chat, uid, lang); return; }
    if (data === "mode_menu") {
      const user = await DB.getUser(uid);
      const cur  = user?.mode ?? "default";
      const kb   = new InlineKeyboard();
      for (const [k, e] of Object.entries(PERSONA_EMOJI))
        kb.text(`${e} ${k}${cur === k ? " ✓" : ""}`, `mode_${k}`).row();
      kb.text(lang === "ar" ? "🔙 القائمة" : "🔙 Menu", "back_menu");
      await ctx.reply(lang === "ar" ? "🎭 <b>اختر شخصية:</b>" : "🎭 <b>Choose persona:</b>", { parse_mode: "HTML", reply_markup: kb }); return;
    }
    if (data.startsWith("mode_")) {
      const m = data.replace("mode_", "");
      if (PERSONAS[m]) {
        await DB.setUserMode(uid, m);
        await ctx.reply(`🎭 ${PERSONA_EMOJI[m]} <b>${m}</b> ${lang === "ar" ? "✅ تم" : "✅ set"}`, { parse_mode: "HTML", reply_markup: backBtn(lang) });
      }
      return;
    }
    if (data === "reminders_list") {
      const list = await DB.getUserReminders(uid);
      if (!list.length) { await ctx.reply(lang === "ar" ? "⏰ لا توجد تذكيرات." : "⏰ No reminders."); return; }
      const kb = new InlineKeyboard();
      const txt = list.map((r, i) => {
        kb.text(`🗑 #${i + 1}`, `del_reminder_${r.id}`).row();
        return `${i + 1}. ⏰ ${new Date(r.remindAt).toLocaleString("ar-SA", { timeZone: "Asia/Riyadh" })}\n   📝 ${escHtml(r.text)}`;
      }).join("\n\n");
      kb.text(lang === "ar" ? "🔙 القائمة" : "🔙 Menu", "back_menu");
      await ctx.reply(`⏰ <b>${lang === "ar" ? "تذكيراتك:" : "Reminders:"}</b>\n\n${txt}`, { parse_mode: "HTML", reply_markup: kb }); return;
    }
    if (data.startsWith("del_reminder_")) {
      const id = parseInt(data.replace("del_reminder_", ""));
      await DB.deleteReminder(id, uid);
      await ctx.reply(lang === "ar" ? "✅ تم حذف التذكير." : "✅ Reminder deleted."); return;
    }
    if (data.startsWith("topic_sw_")) {
      const tid = parseInt(data.replace("topic_sw_", ""));
      await DB.switchTopic(uid, tid);
      const topics = await DB.listTopics(uid);
      const t = topics.find(t => t.id === tid);
      await ctx.reply(`🔄 ${lang === "ar" ? "تم التبديل إلى:" : "Switched to:"} <b>${escHtml(t?.name ?? "")}</b>`, { parse_mode: "HTML" }); return;
    }
    if (data === "disable_proactive") {
      const { db } = await import("@workspace/db");
      const { botUsers } = await import("@workspace/db");
      const { eq } = await import("drizzle-orm");
      await db.update(botUsers).set({ proactiveEnabled: false }).where(eq(botUsers.telegramId, uid));
      await ctx.reply(lang === "ar" ? "🔕 تم إيقاف الرسائل الاستباقية." : "🔕 Proactive messages disabled."); return;
    }
    if (data === "admin_stats")  { if (uid === DEVELOPER_ID) { const uc = await DB.getUserCount(); const mc = await DB.getMessageCount(); await ctx.reply(`📊 Users: ${uc}\n💬 Messages: ${mc}`); } return; }
    if (data === "admin_top")    { if (uid === DEVELOPER_ID) { const top = await DB.getTopUsersByTokens(10); await ctx.reply(`🏆 Top:\n${top.map((u,i)=>`${i+1}. ${u.firstName??""} — ${u.tokens}`).join("\n")}`, { reply_markup: backBtn(lang) }); } return; }
    if (data === "admin_recent") { if (uid === DEVELOPER_ID) { const r = await DB.getRecentUsers(10); await ctx.reply(r.map((u,i)=>`${i+1}. ${u.firstName??""} — ${u.lastActiveAt?.toLocaleString()??""}`).join("\n")); } return; }
  });

  // ── Message handler ───────────────────────────────────────────────────────
  bot.on("message", async ctx => {
    const msg  = ctx.message;
    const uid  = ctx.from!.id;
    const chat = ctx.chat.id;
    const isGroup = ctx.chat.type === "group" || ctx.chat.type === "supergroup";

    await DB.getOrCreateUser(uid, ctx.from!.username, ctx.from!.firstName, ctx.from!.lastName);
    const lang = await DB.getUserLang(uid);

    // Group: only respond to @mentions or replies
    if (isGroup) {
      const txt = msg.text ?? msg.caption ?? "";
      const mentioned = txt.includes(`@${BOT_USERNAME}`);
      const replied   = msg.reply_to_message?.from?.username === BOT_USERNAME;
      if (!mentioned && !replied) return;
      if (rateLimited(uid)) { await ctx.reply(lang === "ar" ? "⚠️ انتظر لحظة..." : "⚠️ Wait a moment...", { reply_parameters: { message_id: msg.message_id } }); return; }
      const clean = txt.replace(`@${BOT_USERNAME}`, "").trim();
      if (clean) { await typing(token, chat); await handleAI(bot, token, chat, uid, clean, msg.message_id); }
      return;
    }

    // Media: photos, documents, voice
    if (msg.photo || msg.voice || msg.audio ||
        (msg.document && (msg.document.mime_type?.startsWith("image/") || msg.document.mime_type === "application/pdf" || msg.document.mime_type?.startsWith("text/")))) {
      await doMedia(bot, token, chat, uid, {
        photo: msg.photo, document: msg.document,
        voice: msg.voice, audio: msg.audio, message_id: msg.message_id,
      }, msg.caption ?? "", lang);
      return;
    }

    const text = msg.text ?? "";
    if (!text) return;

    if (rateLimited(uid)) { await ctx.reply(lang === "ar" ? "⚠️ انتظر لحظة قبل الرسالة التالية." : "⚠️ Wait a moment before next message."); return; }

    // GitHub token auto-connect
    if (/^(ghp_|github_pat_)[A-Za-z0-9_]{10,}$/.test(text.trim())) {
      const r = await fetch("https://api.github.com/user", { headers: { Authorization: `Bearer ${text.trim()}`, "User-Agent": "HelixAI-Bot" } });
      if (!r.ok) { await ctx.reply("❌ Invalid GitHub token."); return; }
      const u = (await r.json()) as { login: string };
      await DB.setGithubToken(uid, text.trim(), u.login);
      await ctx.reply(`✅ <b>GitHub connected!</b>\n👤 @${u.login}`, { parse_mode: "HTML", reply_markup: backBtn(lang) });
      return;
    }

    // URL auto-analysis
    const urlMatch = text.match(/^(https?:\/\/[^\s]+)(\s+(.+))?$/);
    if (urlMatch) {
      await doUrl(bot, token, chat, uid, urlMatch[1]!, urlMatch[3] ?? "", lang);
      return;
    }

    // Telegram channel link
    const chMatch = text.match(/(?:t\.me\/)([A-Za-z][A-Za-z0-9_]{3,})/);
    const chVerb  = /(اقرأ|لخص|تصفح|read|browse|summarize)\s+.*?@([A-Za-z][A-Za-z0-9_]{3,})/i.exec(text);
    const chUser  = chMatch?.[1] ?? chVerb?.[2];
    if (chUser && chUser.toLowerCase() !== BOT_USERNAME.toLowerCase()) {
      await doChannel(bot, chat, chUser, text, lang);
      return;
    }

    // Image intent detection (Arabic + English)
    if (/^(ارسم|صمم|ولّد|ولد|اصنع|سوّ?ي|انشئ|أنشئ)\s*(لي|لنا)?\s*(صور[ةه]|رسم[ةه]|تصميم|بوستر|لوحة)/i.test(text.trim()) ||
        /^(draw|generate|create|make)\s*(me|an?)?\s*(image|picture|photo|drawing)/i.test(text.trim())) {
      const prompt = text
        .replace(/^(ارسم|صمم|ولّد|ولد|اصنع|سوّ?ي|انشئ|أنشئ)\s*(لي|لنا)?\s*(صور[ةه]|رسم[ةه]|تصميم|بوستر|لوحة)\s*(عن|ل)?\s*/i, "")
        .replace(/^(draw|generate|create|make)\s*(me|an?)?\s*(image|picture|photo|drawing)\s*(of|for)?\s*/i, "")
        .trim() || text;
      await doImage(bot, token, chat, uid, prompt, lang);
      return;
    }

    await typing(token, chat);
    await handleAI(bot, token, chat, uid, text, msg.message_id);
  });

  // ── Inline mode (v7.x) ────────────────────────────────────────────────────
  bot.on("inline_query", async ctx => {
    const q    = ctx.inlineQuery.query.trim();
    if (!q) return;
    const lang = await DB.getUserLang(ctx.from.id);
    try {
      const r = await callOR(MODELS.DEFAULT, [
        { role: "system", content: `Concise reply (max 150 chars for description). ${lang === "ar" ? "Reply in Arabic." : "Reply in English."}` },
        { role: "user", content: q },
      ]);
      await ctx.answerInlineQuery([{
        type: "article", id: "1",
        title: `🤖 ${q.slice(0, 50)}`,
        description: r.content.slice(0, 120),
        input_message_content: { message_text: `❓ <b>${escHtml(q)}</b>\n\n${r.content.slice(0, 3000)}`, parse_mode: "HTML" },
        reply_markup: new InlineKeyboard().url("🤖 Helix AI", `https://t.me/${BOT_USERNAME}`),
      }], { cache_time: 30 });
    } catch {
      await ctx.answerInlineQuery([{ type: "article", id: "err", title: "❌ Error", description: "Try again", input_message_content: { message_text: "Error" } }]);
    }
  });

  // ── Error handler ─────────────────────────────────────────────────────────
  bot.catch(err => {
    logger.error({ err: err.error }, "Unhandled bot error");
  });

  return bot;
}

// ─── setupBot — registers webhook on Express ──────────────────────────────────
export async function setupBot(app: Express): Promise<void> {
  const token = process.env["TELEGRAM_BOT_TOKEN"];
  if (!token) { logger.warn("TELEGRAM_BOT_TOKEN not set — bot disabled."); return; }

  // Build the bot (all handlers registered inside)
  const bot = await buildBot(token);

  // ── 1. Force-remove any existing webhook (kills old Supabase polling too) ──
  const delRes = await fetch(`${TELEGRAM_API}/bot${token}/deleteWebhook?drop_pending_updates=false`);
  const delData = await delRes.json() as { ok: boolean };
  logger.info({ ok: delData.ok }, "deleteWebhook");
  await new Promise(r => setTimeout(r, 1000));

  // ── 2. Determine our public URL ────────────────────────────────────────────
  //   Replit exposes REPLIT_DEV_DOMAIN for the dev environment
  const domain = process.env["REPLIT_DEV_DOMAIN"];
  if (!domain) {
    logger.warn("REPLIT_DEV_DOMAIN not set — falling back to long polling");
    startReminderScheduler(bot, token);
    startProactiveScheduler(bot, token);
    void bot.start({ onStart: () => logger.info("🤖 Helix AI Bot started (polling)"), drop_pending_updates: false });
    return;
  }

  // Webhook path uses a hash of the token for security
  const webhookPath = `/bot${Buffer.from(token).toString("base64url").slice(0, 24)}`;
  const webhookUrl  = `https://${domain}${webhookPath}`;

  // ── 3. Register webhook with Telegram ─────────────────────────────────────
  const setRes = await fetch(`${TELEGRAM_API}/bot${token}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: webhookUrl,
      allowed_updates: ["message", "callback_query", "inline_query", "chosen_inline_result"],
      drop_pending_updates: false,
      max_connections: 40,
    }),
  });
  const setData = await setRes.json() as { ok: boolean; description?: string };
  if (setData.ok) {
    logger.info({ url: webhookUrl }, "✅ Webhook set — no more 409 conflicts");
  } else {
    logger.error({ desc: setData.description }, "❌ setWebhook failed");
  }

  // ── 4. Mount grammy webhook handler on Express ────────────────────────────
  const handler = webhookCallback(bot, "express");
  app.post(webhookPath, handler);
  logger.info({ path: webhookPath }, "🤖 Helix AI Bot webhook ready");

  // ── 5. Start schedulers ───────────────────────────────────────────────────
  startReminderScheduler(bot, token);
  startProactiveScheduler(bot, token);
}

// ─── Scheduler: reminders ─────────────────────────────────────────────────────
function startReminderScheduler(bot: Bot, token: string): void {
  const run = async () => {
    try {
      const due = await DB.getPendingReminders();
      for (const r of due) {
        try {
          await bot.api.sendMessage(r.telegramId,
            `⏰ <b>تذكير!</b>\n\n${escHtml(r.text)}`,
            { parse_mode: "HTML", reply_markup: new InlineKeyboard().text("🎛 القائمة", "back_menu") });
          await DB.markReminderSent(r.id);
        } catch { /* user blocked */ }
      }
    } catch (e) { logger.error({ err: e }, "Reminder scheduler"); }
  };
  setInterval(run, 30000);
  void run();
}

// ─── Scheduler: proactive re-engagement ──────────────────────────────────────
function startProactiveScheduler(bot: Bot, token: string): void {
  const run = async () => {
    try {
      const targets = await DB.getProactiveTargets();
      for (const u of targets) {
        try {
          const r = await callOR(MODELS.DEFAULT, [
            { role: "system", content: "Generate a very short friendly Arabic message to re-engage a user. 1-2 sentences. Warm and inviting." },
            { role: "user", content: `User name: ${u.firstName ?? "صديقي"}` },
          ]);
          const msg = r.content || `أهلاً ${u.firstName ?? "بك"}! 👋 وحشتني، تعال نكمل.`;
          await bot.api.sendMessage(u.telegramId, msg, {
            reply_markup: new InlineKeyboard()
              .text("🎛 القائمة", "back_menu").row()
              .text("🔕 إيقاف", "disable_proactive"),
          });
          await DB.updateProactiveTime(u.telegramId);
          await new Promise(r => setTimeout(r, 1200));
        } catch { /* ignore */ }
      }
    } catch (e) { logger.error({ err: e }, "Proactive scheduler"); }
  };
  setInterval(run, 60 * 60 * 1000);
}

void EFFECTS; // suppress unused warning
void aiResponseKeyboard; // suppress unused
void copyTextBtn; // suppress unused
