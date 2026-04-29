-- Rebuild public.aion2_dps_rank from public.aion2_dps history.
-- Keeps exactly one best row per:
--   (target_mob_code, main_actor_name, main_actor_server_id, main_actor_class)
-- Ranking priority:
--   1. higher main_actor_dps
--   2. higher main_actor_damage
--   3. later battle_ended_at
--   4. later created_at
--   5. larger record_id (stable tie-breaker)

truncate table public.aion2_dps_rank restart identity;

with ranked as (
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
  where h.target_mob_code is not null
    and nullif(trim(h.main_actor_name), '') is not null
    and coalesce(h.main_actor_damage, 0) > 0
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
