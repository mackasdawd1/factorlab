from pathlib import Path
import hashlib
import json

P = Path(__file__).resolve().parent
source = P / 'information-source.json'
fixture_path = P.parent / 'docs/week2/wireframes/prototype-fixture.json'


def build(authored, fixture):
    values = authored['pre_game_prices']
    assert len(values) == 7 and all(isinstance(v, (int, float)) and v > 0 for v in values)
    points = [dict(time=i-6, availableAt=i-6, value=v) for i, v in enumerate(values)]
    rounds = []
    for i in range(6):
        rounds.append(dict(round=i+1, cutoff=i, points=[dict(p) for p in points[-7:]]))
        if i < 5:
            points.append(dict(time=i+1, availableAt=i+1,
                               value=points[-1]['value']*(1+fixture['rounds'][i]['sector_returns'][4])))
    return dict(version=authored['version'], synthetic=True, rounds=rounds)


if __name__ == '__main__':
    data = build(json.loads(source.read_text(encoding='utf-8')),
                 json.loads(fixture_path.read_text(encoding='utf-8')))
    data['source_sha256'] = hashlib.sha256(source.read_bytes()).hexdigest()
    data['fixture_sha256'] = hashlib.sha256(fixture_path.read_bytes()).hexdigest()
    encoded = json.dumps(data, ensure_ascii=False, indent=2)
    (P/'information-data.json').write_text(encoded+'\n', encoding='utf-8')
    (P/'information-data.js').write_text('window.FACTORLAB_INFORMATION_DATA = '+encoded+';\n', encoding='utf-8')
    print('Built six time-bounded information packets; finance data untouched')
