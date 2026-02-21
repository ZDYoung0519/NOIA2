import asyncio
import json
import logging
import signal
import sys
from typing import Set, Dict, Any, Optional
import websockets
from websockets.server import WebSocketServerProtocol

from utils.logger import logger


class Aion2DpsServer:
    """Aion2 DPS监控WebSocket服务器"""
    
    def __init__(self, host: str = "0.0.0.0", port: int = 8765):
        self.host = host
        self.port = port
        self.active_connections: Set[WebSocketServerProtocol] = set()
        self.client_info: Dict[WebSocketServerProtocol, Dict[str, Any]] = {}
        self.dps_meter = None
        self.server = None
        self.running = False
        self._loop: Optional[asyncio.AbstractEventLoop] = None
        
    def set_dps_meter(self, dps_meter):
        """设置DPS Meter实例（可选的）"""
        self.dps_meter = dps_meter
        
    async def connect_client(self, websocket: WebSocketServerProtocol) -> int:
        """处理新客户端连接"""
        # websockets 11.0+ 自动处理握手，不需要 await websocket.accept()
        self.active_connections.add(websocket)
        
        # 分配客户端ID
        client_id = id(websocket)
        self.client_info[websocket] = {
            'id': client_id,
            'connected_at': asyncio.get_event_loop().time()
        }
        
        logger.info(f"客户端已连接: {client_id}, 当前连接数: {len(self.active_connections)}")
        return client_id
    
    def disconnect_client(self, websocket: WebSocketServerProtocol):
        """断开客户端连接"""
        if websocket in self.active_connections:
            client_id = self.client_info.get(websocket, {}).get('id', '未知')
            self.active_connections.discard(websocket)
            self.client_info.pop(websocket, None)
            logger.info(f"客户端已断开: {client_id}, 当前连接数: {len(self.active_connections)}")
    
    async def broadcast(self, message: dict, exclude: Optional[WebSocketServerProtocol] = None):
        """广播消息给所有客户端"""
        if not self.active_connections:
            return
        
        message_json = json.dumps(message)
        tasks = []
        
        for connection in self.active_connections:
            if connection == exclude:
                continue
            
            # 检查连接是否仍然打开
            if connection.state == websockets.protocol.State.OPEN:
                try:
                    tasks.append(connection.send(message_json))
                except Exception as e:
                    logger.error(f"准备发送消息失败: {e}")
        
        if tasks:
            results = await asyncio.gather(*tasks, return_exceptions=True)
            # 清理发送失败的连接
            for conn, result in zip([c for c in self.active_connections if c != exclude and c.state == websockets.protocol.State.OPEN], results):
                if isinstance(result, Exception):
                    logger.warning(f"发送消息失败，移除客户端: {result}")
                    self.disconnect_client(conn)
    
    async def send_to_client(self, websocket: WebSocketServerProtocol, message: dict):
        """发送消息给指定客户端"""
        if websocket in self.active_connections and websocket.state == websockets.protocol.State.OPEN:
            try:
                await websocket.send(json.dumps(message))
            except Exception as e:
                logger.error(f"发送消息到客户端失败: {e}")
                self.disconnect_client(websocket)
    
    async def handle_connection(self, websocket: WebSocketServerProtocol):
        """处理WebSocket连接"""
        client_id = await self.connect_client(websocket)
        
        try:
            # 发送连接成功消息
            await self.send_to_client(websocket, {
                "type": "connected",
                "message": "已连接到 Aion2 DPS 监控服务",
                "client_id": client_id,
                "connections": len(self.active_connections)
            })
            
            # 处理客户端消息
            async for message in websocket:
                await self.handle_client_message(websocket, message, client_id)
                
        except websockets.exceptions.ConnectionClosed:
            logger.info(f"客户端 {client_id} 连接已关闭")
        except Exception as e:
            logger.error(f"处理客户端 {client_id} 消息时出错: {e}")
        finally:
            self.disconnect_client(websocket)
    
    async def handle_client_message(self, websocket: WebSocketServerProtocol, 
                                   message: str, client_id: int):
        """处理客户端发送的消息"""
        try:
            data = json.loads(message)
            msg_type = data.get("type")
            
            if msg_type == "ping":
                # 心跳响应
                await self.send_to_client(websocket, {"type": "pong"})
                
            elif msg_type == "command:reset":
                # 重置 DPS 数据
                logger.info("recevie reset")
                if self.dps_meter:
                    self.send_and_reset()
                else:
                    await self.send_to_client(websocket, {
                        "type": "error",
                        "message": "DPS Meter未初始化"
                    })
            elif msg_type == "command:quit":
                import os
                os._exit(0)
            elif msg_type == "get_status":
                # 获取当前状态
                dps_running = (self.dps_meter is not None and 
                              hasattr(self.dps_meter, 'is_running') and 
                              self.dps_meter.is_running)
                await self.send_to_client(websocket, {
                    "type": "status",
                    "running": self.running,
                    "dps_meter_running": dps_running,
                    "connections": len(self.active_connections),
                    "client_id": client_id
                })
                
            elif msg_type == "get_devices":
                # 获取设备列表（调试用）
                try:
                    from aion2.dps_meter import get_all_devices, get_non_loopback_devices
                    all_devs = get_all_devices()
                    await self.send_to_client(websocket, {
                        "type": "devices",
                        "all_devices": all_devs,
                        "non_loopback": get_non_loopback_devices(all_devs)
                    })
                except ImportError as e:
                    await self.send_to_client(websocket, {
                        "type": "error",
                        "message": f"无法导入DPS Meter模块: {e}"
                    })
                    
            else:
                await self.send_to_client(websocket, {
                    "type": "error",
                    "message": f"未知消息类型: {msg_type}"
                })
                
        except json.JSONDecodeError:
            logger.warning(f"客户端 {client_id} 发送了非JSON消息: {message[:100]}")

    def send_and_reset(self):
        """
        获取最后一次数据（作为历史保存），并重置
        """
        data = self.dps_meter.dps_calculator.process_data()
        self.dps_meter.reset()

        if not self._loop or not data:
            logger.warning("事件循环未初始化，无法广播数据")
            return
        
        message = {
            "type": "dps:summary",
            "payload": data,
            "timestamp": self._loop.time()
        }
        asyncio.run_coroutine_threadsafe(
            self._async_broadcast(message),
            self._loop
        )

        logger.info("DPS is reseted!")
            
    def broadcast_dps_data(self, data: dict):
        """
        广播DPS数据到所有客户端（同步回调方法）
        由DPSMeter线程调用，通过run_coroutine_threadsafe提交到事件循环
        """
        if not self._loop:
            logger.warning("事件循环未初始化，无法广播数据")
            return
    
        message = {
            "type": "dps:data",
            "payload": data,
            "timestamp": self._loop.time()
        }
        
        # 将异步广播提交到事件循环（线程安全）
        asyncio.run_coroutine_threadsafe(
            self._async_broadcast(message),
            self._loop
        )
        # logger.info(f"DPS is broadcast: {str(data)}")


    def broadcast_memory_data(self, data: dict):
        """
        广播DPS数据到所有客户端（同步回调方法）
        由DPSMeter线程调用，通过run_coroutine_threadsafe提交到事件循环
        """
        if not self._loop:
            logger.warning("事件循环未初始化，无法广播数据")
            return

        message = {
            "type": "dps:memory",
            "payload": data,
            "timestamp": self._loop.time()
        }

        # 将异步广播提交到事件循环（线程安全）
        asyncio.run_coroutine_threadsafe(
            self._async_broadcast(message),
            self._loop
        )
        # logger.info(f"DPS memory is broadcast333 {data}")
        sizes = {}
        from copy import deepcopy
        for k, v in self.dps_meter.dispatcher.assemblers.items():
            sizes[k] = v.buffer.size

        logger.info(f"Assembers, {sizes}")
    
    async def _async_broadcast(self, message: dict):
        """实际的异步广播逻辑"""
        await self.broadcast(message)

    async def health_check(self):
        """定期健康检查"""
        while self.running:
            await asyncio.sleep(30)  # 每30秒一次
            health_msg = {
                "type": "system",
                "message": "服务器心跳",
                "timestamp": asyncio.get_event_loop().time(),
                "connections": len(self.active_connections),
                "status": "healthy"
            }
            await self.broadcast(health_msg)
    
    async def start(self):
        """启动WebSocket服务器"""
        # 必须先保存事件循环，再启动DPS Meter！
        self._loop = asyncio.get_running_loop()
        
        logger.info("=" * 50)
        logger.info("Aion2 DPS监控WebSocket服务器")
        logger.info(f"监听地址: ws://{self.host}:{self.port}")
        logger.info("=" * 50)
        
        try:
            from aion2.dps_meter import DPSMeter
            self.dps_meter = DPSMeter(
                dps_callback=self.broadcast_dps_data, 
                memory_callback=self.broadcast_memory_data,
                reset_callback=self.send_and_reset
            )
            self.dps_meter.start()
            logger.info("DPS Meter已启动")
            
            # 启动健康检查任务
            asyncio.create_task(self.health_check())
            
            # 启动WebSocket服务器
            self.server = await websockets.serve(
                self.handle_connection,
                self.host,
                self.port,
                ping_interval=20,
                ping_timeout=60,
                max_size=10 * 1024 * 1024  # 10MB
            )
            self.running = True
            logger.info(f"WebSocket服务器已启动: ws://{self.host}:{self.port}")
            
            # 设置信号处理（Windows兼容）
            try:
                for sig in (signal.SIGINT, signal.SIGTERM):
                    signal.signal(sig, lambda s, f: asyncio.create_task(self.stop()))
            except ValueError:
                # Windows 下可能不支持某些信号
                logger.error("Error, 下可能不支持某些信号")
            
            # 保持服务器运行
            await self.server.wait_closed()
            
        except Exception as e:
            logger.error(f"启动服务器失败: {e}")
            raise
    
    async def stop(self):
        """停止WebSocket服务器"""
        logger.info("正在关闭服务器...")
        self.running = False
        
        if self.dps_meter:
            try:
                self.dps_meter.stop()
                logger.info("DPS Meter已停止")
            except Exception as e:
                logger.error(f"停止DPS Meter时出错: {e}")
        
        # 关闭所有客户端连接
        close_tasks = [conn.close() for conn in list(self.active_connections)]
        if close_tasks:
            await asyncio.gather(*close_tasks, return_exceptions=True)
        
        if self.server:
            self.server.close()
            await self.server.wait_closed()
            logger.info("WebSocket服务器已停止")


async def main():
    """主函数"""
    import argparse
    parser = argparse.ArgumentParser(description="Aion2 DPS监控WebSocket服务器")
    parser.add_argument("--host", default="0.0.0.0", help="监听地址 (默认: 0.0.0.0)")
    parser.add_argument("--port", type=int, default=51985, help="监听端口 (默认: 8765)")
    
    args = parser.parse_args()
    
    server = Aion2DpsServer(host=args.host, port=args.port)
    
    try:
        await server.start()
    except KeyboardInterrupt:
        logger.info("服务器被用户中断")
        await server.stop()
    except Exception as e:
        logger.error(f"服务器异常退出: {e}")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
