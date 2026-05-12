import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { BatchLogRecordProcessor } from '@opentelemetry/sdk-logs';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { PinoInstrumentation } from '@opentelemetry/instrumentation-pino';
import { metrics } from '@opentelemetry/api';
import { HostMetrics } from '@opentelemetry/host-metrics';
import * as dotenv from 'dotenv';

dotenv.config();

const DEFAULT_OTLP_ENDPOINT = 'http://localhost:4318';

function buildOtlpUrl(specific?: string, base?: string, suffix = ''): string {
  // Use specific endpoint if provided
  if (specific && specific.length > 0) return specific;
  const b = (base && base.length > 0) ? base : DEFAULT_OTLP_ENDPOINT;
  // Normalize signal-specific OTLP endpoint if base already has /v1/<signal>
  if (/\/v1\/(traces|metrics|logs)\/?$/.test(b)) {
    return b.replace(/\/v1\/(traces|metrics|logs)\/?$/, suffix);
  }
  // If base already ends with requested suffix, return as-is
  if (b.endsWith(suffix)) return b;
  return b.replace(/\/$/, '') + suffix;
}

const serviceName = process.env.OTEL_SERVICE_NAME || process.env.APP_NAME || 'microservice-test';
const otlpBase = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || process.env.OTEL_EXPORTER_OTLP || DEFAULT_OTLP_ENDPOINT;

const tracesUrl = buildOtlpUrl(process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT, otlpBase, '/v1/traces');
const metricsUrl = buildOtlpUrl(process.env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT, otlpBase, '/v1/metrics');
const logsUrl = buildOtlpUrl(process.env.OTEL_EXPORTER_OTLP_LOGS_ENDPOINT, otlpBase, '/v1/logs');

// 1. Initialize OpenTelemetry SDK (vendor-neutral OTLP/HTTP exporters)
export const otelSDK = new NodeSDK({
  resource: resourceFromAttributes({
    [ATTR_SERVICE_NAME]: serviceName,
    [ATTR_SERVICE_VERSION]: process.env.APP_VERSION || '1.0.0',
  }),
  traceExporter: new OTLPTraceExporter({ url: tracesUrl }),
  metricReader: new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter({ url: metricsUrl }),
  }),
  logRecordProcessor: new BatchLogRecordProcessor(
    new OTLPLogExporter({ url: logsUrl }),
  ),
  instrumentations: [
    getNodeAutoInstrumentations(),
    new PinoInstrumentation({
      logHook: (span, record) => {
        try {
          record['trace_id'] = span.spanContext().traceId;
          record['span_id'] = span.spanContext().spanId;
        } catch {
          // noop if span is not available
        }
      },
    }),
  ],
});

// Start the OTEL SDK
otelSDK.start();

// 1.5 Start host metrics collection
const hostMetrics = new HostMetrics({
  meterProvider: metrics.getMeterProvider(),
  name: `${serviceName}-host-metrics`,
});
hostMetrics.start();

// 2. Graceful Shutdown (Critical for Railway restarts)
const shutdown = () => {
  otelSDK.shutdown()
    .then(() => console.log('[OTEL] SDK shut down successfully'))
    .catch((error) => console.log('[OTEL] Error shutting down SDK', error))
    .finally(() => process.exit(0));
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
