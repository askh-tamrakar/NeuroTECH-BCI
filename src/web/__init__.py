
__all__ = ['web_server']

def __getattr__(name):
    if name == 'web_server':
        from . import web_server
        return web_server
    raise AttributeError(f"module '{__name__}' has no attribute '{name}'")