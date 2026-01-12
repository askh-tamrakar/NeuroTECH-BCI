from django.urls import path
from .views import ConfigView, SessionView, WindowView

urlpatterns = [
    path("config", ConfigView.as_view(), name="config"),
    # Sessions
    path("sessions/<str:sensor_type>", SessionView.as_view(), name="session_list"),
    path("sessions/<str:sensor_type>/<str:session_name>", SessionView.as_view(), name="session_detail"),
    path("sessions/<str:sensor_type>/<str:session_name>/rows/<str:row_id>", SessionView.as_view(), name="session_row_delete"), # Placeholder for row delete
    
    # Save Window
    path("window", WindowView.as_view(), name="save_window"),
    
    # Recordings (stub for now if needed, or implement View if requested)
    # path("recordings", ...), 
]
