const { scoreRepository, scoreBusiness, scorePackaging, scoreJapanGap, scoreMaintenance, detectReadmeLanguage } = require('../src/services/scorer');

describe('Scorer', () => {
  const baseRepo = {
    github_id: 1,
    full_name: 'test/repo',
    name: 'repo',
    description: 'A test CRM system',
    stars: 5000,
    forks: 1500,
    license: 'MIT',
    language: 'JavaScript',
    last_updated: new Date().toISOString(),
    topics: '["crm","saas"]',
    readme_excerpt: 'A complete CRM solution with dashboard and reporting',
    has_docker: 1,
    has_ui: 1,
    has_docs: 1,
    open_issues: 50,
    closed_issues: 200,
    category: 'CRM',
  };

  // Test 1: Total score is 0-100
  test('total score should be between 0 and 100', () => {
    const scores = scoreRepository(baseRepo);
    expect(scores.total).toBeGreaterThanOrEqual(0);
    expect(scores.total).toBeLessThanOrEqual(100);
  });

  // Test 2: Business score max 30
  test('business score should not exceed 30', () => {
    const score = scoreBusiness(baseRepo);
    expect(score).toBeLessThanOrEqual(30);
    expect(score).toBeGreaterThan(0);
  });

  // Test 3: Packaging score max 25
  test('packaging score should not exceed 25', () => {
    const score = scorePackaging(baseRepo);
    expect(score).toBeLessThanOrEqual(25);
  });

  // Test 4: High-star repo gets higher business score
  test('high-star repo should score higher in business', () => {
    const lowStar = scoreBusiness({ ...baseRepo, stars: 200 });
    const highStar = scoreBusiness({ ...baseRepo, stars: 10000 });
    expect(highStar).toBeGreaterThan(lowStar);
  });

  // Test 5: Docker + UI gives higher packaging score
  test('repo with docker and UI should score higher in packaging', () => {
    const withAll = scorePackaging({ ...baseRepo, has_docker: 1, has_ui: 1, has_docs: 1 });
    const withNone = scorePackaging({ ...baseRepo, has_docker: 0, has_ui: 0, has_docs: 0 });
    expect(withAll).toBeGreaterThan(withNone);
  });

  // Test 6: Japanese content lowers japan gap score
  test('repo with Japanese content should have lower japan gap score', () => {
    const english = scoreJapanGap(baseRepo);
    const japanese = scoreJapanGap({ ...baseRepo, description: 'CRMシステム', readme_excerpt: '日本語対応のCRM' });
    expect(english).toBeGreaterThan(japanese);
  });

  // Test 7: Recently updated repo scores higher in maintenance
  test('recently updated repo should score higher in maintenance', () => {
    const recent = scoreMaintenance({ ...baseRepo, last_updated: new Date().toISOString() });
    const old = scoreMaintenance({ ...baseRepo, last_updated: '2023-01-01T00:00:00Z' });
    expect(recent).toBeGreaterThan(old);
  });

  // Test 8: High-demand Japan categories score higher
  test('high-demand Japan category should score higher in japan gap', () => {
    const highDemand = scoreJapanGap({ ...baseRepo, category: '予約システム' });
    const lowDemand = scoreJapanGap({ ...baseRepo, category: 'アンケート' });
    expect(highDemand).toBeGreaterThan(lowDemand);
  });

  // Test 9: SaaS-friendly language scores higher
  test('JavaScript should score higher than obscure language in packaging', () => {
    const js = scorePackaging({ ...baseRepo, language: 'JavaScript' });
    const other = scorePackaging({ ...baseRepo, language: 'Fortran' });
    expect(js).toBeGreaterThan(other);
  });

  // Test 10: Score components sum to total (capped at 100)
  test('score components should sum to total (capped at 100)', () => {
    const scores = scoreRepository(baseRepo);
    const rawSum = scores.business + scores.packaging + scores.japanGap + scores.maintenance;
    expect(scores.total).toBe(Math.min(100, rawSum));
  });

  // Test 11: Japan gap max 40 (with language bonus)
  test('japan gap score should not exceed 40', () => {
    const chineseRepo = {
      ...baseRepo,
      description: '这是一个完整的客户关系管理系统，支持多种功能',
      readme_excerpt: '这是一个开源的客户管理系统，包含仪表板和报告功能',
      category: '予約システム',
    };
    const score = scoreJapanGap(chineseRepo);
    expect(score).toBeLessThanOrEqual(40);
  });

  // Test 12: Maintenance max 20
  test('maintenance score should not exceed 20', () => {
    const score = scoreMaintenance(baseRepo);
    expect(score).toBeLessThanOrEqual(20);
  });

  // Test 13: Chinese README gets language bonus
  test('Chinese README repo should get higher japan gap score', () => {
    const englishRepo = scoreJapanGap(baseRepo);
    const chineseRepo = scoreJapanGap({
      ...baseRepo,
      description: '这是一个完整的客户关系管理系统，支持多种功能',
      readme_excerpt: '这是一个开源的客户管理系统，包含仪表板和报告功能',
    });
    expect(chineseRepo).toBeGreaterThan(englishRepo);
  });

  // Test 14: Russian README gets language bonus
  test('Russian README repo should get higher japan gap score', () => {
    const englishRepo = scoreJapanGap(baseRepo);
    const russianRepo = scoreJapanGap({
      ...baseRepo,
      description: 'Система управления клиентами с полной поддержкой',
      readme_excerpt: 'Открытая система управления бизнесом',
    });
    expect(russianRepo).toBeGreaterThan(englishRepo);
  });

  // Test 15: detectReadmeLanguage identifies Chinese
  test('detectReadmeLanguage should detect Chinese', () => {
    const lang = detectReadmeLanguage({
      description: '这是一个完整的客户关系管理系统',
      readme_excerpt: '支持多种功能的开源系统',
    });
    expect(lang).toBe('Chinese');
  });

  // Test 16: detectReadmeLanguage identifies Russian
  test('detectReadmeLanguage should detect Russian', () => {
    const lang = detectReadmeLanguage({
      description: 'Система управления клиентами',
      readme_excerpt: 'Открытая система управления',
    });
    expect(lang).toBe('Russian');
  });

  // Test 17: detectReadmeLanguage identifies English
  test('detectReadmeLanguage should detect English', () => {
    const lang = detectReadmeLanguage({
      description: 'A complete CRM system',
      readme_excerpt: 'Open source customer management',
    });
    expect(lang).toBe('English');
  });

  // Test 18: detectReadmeLanguage distinguishes Japanese from Chinese
  test('detectReadmeLanguage should detect Japanese (not Chinese)', () => {
    const lang = detectReadmeLanguage({
      description: 'CRMシステム',
      readme_excerpt: '日本語対応のオープンソースCRM',
    });
    expect(lang).toBe('Japanese');
  });
});
