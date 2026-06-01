"""
Tree utilities for converting trained model trees to react-d3-tree compatible JSON.
Supports XGBoost (primary) and sklearn DecisionTree (legacy fallback).
"""

import json
import numpy as np


def tree_to_json(model_or_tree, feature_names, tree_index=0):
    """
    Convert a single decision tree to react-d3-tree compatible JSON.

    Detects model type automatically:
    - XGBoost: model.get_booster().get_dump() JSON
    - sklearn: sklearn.tree._tree internals

    Args:
        model_or_tree: An xgb.XGBClassifier/Booster, or sklearn DecisionTree
        feature_names: List of feature name strings
        tree_index: Index of boosting round to extract (XGBoost only)

    Returns:
        dict: Recursive dict {name, attributes, children} for react-d3-tree
    """
    if hasattr(model_or_tree, "get_booster") or hasattr(model_or_tree, "get_dump"):
        return _xgb_tree_to_json(model_or_tree, feature_names, tree_index)
    return _sklearn_tree_to_json(model_or_tree, feature_names)


def _xgb_tree_to_json(model_or_booster, feature_names, tree_index=0):
    """Parse XGBoost tree from get_dump() JSON format."""
    booster = model_or_booster
    if hasattr(model_or_booster, "get_booster"):
        booster = model_or_booster.get_booster()

    dump = booster.get_dump(dump_format="json")
    if not dump:
        return {"name": "Empty tree", "attributes": {}}
    idx = max(0, min(int(tree_index), len(dump) - 1))
    tree_data = json.loads(dump[idx])
    return _convert_xgb_node(tree_data)


def _convert_xgb_node(node):
    """Recursively convert an XGBoost tree node dict to react-d3-tree format."""
    if "leaf" in node:
        leaf_value = float(node["leaf"])
        return {
            "name": f"{leaf_value:+.4f}",
            "attributes": {
                "score": round(leaf_value, 4),
                "node": node.get("nodeid", 0),
            },
        }

    split_feature = node.get("split", "?")
    condition = float(node.get("split_condition", 0))
    children = [_convert_xgb_node(c) for c in node.get("children", [])]

    return {
        "name": f"{split_feature} <= {condition:.3f}",
        "attributes": {
            "depth": node.get("depth", 0),
            "threshold": round(condition, 4),
        },
        "children": children,
    }


def _sklearn_tree_to_json(tree, feature_names):
    """Legacy sklearn DecisionTree -> JSON converter."""
    from sklearn.tree import _tree

    tree_ = tree.tree_
    feature_name = [
        feature_names[i] if i != _tree.TREE_UNDEFINED else "undefined!"
        for i in tree_.feature
    ]

    def recurse(node):
        if tree_.feature[node] == _tree.TREE_UNDEFINED:
            value = tree_.value[node][0]
            predicted_class = int(np.argmax(value))
            return {
                "name": f"Class {predicted_class}",
                "attributes": {
                    "samples": int(tree_.n_node_samples[node]),
                    "gini": float(tree_.impurity[node]),
                    "value": [round(float(v), 2) for v in value],
                },
            }
        return {
            "name": f"{feature_name[node]} <= {tree_.threshold[node]:.2f}",
            "attributes": {
                "samples": int(tree_.n_node_samples[node]),
                "gini": float(tree_.impurity[node]),
            },
            "children": [
                recurse(tree_.children_left[node]),
                recurse(tree_.children_right[node]),
            ],
        }

    return recurse(0)
