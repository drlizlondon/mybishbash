alter table public.global_packs add column if not exists source_key text;
alter table public.global_pack_cards add column if not exists source_title text;
alter table public.global_pack_cards add column if not exists source_url text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'global_packs_source_key_key'
      and conrelid = 'public.global_packs'::regclass
  ) then
    alter table public.global_packs
    add constraint global_packs_source_key_key unique (source_key);
  end if;
end $$;

insert into public.global_packs (source_key, title, description, theme, icon, published)
values
  ('encouraging-bible-verses', 'Bible Verse', 'Gentle scripture-based BishBashes for the day.', 'Soft Bloom', 'book', true),
  ('motivational-quotes', 'Motivational Quote', 'Soft little pushes when energy dips.', 'Pop Art', 'quote', true),
  ('extraordinary-lives', 'Extraordinary Lives', 'Real lives, real sources, small moments that widen the day.', 'Soft Bloom', 'star', true),
  ('missionary-stories', 'Missionary Stories', 'True fragments of distance, service, doubt, and resolve.', 'Starry Sky', null, true),
  ('letters-from-another-era', 'Letters From Another Era', 'Short, sourced voices carried forward from older worlds.', 'Minimal', 'quote', true),
  ('human-courage', 'Human Courage', 'Documented moments of steadiness under pressure.', 'Pop Art', null, true),
  ('last-words-and-final-reflections', 'Last Words & Final Reflections', 'Carefully sourced final statements and closing thoughts.', 'Soft Bloom', null, true),
  ('monastery-mind', 'Monastery Mind', 'Monastic writing, silence, order, and interior attention.', 'Minimal', 'leaf', true),
  ('tiny-awe', 'Tiny Awe', 'Verified facts and moments that make the world feel larger.', 'Rainbow', 'star', true),
  ('the-weight-of-time', 'The Weight of Time', 'Historically grounded reminders of scale, age, and passing.', 'Soft Bloom', null, true),
  ('before-smartphones', 'Before Smartphones', 'Everyday life before constant notification, told from sources.', 'Pop Art', null, true),
  ('soft-convictions', 'Soft Convictions', 'Firm but gentle voices from letters, essays, and memoirs.', 'Minimal', 'quote', true),
  ('motherhood-through-time', 'Motherhood Through Time', 'Sourced glimpses of care, strain, love, and endurance.', 'Soft Bloom', null, true)
on conflict (source_key) do update
set
  title = excluded.title,
  description = excluded.description,
  theme = excluded.theme,
  icon = excluded.icon,
  updated_at = now();

delete from public.global_pack_cards
where pack_id in (
  select id from public.global_packs where source_key in (
    'encouraging-bible-verses',
    'motivational-quotes',
    'extraordinary-lives',
    'missionary-stories',
    'letters-from-another-era',
    'human-courage',
    'last-words-and-final-reflections',
    'monastery-mind',
    'tiny-awe',
    'the-weight-of-time',
    'before-smartphones',
    'soft-convictions',
    'motherhood-through-time'
  )
);

insert into public.global_pack_cards (pack_id, prompt_text, attribution, source_title, source_url, frequency, timing_windows, position)
values
  ((select id from public.global_packs where source_key = 'encouraging-bible-verses'), 'Be still, and know that I am God.', 'Psalm 46:10', null, null, 'once_daily', '["morning","day","evening"]'::jsonb, 0),
  ((select id from public.global_packs where source_key = 'encouraging-bible-verses'), 'Cast all your anxiety on him because he cares for you.', '1 Peter 5:7', null, null, 'once_daily', '["morning","day","evening"]'::jsonb, 1),
  ((select id from public.global_packs where source_key = 'encouraging-bible-verses'), 'Come to me, all you who are weary and burdened, and I will give you rest.', 'Matthew 11:28', null, null, 'once_daily', '["morning","day","evening"]'::jsonb, 2),
  ((select id from public.global_packs where source_key = 'encouraging-bible-verses'), 'The Lord will fight for you; you need only to be still.', 'Exodus 14:14', null, null, 'once_daily', '["morning","day","evening"]'::jsonb, 3),
  ((select id from public.global_packs where source_key = 'encouraging-bible-verses'), 'Let the peace of Christ rule in your hearts.', 'Colossians 3:15', null, null, 'once_daily', '["morning","day","evening"]'::jsonb, 4),
  ((select id from public.global_packs where source_key = 'motivational-quotes'), 'Start where you are. Use what you have. Do what you can.', 'Arthur Ashe', null, null, 'once_daily', '["morning","day","evening"]'::jsonb, 0),
  ((select id from public.global_packs where source_key = 'motivational-quotes'), 'Great things are done by a series of small things brought together.', 'Vincent van Gogh', null, null, 'once_daily', '["morning","day","evening"]'::jsonb, 1),
  ((select id from public.global_packs where source_key = 'motivational-quotes'), 'It always seems impossible until it’s done.', 'Nelson Mandela', null, null, 'once_daily', '["morning","day","evening"]'::jsonb, 2),
  ((select id from public.global_packs where source_key = 'motivational-quotes'), 'Small deeds done are better than great deeds planned.', 'Peter Marshall', null, null, 'once_daily', '["morning","day","evening"]'::jsonb, 3),
  ((select id from public.global_packs where source_key = 'motivational-quotes'), 'Action is a great restorer and builder of confidence.', 'Norman Vincent Peale', null, null, 'once_daily', '["morning","day","evening"]'::jsonb, 4),
  ((select id from public.global_packs where source_key = 'extraordinary-lives'), 'The best and most beautiful things in the world cannot be seen nor even touched, but just felt in the heart.', 'Helen Keller', 'The Story of My Life', 'https://www.gutenberg.org/cache/epub/2397/pg2397-images.html', 'once_daily', '["morning","day","evening"]'::jsonb, 0),
  ((select id from public.global_packs where source_key = 'extraordinary-lives'), 'One can never consent to creep when one feels an impulse to soar.', 'Helen Keller', 'The Story of My Life', 'https://www.gutenberg.org/files/2397/2397-h/2397-h.htm', 'once_daily', '["morning","day","evening"]'::jsonb, 1),
  ((select id from public.global_packs where source_key = 'extraordinary-lives'), 'There was no light in my soul. This wonderful world with all its sunlight and beauty was hidden from me.', 'Helen Keller', 'The Story of My Life', 'https://www.gutenberg.org/cache/epub/2397/pg2397-images.html', 'once_daily', '["morning","day","evening"]'::jsonb, 2),
  ((select id from public.global_packs where source_key = 'letters-from-another-era'), 'Nothing ever becomes real till it is experienced.', 'John Keats', 'Letters of John Keats to His Family and Friends', 'https://www.gutenberg.org/ebooks/35698.html.images', 'once_daily', '["morning","day","evening"]'::jsonb, 0),
  ((select id from public.global_packs where source_key = 'letters-from-another-era'), 'I am certain of nothing but of the holiness of the Heart''s affections, and the truth of Imagination.', 'John Keats', 'Letters of John Keats to His Family and Friends', 'https://www.gutenberg.org/ebooks/35698.html.images', 'once_daily', '["morning","day","evening"]'::jsonb, 1),
  ((select id from public.global_packs where source_key = 'letters-from-another-era'), 'O for a life of sensations rather than of thoughts!', 'John Keats', 'Letters of John Keats to His Family and Friends', 'https://www.gutenberg.org/ebooks/35698.html.images', 'once_daily', '["morning","day","evening"]'::jsonb, 2),
  ((select id from public.global_packs where source_key = 'monastery-mind'), 'The time of business does not with me differ from the time of prayer.', 'Brother Lawrence', 'The Practice of the Presence of God', 'https://www.gutenberg.org/ebooks/13871.html.images', 'once_daily', '["morning","day","evening"]'::jsonb, 0),
  ((select id from public.global_packs where source_key = 'monastery-mind'), 'We need only to recognize God intimately present with us and address ourselves to Him every moment.', 'Brother Lawrence', 'The Practice of the Presence of God', 'https://www.gutenberg.org/ebooks/13871.html.images', 'once_daily', '["morning","day","evening"]'::jsonb, 1),
  ((select id from public.global_packs where source_key = 'monastery-mind'), 'I made this my business... every hour, every minute, even in the height of my work.', 'Brother Lawrence', 'The Practice of the Presence of God', 'https://www.gutenberg.org/ebooks/13871.html.images', 'once_daily', '["morning","day","evening"]'::jsonb, 2),
  ((select id from public.global_packs where source_key = 'tiny-awe'), 'The Moon is slowly moving away from Earth, getting about an inch farther away each year.', 'NASA', 'Earth''s Moon: In Depth', 'https://solarsystem.nasa.gov/moons/earths-moon/in-depth.amp', 'once_daily', '["morning","day","evening"]'::jsonb, 0),
  ((select id from public.global_packs where source_key = 'tiny-awe'), 'Our galaxy sits in a Local Group of more than 20 galaxies.', 'NASA', 'Hubble''s Galaxies', 'https://science.nasa.gov/mission/hubble/science/universe-uncovered/hubble-galaxies/', 'once_daily', '["morning","day","evening"]'::jsonb, 1),
  ((select id from public.global_packs where source_key = 'tiny-awe'), 'The Moon''s far side gets as much sunlight as its near side.', 'NASA', 'Earth''s Moon', 'https://science.nasa.gov/moon/', 'once_daily', '["morning","day","evening"]'::jsonb, 2),
  ((select id from public.global_packs where source_key = 'soft-convictions'), 'I most sincerely wish that some more liberal plan might be laid and executed for the benefit of the rising generation.', 'Abigail Adams', 'Familiar Letters of John Adams and His Wife Abigail Adams During the Revolution', 'https://www.gutenberg.org/ebooks/34123.html.images', 'once_daily', '["morning","day","evening"]'::jsonb, 0),
  ((select id from public.global_packs where source_key = 'soft-convictions'), 'Do not put such unlimited power into the hands of the husbands.', 'Abigail Adams', 'Familiar Letters of John Adams and His Wife Abigail Adams During the Revolution', 'https://www.gutenberg.org/ebooks/34123.html.images', 'once_daily', '["morning","day","evening"]'::jsonb, 1),
  ((select id from public.global_packs where source_key = 'soft-convictions'), 'I long earnestly for a Saturday evening.', 'Abigail Adams', 'Familiar Letters of John Adams and His Wife Abigail Adams During the Revolution', 'https://www.gutenberg.org/ebooks/34123.html.images', 'once_daily', '["morning","day","evening"]'::jsonb, 2);
