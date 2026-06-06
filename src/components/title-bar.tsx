import { useEffect, useState, ReactNode, CSSProperties } from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { Minus, Maximize2, Minimize2, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface TitleBarProps {
  title?: string;
  showAppIcon?: boolean;
  showMinimize?: boolean;
  showMaximize?: boolean;
  showClose?: boolean;
  leftActions?: ReactNode;
  rightActions?: ReactNode;
  onDoubleClick?: () => void;
  className?: string;
  style?: CSSProperties;
}

export function TitleBar({
  title,
  showAppIcon = true,
  showMinimize = true,
  showMaximize = true,
  showClose = true,
  leftActions,
  rightActions,
  onDoubleClick,
  className,
  style,
}: TitleBarProps) {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    if (!showMaximize) return;

    const appWindow = getCurrentWebviewWindow();

    // Initialize maximized state
    appWindow.isMaximized().then(setIsMaximized);

    // Listen for window resize events
    const unlisten = appWindow.onResized(async () => {
      const maximized = await appWindow.isMaximized();
      setIsMaximized(maximized);
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [showMaximize]);

  const handleMinimize = async () => {
    const appWindow = getCurrentWebviewWindow();
    await appWindow.minimize();
  };

  const handleToggleMaximize = async () => {
    const appWindow = getCurrentWebviewWindow();
    await appWindow.toggleMaximize();
  };

  const handleClose = async () => {
    const appWindow = getCurrentWebviewWindow();
    await appWindow.close();
  };

  const handleDragRegionDoubleClick = () => {
    if (onDoubleClick) {
      onDoubleClick();
    } else if (showMaximize) {
      handleToggleMaximize();
    }
  };

  return (
    <div
      style={style}
      data-tauri-drag-region
      className={cn(
        "drag-region text-card-foreground relative z-20 flex h-16 shrink-0 items-center justify-between bg-transparent select-none",
        className
      )}
    >
      <div className="flex min-w-0 grow items-center gap-3 pl-3.5">
        {leftActions}

        <div
          onDoubleClick={handleDragRegionDoubleClick}
          className="drag-region flex min-w-0 grow items-center gap-2"
        >
          {showAppIcon && (
            <img
              src="icon.png"
              alt="App icon"
              className="size-4 shrink-0 rounded-sm"
              onError={(event) => {
                (event.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
          )}
          {title && (
            <span className="text-muted-foreground truncate text-[13px] font-medium">{title}</span>
          )}
        </div>
      </div>

      {/* Right: Control buttons */}
      <div className="flex h-full shrink-0 items-center">
        {rightActions}

        {rightActions && (showMinimize || showMaximize || showClose) && (
          <div className="bg-muted-foreground/15 mx-1 h-4 w-px" />
        )}

        {showMinimize && (
          <button
            onClick={handleMinimize}
            className="title-bar-control no-drag-region"
            aria-label="Minimize"
            tabIndex={-1}
          >
            <Minus />
          </button>
        )}

        {showMaximize && (
          <button
            onClick={handleToggleMaximize}
            className="title-bar-control no-drag-region"
            aria-label={isMaximized ? "Restore" : "Maximize"}
            tabIndex={-1}
          >
            {isMaximized ? <Minimize2 /> : <Maximize2 />}
          </button>
        )}

        {showClose && (
          <button
            onClick={handleClose}
            className="title-bar-control no-drag-region hover:bg-destructive hover:text-destructive-foreground"
            aria-label="Close"
            tabIndex={-1}
          >
            <X />
          </button>
        )}
      </div>
    </div>
  );
}
