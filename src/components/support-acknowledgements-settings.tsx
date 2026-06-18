import { openUrl } from "@tauri-apps/plugin-opener";
import { ExternalLink, HeartHandshake } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SettingsGroup, SettingsSectionHeader } from "@/components/settings-layout";

type SupportMethod = {
  title: string;
  description: string;
  imageSrc: string;
  imageAlt: string;
};

type CreditItem = {
  name: string;
  description: string;
  href: string;
  avatarSrc?: string;
  avatarFallback: string;
  badge: string;
};

const SUPPORT_METHODS: SupportMethod[] = [
  {
    title: "爱发电",
    description: "适合长期支持项目维护、服务器和分发成本。",
    imageSrc: "/images/qr/afd.jpg",
    imageAlt: "爱发电赞助二维码",
  },
  {
    title: "微信赞赏",
    description: "如果这个工具帮你省下了一点折腾时间，可以请作者喝杯咖啡。",
    imageSrc: "/images/qr/wxpay.jpg",
    imageAlt: "微信赞赏二维码",
  },
  {
    title: "交流群",
    description: "加入群聊反馈问题、讨论功能，或者看看最近大家在折腾什么。",
    imageSrc: "/images/qr/qq.jpg",
    imageAlt: "QQ 交流群二维码",
  },
];

const TECHNICAL_CREDITS: CreditItem[] = [
  {
    name: "TK-open-public/Aion2-Dps-Meter",
    description: "Aion2 DPS 解析与实现参考。",
    href: "https://github.com/TK-open-public/Aion2-Dps-Meter",
    avatarSrc: "https://avatars.githubusercontent.com/u/253818446?s=80&v=4",
    avatarFallback: "TK",
    badge: "Reference",
  },
  {
    name: "taengu/Aion2-Dps-Meter",
    description: "Aion2 DPS Meter 相关开源实现参考。",
    href: "https://github.com/taengu/Aion2-Dps-Meter",
    avatarSrc: "https://avatars.githubusercontent.com/u/7606218?s=80&v=4",
    avatarFallback: "TG",
    badge: "Reference",
  },
  {
    name: "p62003/aletheia_AION2_DPS_Meter",
    description: "AION2 DPS 数据采集与展示思路参考。",
    href: "https://github.com/p62003/aletheia_AION2_DPS_Meter",
    avatarSrc: "https://avatars.githubusercontent.com/u/125135560?s=80&v=4",
    avatarFallback: "P6",
    badge: "Reference",
  },
];

function openExternalLink(href: string) {
  void openUrl(href);
}

function SupportMethodCard({ method }: { method: SupportMethod }) {
  return (
    <div className="flex items-center gap-4 rounded-md border p-4">
      <div className="bg-muted/30 size-28 shrink-0 overflow-hidden rounded-md border">
        <img
          src={method.imageSrc}
          alt={method.imageAlt}
          className="aspect-square size-full object-cover"
        />
      </div>
      <div className="flex min-w-0 flex-col gap-1">
        <div className="text-sm font-semibold">{method.title}</div>
        <p className="text-muted-foreground text-xs leading-5">{method.description}</p>
      </div>
    </div>
  );
}

function CreditRow({ item }: { item: CreditItem }) {
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-4">
      <div className="flex min-w-0 items-center gap-3">
        <Avatar size="lg">
          {item.avatarSrc ? <AvatarImage src={item.avatarSrc} alt={item.name} /> : null}
          <AvatarFallback>{item.avatarFallback}</AvatarFallback>
        </Avatar>
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-medium">{item.name}</span>
            <Badge variant="secondary">{item.badge}</Badge>
          </div>
          <p className="text-muted-foreground truncate text-xs">{item.description}</p>
        </div>
      </div>
      <Button variant="outline" size="sm" onClick={() => openExternalLink(item.href)}>
        <ExternalLink data-icon="inline-start" />
        打开
      </Button>
    </div>
  );
}

export function SupportAcknowledgementsSettings() {
  return (
    <div className="flex flex-col gap-8">
      <SettingsSectionHeader
        title="支持与鸣谢"
        description="感谢每一位反馈、测试、赞助和开源分享的朋友。这个页面记录项目继续往前走所依赖的善意。"
      />

      <SettingsGroup title="支持项目">
        <div className="px-5 py-5">
          <div className="mb-5 flex items-center gap-2">
            <HeartHandshake data-icon="inline-start" />
            <div>
              <div className="text-sm font-semibold">支持项目</div>
              <p className="text-muted-foreground mt-1 text-xs leading-5">
                你的支持会用于维护 Aion2 DPS 工具、排行榜和后续功能。
              </p>
            </div>
          </div>
          <div className="grid gap-4 xl:grid-cols-3">
            {SUPPORT_METHODS.map((method) => (
              <SupportMethodCard key={method.title} method={method} />
            ))}
          </div>
        </div>
      </SettingsGroup>

      <SettingsGroup title="技术鸣谢">
        {TECHNICAL_CREDITS.map((item) => (
          <CreditRow key={item.href} item={item} />
        ))}
      </SettingsGroup>
    </div>
  );
}
