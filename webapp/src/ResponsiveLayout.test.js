import fs from 'fs';
import path from 'path';

const source = (name) => fs.readFileSync(path.join(__dirname, name), 'utf8');

test('the mobile shell reserves safe-area-aware bottom navigation space', () => {
  const app = source('App.css');
  const menu = source('Menu.css');

  expect(app).toContain('@media (max-width: 700px)');
  expect(app).toContain('padding-bottom: var(--mobile-nav-height)');
  expect(menu).toContain('grid-template-columns: repeat(4, minmax(0, 1fr))');
  expect(menu).toContain('env(safe-area-inset-bottom)');
  expect(menu).toContain('overflow-x: hidden');
});

test('dashboard owns a continuous vertical scroller at every viewport height', () => {
  const dashboard = source('AccountProfile.css');
  const profile = source('UserProfile.css');

  expect(dashboard).toMatch(/\.dashboard-page\s*\{\s*height:\s*100%;[\s\S]*?overflow-x:\s*hidden;[\s\S]*?overflow-y:\s*auto;/);
  expect(dashboard).toMatch(/\.dashboard-widget-grid\s*\{\s*flex:\s*none;[\s\S]*?overflow:\s*visible;/);
  expect(dashboard).toContain('@media(max-height:900px), (max-width:700px)');
  expect(dashboard).toMatch(/\.dashboard-page\s*\{[\s\S]*?height:\s*auto;[\s\S]*?overflow:\s*visible;/);
  expect(profile).toContain('@media(max-width:700px)');
  expect(profile).toMatch(/@media\(max-width:700px\)[\s\S]*?\.user-profile-page\s*\{[\s\S]*?height:\s*auto;[\s\S]*?overflow-x:\s*hidden;[\s\S]*?overflow-y:\s*visible;/);
});

test('desktop profile forms size to content and appearance owns the flexible scroller', () => {
  const profile = source('UserProfile.css');

  expect(profile).toMatch(/\.user-profile-grid\s*\{[\s\S]*?flex:\s*0 0 auto;[\s\S]*?overflow:\s*visible;/);
  expect(profile).toMatch(/\.user-profile-grid > \.user-profile-card\s*\{[\s\S]*?overflow:\s*visible;/);
  expect(profile).toMatch(/\.appearance-settings\s*\{[\s\S]*?flex:\s*1 1 0;[\s\S]*?overflow-x:\s*hidden;[\s\S]*?overflow-y:\s*auto;/);
  expect(profile).toMatch(/\.user-profile-settings\[open\]\s*\{[\s\S]*?position:\s*static;[\s\S]*?flex:\s*0 0 auto;/);
  expect(profile).toMatch(/@media\(max-height:800px\)[\s\S]*?\.user-profile-grid > \.user-profile-card\s*\{[\s\S]*?overflow-y:\s*auto;/);
});

test('mobile dashboard stacks campaigns and widgets without horizontal overflow', () => {
  const dashboard = source('AccountProfile.css');

  expect(dashboard).toMatch(/@media\(max-width:700px\)[\s\S]*?\.dashboard-page\s*\{[\s\S]*?overflow-x:\s*hidden;/);
  expect(dashboard).toMatch(/@media\(max-width:700px\)[\s\S]*?\.dashboard-campaign-grid\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\);[\s\S]*?overflow:\s*visible;/);
  expect(dashboard).toMatch(/@media\(max-width:700px\)[\s\S]*?\.dashboard-widget-grid\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\);[\s\S]*?grid-auto-flow:\s*row;/);
});

test('mobile session controls keep each requested control group on one row', () => {
  const sessions = source('SessionManagement.css');

  expect(sessions).toMatch(/\.session-command-bar > \.session-actions\s*\{[\s\S]*?grid-template-columns:repeat\(3,minmax\(0,1fr\)\);/);
  expect(sessions).toMatch(/\.session-selector\s*\{[\s\S]*?grid-template-columns:minmax\(0,1\.55fr\) repeat\(2,minmax\(0,\.8fr\)\);/);
  expect(sessions).toMatch(/\.session-selector > \.session-status\s*\{[\s\S]*?display:none;/);
});

test('dense core-route content keeps horizontal overflow in local scrollers', () => {
  expect(source('InventoryView.css')).toMatch(/\.inventory-table-wrap\s*\{[\s\S]*?overflow:\s*auto;/);
  expect(source('InventoryView.js')).toContain('className="inventory-item-details-modal"');
  expect(source('InventoryView.js')).not.toContain("<Modal.Footer style={{ height: '100px' }}>");
  expect(source('InventoryView.css')).toMatch(/\.inventory-item-details-modal \.modal-content\s*\{[\s\S]*?max-height:\s*calc\(100dvh - 1rem\);[\s\S]*?overflow:\s*hidden;/);
  expect(source('InventoryView.css')).toMatch(/\.inventory-item-details-modal \.modal-body\s*\{[\s\S]*?overflow-y:\s*auto;/);
  expect(source('Journal.css')).toMatch(/\.journal-table-wrap\s*\.table\s*\{[\s\S]*?min-width:\s*680px;/);
  expect(source('Calendar.css')).toMatch(/\.calendar-page\s*\{[\s\S]*?overflow-x:\s*auto;/);
  expect(source('DMTools.css')).toMatch(/\.dmtools-table-shell\s*\{[\s\S]*?overflow:\s*auto;/);
});
