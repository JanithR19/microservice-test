/**
 * @deprecated
 * This file is legacy and is NOT active. 
 * The production-grade OpenTelemetry configuration is housed in 'instrument.ts'.
 * Do not import this file in 'main.ts'.
 */

import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';

const sdk = new NodeSDK({
  resource: resourceFromAttributes({
    [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME || 'nest-microservice-test',
  }),
  traceExporter: new OTLPTraceExporter({
    // Use /v1/traces for OTLP/HTTP
    url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318/v1/traces',
  }),
  instrumentations: [getNodeAutoInstrumentations()],
});

export default sdk;
