import type { Lang } from "./db.js";

const T: Record<string, Record<Lang, string>> = {
  error_generic: { ar: "⚠️ حدث خطأ، حاول مرة أخرى.", en: "⚠️ An error occurred, please try again." },
  did_not_understand: { ar: "لم أفهم. جرّب مرة أخرى.", en: "I did not understand. Try again." },
  rate_limit: { ar: "⚠️ الرجاء الانتظار لحظة قبل إرسال طلب جديد.", en: "⚠️ Please wait a moment before sending a new request." },

  menu_title: {
    ar: "🎛 <b>Helix AI — القائمة الرئيسية</b>\n\nكلّمني طبيعي بأي لغة وسأفهم نواياك. 🧠",
    en: "🎛 <b>Helix AI — Main Menu</b>\n\nTalk to me naturally in any language. 🧠",
  },
  btn_gift: { ar: "🎁 الهدية اليومية", en: "🎁 Daily Gift" },
  btn_balance: { ar: "💰 الرصيد", en: "💰 Balance" },
  btn_invite: { ar: "📎 رابط الدعوة", en: "📎 Invite Link" },
  btn_lang: { ar: "🌐 اللغة", en: "🌐 Language" },
  btn_clear: { ar: "🗑 مسح المحادثة", en: "🗑 Clear Chat" },
  btn_help: { ar: "❓ مساعدة", en: "❓ Help" },
  btn_updates: { ar: "🆕 التحديثات", en: "🆕 What's New" },
  btn_back_menu: { ar: "🔙 القائمة", en: "🔙 Menu" },
  btn_stats: { ar: "📊 إحصائياتي", en: "📊 My Stats" },
  btn_topics: { ar: "📝 المواضيع", en: "📝 Topics" },
  btn_reminders: { ar: "⏰ التذكيرات", en: "⏰ Reminders" },
  btn_mode: { ar: "🎭 الشخصية", en: "🎭 AI Mode" },

  lang_menu_title: {
    ar: "🌐 <b>اختر لغة الواجهة</b>\n\n• <b>تلقائي:</b> AI يرد بلغتك\n• <b>العربية:</b> كل شيء بالعربية\n• <b>English:</b> Everything in English",
    en: "🌐 <b>Choose interface language</b>\n\n• <b>Auto:</b> AI matches your input\n• <b>Arabic:</b> Arabic UI\n• <b>English:</b> English UI",
  },
  btn_lang_auto: { ar: "🤖 تلقائي", en: "🤖 Auto" },
  btn_lang_ar: { ar: "🇸🇦 العربية", en: "🇸🇦 Arabic" },
  btn_lang_en: { ar: "🇬🇧 الإنجليزية", en: "🇬🇧 English" },
  lang_set: { ar: "✅ تم تعيين اللغة:", en: "✅ Language set:" },

  welcome_title: { ar: "🌌 <b>أهلاً بك في Helix AI</b>", en: "🌌 <b>Welcome to Helix AI</b>" },
  welcome_powered: {
    ar: "ذكاء اصطناعي متطور يعمل بـ <b>Gemini</b> + <b>Claude</b> + <b>GPT</b> + <b>DeepSeek</b> + <b>Perplexity</b>.",
    en: "Advanced AI powered by <b>Gemini</b> + <b>Claude</b> + <b>GPT</b> + <b>DeepSeek</b> + <b>Perplexity</b>.",
  },
  welcome_features_title: { ar: "✨ <b>ما أستطيع فعله:</b>", en: "✨ <b>What I can do:</b>" },
  welcome_chat: { ar: "🧠 دردشة ذكية مع ذاكرة كاملة وسياق عميق", en: "🧠 Smart chat with full memory & deep context" },
  welcome_image: { ar: "🎨 توليد صور احترافية (1 توكن)", en: "🎨 Professional image generation (1 token)" },
  welcome_search: { ar: "🔍 بحث ويب حقيقي مع مصادر", en: "🔍 Real web search with citations" },
  welcome_deep: { ar: "🧠 تفكير عميق مع عرض مرئي للتحليل", en: "🧠 Deep thinking with visible reasoning" },
  welcome_analyze: { ar: "📊 تحليل صور/PDF/ملفات/روابط", en: "📊 Analyze images/PDFs/files/URLs" },
  welcome_topics: { ar: "📝 مواضيع منفصلة ومتعددة مع ذاكرة لكل موضوع", en: "📝 Separate topics with per-topic memory" },
  welcome_github: { ar: "🐙 تحكم كامل بـ GitHub", en: "🐙 Full GitHub control" },
  welcome_voice: { ar: "🎙 تحليل الرسائل الصوتية", en: "🎙 Voice message analysis" },
  welcome_remind: { ar: "⏰ تذكيرات ذكية: /remind 2h اسقي النباتات", en: "⏰ Smart reminders: /remind 2h water the plants" },
  welcome_quiz: { ar: "🎯 اختبارات AI تفاعلية: /quiz أي موضوع", en: "🎯 Interactive AI quizzes: /quiz any topic" },
  welcome_mode: { ar: "🎭 شخصيات AI متعددة: /mode creative|pro|debug", en: "🎭 Multiple AI personas: /mode creative|pro|debug" },
  welcome_tokens: { ar: "🎁 15 توكن مجاناً + 5 يومياً + 10 لكل دعوة", en: "🎁 15 free tokens + 5 daily + 10 per invite" },
  welcome_natural: { ar: "💡 <b>كلّمني طبيعي بأي لغة وسأفهمك.</b>", en: "💡 <b>Just talk to me naturally in any language.</b>" },
  welcome_invite_label: { ar: "📎 رابط دعوتك:", en: "📎 Your invite link:" },
  welcome_dev: { ar: "👨‍💻 المطور:", en: "👨‍💻 Developer:" },

  gift_no_user: { ar: "❌ أرسل /start أولاً.", en: "❌ Send /start first." },
  gift_already: { ar: "⏰ استلمت الهدية! حاول بعد", en: "⏰ Already claimed! Try again in" },
  gift_hours: { ar: "ساعة", en: "hours" },
  gift_received: { ar: "🎁 <b>الهدية اليومية!</b>\n\n+5 توكنز ✅\n💰 الرصيد:", en: "🎁 <b>Daily gift!</b>\n\n+5 tokens ✅\n💰 Balance:" },

  balance_label: { ar: "💰 <b>رصيدك:</b>", en: "💰 <b>Your balance:</b>" },
  invite_label: { ar: "📎 <b>رابط دعوتك:</b>", en: "📎 <b>Your invite link:</b>" },
  invite_share: { ar: "شارك الرابط واحصل على <b>10 توكنز</b> لكل عضو جديد!", en: "Share it and earn <b>10 tokens</b> per new user!" },

  cleared: { ar: "🗑 <b>تم المسح</b>\n\nنسيت كل شيء وأنا مستعد من جديد.", en: "🗑 <b>Cleared</b>\n\nForgot everything, ready for a fresh start." },

  insufficient: { ar: "❌ رصيدك غير كافي!\n💰 الرصيد:", en: "❌ Insufficient tokens!\n💰 Balance:" },
  generating_image: { ar: "🎨 جاري توليد الصورة...", en: "🎨 Generating image..." },
  image_failed: { ar: "❌ فشل توليد الصورة. حاول مرة أخرى.", en: "❌ Image generation failed. Try again." },

  reading_channel: { ar: "🔎 جاري قراءة", en: "🔎 Reading" },
  channel_inaccessible: { ar: "❌ القناة غير متاحة (يجب أن تكون عامة).", en: "❌ Channel not accessible (must be public)." },
  no_posts: { ar: "⚠️ لا توجد منشورات.", en: "⚠️ No posts found." },
  open_channel: { ar: "🔗 فتح", en: "🔗 Open" },
  channel_error: { ar: "❌ خطأ في قراءة القناة.", en: "❌ Error reading channel." },

  media_cant_read: { ar: "❌ لا يمكن قراءة الملف.", en: "❌ Cannot read file." },
  media_fetch_failed: { ar: "❌ فشل جلب الملف.", en: "❌ Fetch failed." },
  media_download_failed: { ar: "❌ فشل التحميل.", en: "❌ Download failed." },
  media_analysis_failed: { ar: "❌ فشل التحليل.", en: "❌ Analysis failed." },
  media_default_q: { ar: "حلّل هذا بتفصيل كامل.", en: "Analyze this in full detail." },
  analyzing_media: { ar: "🔍 جاري التحليل...", en: "🔍 Analyzing..." },
  analyzing_voice: { ar: "🎙 جاري تحليل الرسالة الصوتية...", en: "🎙 Analyzing voice message..." },

  gh_verifying: { ar: "🔄 جاري التحقق من التوكن...", en: "🔄 Verifying token..." },
  gh_invalid: { ar: "❌ التوكن غير صالح.", en: "❌ Invalid token." },
  gh_connected: { ar: "✅ تم ربط GitHub!", en: "✅ GitHub connected!" },
  gh_not_connected: { ar: "❌ GitHub غير مربوط. أرسل التوكن مباشرة.", en: "❌ GitHub not connected. Send your token directly." },
  gh_error: { ar: "❌ خطأ في GitHub.", en: "❌ GitHub error." },

  topic_name_required: { ar: "⚠️ اسم الموضوع مطلوب: <code>/topic اسم</code>", en: "⚠️ Topic name required: <code>/topic name</code>" },
  topic_new: { ar: "✅ موضوع جديد:", en: "✅ New topic:" },
  topic_none: { ar: "📋 لا توجد مواضيع. أنشئ واحداً: <code>/topic اسم</code>", en: "📋 No topics yet. Create: <code>/topic name</code>" },
  topic_list: { ar: "📋 <b>مواضيعك:</b>", en: "📋 <b>Your topics:</b>" },
  topic_switched: { ar: "🔄 تم التبديل إلى:", en: "🔄 Switched to:" },
  topic_deleted: { ar: "🗑 تم حذف الموضوع.", en: "🗑 Topic deleted." },

  via: { ar: "🤖 <i>عبر</i>", en: "🤖 <i>via</i>" },
  reroute_failed: { ar: "⚠️ فشل التبديل، أكمل بـ Gemini.", en: "⚠️ Switch failed, continuing with Gemini." },
  no_result: { ar: "لا توجد نتيجة.", en: "No result." },

  deep_failed: { ar: "تعذّر التفكير العميق.", en: "Deep thinking failed." },
  deep_final: { ar: "🧠 <b>الإجابة النهائية:</b>", en: "🧠 <b>Final answer:</b>" },
  deep_block_title: { ar: "تفكير helix", en: "helix reasoning" },
  deep_thinking: { ar: "🧠 جاري التفكير العميق...", en: "🧠 Deep thinking..." },

  reminders_off: { ar: "🔕 تم إيقاف التذكيرات.", en: "🔕 Reminders disabled." },
  reminders_on: { ar: "🔔 تم تفعيل التذكيرات.", en: "🔔 Reminders enabled." },

  admin_only: { ar: "🚫 لوحة المطور للمطور فقط.", en: "🚫 Admin panel for developer only." },

  updates_title: { ar: "🆕 <b>آخر التحديثات</b>", en: "🆕 <b>What's New</b>" },

  reminder_created: { ar: "⏰ <b>تذكير مُضاف!</b>\n\nسأذكرك عند:", en: "⏰ <b>Reminder set!</b>\n\nI'll remind you at:" },
  reminder_invalid: { ar: "❌ صيغة غير صحيحة.\n\nمثال: <code>/remind 2h اسقي النباتات</code>\nأو: <code>/remind 30m خذ دواءك</code>\nأو: <code>/remind 1d راجع العمل</code>", en: "❌ Invalid format.\n\nExample: <code>/remind 2h water the plants</code>\nOr: <code>/remind 30m take medicine</code>\nOr: <code>/remind 1d review work</code>" },
  reminder_list: { ar: "⏰ <b>تذكيراتك القادمة:</b>", en: "⏰ <b>Upcoming reminders:</b>" },
  reminder_none: { ar: "⏰ لا توجد تذكيرات. أضف واحداً: <code>/remind 1h نص</code>", en: "⏰ No reminders. Add one: <code>/remind 1h text</code>" },
  reminder_fire: { ar: "⏰ <b>تذكير!</b>\n\n", en: "⏰ <b>Reminder!</b>\n\n" },
  reminder_deleted: { ar: "✅ تم حذف التذكير.", en: "✅ Reminder deleted." },

  mode_set: { ar: "🎭 <b>تم تغيير الشخصية:</b>", en: "🎭 <b>Mode changed:</b>" },
  mode_menu: { ar: "🎭 <b>اختر شخصية AI:</b>", en: "🎭 <b>Choose AI persona:</b>" },
  btn_mode_default: { ar: "🤖 افتراضي", en: "🤖 Default" },
  btn_mode_creative: { ar: "🎨 إبداعي", en: "🎨 Creative" },
  btn_mode_pro: { ar: "💼 احترافي", en: "💼 Professional" },
  btn_mode_debug: { ar: "🔧 مطور", en: "🔧 Developer" },
  btn_mode_concise: { ar: "⚡ موجز", en: "⚡ Concise" },
  btn_mode_teacher: { ar: "📚 معلم", en: "📚 Teacher" },

  stats_title: { ar: "📊 <b>إحصائياتك:</b>", en: "📊 <b>Your Stats:</b>" },
  quiz_generating: { ar: "🎯 جاري إنشاء الاختبار...", en: "🎯 Generating quiz..." },
  translate_analyzing: { ar: "🌐 جاري الترجمة...", en: "🌐 Translating..." },
  url_analyzing: { ar: "🔗 جاري تحليل الرابط...", en: "🔗 Analyzing URL..." },
  url_error: { ar: "❌ لا يمكن جلب المحتوى.", en: "❌ Cannot fetch content." },

  thinking: { ar: "⏳ أفكر...", en: "⏳ Thinking..." },
  searching: { ar: "🔍 أبحث...", en: "🔍 Searching..." },

  group_mention_hint: { ar: "في المجموعات، ذكرني باسمي أو رد على رسائلي.", en: "In groups, mention me or reply to my messages." },
};

const CHANGELOG_VERSION = "2026-04-22.2";
const CHANGELOG_TEXT: Record<Lang, string> = {
  ar: `🆕 <b>Helix AI v2 — إصدار جديد ضخم</b>

✨ <b>الجديد في هذا الإصدار:</b>
• 🔁 تشغيل كامل على <b>Node.js</b> مع استقرار أعلى
• ⏰ نظام <b>تذكيرات ذكية</b> — /remind 2h اسقي النباتات
• 🎭 <b>شخصيات AI</b> متعددة — /mode creative|pro|debug|teacher|concise
• 📊 إحصائيات تفصيلية — /stats
• 🎯 <b>اختبارات تفاعلية</b> — /quiz أي موضوع
• 🎙 <b>تحليل الرسائل الصوتية</b> تلقائياً
• 🔗 تحليل أي رابط — فقط أرسل URL
• 🌐 ترجمة ذكية — /translate
• 📝 مواضيع محسّنة مع حذف وتبديل
• 🏆 لوحة تصدر الرموز — /admin_top
• 📢 إشعارات ذكية للمستخدمين غير النشطين
• 🛡 حماية Rate Limiting لكل مستخدم
• 💡 اقتراحات تلقائية بعد كل رد AI

اضغط 🔙 للقائمة.`,
  en: `🆕 <b>Helix AI v2 — Massive New Release</b>

✨ <b>What's new:</b>
• 🔁 Full <b>Node.js</b> rewrite for higher stability
• ⏰ <b>Smart reminders</b> — /remind 2h water the plants
• 🎭 Multiple <b>AI personas</b> — /mode creative|pro|debug|teacher|concise
• 📊 Detailed stats — /stats
• 🎯 <b>Interactive quizzes</b> — /quiz any topic
• 🎙 <b>Voice message analysis</b> automatically
• 🔗 Analyze any URL — just send a link
• 🌐 Smart translation — /translate
• 📝 Improved topics with delete & switch
• 🏆 Token leaderboard — /admin_top
• 📢 Smart re-engagement for inactive users
• 🛡 Per-user rate limiting protection
• 💡 Auto-suggestions after every AI response

Tap 🔙 for menu.`,
};

export function tr(key: string, lang: Lang): string {
  const entry = T[key];
  if (!entry) return key;
  return entry[lang] ?? entry.ar ?? key;
}

export { CHANGELOG_VERSION, CHANGELOG_TEXT };
