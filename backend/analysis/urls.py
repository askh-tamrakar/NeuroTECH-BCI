from django.urls import path
from .views import (
    ConfigView, SessionView, WindowView, RecordingView, EvaluateModelView,
    PredictControlView, TrainEmgView, TrainEogView, EvaluateEogView,
    StartCalibrationView, StopCalibrationView, RunCalibrationView
)

urlpatterns = [
    path("config/", ConfigView.as_view(), name="config"),

    # Sessions
    path("sessions/<str:sensor_type>/", SessionView.as_view(), name="session_list"),
    path("sessions/<str:sensor_type>/<str:session_name>/", SessionView.as_view(), name="session_detail"),
    path("sessions/<str:sensor_type>/<str:session_name>/rows/<str:row_id>/", SessionView.as_view(), name="session_row_delete"),

    # Save Window
    path("window/", WindowView.as_view(), name="save_window"),

    # Recordings
    path("recordings/", RecordingView.as_view(), name="recordings"),

    # Model / Prediction Stubs
    path("model/evaluate/", EvaluateModelView.as_view(), name="model_evaluate"),
    path("emg/predict/<str:action>/", PredictControlView.as_view(), name="predict_control"),
    path("train-emg-rf/", TrainEmgView.as_view(), name="train_emg_rf"),
    path("train-eog-rf/", TrainEogView.as_view(), name="train_eog_rf"),
    path("model/evaluate/eog/", EvaluateEogView.as_view(), name="evaluate_eog"),

    # Calibration Endpoints
    path("calibrate/start/", StartCalibrationView.as_view(), name="start_calibration"),
    path("calibrate/stop/", StopCalibrationView.as_view(), name="stop_calibration"),
    path("calibrate/run/", RunCalibrationView.as_view(), name="run_calibration"),
]
