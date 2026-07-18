import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const envPath = path.join(projectRoot, ".env");

const DEFAULT_EVENTS = [
  "PAYMENT_CREATED",
  "PAYMENT_AWAITING_RISK_ANALYSIS",
  "PAYMENT_APPROVED_BY_RISK_ANALYSIS",
  "PAYMENT_REPROVED_BY_RISK_ANALYSIS",
  "PAYMENT_AUTHORIZED",
  "PAYMENT_UPDATED",
  "PAYMENT_CONFIRMED",
  "PAYMENT_RECEIVED",
  "PAYMENT_OVERDUE",
  "PAYMENT_DELETED",
  "PAYMENT_RESTORED",
  "PAYMENT_REFUNDED",
  "PAYMENT_PARTIALLY_REFUNDED",
  "PAYMENT_CHARGEBACK_REQUESTED",
  "PAYMENT_CHARGEBACK_DISPUTE",
  "PAYMENT_AWAITING_CHARGEBACK_REVERSAL",
  "PAYMENT_DUNNING_REQUESTED",
  "PAYMENT_DUNNING_RECEIVED",
  "PAYMENT_BANK_SLIP_VIEWED",
  "PAYMENT_CHECKOUT_VIEWED",
];

function parseEnvFile(contents) {
  const parsed = {};

  for (const rawLine of contents.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    value = value.replace(/\\\$/gu, "$");
    parsed[key] = value;
  }

  return parsed;
}

function getArgValue(flagName) {
  const index = process.argv.indexOf(flagName);
  if (index === -1) {
    return null;
  }

  return process.argv[index + 1] ?? null;
}

function hasArg(flagName) {
  return process.argv.includes(flagName);
}

function normalizeBaseUrl(value) {
  const url = new URL(value);
  return url.toString().replace(/\/$/u, "");
}

async function readEnv() {
  const fileContents = await readFile(envPath, "utf8");
  return {
    ...parseEnvFile(fileContents),
    ...process.env,
  };
}

async function requestJson(url, options) {
  const response = await fetch(url, options);
  const responseText = await response.text();
  const json = responseText ? JSON.parse(responseText) : {};

  if (!response.ok) {
    const errorMessage =
      json?.errors?.map((error) => error.description).join("; ") ||
      json?.message ||
      `${response.status} ${response.statusText}`;

    throw new Error(errorMessage);
  }

  return json;
}

async function main() {
  const env = await readEnv();
  const publicBaseUrl = getArgValue("--public-base-url") || env.ASAAS_WEBHOOK_PUBLIC_BASE_URL;
  const notificationEmail =
    getArgValue("--email") || env.ASAAS_WEBHOOK_EMAIL || "operacao@example.com";
  const dryRun = hasArg("--dry-run");

  if (!env.ASAAS_API_KEY) {
    throw new Error("ASAAS_API_KEY nao encontrado no .env.");
  }

  if (!env.ASAAS_WEBHOOK_TOKEN) {
    throw new Error("ASAAS_WEBHOOK_TOKEN nao encontrado no .env.");
  }

  if (!publicBaseUrl) {
    throw new Error(
      "Informe --public-base-url com a URL publica atual do tunel para registrar o webhook.",
    );
  }

  const apiBase =
    env.ASAAS_ENV === "production"
      ? "https://api.asaas.com/v3"
      : "https://sandbox.asaas.com/api/v3";

  const webhookUrl = new URL("/api/asaas/webhook", normalizeBaseUrl(publicBaseUrl)).toString();
  const headers = {
    accept: "application/json",
    "content-type": "application/json",
    access_token: env.ASAAS_API_KEY,
  };

  const listResponse = await requestJson(`${apiBase}/webhooks`, {
    method: "GET",
    headers,
  });

  const webhooks = Array.isArray(listResponse?.data) ? listResponse.data : [];
  const existingWebhook =
    webhooks.find((item) => item?.url === webhookUrl) ??
    webhooks.find((item) => item?.name === "Brookie Sandbox Checkout");

  const createPayload = {
    name: "Brookie Sandbox Checkout",
    url: webhookUrl,
    email: notificationEmail,
    enabled: true,
    interrupted: false,
    apiVersion: 3,
    authToken: env.ASAAS_WEBHOOK_TOKEN,
    sendType: "SEQUENTIALLY",
    events: DEFAULT_EVENTS,
  };

  const updatePayload = {
    name: createPayload.name,
    url: createPayload.url,
    enabled: createPayload.enabled,
    interrupted: createPayload.interrupted,
    authToken: createPayload.authToken,
    sendType: createPayload.sendType,
    events: createPayload.events,
  };

  if (dryRun) {
    console.log(
      JSON.stringify(
        {
          action: existingWebhook ? "update" : "create",
          targetId: existingWebhook?.id ?? null,
          payload: existingWebhook ? updatePayload : createPayload,
        },
        null,
        2,
      ),
    );
    return;
  }

  const response = existingWebhook
    ? await requestJson(`${apiBase}/webhooks/${existingWebhook.id}`, {
        method: "PUT",
        headers,
        body: JSON.stringify(updatePayload),
      })
    : await requestJson(`${apiBase}/webhooks`, {
        method: "POST",
        headers,
        body: JSON.stringify(createPayload),
      });

  console.log(
    JSON.stringify(
      {
        action: existingWebhook ? "updated" : "created",
        id: response.id ?? existingWebhook?.id ?? null,
        name: response.name ?? createPayload.name,
        url: response.url ?? createPayload.url,
        enabled: response.enabled ?? createPayload.enabled,
        interrupted: response.interrupted ?? createPayload.interrupted,
        sendType: response.sendType ?? createPayload.sendType,
        events: Array.isArray(response.events)
          ? response.events.length
          : createPayload.events.length,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
