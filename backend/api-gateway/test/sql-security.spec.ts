import { AppService } from '../src/app.service';
import { DatasourceCryptoService } from '../src/common/crypto/datasource-crypto.service';

describe('SQL Security & Semantic AST Guard (validateSemanticSql)', () => {
  let appService: AppService;

  const mockSemanticLayer: any = {
    tables: [
      {
        technicalName: 'public.fact_sales',
        businessName: 'Ventes',
        columns: [
          { technicalName: 'id', businessName: 'Identifiant' },
          { technicalName: 'amount', businessName: 'Montant Vente' },
          { technicalName: 'store_id', businessName: 'Magasin' },
          { technicalName: 'created_at', businessName: 'Date Vente' }
        ]
      }
    ],
    kpis: [
      { name: 'Revenue', formula: 'SUM(amount)' }
    ]
  };

  beforeEach(() => {
    const mockDatabase = { getHealth: jest.fn(), dbReady: false } as any;
    const mockCrypto = new DatasourceCryptoService();
    const mockConnection = {} as any;
    const mockMemory = {} as any;
    const mockResolver = {} as any;

    appService = new AppService(
      mockDatabase,
      mockCrypto,
      mockConnection,
      mockMemory,
      mockResolver
    );
  });

  const validate = (sql: string) => {
    return (appService as any).validateSemanticSql(sql, mockSemanticLayer);
  };

  it('should accept a valid semantic SELECT query with LIMIT clause', () => {
    const sql = 'SELECT store_id, SUM(amount) AS revenue FROM public.fact_sales GROUP BY store_id LIMIT 100';
    const result = validate(sql);
    expect(result.ok).toBe(true);
    expect(result.referencedTables).toContain('public.fact_sales');
    expect(result.referencedColumns).toContain('store_id');
    expect(result.referencedColumns).toContain('amount');
  });

  it('should reject queries missing a LIMIT clause (protect against unbounded result sets)', () => {
    const sqlWithoutLimit = 'SELECT store_id, SUM(amount) AS revenue FROM public.fact_sales GROUP BY store_id';
    const result = validate(sqlWithoutLimit);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('SQL must include LIMIT.');
  });

  it('should reject destructive non-SELECT statements (INSERT/UPDATE/DELETE/DROP)', () => {
    const dropSql = 'DROP TABLE public.fact_sales';
    const dropResult = validate(dropSql);
    expect(dropResult.ok).toBe(false);
    expect(dropResult.reason).toContain('Only SELECT statements are allowed');

    const deleteSql = 'DELETE FROM public.fact_sales WHERE id = 1';
    const deleteResult = validate(deleteSql);
    expect(deleteResult.ok).toBe(false);
    expect(deleteResult.reason).toContain('Only SELECT statements are allowed');
  });

  it('should reject SQL queries containing comments (injection bypass prevention)', () => {
    const sqlWithComment = 'SELECT amount FROM public.fact_sales -- bypass comments LIMIT 10';
    const result = validate(sqlWithComment);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('SQL comments are not allowed');
  });

  it('should reject multi-statement query batching (semicolon injection)', () => {
    const multiSql = 'SELECT amount FROM public.fact_sales LIMIT 10; SELECT * FROM app_users;';
    const result = validate(multiSql);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('Multiple SQL statements are not allowed');
  });

  it('should reject SELECT * wildcard queries (enforce column projection)', () => {
    const starSql = 'SELECT * FROM public.fact_sales LIMIT 10';
    const result = validate(starSql);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('SELECT * is not allowed');
  });

  it('should reject queries with subqueries in analytics mode', () => {
    const subquerySql = 'SELECT amount FROM (SELECT amount FROM public.fact_sales) AS sub LIMIT 10';
    const result = validate(subquerySql);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('Subqueries are not allowed');
  });

  it('should reject access to unauthorized or undeclared tables', () => {
    const unauthorizedSql = 'SELECT password_hash FROM app_users LIMIT 10';
    const result = validate(unauthorizedSql);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('references unknown table');
  });
});
