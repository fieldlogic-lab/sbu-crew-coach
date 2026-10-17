import json
import secrets
year=secrets.randbelow(7000)+2200
from pathlib import Path
from playwright.sync_api import sync_playwright
base='http://127.0.0.1:4173'
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 for width in [390,375]:
  ctx=browser.new_context(viewport={'width':width,'height':844},is_mobile=True,has_touch=True)
  ctx.route('**/*',lambda route: route.continue_() if route.request.url.startswith(base) else route.abort())
  page=ctx.new_page();errors=[];page.on('pageerror',lambda e: errors.append(str(e)))
  # Establish the actual signed Coach cookie through the protected API.
  login=ctx.request.post(base+'/api/console',data={'action':'login','username':'synthetic-coach','password':'synthetic-coach-password'})
  assert login.status==200
  page.goto(base);page.locator('button[data-v=lineups]').click()
  page.locator('#lineup-date').fill(str(year)+'-01-'+('01' if width==390 else '02'))
  page.locator('#lineup-add').click(); page.locator('[data-class="0"]').select_option('2x')
  page.locator('#lineup-add').click(); page.locator('[data-class="1"]').select_option('1x')
  page.locator('#lineup-approve').click();page.get_by_text('Fill every seat before approval.',exact=True).wait_for()
  page.locator('select[data-boat="0"][data-seat="2"]').select_option('synthetic-0')
  page.locator('select[data-boat="0"][data-seat="Bow"]').select_option('synthetic-1')
  assert page.locator('select[data-boat="1"][data-seat="Bow"] option[value="synthetic-0"]').evaluate('(el)=>el.disabled')
  page.locator('select[data-boat="1"][data-seat="Bow"]').select_option('synthetic-2')
  page.locator('[data-move="0"][data-seat="2"]').click();page.locator('[data-move="1"][data-seat="Bow"]').click()
  assert page.locator('select[data-boat="1"][data-seat="Bow"]').input_value()=='synthetic-0'
  page.locator('#lineup-save').click();page.get_by_text('Draft saved.',exact=True).wait_for()
  page.reload();page.locator('button[data-v=lineups]').click();page.locator('#lineup-date').fill(str(year)+'-01-'+('01' if width==390 else '02'))
  assert page.locator('select[data-boat="1"][data-seat="Bow"]').input_value()=='synthetic-0'
  page.locator('#lineup-approve').click();page.get_by_text('Approved and saved.',exact=True).wait_for()
  # A cached draft must keep its original version even after another date saves.
  cached_date=str(year)+'-03-'+('01' if width==390 else '02')
  other_date=str(year)+'-04-'+('01' if width==390 else '02')
  page.locator('#lineup-date').fill(cached_date);page.locator('#lineup-add').click()
  page.locator('#lineup-date').fill(other_date);page.locator('#lineup-add').click()
  page.locator('#lineup-save').click();page.get_by_text('Draft saved.',exact=True).wait_for()
  page.locator('#lineup-date').fill(cached_date)
  page.locator('#lineup-save').click();page.get_by_text('Save conflict.',exact=False).wait_for()
  assert page.locator('[data-class]').count()==1
  page.locator('#lineup-date').fill(str(year)+'-02-'+('01' if width==390 else '02'))
  page.locator('#lineup-copy-date').select_option(str(year)+'-01-'+('01' if width==390 else '02'));page.locator('#lineup-copy').click()
  assert page.locator('select[data-boat="1"][data-seat="Bow"]').input_value()=='synthetic-0'
  # Advance the server version externally to exercise safe conflict recovery.
  ctx.request.post(base+'/__fixture/advance')
  page.locator('#lineup-save').click();page.get_by_text('Save conflict.',exact=False).wait_for()
  assert page.locator('select[data-boat="1"][data-seat="Bow"]').input_value()=='synthetic-0'
  assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'horizontal overflow'
  # Failed network saves retain the same editable draft.
  ctx.route('**/api/console',lambda route: route.abort() if route.request.method=='POST' else route.continue_())
  page.locator('#lineup-save').click();page.get_by_text('Failed to fetch',exact=False).wait_for()
  assert page.locator('select[data-boat="1"][data-seat="Bow"]').input_value()=='synthetic-0'
  page.screenshot(path=f'/workspace/sbu-crew-coach/qa/lineups-{width}.png',full_page=True)
  assert not errors,errors
  print(json.dumps({'width':width,'multiBoat':True,'duplicateNames':True,'swap':True,'saveReopen':True,'approve':True,'copy':True,'conflictRetainsEdits':True,'cachedDraftVersionProtected':True,'networkFailureRetainsEdits':True,'incompleteApprovalRejected':True,'noHorizontalOverflow':True,'pageErrors':errors}))
  ctx.close()
 browser.close()
