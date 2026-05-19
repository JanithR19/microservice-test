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
import * as dotenv from "dotenv";

import { nodeProfilingIntegration } from "@sentry/profiling-node";

dotenv.config();

// Standard OTel Environment Variables
const serviceName = process.env.APP_NAME || 'microservice-test';
process.env.OTEL_SERVICE_NAME = serviceName; 
process.env.OTEL_RESOURCE_ATTRIBUTES = `service.name=${serviceName},service.version=1.0.0`;

import { NodeSDK } from '@opentelemetry/sdk-node';
import * as Sentry from "@sentry/nestjs";

const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318';

/**
 * OpenTelemetry Node SDK Initialization
 * Handles automatic instrumentation collection and distribution of:
 * - Traces (to Grafana Tempo)
 * - Metrics (to Grafana Prometheus)
 * - Logs (to Grafana Loki via Pino)
 */
export const otelSDK = new NodeSDK({
  resource: resourceFromAttributes({
    [ATTR_SERVICE_NAME]: serviceName,
    [ATTR_SERVICE_VERSION]: '1.0.0',
  }),
  // 1. Traces Target
  traceExporter: new OTLPTraceExporter({
    url: `${otlpEndpoint}/v1/traces`,
  }),
  // 2. Metrics Target
  metricReader: new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter({
      url: `${otlpEndpoint}/v1/metrics`,
    }),
  }),
  // 3. Logs Target
  logRecordProcessor: new BatchLogRecordProcessor(
    new OTLPLogExporter({
      url: `${otlpEndpoint}/v1/logs`,
    }),
  ),
  instrumentations: [
    getNodeAutoInstrumentations(),
    // Log Correlation: Injects current trace/span ID directly into pino log parameters
    new PinoInstrumentation({
      logHook: (span, record) => {
        record['trace_id'] = span.spanContext().traceId;
        record['span_id'] = span.spanContext().spanId;
      },
    }),
  ],
});

// Start the OpenTelemetry Collector Client
otelSDK.start();

/**
 * Sentry Error Reporting & Performance Profiling Setup
 * Note: Must be initialized AFTER OpenTelemetry to hook into OTel's trace context.
 */
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  integrations: [
    nodeProfilingIntegration(),
    Sentry.consoleLoggingIntegration({ levels: ["log", "warn", "error"] }),
  ],
  enableLogs: true,
  tracesSampleRate: 1.0, 
  profilesSampleRate: 1.0,
});

// Start collecting NodeJS process host metrics
const hostMetrics = new HostMetrics({
  meterProvider: metrics.getMeterProvider(),
  name: `${serviceName}-host-metrics`,
});
hostMetrics.start();

// Handle graceful container shutdown requests (SIGTERM)
process.on('SIGTERM', () => {
  otelSDK.shutdown()
    .then(() => console.log('[OTEL] SDK shut down successfully'))
    .catch((error) => console.log('[OTEL] Error shutting down SDK', error))
    .finally(() => process.exit(0));
});
