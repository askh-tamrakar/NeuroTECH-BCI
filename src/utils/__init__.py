from .config import ConfigWatcher, config

__all__ = [
    'ConfigWatcher',
    'config'
]

def __getattr__(name):
    if name == 'ConfigWatcher':
        from .config import ConfigWatcher
        return ConfigWatcher
    elif name == 'config':
        from .config import config
        return config
    raise AttributeError(f"module '{__name__}' has no attribute '{name}'")
