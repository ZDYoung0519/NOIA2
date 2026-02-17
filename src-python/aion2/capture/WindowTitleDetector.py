import time
import ctypes
import threading
from ctypes import wintypes


def get_window_titles():
    titles = []
    def enum_callback(hwnd, extra):
        if ctypes.windll.user32.IsWindowVisible(hwnd):
            length = ctypes.windll.user32.GetWindowTextLengthW(hwnd)
            if length > 0:
                buffer = ctypes.create_unicode_buffer(length + 1)
                ctypes.windll.user32.GetWindowTextW(hwnd, buffer, length + 1)
                titles.append(buffer.value)
        return True    
    EnumWindowsProc = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
    ctypes.windll.user32.EnumWindows(EnumWindowsProc(enum_callback), 0)
    return titles



class WindowTitleDetector():
    def __init__(self, data_storage):
        self.data_storage = data_storage
        self.is_running = True
    
    def run(self):
        while self.is_running:
            titles = get_window_titles()
            pattern1 = "AION2 l "
            pattern2 = "AION2 | "
            res1 = self.search_in_pattern(pattern1, titles)
            if not res1:
                res2 = self.search_in_pattern(pattern2, titles)
            time.sleep(10)
    
    def start(self):
        self.is_running = True
        self.thread = threading.Thread(target=self.run, args=[])
        self.thread.daemon = True
        self.thread.start()
    
    def stop(self):
        self.is_running = False

    def search_in_pattern(self, pattern, titles):
        matches = [t for t in titles if pattern in t]
        for match in matches:
            name = match.split(pattern)[-1].replace(' ', '')
            self.data_storage.setMainPlayer(name)
            return name

if __name__ == '__main__':
    WindowTitleDetector(None).run()


    