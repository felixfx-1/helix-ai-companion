import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  serial,
  jsonb,
  bigint,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const botUsers = pgTable(
  "bot_users",
  {
    id: serial("id").primaryKey(),
    telegramId: bigint("telegram_id", { mode: "number" }).notNull().unique(),
    username: text("username"),
    firstName: text("first_name"),
    lastName: text("last_name"),
    languagePref: text("language_pref").notNull().default("auto"),
    tokens: integer("tokens").notNull().default(15),
    isChannelMember: boolean("is_channel_member").notNull().default(false),
    proactiveEnabled: boolean("proactive_enabled").notNull().default(true),
    referredBy: bigint("referred_by", { mode: "number" }),
    lastDailyGift: timestamp("last_daily_gift"),
    lastProactiveAt: timestamp("last_proactive_at"),
    lastActiveAt: timestamp("last_active_at"),
    mode: text("mode").notNull().default("default"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("bot_users_telegram_id_idx").on(t.telegramId)],
);

export const botConversations = pgTable(
  "bot_conversations",
  {
    id: serial("id").primaryKey(),
    telegramId: bigint("telegram_id", { mode: "number" }).notNull(),
    topicId: integer("topic_id"),
    role: text("role").notNull(),
    content: text("content").notNull(),
    model: text("model"),
    tokensUsed: integer("tokens_used").default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("bot_conversations_telegram_id_idx").on(t.telegramId),
    index("bot_conversations_topic_id_idx").on(t.topicId),
  ],
);

export const botTopics = pgTable(
  "bot_topics",
  {
    id: serial("id").primaryKey(),
    telegramId: bigint("telegram_id", { mode: "number" }).notNull(),
    name: text("name").notNull(),
    summary: text("summary"),
    isActive: boolean("is_active").notNull().default(false),
    messageCount: integer("message_count").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("bot_topics_telegram_id_idx").on(t.telegramId)],
);

export const botUserPreferences = pgTable(
  "bot_user_preferences",
  {
    id: serial("id").primaryKey(),
    telegramId: bigint("telegram_id", { mode: "number" }).notNull(),
    key: text("key").notNull(),
    value: text("value").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("bot_prefs_telegram_id_idx").on(t.telegramId)],
);

export const botGithubTokens = pgTable("bot_github_tokens", {
  id: serial("id").primaryKey(),
  telegramId: bigint("telegram_id", { mode: "number" }).notNull().unique(),
  githubToken: text("github_token").notNull(),
  githubUsername: text("github_username"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const botTokenTransactions = pgTable(
  "bot_token_transactions",
  {
    id: serial("id").primaryKey(),
    telegramId: bigint("telegram_id", { mode: "number" }).notNull(),
    amount: integer("amount").notNull(),
    type: text("type").notNull(),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("bot_token_tx_telegram_id_idx").on(t.telegramId)],
);

export const botReferrals = pgTable("bot_referrals", {
  id: serial("id").primaryKey(),
  referrerId: bigint("referrer_id", { mode: "number" }).notNull(),
  claimerId: bigint("claimer_id", { mode: "number" }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const botReminders = pgTable(
  "bot_reminders",
  {
    id: serial("id").primaryKey(),
    telegramId: bigint("telegram_id", { mode: "number" }).notNull(),
    text: text("text").notNull(),
    remindAt: timestamp("remind_at").notNull(),
    sent: boolean("sent").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("bot_reminders_telegram_id_idx").on(t.telegramId),
    index("bot_reminders_remind_at_idx").on(t.remindAt),
  ],
);

export const botScheduledBroadcasts = pgTable("bot_scheduled_broadcasts", {
  id: serial("id").primaryKey(),
  message: text("message").notNull(),
  scheduledAt: timestamp("scheduled_at").notNull(),
  sent: boolean("sent").notNull().default(false),
  sentCount: integer("sent_count").default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertBotUserSchema = createInsertSchema(botUsers).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type BotUser = typeof botUsers.$inferSelect;
export type InsertBotUser = z.infer<typeof insertBotUserSchema>;
