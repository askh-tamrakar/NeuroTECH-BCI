import asyncio

import socketio as socketio_lib


class SocketIOManager:
    def __init__(self):
        self.server = socketio_lib.AsyncServer(
            async_mode="asgi",
            cors_allowed_origins="*",
            ping_timeout=120,
            ping_interval=30,
            engineio_logger=False,
            logger=False,
            always_connect=True,
            max_http_buffer_size=10 * 1024 * 1024,
        )
        self._event_loop = None

    def set_event_loop(self, loop):
        self._event_loop = loop

    def clear_event_loop(self):
        self._event_loop = None

    def on(self, *args, **kwargs):
        return self.server.on(*args, **kwargs)

    async def emit_async(self, event, data=None, to=None, room=None, skip_sid=None, namespace=None, callback=None):
        return await self.server.emit(
            event,
            data=data,
            to=to,
            room=room,
            skip_sid=skip_sid,
            namespace=namespace,
            callback=callback,
        )

    def emit(self, event, data=None, to=None, room=None, skip_sid=None, namespace=None, callback=None):
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            loop = None

        if loop is not None:
            coroutine = self.server.emit(
                event,
                data=data,
                to=to,
                room=room,
                skip_sid=skip_sid,
                namespace=namespace,
                callback=callback,
            )
            return loop.create_task(coroutine)
        if self._event_loop is not None and not self._event_loop.is_closed():
            coroutine = self.server.emit(
                event,
                data=data,
                to=to,
                room=room,
                skip_sid=skip_sid,
                namespace=namespace,
                callback=callback,
            )
            return asyncio.run_coroutine_threadsafe(coroutine, self._event_loop)
        return None

    def create_asgi_app(self, other_asgi_app=None, socketio_path="socket.io"):
        return socketio_lib.ASGIApp(
            self.server,
            other_asgi_app=other_asgi_app,
            socketio_path=socketio_path,
        )


socketio = SocketIOManager()
