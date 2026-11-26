import { expect,test } from '@playwright/test';

test('displays exactly 13 reporting routes and saves a manual conclusion',async({page})=>{
  await page.goto('/');
  const nav=page.getByRole('navigation',{name:'Reporting tabs'});
  await expect(nav.getByRole('link')).toHaveCount(13);
  await expect(page.getByRole('heading',{name:'KPI Performance',exact:true})).toBeVisible();
  await nav.getByRole('link',{name:'Good Practices and Challenges'}).click();
  await page.getByLabel('Centre',{exact:true}).selectOption({label:'SEEN Nanyang'});
  await expect(page.getByRole('heading',{name:'Welcome calls for first-time participants'})).toBeVisible();
  await page.getByRole('button',{name:'Add conclusion'}).click();
  await page.getByLabel('Summary',{exact:true}).fill('Confirm outreach observations at the next review.');
  await page.getByRole('button',{name:'Save',exact:true}).click();
  await expect(page.getByText('Confirm outreach observations at the next review.')).toBeVisible();
  await page.getByRole('button',{name:'Presentation mode'}).click();
  await expect(page.getByText('2 / 13')).toBeVisible();
  await expect(page.getByRole('button',{name:'Add conclusion'})).toHaveCount(0);
  await page.getByRole('button',{name:'Next reporting tab'}).click();
  await expect(page.getByRole('heading',{name:'Recent Developments',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Exit presentation'}).click();
  await expect(page.getByLabel('Centre',{exact:true})).toHaveValue(/.+/);
});

test('mobile sidebar, theme and source registry are reachable',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/');
  await page.getByRole('button',{name:'Open navigation'}).click();
  await page.getByRole('link',{name:'Next Three Months'}).click();
  await expect(page.getByRole('heading',{name:'Next Three Months',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Use dark theme'}).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
  await page.getByRole('button',{name:'View data sources'}).click();
  await expect(page.getByRole('heading',{name:'Source registry'})).toBeVisible();
  await expect(page.getByText('Awaiting adapter',{exact:true})).toHaveCount(8);
  await expect(page.getByText('Not configured',{exact:true})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Data coverage'})).toBeVisible();
});

test('a fresh browser opens reports and workspace settings directly',async({page})=>{
  await page.goto('/next-two-weeks');
  await expect(page.getByRole('heading',{name:'Next Two Weeks',exact:true})).toBeVisible();
  await expect(page.getByLabel('Centre',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:/sign in|sign out/i})).toHaveCount(0);
  await page.getByRole('button',{name:'Workspace settings'}).click();
  await expect(page.getByRole('heading',{name:'Centre registry'})).toBeVisible();
});

test('operator unlock enables source controls and shows attributed imported figures',async({page})=>{
  const operatorKey='b'.repeat(64);
  const source={key:'glowbb',name:'GlowBBDashboard',configured:true,status:'Ready for connection test',enabled:true,
    datasets:['Summary'],type:'Read-only API',aliases:[],history:[]};
  await page.route('**/api/admin/sources',async route=>{
    const authorised=route.request().headers()['x-integration-operator-key']===operatorKey;
    await route.fulfill({json:{authorised,sources:[source]}});
  });
  await page.route('**/api/integrations/report/kpi-performance?**',async route=>{
    expect(route.request().headers()['x-integration-operator-key']).toBe(operatorKey);
    await route.fulfill({json:{window:{start:'2026-11-01',end:'2026-11-30'},source:'GlowBBDashboard',centreName:'GLOW Bukit Batok',
      syncedAt:'2026-11-26T02:00:00Z',partial:true,datasets:[{key:'summary',meta:{dataset:'summary',
        period:{from:'2026-11-01',to:'2026-11-30'},metrics:{sessions:{value:6,unit:'sessions',status:'available'}}},
        definitions:[{id:'sessions',displayName:'Recorded sessions',methodology:'Distinct delivered sessions'}],rows:[],truncated:false}]}});
  });
  await page.route('**/api/integrations/report/participant-profiles?**',async route=>{
    const attendance={value:21,unit:'entries',status:'available'};
    await route.fulfill({json:{window:{start:'2026-11-01',end:'2026-11-30'},source:'GlowBBDashboard',centreName:'GLOW Bukit Batok',partial:false,
      syncedAt:'2026-11-26T02:00:00Z',datasets:[{key:'programmes',meta:{dataset:'programmes',period:{from:'2026-11-01',to:'2026-11-30'}},
        definitions:[{id:'attendance',displayName:'Attendance entries',unit:'entries',methodology:'Observed entries'}],
        rows:[{id:'synthetic-programme',name:'Synthetic programme',rank:1,metrics:{attendance}}],truncated:false}]}});
  });
  await page.goto('/');
  await page.getByRole('button',{name:'View data sources'}).click();
  await expect(page.getByRole('button',{name:'Test connection'})).toHaveCount(0);
  await page.getByLabel('Integration operator key').fill(operatorKey);
  await page.getByRole('button',{name:'Unlock integrations'}).click();
  await expect(page.getByRole('button',{name:'Test connection'})).toBeVisible();
  await page.getByRole('link',{name:'KPI Performance'}).click();
  await expect(page.getByRole('heading',{name:'GlowBBDashboard reporting'})).toBeVisible();
  await expect(page.getByRole('row').filter({hasText:'Distinct delivered sessions'}).getByRole('cell',{name:'6 sessions',exact:true})).toBeVisible();
  await expect(page.getByText('HQ coverage: GLOW Bukit Batok only.')).toBeVisible();
  await page.getByRole('link',{name:'Participant Profiles'}).click();
  await expect(page.getByText('1. Synthetic programme')).toBeVisible();
  await page.getByRole('button',{name:'Show chart'}).click();
  await expect(page.getByRole('meter',{name:'Synthetic programme Attendance entries'})).toBeVisible();
  await page.getByRole('button',{name:'Show table'}).click();
  await expect(page.getByRole('cell',{name:'21 entries',exact:true})).toBeVisible();
});
