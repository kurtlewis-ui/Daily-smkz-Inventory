import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';

@Injectable()
export class AppService {
  constructor(private prisma: PrismaService) {}

  async getHealth() {
    const services: Record<string, string> = { database: 'unknown' };
    let status = 'healthy';

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      services.database = 'healthy';
    } catch {
      services.database = 'unreachable';
      return {
        status: 'unhealthy',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        services,
        hint: 'Cannot connect to PostgreSQL. Check that it is running and DATABASE_URL is correct.',
      };
    }

    // Connection works — verify the schema has been migrated by touching a
    // table the app depends on. A missing table/column means migrations are
    // pending, which is the usual cause of "database error" on every page.
    try {
      await this.prisma.role.count();
      services.schema = 'ready';
    } catch {
      status = 'unhealthy';
      services.schema = 'migrations_pending';
      return {
        status,
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        services,
        hint: 'Database schema is out of date. Run `npx prisma migrate deploy` in the backend folder, then `npm run prisma:seed`.',
      };
    }

    return {
      status,
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      services,
    };
  }

  getVersion() {
    return {
      version: '1.0.0',
      apiVersion: 'v1',
      buildDate: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
    };
  }

  /**
   * TEMPORARY diagnostic. Times DB round-trips FROM INSIDE the backend so we can
   * separate three costs that add up to the observed multi-second saves:
   *   - one simple round-trip (SELECT 1): pure server<->Supabase network + query
   *   - a representative read (role.count): a real table read
   *   - a tiny interactive transaction: shows per-statement pooler overhead
   * Compare these server-side numbers against the browser-side perf-check total
   * to see how much time is the browser->Render leg vs Render->Supabase.
   */
  async getDbTiming() {
    const ms = async (fn: () => Promise<unknown>) => {
      const t = process.hrtime.bigint();
      await fn();
      return +(Number(process.hrtime.bigint() - t) / 1e6).toFixed(1);
    };

    // Warm-up (first query may pay a lazy connect); not counted.
    await this.prisma.$queryRaw`SELECT 1`.catch(() => undefined);

    // 5 sequential simple round-trips — the clearest measure of one hop.
    const select1: number[] = [];
    for (let i = 0; i < 5; i++) {
      select1.push(await ms(() => this.prisma.$queryRaw`SELECT 1`));
    }

    // A real single-table read.
    const roleCount = await ms(() => this.prisma.role.count());

    // A tiny interactive transaction (2 statements) — mimics how writes run and
    // exposes any per-statement overhead through the transaction pooler.
    const txTwoStatements = await ms(() =>
      this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT 1`;
        await tx.$queryRaw`SELECT 1`;
      }),
    );

    const avg = +(select1.reduce((a, b) => a + b, 0) / select1.length).toFixed(1);

    return {
      note: 'Times measured INSIDE the backend (Render -> Supabase -> back).',
      select1_each_ms: select1,
      select1_avg_ms: avg,
      roleCount_ms: roleCount,
      transaction_2_statements_ms: txTwoStatements,
      interpretation:
        'If select1_avg is ~100-200ms it is cross-region network (Singapore<->Tokyo). ' +
        'If it is <20ms the DB path is fine and the slowness is elsewhere (browser->Render, or many round-trips). ' +
        'transaction_2_statements much larger than 2x select1 points to transaction-pooler overhead.',
    };
  }
}
