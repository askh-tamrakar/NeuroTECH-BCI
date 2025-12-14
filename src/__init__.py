__version__ = "1.0.0"
__author__ = "BioSignals Team"

# Make submodules easily importable
from . import acquisition
from . import processing
from . import web
from . import utils

__all__ = ['acquisition', 'processing', 'web', 'utils']