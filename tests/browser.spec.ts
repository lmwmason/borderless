import {test,expect} from '@playwright/test';
test.use({baseURL:process.env.BORDERLESS_QA_URL||'http://localhost:3217'});
test('desktop company → assessment → matter task → persistent edit → scenario comparison',async({page})=>{
 await page.setViewportSize({width:1440,height:1000});
 const taskTitle='Browser review task '+Date.now();
 const pageErrors:string[]=[];page.on('pageerror',error=>pageErrors.push(error.message));
 await page.goto('/');
 await expect(page.getByText('Loading workspace…',{exact:true})).toHaveCount(0);
 await expect(page.getByRole('heading',{name:'Overview',exact:true})).toBeVisible();
 if(await page.getByRole('button',{name:'Save company profile',exact:true}).isVisible()){
  await page.getByLabel('Company name',{exact:true}).fill('QA Browser SaaS');
  await page.getByRole('combobox',{name:'Sales model',exact:true}).selectOption('remote');
  await page.getByRole('combobox',{name:'US legal entity',exact:true}).selectOption('false');
  await page.getByRole('combobox',{name:'US office',exact:true}).selectOption('false');
  await page.getByLabel('US employees',{exact:true}).fill('0');
  const saved=page.waitForResponse(r=>r.url().endsWith('/api/company')&&r.request().method()==='PUT');
  await page.getByRole('button',{name:'Save company profile',exact:true}).click();
  const response=await saved;expect(response.status(),await response.text()).toBe(200);
 }
 await expect(page.getByRole('button',{name:'Edit company profile',exact:true})).toBeVisible();
 await page.getByRole('button',{name:/^Quick Assessment/}).click();
 await expect(page.getByText('No model was requested. Run Deep Review for additional issue analysis.',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Regulatory Matters',exact:true}).click();
 await expect(page.getByRole('table')).toBeVisible();
 await page.locator('.table-link').first().click();
 await expect(page.getByRole('dialog')).toBeVisible();
 await expect(page.getByRole('dialog').getByRole('heading',{name:'Official sources',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Create review task',exact:false}).click();
 await page.getByLabel('Task title',{exact:true}).fill(taskTitle);
 await page.getByLabel('Assignee',{exact:true}).fill('QA owner');
 await page.getByRole('combobox',{name:'Status',exact:true}).selectOption('in_review');
 await page.getByRole('textbox',{name:/^Notes/}).fill('Needs human legal review');
 await page.getByRole('button',{name:'Save task',exact:true}).click();
 await expect(page.getByRole('dialog')).toHaveCount(0);
 await page.getByRole('button',{name:/^Tasks/}).click();
 await expect(page.getByRole('button',{name:taskTitle,exact:true})).toBeVisible();
 await page.reload();
 await page.getByRole('button',{name:/^Tasks/}).click();
 await page.getByRole('button',{name:taskTitle,exact:true}).click();
 await expect(page.getByLabel('Assignee',{exact:true})).toHaveValue('QA owner');
 await expect(page.getByRole('combobox',{name:'Status',exact:true})).toHaveValue('in_review');
 await page.getByRole('combobox',{name:'Status',exact:true}).selectOption('done');
 await page.getByRole('button',{name:'Save task',exact:true}).click();
 await expect(page.getByRole('dialog')).toHaveCount(0);
 await page.getByRole('button',{name:'Scenarios',exact:true}).click();
 await page.getByRole('button',{name:'Clone scenario',exact:false}).click();
 await expect(page.getByRole('dialog')).toBeVisible();
 await page.getByLabel('Scenario name',{exact:true}).fill('California hiring plan');
 await page.getByLabel('US employees',{exact:true}).fill('1');
 await page.getByRole('button',{name:'Save scenario',exact:true}).click();
 await expect(page.getByRole('dialog')).toHaveCount(0);
 await page.getByRole('button',{name:'Overview',exact:true}).click();
 await page.getByRole('button',{name:/^Quick Assessment/}).click();
 await expect(page.getByText('No model was requested. Run Deep Review for additional issue analysis.',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Scenarios',exact:true}).click();
 await page.getByRole('combobox',{name:'Alternative scenario',exact:true}).selectOption({label:'Current company'});
 await expect(page.getByRole('heading',{name:'Changed regulatory matters',exact:true})).toBeVisible();
 await expect(page.locator('.changed-row')).not.toHaveCount(0);
 await page.getByRole('button',{name:'Activity',exact:true}).click();
 await expect(page.locator('.activity-list li').first()).toBeVisible();
 expect(pageErrors).toEqual([]);
 await page.screenshot({path:'/tmp/borderless-desktop-qa.png',fullPage:true});
});
test('mobile 375px navigation, responsive canvas and keyboard dialog close',async({page,request})=>{
 const workspace=await (await request.get('/api/workspace')).json();
 if(!workspace.company) {
  const saved=await request.put('/api/company',{data:{id:'qa-mobile',name:'Mobile QA SaaS',homeCountry:'KR',industry:'b2b_saas',targetStates:['CA'],usEntity:false,usEmployees:0,usOffice:false,salesModel:'remote',customerType:'b2b',annualUsRevenueUsd:null,processesPersonalData:null,updatedAt:new Date().toISOString()}});
  expect(saved.ok()).toBe(true);
 }
 await page.setViewportSize({width:375,height:812});
 await page.goto('/');
 await expect(page.getByText('Loading workspace…',{exact:true})).toHaveCount(0);
 await expect(page.getByRole('heading',{name:'Overview',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Tasks',exact:false}).click();
 await page.getByRole('button',{name:'Add task',exact:false}).click();
 await expect(page.getByRole('dialog')).toBeVisible();
 await page.keyboard.press('Escape');
 await expect(page.getByRole('dialog')).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 await page.screenshot({path:'/tmp/borderless-mobile-qa.png',fullPage:true});
});

test('controlled asynchronous Deep Review shows progress, survives reload and cancels without any real model call',async({page,request})=>{
 const initial=await (await request.get('/api/workspace')).json();
 if(!initial.company) {
  expect((await request.put('/api/company',{data:{id:'qa-deep-browser',name:'Deep Browser QA',homeCountry:'KR',industry:'b2b_saas',targetStates:['CA'],usEntity:false,usEmployees:0,usOffice:false,salesModel:'remote',customerType:'b2b',annualUsRevenueUsd:null,processesPersonalData:null,updatedAt:new Date().toISOString()}})).ok()).toBe(true);
 }
 const workspace=await (await request.get('/api/workspace')).json();
 const scenario=workspace.scenarios[0];
 const checked=await request.post('/api/assessments',{data:{scenarioId:scenario.id}});
 expect(checked.ok()).toBe(true);
 const quick=await checked.json();
 const result={...quick,id:'qa-controlled-assessment',kind:'deep',partial:true,modelStatus:'available',limitations:[...quick.limitations,'Controlled browser-test fixture; no actual inference.']};
 let job:import('../src/lib/contracts').ReviewJob|null=null;
 let polls=0,started=0,cancelled=0;
 await page.route('**/api/workspace',async route=>{
  const response=await route.fetch();const actual=await response.json();
  await route.fulfill({json:{...actual,reviewJobs:job?[job]:[],assessments:job?.result?[...actual.assessments.filter((a:{id:string})=>a.id!==result.id),job.result]:actual.assessments}});
 });
 await page.route('**/api/reviews',async route=>{
  expect(route.request().method()).toBe('POST');
  expect(route.request().postDataJSON()).toEqual({scenarioId:scenario.id,consent:true});
  started++;
  const now=new Date().toISOString();
  job={id:'qa-controlled-job',scenarioId:scenario.id,status:'queued',assessmentId:null,result:null,completedTopics:[],currentTopic:null,createdAt:now,updatedAt:now,error:null};
  await route.fulfill({status:202,json:job});
 });
 await page.route('**/api/reviews/qa-controlled-job',async route=>{
  expect(job).not.toBeNull();
  if(route.request().method()==='DELETE'){
   cancelled++;job={...job!,status:'cancelled',currentTopic:null,updatedAt:new Date().toISOString(),error:'Review cancelled. Completed findings are retained.'};
  } else {
   polls++;if(job!.status==='queued'||job!.status==='running')job={...job!,status:'running',result,assessmentId:result.id,completedTopics:['California employment'],currentTopic:'California privacy',updatedAt:new Date().toISOString()};
  }
  await route.fulfill({json:job});
 });
 await page.goto('/');
 await expect(page.getByText('Loading workspace…',{exact:true})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Deep Review',exact:true})).toBeDisabled();
 await page.getByRole('checkbox').check();
 await page.getByRole('button',{name:'Deep Review',exact:true}).click();
 const progress=page.getByRole('region',{name:'Deep Review status',exact:true});
 await expect(progress).toBeVisible();
 await expect(progress.getByText('Current topic: California privacy',{exact:true})).toBeVisible({timeout:5000});
 await expect(progress.getByText('1 topics completed: California employment',{exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:/^Quick Assessment/})).toBeEnabled();
 await expect(page.getByRole('button',{name:'Deep Review results',exact:true})).toHaveAttribute('aria-pressed','true');
 await page.getByRole('button',{name:'Quick results',exact:true}).click();
 await expect(page.getByText('No model was requested. Run Deep Review for additional issue analysis.',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Deep Review results',exact:true}).click();
 await page.getByRole('button',{name:'Regulatory Matters',exact:true}).click();
 await expect(page.getByText('Rule screening · Deep Review pending',{exact:true}).first()).toBeVisible();
 await expect(page.getByText('Deep Review completed',{exact:true}).first()).toBeVisible();
 await page.getByRole('button',{name:'Overview',exact:true}).click();
 await page.reload();
 await expect(page.getByText('Loading workspace…',{exact:true})).toHaveCount(0);
 await expect(progress.getByText('Current topic: California privacy',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Cancel Deep Review',exact:true}).click();
 await expect(progress.getByText('Review cancelled. Completed findings are retained.',{exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Cancel Deep Review',exact:true})).toHaveCount(0);
 await expect(progress.getByText('Available findings have been retained. Unfinished topics remain unreviewed.',{exact:true})).toBeVisible();
 expect(started).toBe(1);expect(cancelled).toBe(1);expect(polls).toBeGreaterThan(0);
 await page.screenshot({path:'/tmp/borderless-deep-review-qa.png',fullPage:true});
});
