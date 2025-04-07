// instrumentation.js
const { NodeSDK } = require("@opentelemetry/sdk-node");
const {
  getNodeAutoInstrumentations,
} = require("@opentelemetry/auto-instrumentations-node");
const {
  OTLPTraceExporter,
} = require("@opentelemetry/exporter-trace-otlp-http");
const {
  OTLPMetricExporter,
} = require("@opentelemetry/exporter-metrics-otlp-http");
const { OTLPLogExporter } = require("@opentelemetry/exporter-logs-otlp-http");
const { Resource } = require("@opentelemetry/resources");
const {
  SemanticResourceAttributes,
} = require("@opentelemetry/semantic-conventions");
const { PeriodicExportingMetricReader } = require("@opentelemetry/sdk-metrics");
const { BatchLogRecordProcessor } = require("@opentelemetry/sdk-logs");

// ---- Configuration ----
// Le nom de ton service, apparaîtra dans Grafana/Tempo etc.
const SERVICE_NAME = process.env.OTEL_SERVICE_NAME || "ernesto-api";
// L'endpoint OTLP où la stack LGTM écoute (sera défini dans docker-compose)
const OTEL_EXPORTER_OTLP_ENDPOINT =
  process.env.OTEL_EXPORTER_OTLP_ENDPOINT || "http://localhost:4318";

// Créer une ressource pour identifier ce service
const resource = new Resource({
  [SemanticResourceAttributes.SERVICE_NAME]: SERVICE_NAME,
  // Ajoute d'autres attributs si nécessaire (version, environnement, etc.)
  // [SemanticResourceAttributes.SERVICE_VERSION]: '1.0.0',
});

// Configurer l'exportateur de Traces
const traceExporter = new OTLPTraceExporter({
  url: `${OTEL_EXPORTER_OTLP_ENDPOINT}/v1/traces`,
});

// Configurer l'exportateur de Métriques
const metricExporter = new OTLPMetricExporter({
  url: `${OTEL_EXPORTER_OTLP_ENDPOINT}/v1/metrics`,
});
const metricReader = new PeriodicExportingMetricReader({
  exporter: metricExporter,
  exportIntervalMillis: 10000, // Exporte toutes les 10 secondes
});

// Configurer l'exportateur de Logs
const logExporter = new OTLPLogExporter({
  url: `${OTEL_EXPORTER_OTLP_ENDPOINT}/v1/logs`,
});
const logRecordProcessor = new BatchLogRecordProcessor(logExporter);

// Configurer le SDK Node OpenTelemetry
const sdk = new NodeSDK({
  resource: resource,
  traceExporter: traceExporter,
  metricReader: metricReader, // Utiliser metricReader au lieu de metricExporter directement
  logRecordProcessor: logRecordProcessor,
  instrumentations: [
    getNodeAutoInstrumentations({
      // Désactiver certaines instrumentations si elles posent problème
      // '@opentelemetry/instrumentation-fs': { enabled: false },

      // Configuration spécifique pour certaines instrumentations
      "@opentelemetry/instrumentation-http": {
        // Enrichir les spans HTTP avec les headers/body (attention à la sensibilité des données)
        // requestHook: (span, request) => {},
        // responseHook: (span, response) => {},
      },
      "@opentelemetry/instrumentation-express": {
        // hook: (span, info) => { /* ... */ }
      },
      "@opentelemetry/instrumentation-mongoose": {
        // hook: (span, info) => { /* ... */ }
        // dbStatementSerializer: (cmdName, cmd) => JSON.stringify(cmd) // Pour voir les requêtes (attention perf/sécu)
      },
    }),
  ],
  // Vous pouvez ajouter des SpanProcessors, etc. ici si besoin
  // spanProcessor: new SimpleSpanProcessor(traceExporter), // Ou BatchSpanProcessor pour prod
});

// Démarrer le SDK
sdk.start();
console.log(
  `OpenTelemetry SDK démarré pour le service: ${SERVICE_NAME}, exportant vers ${OTEL_EXPORTER_OTLP_ENDPOINT}`
);

// Gérer l'arrêt propre du SDK lors de la fermeture de l'application
process.on("SIGTERM", () => {
  sdk
    .shutdown()
    .then(() => console.log("OpenTelemetry SDK arrêté."))
    .catch((error) =>
      console.error("Erreur lors de l'arrêt de l'OpenTelemetry SDK:", error)
    )
    .finally(() => process.exit(0));
});
