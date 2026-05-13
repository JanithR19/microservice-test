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
import * as dotenv from "dotenv";
import * as Sentry from "@sentry/nestjs";
import { nodeProfilingIntegration } from "@sentry/profiling-node";

dotenv.config();

Sentry.init({
  dsn: process.env.SENTRY_DSN, // Add this to your Railway Variables
  integrations: [
    nodeProfilingIntegration(),
  ],
  // Performance Monitoring
  tracesSampleRate: 1.0, // Capture 100% of the transactions
  // Set sampling rate for profiling - this is relative to tracesSampleRate
  profilesSampleRate: 1.0,
});

// Standard OTel Environment Variables
const serviceName = process.env.APP_NAME || 'microservice-test';
process.env.OTEL_SERVICE_NAME = serviceName; 
process.env.OTEL_RESOURCE_ATTRIBUTES = `service.name=${serviceName},service.version=1.0.0`;

const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318';

// Initialize OpenTelemetry SDK
export const otelSDK = new NodeSDK({
  resource: resourceFromAttributes({
    [ATTR_SERVICE_NAME]: serviceName,
    [ATTR_SERVICE_VERSION]: '1.0.0',
  }),
  // Traces to Alloy/Grafana
  traceExporter: new OTLPTraceExporter({
    url: `${otlpEndpoint}/v1/traces`,
  }),
  // Metrics to Alloy/Grafana
  metricReader: new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter({
      url: `${otlpEndpoint}/v1/metrics`,
    }),
  }),
  // Logs to Alloy/Grafana
  logRecordProcessor: new BatchLogRecordProcessor(
    new OTLPLogExporter({
      url: `${otlpEndpoint}/v1/logs`,
    }),
  ),
  instrumentations: [
    getNodeAutoInstrumentations(),
    new PinoInstrumentation({
      logHook: (span, record) => {
        record['trace_id'] = span.spanContext().traceId;
        record['span_id'] = span.spanContext().spanId;
      },
    }),
  ],
});

// Start the OTEL SDK
otelSDK.start();

// Start host metrics collection
const hostMetrics = new HostMetrics({
  meterProvider: metrics.getMeterProvider(),
  name: `${serviceName}-host-metrics`,
});
hostMetrics.start();

// Graceful Shutdown
process.on('SIGTERM', () => {
  otelSDK.shutdown()
    .then(() => console.log('[OTEL] SDK shut down successfully'))
    .catch((error) => console.log('[OTEL] Error shutting down SDK', error))
    .finally(() => process.exit(0));
});
