import logging
import sys

from .config import cfg

def setup_logger(debug_mode):
    """配置 logger，debug_mode 为 True 时添加文件处理器"""
    logger = logging.getLogger('my_app')
    logger.setLevel(logging.DEBUG)  # 全局捕获所有级别日志

    # 清除可能存在的旧处理器（避免重复添加）
    if logger.hasHandlers():
        logger.handlers.clear()

    # 创建控制台处理器（始终输出到控制台）
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(logging.INFO if not debug_mode else logging.DEBUG)
    console_formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
    console_handler.setFormatter(console_formatter)
    logger.addHandler(console_handler)

    # 仅在 debug_mode 为 True 时添加文件处理器
    if debug_mode:
        file_handler = logging.FileHandler('app_debug.log', encoding='utf-8')
        file_handler.setLevel(logging.DEBUG)
        file_formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
        file_handler.setFormatter(file_formatter)
        logger.addHandler(file_handler)

    return logger


logger = setup_logger(cfg.DEBUG)
