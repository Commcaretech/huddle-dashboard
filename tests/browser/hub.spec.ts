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
  await expect(page.getByText('Awaiting adapter',{exact:true})).toHaveCount(9);
});
