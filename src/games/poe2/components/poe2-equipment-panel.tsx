import { useMemo, useState } from "react";

import equipmentById, {
  type Poe2Item,
  type Poe2ItemStat,
  slotItemMap,
} from "@/games/poe2/data/equipment";

const PANEL_WIDTH = 750;
const PANEL_HEIGHT = 568;
const PANEL_IMAGE = "/poe2/weapon-box.webp";
const DEFAULT_SKILL_ICON = "/poe2/GemSkill_SorceressSolarOrb.png";

type EquipmentSlot = {
  id: keyof typeof slotItemMap;
  x: number;
  y: number;
  width: number;
  height: number;
};

const EQUIPMENT_SLOTS: EquipmentSlot[] = [
  { id: "weapon-main", x: 80, y: 40, width: 120, height: 240 },
  { id: "helmet", x: 318, y: 24, width: 120, height: 120 },
  { id: "gloves", x: 168, y: 296, width: 120, height: 120 },
  { id: "ring-left", x: 230, y: 218, width: 60, height: 60 },
  { id: "ring-right", x: 464, y: 145, width: 60, height: 60 },
  { id: "body-armour", x: 318, y: 159, width: 120, height: 180 },
  { id: "boots", x: 468, y: 294, width: 120, height: 120 },
  { id: "belt", x: 318, y: 356, width: 120, height: 60 },
  { id: "amulet", x: 465, y: 218, width: 60, height: 60 },
  { id: "flask-life", x: 200, y: 430, width: 60, height: 120 },
  { id: "flask-mana", x: 286, y: 460, width: 60, height: 60 },
  { id: "flask-utility", x: 496, y: 428, width: 60, height: 120 },
];

type RarityTone = {
  title: string;
  base: string;
  body: string;
  value: string;
  flavour: string;
  background: string;
  separator?: string;
  headerLeft?: string;
  headerMiddle?: string;
  headerRight?: string;
};

const rarityTone: Record<string, RarityTone> = {
  Normal: {
    title: "text-[#d0d0d0]",
    base: "text-[#d0d0d0]",
    body: "text-[#7f7f7f]",
    value: "text-[#d0d0d0]",
    flavour: "text-[#baad86]",
    background: "bg-black/95",
    separator: "/poe2/separator-rare.png",
  },
  Magic: {
    title: "text-[#8888ff]",
    base: "text-[#d8d8ff]",
    body: "text-[#7f7f7f]",
    value: "text-[#d0d0d0]",
    flavour: "text-[#baad86]",
    background: "bg-black/95",
    headerLeft: "/poe2/header-magic-left.png",
    headerMiddle: "/poe2/header-magic-middle.png",
    headerRight: "/poe2/header-magic-right.png",
    separator: "/poe2/separator-rare.png",
  },
  Rare: {
    title: "text-[#f1e4c2]",
    base: "text-[#fff1bf]",
    body: "text-[#7f7f7f]",
    value: "text-[#d0d0d0]",
    flavour: "text-[#baad86]",
    background: "bg-black/95",
    headerLeft: "/poe2/header-double-rare-left.png",
    headerMiddle: "/poe2/header-double-rare-middle.png",
    headerRight: "/poe2/header-double-rare-left.png",
    separator: "/poe2/separator-rare.png",
  },
  Unique: {
    title: "text-[#af6025]",
    base: "text-[#f0c79a]",
    body: "text-[#7f7f7f]",
    value: "text-[#d0d0d0]",
    flavour: "text-[#baad86]",
    background: "bg-black/95",
    headerLeft: "/poe2/header-double-unique-left.png",
    headerMiddle: "/poe2/header-double-unique-middle.png",
    headerRight: "/poe2/header-double-unique-right.png",
    separator: "/poe2/separator-unique.png",
  },
} as const;

function resolvePoeAssetUrl(src?: string | null) {
  if (!src) {
    return undefined;
  }

  if (src.startsWith("http://") || src.startsWith("https://") || src.startsWith("/poe2/")) {
    return src;
  }

  if (src.startsWith("/protected/")) {
    return `https://web.poecdn.com${src}`;
  }

  return src;
}

function stripMarkup(value: string) {
  return value.replace(/\[([^|\]]+)\|([^\]]+)\]/g, "$2").replace(/\[([^\]]+)\]/g, "$1");
}

function formatStat(stat: Poe2ItemStat) {
  const name = stripMarkup(stat.name);

  if (!stat.values.length) {
    return name;
  }

  return name.replace(/\{(\d+)\}/g, (_, index) =>
    stripMarkup(stat.values[Number(index)]?.[0] ?? "")
  );
}

function formatRequirement(stat: Poe2ItemStat) {
  const label = stripMarkup(stat.name);
  const value = stripMarkup(stat.values[0]?.[0] ?? "");
  return { label, value };
}

function getDisplayName(item: Poe2Item) {
  return item.name.trim() || item.typeLine;
}

function getBaseType(item: Poe2Item) {
  return item.name.trim() ? item.typeLine : "";
}

function PopupSeparator({ src }: { src?: string }) {
  if (!src) {
    return <div className="my-2 h-px bg-[#3a3124]" />;
  }

  return (
    <img
      src={src}
      alt=""
      className="my-2 h-[7px] w-full object-fill opacity-90"
      draggable={false}
    />
  );
}

function ItemPopup({ item }: { item: Poe2Item }) {
  const tone = rarityTone[item.frameTypeId as keyof typeof rarityTone] ?? rarityTone.Normal;
  const headerName = getDisplayName(item);
  const headerBaseType = getBaseType(item);
  const properties = item.properties.map(formatStat).filter(Boolean);
  const requirements = (item.requirements ?? [])
    .map(formatRequirement)
    .filter((value) => value.value);
  const grantedSkills = (item.grantedSkills ?? []).map((skill) => ({
    label: stripMarkup(skill.name),
    value: stripMarkup(skill.values[0]?.[0] ?? ""),
    icon: resolvePoeAssetUrl(skill.icon) ?? DEFAULT_SKILL_ICON,
  }));
  const implicitMods = (item.implicitMods ?? []).map(stripMarkup);
  const utilityMods = (item.utilityMods ?? []).map(stripMarkup);
  const explicitMods = (item.explicitMods ?? []).map(stripMarkup);
  const descrText = item.descrText ? stripMarkup(item.descrText) : "";
  const flavourText = (item.flavourText ?? []).map(stripMarkup).join("\n").trim();

  return (
    <div className="pointer-events-none absolute top-0 left-0 z-30">
      <div
        className={`max-w-[420px] min-w-[340px] border border-[#3c2f1f] px-2 pt-1 pb-2 shadow-[0_18px_40px_rgba(0,0,0,0.62)] ring-1 ring-[#000000]/70 ${tone.background}`}
        style={{
          backgroundImage:
            "linear-gradient(180deg, rgba(38,29,18,0.3) 0%, rgba(0,0,0,0) 14%, rgba(0,0,0,0) 100%)",
        }}
      >
        <div className="relative overflow-hidden text-center">
          <div className="absolute inset-y-0 left-0 w-[42px]">
            {tone.headerLeft ? (
              <img
                src={tone.headerLeft}
                alt=""
                className="h-full w-full object-fill"
                draggable={false}
              />
            ) : null}
          </div>
          <div className="absolute inset-y-0 right-[42px] left-[42px]">
            {tone.headerMiddle ? (
              <img
                src={tone.headerMiddle}
                alt=""
                className="h-full w-full object-fill"
                draggable={false}
              />
            ) : null}
          </div>
          <div className="absolute inset-y-0 right-0 w-[42px]">
            {tone.headerRight ? (
              <img
                src={tone.headerRight}
                alt=""
                className="h-full w-full object-fill"
                draggable={false}
                style={item.frameTypeId === "Rare" ? { transform: "scaleX(-1)" } : undefined}
              />
            ) : null}
          </div>

          <div className="relative px-10 py-2">
            <div
              className={`font-["Fontin SmallCaps","Trajan Pro",serif] text-[22px] leading-tight ${tone.title}`}
            >
              {headerName}
            </div>
            {headerBaseType ? (
              <div
                className={`font-["Fontin SmallCaps","Trajan Pro",serif] text-[20px] leading-tight ${tone.base}`}
              >
                {headerBaseType}
              </div>
            ) : null}
          </div>
        </div>

        <div
          className={`px-2 pt-2 pb-1 font-['Fontin',serif] text-[15px] leading-[1.5] ${tone.body}`}
        >
          {properties.length ? (
            <div className="flex flex-col items-center gap-0.5 text-center">
              {properties.map((property) => (
                <div key={property} className={tone.value}>
                  {property}
                </div>
              ))}
            </div>
          ) : null}

          {requirements.length ? (
            <>
              <PopupSeparator src={tone.separator} />
              <div className="text-center">
                Requires:{" "}
                {requirements.map((requirement, index) => (
                  <span key={`${requirement.label}-${requirement.value}`}>
                    {index > 0 ? ", " : null}
                    <span>{requirement.label} </span>
                    <span className={tone.value}>{requirement.value}</span>
                  </span>
                ))}
              </div>
            </>
          ) : null}

          {grantedSkills.length ? (
            <>
              <PopupSeparator src={tone.separator} />
              <div className="flex flex-col items-center gap-2 text-center">
                {grantedSkills.map((skill) => (
                  <div
                    key={`${skill.label}-${skill.value}`}
                    className="flex items-center justify-center gap-2"
                  >
                    <img
                      src={skill.icon}
                      alt=""
                      className="size-7 object-cover"
                      draggable={false}
                    />
                    <span>
                      {skill.label}: <span className={tone.value}>{skill.value}</span>
                    </span>
                  </div>
                ))}
              </div>
            </>
          ) : null}

          {utilityMods.length ? (
            <>
              <PopupSeparator src={tone.separator} />
              <div className="flex flex-col items-center gap-1 text-center">
                {utilityMods.map((mod) => (
                  <div key={mod} className={tone.value}>
                    {mod}
                  </div>
                ))}
              </div>
            </>
          ) : null}

          {implicitMods.length ? (
            <>
              <PopupSeparator src={tone.separator} />
              <div className="flex flex-col items-center gap-1 text-center">
                {implicitMods.map((mod) => (
                  <div key={mod} className={tone.value}>
                    {mod}
                  </div>
                ))}
              </div>
            </>
          ) : null}

          {explicitMods.length ? (
            <>
              <PopupSeparator src={tone.separator} />
              <div className="flex flex-col items-center gap-1 text-center">
                {explicitMods.map((mod) => (
                  <div key={mod} className={tone.value}>
                    {mod}
                  </div>
                ))}
              </div>
            </>
          ) : null}

          {descrText ? (
            <>
              <PopupSeparator src={tone.separator} />
              <div className="px-2 text-center">{descrText}</div>
            </>
          ) : null}

          {flavourText ? (
            <>
              <PopupSeparator src={tone.separator} />
              <div className={`px-2 text-center whitespace-pre-line italic ${tone.flavour}`}>
                {flavourText}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function getPopupPosition(slot: EquipmentSlot) {
  const popupWidth = 420;
  const gap = 18;
  const panelRightSpace = 1180 - PANEL_WIDTH;
  const preferRight = slot.x + slot.width + gap + popupWidth <= PANEL_WIDTH + panelRightSpace;

  return {
    left: preferRight ? slot.x + slot.width + gap : Math.max(0, slot.x - popupWidth - gap),
    top: Math.max(0, Math.min(PANEL_HEIGHT - 40, slot.y - 8)),
  };
}

export function Poe2EquipmentPanel() {
  const [activeSlotId, setActiveSlotId] = useState<keyof typeof slotItemMap | null>(null);
  const activeSlot = useMemo(
    () =>
      activeSlotId ? (EQUIPMENT_SLOTS.find((slot) => slot.id === activeSlotId) ?? null) : null,
    [activeSlotId]
  );
  const activeItem = useMemo(() => {
    if (!activeSlotId) {
      return null;
    }

    const itemId = slotItemMap[activeSlotId];
    return equipmentById[itemId] ?? null;
  }, [activeSlotId]);
  const popupPosition = useMemo(
    () => (activeSlot ? getPopupPosition(activeSlot) : null),
    [activeSlot]
  );

  return (
    <div className="relative w-[1180px] max-w-full select-none">
      <div className="relative w-full max-w-[750px] shrink-0">
        <svg
          viewBox={`0 0 ${PANEL_WIDTH} ${PANEL_HEIGHT}`}
          className="h-full w-full"
          aria-label="Poe2 equipment panel"
        >
          <image width={PANEL_WIDTH} height={PANEL_HEIGHT} href={PANEL_IMAGE} />
        </svg>

        {EQUIPMENT_SLOTS.map((slot) => {
          const isActive = activeSlotId === slot.id;
          // const item = equipmentById[slotItemMap[slot.id]];

          return (
            <button
              key={slot.id}
              type="button"
              className="absolute z-10 m-0 border-0 bg-transparent p-0"
              style={{
                left: `${(slot.x / PANEL_WIDTH) * 100}%`,
                top: `${(slot.y / PANEL_HEIGHT) * 100}%`,
                width: `${(slot.width / PANEL_WIDTH) * 100}%`,
                height: `${(slot.height / PANEL_HEIGHT) * 100}%`,
              }}
              onMouseEnter={() => setActiveSlotId(slot.id)}
              onMouseLeave={() =>
                setActiveSlotId((current) => (current === slot.id ? null : current))
              }
              onFocus={() => setActiveSlotId(slot.id)}
              onBlur={() => setActiveSlotId((current) => (current === slot.id ? null : current))}
            >
              <div
                className="relative h-full w-full cursor-pointer overflow-hidden rounded-[10px] border border-transparent transition duration-150"
                style={{
                  boxShadow: isActive
                    ? "inset 0 0 0 2px rgba(241, 228, 194, 0.82), 0 0 16px rgba(236, 200, 126, 0.25)"
                    : "none",
                  backgroundColor: isActive ? "rgba(255,255,255,0.05)" : "transparent",
                }}
              >
                {/* {icon ? (
                  <img src={icon} alt="" className="h-full w-full object-cover" draggable={false} />
                ) : null} */}
              </div>
            </button>
          );
        })}
      </div>

      <div
        className="pointer-events-none absolute z-20"
        style={{
          left: popupPosition ? `${popupPosition.left}px` : "-9999px",
          top: popupPosition ? `${popupPosition.top}px` : "-9999px",
        }}
      >
        {activeItem ? <ItemPopup item={activeItem} /> : null}
      </div>
    </div>
  );
}
