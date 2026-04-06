from src.learning.emg_trainer import (
    delete_model as _delete_model,
    evaluate_saved_model,
    list_saved_models as _list_saved_models,
    load_model as _load_model,
    train_eog_model,
)



def evaluate_saved_eog_model(table_name="eog_windows", model_name=None):
    return evaluate_saved_model(sensor='EOG', table_name=table_name, model_name=model_name)


def list_saved_models():
    return _list_saved_models('EOG')



def delete_model(model_name):
    return _delete_model('EOG', model_name)



def load_model(model_name):
    return _load_model('EOG', model_name)
