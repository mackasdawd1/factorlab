from pathlib import Path
import hashlib
import json

P = Path(__file__).resolve().parent
root = P.parent
fixture = root / 'docs/week2/wireframes/prototype-fixture.json'
campaign = root / 'full-game/data.json'
history = root / 'full-game/information-source.json'
events = root / 'full-game/events.json'
f = json.loads(fixture.read_text(encoding='utf-8'))
c = json.loads(campaign.read_text(encoding='utf-8'))
fields = ['sector_returns', 'benchmark_return', 'exposures', 'factor_returns', 'market_return', 'event_returns', 'residual_returns', 'event']
data = dict(version='card-loop-data-v1', synthetic=True, sectors=f['sectors'],
            contribution_labels=f['contribution_labels'], strategies=c['strategies'],
            rounds=[{k: r[k] for k in fields} for r in f['rounds']],
            events=json.loads(events.read_text(encoding='utf-8')),
            pregame=json.loads(history.read_text(encoding='utf-8'))['pre_game_prices'],
            sources={str(p.relative_to(root)).replace('\\', '/'): hashlib.sha256(p.read_bytes()).hexdigest() for p in [fixture, campaign, history, events]})
encoded = json.dumps(data, ensure_ascii=False, separators=(',', ':'))
(P / 'data.json').write_text(encoded + '\n', encoding='utf-8')
(P / 'data.js').write_text('window.FACTORLAB_CARD_DATA = ' + encoded + ';\n', encoding='utf-8')
print('Generated immutable scenario inputs:', len(encoded.encode('utf-8')), 'bytes')
