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

function hasArg(flagName) {
  return process.argv.includes(flagName);
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

  if (!env.ASAAS_API_KEY) {
    throw new Error("ASAAS_API_KEY nao encontrado no .env.");
  }

  const apiBase =
    env.ASAAS_ENV === "production"
      ? "https://api.asaas.com/v3"
      : "https://api-sandbox.asaas.com/v3";

  const headers = {
    accept: "application/json",
    "content-type": "application/json",
    access_token: env.ASAAS_API_KEY,
  };

  const activeKeys = await requestJson(`${apiBase}/pix/addressKeys?status=ACTIVE&limit=10`, {
    method: "GET",
    headers: {
      accept: "application/json",
      access_token: env.ASAAS_API_KEY,
    },
  });

  const keys = Array.isArray(activeKeys.data) ? activeKeys.data : [];
  if (keys.length > 0 || !hasArg("--create-evp-if-missing")) {
    console.log(JSON.stringify({ activeKeys: keys }, null, 2));
    return;
  }

  const created = await requestJson(`${apiBase}/pix/addressKeys`, {
    method: "POST",
    headers,
    body: JSON.stringify({ type: "EVP" }),
  });

  console.log(JSON.stringify({ created }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
