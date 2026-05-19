import { Controller, Get, Logger } from '@nestjs/common';
import * as Sentry from "@sentry/nestjs";
import { trace, SpanStatusCode } from '@opentelemetry/api';

@Controller()
export class AppController {
  private readonly logger = new Logger(AppController.name);

  @Get()
  getHello(): string {
    return 'Hello from NestJS Railway Observability!';
  }

  @Get('data')
  getData() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Healthcheck endpoint with simulated debug logs
   */
  @Get('health/live')
  healthLive() {
    this.logger.debug('This is a massive error that OTel will catch!');
    Sentry.logger.info('User triggered test log', { action: 'test_log' });
    return { status: 'alive' };
  }

  /**
   * Latency simulator endpoint (2-second delay)
   */
  @Get('health/slow')
  async healthSlow() {
    await new Promise(resolve => setTimeout(resolve, 2000));
    Sentry.logger.warn('User triggered test warn log', { action: 'test_log' });
    this.logger.warn('This is a massive warn that OTel will catch!');
    return { status: 'slow', delay: '2s' };
  }

  /**
   * Error simulator endpoint that throws an unhandled exception
   */
  @Get('health/error')
  healthError() {
    this.logger.error('This is a massive error that OTel will catch!');
    Sentry.logger.error('User triggered test error log', { action: 'test_log' });
    throw new Error('Test error for observability!');
  }

  /**
   * Simulated Complex Microservice Endpoint
   * Models cache lookups, database queries with index issues, and downstream network timeouts
   * to demonstrate full distributed tracing waterfalls in Grafana Tempo.
   */
  @Get('api/orders/report')
  async getOrdersReport() {
    const tracer = trace.getTracer('microservice-test-tracer');

    // Create the parent request span
    return await tracer.startActiveSpan('HTTP GET /api/orders/report', async (parentSpan) => {
      try {
        this.logger.log('Executing Orders Report aggregation...');
        parentSpan.setAttribute('http.method', 'GET');
        parentSpan.setAttribute('http.route', '/api/orders/report');

        // --- STAGE 1: Check Redis Cache (Fast Span - Cache Miss) ---
        await tracer.startActiveSpan('Redis GET report_cache_key', async (span) => {
          span.setAttribute('db.system', 'redis');
          span.setAttribute('redis.key', 'report_orders_2026_q2');
          
          await new Promise(resolve => setTimeout(resolve, 10)); // 10ms quick check
          
          span.setAttribute('redis.result', 'miss');
          span.addEvent('cache_miss_triggering_database_fallback');
          span.end();
        });

        // --- STAGE 2: Slow SQL Query (Simulates a missing database index on join tables) ---
        await tracer.startActiveSpan('PostgreSQL SELECT order_details', async (span) => {
          span.setAttribute('db.system', 'postgresql');
          span.setAttribute('db.name', 'production_db');
          span.setAttribute('db.statement', 'SELECT o.id, o.total, u.email, p.status FROM orders o INNER JOIN users u ON o.user_id = u.id INNER JOIN payments p ON o.payment_id = p.id WHERE o.created_at > NOW() - INTERVAL \'30 days\'');
          
          this.logger.warn('Slow query detected: SELECT order_details takes too long due to missing index on orders.payment_id');
          await new Promise(resolve => setTimeout(resolve, 550)); // Slow 550ms database latency
          
          span.setAttribute('db.rows_returned', 1420);
          span.addEvent('db_rows_fetched');
          span.end();
        });

        // --- STAGE 3: Downstream Partner API Outage simulation (unstable network / 504 timeout) ---
        await tracer.startActiveSpan('External HTTP Client: GET partners.api.com/currency/convert', async (span) => {
          span.setAttribute('http.url', 'https://partners.api.com/currency/convert');
          span.setAttribute('http.method', 'GET');
          
          // Downstream latency (taking 600ms)
          await new Promise(resolve => setTimeout(resolve, 600));

          // 25% chance of downstream service throwing a 504 Gateway Timeout
          const isTimeout = Math.random() > 0.75;

          if (isTimeout) {
            span.setAttribute('http.status_code', 504);
            span.setStatus({
              code: SpanStatusCode.ERROR,
              message: 'HTTP 504: Gateway Timeout from partners.api.com'
            });
            span.addEvent('network_timeout_occurred');
            span.end();
            throw new Error('Downstream Currency API failed to respond within timeout limits.');
          } else {
            span.setAttribute('http.status_code', 200);
            span.setStatus({ code: SpanStatusCode.OK });
            span.addEvent('exchange_rates_synced');
            span.end();
          }
        });

        this.logger.log('Report generated successfully!');
        parentSpan.setStatus({ code: SpanStatusCode.OK });
        return {
          status: 'success',
          data: {
            orders_processed: 1420,
            currency: 'EUR',
            total_sales: 284000.00
          },
          traceId: parentSpan.spanContext().traceId
        };

      } catch (error) {
        // Record details on the parent trace span
        parentSpan.setStatus({
          code: SpanStatusCode.ERROR,
          message: error.message
        });
        parentSpan.recordException(error);
        
        // Log the failure to Loki
        this.logger.error(`Failed to compile orders report: ${error.message}`);
        
        // Send the stack trace to Sentry
        Sentry.captureException(error);

        return {
          status: 'error',
          error: error.message,
          reasons: [
            'Database latency took 550ms.',
            'Downstream Gateway Timeout (504).'
          ],
          traceId: parentSpan.spanContext().traceId
        };
      } finally {
        parentSpan.end();
      }
    });
  }
}
