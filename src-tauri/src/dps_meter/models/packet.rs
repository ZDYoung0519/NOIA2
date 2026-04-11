use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum SpecialDamage {
    Back,
    Parry,
    Perfect,
    Double,
    Smite,
    Critical,
}

impl SpecialDamage {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Back => "BACK",
            Self::Parry => "PARRY",
            Self::Perfect => "PERFECT",
            Self::Double => "DOUBLE",
            Self::Smite => "SMITE",
            Self::Critical => "CRITICAL",
        }
    }
}

#[derive(Debug, Clone, Copy, Default)]
pub struct VarIntOutput {
    pub value: i64,
    pub length: usize,
}

impl VarIntOutput {
    pub fn invalid() -> Self {
        Self {
            value: -1,
            length: 0,
        }
    }

    pub fn is_valid(&self) -> bool {
        self.length > 0 && self.value >= 0
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParsedDamagePacket {
    pub target_id: u32,
    pub actor_id: u32,
    pub skill_code: u32,
    pub ori_skill_code: u32,
    pub damage: u64,
    pub is_dot: bool,
    pub is_crit: bool,
    pub multi_hit_damage: u64,
    pub multi_hit_count: u32,
    pub specials: Vec<String>,
}
