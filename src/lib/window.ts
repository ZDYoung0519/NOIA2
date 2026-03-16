import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { emit, once } from "@tauri-apps/api/event";

const createWindowLoading: Record<string, boolean> = {};
const destroyTimers: Record<string, number> = {};

export async function showWindow(label: string) {
  const window = await WebviewWindow.getByLabel(label);
  if (!window) {
    return;
  }

  // 清除销毁定时器
  if (destroyTimers[label]) {
    clearTimeout(destroyTimers[label]);
    delete destroyTimers[label];
    console.log("清除窗口销毁定时器:", label);
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

export async function hideWindow(label: string, destroyDelay = 5000) {
  const window = await WebviewWindow.getByLabel(label);
  if (!window) {
    return;
  }

  await window.hide();

  // 隐藏后延迟销毁
  await destroyWindow(label, destroyDelay);
}

/**
 * 计算子窗口相对于父窗口的居中位置
 * @param width 子窗口宽度（逻辑像素）
 * @param height 子窗口高度（逻辑像素）
 * @param parentLabel 父窗口标签，默认为当前窗口
 * @returns 居中位置坐标或 center 标志
 */
export async function calcCenterPosition(
  width: number,
  height: number,
  parentLabel?: string
) {
  const parentWindow = parentLabel
    ? await WebviewWindow.getByLabel(parentLabel)
    : WebviewWindow.getCurrent();

  if (!parentWindow) {
    return { center: true };
  }

  try {
    // 如果父窗口最小化，使用屏幕居中
    if (await parentWindow.isMinimized()) {
      return { center: true };
    }

    const position = await parentWindow.outerPosition();
    const size = await parentWindow.outerSize();
    const scaleFactor = await parentWindow.scaleFactor();

    // 验证所有值都存在
    if (!position || !size || !scaleFactor) {
      console.warn("无法获取父窗口信息，使用屏幕居中");
      return { center: true };
    }

    // 计算居中位置（考虑 DPI 缩放）
    const x = (position.x + (size.width - width * scaleFactor) / 2) / scaleFactor;
    const y = (position.y + (size.height - height * scaleFactor) / 2) / scaleFactor;

    // 验证计算结果
    if (isNaN(x) || isNaN(y)) {
      console.warn("计算位置失败，使用屏幕居中");
      return { center: true };
    }

    return { x, y };
  } catch (e) {
    console.warn("计算居中位置失败:", e);
    return { center: true };
  }
}

export async function destroyWindow(label: string, delay = 0) {
  const window = await WebviewWindow.getByLabel(label);
  if (!window) {
    return;
  }

  if (!delay) {
    // 立即销毁
    await emit("destroy-window:" + label);
    await window.destroy();
  } else {
    // 延迟销毁
    if (destroyTimers[label]) {
      clearTimeout(destroyTimers[label]);
    }
    await window.hide();
    destroyTimers[label] = setTimeout(async () => {
      await emit("destroy-window:" + label);
      await window.destroy();
      delete destroyTimers[label];
    }, delay) as unknown as number;
    console.log(`窗口将在 ${delay}ms 后销毁:`, label);
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
    shadow?: boolean;
    parent?: string;
  },
  handlers?: {
    onCreated?: () => void;
    onDestroy?: () => void;
    onError?: () => void;
  }
) {
  if (createWindowLoading[label]) {
    return;
  }
  createWindowLoading[label] = true;

  // 清除销毁定时器
  if (destroyTimers[label]) {
    clearTimeout(destroyTimers[label]);
    delete destroyTimers[label];
  }

  try {
    let window = await WebviewWindow.getByLabel(label);

    // 如果窗口已存在，直接显示并居中
    if (window) {
      console.log("窗口已存在，直接显示:", label);

      // 如果指定了父窗口，重新计算居中位置
      if (options.parent) {
        try {
          const childWidth = options.width || 500;
          const childHeight = options.height || 400;
          const centerPos = await calcCenterPosition(
            childWidth,
            childHeight,
            options.parent
          );

          if ("x" in centerPos && "y" in centerPos) {
            // 使用 Logical 类型设置窗口位置
            await window.setPosition({
              type: "Logical",
              x: centerPos.x,
              y: centerPos.y,
            });
            console.log("窗口已居中:", centerPos);
          }
        } catch (e) {
          console.log("设置窗口位置失败:", e);
        }
      }

      // 设置完位置后再显示
      await showWindow(label);
      createWindowLoading[label] = false;
      return;
    }

    // 如果需要居中于父窗口，计算位置
    let finalOptions = { ...options };
    if (options.parent && !options.x && !options.y) {
      const childWidth = options.width || 500;
      const childHeight = options.height || 400;

      const centerPos = await calcCenterPosition(
        childWidth,
        childHeight,
        options.parent
      );

      if ("center" in centerPos) {
        finalOptions.center = true;
      } else {
        finalOptions.x = centerPos.x;
        finalOptions.y = centerPos.y;
        finalOptions.center = false;
      }
    }

    const webview = new WebviewWindow(label, finalOptions);
    await webview.once("tauri://created", async () => {
      console.log("创建窗口成功:", label);
      handlers?.onCreated?.();

      // 注册销毁回调
      if (handlers?.onDestroy) {
        await once("destroy-window:" + label, () => {
          console.log("销毁窗口:", label);
          handlers.onDestroy?.();
        });
      }
    });
    await webview.once("tauri://error", (e) => {
      console.log("创建窗口失败:", label, e);
      handlers?.onError?.();
    });
  } finally {
    createWindowLoading[label] = false;
  }
}
