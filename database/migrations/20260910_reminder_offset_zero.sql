alter table public.notification_preferences
  drop constraint if exists notification_preferences_default_reminder_minutes_check;

alter table public.notification_preferences
  add constraint notification_preferences_default_reminder_minutes_check
  check (default_reminder_minutes in (0, 10, 30, 60, 180, 1440));
