const Database = require('better-sqlite3');

// Mock database before requiring modules
const TEST_DB_PATH = ':memory:';
process.env.DB_PATH = TEST_DB_PATH;
process.env.NODE_ENV = 'test';

const { initTables } = require('../src/models/database');
const Repository = require('../src/models/repository');
const { getDb, closeDb } = require('../src/models/database');

describe('Repository Model & API', () => {
  beforeAll(() => {
    // Ensure DB is initialized
    getDb();
  });

  afterAll(() => {
    closeDb();
  });

  const sampleRepo = {
    github_id: 12345,
    full_name: 'test/sample-crm',
    name: 'sample-crm',
    description: 'A sample CRM application',
    stars: 3000,
    forks: 500,
    license: 'MIT',
    language: 'TypeScript',
    last_updated: '2026-03-10T00:00:00Z',
    topics: '["crm","saas"]',
    readme_excerpt: 'Complete CRM with dashboard',
    has_docker: 1,
    has_ui: 1,
    has_docs: 1,
    open_issues: 30,
    closed_issues: 100,
    category: 'CRM',
    readme_lang: 'English',
    japanese_summary: '顧客管理システム【売れる理由】一定の利用実績あり、UI付きですぐSaaS化可能',
    score_business: 25,
    score_packaging: 20,
    score_japan_gap: 22,
    score_maintenance: 15,
    score_total: 82,
  };

  // Test 1: Upsert creates new record
  test('upsert should create a new repository', () => {
    const result = Repository.upsert(sampleRepo);
    expect(result.changes).toBe(1);
  });

  // Test 2: Find by GitHub ID
  test('findByGithubId should return the repo', () => {
    const repo = Repository.findByGithubId(12345);
    expect(repo).toBeTruthy();
    expect(repo.full_name).toBe('test/sample-crm');
  });

  // Test 3: Find all with default params
  test('findAll should return repos', () => {
    const repos = Repository.findAll();
    expect(repos.length).toBeGreaterThanOrEqual(1);
  });

  // Test 4: Count
  test('count should return correct number', () => {
    const count = Repository.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  // Test 5: Filter by category
  test('findAll with category filter should work', () => {
    const repos = Repository.findAll({ category: 'CRM' });
    expect(repos.every(r => r.category === 'CRM')).toBe(true);
  });

  // Test 6: Update status
  test('updateStatus should change the status', () => {
    const repo = Repository.findByGithubId(12345);
    Repository.updateStatus(repo.id, 'in_progress');
    const updated = Repository.findById(repo.id);
    expect(updated.status).toBe('in_progress');
  });

  // Test 7: Invalid status should throw
  test('updateStatus with invalid status should throw', () => {
    const repo = Repository.findByGithubId(12345);
    expect(() => Repository.updateStatus(repo.id, 'invalid')).toThrow('Invalid status');
  });

  // Test 8: Upsert updates existing record
  test('upsert should update existing repo on conflict', () => {
    const updated = { ...sampleRepo, stars: 5000, score_total: 90 };
    Repository.upsert(updated);
    const repo = Repository.findByGithubId(12345);
    expect(repo.stars).toBe(5000);
  });

  // Test 9: getStats returns proper structure
  test('getStats should return stats object', () => {
    const stats = Repository.getStats();
    expect(stats).toHaveProperty('total');
    expect(stats).toHaveProperty('newToday');
    expect(stats).toHaveProperty('avgScore');
    expect(stats).toHaveProperty('byCategory');
    expect(stats).toHaveProperty('byLanguage');
  });

  // Test 10: getTopN returns correct number
  test('getTopN should return up to N repos', () => {
    // Add a second repo
    Repository.upsert({
      ...sampleRepo,
      github_id: 99999,
      full_name: 'test/another',
      name: 'another',
      score_total: 50,
    });
    const top = Repository.getTopN(1);
    expect(top.length).toBe(1);
    expect(top[0].score_total).toBeGreaterThanOrEqual(50);
  });

  // Test 11: CSV export
  test('exportCsv should return all repos sorted by score', () => {
    const csv = Repository.exportCsv();
    expect(csv.length).toBeGreaterThanOrEqual(2);
    // Should be sorted by score descending
    for (let i = 1; i < csv.length; i++) {
      expect(csv[i - 1].score_total).toBeGreaterThanOrEqual(csv[i].score_total);
    }
  });

  // Test 12: Filter by readmeLang
  test('findAll with readmeLang filter should work', () => {
    Repository.upsert({
      ...sampleRepo,
      github_id: 88888,
      full_name: 'test/chinese-repo',
      name: 'chinese-repo',
      readme_lang: 'Chinese',
      score_total: 75,
    });
    const repos = Repository.findAll({ readmeLang: 'Chinese' });
    expect(repos.length).toBeGreaterThanOrEqual(1);
    expect(repos.every(r => r.readme_lang === 'Chinese')).toBe(true);
  });

  // Test 13: Count with readmeLang filter
  test('count with readmeLang filter should work', () => {
    const count = Repository.count({ readmeLang: 'English' });
    expect(count).toBeGreaterThanOrEqual(1);
  });
});
