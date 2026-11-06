import yaml,json,os,subprocess,tempfile,collections,shlex
from pathlib import Path
packet=Path('../packet')
current=yaml.safe_load(Path('.github/workflows/verify.yml').read_text())
base=yaml.safe_load(subprocess.check_output(['git','show','origin/main:.github/workflows/verify.yml'],text=True))
step=next(s for s in current['jobs']['plan']['steps'] if s.get('id')=='workloads')
with tempfile.NamedTemporaryFile() as out:
    subprocess.run(['python3','-c',step['run']],env=dict(os.environ,GITHUB_OUTPUT=out.name),check=True)
    matrix=json.loads(Path(out.name).read_text().removeprefix('matrix='))['include']
assert len(matrix)==8
api=[f for row in matrix if row['kind']=='api' for f in row['files']]
expected=sorted(str(p) for p in Path('tests/api').glob('*.test.mjs'))
assert sorted(api)==expected and len(api)==len(set(api))
commands=[shlex.split(c) for c in json.loads(Path('package.json').read_text())['scripts']['verify:app'].split(' && ')]
browser=[c for c in commands if c[:2]==['node','tests/browser/run.mjs']]
actual_browser=[c for row in matrix if row['kind']=='browser' for c in row['commands']]
old_connectors=next(s for s in base['jobs']['rer-verify']['steps'] if s.get('name','').startswith('Verify connector'))['run'].splitlines()
old_connectors=[shlex.split(c)[2:] for c in old_connectors]
# The broader verify:app spend-authority selection includes the original journey.spec.ts selection.
spend=['node','tests/browser/run.mjs','journey.spec.ts','--grep','purchase approval names spend authority']
assert spend in old_connectors
assert ['node','tests/browser/run.mjs','--grep','purchase approval names spend authority'] in browser
assert 'purchase approval names spend authority' in Path('tests/browser/journey.spec.ts').read_text()
expected_browser=browser+[c for c in old_connectors if c!=spend]
assert collections.Counter(map(tuple,actual_browser))==collections.Counter(map(tuple,expected_browser))
assert len(actual_browser)==len(set(map(tuple,actual_browser)))
fixed=[c for c in commands if c not in browser]
assert len(fixed)==6
build_runs=[s.get('run','') for s in current['jobs']['build-checks']['steps']]
for cmd in ['pnpm run build','pnpm run typecheck','pnpm run test:site','node tests/email-link.mjs','pnpm exec rer check --profile first-party','pnpm exec rer build --site --no-queue','node src/base/contract-docs.mjs check']:
    assert cmd in build_runs,cmd
production=next(s['run'] for s in current['jobs']['build-checks']['steps'] if s.get('name')=='Verify the emitted production Worker and hydration')
assert 'await checkHostedOutput' in production and 'await checkHydration' in production
assert current['jobs']['shards']['strategy']['fail-fast'] is False
assert current['jobs']['shards']['strategy']['max-parallel']==8
assert current['jobs']['verify']['needs']==['plan','build-checks','shards']
assert current['jobs']['build-checks']['timeout-minutes']==base['jobs']['rer-verify']['timeout-minutes']==current['jobs']['shards']['timeout-minutes']==45
assert current['jobs']['plan']['timeout-minutes']==base['jobs']['plan']['timeout-minutes']==30
assert current['jobs']['verify']['timeout-minutes']==base['jobs']['verify']['timeout-minutes']==1
assert current['jobs']['plan']['steps'][1]==base['jobs']['plan']['steps'][1]
assert current['jobs']['verify']['steps']==base['jobs']['verify']['steps']
receipt=dict(api_files=len(api),browser_selections_verify_app=len(browser),original_connector_invocations=len(old_connectors),connector_duplicate_consolidated=1,browser_selections_total=len(actual_browser),fixed_verify_app_commands=len(fixed),shard_jobs=len(matrix),source_head=subprocess.check_output(['git','rev-parse','origin/cloud/sx-pier-ci-critical-path-1'],text=True).strip(),base_head=subprocess.check_output(['git','rev-parse','origin/main'],text=True).strip(),matrix=matrix,assertions='All existing API files and browser selections retained; one duplicate spend-authority invocation consolidated; build, types, site, email-link, portability, production Worker, hydration and source checks retained; plan and aggregate assertions unchanged; job timeouts unchanged.')
(packet/'workload-audit.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps({k:v for k,v in receipt.items() if k!='matrix'},indent=2))
