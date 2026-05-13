create index if not exists idx_push_subscriptions_user_id on public.push_subscriptions(user_id);
create index if not exists idx_notification_preferences_enabled on public.notification_preferences(enabled);
create index if not exists idx_notification_delivery_log_user_id_sent_at on public.notification_delivery_log(user_id, sent_at);
