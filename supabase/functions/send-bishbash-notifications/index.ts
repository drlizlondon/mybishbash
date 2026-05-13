import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import webpush from "https://esm.sh/web-push@3.6.7";

serve(async (req) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  webpush.setVapidDetails(
    "mailto:admin@your-domain.com",
    Deno.env.get("VAPID_PUBLIC_KEY") ?? "",
    Deno.env.get("VAPID_PRIVATE_KEY") ?? ""
  );

  const publicAppUrl = Deno.env.get("PUBLIC_APP_URL") || "https://drlizlondon.github.io/bishbash";

  // 1. Fetch enabled users
  const { data: users } = await supabase
    .from("notification_preferences")
    .select("*")
    .eq("enabled", true);

  if (!users) return new Response("Ok");

  for (const user of users) {
    const tz = user.timezone || "Europe/London";
    const hourFormatter = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hour12: false });
    const currentHour = parseInt(hourFormatter.format(new Date()), 10);

    // Only send between 09:00 and 21:00
    if (currentHour < 9 || currentHour >= 21) continue;

    const { data: recentLogs } = await supabase
      .from("notification_delivery_log")
      .select("*")
      .eq("user_id", user.user_id)
      .gte("sent_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .order("sent_at", { ascending: false });

    const lastSent = recentLogs?.[0];
    if (lastSent && (Date.now() - new Date(lastSent.sent_at).getTime() < 2 * 60 * 60 * 1000)) {
      continue; // Skip: Notification sent in the last 2 hours
    }

    const dateFormatter = new Intl.DateTimeFormat("en-US", { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
    const todayStr = dateFormatter.format(new Date());
    const sentTodayCount = (recentLogs || []).filter(log => dateFormatter.format(new Date(log.sent_at)) === todayStr).length;

    const maxPerDay = user.notifications_per_day || 3;
    if (sentTodayCount >= maxPerDay) continue;

    // Random probability based on remaining slots and time windows
    const remainingSlots = maxPerDay - sentTodayCount;
    const remainingHours = 21 - currentHour;
    const remainingWindows = remainingHours * 4; // 15-minute runs
    if (remainingWindows > 0) {
      const probability = remainingSlots / remainingWindows;
      if (Math.random() > Math.min(probability, 1)) continue;
    }

    const { data: stateData } = await supabase.from("bishbash_state").select("state_json").eq("user_id", user.user_id).single();
    if (!stateData?.state_json) continue;

    const cards = stateData.state_json.cards || [];
    const eligibleCards = cards.filter((c: any) => 
      !c.deletedAt && 
      !c.paused && 
      !c.disliked && 
      c.type !== "interruption" && 
      c.type !== "action"
    );

    if (eligibleCards.length === 0) continue;
    const chosen = eligibleCards[Math.floor(Math.random() * eligibleCards.length)];

    const deliveryId = crypto.randomUUID();
    const titleOptions = ["Tiny BishBash moment?", "Something you said mattered.", "Pause for a second?", "A reminder from yourself."];
    const title = titleOptions[Math.floor(Math.random() * titleOptions.length)];

    await supabase.from("notification_delivery_log").insert({
      id: deliveryId,
      user_id: user.user_id,
      card_id: chosen.id,
      card_source: chosen.sourcePackId ? "library" : "personal",
      title,
      body: chosen.promptText || chosen.text,
      delivery_status: "pending",
      metadata: {
        source: "notification",
        cardId: chosen.id,
      },
    });

    const { data: subs } = await supabase.from("push_subscriptions").select("*").eq("user_id", user.user_id);
    if (!subs || subs.length === 0) {
      await supabase.from("notification_delivery_log").update({ delivery_status: "failed", error_message: "No push subscriptions" }).eq("id", deliveryId);
      continue;
    }

    let anySuccess = false;
    let lastError = null;
    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify({
            title,
            body: chosen.promptText || chosen.text,
            url: `${publicAppUrl}/card/${encodeURIComponent(chosen.id)}?source=notification&deliveryId=${deliveryId}`,
            deliveryId,
          })
        );
        anySuccess = true;
      } catch (e: any) {
        lastError = e;
        if (e.statusCode === 404 || e.statusCode === 410) await supabase.from("push_subscriptions").delete().eq("id", sub.id);
      }
    }
    await supabase.from("notification_delivery_log").update({ delivery_status: anySuccess ? "sent" : "failed", error_message: lastError?.message }).eq("id", deliveryId);
  }
  return new Response(JSON.stringify({ status: "processed" }), { headers: { "Content-Type": "application/json" } });
});
