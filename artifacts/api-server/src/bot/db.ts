import { db } from "@workspace/db";
import {
  botUsers,
  botConversations,
  botTopics,
  botUserPreferences,
  botGithubTokens,
  botTokenTransactions,
  botReferrals,
  botReminders,
  type BotUser,
} from "@workspace/db";
import { eq, and, desc, asc, lt, gt, or, isNull, sql } from "drizzle-orm";

export type Lang = "ar" | "en";

export function uiLang(pref: string | null | undefined): Lang {
  if (pref === "en") return "en";
  return "ar";
}

export async function getOrCreateUser(
  telegramId: number,
  username?: string,
  firstName?: string,
  lastName?: string,
): Promise<BotUser> {
  const existing = await db.query.botUsers.findFirst({
    where: eq(botUsers.telegramId, telegramId),
  });

  if (existing) {
    await db
      .update(botUsers)
      .set({
        username: username ?? existing.username,
        firstName: firstName ?? existing.firstName,
        lastName: lastName ?? existing.lastName,
        lastActiveAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(botUsers.telegramId, telegramId));
    return { ...existing, lastActiveAt: new Date() };
  }

  const [created] = await db
    .insert(botUsers)
    .values({
      telegramId,
      username: username ?? null,
      firstName: firstName ?? null,
      lastName: lastName ?? null,
      tokens: 15,
    })
    .returning();

  return created!;
}

export async function getUser(telegramId: number): Promise<BotUser | null> {
  const u = await db.query.botUsers.findFirst({
    where: eq(botUsers.telegramId, telegramId),
  });
  return u ?? null;
}

export async function getUserLang(telegramId: number): Promise<Lang> {
  const u = await getUser(telegramId);
  return uiLang(u?.languagePref);
}

export async function setUserLang(telegramId: number, pref: string) {
  await db
    .update(botUsers)
    .set({ languagePref: pref, updatedAt: new Date() })
    .where(eq(botUsers.telegramId, telegramId));
}

export async function setUserMode(telegramId: number, mode: string) {
  await db
    .update(botUsers)
    .set({ mode, updatedAt: new Date() })
    .where(eq(botUsers.telegramId, telegramId));
}

export async function addTokens(telegramId: number, amount: number, type: string, meta?: Record<string, unknown>) {
  await db
    .update(botUsers)
    .set({ tokens: sql`${botUsers.tokens} + ${amount}`, updatedAt: new Date() })
    .where(eq(botUsers.telegramId, telegramId));
  await db.insert(botTokenTransactions).values({
    telegramId,
    amount,
    type,
    metadata: meta ?? null,
  });
}

export async function deductTokens(telegramId: number, amount: number, type: string, meta?: Record<string, unknown>) {
  await db
    .update(botUsers)
    .set({ tokens: sql`${botUsers.tokens} - ${amount}`, updatedAt: new Date() })
    .where(eq(botUsers.telegramId, telegramId));
  await db.insert(botTokenTransactions).values({
    telegramId,
    amount: -amount,
    type,
    metadata: meta ?? null,
  });
}

export async function setTokens(telegramId: number, amount: number) {
  await db
    .update(botUsers)
    .set({ tokens: amount, updatedAt: new Date() })
    .where(eq(botUsers.telegramId, telegramId));
}

export async function claimDailyGift(telegramId: number): Promise<{ ok: boolean; hoursLeft?: number; newBalance?: number }> {
  const user = await getUser(telegramId);
  if (!user) return { ok: false };

  if (user.lastDailyGift) {
    const hoursDiff = (Date.now() - new Date(user.lastDailyGift).getTime()) / (1000 * 60 * 60);
    if (hoursDiff < 24) {
      return { ok: false, hoursLeft: Math.ceil(24 - hoursDiff) };
    }
  }

  const newBalance = (user.tokens ?? 0) + 5;
  await db
    .update(botUsers)
    .set({ tokens: newBalance, lastDailyGift: new Date(), updatedAt: new Date() })
    .where(eq(botUsers.telegramId, telegramId));
  await db.insert(botTokenTransactions).values({ telegramId, amount: 5, type: "daily_gift" });

  return { ok: true, newBalance };
}

export async function getConversationHistory(telegramId: number, topicId: number | null, limit = 20) {
  let q = db
    .select()
    .from(botConversations)
    .where(
      topicId !== null
        ? and(eq(botConversations.telegramId, telegramId), eq(botConversations.topicId, topicId))
        : and(eq(botConversations.telegramId, telegramId), isNull(botConversations.topicId)),
    )
    .orderBy(asc(botConversations.createdAt))
    .limit(limit);

  return await q;
}

export async function saveMessage(telegramId: number, topicId: number | null, role: "user" | "assistant", content: string, model?: string) {
  await db.insert(botConversations).values({
    telegramId,
    topicId,
    role,
    content,
    model: model ?? null,
  });
}

export async function clearHistory(telegramId: number) {
  await db.delete(botConversations).where(eq(botConversations.telegramId, telegramId));
  await db
    .update(botTopics)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(botTopics.telegramId, telegramId));
}

export async function getActiveTopic(telegramId: number) {
  return await db.query.botTopics.findFirst({
    where: and(eq(botTopics.telegramId, telegramId), eq(botTopics.isActive, true)),
  });
}

export async function createTopic(telegramId: number, name: string) {
  await db
    .update(botTopics)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(botTopics.telegramId, telegramId));
  const [t] = await db
    .insert(botTopics)
    .values({ telegramId, name, isActive: true })
    .returning();
  return t;
}

export async function listTopics(telegramId: number) {
  return await db
    .select()
    .from(botTopics)
    .where(eq(botTopics.telegramId, telegramId))
    .orderBy(desc(botTopics.createdAt))
    .limit(15);
}

export async function switchTopic(telegramId: number, topicId: number) {
  await db
    .update(botTopics)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(botTopics.telegramId, telegramId));
  await db
    .update(botTopics)
    .set({ isActive: true, updatedAt: new Date() })
    .where(and(eq(botTopics.id, topicId), eq(botTopics.telegramId, telegramId)));
}

export async function deleteTopic(telegramId: number, topicId: number) {
  await db
    .delete(botConversations)
    .where(and(eq(botConversations.telegramId, telegramId), eq(botConversations.topicId, topicId)));
  await db
    .delete(botTopics)
    .where(and(eq(botTopics.id, topicId), eq(botTopics.telegramId, telegramId)));
}

export async function getPref(telegramId: number, key: string): Promise<string | null> {
  const p = await db.query.botUserPreferences.findFirst({
    where: and(eq(botUserPreferences.telegramId, telegramId), eq(botUserPreferences.key, key)),
  });
  return p?.value ?? null;
}

export async function setPref(telegramId: number, key: string, value: string) {
  const existing = await db.query.botUserPreferences.findFirst({
    where: and(eq(botUserPreferences.telegramId, telegramId), eq(botUserPreferences.key, key)),
  });
  if (existing) {
    await db
      .update(botUserPreferences)
      .set({ value, updatedAt: new Date() })
      .where(and(eq(botUserPreferences.telegramId, telegramId), eq(botUserPreferences.key, key)));
  } else {
    await db.insert(botUserPreferences).values({ telegramId, key, value });
  }
}

export async function deletePref(telegramId: number, key: string) {
  await db
    .delete(botUserPreferences)
    .where(and(eq(botUserPreferences.telegramId, telegramId), eq(botUserPreferences.key, key)));
}

export async function getAllPrefs(telegramId: number) {
  return await db.select().from(botUserPreferences).where(eq(botUserPreferences.telegramId, telegramId));
}

export async function getGithubToken(telegramId: number) {
  return await db.query.botGithubTokens.findFirst({
    where: eq(botGithubTokens.telegramId, telegramId),
  });
}

export async function setGithubToken(telegramId: number, token: string, username: string) {
  const existing = await getGithubToken(telegramId);
  if (existing) {
    await db
      .update(botGithubTokens)
      .set({ githubToken: token, githubUsername: username, updatedAt: new Date() })
      .where(eq(botGithubTokens.telegramId, telegramId));
  } else {
    await db.insert(botGithubTokens).values({ telegramId, githubToken: token, githubUsername: username });
  }
}

export async function deleteGithubToken(telegramId: number) {
  await db.delete(botGithubTokens).where(eq(botGithubTokens.telegramId, telegramId));
}

export async function checkReferral(claimerId: number, referrerId: number): Promise<boolean> {
  const existing = await db.query.botReferrals.findFirst({
    where: and(eq(botReferrals.claimerId, claimerId), eq(botReferrals.referrerId, referrerId)),
  });
  return !!existing;
}

export async function createReferral(claimerId: number, referrerId: number) {
  await db.insert(botReferrals).values({ claimerId, referrerId });
}

export async function createReminder(telegramId: number, text: string, remindAt: Date) {
  const [r] = await db.insert(botReminders).values({ telegramId, text, remindAt }).returning();
  return r;
}

export async function getPendingReminders() {
  return await db
    .select()
    .from(botReminders)
    .where(and(eq(botReminders.sent, false), lt(botReminders.remindAt, new Date())));
}

export async function markReminderSent(id: number) {
  await db.update(botReminders).set({ sent: true }).where(eq(botReminders.id, id));
}

export async function getUserReminders(telegramId: number) {
  return await db
    .select()
    .from(botReminders)
    .where(and(eq(botReminders.telegramId, telegramId), eq(botReminders.sent, false)))
    .orderBy(asc(botReminders.remindAt))
    .limit(10);
}

export async function deleteReminder(id: number, telegramId: number) {
  await db.delete(botReminders).where(and(eq(botReminders.id, id), eq(botReminders.telegramId, telegramId)));
}

export async function getUserCount(): Promise<number> {
  const r = await db.select({ count: sql<number>`count(*)` }).from(botUsers);
  return Number(r[0]?.count ?? 0);
}

export async function getMessageCount(): Promise<number> {
  const r = await db.select({ count: sql<number>`count(*)` }).from(botConversations);
  return Number(r[0]?.count ?? 0);
}

export async function getTopUsersByTokens(limit = 10) {
  return await db
    .select()
    .from(botUsers)
    .orderBy(desc(botUsers.tokens))
    .limit(limit);
}

export async function getRecentUsers(limit = 10) {
  return await db
    .select()
    .from(botUsers)
    .orderBy(desc(botUsers.lastActiveAt))
    .limit(limit);
}

export async function getAllActiveUsers() {
  return await db
    .select({ telegramId: botUsers.telegramId })
    .from(botUsers)
    .where(gt(botUsers.lastActiveAt, new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)));
}

export async function getUserStats(telegramId: number) {
  const user = await getUser(telegramId);
  if (!user) return null;

  const msgCount = await db
    .select({ count: sql<number>`count(*)` })
    .from(botConversations)
    .where(and(eq(botConversations.telegramId, telegramId), eq(botConversations.role, "user")));

  const topicCount = await db
    .select({ count: sql<number>`count(*)` })
    .from(botTopics)
    .where(eq(botTopics.telegramId, telegramId));

  const referralCount = await db
    .select({ count: sql<number>`count(*)` })
    .from(botReferrals)
    .where(eq(botReferrals.referrerId, telegramId));

  return {
    user,
    messagesSent: Number(msgCount[0]?.count ?? 0),
    topics: Number(topicCount[0]?.count ?? 0),
    referrals: Number(referralCount[0]?.count ?? 0),
  };
}

export async function getProactiveTargets() {
  const twelveHAgo = new Date(Date.now() - 12 * 60 * 60 * 1000);
  const seventyTwoHAgo = new Date(Date.now() - 72 * 60 * 60 * 1000);
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  return await db
    .select()
    .from(botUsers)
    .where(
      and(
        eq(botUsers.proactiveEnabled, true),
        lt(botUsers.lastActiveAt, twelveHAgo),
        gt(botUsers.lastActiveAt, seventyTwoHAgo),
        or(isNull(botUsers.lastProactiveAt), lt(botUsers.lastProactiveAt, oneDayAgo)),
      ),
    )
    .limit(20);
}

export async function updateProactiveTime(telegramId: number) {
  await db
    .update(botUsers)
    .set({ lastProactiveAt: new Date(), updatedAt: new Date() })
    .where(eq(botUsers.telegramId, telegramId));
}
