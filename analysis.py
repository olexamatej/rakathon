"""Ridge baseline, patient-held-out jackknife+ intervals, outlier-only grouping."""

import math
from collections import Counter

import numpy as np
from scipy.cluster.hierarchy import cut_tree, linkage

from data import WINDOW, patient_features

FIELDS = ("diagnosis", "age", "sex")
LABELS = {"diagnosis": "Diagnóza", "age": "Věková skupina", "sex": "Pohlaví"}
METRICS = {"stays": "Vícedenní pobyty", "longest_stay": "Nejdelší pobyt (dny)",
           "contacts": "Jednodenní kontakty", "d70": "Epizody D70", "ab_codes": "Epizody s kódy A/B"}
RIDGE = 8.0
ALPHA = 0.05
MODEL_VERSION = "ridge-days-v1"


def design(rows):
    columns = [(field, value) for field in FIELDS for value in sorted({r[field] for r in rows})]
    return np.array([[1.0] + [float(r[field] == value) for field, value in columns] for r in rows]), columns


def fit_predict(train_x, train_y, target):
    penalty = np.eye(train_x.shape[1]) * RIDGE
    penalty[0, 0] = 0
    inverse = np.linalg.inv(train_x.T @ train_x + penalty)
    beta = inverse @ train_x.T @ train_y
    fitted = train_x @ beta
    leverage = np.einsum("ij,ji->i", train_x, inverse @ train_x.T)
    deleted_residual = (train_y - fitted) / (1 - leverage)
    loo_residual = np.abs(train_y - np.clip(train_y - deleted_residual, 0, WINDOW))
    loo_target = np.clip(target @ beta - (target @ inverse @ train_x.T) * deleted_residual, 0, WINDOW)
    n = len(train_y)
    lower_rank = math.floor(ALPHA * (n + 1))
    upper_rank = math.ceil((1 - ALPHA) * (n + 1))
    lower = np.sort(loo_target - loo_residual)[lower_rank - 1] if lower_rank >= 1 else 0
    upper = np.sort(loo_target + loo_residual)[upper_rank - 1] if upper_rank <= n else WINDOW
    return beta, float(np.clip(target @ beta, 0, WINDOW)), [float(np.clip(lower, 0, WINDOW)), float(np.clip(upper, 0, WINDOW))]


def group_outliers(rows):
    candidates = [r for r in rows if r["candidate"] and r["review"]["status"] not in ("not_relevant", "data_issue")]
    for r in rows:
        r["cluster"] = None
    if not candidates:
        return []
    metrics = ("residual", *METRICS)
    values = np.array([[r[m] for m in metrics] for r in candidates], dtype=float)
    if len(candidates) > 2 and np.any(np.ptp(values, axis=0)):
        scaled = (values - values.mean(axis=0)) / np.maximum(values.std(axis=0), 1)
        labels = cut_tree(linkage(scaled, method="ward"), n_clusters=min(3, len(candidates) // 2)).reshape(-1)
    else:
        labels = np.zeros(len(candidates), dtype=int)
    groups = []
    reference = [r for r in rows if r["eligible"] and r["review"]["status"] != "data_issue"]
    for label in sorted(set(labels)):
        members = [r for r, assigned in zip(candidates, labels) if assigned == label]
        cluster_id = f"G{len(groups) + 1}"
        for r in members:
            r["cluster"] = cluster_id
        residual = float(np.median([r["residual"] for r in members]))
        comparisons = []
        for metric, title in METRICS.items():
            cohort = np.array([r[metric] for r in reference], dtype=float)
            median = float(np.median([r[metric] for r in members]))
            base = float(np.median(cohort))
            comparisons.append({"label": title, "median": median, "cohort": base,
                                "contrast": abs(median - base) / max(float(cohort.std()), 1)})
        groups.append({"id": cluster_id, "title": "Vyšší zátěž" if residual > 0 else "Nižší zátěž",
                       "members": [r["patient_id"] for r in members], "median_residual": residual,
                       "diagnoses": dict(Counter(r["diagnosis"] for r in members).most_common(3)),
                       "comparisons": sorted(comparisons, key=lambda c: c["contrast"], reverse=True)[:2]})
    return groups


def analyze(tables, reviews=None):
    reviews = reviews or {}
    rows = patient_features(tables)
    x, columns = design(rows)
    for row in rows:
        row["review"] = reviews.get(row["patient_id"], {"status": "unreviewed", "note": "", "updated_at": None})
    eligible = np.array([r["eligible"] and r["review"]["status"] != "data_issue" for r in rows])
    if eligible.sum() < 20:
        raise ValueError("Pro odhad potřebujeme alespoň 20 pacientů s úplným oknem bez chyby dat")
    outcomes = np.array([r["observed"] or 0 for r in rows], dtype=float)
    for i, row in enumerate(rows):
        training = eligible.copy()
        training[i] = False  # The patient's outcome never enters their own model or calibration.
        tx, ty = x[training], outcomes[training]
        beta, expected, interval = fit_predict(tx, ty, x[i])
        mean_x = tx.mean(axis=0)
        contributions = [{"feature": field, "label": LABELS[field], "value": row[field],
                          "days": float(sum((x[i, j + 1] - mean_x[j + 1]) * beta[j + 1]
                                            for j, (f, _) in enumerate(columns) if f == field))} for field in FIELDS]
        correction = expected - float(x[i] @ beta)
        if abs(correction) > 1e-8:
            contributions.append({"feature": "bound", "label": "Omezení na 0–365 dnů", "value": "", "days": correction})
        assessable = bool(eligible[i])
        residual = row["observed"] - expected if assessable else None
        support = sum(r["diagnosis"] == row["diagnosis"] for r, included in zip(rows, training) if included)
        peers = [r for r, included in zip(rows, training) if included and r["diagnosis"] == row["diagnosis"]]
        if len(peers) < 3:
            peers = [r for r, included in zip(rows, training) if included]
        evidence = [{"label": label, "actual": row[key], "peer_median": float(np.median([r[key] for r in peers]))}
                    for key, label in METRICS.items()]
        outside = assessable and (row["observed"] < interval[0] or row["observed"] > interval[1])
        stable = bool(outside and all(v < interval[0] if residual < 0 else v > interval[1] for v in row["sensitivity"]))
        row.update({"expected": expected, "interval": interval, "residual": residual,
                    "baseline": float(mean_x @ beta), "contributions": contributions,
                    "support": support, "outside_interval": bool(outside), "stable": stable,
                    "evidence": evidence, "peer_group": "stejná diagnóza" if support >= 3 else "celá srovnatelná kohorta",
                    "naive_expected": float(ty.mean()), "assessable": assessable,
                    "score": abs(residual) / max((interval[1] - interval[0]) / 2, 1) if assessable else None})
    scores = [r["score"] for r in rows if r["assessable"]]
    for row in rows:
        percentile = 100 * sum(s <= row["score"] for s in scores) / len(scores) if row["assessable"] else None
        row["percentile"] = percentile
        row["candidate"] = bool(row["assessable"] and abs(row["residual"]) > 1e-8
                                and (row["outside_interval"] or percentile >= 90))
        row["confidence"] = ("insufficient" if not row["assessable"] else "limited" if row["support"] < 5 else
                             "distinct" if row["outside_interval"] and row["stable"] else "borderline" if row["candidate"] else "typical")
    groups = group_outliers(rows)
    measured = [r for r in rows if r["assessable"]]
    summary = {
        "patients": len(rows), "episodes": len(tables["episodes"]), "labs": len(tables["labs"]),
        "labs_patients": len({lab["patient_id"] for lab in tables["labs"]}), "eligible": len(measured),
        "candidates": sum(r["candidate"] for r in rows), "outside_interval": sum(r["outside_interval"] for r in rows),
        "reviewed": sum(r["review"]["status"] != "unreviewed" for r in rows),
        "mae": float(np.mean([abs(r["residual"]) for r in measured])),
        "naive_mae": float(np.mean([abs(r["observed"] - r["naive_expected"]) for r in measured])),
        "coverage": float(np.mean([not r["outside_interval"] for r in measured])),
        "window": WINDOW, "ridge": RIDGE, "alpha": ALPHA,
        "fingerprint": tables["fingerprint"], "model_version": MODEL_VERSION,
    }
    return {"summary": summary, "patients": sorted(rows, key=lambda r: -(r["score"] if r["score"] is not None else -1)), "groups": groups}
