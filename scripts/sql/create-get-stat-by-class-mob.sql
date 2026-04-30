create or replace function public.get_stat_by_class_mob(
  p_mob_code bigint,
  p_actor_class text default 'ALL',
  p_limit integer default 20,
  p_offset integer default 0,
  p_min_boss_hp_ratio double precision default 0
)
returns table (
  record_id text,
  main_actor_name text,
  main_actor_class text,
  main_actor_damage bigint,
  main_actor_battle_duration double precision,
  main_actor_dps double precision,
  party_total_damage bigint,
  total_count bigint
)
language sql
stable
as $$
  with boss_max_damage as (
    select
      r.target_mob_code,
      max(coalesce(r.party_total_damage, 0)) as max_party_total_damage
    from public.aion2_dps_rank r
    where r.target_mob_code = p_mob_code
    group by r.target_mob_code
  ),
  filtered as (
    select
      r.record_id,
      r.main_actor_name,
      r.main_actor_class,
      r.main_actor_damage,
      r.main_actor_battle_duration,
      r.main_actor_dps,
      r.party_total_damage
    from public.aion2_dps_rank r
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
    f.main_actor_name,
    f.main_actor_class,
    f.main_actor_damage,
    f.main_actor_battle_duration,
    f.main_actor_dps,
    f.party_total_damage,
    count(*) over() as total_count
  from filtered f
  order by
    f.main_actor_dps desc nulls last,
    f.main_actor_damage desc nulls last,
    f.record_id desc
  limit greatest(coalesce(p_limit, 20), 1)
  offset greatest(coalesce(p_offset, 0), 0);
$$;
