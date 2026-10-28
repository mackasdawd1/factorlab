from pathlib import Path
from decimal import Decimal as D, getcontext
import datetime
import hashlib
import importlib.util
import json

getcontext().prec = 40
p = Path(__file__).resolve().parent
fixture_path = p.parent/'docs/week2/wireframes/prototype-fixture.json'
fixture = json.loads(fixture_path.read_text(encoding='utf-8'), parse_float=D)
authored = json.loads((p/'information-source.json').read_text(encoding='utf-8'), parse_float=D)
data = json.loads((p/'information-data.json').read_text(encoding='utf-8'), parse_float=D)
assert data['synthetic'] is True
assert data['source_sha256'] == hashlib.sha256((p/'information-source.json').read_bytes()).hexdigest()
assert data['fixture_sha256'] == hashlib.sha256(fixture_path.read_bytes()).hexdigest()
assert (p/'information-data.js').read_text(encoding='utf-8') == 'window.FACTORLAB_INFORMATION_DATA = '+(p/'information-data.json').read_text(encoding='utf-8').strip()+';\n'
prices = {i-6:D(v) for i,v in enumerate(authored['pre_game_prices'])}
for i in range(1,6):
    prices[i] = prices[i-1]*(1+fixture['rounds'][i-1]['sector_returns'][4])
checks = 0
for r, packet in enumerate(data['rounds'],1):
    assert packet['round'] == r and packet['cutoff'] == r-1
    assert len(packet['points']) == 7
    for t, point in zip(range(r-7,r), packet['points']):
        assert point['time'] == point['availableAt'] == t
        assert abs(D(point['value'])-prices[t]) < D('1e-10')
        checks += 1
spec = importlib.util.spec_from_file_location('information_builder', p/'build-information.py')
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)
plain_fixture = json.loads(fixture_path.read_text(encoding='utf-8'))
plain_source = json.loads((p/'information-source.json').read_text(encoding='utf-8'))
original = builder.build(plain_source,plain_fixture)
for cutoff in range(6):
    modified = json.loads(json.dumps(plain_fixture))
    for future in modified['rounds'][cutoff:]:
        future['sector_returns'][4] = .99
        future['event'] = 'FUTURE SENTINEL'
    assert builder.build(plain_source,modified)['rounds'][:cutoff+1] == original['rounds'][:cutoff+1]
report = dict(status='PASS',observation_checks=checks,future_mutation_checks=6,
              method='Independent Decimal price reconstruction; future fixture mutation cannot affect prior information packets',
              verified_at=datetime.datetime.now(datetime.timezone.utc).isoformat())
(p/'evidence/information-data.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
print(json.dumps(report))
