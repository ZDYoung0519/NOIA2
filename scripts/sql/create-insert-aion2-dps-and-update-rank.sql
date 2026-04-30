create or replace function public.get_aion2_dps_max_party_total_damage(
  p_mob_code bigint
)
returns bigint
language sql
stable
as $helper$
  select max(party_total_damage)
  from public.aion2_dps
  where target_mob_code = p_mob_code;
$helper$;

create or replace function public.insert_aion2_dps_and_update_rank(
  p_payload jsonb,
  p_keep_limit integer default 500
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_record_id text;
  v_main_actor_name text;
  v_main_actor_server_id text;
  v_main_actor_class text;
  v_target_mob_code bigint;
  v_target_max_hp bigint;
  v_keep_limit integer;
  v_trimmed_count integer := 0;
  v_party_total_damage bigint := 0;
  v_boss_max_party_total_damage bigint;
begin
  v_record_id := nullif(trim(p_payload->>'record_id'), '');
  v_main_actor_name := coalesce(nullif(trim(p_payload->>'main_actor_name'), ''), '');
  v_main_actor_server_id := coalesce(trim(p_payload->>'main_actor_server_id'), '');
  v_main_actor_class := coalesce(trim(p_payload->>'main_actor_class'), '');
  v_target_mob_code := nullif(p_payload->>'target_mob_code', '')::bigint;
  v_target_max_hp := nullif(p_payload->>'target_max_hp', '')::bigint;
  v_keep_limit := greatest(1, least(coalesce(p_keep_limit, 500), 5000));
  v_party_total_damage := coalesce((p_payload->>'party_total_damage')::bigint, 0);

  if v_record_id is null then
    raise exception 'record_id is required';
  end if;

  if v_main_actor_name = '' then
    raise exception 'main_actor_name is required';
  end if;

  if v_target_mob_code is null then
    raise exception 'target_mob_code is required';
  end if;

  insert into public.aion2_dps (
    record_id,
    created_at,
    battle_ended_at,
    target_mob_code,
    target_name,
    is_boss,
    target_max_hp,
    battle_start_time,
    battle_last_time,
    team_battle_duration,
    party_total_damage,
    team_dps,
    main_actor_name,
    main_actor_server_id,
    main_actor_class,
    main_actor_damage,
    main_actor_battle_duration,
    main_actor_dps,
    data
  )
  values (
    v_record_id,
    coalesce(nullif(p_payload->>'created_at', '')::timestamptz, now()),
    nullif(p_payload->>'battle_ended_at', '')::timestamptz,
    v_target_mob_code,
    nullif(p_payload->>'target_name', ''),
    coalesce((p_payload->>'is_boss')::boolean, false),
    nullif(p_payload->>'target_max_hp', '')::bigint,
    coalesce(p_payload->'battle_start_time', '{}'::jsonb),
    coalesce(p_payload->'battle_last_time', '{}'::jsonb),
    coalesce((p_payload->>'team_battle_duration')::double precision, 0),
    coalesce((p_payload->>'party_total_damage')::bigint, 0),
    coalesce((p_payload->>'team_dps')::double precision, 0),
    v_main_actor_name,
    v_main_actor_server_id,
    v_main_actor_class,
    coalesce((p_payload->>'main_actor_damage')::bigint, 0),
    coalesce((p_payload->>'main_actor_battle_duration')::double precision, 0),
    coalesce((p_payload->>'main_actor_dps')::double precision, 0),
    coalesce(p_payload->'data', '{}'::jsonb)
  )
  on conflict (record_id) do update
  set
    created_at = excluded.created_at,
    battle_ended_at = excluded.battle_ended_at,
    target_mob_code = excluded.target_mob_code,
    target_name = excluded.target_name,
    is_boss = excluded.is_boss,
    target_max_hp = excluded.target_max_hp,
    battle_start_time = excluded.battle_start_time,
    battle_last_time = excluded.battle_last_time,
    team_battle_duration = excluded.team_battle_duration,
    party_total_damage = excluded.party_total_damage,
    team_dps = excluded.team_dps,
    main_actor_name = excluded.main_actor_name,
    main_actor_server_id = excluded.main_actor_server_id,
    main_actor_class = excluded.main_actor_class,
    main_actor_damage = excluded.main_actor_damage,
    main_actor_battle_duration = excluded.main_actor_battle_duration,
    main_actor_dps = excluded.main_actor_dps,
    data = excluded.data;

  delete from public.aion2_dps
  where record_id in (
    select record_id
    from (
      select
        record_id,
        row_number() over (
          partition by main_actor_name, main_actor_server_id
          order by battle_ended_at desc nulls last, created_at desc, record_id desc
        ) as rn
      from public.aion2_dps
      where main_actor_name = v_main_actor_name
        and main_actor_server_id = v_main_actor_server_id
    ) ranked
    where ranked.rn > v_keep_limit
  );

  get diagnostics v_trimmed_count = row_count;

  v_boss_max_party_total_damage := public.get_aion2_dps_max_party_total_damage(v_target_mob_code);

  if v_target_mob_code = 2400032 then
    if coalesce((p_payload->>'team_battle_duration')::double precision, 0) < 60 then
      raise exception
        'team_battle_duration (%) must be at least 60 seconds for mob_code %',
        coalesce((p_payload->>'team_battle_duration')::double precision, 0),
        v_target_mob_code;
    end if;
  elsif coalesce(v_target_max_hp, 0) > 0 then
    if v_party_total_damage < (v_target_max_hp * 0.9) then
      raise exception
        'party_total_damage (%) must be at least 90%% of target_max_hp (%) for mob_code %',
        v_party_total_damage,
        v_target_max_hp,
        v_target_mob_code;
    end if;
  elsif coalesce(v_boss_max_party_total_damage, 0) > 0 then
    if v_party_total_damage < (v_boss_max_party_total_damage * 0.8) then
      raise exception
        'party_total_damage (%) must be at least 90%% of max party_total_damage (%) for mob_code %',
        v_party_total_damage,
        v_boss_max_party_total_damage,
        v_target_mob_code;
    end if;
  end if;

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
  values (
    v_record_id,
    nullif(p_payload->>'battle_ended_at', '')::timestamptz,
    v_target_mob_code,
    nullif(p_payload->>'target_name', ''),
    coalesce((p_payload->>'is_boss')::boolean, false),
    nullif(p_payload->>'target_max_hp', '')::bigint,
    coalesce((p_payload->>'team_battle_duration')::double precision, 0),
    coalesce((p_payload->>'party_total_damage')::bigint, 0),
    coalesce((p_payload->>'team_dps')::double precision, 0),
    v_main_actor_name,
    v_main_actor_server_id,
    v_main_actor_class,
    coalesce((p_payload->>'main_actor_damage')::bigint, 0),
    coalesce((p_payload->>'main_actor_battle_duration')::double precision, 0),
    coalesce((p_payload->>'main_actor_dps')::double precision, 0)
  )
  on conflict (target_mob_code, main_actor_name, main_actor_server_id, main_actor_class)
  do update
  set
    record_id = excluded.record_id,
    battle_ended_at = excluded.battle_ended_at,
    target_name = excluded.target_name,
    is_boss = excluded.is_boss,
    target_max_hp = excluded.target_max_hp,
    team_battle_duration = excluded.team_battle_duration,
    party_total_damage = excluded.party_total_damage,
    team_dps = excluded.team_dps,
    main_actor_damage = excluded.main_actor_damage,
    main_actor_battle_duration = excluded.main_actor_battle_duration,
    main_actor_dps = excluded.main_actor_dps
  where
    excluded.main_actor_dps > public.aion2_dps_rank.main_actor_dps
    or (
      excluded.main_actor_dps = public.aion2_dps_rank.main_actor_dps
      and excluded.main_actor_damage > public.aion2_dps_rank.main_actor_damage
    )
    or (
      excluded.main_actor_dps = public.aion2_dps_rank.main_actor_dps
      and excluded.main_actor_damage = public.aion2_dps_rank.main_actor_damage
      and coalesce(excluded.battle_ended_at, '-infinity'::timestamptz)
        > coalesce(public.aion2_dps_rank.battle_ended_at, '-infinity'::timestamptz)
    );

  return jsonb_build_object(
    'success', true,
    'record_id', v_record_id,
    'trimmed_count', v_trimmed_count,
    'boss_max_party_total_damage', v_boss_max_party_total_damage
  );
end;
$$;
