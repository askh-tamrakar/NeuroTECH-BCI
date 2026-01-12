from django.urls import path
from .views import ConfigView, SessionView, WindowView, RecordingView, EvaluateModelView, PredictControlView

urlpatterns = [
    path("config", ConfigView.as_view(), name="config"),
    
    # Sessions
    path("sessions/<str:sensor_type>", SessionView.as_view(), name="session_list"),
    path("sessions/<str:sensor_type>/<str:session_name>", SessionView.as_view(), name="session_detail"),
    path("sessions/<str:sensor_type>/<str:session_name>/rows/<str:row_id>", SessionView.as_view(), name="session_row_delete"),
    
    # Save Window
    path("window", WindowView.as_view(), name="save_window"),
    
    # Recordings
    path("recordings", RecordingView.as_view(), name="recordings"),
    
    # Model / Prediction Stubs
    path("model/evaluate", EvaluateModelView.as_view(), name="model_evaluate"),
    path("emg/predict/<str:action>", PredictControlView.as_view(), name="predict_control"),
]
