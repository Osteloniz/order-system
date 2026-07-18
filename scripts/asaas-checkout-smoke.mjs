import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const envPath = path.join(projectRoot, ".env");

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

function normalizeBaseUrl(value) {
  return new URL(value).toString().replace(/\/$/u, "");
}

async function requestJson(url, options) {
  const response = await fetch(url, options);
  const responseText = await response.text();
  const json = responseText ? JSON.parse(responseText) : {};

  if (!response.ok) {
    throw new Error(
      JSON.stringify(
        {
          status: response.status,
          statusText: response.statusText,
          body: json,
        },
        null,
        2,
      ),
    );
  }

  return json;
}

async function main() {
  const env = {
    ...parseEnvFile(await readFile(envPath, "utf8")),
    ...process.env,
  };

  const publicBaseUrl = getArgValue("--public-base-url");
  const billingType = getArgValue("--billing-type") || "PIX";
  if (!publicBaseUrl) {
    throw new Error("Informe --public-base-url para montar as callbacks de teste.");
  }

  if (!["PIX", "CREDIT_CARD"].includes(billingType)) {
    throw new Error("Use --billing-type PIX ou CREDIT_CARD.");
  }

  if (!env.ASAAS_API_KEY) {
    throw new Error("ASAAS_API_KEY nao encontrado no .env.");
  }

  const apiBase =
    env.ASAAS_ENV === "production"
      ? "https://api.asaas.com/v3"
      : "https://api-sandbox.asaas.com/v3";

  const baseUrl = normalizeBaseUrl(publicBaseUrl);
  const payload = {
    billingTypes: [billingType],
    chargeTypes: ["DETACHED"],
    minutesToExpire: 60,
    externalReference: `smoke-${Date.now()}`,
    callback: {
      successUrl: `${baseUrl}/pagamento/asaas/smoke?status=success`,
      cancelUrl: `${baseUrl}/pagamento/asaas/smoke?status=cancel`,
      expiredUrl: `${baseUrl}/pagamento/asaas/smoke?status=expired`,
    },
    items: [
      {
        externalReference: "smoke-cookie",
        name: "Smoke Test Cookie",
        quantity: 1,
        value: 10,
      },
    ],
  };

  const response = await requestJson(`${apiBase}/checkouts`, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      access_token: env.ASAAS_API_KEY,
    },
    body: JSON.stringify(payload),
  });

  console.log(JSON.stringify(response, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
