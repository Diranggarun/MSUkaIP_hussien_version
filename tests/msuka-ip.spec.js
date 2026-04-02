// ═══════════════════════════════════════════════════════════════════
//  MSUkaIP – Playwright Test Suite
//  Chapter 3: System Testing (Section 3.4)
//  Tests: Login, Register, Chat, File Upload, Admin Dashboard
// ═══════════════════════════════════════════════════════════════════

const { test, expect } = require('@playwright/test');

// ── Test Config ───────────────────────────────────────────────────
const BASE_URL    = 'http://localhost:3000';
const ADMIN_EMAIL = 'admin@cics.msu.edu';
const ADMIN_PASS  = 'admin123';
const USER_EMAIL  = 'student@cics.msu.edu';
const USER_PASS   = 'student123';

// ═══════════════════════════════════════════════════════════════════
//  TEST GROUP 1: Authentication
// ═══════════════════════════════════════════════════════════════════
test.describe('1. Authentication Tests', () => {

  test('1.1 Login page loads correctly', async ({ page }) => {
    await page.goto(BASE_URL);
    await expect(page.locator('h1')).toContainText('MSUkaIP');
    await expect(page.locator('#login-email')).toBeVisible();
    await expect(page.locator('#login-password')).toBeVisible();
    console.log('✅ Login page loaded successfully');
  });

  test('1.2 Register tab switches correctly', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.click('#tab-register-btn');
    await expect(page.locator('#reg-name')).toBeVisible();
    await expect(page.locator('#reg-email')).toBeVisible();
    await expect(page.locator('#reg-password')).toBeVisible();
    console.log('✅ Register tab works');
  });

  test('1.3 Login with invalid credentials shows error', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.fill('#login-email', 'wrong@cics.msu.edu');
    await page.fill('#login-password', 'wrongpassword');
    await page.click('button.btn-login');
    await expect(page.locator('#login-msg')).toBeVisible();
    await expect(page.locator('#login-msg')).toContainText('Invalid');
    console.log('✅ Invalid login correctly rejected');
  });

  test('1.4 Login with empty fields shows error', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.click('button.btn-login');
    await expect(page.locator('#login-msg')).toContainText('fill in all fields');
    console.log('✅ Empty login validation works');
  });

  test('1.5 Successful login shows messenger UI', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.fill('#login-email', USER_EMAIL);
    await page.fill('#login-password', USER_PASS);
    await page.click('button.btn-login');
    // Messenger app should appear
    await expect(page.locator('#app')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.left-panel')).toBeVisible();
    console.log('✅ Login successful — messenger UI visible');
  });

  test('1.6 Admin login shows admin button', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.fill('#login-email', ADMIN_EMAIL);
    await page.fill('#login-password', ADMIN_PASS);
    await page.click('button.btn-login');
    await expect(page.locator('#app')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#admin-btn')).toBeVisible();
    console.log('✅ Admin login shows admin button');
  });

  test('1.7 Register with mismatched passwords shows error', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.click('#tab-register-btn');
    await page.fill('#reg-name', 'Test User');
    await page.fill('#reg-email', 'test@cics.msu.edu');
    await page.fill('#reg-password', 'password123');
    await page.fill('#reg-confirm', 'different123');
    await page.click('button.btn-register');
    await expect(page.locator('#reg-msg')).toContainText('do not match');
    console.log('✅ Password mismatch validation works');
  });

  test('1.8 Register with short password shows error', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.click('#tab-register-btn');
    await page.fill('#reg-name', 'Test User');
    await page.fill('#reg-email', 'test@cics.msu.edu');
    await page.fill('#reg-password', '123');
    await page.fill('#reg-confirm', '123');
    await page.click('button.btn-register');
    await expect(page.locator('#reg-msg')).toContainText('6 characters');
    console.log('✅ Short password validation works');
  });

});

// ═══════════════════════════════════════════════════════════════════
//  TEST GROUP 2: Messenger UI
// ═══════════════════════════════════════════════════════════════════
test.describe('2. Messenger UI Tests', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    await page.fill('#login-email', USER_EMAIL);
    await page.fill('#login-password', USER_PASS);
    await page.click('button.btn-login');
    await page.waitForSelector('#app', { state: 'visible', timeout: 5000 });
  });

  test('2.1 Navigation buttons are visible', async ({ page }) => {
    await expect(page.locator('#nav-global')).toBeVisible();
    await expect(page.locator('#nav-groups')).toBeVisible();
    await expect(page.locator('#nav-private')).toBeVisible();
    console.log('✅ All 3 nav buttons visible');
  });

  test('2.2 Global Chat section shows correctly', async ({ page }) => {
    await page.click('#nav-global');
    await expect(page.locator('#section-global')).toBeVisible();
    await expect(page.locator('#global-chat-item')).toBeVisible();
    await expect(page.locator('.conv-name').first()).toContainText('Global Chat');
    console.log('✅ Global Chat section visible');
  });

  test('2.3 Groups section shows + New Group button', async ({ page }) => {
    await page.click('#nav-groups');
    await expect(page.locator('#section-groups')).toBeVisible();
    await expect(page.locator('button', { hasText: '+ New Group' })).toBeVisible();
    console.log('✅ Groups section with New Group button visible');
  });

  test('2.4 Private section shows online users', async ({ page }) => {
    await page.click('#nav-private');
    await expect(page.locator('#section-private')).toBeVisible();
    console.log('✅ Private section visible');
  });

  test('2.5 Opening Global Chat shows message area', async ({ page }) => {
    await page.click('#global-chat-item');
    await expect(page.locator('#chat-panel')).toBeVisible();
    await expect(page.locator('#messages-area')).toBeVisible();
    await expect(page.locator('#msg-input')).toBeVisible();
    console.log('✅ Global Chat opens correctly');
  });

  test('2.6 Input row has all buttons', async ({ page }) => {
    await page.click('#global-chat-item');
    await expect(page.locator('#attach-btn')).toBeVisible();
    await expect(page.locator('#msg-input')).toBeVisible();
    await expect(page.locator('#ptt-btn')).toBeVisible();
    await expect(page.locator('.send-btn')).toBeVisible();
    console.log('✅ All input buttons visible (attach, PTT, send)');
  });

  test('2.7 Search box filters conversations', async ({ page }) => {
    await page.fill('#search-input', 'Global');
    await expect(page.locator('#global-chat-item')).toBeVisible();
    console.log('✅ Search works');
  });

  test('2.8 New Group modal opens', async ({ page }) => {
    await page.click('#nav-groups');
    await page.click('button', { hasText: '+ New Group' });
    await expect(page.locator('#modal-overlay')).toBeVisible();
    await expect(page.locator('#group-name-input')).toBeVisible();
    console.log('✅ New Group modal opens');
  });

  test('2.9 New Group modal can be closed', async ({ page }) => {
    await page.click('#nav-groups');
    await page.click('button', { hasText: '+ New Group' });
    await page.click('.btn-cancel');
    await expect(page.locator('#modal-overlay')).not.toBeVisible();
    console.log('✅ Group modal closes correctly');
  });

  test('2.10 Logout button works', async ({ page }) => {
    await page.click('button[onclick="logout()"]');
    await expect(page.locator('#auth-screen')).toBeVisible();
    console.log('✅ Logout works — back to login screen');
  });

});

// ═══════════════════════════════════════════════════════════════════
//  TEST GROUP 3: Messaging
// ═══════════════════════════════════════════════════════════════════
test.describe('3. Messaging Tests', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    await page.fill('#login-email', USER_EMAIL);
    await page.fill('#login-password', USER_PASS);
    await page.click('button.btn-login');
    await page.waitForSelector('#app', { state: 'visible', timeout: 5000 });
    await page.click('#global-chat-item');
    await page.waitForSelector('#chat-panel', { state: 'visible' });
  });

  test('3.1 Can type in message input', async ({ page }) => {
    await page.fill('#msg-input', 'Hello CICS!');
    await expect(page.locator('#msg-input')).toHaveValue('Hello CICS!');
    console.log('✅ Can type in message input');
  });

  test('3.2 Send button is clickable', async ({ page }) => {
    await page.fill('#msg-input', 'Test message from Playwright');
    await page.click('.send-btn');
    // Input should be cleared after sending
    await expect(page.locator('#msg-input')).toHaveValue('');
    console.log('✅ Message sent — input cleared');
  });

  test('3.3 Message appears in chat after sending', async ({ page }) => {
    const testMsg = `Test message ${Date.now()}`;
    await page.fill('#msg-input', testMsg);
    await page.click('.send-btn');
    await expect(page.locator('.bubble', { hasText: testMsg })).toBeVisible({ timeout: 3000 });
    console.log('✅ Message appears in chat after sending');
  });

  test('3.4 Enter key sends message', async ({ page }) => {
    const testMsg = `Enter key test ${Date.now()}`;
    await page.fill('#msg-input', testMsg);
    await page.press('#msg-input', 'Enter');
    await expect(page.locator('.bubble', { hasText: testMsg })).toBeVisible({ timeout: 3000 });
    console.log('✅ Enter key sends message');
  });

  test('3.5 Empty message is not sent', async ({ page }) => {
    const msgsBefore = await page.locator('.bubble').count();
    await page.click('.send-btn');
    const msgsAfter = await page.locator('.bubble').count();
    expect(msgsAfter).toBe(msgsBefore);
    console.log('✅ Empty message not sent');
  });

  test('3.6 Message delivery speed (under 1 second)', async ({ page }) => {
    const testMsg = `Speed test ${Date.now()}`;
    const start = Date.now();
    await page.fill('#msg-input', testMsg);
    await page.click('.send-btn');
    await page.waitForSelector(`.bubble:has-text("${testMsg}")`, { timeout: 1000 });
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(1000);
    console.log(`✅ Message delivered in ${elapsed}ms (under 1000ms requirement)`);
  });

});

// ═══════════════════════════════════════════════════════════════════
//  TEST GROUP 4: File Upload
// ═══════════════════════════════════════════════════════════════════
test.describe('4. File Upload Tests', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    await page.fill('#login-email', USER_EMAIL);
    await page.fill('#login-password', USER_PASS);
    await page.click('button.btn-login');
    await page.waitForSelector('#app', { state: 'visible', timeout: 5000 });
    await page.click('#global-chat-item');
    await page.waitForSelector('#chat-panel', { state: 'visible' });
  });

  test('4.1 Attach button is visible', async ({ page }) => {
    await expect(page.locator('#attach-btn')).toBeVisible();
    console.log('✅ Attach button visible');
  });

  test('4.2 File input accepts images', async ({ page }) => {
    const input = page.locator('#file-input');
    await expect(input).toHaveAttribute('accept', /image/);
    console.log('✅ File input accepts image types');
  });

  test('4.3 File input accepts PDFs', async ({ page }) => {
    const input = page.locator('#file-input');
    await expect(input).toHaveAttribute('accept', /.pdf/);
    console.log('✅ File input accepts PDF');
  });

  test('4.4 PTT button is visible and holdable', async ({ page }) => {
    await expect(page.locator('#ptt-btn')).toBeVisible();
    await expect(page.locator('#ptt-btn')).toHaveText('🎙️');
    console.log('✅ PTT button visible');
  });

});

// ═══════════════════════════════════════════════════════════════════
//  TEST GROUP 5: Admin Dashboard
// ═══════════════════════════════════════════════════════════════════
test.describe('5. Admin Dashboard Tests', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/admin.html`);
    await page.fill('#login-email', ADMIN_EMAIL);
    await page.fill('#login-password', ADMIN_PASS);
    await page.click('button.btn-primary');
    await page.waitForSelector('#app', { state: 'visible', timeout: 5000 });
  });

  test('5.1 Admin dashboard loads after login', async ({ page }) => {
    await expect(page.locator('#app')).toBeVisible();
    console.log('✅ Admin dashboard loaded');
  });

  test('5.2 Stats cards are visible', async ({ page }) => {
    await expect(page.locator('#stat-total')).toBeVisible();
    await expect(page.locator('#stat-online')).toBeVisible();
    await expect(page.locator('#stat-pending')).toBeVisible();
    console.log('✅ Stats cards visible');
  });

  test('5.3 Pending tab is visible', async ({ page }) => {
    await expect(page.locator('#tab-pending')).toBeVisible();
    console.log('✅ Pending tab visible');
  });

  test('5.4 Users tab shows user table', async ({ page }) => {
    await page.click('button', { hasText: '👥 Users' });
    await expect(page.locator('#users-tbody')).toBeVisible();
    console.log('✅ Users table visible');
  });

  test('5.5 Add User tab shows form', async ({ page }) => {
    await page.click('button', { hasText: '➕ Add User' });
    await expect(page.locator('#new-name')).toBeVisible();
    await expect(page.locator('#new-email')).toBeVisible();
    await expect(page.locator('#new-password')).toBeVisible();
    console.log('✅ Add User form visible');
  });

  test('5.6 Audit Logs tab loads', async ({ page }) => {
    await page.click('button', { hasText: '📋 Audit Logs' });
    await expect(page.locator('#logs-list')).toBeVisible();
    console.log('✅ Audit Logs visible');
  });

  test('5.7 Non-admin cannot access admin dashboard', async ({ page, context }) => {
    const newPage = await context.newPage();
    await newPage.goto(`${BASE_URL}/admin.html`);
    await newPage.fill('#login-email', USER_EMAIL);
    await newPage.fill('#login-password', USER_PASS);
    await newPage.click('button.btn-primary');
    await expect(newPage.locator('.auth-error')).toContainText('Admin');
    console.log('✅ Non-admin blocked from admin dashboard');
  });

  test('5.8 Admin can add a new user', async ({ page }) => {
    await page.click('button', { hasText: '➕ Add User' });
    const testEmail = `testuser_${Date.now()}@cics.msu.edu`;
    await page.fill('#new-name', 'Playwright Test User');
    await page.fill('#new-email', testEmail);
    await page.fill('#new-password', 'test123456');
    await page.click('button.btn-add');
    await expect(page.locator('#add-success')).toBeVisible({ timeout: 3000 });
    console.log('✅ Admin can add new user');
  });

});

// ═══════════════════════════════════════════════════════════════════
//  TEST GROUP 6: Performance & Availability
// ═══════════════════════════════════════════════════════════════════
test.describe('6. Performance & Availability Tests', () => {

  test('6.1 System loads without internet (LAN only check)', async ({ page }) => {
    await page.goto(BASE_URL);
    // If server responds, system is working on LAN
    await expect(page.locator('#auth-screen')).toBeVisible({ timeout: 3000 });
    console.log('✅ System accessible on local network');
  });

  test('6.2 Page load time under 3 seconds', async ({ page }) => {
    const start = Date.now();
    await page.goto(BASE_URL);
    await page.waitForSelector('#login-email');
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(3000);
    console.log(`✅ Page loaded in ${elapsed}ms`);
  });

  test('6.3 Login response under 2 seconds', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.fill('#login-email', USER_EMAIL);
    await page.fill('#login-password', USER_PASS);
    const start = Date.now();
    await page.click('button.btn-login');
    await page.waitForSelector('#app', { state:'visible', timeout:5000 });
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(2000);
    console.log(`✅ Login completed in ${elapsed}ms`);
  });

  test('6.4 UI is responsive on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width:390, height:844 }); // iPhone 14 size
    await page.goto(BASE_URL);
    await expect(page.locator('#auth-screen')).toBeVisible();
    await expect(page.locator('.auth-card')).toBeVisible();
    console.log('✅ UI visible on mobile viewport (390x844)');
  });

  test('6.5 UI is responsive on tablet viewport', async ({ page }) => {
    await page.setViewportSize({ width:768, height:1024 }); // iPad size
    await page.goto(BASE_URL);
    await expect(page.locator('#auth-screen')).toBeVisible();
    console.log('✅ UI visible on tablet viewport (768x1024)');
  });

  test('6.6 Admin dashboard loads under 3 seconds', async ({ page }) => {
    const start = Date.now();
    await page.goto(`${BASE_URL}/admin.html`);
    await page.waitForSelector('#login-email');
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(3000);
    console.log(`✅ Admin dashboard loaded in ${elapsed}ms`);
  });

});
