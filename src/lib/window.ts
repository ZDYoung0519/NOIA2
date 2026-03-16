import { WebviewWindow } from "@tauri-apps/api/webviewWindow";

const createWindowLoading: Record<string, boolean> = {};

export async function showWindow(label: string) {
  const window = await WebviewWindow.getByLabel(label);
  if (!window) {
    return;
  }
  if (!(await window.isVisible())) {
    await window.show();
  }
  if (await window.isMinimized()) {
    await window.unminimize();
  }
  if (!(await window.isFocused())) {
    await window.setFocus();
  }
}

export async function createWindow(
  label: string,
  options: {
    title?: string;
    url?: string;
    width?: number;
    height?: number;
    minWidth?: number;
    minHeight?: number;
    maxWidth?: number;
    maxHeight?: number;
    resizable?: boolean;
    maximizable?: boolean;
    minimizable?: boolean;
    closable?: boolean;
    center?: boolean;
    x?: number;
    y?: number;
    decorations?: boolean;
    transparent?: boolean;
    alwaysOnTop?: boolean;
    skipTaskbar?: boolean;
  }
) {
  if (createWindowLoading[label]) {
    return;
  }
  createWindowLoading[label] = true;

  try {
    let window = await WebviewWindow.getByLabel(label);

    // 检查窗口是否真实存在（未被销毁）
    if (window) {
      try {
        const exists = await window.isVisible();
        if (exists !== undefined) {
          console.log("窗口已存在:", label);
          await showWindow(label);
          return;
        }
      } catch (e) {
        // 窗口已被销毁，继续创建新窗口
        console.log("窗口已销毁，重新创建:", label);
        window = null;
      }
    }

    const webview = new WebviewWindow(label, options);
    await webview.once("tauri://created", () => {
      console.log("创建窗口成功:", label);
    });
    await webview.once("tauri://error", (e) => {
      console.log("创建窗口失败:", label, e);
    });
  } finally {
    createWindowLoading[label] = false;
  }
}
