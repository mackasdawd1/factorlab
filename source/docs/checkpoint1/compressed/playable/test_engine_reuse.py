import json
import importlib.util
from pathlib import Path

P = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('playable_builder', P / 'build.py')
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)
assert hasattr(builder, 'settle'), 'A single reusable settlement function is required'
data = json.loads((P / 'data.json').read_text(encoding='utf-8'))
count = 0
for node in data['nodes'].values():
    actions = [r['decision'] for r in node['ledger']]
    for action, expected in node['options'].items():
        actual = builder.settle(node['strategy'], actions, node['weights'], node['nav'], node['ledger'], action)
        assert actual == expected, node['id'] + action
        count += 1
print(f'PASS: reusable settlement matches all {count} frozen records exactly')
