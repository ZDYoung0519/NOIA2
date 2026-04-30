-- Rebuild public.aion2_dps_rank from public.aion2_dps in one batch.
--
-- Rules:
-- 1. Clear existing rank table
-- 2. For each (target_mob_code, main_actor_name, main_actor_server_id, main_actor_class),
--    keep the single best row by:
--      - higher main_actor_dps
--      - higher main_actor_damage
--      - later battle_ended_at
--      - later created_at
--      - larger record_id

truncate table public.aion2_dps_rank restart identity;

with boss_max_damage as (
  select
    target_mob_code,
    max(party_total_damage) as max_party_total_damage
  from public.aion2_dps
  where target_mob_code is not null
  group by target_mob_code
),
ranked as (
  select
    h.record_id,
    h.battle_ended_at,
    h.target_mob_code,
    h.target_name,
    h.is_boss,
    h.target_max_hp,
    h.team_battle_duration,
    h.party_total_damage,
    h.team_dps,
    h.main_actor_name,
    coalesce(h.main_actor_server_id, '') as main_actor_server_id,
    coalesce(h.main_actor_class, '') as main_actor_class,
    h.main_actor_damage,
    h.main_actor_battle_duration,
    h.main_actor_dps,
    h.created_at,
    row_number() over (
      partition by
        h.target_mob_code,
        h.main_actor_name,
        coalesce(h.main_actor_server_id, ''),
        coalesce(h.main_actor_class, '')
      order by
        h.main_actor_dps desc nulls last,
        h.main_actor_damage desc nulls last,
        h.battle_ended_at desc nulls last,
        h.created_at desc nulls last,
        h.record_id desc
    ) as rn
  from public.aion2_dps h
  join boss_max_damage b
    on b.target_mob_code = h.target_mob_code
  where h.target_mob_code is not null
    and nullif(trim(h.main_actor_name), '') is not null
    and coalesce(h.main_actor_damage, 0) > 0
    and (
      (
        h.target_mob_code = 2400032
        and coalesce(h.team_battle_duration, 0) >= 60
      )
      or (
        h.target_mob_code <> 2400032
        and (
          (
            coalesce(h.target_max_hp, 0) > 0
            and coalesce(h.party_total_damage, 0) >= (h.target_max_hp * 0.9)
          )
          or (
            coalesce(h.target_max_hp, 0) <= 0
            and (
              coalesce(b.max_party_total_damage, 0) <= 0
              or coalesce(h.party_total_damage, 0) >= (b.max_party_total_damage * 0.9)
            )
          )
        )
      )
    )
)
insert into public.aion2_dps_rank (
  record_id,
  battle_ended_at,
  target_mob_code,
  target_name,
  is_boss,
  target_max_hp,
  team_battle_duration,
  party_total_damage,
  team_dps,
  main_actor_name,
  main_actor_server_id,
  main_actor_class,
  main_actor_damage,
  main_actor_battle_duration,
  main_actor_dps
)
select
  record_id,
  battle_ended_at,
  target_mob_code,
  target_name,
  is_boss,
  target_max_hp,
  team_battle_duration,
  party_total_damage,
  team_dps,
  main_actor_name,
  main_actor_server_id,
  main_actor_class,
  main_actor_damage,
  main_actor_battle_duration,
  main_actor_dps
from ranked
where rn = 1;

select
  count(*) as rank_row_count,
  count(distinct target_mob_code) as boss_count
from public.aion2_dps_rank;
