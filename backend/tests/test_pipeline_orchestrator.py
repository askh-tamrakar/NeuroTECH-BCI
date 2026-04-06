from argparse import Namespace
from pathlib import Path

import pipeline


def make_args(**overrides):
    values = {
        "build": False,
        "dev": False,
        "remote": False,
        "verbose": False,
        "neurobench": False,
        "blocks": [],
    }
    values.update(overrides)
    return Namespace(**values)


def build_specs(args=None):
    args = args or make_args()
    project_root = Path(__file__).resolve().parents[2]
    backend_dir = project_root / "backend"
    frontend_dir = project_root / "frontend"
    return pipeline.build_block_specs(args, project_root, backend_dir, frontend_dir, "python")


def test_parser_supports_neurobench_and_blocks():
    parser = pipeline.create_parser()
    args = parser.parse_args(["-n", "--blocks", "server,lab", "--blocks", "ssvep"])

    assert args.neurobench is True
    assert args.blocks == ["server,lab", "ssvep"]
    assert pipeline.parse_block_selection(args.blocks) == ["server", "lab", "ssvep"]


def test_alias_map_expands_actuator_and_virtual_blocks_resolve_to_targets():
    specs = build_specs()
    alias_map = pipeline.build_alias_map(specs)

    assert alias_map["actuator"] == ("hid", "servo")
    assert pipeline.resolve_requested_blocks(["actuator", "lab"], alias_map, specs) == ["hid", "servo", "lab"]
    assert pipeline.expand_startup_blocks(["lab", "ssvep"], specs) == ["server", "feature"]


def test_resolve_requested_blocks_includes_neurobench_when_enabled():
    specs = build_specs(make_args(neurobench=True))
    alias_map = pipeline.build_alias_map(specs)

    resolved = pipeline.resolve_requested_blocks(["server"], alias_map, specs)

    assert resolved == ["server", "neurobench"]


def test_dependency_order_keeps_providers_before_dependents():
    specs = build_specs()

    ordered = pipeline.dependency_order(["servo", "feature", "filter", "stream"], specs)

    assert ordered == ["stream", "filter", "feature", "servo"]


def test_specialized_watch_paths_take_precedence_over_generic_server_dir():
    specs = build_specs()
    project_root = Path(__file__).resolve().parents[2]

    lab_file = project_root / "backend/src/server/server/routes/training_routes.py"
    ssvep_file = project_root / "backend/src/server/server/lsl_service.py"
    server_file = project_root / "backend/src/server/server/routes/config_routes.py"

    assert pipeline.resolve_path_owner(lab_file, specs) == "lab"
    assert pipeline.resolve_path_owner(ssvep_file, specs) == "ssvep"
    assert pipeline.resolve_path_owner(server_file, specs) == "server"


def test_split_runtime_process_ids_maps_virtual_blocks_to_live_processes():
    specs = build_specs()

    targets = pipeline.split_runtime_process_ids(["lab", "ssvep", "server"], specs)

    assert targets == ["server", "feature"]


def test_handle_command_toggles_watch_and_dispatches_reload(monkeypatch):
    orchestrator = pipeline.PipelineOrchestrator(make_args())
    calls = []

    monkeypatch.setattr(orchestrator, "refresh_watch_snapshot", lambda: calls.append(("snapshot", None)))
    monkeypatch.setattr(orchestrator, "reload_blocks", lambda block_ids, reason: calls.append((tuple(block_ids), reason)))

    orchestrator.handle_command("watch")
    orchestrator.handle_command("watch off")
    orchestrator.handle_command("rl actuator")

    assert orchestrator.watch_enabled is False
    assert calls == [("snapshot", None), (("hid", "servo"), "manual")]


def test_resolve_command_block_rejects_unknown_block():
    orchestrator = pipeline.PipelineOrchestrator(make_args())

    try:
        orchestrator.resolve_command_block("does-not-exist")
    except ValueError as exc:
        assert "Unknown block" in str(exc)
    else:
        raise AssertionError("Expected ValueError for unknown block")
