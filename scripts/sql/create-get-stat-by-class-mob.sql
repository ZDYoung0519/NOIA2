-- 删除旧签名，避免 PostgREST 在带默认参数的多个重载之间无法确定调用目标。
drop function if exists public.get_stat_by_class_mob(bigint, text, integer, integer);
drop function if exists public.get_stat_by_class_mob(bigint, text, integer, integer, double precision);

create function public.get_stat_by_class_mob(
  p_mob_code bigint,
  p_actor_class text default 'ALL',
  p_limit integer default 20,
  p_offset integer default 0,
  p_min_boss_hp_ratio double precision default 0,
  p_sort_mode text default 'personal'
)
returns table (
  record_id text,
  battle_ended_at timestamptz,
  main_actor_name text,
  main_actor_server_id text,
  main_actor_class text,
  main_actor_damage bigint,
  main_actor_battle_duration double precision,
  main_actor_dps double precision,
  party_total_damage bigint,
  team_dps double precision,
  total_count bigint
)
language sql
stable
as $$
  with boss_max_damage as (
    select
      r.target_mob_code,
      max(coalesce(r.party_total_damage, 0)) as max_party_total_damage
    from public.dps_rank r
    where r.target_mob_code = p_mob_code
    group by r.target_mob_code
  ),
  filtered as (
    select
      r.record_id,
      r.battle_ended_at,
      r.main_actor_name,
      r.main_actor_server_id,
      r.main_actor_class,
      r.main_actor_damage,
      r.main_actor_battle_duration,
      r.main_actor_dps,
      r.party_total_damage,
      r.team_dps
    from public.dps_rank r
    left join boss_max_damage b
      on b.target_mob_code = r.target_mob_code
    where r.target_mob_code = p_mob_code
      and (
        p_actor_class = 'ALL'
        or r.main_actor_class = p_actor_class
      )
      and (
        coalesce(p_min_boss_hp_ratio, 0) <= 0
        or (
          coalesce(b.max_party_total_damage, 0) > 0
          and coalesce(r.party_total_damage, 0)::numeric
            / nullif(b.max_party_total_damage, 0)::numeric >= p_min_boss_hp_ratio
        )
      )
  )
  select
    f.record_id,
    f.battle_ended_at,
    f.main_actor_name,
    f.main_actor_server_id,
    f.main_actor_class,
    f.main_actor_damage,
    f.main_actor_battle_duration,
    f.main_actor_dps,
    f.party_total_damage,
    f.team_dps,
    count(*) over() as total_count
  from filtered f
  order by
    case when p_sort_mode = 'team' then f.team_dps end desc nulls last,
    case when p_sort_mode <> 'team' then f.main_actor_dps end desc nulls last,
    f.main_actor_dps desc nulls last,
    f.main_actor_damage desc nulls last,
    f.record_id desc
  limit greatest(coalesce(p_limit, 20), 1)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

create or replace function public.get_aion2_dps_rank_class_stats_by_boss(
  p_target_mob_code bigint
)
returns table (
  main_actor_class text,
  sample_count bigint,
  top_10_percent_count integer,
  top_10_percent_avg_dps double precision,
  median_dps double precision,
  avg_dps double precision,
  max_dps double precision
)
language sql
stable
as $$
  with filtered as (
    select
      r.main_actor_class,
      r.main_actor_dps
    from public.dps_rank r
    where r.target_mob_code = p_target_mob_code
      and nullif(trim(r.main_actor_class), '') is not null
      and coalesce(r.main_actor_dps, 0) > 0
  ),
  ranked as (
    select
      f.main_actor_class,
      f.main_actor_dps,
      count(*) over (partition by f.main_actor_class) as class_count,
      row_number() over (
        partition by f.main_actor_class
        order by f.main_actor_dps desc
      ) as dps_rank
    from filtered f
  )
  select
    r.main_actor_class,
    count(*)::bigint as sample_count,
    greatest(1, ceil(max(r.class_count)::numeric * 0.10)::integer) as top_10_percent_count,
    avg(r.main_actor_dps) filter (
      where r.dps_rank <= greatest(1, ceil(r.class_count::numeric * 0.10)::integer)
    ) as top_10_percent_avg_dps,
    percentile_cont(0.5) within group (order by r.main_actor_dps) as median_dps,
    avg(r.main_actor_dps) as avg_dps,
    max(r.main_actor_dps) as max_dps
  from ranked r
  group by r.main_actor_class
  order by top_10_percent_avg_dps desc nulls last;
$$;

create index if not exists idx_aion2_dps_rank_mob_class_dps
  on public.dps_rank (
    target_mob_code,
    main_actor_class,
    main_actor_dps desc
  );

notify pgrst, 'reload schema';
