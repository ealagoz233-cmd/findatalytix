"""Ajan beyni: öz-düzeltme döngüsü + maliyet freni."""
import importlib, ai

def _setup():
    importlib.reload(ai)
    ai._claude = object()
    return ai

def test_self_correction_loop():
    a = _setup()
    calls = {"n": 0}
    def analyst(system, user, cheap):
        if system == a.ROUTER_SYSTEM:
            return ("claude", '{"sub_queries":["x"]}', 1, 1)
        calls["n"] += 1
        return ("claude", f"taslak {calls['n']}", 10, 5)
    ref = {"n": 0}
    def referee(system, user):
        ref["n"] += 1
        if ref["n"] == 1:
            return ("gemini", '{"score":40,"note":"eksik","gapQuery":"ara"}', 5, 2)
        return ("gemini", '{"score":85,"note":"iyi","gapQuery":null}', 5, 2)
    a._analyst_call = analyst
    a._referee_call = referee
    r = a.analyze("soru", {"A": {"cagr": 1, "sharpe": 1, "mdd": -1, "vol": 1}},
                  "kaynak", [], fetch_more=lambda q: [])
    assert r["meta"]["rounds"] == 2
    assert [x["score"] for x in r["meta"]["roundLog"]] == [40, 85]

def test_cost_brake():
    a = _setup()
    def analyst(system, user, cheap):
        if system == a.ROUTER_SYSTEM:
            return ("claude", '{"sub_queries":["x"]}', 1, 1)
        return ("claude", "taslak", 10, 5)
    a._analyst_call = analyst
    a._referee_call = lambda s, u: ("gemini", '{"score":20,"note":"kotu","gapQuery":"x"}', 5, 2)
    r = a.analyze("soru", {"A": {"cagr": 1, "sharpe": 1, "mdd": -1, "vol": 1}},
                  "k", [], fetch_more=lambda q: [])
    assert r["meta"]["rounds"] == 3   # 1 taslak + 2 düzeltme, sonra dur

def test_router_fallback():
    a = _setup()
    a._analyst_call = lambda s, u, c: ("claude", "JSON degil", 1, 1)
    assert a.route_query("soru") == ["soru"]
