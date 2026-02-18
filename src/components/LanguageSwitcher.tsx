import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Languages } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

// 语言选项列表
const languages = [
  { code: "en-US", label: "English" },
  { code: "zh-CN", label: "简体中文" },
  { code: "zh-TW", label: "繁體中文" },
  { code: "ko-KR", label: "한국어" },
];

export function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const [open, setOpen] = useState(false);

  // // 获取当前语言对应的显示标签
  // const currentLanguage =
  //   languages.find((lang) => lang.code === i18n.language) || languages[0];

  const handleLanguageChange = (langCode: string) => {
    i18n.changeLanguage(langCode);
    setOpen(false); // 切换后关闭弹窗
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          className="w-full justify-center px-3 py-2"
          onClick={() => console.log("Language")}
        >
          <Languages className="mr-3 h-4 w-4" />
          语言选择
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>选择语言</DialogTitle>
        </DialogHeader>
        <div className="grid gap-2 py-4">
          {languages.map((lang) => (
            <Button
              key={lang.code}
              variant={i18n.language === lang.code ? "default" : "ghost"}
              className="w-full justify-start"
              onClick={() => handleLanguageChange(lang.code)}
            >
              {lang.label}
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
