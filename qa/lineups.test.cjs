const test = require('node:test');
const assert = require('node:assert/strict');
const { identifyRoster, lineupRoster } = require('../api/lib/roster');
const { validateDailyLineup } = require('../api/lib/lineups');
const rows = [{ id: 'a', name: 'Synthetic Duplicate' }, { id: 'b', name: 'Synthetic Duplicate' }];
const make = () => ({date:'2099-01-01',status:'draft',boats:[{id:'one',boatClass:'2x',seats:{'2':'a',Bow:'b'}}]});
test('distinct duplicate names can be assigned, but the same ID cannot occupy two seats', () => {
 assert.equal(validateDailyLineup(make(), rows).boats[0].seats.Bow,'b');
 const input = make(); input.boats[0].seats.Bow = 'a'; assert.throws(() => validateDailyLineup(input,rows), /two seats/);
 input.boats[0].seats.Bow = ''; input.boats.push({id:'two',boatClass:'1x',seats:{Bow:'a'}}); assert.throws(() => validateDailyLineup(input,rows), /two seats/);
});
test('approval requires complete seats, valid dates and current roster identities', () => {
 const input = make(); input.status='approved'; assert.equal(validateDailyLineup(input,rows).status,'approved');
 input.boats[0].seats.Bow=''; assert.throws(() => validateDailyLineup(input,rows), /Fill every seat/);
 input.status='draft'; assert.equal(validateDailyLineup(input,rows).status,'draft');
 input.date='2099-02-30'; assert.throws(() => validateDailyLineup(input,rows), /valid practice date/);
 input.date='2099-01-01'; input.boats[0].seats.Bow='removed'; assert.throws(() => validateDailyLineup(input,rows), /no longer/);
});
test('unique names retain identifiers across sheet reorder; indistinguishable duplicates fail closed', () => {
 const old = identifyRoster([{name:'Synthetic A'},{name:'Synthetic B'}]);
 const next = identifyRoster([{name:'Synthetic B'},{name:'Synthetic A'}],old); assert.equal(next[1].id,old[0].id);
 const duplicates = identifyRoster([{name:'Synthetic X'},{name:'Synthetic X'}]);
 const refreshed = identifyRoster([{name:'Synthetic X'},{name:'Synthetic X'}],duplicates);
 assert.notEqual(refreshed[0].id,duplicates[0].id); assert.notEqual(duplicates[0].id,duplicates[1].id);
 assert.equal(lineupRoster(rows)[1].id,'b');
});
process.env.COACH_USERNAME='synthetic-coach'; process.env.COACH_PASSWORD='synthetic-password'; process.env.COACH_SESSION_SECRET='synthetic-secret-longer-than-thirty-two-bytes';
const store = require('../api/lib/draft-store'); let draft = {teamOps:{attendance:{athletes:rows},lineups:{drafts:[{name:'synthetic legacy'}]},trainingPlan:{sessions:[]}},content:{resources:[]}}, version=1;
store.readDraft=async()=>({data:structuredClone(draft),etag:`"v${version}"`});
store.writeDraft=async(data,options)=>{assert.equal(options.etag,`"v${version}"`);draft=structuredClone(data);version++;};
store.readBlob=async()=>({data:structuredClone(draft),etag:'"public"'});
const handler=require('../api/console');
async function invoke(method,body,headers={},url='/api/console') {const res={headers:{},setHeader(k,v){this.headers[k]=v},end(v){this.data=JSON.parse(v)}};await handler({method,url,body,headers},res);return res;}
test('protected save/reopen uses ETags, preserves adjacent data and never publishes lineup names',async()=>{
 assert.equal((await invoke('POST',{action:'save-lineup',lineup:make()})).statusCode,401);
 const login=await invoke('POST',{action:'login',username:'synthetic-coach',password:'synthetic-password'});const cookie=login.headers['set-cookie'].split(';')[0];
 assert.equal((await invoke('POST',{action:'save-lineup',lineup:make()},{cookie,'if-match':'"old"'})).statusCode,412);
 const saved=await invoke('POST',{action:'save-lineup',lineup:make()},{cookie,'if-match':'"v1"'});assert.equal(saved.statusCode,200);assert.equal(saved.headers.etag,'"v2"');assert.equal(draft.teamOps.lineups.drafts.length,1);assert.deepEqual(draft.teamOps.attendance.athletes,rows);
 const reopened=await invoke('GET',undefined,{cookie});assert.equal(reopened.data.teamOps.lineups.daily['2099-01-01'].boats[0].seats.Bow,'b');
 const publicRead=await invoke('GET',undefined,{},'/api/console?view=published');assert.ok(!JSON.stringify(publicRead.data).includes('Synthetic Duplicate'));
});
