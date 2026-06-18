# AION2 数据包协议分析

本文档用于记录当前项目已经确认、已经落地解析、或者已经具备较强推断依据的 AION2 数据包协议结构。

这份文档的定位不是“版本差异对比表”，而是“当前协议说明书”。  
也就是说，文档优先回答这些问题：

1. 一个 AION2 包从传输层到业务层大致长什么样。
2. 当前几个核心 opcode 的 payload 结构是什么。
3. 当前 `processor.rs` 是按什么规则解析这些包的。
4. 目前还有哪些结构点需要继续抓包确认。

当前重点覆盖的 opcode：

- `0x33 0x36`：主角色昵称
- `0x45 0x36`：其他角色昵称
- `0x41 0x36`：召唤物 / 实体出生 / mobCode / owner 映射
- `0x04 0x38`：直接伤害
- `0x05 0x38`：DoT 伤害
- `0x00 0x8D`：剩余血量
- `0x04 0x8D`：召唤物 owner 归属

## 1. 传输层结构

### 1.1 外层包头

当前协议的外层结构可以概括为：

```text
[length varint][optional extraFlag][payload...]
```

说明：

- `length varint`：描述整个包的长度
- `extraFlag`：可选，范围大致在 `0xF0..0xFE`
- `payload`：真正的业务包，从 opcode 开始

在当前实现里，这层逻辑由 [processor.rs](d:/NOIA-Workspace/noia2-app/src-tauri/src/dps_meter/capture/processor.rs) 里的 `consume_stream()` 和 `resolve_packet_prefix()` 负责。

### 1.2 extraFlag

某些包的实际结构会变成：

```text
[length varint][extraFlag][opcode...]
```

这里的 `extraFlag` 不属于业务 opcode，只代表传输层额外插入了 1 个字节。  
当前逻辑会在切包阶段统一把它跳过，后面的解析函数都默认拿到的是从 opcode 开始的 payload。

### 1.3 bundle / 压缩包

如果 payload 起始位置是：

```text
FF FF
```

则该包不是普通业务包，而是一个压缩 bundle。  
bundle 解开后，内部会继续拆成多个小包，每个小包仍然遵循：

```text
[length varint][optional extraFlag][payload...]
```

## 2. 当前主解析入口

当前 `processor.rs` 的解析入口已经统一成“先切到 payload，再按 opcode 分发”。

也就是说，当前业务层默认使用下面这种分发思路：

```text
payload[0], payload[1] -> opcode
```

目前主要分发关系为：

```text
33 36 -> parse_main_nickname
45 36 -> parse_other_nickname
41 36 -> parse_4136_packet
04 38 -> parse_damage_packet
05 38 -> parse_dot_packet
00 8D -> parse_remain_hp_packet
04 8D -> parse_summon_ownership_packet
```

## 3. 3336：主角色昵称包

### 3.1 当前理解

`3336` 用于识别主角色的：

- actor id
- 昵称
- server id
- 可选的 job 字段

### 3.2 当前 payload 推断结构

```text
[33 36]
[actor_id varint]
[unknown bytes ...]
[07]
[nickname_len varint]
[nickname utf8 bytes]
[server_id u16 le]
[job u8]
[unknown trailing bytes ...]
```

这里最关键的结构锚点有两个：

1. `actor_id varint`
2. `0x07` 分隔字节

当前实现默认认为：

- `actor_id` 后面不远处会出现一个 `0x07`
- `0x07` 后面是昵称长度字段
- 昵称长度字段应该按 varint 读取

### 3.3 当前 Rust 解析步骤

当前实现见 [parse_main_nickname](d:/NOIA-Workspace/noia2-app/src-tauri/src/dps_meter/capture/processor.rs:1075)。

当前逻辑是：

1. 确认 payload 从 `33 36` 开始
2. 从 `payload[2..]` 读取 `actor_id varint`
3. 从后续 `10` 字节窗口内寻找一个 `0x07`
4. 在 `0x07` 后用 `read_varint()` 读取昵称长度
5. 按 UTF-8 提取昵称
6. 紧跟昵称后读取 2 字节 `server id`
7. 再向后读取 1 字节 `job`，但当前仅消费，不参与业务逻辑
8. 调用：
   - `append_actor(...)`
   - `set_main_actor(...)`

### 3.4 历史问题：为什么会只解析出两个字

这是 `3336` 曾经出现过的一个典型问题。

表现是：

> 角色名本来更长，但解析结果只剩两个汉字

这个问题通常意味着不是“UI 显示截断”，而是“协议长度字段消费错位”。

最常见的原因是：

1. 把 `nickname_len varint` 错当成了单字节长度
2. 找错了 `0x07` 锚点

假设错误长度正好读成 `6`，那么 UTF-8 中文经常就是：

- 1 个汉字 = 3 字节
- 6 字节 = 2 个汉字

于是最终现象就会稳定表现成“只剩两个字”。

当前实现已经改成了：

```text
0x07 -> read_varint(name_len)
```

这也是当前对 `3336` 最重要的一次修正。

### 3.5 当前还不完全确定的点

1. `0x07` 是否始终稳定存在于 `actor_id` 后 10 字节范围内
2. `server id` 是否始终紧跟昵称之后
3. `job` 字段在不同区服和不同语言环境下是否始终存在

## 4. 4536：其他角色昵称包

### 4.1 当前理解

`4536` 用于识别其他角色的：

- actor id
- 昵称
- server id
- 可选的 job 字段

它的结构比 `3336` 更松散，不是靠固定锚点定位，而是靠多段候选扫描。

### 4.2 当前 payload 推断结构

```text
[45 36]
[actor_id varint]
[unknown_1 varint]
[unknown_2 varint]
[unknown 1 byte]
[nickname_len varint]   // 位置可能相对基准偏移 0..4
[nickname utf8 bytes]
[job u8]
[server_id ...]
[legion / trailing ...]
```

### 4.3 当前 Rust 解析步骤

当前实现见：

- [parse_other_nickname](d:/NOIA-Workspace/noia2-app/src-tauri/src/dps_meter/capture/processor.rs:1152)
- [extract_4436_actor](d:/NOIA-Workspace/noia2-app/src-tauri/src/dps_meter/capture/processor.rs:1178)

解析思路：

1. 读取 `actor_id`
2. 再读取两个未知 varint
3. 跳过 1 字节
4. 从接下来 `0..4` 的偏移中尝试寻找一个合法昵称长度字段
5. 候选必须满足：
   - 长度合法
   - UTF-8 可解码
   - `sanitize_nickname()` 后仍然有效
6. 选取“最合理”的那个名字
7. 名字后面再读取 `job`
8. 从其后继续寻找 server id

### 4.4 当前仍需确认的点

1. 业务 opcode 是否应为 `44 36` 还是 `45 36`
2. 昵称区起点为什么会存在 `0..4` 的漂移
3. `server id` 后面是否稳定跟有军团名或其他文本段

## 5. 4136：召唤物 / 实体出生包

### 5.1 当前理解

`4136` 当前承担两类职责：

1. 建立 `actor_id -> mobCode` 映射
2. 建立 `summon_id -> owner_id` 映射

当前实现已经统一收敛到 `parse_summon_packet()` 这一条主链路，`41 36` 的主流程不再拆成多个入口函数：

- `mobCode` 提取部分刻意保持与 Kotlin 旧实现一致
- `owner` 提取部分保留 Rust 当前的多级 fallback

### 5.2 当前 payload 推断结构

```text
[41 36]
[summon_or_actor_id varint]
[unknown ...]
[mob_code marker: 00 40 02 or 00 00 02]
[unknown ...]
[FF FF FF FF FF FF FF FF]
[unknown ...]
[07 02 06]
[owner_id u16 le]
```

### 5.3 4136 主解析步骤

当前 `parse_summon_packet()` 会在同一个函数里先做 `mobCode` 提取，再做 `owner` 提取。

#### 第一段：提取 `summon_id -> mobCode`

这一段按 Kotlin 老版本的经验逻辑保持一致：

1. 跳过 opcode `41 36`
2. 从 `payload[2..]` 读取 `summon_id varint`
3. 在整包中优先查找：

- `00 40 02`
- 或 `00 00 02`

4. 一旦找到 marker，就回看它前面的 3 个字节
5. 这 3 个字节按 little-endian 24bit 方式拼成 `mobCode`
6. 保存：

```text
summon_id -> mobCode
```

这一段保留 Kotlin 风格的原因是：

- 结构锚点清晰
- 和旧版抓包经验完全一致
- 调试时更容易直接对照原始十六进制

#### 第二段：提取 `summon_id -> owner_id`

owner 部分不退回 Kotlin 的单一路径，而是继续保留当前 Rust 的增强实现。

当前 owner 提取有多条路径：

1. `extract_summon_owner_kotlin_style()`
2. `scan_for_known_player_le32()`
3. `extract_owner_from_packet()`
4. 昵称匹配兜底

其中第一条是当前最优先、也最接近协议原始结构的路径。

### 5.4 Kotlin 风格 owner 路径

这条路径的当前理解是：

1. 找连续 8 个 `FF`
2. 在其后找 `07 02 06`
3. 从固定偏移取 2 字节 owner id

当前已经修正过一次偏移问题。  
之前 owner 偏移按原包绝对位置计算错误，会导致 Kotlin 风格路径几乎总失败，最后全掉到 `summon fallback le32`。

### 5.5 为什么不把 owner 逻辑也完全改回 Kotlin

因为真实线上数据里，`41 36` 并不是每次都能只靠一条规则稳定得到 owner。

如果只保留 Kotlin 的单条路径，会有两个问题：

1. 一旦该锚点缺失，就会直接丢失 owner 映射
2. 某些包虽然能识别出召唤物，但 owner 信息分布并不完全固定

所以当前方案是：

- `mobCode` 部分尽量保持经典经验，方便验证
- `owner` 部分保留 Rust 的增强容错，优先保证稳定性

## 6. 048D：召唤物归属包

### 6.1 当前理解

`04 8D` 是一条更直接的 summon ownership 包，用于显式建立：

```text
summon_id -> owner_id
```

### 6.2 当前 payload 推断结构

```text
[04 8D]
[summon_id varint]
[00 00 00 00]
[owner_id varint]
```

### 6.3 当前 Rust 解析步骤

当前实现见 [parse_summon_ownership_packet](d:/NOIA-Workspace/noia2-app/src-tauri/src/dps_meter/capture/processor.rs:647)。

主要规则：

1. 读取 `summon_id`
2. 确认后面紧跟 4 字节 `00`
3. 再读取 `owner_id`
4. 建立映射

### 6.4 当前注意点

如果协议里确实存在 `owner_id < 100` 的合法场景，那么这里不能简单用“玩家 id 一定大于 100”的老假设来过滤。

## 7. 0438：直接伤害包

### 7.1 当前 payload 推断结构

```text
[04 38]
[target_id varint]
[switch varint]
[flag varint]
[actor_id varint]
[skill_code u32 le + 1 unknown byte]
[type varint]
[special / damage flags bytes]
[unknown varint]
[damage varint]
[multihit tail ...]
```

### 7.2 当前解析关注点

当前实现见 [parse_damage_packet](d:/NOIA-Workspace/noia2-app/src-tauri/src/dps_meter/capture/processor.rs:283)。

当前已知关键点：

1. `switch & 0x0F` 决定 special bytes 的长度
2. `skill_code` 后紧跟 1 个未知字节
3. 后续存在 `unknown -> damage -> multihit` 结构
4. 同一个 payload 中可能包含 chained hit

### 7.3 当前未完全稳定的点

1. `Restoration` 对 offset 的影响是否完全还原
2. multi-hit 的各类边界包是否都已经覆盖
3. 某些极端小 actor id 是否应直接过滤

## 8. 0538：DoT 伤害包

### 8.1 当前 payload 推断结构

```text
[05 38]
[target_id varint]
[unknown_bit_flag u8]
[actor_id varint]
[unknown varint]
[skill_code u32 le]
[damage varint]
```

### 8.2 当前已知规则

最关键的一位是：

```text
unknown_bit_flag & 0x02
```

如果这位不成立，则当前 DoT 包不会进入正常伤害统计。

## 9. 008D：剩余血量包

### 9.1 当前 payload 推断结构

```text
[00 8D]
[mob_id varint]
[unknown_1 varint]
[unknown_2 varint]
[unknown_3 varint]
[current_hp u32 le]
```

### 9.2 当前 Rust 解析步骤

当前实现见 [parse_remain_hp_packet_at](d:/NOIA-Workspace/noia2-app/src-tauri/src/dps_meter/capture/processor.rs:691)。

主要逻辑：

1. 读取 `mob_id`
2. 跳过三个未知 varint
3. 读取 `current_hp`
4. 写入当前血量与历史最大血量
5. 如果满足条件，还会触发 possible boss 逻辑

## 10. 当前最主要的不确定点

### 10.1 3336 的 `0x07` 锚点是否绝对稳定

目前已经足够稳定到可以工作，但是否始终在 `actor_id` 后 10 字节内，还需要更多真实样本确认。

### 10.2 4536 的 opcode 是否最终应回到 `44 36`

当前 Rust 走的是 `45 36`，这需要继续抓包确认。

### 10.3 4136 的 owner 提取是否应以 Kotlin 风格路径为主

如果后续日志里还是大量命中 `fallback le32`，说明我们对 `41 36` 的 owner 结构理解还不够稳。

### 10.4 048D 中 owner / summon 的小 id 是否为合法值

这会影响召唤物归属的过滤策略。

## 11. 建议的后续分析顺序

当前最适合继续推进的顺序：

1. 继续抓 `3336` 的真实样本，确认 `nickname_len` 是否始终为 varint
2. 补 `4536` 的真实样本，确认 opcode 与 server 区段
3. 统计 `4136` 中 Kotlin 风格 owner 路径与 fallback 的命中比例
4. 再回头针对 `0438` 的特殊伤害包做单独专项分析

## 12. 小结

AION2 当前已知协议可以先按三层理解：

1. 传输层
   - `length varint`
   - `optional extraFlag`
   - `bundle`

2. 元数据层
   - `3336`
   - `4536`
   - `4136`
   - `048D`
   - `008D`

3. 战斗层
   - `0438`
   - `0538`

当前最关键的稳定点已经有了：

- 包切分逻辑稳定
- opcode 分发逻辑稳定
- 核心几个 opcode 已经都有明确入口

接下来最重要的工作，不再是“把代码先写出来”，而是继续用真实样本把每个包体字段再压实一层。
