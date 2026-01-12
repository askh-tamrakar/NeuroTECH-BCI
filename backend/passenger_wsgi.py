import os
import sys

# Add your application's directory to the system path
sys.path.insert(0, os.path.dirname(__file__))

# Point the settings module to your project's settings file
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

from django.core.wsgi import get_wsgi_application
application = get_wsgi_application()
