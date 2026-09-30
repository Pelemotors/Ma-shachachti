alter table public.shopping_items
  add column if not exists notes text not null default '' check (char_length(notes) <= 1000),
  add column if not exists category text not null default 'bag';

update public.shopping_items
set notes = coalesce(notes, ''),
    category = coalesce(nullif(category, ''), 'bag')
where notes is null or category is null or category = '';
