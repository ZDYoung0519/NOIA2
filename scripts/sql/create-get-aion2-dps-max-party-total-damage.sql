create or replace function public.get_aion2_dps_max_party_total_damage(
  p_mob_code bigint
)
returns bigint
language sql
stable
as $$
  select max(party_total_damage)
  from public.aion2_dps
  where target_mob_code = p_mob_code;
$$;
