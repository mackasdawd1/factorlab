from pathlib import Path
from unittest.mock import patch, MagicMock
import contextlib
import io
import json
import tempfile
import unittest

import demo


class DemoRecoveryTests(unittest.TestCase):
    def test_unrelated_health_payloads_are_not_managed_servers(self):
        for payload in [[], None, 'service online', 123, {},
                        dict(app=demo.APP_ID, identity=demo.IDENTITY),
                        dict(app=demo.APP_ID, identity=demo.IDENTITY, pid=True),
                        dict(app=demo.APP_ID, identity=demo.IDENTITY, pid=-1)]:
            with self.subTest(payload=payload):
                response=MagicMock()
                response.__enter__.return_value.read.return_value=json.dumps(payload).encode()
                with patch.object(demo.urllib.request,'urlopen',return_value=response):
                    self.assertIsNone(demo.health(8876))

    def test_valid_health_remains_recognized(self):
        payload=dict(app=demo.APP_ID,identity=demo.IDENTITY,pid=123)
        response=MagicMock()
        response.__enter__.return_value.read.return_value=json.dumps(payload).encode()
        with patch.object(demo.urllib.request,'urlopen',return_value=response):
            self.assertEqual(demo.health(8876),payload)

    def test_invalid_runtime_never_sends_stop_or_overwrites_record(self):
        valid=dict(port=8876,pid=123,identity=demo.IDENTITY,token='a'*43)
        records=['{', '[]', 'null', '{}']
        for field,bad in [('port',True),('port',70000),('port','8876'),('pid',0),('token',''),('token','\u4e2d'*43),('identity','other repository')]:
            records.append(json.dumps(dict(valid,**{field:bad})))
        with tempfile.TemporaryDirectory() as directory:
            record=Path(directory)/'runtime.json'
            for raw in records:
                with self.subTest(raw=raw):
                    record.write_text(raw,encoding='utf-8')
                    with patch.object(demo,'RUNTIME',record),patch.object(demo,'health') as health,patch.object(demo.urllib.request,'urlopen') as request:
                        with self.assertRaisesRegex(RuntimeError,'record.*invalid|record.*another'):
                            demo.stop()
                        health.assert_not_called();request.assert_not_called()
                    self.assertEqual(record.read_text(encoding='utf-8'),raw)

    def test_start_refuses_corrupt_record_before_spawning(self):
        with tempfile.TemporaryDirectory() as directory:
            record=Path(directory)/'runtime.json';record.write_text('[]',encoding='utf-8')
            probe=MagicMock();probe.__enter__.return_value.connect_ex.return_value=1
            with patch.object(demo,'RUNTIME',record),patch.object(demo,'smoke'),patch.object(demo,'health',return_value=None),patch.object(demo.socket,'socket',return_value=probe),patch.object(demo.subprocess,'Popen') as spawn:
                with self.assertRaisesRegex(RuntimeError,'record.*invalid'):
                    demo.start(8876,True)
                spawn.assert_not_called()

    def test_stale_valid_record_does_not_stop_unrelated_service(self):
        with tempfile.TemporaryDirectory() as directory:
            record=Path(directory)/'runtime.json'
            record.write_text(json.dumps(dict(port=8876,pid=123,identity=demo.IDENTITY,token='a'*43)),encoding='utf-8')
            with patch.object(demo,'RUNTIME',record),patch.object(demo,'health',return_value=None),patch.object(demo.urllib.request,'urlopen') as request,contextlib.redirect_stdout(io.StringIO()):
                demo.stop();request.assert_not_called()


if __name__=='__main__':
    suite=unittest.defaultTestLoader.loadTestsFromTestCase(DemoRecoveryTests)
    result=unittest.TextTestRunner(verbosity=2).run(suite)
    if result.wasSuccessful():
        evidence=dict(status='PASS',tests=result.testsRun,health_payload_cases=8,invalid_record_cases=11,
                      coverage=['unrelated health payloads','valid health','invalid/foreign runtime refuses stop','corrupt runtime refuses spawn','stale record preserves unrelated service'],
                      scope='Isolated regression tests; no live demo server restarted')
        (Path(__file__).parent/'evidence/demo-recovery.json').write_text(json.dumps(evidence,indent=2)+'\n',encoding='utf-8')
    raise SystemExit(0 if result.wasSuccessful() else 1)
