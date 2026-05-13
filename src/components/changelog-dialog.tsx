import { useMemo, useState } from "react";
import { BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import changelogRaw from "../../CHANGELOG.md?raw";

interface ChangelogEntry {
  version: string;
  title: string;
  items: string[];
  nextTitle: string;
  nextItems: string[];
}

function parseChangelog(raw: string): ChangelogEntry[] {
  const entries: ChangelogEntry[] = [];
  const lines = raw.split("\n");

  let currentEntry: ChangelogEntry | null = null;
  let section: "title" | "next" | null = null;

  for (const line of lines) {
    const versionMatch = line.match(/^##\s+\[(.+?)\]/);
    if (versionMatch) {
      if (currentEntry) {
        entries.push(currentEntry);
      }
      currentEntry = {
        version: versionMatch[1],
        title: "",
        items: [],
        nextTitle: "",
        nextItems: [],
      };
      section = null;
      continue;
    }

    if (!currentEntry) continue;

    const headingMatch = line.match(/^###\s+(.+)/);
    if (headingMatch) {
      const heading = headingMatch[1];
      if (heading.includes("本次更新")) {
        currentEntry.title = heading;
        section = "title";
      } else if (heading.includes("近期更新")) {
        currentEntry.nextTitle = heading;
        section = "next";
      } else {
        // Other headings like `### Changed` or `### Fixed` from keep-a-changelog
        if (section === "next") {
          currentEntry.nextItems.push(heading);
        } else {
          currentEntry.items.push(heading);
        }
      }
      continue;
    }

    const itemMatch = line.match(/^-\s+(.+)/);
    if (itemMatch) {
      const item = itemMatch[1];
      if (section === "next") {
        currentEntry.nextItems.push(item);
      } else {
        // Items before any `###` heading go to the main list
        currentEntry.items.push(item);
      }
    }
  }

  if (currentEntry) {
    entries.push(currentEntry);
  }

  return entries;
}

function ChangelogContent({ entries }: { entries: ChangelogEntry[] }) {
  const latest = entries[0];
  const rest = entries.slice(1);

  return (
    <div className="max-h-[70vh] space-y-6 overflow-y-auto pr-1">
      {latest && (
        <div className="rounded-xl border border-blue-500/20 bg-blue-500/[0.04] p-5">
          <div className="mb-1 flex items-center gap-2">
            <span className="rounded-full bg-blue-500/15 px-2 py-0.5 text-xs font-semibold text-blue-300">
              v{latest.version}
            </span>
            <span className="text-xs text-blue-300/60">最新</span>
          </div>
          {latest.title && (
            <h3 className="mt-3 text-sm font-semibold text-white/80">{latest.title}</h3>
          )}
          <ul className="mt-2 space-y-1.5">
            {latest.items.map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-white/70">
                <span className="mt-1.5 block h-1 w-1 shrink-0 rounded-full bg-blue-400/60" />
                {item}
              </li>
            ))}
          </ul>
          {latest.nextItems.length > 0 && (
            <>
              <h3 className="mt-4 text-sm font-semibold text-white/60">{latest.nextTitle}</h3>
              <ul className="mt-2 space-y-1.5">
                {latest.nextItems.map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-white/50">
                    <span className="mt-1.5 block h-1 w-1 shrink-0 rounded-full bg-white/20" />
                    {item}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {rest.map((entry) => (
        <div key={entry.version} className="border-b border-white/5 pb-5 last:border-0">
          <span className="rounded-full bg-white/5 px-2 py-0.5 text-xs font-semibold text-white/40">
            v{entry.version}
          </span>
          {entry.title && (
            <h3 className="mt-2 text-sm font-semibold text-white/60">{entry.title}</h3>
          )}
          <ul className="mt-2 space-y-1">
            {entry.items.map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-white/40">
                <span className="mt-1.5 block h-1 w-1 shrink-0 rounded-full bg-white/15" />
                {item}
              </li>
            ))}
          </ul>
          {entry.nextItems.length > 0 && (
            <>
              <h3 className="mt-3 text-xs font-semibold text-white/40">{entry.nextTitle}</h3>
              <ul className="mt-1.5 space-y-1">
                {entry.nextItems.map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-white/30">
                    <span className="mt-1.5 block h-1 w-1 shrink-0 rounded-full bg-white/10" />
                    {item}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      ))}
    </div>
  );
}

export function ChangelogDialogButton() {
  const [open, setOpen] = useState(false);

  const entries = useMemo(() => parseChangelog(changelogRaw), []);

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <BookOpen data-icon="inline-start" />
        更新日志
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-background/95 max-h-[85vh] w-[55vw] border-white/10 text-white backdrop-blur-sm sm:max-w-[55vw]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-semibold">
              <BookOpen className="h-5 w-5 text-blue-400" />
              更新日志
            </DialogTitle>
          </DialogHeader>
          <ChangelogContent entries={entries} />
        </DialogContent>
      </Dialog>
    </>
  );
}
